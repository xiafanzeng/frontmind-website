import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  visitorCountryCatalog,
  type VisitorCountry,
} from "../client/src/data/visitorStats.ts";

export type StoredVisitor = {
  country: string;
  iso: string;
  firstSeen: string;
  lastSeen: string;
  visits: number;
};

export type VisitorStore = {
  visitors: Record<string, StoredVisitor>;
  pageviews: number;
  updatedAt?: string;
};

const STORE_PATH =
  process.env.FRONTMIND_VISITOR_STATS_FILE ||
  path.resolve(process.cwd(), ".frontmind-visitor-stats.json");
const metadataByIso = new Map(
  visitorCountryCatalog.map((country) => [country.iso, country]),
);
const regionNames =
  typeof Intl.DisplayNames !== "undefined"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

class VisitorStatsRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisitorStatsRequestError";
  }
}

export async function handleVisitorStatsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next?: () => void,
) {
  const pathname = (req.url || "").split("?")[0].replace(/\/+$/, "") || "/";

  if (req.method === "GET" && pathname === "/summary") {
    try {
      sendJson(res, 200, buildSummary());
    } catch (error) {
      logVisitorStatsFailure("summary", error);
      sendJson(res, 503, {
        ok: false,
        error: "Visitor statistics are temporarily unavailable",
      });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/hit") {
    try {
      const body = await readJsonBody(req);
      const visitorId =
        typeof body.visitorId === "string" ? body.visitorId.trim() : "";
      const page = typeof body.page === "string" ? body.page.slice(0, 300) : "";

      if (!visitorId || visitorId.length < 12 || visitorId.length > 160) {
        sendJson(res, 400, { ok: false, error: "Invalid visitor id" });
        return;
      }

      recordHit(req, visitorId, page);
      sendJson(res, 200, { ok: true, summary: buildSummary() });
    } catch (error) {
      if (error instanceof VisitorStatsRequestError) {
        sendJson(res, 400, { ok: false, error: "Invalid request" });
      } else {
        logVisitorStatsFailure("hit", error);
        sendJson(res, 503, {
          ok: false,
          error: "Visitor statistics are temporarily unavailable",
        });
      }
    }
    return;
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

  store.pageviews = sumVisits(store.visitors);
  store.updatedAt = now;
  writeStore(store);
}

function buildSummary() {
  return summarizeVisitorStore(readStore());
}

/**
 * Produces the public counter exclusively from persisted visits. No client or
 * server baseline is added, and each visit remains attributed to its stored
 * ISO region instead of being reassigned to a default country.
 */
export function summarizeVisitorStore(store: VisitorStore) {
  const countryMap = new Map<string, VisitorCountry>();

  for (const visitor of Object.values(store.visitors)) {
    const visits = normalizeVisitCount(visitor.visits);
    if (visits === 0) continue;
    const iso = normalizeStoredIso(visitor.iso);
    const metadata = metadataByIso.get(iso);
    const current = countryMap.get(iso);
    countryMap.set(iso, {
      country:
        metadata?.country ||
        countryNameForIso(iso) ||
        safeStoredCountry(visitor.country, iso),
      iso,
      reads: (current?.reads ?? 0) + visits,
      latitude: metadata?.latitude ?? 0,
      longitude: metadata?.longitude ?? 0,
    });
  }

  const countries = Array.from(countryMap.values()).sort(
    (left, right) =>
      right.reads - left.reads || left.country.localeCompare(right.country),
  );
  const totalReads = countries.reduce(
    (total, country) => total + country.reads,
    0,
  );
  const countryCount = countries.filter((country) =>
    /^[a-z]{2}$/.test(country.iso),
  ).length;

  return {
    ok: true,
    mode: "live",
    totalReads,
    countryCount,
    pageviews: totalReads,
    countries,
    updatedAt: store.updatedAt || null,
    note: "Counts are persisted page views grouped by the trusted country header available at request time; missing geography is reported as Unknown.",
  };
}

function readStore(): VisitorStore {
  if (!fs.existsSync(STORE_PATH)) {
    return { visitors: {}, pageviews: 0 };
  }

  const parsed = JSON.parse(
    fs.readFileSync(STORE_PATH, "utf-8"),
  ) as Partial<VisitorStore>;
  if (
    !parsed.visitors ||
    typeof parsed.visitors !== "object" ||
    Array.isArray(parsed.visitors)
  ) {
    throw new Error("Visitor store has an invalid visitors object");
  }

  const visitors: Record<string, StoredVisitor> = {};
  for (const [key, rawVisitor] of Object.entries(parsed.visitors)) {
    if (
      !/^[a-f0-9]{64}$/i.test(key) ||
      !rawVisitor ||
      typeof rawVisitor !== "object" ||
      typeof rawVisitor.country !== "string" ||
      typeof rawVisitor.iso !== "string" ||
      typeof rawVisitor.firstSeen !== "string" ||
      typeof rawVisitor.lastSeen !== "string" ||
      normalizeVisitCount(rawVisitor.visits) === 0
    ) {
      throw new Error("Visitor store contains an invalid visitor record");
    }
    visitors[key] = {
      country: safeStoredCountry(
        rawVisitor.country,
        normalizeStoredIso(rawVisitor.iso),
      ),
      iso: normalizeStoredIso(rawVisitor.iso),
      firstSeen: rawVisitor.firstSeen,
      lastSeen: rawVisitor.lastSeen,
      visits: normalizeVisitCount(rawVisitor.visits),
    };
  }

  return {
    visitors,
    pageviews: sumVisits(visitors),
    updatedAt:
      typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
  };
}

function writeStore(store: VisitorStore) {
  const directory = path.dirname(STORE_PATH);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, STORE_PATH);
  fs.chmodSync(STORE_PATH, 0o600);
}

function sumVisits(visitors: Record<string, StoredVisitor>) {
  return Object.values(visitors).reduce(
    (total, visitor) => total + normalizeVisitCount(visitor.visits),
    0,
  );
}

function normalizeVisitCount(value: unknown) {
  const numericValue = Number(value);
  if (
    !Number.isSafeInteger(numericValue) ||
    numericValue < 0 ||
    numericValue > 1_000_000_000
  ) {
    return 0;
  }
  return numericValue;
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
  const cleanIso = normalizeHeaderIso(iso);
  if (!cleanIso) {
    return { country: "Unknown", iso: "unknown" };
  }

  const metadata = metadataByIso.get(cleanIso);
  return {
    country:
      metadata?.country ||
      countryNameForIso(cleanIso) ||
      cleanIso.toUpperCase(),
    iso: cleanIso,
  };
}

function normalizeHeaderIso(value?: string) {
  if (!value) return "";
  const clean = value.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(clean) || clean === "xx") return "";
  return clean;
}

