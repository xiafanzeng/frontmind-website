import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { useLang } from "@/contexts/LanguageContext";
import { type VisitorCountry } from "@/data/visitorStats";

export type VisitorStatsPayload = {
  totalReads: number;
  countryCount: number;
  pageviews?: number;
  countries: VisitorCountry[];
  mode?: string;
  updatedAt?: string | null;
};

type VisitorStatsState = "loading" | "ready" | "unavailable";

const VISITOR_STATS_API_ENABLED =
  import.meta.env.VITE_ENABLE_VISITOR_STATS_API !== "false";

export default function VisitorStats() {
  const { t, lang } = useLang();
  const [expanded, setExpanded] = useState(true);
  const [stats, setStats] = useState<VisitorStatsPayload | null>(null);
  const [status, setStatus] = useState<VisitorStatsState>(
    VISITOR_STATS_API_ENABLED ? "loading" : "unavailable",
  );
  const topCountry = stats?.countries[0];

  useEffect(() => {
    if (!VISITOR_STATS_API_ENABLED) return;

    let cancelled = false;

    async function recordAndLoad() {
      const visitorId = getOrCreateVisitorId();
      const body = JSON.stringify({
        visitorId,
        page: `${window.location.pathname}${window.location.search}`,
      });

      try {
        const hitResponse = await fetch("/api/visitor-stats/hit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          cache: "no-store",
        });
        if (hitResponse.ok) {
          const payload = (await hitResponse.json()) as { summary?: unknown };
          const normalized = normalizeVisitorStats(payload.summary);
          if (!cancelled && normalized) {
            setStats(normalized);
            setStatus("ready");
            return;
          }
        }
      } catch {
        /* fall back to summary fetch below */
      }

      try {
        const summaryResponse = await fetch("/api/visitor-stats/summary", {
          cache: "no-store",
        });
        if (summaryResponse.ok) {
          const normalized = normalizeVisitorStats(
            await summaryResponse.json(),
          );
          if (!cancelled && normalized) {
            setStats(normalized);
            setStatus("ready");
            return;
          }
        }
      } catch {
        /* the unavailable state below is the truthful fallback */
      }

      if (!cancelled) {
        setStats(null);
        setStatus("unavailable");
      }
    }

    void recordAndLoad();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="border-t border-[#E5E7EB] bg-[#FAFAFA]"
      aria-label={t("累计访问分布", "Total visit distribution")}
    >
      <div className="container py-6">
        <div className="border border-[#E5E7EB] bg-white">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="visitor-stats-panel"
            onClick={() => setExpanded((value) => !value)}
            className="flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors hover:bg-[#FAFAFA] md:flex-row md:items-center md:justify-between md:px-6"
          >
            <span className="flex min-w-0 items-center">
              <span className="min-w-0">
                <span
                  className="block text-sm leading-relaxed text-[#4B5563]"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                  aria-live="polite"
                >
                  {status === "loading" &&
                    t(
                      "正在加载真实访问统计…",
                      "Loading verified visit statistics…",
                    )}
                  {status === "unavailable" &&
                    t(
                      "访问统计暂不可用",
                      "Visit statistics are temporarily unavailable",
                    )}
                  {status === "ready" &&
                    stats &&
                    t(
                      <>
                        累计访问量{" "}
                        <strong className="font-bold text-[#1A1A2E]">
                          {formatNumber(stats.totalReads)}
                        </strong>{" "}
                        次，覆盖{" "}
                        <strong className="font-bold text-[#1A1A2E]">
                          {stats.countryCount}
                        </strong>{" "}
                        个国家/地区
                      </>,
                      <>
                        <strong className="font-bold text-[#1A1A2E]">
                          {formatNumber(stats.totalReads)}
                        </strong>{" "}
                        total visits across{" "}
                        <strong className="font-bold text-[#1A1A2E]">
                          {stats.countryCount}
                        </strong>{" "}
                        countries and regions
                      </>,
                    )}
                </span>
              </span>
            </span>
            <span
              className="flex shrink-0 items-center gap-3 text-sm font-semibold text-[#4B5563]"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              <ChevronDown
                size={16}
                className={`transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </span>
          </button>

          <div
            id="visitor-stats-panel"
            hidden={!expanded}
            className="border-t border-[#E5E7EB] px-5 py-5 md:px-6 md:py-6"
          >
            {expanded && (
              <>
                {status !== "ready" || !stats ? (
                  <div
                    className="grid min-h-44 place-items-center px-4 text-center text-sm text-[#6B7280]"
                    role="status"
                  >
                    {status === "loading"
                      ? t(
                          "正在从服务器读取真实访问统计…",
                          "Loading verified visit statistics from the server…",
                        )
                      : t(
                          "目前无法读取访问统计，请稍后再试。",
                          "Visit statistics cannot be loaded right now. Please try again later.",
                        )}
                  </div>
                ) : stats.countries.length === 0 ? (
                  <div className="grid min-h-44 place-items-center px-4 text-center">
                    <div>
                      <strong className="block text-base text-[#1A1A2E]">
                        {t("尚无访问记录", "No visits recorded yet")}
                      </strong>
                      <span className="mt-2 block text-sm text-[#6B7280]">
                        {t(
                          "首条有效访问产生后，这里将展示真实地区分布。",
                          "Verified regional distribution will appear after the first valid visit.",
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.08fr_0.92fr]">
                    <div>
                      <VisitorWorldMap countries={stats.countries} />
                    </div>

                    <div className="min-w-0">
                      <div className="mb-4 grid grid-cols-3 gap-2">
                        <StatTile
                          label={t("累计访问", "Total visits")}
                          value={formatNumber(stats.totalReads)}
                        />
                        <StatTile
                          label={t("覆盖地区", "Regions")}
                          value={formatNumber(stats.countryCount)}
                        />
                        <StatTile
                          label={t("最高来源", "Top region")}
                          value={
                            topCountry
                              ? getCountryName(
                                  topCountry.country,
                                  topCountry.iso,
                                  lang,
                                )
                              : "—"
                          }
                        />
                      </div>

                      <ul
                        className="grid max-h-[340px] grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2"
                        aria-label={t("国家访问列表", "Country visit list")}
                      >
                        {stats.countries.map((country) => (
                          <li
                            key={country.iso}
                            className="flex items-center gap-2 border border-[#E5E7EB] bg-[#FAFAFA] px-3 py-2 text-sm"
                          >
                            <span
                              className="shrink-0 text-base leading-none inline-flex items-center justify-center"
                              style={{ width: "1.4em" }}
                              aria-hidden="true"
                            >
                              {flagForIso(country.iso)}
                            </span>
                            <span
                              className="min-w-0 flex-1 truncate text-[#1A1A2E]"
                              style={{ fontFamily: "'DM Sans', sans-serif" }}
                            >
                              {getCountryName(
                                country.country,
                                country.iso,
                                lang,
                              )}
                            </span>
                            <span
                              className="shrink-0 font-semibold text-[#6B7280]"
                              style={{
                                fontFamily: "'DM Sans', sans-serif",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {formatNumber(country.reads)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border border-[#E5E7EB] bg-[#FAFAFA] p-3">
      <p
        className="mb-1 truncate text-sm font-bold uppercase tracking-wider text-[#3D1560]"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        {label}
      </p>
      <strong
        className="block truncate text-sm font-bold text-[#1A1A2E]"
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function VisitorWorldMap({ countries }: { countries: VisitorCountry[] }) {
  const { t } = useLang();
  const [mapSvg, setMapSvg] = useState("");
  const [mapStatus, setMapStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [tooltip, setTooltip] = useState<{
    country: string;
    reads: number;
    x: number;
    y: number;
  } | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const countryKey = useMemo(
    () =>
      countries.map((country) => `${country.iso}:${country.reads}`).join("|"),
    [countries],
  );

  useEffect(() => {
    let cancelled = false;
    setMapStatus("loading");

    fetch("/assets/maps/world.svg", { cache: "force-cache" })
      .then((response) =>
        response.ok
          ? response.text()
          : Promise.reject(new Error("Map failed to load")),
      )
      .then((svgText) => {
        if (!cancelled) {
          setMapSvg(tintMapSvg(svgText, countries));
          setMapStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMapSvg("");
          setMapStatus("unavailable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [countryKey, countries]);

  function handleMapMouseMove(event: MouseEvent<HTMLDivElement>) {
    const target =
      event.target instanceof Element
        ? event.target.closest("path[data-users]")
        : null;
    if (!target || !mapRef.current?.contains(target)) {
      setTooltip(null);
      return;
    }

    const rect = mapRef.current.getBoundingClientRect();
    setTooltip({
      country: target.getAttribute("data-country") || "",
      reads: Number(target.getAttribute("data-users") || 0),
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }

  return (
    <div
      ref={mapRef}
      className="relative overflow-hidden border border-[#E5E7EB] bg-white p-3"
      onMouseMove={handleMapMouseMove}
      onMouseLeave={() => setTooltip(null)}
    >
      {mapStatus === "ready" && mapSvg ? (
        <div
          className="fm-visitor-map"
          dangerouslySetInnerHTML={{ __html: mapSvg }}
        />
      ) : (
        <div
          className="grid aspect-[1010/666] place-items-center text-sm text-[#9CA3AF]"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          {mapStatus === "loading"
            ? t("地图加载中…", "Loading map…")
            : t("地区地图暂不可用", "Regional map is temporarily unavailable")}
        </div>
      )}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold text-[#1A1A2E] shadow-sm"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(12px, -112%)",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <span className="block text-[#3D1560]">{tooltip.country}</span>
          <span className="mt-0.5 block text-[#6B7280]">
            {t(
              `${formatNumber(tooltip.reads)} 次访问`,
              `${formatNumber(tooltip.reads)} visits`,
            )}
          </span>
        </div>
      )}
      <p
        className="mt-2 text-center text-sm text-[#6B7280]"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        Map: SVG Maps, CC BY 4.0
      </p>
    </div>
  );
}

function tintMapSvg(svgText: string, countries: VisitorCountry[]) {
  const parser = new DOMParser();
  const document = parser.parseFromString(svgText, "image/svg+xml");
  const svg = document.querySelector("svg");
  if (!svg) return "";

  svg.setAttribute("class", "fm-visitor-map-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "World map of cumulative visits");

  const paths = svg.querySelectorAll("path[id]");
  paths.forEach((path) => {
    path.setAttribute("fill", "#E5E7EB");
  });

  const maxReads = Math.max(...countries.map((country) => country.reads), 1);
  countries.forEach((country) => {
    if (country.iso === "unknown" || country.iso === "other") return;
    const path = svg.querySelector(`path#${country.iso}`);
    if (!path) return;
    const intensity = 0.18 + 0.77 * Math.sqrt(country.reads / maxReads);
    path.setAttribute("fill", `rgba(61, 21, 96, ${intensity.toFixed(2)})`);
    path.setAttribute("data-users", String(country.reads));
    path.setAttribute("data-country", country.country);
    path.setAttribute("tabindex", "0");
    path.setAttribute(
      "aria-label",
      `${country.country}: ${formatNumber(country.reads)} visits`,
    );
    const title = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "title",
    );
    title.textContent = `${country.country} - ${formatNumber(country.reads)}`;
    path.prepend(title);
  });

  return svg.outerHTML;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function normalizeVisitorStats(
  payload: unknown,
): VisitorStatsPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  if (
    !isNonNegativeSafeInteger(candidate.totalReads) ||
    !isNonNegativeSafeInteger(candidate.countryCount) ||
    !Array.isArray(candidate.countries)
  ) {
    return null;
  }

  const countries: VisitorCountry[] = [];
  const seenIso = new Set<string>();
  for (const rawCountry of candidate.countries) {
    if (
      !rawCountry ||
      typeof rawCountry !== "object" ||
      Array.isArray(rawCountry)
    ) {
      return null;
    }
    const country = rawCountry as Record<string, unknown>;
    const name =
      typeof country.country === "string" ? country.country.trim() : "";
    const iso =
      typeof country.iso === "string" ? country.iso.trim().toLowerCase() : "";
    if (
      !name ||
      name.length > 100 ||
      !/^(?:[a-z]{2}|unknown|other)$/.test(iso) ||
      seenIso.has(iso) ||
      !isNonNegativeSafeInteger(country.reads) ||
      typeof country.latitude !== "number" ||
      !Number.isFinite(country.latitude) ||
      country.latitude < -90 ||
      country.latitude > 90 ||
      typeof country.longitude !== "number" ||
      !Number.isFinite(country.longitude) ||
      country.longitude < -180 ||
      country.longitude > 180
    ) {
      return null;
    }
    seenIso.add(iso);
    countries.push({
      country: name,
      iso,
      reads: country.reads,
      latitude: country.latitude,
      longitude: country.longitude,
    });
  }

  const totalReads = countries.reduce(
    (total, country) => total + country.reads,
    0,
  );
  // The published total counts every displayed region bucket, including the
  // explicit `other` and `unknown` buckets. Keep client validation aligned
  // with the server so a valid historical snapshot is not rejected.
  const countryCount = countries.length;
  if (
    totalReads !== candidate.totalReads ||
    countryCount !== candidate.countryCount
  ) {
    return null;
  }

  return {
    totalReads,
    countryCount,
    pageviews: isNonNegativeSafeInteger(candidate.pageviews)
      ? candidate.pageviews
      : undefined,
    countries: countries.sort(
      (left, right) =>
        right.reads - left.reads || left.country.localeCompare(right.country),
    ),
    mode: typeof candidate.mode === "string" ? candidate.mode : undefined,
    updatedAt:
      typeof candidate.updatedAt === "string" || candidate.updatedAt === null
        ? candidate.updatedAt
        : undefined,
  };
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

