import type { GeoAnswerSource, GeoPlatformId } from "./types";

type PreviewAnswerEvidence = {
  citations: GeoAnswerSource[];
  references: GeoAnswerSource[];
};

const SYNTHETIC_OFFICIAL_SOURCES: GeoAnswerSource[] = [
  {
    title: "验收企业官网｜企业概览",
    url: "https://company.example.invalid/about",
  },
  {
    title: "验收企业官网｜方案能力",
    url: "https://company.example.invalid/solutions",
  },
  {
    title: "验收企业官网｜服务边界",
    url: "https://company.example.invalid/service-boundaries",
  },
  {
    title: "验收企业官网｜可信证据",
    url: "https://company.example.invalid/evidence",
  },
];

const PREVIEW_EVIDENCE_PLATFORMS: GeoPlatformId[] = [
  "baiduai",
  "doubao",
  "deepseek",
  "yuanbao",
];

/**
 * 仅用于本地样式验收的匿名合成来源；`.invalid` 域名不会指向真实企业。
 * 答案引用和检索来源仍分开展示，以覆盖前端渲染路径。
 */
export const PREVIEW_MONITOR_EVIDENCE = Object.fromEntries(
  PREVIEW_EVIDENCE_PLATFORMS.flatMap((platformId) =>
    Array.from({ length: 5 }, (_, index) => [
      `${platformId}:${index + 1}`,
      {
        citations: SYNTHETIC_OFFICIAL_SOURCES.slice(0, 2),
        references: SYNTHETIC_OFFICIAL_SOURCES.map((source) => ({
          ...source,
        })),
      },
    ]),
  ),
) as Record<string, PreviewAnswerEvidence>;
