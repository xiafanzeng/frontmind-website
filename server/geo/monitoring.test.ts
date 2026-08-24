import { describe, expect, it } from "vitest";
import type { BrokerMonitorRun } from "./broker";
import {
  monitorAssessmentEligibility,
  monitorBrandMentionRate,
  normalizeMonitorRun,
  normalizeMonitorSources,
  toPublicMonitorView,
} from "./monitoring";

function completedRun() {
  return {
    runId: "monitor-run-001",
    status: "completed",
    question: "Acme 适合科研团队吗？",
    platforms: ["doubao"],
    repeatPerPlatform: 5,
    expectedItems: 5,
    completedItems: 5,
    failedItems: 0,
    reasoningProcess: "private chain of thought",
    pageScreenshot: "https://secret.example/screenshot.png",
    records: Array.from({ length: 5 }, (_, index) => ({
      recordId: `record-${index + 1}`,
      platform: "doubao",
      runIndex: index + 1,
      status: "completed",
      answerText: `最终回答 ${index + 1}`,
      reasoningProcess: "must not survive",
      media: [
        {
          type: "video",
          url: "https://media.example.com/interview.mp4",
          thumbnailUrl: "https://media.example.com/interview.webp",
          title: "相关采访",
        },
        { type: "image", url: "javascript:alert(1)" },
        { type: "image", url: "https://127.0.0.1/private.png" },
        { type: "audio", url: "http://media.example.com/insecure.mp3" },
      ],
      citations: [{ title: "实际引用", url: "https://source.example/cited" }],
      references: [
        { title: "检索参考", url: "https://source.example/reference" },
      ],
    })),
  };
}

function cleanCompletedRun() {
  const payload = completedRun();
  payload.records = payload.records.map((record) => ({
    ...record,
    media: [record.media[0]],
  }));
  return payload;
}

