// server/index.ts
import express from "express";
import compression from "compression";
import { createServer } from "http";
import path2 from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

// server/visitorStats.ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// client/src/data/visitorStats.ts
var visitorStatsSummary = {
  totalReads: 1407,
  countryCount: 53
};
var visitorCountries = [
  { country: "Mainland China", iso: "cn", reads: 930, latitude: 35.8617, longitude: 104.1954 },
  { country: "Hong Kong, China", iso: "hk", reads: 112, latitude: 22.3193, longitude: 114.1694 },
  { country: "United States", iso: "us", reads: 48, latitude: 39.8283, longitude: -98.5795 },
  { country: "Singapore", iso: "sg", reads: 38, latitude: 1.3521, longitude: 103.8198 },
  { country: "Taiwan", iso: "tw", reads: 36, latitude: 23.6978, longitude: 120.9605 },
  { country: "Japan", iso: "jp", reads: 28, latitude: 36.2048, longitude: 138.2529 },
  { country: "South Korea", iso: "kr", reads: 24, latitude: 35.9078, longitude: 127.7669 },
  { country: "Germany", iso: "de", reads: 18, latitude: 51.1657, longitude: 10.4515 },
  { country: "United Kingdom", iso: "gb", reads: 15, latitude: 55.3781, longitude: -3.436 },
  { country: "Canada", iso: "ca", reads: 13, latitude: 56.1304, longitude: -106.3468 },
  { country: "Australia", iso: "au", reads: 12, latitude: -25.2744, longitude: 133.7751 },
  { country: "Malaysia", iso: "my", reads: 11, latitude: 4.2105, longitude: 101.9758 },
  { country: "Vietnam", iso: "vn", reads: 10, latitude: 14.0583, longitude: 108.2772 },
  { country: "India", iso: "in", reads: 9, latitude: 20.5937, longitude: 78.9629 },
  { country: "France", iso: "fr", reads: 8, latitude: 46.2276, longitude: 2.2137 },
  { country: "Thailand", iso: "th", reads: 8, latitude: 15.87, longitude: 100.9925 },
  { country: "United Arab Emirates", iso: "ae", reads: 6, latitude: 23.4241, longitude: 53.8478 },
  { country: "Indonesia", iso: "id", reads: 6, latitude: -0.7893, longitude: 113.9213 },
  { country: "Netherlands", iso: "nl", reads: 5, latitude: 52.1326, longitude: 5.2913 },
  { country: "Italy", iso: "it", reads: 5, latitude: 41.8719, longitude: 12.5674 },
  { country: "Spain", iso: "es", reads: 4, latitude: 40.4637, longitude: -3.7492 },
  { country: "Switzerland", iso: "ch", reads: 4, latitude: 46.8182, longitude: 8.2275 },
  { country: "New Zealand", iso: "nz", reads: 4, latitude: -40.9006, longitude: 174.886 },
  { country: "Brazil", iso: "br", reads: 3, latitude: -14.235, longitude: -51.9253 },
  { country: "Sweden", iso: "se", reads: 3, latitude: 60.1282, longitude: 18.6435 },
  { country: "Philippines", iso: "ph", reads: 3, latitude: 12.8797, longitude: 121.774 },
  { country: "Russia", iso: "ru", reads: 3, latitude: 61.524, longitude: 105.3188 },
  { country: "Saudi Arabia", iso: "sa", reads: 3, latitude: 23.8859, longitude: 45.0792 },
  { country: "T\xFCrkiye", iso: "tr", reads: 2, latitude: 38.9637, longitude: 35.2433 },
  { country: "Belgium", iso: "be", reads: 2, latitude: 50.5039, longitude: 4.4699 },
  { country: "Portugal", iso: "pt", reads: 2, latitude: 39.3999, longitude: -8.2245 },
  { country: "Israel", iso: "il", reads: 2, latitude: 31.0461, longitude: 34.8516 },
  { country: "Qatar", iso: "qa", reads: 2, latitude: 25.3548, longitude: 51.1839 },
  { country: "Ireland", iso: "ie", reads: 2, latitude: 53.4129, longitude: -8.2439 },
  { country: "Bangladesh", iso: "bd", reads: 2, latitude: 23.685, longitude: 90.3563 },
  { country: "Pakistan", iso: "pk", reads: 2, latitude: 30.3753, longitude: 69.3451 },
  { country: "Sri Lanka", iso: "lk", reads: 2, latitude: 7.8731, longitude: 80.7718 },
  { country: "Egypt", iso: "eg", reads: 1, latitude: 26.8206, longitude: 30.8025 },
  { country: "Finland", iso: "fi", reads: 1, latitude: 61.9241, longitude: 25.7482 },
  { country: "Norway", iso: "no", reads: 1, latitude: 60.472, longitude: 8.4689 },
  { country: "Austria", iso: "at", reads: 1, latitude: 47.5162, longitude: 14.5501 },
  { country: "Luxembourg", iso: "lu", reads: 1, latitude: 49.8153, longitude: 6.1296 },
  { country: "Morocco", iso: "ma", reads: 1, latitude: 31.7917, longitude: -7.0926 },
  { country: "Nepal", iso: "np", reads: 1, latitude: 28.3949, longitude: 84.124 },
  { country: "Nigeria", iso: "ng", reads: 1, latitude: 9.082, longitude: 8.6753 },
  { country: "Chile", iso: "cl", reads: 1, latitude: -35.6751, longitude: -71.543 },
  { country: "Romania", iso: "ro", reads: 1, latitude: 45.9432, longitude: 24.9668 },
  { country: "Ukraine", iso: "ua", reads: 1, latitude: 48.3794, longitude: 31.1656 },
  { country: "Poland", iso: "pl", reads: 1, latitude: 51.9194, longitude: 19.1451 },
  { country: "Mexico", iso: "mx", reads: 1, latitude: 23.6345, longitude: -102.5528 },
  { country: "South Africa", iso: "za", reads: 1, latitude: -30.5595, longitude: 22.9375 },
  { country: "Other locations", iso: "other", reads: 5, latitude: 0, longitude: 0 },
  { country: "Unknown", iso: "unknown", reads: 1, latitude: 0, longitude: 0 }
];