function normalizeStoredIso(value: string) {
  const clean = value.trim().toLowerCase();
  if (clean === "unknown" || clean === "other") return clean;
  return /^[a-z]{2}$/.test(clean) ? clean : "unknown";
}

function countryNameForIso(iso: string) {
  if (!/^[a-z]{2}$/.test(iso)) return "";
  try {
    return regionNames?.of(iso.toUpperCase()) || "";
  } catch {
    return "";
  }
}

function safeStoredCountry(value: string, iso: string) {
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 100);
  return clean || countryNameForIso(iso) || "Unknown";
}

function headerValue(req: IncomingMessage, key: string) {
  const value = req.headers[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function isBot(userAgent: string | string[] | undefined) {
  const value = Array.isArray(userAgent)
    ? userAgent.join(" ")
    : userAgent || "";
  return /bot|crawler|spider|crawling|preview|slurp|facebookexternalhit|linkedinbot|whatsapp|telegrambot/i.test(
    value,
  );
}

function readJsonBody(req: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let body = "";
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      body += chunk.toString();
      if (body.length > 10_000) {
        fail(new VisitorStatsRequestError("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body) as Record<string, unknown>);
      } catch {
        reject(new VisitorStatsRequestError("Invalid JSON"));
      }
    });
    req.on("error", (error) => fail(error));
  });
}

function logVisitorStatsFailure(operation: string, error: unknown) {
  const errorName =
    error instanceof Error && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(error.name)
      ? error.name
      : "Error";
  console.error(`[VisitorStats] ${operation} failed`, errorName);
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}