const countryNameZh: Record<string, string> = {
  cn: "中国大陆",
  hk: "中国香港",
  us: "美国",
  sg: "新加坡",
  tw: "中国台湾",
  jp: "日本",
  kr: "韩国",
  de: "德国",
  gb: "英国",
  ca: "加拿大",
  au: "澳大利亚",
  my: "马来西亚",
  vn: "越南",
  in: "印度",
  fr: "法国",
  th: "泰国",
  ae: "阿联酋",
  id: "印度尼西亚",
  nl: "荷兰",
  it: "意大利",
  es: "西班牙",
  ch: "瑞士",
  nz: "新西兰",
  br: "巴西",
  se: "瑞典",
  ph: "菲律宾",
  ru: "俄罗斯",
  sa: "沙特阿拉伯",
  tr: "土耳其",
  be: "比利时",
  pt: "葡萄牙",
  il: "以色列",
  qa: "卡塔尔",
  ie: "爱尔兰",
  bd: "孟加拉国",
  pk: "巴基斯坦",
  lk: "斯里兰卡",
  eg: "埃及",
  fi: "芬兰",
  no: "挪威",
  at: "奥地利",
  lu: "卢森堡",
  ma: "摩洛哥",
  np: "尼泊尔",
  ng: "尼日利亚",
  cl: "智利",
  ro: "罗马尼亚",
  ua: "乌克兰",
  pl: "波兰",
  mx: "墨西哥",
  za: "南非",
  other: "其他地区",
  unknown: "未知",
};

function getCountryName(country: string, iso: string, lang: string) {
  if (lang === "zh") return countryNameZh[iso] || country;
  return country;
}

function flagForIso(iso: string) {
  const specialFlags: Record<string, string> = {
    hk: "🇭🇰",
    tw: "🇨🇳",
    other: "🏳️",
    unknown: "🏳️",
  };
  if (iso in specialFlags) return specialFlags[iso];
  if (!/^[a-z]{2}$/i.test(iso)) return "🏳️";

  return iso
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function getOrCreateVisitorId() {
  const key = "frontmind_visitor_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(key, value);
  return value;
}