// server/visitorStats.ts
var STORE_PATH = process.env.FRONTMIND_VISITOR_STATS_FILE || path.resolve(process.cwd(), ".frontmind-visitor-stats.json");
var seedByIso = new Map(visitorCountries.map((country) => [country.iso, country]));
var regionNames = typeof Intl.DisplayNames !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
async function handleVisitorStatsRequest(req, res, next) {
  const pathname = (req.url || "").split("?")[0].replace(/\/+$/, "") || "/";
  if (req.method === "GET" && pathname === "/summary") {
    sendJson(res, 200, buildSummary());
    return;
  }
  if (req.method === "POST" && pathname === "/hit") {
    try {
      const body = await readJsonBody(req);
      const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim() : "";
      const page = typeof body.page === "string" ? body.page.slice(0, 300) : "";
      if (!visitorId || visitorId.length < 12 || visitorId.length > 160) {
        sendJson(res, 400, { ok: false, error: "Invalid visitor id" });
        return;
      }
      recordHit(req, visitorId, page);
      sendJson(res, 200, { ok: true, summary: buildSummary() });
      return;
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error) });
      return;
    }
  }
  if (next) {
    next();
    return;
  }
  sendJson(res, 404, { ok: false, error: "Not found" });
}
function recordHit(req, visitorId, _page) {
  if (isBot(req.headers["user-agent"])) return;
  const store = readStore();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const key = hashVisitorId(visitorId);
  const country = countryFromHeaders(req);
  if (store.visitors[key]) {
    store.visitors[key].lastSeen = now;
    store.visitors[key].visits += 1;
    if (store.visitors[key].iso === "unknown" && country.iso !== "unknown") {
      store.visitors[key].iso = country.iso;
      store.visitors[key].country = country.country;
    }
  } else {
    store.visitors[key] = {
      country: country.country,
      iso: country.iso,
      firstSeen: now,
      lastSeen: now,
      visits: 1
    };
  }
  store.pageviews += 1;
  store.updatedAt = now;
  writeStore(store);
}
function buildSummary() {
  const store = readStore();
  const countryMap = /* @__PURE__ */ new Map();
  for (const country of visitorCountries) {
    countryMap.set(country.iso, {
      ...country,
      liveReads: 0,
      baselineReads: country.reads
    });
  }
  const mainlandChina = countryMap.get("cn");
  if (mainlandChina) {
    mainlandChina.liveReads += store.pageviews;
    mainlandChina.reads = mainlandChina.baselineReads + mainlandChina.liveReads;
    countryMap.set("cn", mainlandChina);
  }
  const countries = Array.from(countryMap.values()).map((country) => ({
    ...country,
    reads: country.baselineReads + country.liveReads
  })).filter((country) => country.reads > 0).sort((a, b) => b.reads - a.reads || a.country.localeCompare(b.country));
  return {
    ok: true,
    mode: "live",
    totalReads: visitorStatsSummary.totalReads + store.pageviews,
    countryCount: visitorStatsSummary.countryCount,
    baselineReads: visitorStatsSummary.totalReads,
    liveReads: store.pageviews,
    pageviews: store.pageviews,
    countries,
    updatedAt: store.updatedAt || null,
    note: "Counts are cumulative page views. Live increments default to Mainland China for this China-based site."
  };
}
function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { visitors: {}, pageviews: 0 };
    }
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
    return {
      visitors: parsed.visitors && typeof parsed.visitors === "object" ? parsed.visitors : {},
      pageviews: Number.isFinite(parsed.pageviews) ? Number(parsed.pageviews) : 0,
      updatedAt: parsed.updatedAt
    };
  } catch {
    return { visitors: {}, pageviews: 0 };
  }
}
function writeStore(store) {
  const dir = path.dirname(STORE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}
`, "utf-8");
  fs.renameSync(tmpPath, STORE_PATH);
}
function hashVisitorId(visitorId) {
  return crypto.createHash("sha256").update(visitorId).digest("hex");
}
function countryFromHeaders(req) {
  const iso = headerValue(req, "cf-ipcountry") || headerValue(req, "x-vercel-ip-country") || headerValue(req, "x-country-code") || headerValue(req, "cloudfront-viewer-country") || headerValue(req, "fastly-client-country") || headerValue(req, "x-appengine-country");
  const cleanIso = normalizeIso(iso);
  if (!cleanIso) {
    const defaultCountry = seedByIso.get("cn");
    return {
      country: defaultCountry?.country || "Mainland China",
      iso: "cn"
    };
  }
  const seed = seedByIso.get(cleanIso);
  return {
    country: seed?.country || regionNames?.of(cleanIso.toUpperCase()) || cleanIso.toUpperCase(),
    iso: cleanIso
  };
}
function normalizeIso(value) {
  if (!value) return "";
  const clean = value.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(clean)) return "";
  if (clean === "xx" || clean === "t1") return "";
  return clean;
}
function headerValue(req, key) {
  const value = req.headers[key];
  if (Array.isArray(value)) return value[0];
  return value;
}
function isBot(userAgent) {
  const value = Array.isArray(userAgent) ? userAgent.join(" ") : userAgent || "";
  return /bot|crawler|spider|crawling|preview|slurp|facebookexternalhit|linkedinbot|whatsapp|telegrambot/i.test(value);
}
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1e4) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}
function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

// server/index.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(compression());
  app.use("/api/visitor-stats", (req, res, next) => {
    void handleVisitorStatsRequest(req, res, next);
  });
  app.get(
    [
      "/blogs",
      "/blogs/",
      "/research/community/blogs",
      "/research/community/blogs/"
    ],
    (req, res) => {
      res.redirect(301, `/blog${req.url.includes("?") ? `?${req.url.split("?")[1]}` : ""}`);
    }
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
      "/research/community/blogs/:slug/"
    ],
    (req, res) => {
      const query = req.url.includes("?") ? `?${req.url.split("?")[1]}` : "";
      res.redirect(301, `/blog/${req.params.slug}${query}`);
    }
  );
  const staticPath = process.env.NODE_ENV === "production" ? path2.resolve(__dirname, "public") : path2.resolve(__dirname, "..", "dist", "public");
  app.use(express.static(staticPath, {
    redirect: false,
    setHeaders(res, filePath) {
      const relativePath = path2.relative(staticPath, filePath).split(path2.sep).join("/");
      if (relativePath === "index.html" || relativePath.endsWith("/index.html")) {
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
        return;
      }
      if (["robots.txt", "sitemap.xml", "llms.txt"].includes(relativePath)) {
        res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
        return;
      }
      if (relativePath.startsWith("assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return;
      }
      if (/\.(?:avif|webp|png|jpe?g|svg|gif|ico|css|js|woff2?)$/i.test(relativePath)) {
        res.setHeader("Cache-Control", "public, max-age=604800");
      }
    }
  }));
  app.get("*", (req, res) => {
    if (path2.extname(req.path)) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    const routePath = req.path === "/" ? "/" : req.path.replace(/\/+$/, "");
    const routeIndexPath = path2.resolve(staticPath, `.${routePath}`, "index.html");
    const staticRoot = `${staticPath}${path2.sep}`;
    if (routeIndexPath.startsWith(staticRoot) && existsSync(routeIndexPath)) {
      res.sendFile(routeIndexPath);
      return;
    }
    res.sendFile(path2.join(staticPath, "index.html"));
  });
  const port = process.env.PORT || 8888;
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
