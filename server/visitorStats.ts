import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  visitorCountries,
  visitorStatsSummary,
  type VisitorCountry,
} from "../client/src/data/visitorStats.ts";

type StoredVisitor = {
  country: string;
  iso: string;
  firstSeen: string;
  lastSeen: string;
  visits: number;
};

type VisitorStore = {
  visitors: Record<string, StoredVisitor>;
  pageviews: number;
  updatedAt?: string;
};

type SummaryCountry = VisitorCountry & {
  liveReads: number;
  baselineReads: number;
};

const STORE_PATH = process.env.FRONTMIND_VISITOR_STATS_FILE || path.resolve(process.cwd(), ".frontmind-visitor-stats.json");
const seedByIso = new Map(visitorCountries.map((country) => [country.iso, country]));
const regionNames = typeof Intl.DisplayNames !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

export async function handleVisitorStatsRequest(req: IncomingMessage, res: ServerResponse, next?: () => void) {
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

function recordHit(req: IncomingMessage, visitorId: string, _page: string) {
  if (isBot(req.headers["user-agent"])) return;

  const store = readStore();
  const now = new Date().toISOString();
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
      visits: 1,
    };
  }

  store.pageviews += 1;
  store.updatedAt = now;
  writeStore(store);
}

function buildSummary() {
  const store = readStore();
  const countryMap = new Map<string, SummaryCountry>();

  for (const country of visitorCountries) {
    countryMap.set(country.iso, {
      ...country,
      liveReads: 0,
      baselineReads: country.reads,
    });
  }

  const mainlandChina = countryMap.get("cn");
  if (mainlandChina) {
    mainlandChina.liveReads += store.pageviews;
    mainlandChina.reads = mainlandChina.baselineReads + mainlandChina.liveReads;
    countryMap.set("cn", mainlandChina);
  }

  const countries = Array.from(countryMap.values())
    .map((country) => ({
      ...country,
      reads: country.baselineReads + country.liveReads,
    }))
    .filter((country) => country.reads > 0)
    .sort((a, b) => b.reads - a.reads || a.country.localeCompare(b.country));

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
    note: "Counts are cumulative page views. Live increments default to Mainland China for this China-based site.",
  };
}

function readStore(): VisitorStore {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { visitors: {}, pageviews: 0 };
    }

    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) as Partial<VisitorStore>;
    return {
      visitors: parsed.visitors && typeof parsed.visitors === "object" ? parsed.visitors : {},
      pageviews: Number.isFinite(parsed.pageviews) ? Number(parsed.pageviews) : 0,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return { visitors: {}, pageviews: 0 };
  }
}

function writeStore(store: VisitorStore) {
  const dir = path.dirname(STORE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
  fs.renameSync(tmpPath, STORE_PATH);
}

function hashVisitorId(visitorId: string) {
  return crypto.createHash("sha256").update(visitorId).digest("hex");
}

function countryFromHeaders(req: IncomingMessage) {
  const iso =
    headerValue(req, "cf-ipcountry") ||
    headerValue(req, "x-vercel-ip-country") ||
    headerValue(req, "x-country-code") ||
    headerValue(req, "cloudfront-viewer-country") ||
    headerValue(req, "fastly-client-country") ||
    headerValue(req, "x-appengine-country");

  const cleanIso = normalizeIso(iso);
  if (!cleanIso) {
    const defaultCountry = seedByIso.get("cn");
    return {
      country: defaultCountry?.country || "Mainland China",
      iso: "cn",
    };
  }

  const seed = seedByIso.get(cleanIso);
  return {
    country: seed?.country || regionNames?.of(cleanIso.toUpperCase()) || cleanIso.toUpperCase(),
    iso: cleanIso,
  };
}

function normalizeIso(value?: string) {
  if (!value) return "";
  const clean = value.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(clean)) return "";
  if (clean === "xx" || clean === "t1") return "";
  return clean;
}

function headerValue(req: IncomingMessage, key: string) {
  const value = req.headers[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function isBot(userAgent: string | string[] | undefined) {
  const value = Array.isArray(userAgent) ? userAgent.join(" ") : userAgent || "";
  return /bot|crawler|spider|crawling|preview|slurp|facebookexternalhit|linkedinbot|whatsapp|telegrambot/i.test(value);
}

function readJsonBody(req: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 10_000) {
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
        resolve(JSON.parse(body) as Record<string, unknown>);
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}
