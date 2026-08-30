import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import { releaseProfile } from "./config/release-profile.mjs";
import { handleVisitorStatsRequest } from "./server/visitorStats";
import { createGeoRouter } from "./server/geo/router";

// =============================================================================
// FrontMind Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".frontmind-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming
const OBSOLETE_GEO_DEMO_PUBLIC_ASSETS = [
  "videos/frontmind-industry-ranking-permission-explainer-66s.mp4",
  "videos/frontmind-industry-ranking-permission-explainer-66s-poster.jpg",
  "videos/frontmind-industry-ranking-permission-explainer-poster.jpg",
  "videos/frontmind-industry-ranking-permission-explainer-zh-CN.vtt",
] as const;

function vitePluginReleaseProfile(): Plugin {
  const replacements = [
    ["__FRONTMIND_SITE_URL__", releaseProfile.siteUrl],
    ["__FRONTMIND_ROBOTS_DIRECTIVE__", releaseProfile.robotsDirective],
  ] as const;

  return {
    name: "frontmind-release-profile",
    transformIndexHtml(html) {
      return replacements.reduce(
        (result, [placeholder, value]) => result.replaceAll(placeholder, value),
        html,
      );
    },
  };
}

function vitePluginPruneObsoleteGeoDemoPublicAssets(): Plugin {
  const buildRoot = path.resolve(PROJECT_ROOT, "dist/public");

  return {
    name: "frontmind-prune-obsolete-geo-demo-public-assets",
    apply: "build",
    closeBundle() {
      for (const relativePath of OBSOLETE_GEO_DEMO_PUBLIC_ASSETS) {
        const outputPath = path.resolve(buildRoot, relativePath);
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      }

      const leftovers = OBSOLETE_GEO_DEMO_PUBLIC_ASSETS.filter((relativePath) =>
        fs.existsSync(path.resolve(buildRoot, relativePath)),
      );
      if (leftovers.length > 0) {
        throw new Error(
          `Obsolete GEO demo assets remained in the production bundle: ${leftovers.join(", ")}`,
        );
      }
    },
  };
}

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__frontmind_debug__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginFrontMindDebugCollector(): Plugin {
  return {
    name: "frontmind-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__frontmind_debug__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__frontmind_debug__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__frontmind_debug__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

function vitePluginStorageProxy(): Plugin {
  return {
    name: "frontmind-storage-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/frontmind-storage", async (req, res) => {
        const key = req.url?.replace(/^\//, "");
        if (!key) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing storage key");
          return;
        }

        const forgeBaseUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(
          /\/+$/,
          "",
        );
        const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

        if (!forgeBaseUrl || !forgeKey) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Storage proxy not configured");
          return;
        }

        try {
          const forgeUrl = new URL(
            "v1/storage/presign/get",
            forgeBaseUrl + "/",
          );
          forgeUrl.searchParams.set("path", key);

          const forgeResp = await fetch(forgeUrl, {
            headers: { Authorization: `Bearer ${forgeKey}` },
          });

          if (!forgeResp.ok) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Storage backend error");
            return;
          }

          const { url } = (await forgeResp.json()) as { url: string };
          if (!url) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Empty signed URL");
            return;
          }

          res.writeHead(307, { Location: url, "Cache-Control": "no-store" });
          res.end();
        } catch {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end("Storage proxy error");
        }
      });
    },
  };
}

function vitePluginVisitorStatsApi(): Plugin {
  return {
    name: "frontmind-visitor-stats-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/visitor-stats", (req, res, next) => {
        void handleVisitorStatsRequest(req, res, next);
      });
    },
  };
}

function vitePluginGeoApi(env: NodeJS.ProcessEnv): Plugin {
  return {
    name: "frontmind-geo-api",
    configureServer(server: ViteDevServer) {
      // Mount through a real Express app so its response helpers (`status`,
      // `json`, `cookie`, …) are initialized before the router runs. Vite's
      // Connect response object does not provide them on its own.
      const geoApp = express();
      geoApp.use(createGeoRouter({ env }));
      server.middlewares.use("/api/geo", geoApp);
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const isProductionBuild = command === "build";
  // Vite only exposes VITE_-prefixed values to browser code. The GEO API gets
  // the complete server-side env explicitly so `.env.local` works in dev
  // without ever serializing merchant or broker secrets into the client.
  const geoServerEnv: NodeJS.ProcessEnv = {
    ...loadEnv(mode, PROJECT_ROOT, ""),
    ...process.env,
  };
  const configuredBuildSha = String(geoServerEnv.FRONTMIND_BUILD_SHA ?? "")
    .trim()
    .toLowerCase();
  const clientBuildSha = /^[a-f0-9]{40}$/.test(configuredBuildSha)
    ? configuredBuildSha
    : null;
  const plugins = [
    vitePluginReleaseProfile(),
    react(),
    tailwindcss(),
    ...(isProductionBuild
      ? [vitePluginPruneObsoleteGeoDemoPublicAssets()]
      : []),
    ...(isProductionBuild
      ? []
      : [
          jsxLocPlugin(),
          vitePluginFrontMindDebugCollector(),
          vitePluginStorageProxy(),
          vitePluginVisitorStatsApi(),
          vitePluginGeoApi(geoServerEnv),
        ]),
  ];

  return {
    plugins,
    define: {
      __FRONTMIND_SITE_URL__: JSON.stringify(releaseProfile.siteUrl),
      __FRONTMIND_CLIENT_PORTAL_URL__: JSON.stringify(
        releaseProfile.clientPortalUrl,
      ),
      __FRONTMIND_ROBOTS_DIRECTIVE__: JSON.stringify(
        releaseProfile.robotsDirective,
      ),
      __FRONTMIND_BUILD_SHA__: JSON.stringify(clientBuildSha),
      __FRONTMIND_RELEASE_CHANNEL__: JSON.stringify(releaseProfile.channel),
    },
    resolve: {
      alias: {
        "@/features/geo/preview-loader": path.resolve(
          import.meta.dirname,
          "client",
          "src",
          "features",
          "geo",
          isProductionBuild
            ? "preview-loader.production.ts"
            : "preview-loader.ts",
        ),
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    envDir: path.resolve(import.meta.dirname),
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      assetsInlineLimit(filePath, content) {
        return filePath.endsWith(".vtt") ? false : content.length < 4_096;
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (
              id.includes("react") ||
              id.includes("react-dom") ||
              id.includes("scheduler")
            )
              return "vendor-react";
            if (id.includes("framer-motion")) return "vendor-motion";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("@radix-ui")) return "vendor-radix";
            return "vendor";
          },
        },
      },
    },
    server: {
      port: 3000,
      strictPort: false, // Will find next available port if 3000 is busy
      host: true,
      allowedHosts: [".frontmind.net", "localhost", "127.0.0.1"],
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
