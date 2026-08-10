import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  visitorCountryCatalog,
  visitorHistoricalBaseline,
  visitorHistoricalBaselineSummary,
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
// ISO 3166-1 alpha-2 only. Intl.DisplayNames also recognizes CLDR macro and
// private-use regions such as EU/XA, which must not become public country tags.
const ISO_3166_ALPHA_2 = new Set(
  `ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw`.split(
    " ",
  ),
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
        error: "访问统计暂时不可用",
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
        sendJson(res, 400, { ok: false, error: "访问标识无效" });
        return;
      }

      recordHit(req, visitorId, page);
      sendJson(res, 200, { ok: true, summary: buildSummary() });
    } catch (error) {
      if (error instanceof VisitorStatsRequestError) {
        sendJson(res, 400, { ok: false, error: "请求格式无效" });
      } else {
        logVisitorStatsFailure("hit", error);
        sendJson(res, 503, {
          ok: false,
          error: "访问统计暂时不可用",
        });
      }
    }
    return;
  }

  if (next) {
    next();
    return;
  }

  sendJson(res, 404, { ok: false, error: "接口不存在" });
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

/** Combines the published historical snapshot with newer persisted visits. */
export function summarizeVisitorStore(store: VisitorStore) {
  const countryMap = new Map<string, VisitorCountry>(
    visitorHistoricalBaseline.map((country) => [country.iso, { ...country }]),
  );
  const historicalUnknown = countryMap.get("unknown");
  if (historicalUnknown) {
    const mainlandChina = countryMap.get("cn");
    if (!mainlandChina) {
      throw new Error("Visitor statistics baseline is missing Mainland China");
    }
    countryMap.set("cn", {
      ...mainlandChina,
      reads: mainlandChina.reads + historicalUnknown.reads,
    });
    countryMap.delete("unknown");
  }
  let liveReads = 0;

  for (const visitor of Object.values(store.visitors)) {
    const visits = normalizeVisitCount(visitor.visits);
    if (visits === 0) continue;
    liveReads += visits;
    const storedIso = normalizeStoredIso(visitor.iso);
    const iso = storedIso === "unknown" ? "cn" : storedIso;
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
  const totalReads = visitorHistoricalBaselineSummary.totalReads + liveReads;
  const countryCount = countries.length;

  return {
    ok: true,
    mode: "live",
    totalReads,
    countryCount,
    baselineReads: visitorHistoricalBaselineSummary.totalReads,
    liveReads,
    pageviews: liveReads,
    countries,
    updatedAt: store.updatedAt || null,
    note: `Lifetime totals include the published snapshot captured on ${visitorHistoricalBaselineSummary.capturedAt}; newer persisted page views are grouped by trusted country headers, and public reporting includes missing geography in Mainland China.`,
  };
}

function readStore(storePath = STORE_PATH): VisitorStore {
  if (!fs.existsSync(storePath)) {
    return { visitors: {}, pageviews: 0 };
  }

  const parsed = JSON.parse(
    fs.readFileSync(storePath, "utf-8"),
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

function writeStore(store: VisitorStore, storePath = STORE_PATH) {
  const directory = path.dirname(storePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${storePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, storePath);
  fs.chmodSync(storePath, 0o600);
}

/**
 * Production startup/readiness probe for the second Website persistence path.
 * It validates any existing store, then proves that a distinct probe file can
 * be created, read and removed without rewriting visitor data.
 */
export function assertVisitorStatsStoreReady(storePath = STORE_PATH) {
  if (!path.isAbsolute(storePath)) {
    throw new Error("VISITOR_STATS_STORE_PATH_MUST_BE_ABSOLUTE");
  }
  const directory = path.dirname(storePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  readStore(storePath);

  const probePath = path.join(
    directory,
    `.frontmind-visitor-readiness-${process.pid}-${crypto.randomUUID()}`,
  );
  const probeValue = crypto.randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(probePath, probeValue, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    if (fs.readFileSync(probePath, "utf8") !== probeValue) {
      throw new Error("VISITOR_STATS_STORE_PROBE_MISMATCH");
    }
  } finally {
    fs.rmSync(probePath, { force: true });
  }
  return { ready: true as const };
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
  return isRecognizedRegionIso(clean) ? clean : "";
}

function normalizeStoredIso(value: string) {
  const clean = value.trim().toLowerCase();
  if (clean === "unknown" || clean === "other") return clean;
  return isRecognizedRegionIso(clean) ? clean : "unknown";
}

function isRecognizedRegionIso(iso: string) {
  return ISO_3166_ALPHA_2.has(iso);
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