describe("monitor result adapter", () => {
  it("uses only completed non-error answers with an explicit mention field", () => {
    const run = {
      runId: "ranking-run",
      status: "completed",
      question: "行业推荐有哪些？",
      platforms: ["doubao"],
      repeatPerPlatform: 5,
      expectedItems: 5,
      completedItems: 5,
      failedItems: 0,
      records: [
        {
          recordId: "one",
          platform: "doubao",
          runIndex: 1,
          status: "completed",
          answerText: "提及",
          media: [],
          sources: [],
          mentionPosition: 1,
        },
        {
          recordId: "two",
          platform: "doubao",
          runIndex: 2,
          status: "completed",
          answerText: "明确未提及",
          media: [],
          sources: [],
          mentionPosition: null,
        },
        {
          recordId: "three",
          platform: "doubao",
          runIndex: 3,
          status: "completed",
          answerText: "带错误的结构化结果",
          media: [],
          sources: [],
          mentionPosition: 2,
          error: "结构化结果不可用",
        },
        {
          recordId: "four",
          platform: "doubao",
          runIndex: 4,
          status: "completed",
          answerText: "字段缺失",
          media: [],
          sources: [],
        },
      ],
    } satisfies BrokerMonitorRun;

    expect(monitorBrandMentionRate(run)).toEqual({
      current: 0.5,
      observedAnswers: 2,
    });
  });

  it("keeps final text, safe media and one canonical source collection", () => {
    const run = normalizeMonitorRun(completedRun(), {
      runId: "monitor-run-001",
      question: "Acme 适合科研团队吗？",
      platforms: ["doubao"],
    });
    expect(run.records?.[0]).toMatchObject({
      answerText: "最终回答 1",
      media: [
        {
          type: "video",
          url: "https://media.example.com/interview.mp4",
          thumbnailUrl: "https://media.example.com/interview.webp",
          title: "相关采访",
        },
      ],
      sources: [{ title: "实际引用" }, { title: "检索参考" }],
    });
    expect(run.records).toHaveLength(5);
    expect(run.status).toBe("completed");
    expect(run.quality).toMatchObject({
      completeness: "partial",
      stats: { acceptedCount: 5, expectedCount: 5, droppedCount: 0 },
      warnings: expect.arrayContaining([
        { code: "EVIDENCE_INCOMPLETE", area: "monitoring.sources_media" },
      ]),
      downstreamEligible: true,
    });
    expect(JSON.stringify(toPublicMonitorView(run))).not.toContain(
      "reasoningProcess",
    );
    expect(JSON.stringify(toPublicMonitorView(run))).not.toContain(
      "pageScreenshot",
    );
    expect(JSON.stringify(toPublicMonitorView(run))).not.toContain(
      "javascript:",
    );
  });

  it("marks a fully retained terminal result complete and downstream eligible", () => {
    const payload = cleanCompletedRun();

    const run = normalizeMonitorRun(payload);

    expect(run.status).toBe("completed");
    expect(toPublicMonitorView(run)).toMatchObject({
      quality: {
        completeness: "complete",
        stats: { acceptedCount: 5, expectedCount: 5, droppedCount: 0 },
        downstreamEligible: true,
      },
    });
  });

  it("accepts the longest translated overseas question allowed at checkout", () => {
    const question = `${"A".repeat(239)}?`;
    const payload = completedRun();
    payload.question = question;
    payload.platforms = ["chatgpt"];
    payload.records = payload.records.map((record) => ({
      ...record,
      platform: "chatgpt",
    }));
    expect(
      normalizeMonitorRun(payload, {
        question,
        platforms: ["chatgpt"],
      }).question,
    ).toBe(question);
  });

  it("accepts the full Dashboard monitor question boundary", () => {
    const question = `${"问".repeat(1999)}？`;
    const payload = completedRun();
    payload.question = question;

    expect(normalizeMonitorRun(payload, { question }).question).toBe(question);
  });

  it("maps the Dashboard v1.19 raw shape into the Website monitoring model", () => {
    const payload = cleanCompletedRun() as ReturnType<
      typeof cleanCompletedRun
    > & {
      screenshot?: 0 | 1;
      region?: { scope: "domestic"; code: string; label: string };
    };
    payload.screenshot = 1;
    payload.region = {
      scope: "domestic",
      code: "110000",
      label: "北京市",
    };
    payload.records[0] = {
      ...payload.records[0],
      citationList: [
        {
          index: 0,
          title: "正文引用",
          url: "https://source.example/cited",
          site: "示例财经",
          publishTime: "2026-08-20",
        },
        {
          index: 1,
          title: "相同 URL 的另一个引用位",
          url: "https://source.example/cited",
        },
      ],
      referenceList: [
        {
          index: 0,
          title: "完整参考",
          url: "https://source.example/reference",
          source: "权威媒体",
          summary: "完整来源摘要",
          publishTime: "2026-08-19",
        },
      ],
      sourceBreakdownAvailable: false,
      searchKeywords: ["医药流通企业", "医药流通企业"],
      recommendedQuestions: ["医院配送能力如何评估？"],
      mentionPosition: 2,
      mentionContext: "华润医药拥有全国性网络。",
      sentiment: "positive",
      categoryRanking: { categoryName: "医药流通", rank: 2 },
      keywordEvaluations: [
        {
          keyword: "渠道覆盖",
          nature: "positive",
          context: "全国网络覆盖较广。",
        },
      ],
      screenshot: {
        available: true,
        url: "https://dashboard.internal/private-screenshot",
      },
    } as (typeof payload.records)[number];

    const run = normalizeMonitorRun(payload);
    expect(run).toMatchObject({
      region: { edition: "domestic", code: "110000", label: "北京市" },
      screenshotEnabled: true,
    });
    expect(run.records?.[0]).toMatchObject({
      citations: [
        expect.objectContaining({ index: 0, site: "示例财经" }),
        expect.objectContaining({ index: 1 }),
      ],
      references: [
        expect.objectContaining({
          index: 0,
          site: "权威媒体",
          summary: "完整来源摘要",
          publishTime: "2026-08-19",
        }),
      ],
      sourceBreakdownAvailable: true,
      searchKeywords: ["医药流通企业"],
      recommendedQuestions: ["医院配送能力如何评估？"],
      mentionPosition: 2,
      sentiment: "positive",
      categoryRanking: { categoryName: "医药流通", rank: 2 },
      screenshotAvailable: true,
    });
    expect(JSON.stringify(toPublicMonitorView(run))).not.toContain(
      "private-screenshot",
    );
  });

  it("preserves split-source field presence and explicit null brand metrics", () => {
    const payload = cleanCompletedRun();
    payload.records[0] = {
      ...payload.records[0],
      citationList: [],
      referenceList: [],
      mentionPosition: null,
      sentiment: null,
      categoryRanking: null,
    } as (typeof payload.records)[number];

    const record = normalizeMonitorRun(payload).records?.[0];
    expect(record).toMatchObject({
      citations: [],
      references: [],
      sourceBreakdownAvailable: true,
      mentionPosition: null,
      sentiment: null,
      categoryRanking: null,
    });
    const legacy = normalizeMonitorRun(cleanCompletedRun()).records?.[0];
    expect(legacy).not.toHaveProperty("citations");
    expect(legacy).not.toHaveProperty("references");
    expect(legacy).not.toHaveProperty("sourceBreakdownAvailable");
  });

  it("treats an explicit canonical source list as authoritative even when empty", () => {
    const payload = completedRun();
    payload.records[0] = {
      ...payload.records[0],
      sources: [],
      citations: [
        { title: "不应回填的旧引用", url: "https://legacy.example/cited" },
      ],
      references: [
        { title: "不应回填的旧参考", url: "https://legacy.example/reference" },
      ],
    };

    expect(normalizeMonitorRun(payload).records?.[0].sources).toEqual([]);
  });

  it("keeps the most complete record when normalized source URLs repeat", () => {
    expect(
      normalizeMonitorSources([
        {
          title: "短标题",
          url: "https://SOURCE.example:443/report?utm_source=test#part",
        },
        {
          title: "重复来源的完整标题",
          url: "https://source.example/report",
          domain: "source.example",
          summary: "这是一条可供核验的完整来源摘要。",
        },
      ]),
    ).toEqual([
      {
        title: "重复来源的完整标题",
        url: "https://source.example/report",
        domain: "source.example",
        summary: "这是一条可供核验的完整来源摘要。",
      },
    ]);
  });

  it("blocks IPv4-mapped IPv6 private source addresses", () => {
    expect(
      normalizeMonitorSources([
        {
          title: "本机地址",
          url: "https://[::ffff:127.0.0.1]/private",
        },
        {
          title: "内网地址",
          url: "https://[::ffff:10.0.0.8]/private",
        },
      ]),
    ).toEqual([]);
  });

  it("keeps valid records and marks an incomplete completed snapshot partial", () => {
    const payload = cleanCompletedRun();
    payload.records.pop();
    expect(normalizeMonitorRun(payload)).toMatchObject({
      status: "partial_review_required",
      completedItems: 4,
      failedItems: 1,
      quality: {
        completeness: "partial",
        stats: { acceptedCount: 4, expectedCount: 5, droppedCount: 1 },
        downstreamEligible: true,
      },
      records: expect.arrayContaining([
        expect.objectContaining({ recordId: "record-1" }),
      ]),
    });
  });

  it("accepts a terminal status summary without records only in summary mode", () => {
    const { records: _records, ...summary } = completedRun();

    expect(normalizeMonitorRun(summary)).toMatchObject({
      status: "partial_review_required",
      records: undefined,
    });
    expect(
      normalizeMonitorRun(
        summary,
        { runId: "monitor-run-001" },
        { allowTerminalSummaryWithoutRecords: true },
      ),
    ).toMatchObject({
      status: "completed",
      completedItems: 5,
      records: undefined,
    });
  });

  it("keeps explicit partial records in terminal summary mode", () => {
    const payload = completedRun();
    payload.records.pop();

    expect(
      normalizeMonitorRun(payload, undefined, {
        allowTerminalSummaryWithoutRecords: true,
      }),
    ).toMatchObject({
      status: "partial_review_required",
      completedItems: 4,
    });
  });

  it("drops only the duplicate platform/run record", () => {
    const payload = completedRun();
    payload.records[4].runIndex = 1;
    const run = normalizeMonitorRun(payload);
    expect(run).toMatchObject({
      status: "partial_review_required",
      completedItems: 4,
    });
    expect(run.records).toHaveLength(4);
  });

  it("drops only the duplicate provider record ID", () => {
    const payload = completedRun();
    payload.records[4].recordId = payload.records[0].recordId;
    const run = normalizeMonitorRun(payload);
    expect(run).toMatchObject({
      status: "partial_review_required",
      completedItems: 4,
    });
    expect(run.records).toHaveLength(4);
  });

  it("recomputes record totals when the provider summary disagrees", () => {
    const payload = completedRun();
    payload.completedItems = 4;
    expect(normalizeMonitorRun(payload)).toMatchObject({
      status: "partial_review_required",
      completedItems: 5,
      failedItems: 0,
    });
  });

  it("drops one completed record whose final answer is only whitespace", () => {
    const payload = completedRun();
    payload.records[0].answerText = " \n\t ";

    const run = normalizeMonitorRun(payload);
    expect(run).toMatchObject({
      status: "partial_review_required",
      completedItems: 4,
    });
    expect(run.records?.some((record) => record.recordId === "record-1")).toBe(
      false,
    );
  });

  it("drops malformed source and media items without deleting the legal answer", () => {
    const payload = cleanCompletedRun();
    payload.records[0] = {
      ...payload.records[0],
      media: [
        { type: "image", url: "https://media.example.com/valid.png" },
        { type: "document", url: "https://media.example.com/bad.pdf" },
      ],
      sources: [
        { title: "可核验来源", url: "https://source.example/report" },
        { title: 42 },
      ],
    } as (typeof payload.records)[number];

    const run = normalizeMonitorRun(payload);
    expect(run.records?.[0]).toMatchObject({
      recordId: "record-1",
      answerText: "最终回答 1",
      media: [{ url: "https://media.example.com/valid.png" }],
      sources: [{ title: "可核验来源" }],
    });
    expect(run.records).toHaveLength(5);
    expect(run.status).toBe("completed");
    expect(run.quality).toMatchObject({
      completeness: "partial",
      stats: { acceptedCount: 5, droppedCount: 0 },
      warnings: expect.arrayContaining([
        { code: "EVIDENCE_INCOMPLETE", area: "monitoring.sources_media" },
      ]),
      downstreamEligible: true,
    });
  });

  it("does not silently treat a partially failed provider run as complete", () => {
    const payload = completedRun();
    payload.completedItems = 4;
    payload.failedItems = 1;
    payload.records[4] = {
      ...payload.records[4],
      status: "failed",
      answerText: undefined,
      media: [],
      citations: [],
      references: [],
    };

    expect(normalizeMonitorRun(payload).status).toBe("partial_review_required");
  });

  it("keeps failed attempts recoverable while Dashboard is still polling", () => {
    const payload = cleanCompletedRun();
    payload.status = "polling";
    payload.completedItems = 3;
    payload.failedItems = 2;
    payload.records = payload.records.map((record, index) =>
      index < 3
        ? record
        : {
            ...record,
            status: "failed",
            answerText: undefined,
            media: [],
            citations: [],
            references: [],
          },
    );

    const run = normalizeMonitorRun(payload);
    expect(run).toMatchObject({
      status: "polling",
      completedItems: 3,
      failedItems: 2,
    });
    expect(run).not.toHaveProperty("quality");
  });

  it("does not start assessment from polling even when all five answers are visible", () => {
    const payload = cleanCompletedRun();
    payload.status = "polling";

    const run = normalizeMonitorRun(payload);

    expect(run).toMatchObject({
      status: "polling",
      completedItems: 5,
      failedItems: 0,
    });
    expect(monitorAssessmentEligibility(run)).toMatchObject({
      successfulResponses: 5,
      failedResponses: 0,
      fullSample: false,
      terminalPartialEligible: false,
      assessmentEligible: false,
    });
  });

  it("allows a terminal 3/5 sample to continue assessment", () => {
    const payload = cleanCompletedRun();
    payload.status = "partial_review_required";
    payload.completedItems = 3;
    payload.failedItems = 2;
    payload.records = payload.records.map((record, index) =>
      index < 3
        ? record
        : {
            ...record,
            status: "failed",
            answerText: undefined,
            media: [],
            citations: [],
            references: [],
          },
    );

    const run = normalizeMonitorRun(payload);
    expect(run).toMatchObject({
      status: "partial_review_required",
      completedItems: 3,
      failedItems: 2,
      quality: { downstreamEligible: true },
    });
    expect(monitorAssessmentEligibility(run)).toMatchObject({
      successfulResponses: 3,
      failedResponses: 2,
      fullSample: false,
      terminalPartialEligible: true,
      assessmentEligible: true,
    });
  });

  it("blocks a terminal sample when any platform has fewer than 3 answers", () => {
    const records: BrokerMonitorRun["records"] = [
      ...Array.from({ length: 5 }, (_, index) => ({
        recordId: `doubao-${index + 1}`,
        platform: "doubao" as const,
        runIndex: index + 1,
        status: "completed" as const,
        answerText: `豆包回答 ${index + 1}`,
        media: [],
        sources: [],
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        recordId: `kimi-${index + 1}`,
        platform: "kimi" as const,
        runIndex: index + 1,
        status: "completed" as const,
        answerText: `Kimi 回答 ${index + 1}`,
        media: [],
        sources: [],
      })),
    ];
    const run = {
      runId: "partial-two-platforms",
      status: "partial_review_required",
      question: "Acme 怎么样？",
      platforms: ["doubao", "kimi"],
      repeatPerPlatform: 5,
      expectedItems: 10,
      completedItems: 7,
      failedItems: 3,
      records,
    } satisfies BrokerMonitorRun;

    expect(monitorAssessmentEligibility(run)).toMatchObject({
      successfulResponses: 7,
      failedResponses: 3,
      fullSample: false,
      terminalPartialEligible: false,
      assessmentEligible: false,
    });
  });
});
