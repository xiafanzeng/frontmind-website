import express from "express";
import compression from "compression";
import { createServer } from "http";
import { createHash } from "node:crypto";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import {
  assertVisitorStatsStoreReady,
  handleVisitorStatsRequest,
} from "./visitorStats";
import {
  createGeoCustomQuestionRecoveryWorker,
  createGeoRouter,
} from "./geo/router";
import { createGeoPresalesBrokerFromEnv } from "./geo/broker";
import {
  createGeoPaymentReceiptStore,
  createGeoProjectOrderRegistry,
} from "./geo/provisioning";
import {
  createGeoDependencyHealthChecker,
  geoPublicBuildSha,
  geoReadinessErrorLabel,
} from "./geo/health";
import { installBaseSecurityHeaders } from "./security";
import {
  CUSTOM_QUESTION_CLASSIFIER_SKILL_VERSION,
  loadGeoCustomQuestionClassifierSkill,
  loadGeoQuestionRecommenderSkill,
  loadWebsiteKnowledgeBaseSkill,
  resolveWebsiteKnowledgeBaseWriterVersion,
} from "./geo/skills";
import { loadGeoCurrentStateEvaluatorSkill } from "./geo/assessment";
import { loadGeoOptimizationOutcomeForecasterSkill } from "./geo/forecast";
import { assertGeoPaymentConfigurationFromEnv } from "./geo/payment";
import { createGeoCustomQuestionValidationStore } from "./geo/custom-question-validation-store";
import { createGeoMonitorFreeReservationStore } from "./geo/monitor-free-reservation-store";
import { collectWebsiteRuntimeReadiness } from "./runtime-readiness";
import { assertGeoRuntimeConfigurationFromEnv } from "./geo/runtime-config";
import { releaseProfile } from "../config/release-profile.mjs";
import {
  assertFrontMindReleaseRuntime,
  frontmindReleaseChannel,
} from "./release-channel";
import { configureWebsiteHttpServer } from "./http-server-timeouts";
import {
  setWebsiteHealthCacheHeaders,
  setWebsiteHtmlCacheHeaders,
  setWebsiteStaticCacheHeaders,
} from "./http-cache-policy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function geoRuntimeSkills() {
  const websiteKnowledgeBaseWriterVersion =
    resolveWebsiteKnowledgeBaseWriterVersion(process.env);
  return [
    {
      name: "website-one-shot-kb-builder",
      version: websiteKnowledgeBaseWriterVersion,
    },
    { name: "geo-question-recommender", version: 1 },
    {
      name: "geo-custom-question-classifier",
      version: CUSTOM_QUESTION_CLASSIFIER_SKILL_VERSION,
    },
    { name: "geo-current-state-evaluator", version: 3 },
    { name: "geo-optimization-outcome-forecaster", version: 1 },
  ] as const;
}

async function getGeoRuntimeSkillReadiness() {
  const runtimeSkills = geoRuntimeSkills();
  const contents = await Promise.all([
    loadWebsiteKnowledgeBaseSkill(runtimeSkills[0].version),
    loadGeoQuestionRecommenderSkill(),
    loadGeoCustomQuestionClassifierSkill(),
    loadGeoCurrentStateEvaluatorSkill(),
    loadGeoOptimizationOutcomeForecasterSkill(),
  ]);
  return runtimeSkills.map((skill, index) => ({
    ...skill,
    status: "ok" as const,
    contentHash: createHash("sha256")
      .update(contents[index], "utf8")
      .digest("hex"),
  }));
}

