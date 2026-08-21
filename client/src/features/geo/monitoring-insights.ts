import type {
  GeoAnswerSource,
  GeoKeywordEvaluation,
  GeoMonitoringAnswer,
} from "./types";

export type MonitoringInsightRow = {
  key: string;
  label: string;
  count: number;
  percentage: number;
  url?: string;
  channel?: string;
  context?: string;
};

export type MonitoringSentimentKey =
  | "positive"
  | "neutral"
  | "negative"
  | "unknown";

export type MonitoringInsights = {
  completedCount: number;
  citationCoverage: number;
  channels: MonitoringInsightRow[];
  articles: MonitoringInsightRow[];
  sentiment: {
    coverage: number;
    counts: Record<MonitoringSentimentKey, number>;
    percentages: Record<MonitoringSentimentKey, number>;
  };
  evaluations: {
    coverage: number;
    groups: Record<GeoKeywordEvaluation["nature"], MonitoringInsightRow[]>;
  };
  brand: {
    mentionCoverage: number;
    mentionedCount: number;
    mentionRate: number;
    averagePosition?: number;
    bestPosition?: number;
    categoryCoverage: number;
    categories: Array<{
      categoryName: string;
      bestRank: number;
      count: number;
    }>;
  };
};

function hasOwn(value: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function percentage(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1_000) / 10;
}

export function canonicalMonitoringSourceUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname
    ) {
      return undefined;
    }
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function sourceChannel(source: GeoAnswerSource) {
  const direct = source.site?.trim() || source.domain?.trim();
  if (direct) return direct;
  const canonicalUrl = canonicalMonitoringSourceUrl(source.url);
  if (!canonicalUrl) return "未知渠道";
  try {
    return new URL(canonicalUrl).hostname;
  } catch {
    return "未知渠道";
  }
}

function articleIdentity(source: GeoAnswerSource) {
  const canonicalUrl = canonicalMonitoringSourceUrl(source.url);
  if (canonicalUrl) return `url:${canonicalUrl}`;
  const title = source.title
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("zh-CN");
  return `title:${title}|${sourceChannel(source)
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("zh-CN")}`;
}

function stableRows(
  rows: Map<
    string,
    Omit<MonitoringInsightRow, "percentage"> & { order: number }
  >,
  total: number,
) {
  return Array.from(rows.values())
    .sort((left, right) => right.count - left.count || left.order - right.order)
    .map(({ order: _order, ...row }) => ({
      ...row,
      percentage: percentage(row.count, total),
    }));
}

function normalizeEvaluationKeyword(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
}

export function buildMonitoringInsights(
  answers: GeoMonitoringAnswer[],
): MonitoringInsights {
  const completed = answers.filter(
    (answer) =>
      answer.status === "completed" &&
      answer.answer.trim().length > 0 &&
      !answer.error,
  );
  const channelRows = new Map<
    string,
    Omit<MonitoringInsightRow, "percentage"> & { order: number }
  >();
  const articleRows = new Map<
    string,
    Omit<MonitoringInsightRow, "percentage"> & { order: number }
  >();
  let order = 0;
  let totalChannelPairs = 0;
  let totalArticlePairs = 0;

  for (const answer of completed) {
    if (!answer.sourceBreakdownAvailable) continue;
    const articlesInAnswer = new Map<string, GeoAnswerSource>();
    for (const source of answer.citations) {
      const identity = articleIdentity(source);
      if (!articlesInAnswer.has(identity))
        articlesInAnswer.set(identity, source);
    }

    const channelsInAnswer = new Set<string>();
    for (const [identity, source] of Array.from(articlesInAnswer.entries())) {
      const channel = sourceChannel(source);
      channelsInAnswer.add(channel);
      const existing = articleRows.get(identity);
      if (existing) {
        existing.count += 1;
      } else {
        articleRows.set(identity, {
          key: identity,
          label: source.title || source.url || "未命名来源",
          count: 1,
          order: order++,
          ...(canonicalMonitoringSourceUrl(source.url)
            ? { url: canonicalMonitoringSourceUrl(source.url) }
            : {}),
          channel,
        });
      }
      totalArticlePairs += 1;
    }

    for (const channel of Array.from(channelsInAnswer)) {
      const key = channel.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
      const existing = channelRows.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        channelRows.set(key, {
          key,
          label: channel,
          count: 1,
          order: order++,
        });
      }
      totalChannelPairs += 1;
    }
  }

  const sentimentCounts: Record<MonitoringSentimentKey, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
    unknown: 0,
  };
  let sentimentCoverage = 0;
  for (const answer of completed) {
    if (!hasOwn(answer, "sentiment")) continue;
    sentimentCoverage += 1;
    sentimentCounts[answer.sentiment ?? "unknown"] += 1;
  }

  const evaluationRows = {
    positive: new Map<
      string,
      Omit<MonitoringInsightRow, "percentage"> & { order: number }
    >(),
    neutral: new Map<
      string,
      Omit<MonitoringInsightRow, "percentage"> & { order: number }
    >(),
    negative: new Map<
      string,
      Omit<MonitoringInsightRow, "percentage"> & { order: number }
    >(),
  };
  let evaluationCoverage = 0;
  let evaluationOrder = 0;
  for (const answer of completed) {
    if (!hasOwn(answer, "keywordEvaluations")) continue;
    evaluationCoverage += 1;
    const seenInAnswer = new Set<string>();
    for (const evaluation of answer.keywordEvaluations ?? []) {
      const keywordKey = normalizeEvaluationKeyword(evaluation.keyword);
      if (!keywordKey) continue;
      const key = `${evaluation.nature}:${keywordKey}`;
      if (seenInAnswer.has(key)) continue;
      seenInAnswer.add(key);
      const group = evaluationRows[evaluation.nature];
      const existing = group.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.context && evaluation.context) {
          existing.context = evaluation.context;
        }
      } else {
        group.set(key, {
          key,
          label: evaluation.keyword.trim(),
          count: 1,
          order: evaluationOrder++,
          ...(evaluation.context ? { context: evaluation.context } : {}),
        });
      }
    }
  }

  const mentionAnswers = completed.filter((answer) =>
    hasOwn(answer, "mentionPosition"),
  );
  const mentionPositions = mentionAnswers.flatMap((answer) =>
    typeof answer.mentionPosition === "number" ? [answer.mentionPosition] : [],
  );
  const categoryAnswers = completed.filter((answer) =>
    hasOwn(answer, "categoryRanking"),
  );
  const categoryRows = new Map<
    string,
    { categoryName: string; bestRank: number; count: number; order: number }
  >();
  let categoryOrder = 0;
  for (const answer of categoryAnswers) {
    const category = answer.categoryRanking;
    if (!category) continue;
    const categoryName = category.categoryName.trim();
    if (!categoryName) continue;
    const existing = categoryRows.get(categoryName);
    if (existing) {
      existing.bestRank = Math.min(existing.bestRank, category.rank);
      existing.count += 1;
    } else {
      categoryRows.set(categoryName, {
        categoryName,
        bestRank: category.rank,
        count: 1,
        order: categoryOrder++,
      });
    }
  }

  return {
    completedCount: completed.length,
    citationCoverage: completed.filter(
      (answer) => answer.sourceBreakdownAvailable,
    ).length,
    channels: stableRows(channelRows, totalChannelPairs),
    articles: stableRows(articleRows, totalArticlePairs),
    sentiment: {
      coverage: sentimentCoverage,
      counts: sentimentCounts,
      percentages: {
        positive: percentage(sentimentCounts.positive, sentimentCoverage),
        neutral: percentage(sentimentCounts.neutral, sentimentCoverage),
        negative: percentage(sentimentCounts.negative, sentimentCoverage),
        unknown: percentage(sentimentCounts.unknown, sentimentCoverage),
      },
    },
    evaluations: {
      coverage: evaluationCoverage,
      groups: {
        positive: stableRows(evaluationRows.positive, evaluationCoverage),
        neutral: stableRows(evaluationRows.neutral, evaluationCoverage),
        negative: stableRows(evaluationRows.negative, evaluationCoverage),
      },
    },
    brand: {
      mentionCoverage: mentionAnswers.length,
      mentionedCount: mentionPositions.length,
      mentionRate: percentage(mentionPositions.length, mentionAnswers.length),
      ...(mentionPositions.length > 0
        ? {
            averagePosition:
              Math.round(
                (mentionPositions.reduce((sum, value) => sum + value, 0) /
                  mentionPositions.length) *
                  10,
              ) / 10,
            bestPosition: Math.min(...mentionPositions),
          }
        : {}),
      categoryCoverage: categoryAnswers.length,
      categories: Array.from(categoryRows.values())
        .sort(
          (left, right) =>
            left.bestRank - right.bestRank || left.order - right.order,
        )
        .map(({ order: _order, ...category }) => category),
    },
  };
}