async function startServer() {
  const releaseChannel = frontmindReleaseChannel(releaseProfile);
  const { paymentMode } = assertFrontMindReleaseRuntime(
    process.env,
    releaseProfile,
  );
  const buildSha = geoPublicBuildSha();
  const imageDigest =
    process.env.FRONTMIND_IMAGE_DIGEST?.trim().toLowerCase() || null;
  const geoBroker = createGeoPresalesBrokerFromEnv();
  const projectOrderRegistry = createGeoProjectOrderRegistry();
  const paymentReceiptStore = createGeoPaymentReceiptStore();
  const customQuestionValidationStore =
    createGeoCustomQuestionValidationStore();
  const monitorFreeReservationStore = createGeoMonitorFreeReservationStore();
  const customQuestionRecoveryWorker = createGeoCustomQuestionRecoveryWorker({
    broker: geoBroker,
    store: customQuestionValidationStore,
  });
  const getGeoDependencyReadiness = createGeoDependencyHealthChecker({
    broker: geoBroker,
    projectOrderRegistry,
    paymentReceiptStore,
    requireAgentCredential: releaseProfile.requireAgentCredential,
  });
  const getWebsiteRuntimeReadiness = () =>
    collectWebsiteRuntimeReadiness({
      releaseChannel,
      paymentMode,
      buildSha,
      imageDigest,
      requireReleaseIdentity: process.env.NODE_ENV === "production",
      getSkills: getGeoRuntimeSkillReadiness,
      getDependencies: getGeoDependencyReadiness,
      getVisitorStats: async () => assertVisitorStatsStoreReady(),
      assertConfiguration: () => {
        assertGeoRuntimeConfigurationFromEnv(process.env);
      },
      validationStore: customQuestionValidationStore,
      monitorFreeReservationStore,
    });
  // Recover only crash-left project locks before any route can acquire one.
  // Runtime readiness calls are idempotent and never steal a live lock.
  await monitorFreeReservationStore.assertReady();
  await monitorFreeReservationStore.collectGarbage();
  if (process.env.NODE_ENV === "production") {
    if (paymentMode === "zpay") {
      assertGeoPaymentConfigurationFromEnv(process.env);
    }
    // The same deep probe used by /readyz runs before the socket is opened.
    // A container with invalid secrets, Skills or persistence never advertises
    // itself as started and can be safely rolled back by the deploy controller.
    await getWebsiteRuntimeReadiness();
  }
  const app = express();
  const server = configureWebsiteHttpServer(createServer(app));
  installBaseSecurityHeaders(app);
  if (!releaseProfile.publishSearchIndexes) {
    app.use((_req, res, next) => {
      res.setHeader("X-Robots-Tag", releaseProfile.robotsDirective);
      next();
    });
  }

  if (process.env.NODE_ENV === "production") {
    // Fail closed to local reverse proxies unless deployment explicitly names
    // its trusted proxy CIDR(s) or hop count.
    const configuredTrustProxy =
      process.env.FRONTMIND_TRUST_PROXY?.trim() || "loopback";
    app.set(
      "trust proxy",
      /^\d+$/.test(configuredTrustProxy)
        ? Number(configuredTrustProxy)
        : configuredTrustProxy,
    );
  }

  app.use(compression());

  app.get("/healthz", (_req, res) => {
    setWebsiteHealthCacheHeaders(res);
    res.json({
      status: "ok",
      service: "frontmind-website",
      channel: releaseChannel,
      releaseChannel,
      paymentMode,
      buildSha,
      imageDigest,
    });
  });

  app.get("/readyz", async (_req, res) => {
    try {
      res.json(await getWebsiteRuntimeReadiness());
    } catch (error) {
      console.error(
        "[Readiness] GEO dependency check failed",
        geoReadinessErrorLabel(error),
      );
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.use("/api/visitor-stats", (req, res, next) => {
    void handleVisitorStatsRequest(req, res, next);
  });

  app.use(
    "/api/geo",
    createGeoRouter({
      broker: geoBroker,
      projectOrderRegistry,
      customQuestionValidationStore,
      monitorFreeReservationStore,
    }),
  );

  customQuestionRecoveryWorker.start();
  server.on("close", () => customQuestionRecoveryWorker.stop());
  const sweepMonitorFreeReservations = () => {
    void monitorFreeReservationStore.collectGarbage().catch((error) => {
      console.error("[Monitor free reservation sweeper] failed", {
        code:
          error instanceof Error
            ? error.name
            : "MONITOR_RESERVATION_SWEEP_FAILED",
      });
    });
  };
  const monitorFreeReservationSweepTimer = setInterval(
    sweepMonitorFreeReservations,
    60 * 60 * 1000,
  );
  monitorFreeReservationSweepTimer.unref();
  server.on("close", () => clearInterval(monitorFreeReservationSweepTimer));

  app.get(
    [
      "/blogs",
      "/blogs/",
      "/research/community/blogs",
      "/research/community/blogs/",
    ],
    (req, res) => {
      res.redirect(
        301,
        `/blog${req.url.includes("?") ? `?${req.url.split("?")[1]}` : ""}`,
      );
    },
  );

  app.get(
    [
      "/blogs/generative-engine-optimization/:slug",
      "/blogs/generative-engine-optimization/:slug/",
      "/blogs/:slug",
      "/blogs/:slug/",
      "/research/community/blogs/generative-engine-optimization/:slug",
      "/research/community/blogs/generative-engine-optimization/:slug/",
      "/research/community/blogs/:slug",
      "/research/community/blogs/:slug/",
    ],
    (req, res) => {
      const query = req.url.includes("?") ? `?${req.url.split("?")[1]}` : "";
      res.redirect(301, `/blog/${req.params.slug}${query}`);
    },
  );

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(
    express.static(staticPath, {
      redirect: false,
      setHeaders(res, filePath) {
        setWebsiteStaticCacheHeaders(res, filePath, staticPath);
      },
    }),
  );

  // Handle client-side routing, while keeping missing static assets as real 404s.
  app.get("*", (req, res) => {
    if (path.extname(req.path)) {
      res.status(404).type("text/plain").send("页面不存在");
      return;
    }

    const routePath = req.path === "/" ? "/" : req.path.replace(/\/+$/, "");
    const routeIndexPath = path.resolve(
      staticPath,
      `.${routePath}`,
      "index.html",
    );
    const staticRoot = `${staticPath}${path.sep}`;

    if (routeIndexPath.startsWith(staticRoot) && existsSync(routeIndexPath)) {
      setWebsiteHtmlCacheHeaders(res);
      res.sendFile(routeIndexPath);
      return;
    }

    setWebsiteHtmlCacheHeaders(res);
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 8888;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
