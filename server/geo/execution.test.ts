import { describe, expect, it } from "vitest";

import type { BrokerMonitorRun, BrokerTask } from "./broker";
import { buildGeoExecutionLog } from "./execution";

describe("GEO execution log", () => {
  it("publishes real task state while excluding reasoning, tools, prompts, and raw JSON", () => {
    const knowledgeBaseTask: BrokerTask = {
      id: "upstream-private-id",
      status: "running",
      progress: 0.42,
      created_at: "2026-07-23T01:00:00.000Z",
      updated_at: "2026-07-23T01:02:00.000Z",
      output: [
        {
          type: "message",
          role: "assistant",
          created_at: "2026-07-23T01:01:30.000Z",
          content: [
            {
              type: "output_text",
              text: "已完成官网入口识别，正在核验企业主体。",
            },
            {
              type: "reasoning",
              text: "不得展示的推理",
              content: [
                {
                  type: "output_text",
                  text: "嵌套在推理块中的内容也不得展示",
                },
              ],
            },
            {
              type: "tool_call",
              arguments: '{"token":"不得展示的工具参数"}',
            },
            {
              type: "output_text",
              text: '{"raw":"不得展示的原始 JSON"}',
            },
          ],
        },
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "output_text",
              text: "不得展示的用户输入",
            },
          ],
        },
      ],
    };

    const log = buildGeoExecutionLog({
      knowledgeBaseTask,
      now: new Date("2026-07-23T01:02:30.000Z"),
    });
    const entry = log.entries[0];
    const serialized = JSON.stringify(log);

    expect(log).toMatchObject({
      currentEntryId: "enterprise-analysis",
      fetchedAt: "2026-07-23T01:02:30.000Z",
      updatedAt: "2026-07-23T01:02:30.000Z",
    });
    expect(entry).toMatchObject({
      id: "enterprise-analysis",
      stage: "enterprise_analysis",
      status: "running",
      progress: 42,
      startedAt: "2026-07-23T01:00:00.000Z",
      updatedAt: "2026-07-23T01:02:00.000Z",
    });
    expect(entry.events).toContainEqual({
      id: "enterprise-analysis-model-1",
      kind: "model_output",
      message: "已完成官网入口识别，正在核验企业主体。",
      createdAt: "2026-07-23T01:01:30.000Z",
    });
    expect(serialized).not.toContain("upstream-private-id");
    expect(serialized).not.toContain("不得展示的推理");
    expect(serialized).not.toContain("嵌套在推理块");
    expect(serialized).not.toContain("工具参数");
    expect(serialized).not.toContain("原始 JSON");
    expect(serialized).not.toContain("用户输入");
  });

  it("uses only validated summaries for JSON-only completed tasks", () => {
    const completedTask: BrokerTask = {
      id: "assessment-private-id",
      status: "completed",
      progress: 1,
      created_at: "2026-07-23T02:00:00.000Z",
      completed_at: "2026-07-23T02:03:00.000Z",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: '{"knowledgeVsAnswers":[{"secret":"raw-result"}]}',
            },
          ],
        },
      ],
    };

    const log = buildGeoExecutionLog({
      knowledgeBaseTask: {
        status: "completed",
        completed_at: "2026-07-23T01:30:00.000Z",
        output: [],
      },
      assessmentTask: completedTask,
      validated: {
        knowledgeBaseSummary: "企业知识库已通过结构校验。",
        knowledgeBaseArchiveName: "FrontMind.zip",
        assessmentReady: true,
        assessmentSummary: "平台回答已覆盖企业定位，但产品场景证据仍需补强。",
        comparisonCount: 7,
      },
      now: new Date("2026-07-23T02:03:10.000Z"),
    });
    const assessment = log.entries.find(
      (entry) => entry.id === "current-assessment",
    );
    const serialized = JSON.stringify(log);

    expect(log.currentEntryId).toBe("current-assessment");
    expect(assessment?.events).toContainEqual({
      id: "current-assessment-result",
      kind: "result_summary",
      message:
        "平台回答已覆盖企业定位，但产品场景证据仍需补强。\n已完成 7 项知识事实与平台回答核查。",
      createdAt: "2026-07-23T02:03:00.000Z",
    });
    expect(serialized).not.toContain("raw-result");
    expect(serialized).not.toContain("assessment-private-id");
    expect(log.entries[0]?.events).toContainEqual({
      id: "enterprise-analysis-artifact",
      kind: "artifact",
      message: "已生成知识库归档：FrontMind.zip",
      createdAt: "2026-07-23T01:30:00.000Z",
    });
  });

  it("exposes monitoring counters and the real next poll time", () => {
    const monitorRun: BrokerMonitorRun = {
      runId: "monitor-private-id",
      status: "polling",
      question: "FrontMind 是一家什么样的公司？",
      platforms: ["doubao", "kimi"],
      repeatPerPlatform: 5,
      expectedItems: 10,
      completedItems: 6,
      failedItems: 1,
      submittedAt: "2026-07-23T03:00:00.000Z",
      nextPollAt: "2026-07-23T03:10:00.000Z",
      records: [
        {
          recordId: "record-1",
          platform: "doubao",
          runIndex: 1,
          status: "completed",
          answerText: "回答正文不进入执行日志。",
          media: [],
          citations: [],
          references: [],
          completedAt: "2026-07-23T03:04:00.000Z",
        },
      ],
    };

    const log = buildGeoExecutionLog({
      knowledgeBaseTask: { status: "completed", output: [] },
      questionTask: { status: "completed", output: [] },
      monitorRun,
      now: new Date("2026-07-23T03:05:00.000Z"),
    });
    const monitoring = log.entries.find((entry) => entry.id === "monitoring");

    expect(log.currentEntryId).toBe("monitoring");
    expect(monitoring).toMatchObject({
      status: "running",
      progress: 70,
      startedAt: "2026-07-23T03:00:00.000Z",
      updatedAt: "2026-07-23T03:04:00.000Z",
      nextPollAt: "2026-07-23T03:10:00.000Z",
      counters: { completed: 6, failed: 1, total: 10 },
    });
    expect(monitoring?.events).toContainEqual({
      id: "monitoring-poll-2026-07-23T03:10:00.000Z",
      kind: "poll",
      message: "监控服务已安排下一次远端状态核查。",
    });
    expect(JSON.stringify(log)).not.toContain("回答正文不进入执行日志");
    expect(JSON.stringify(log)).not.toContain("monitor-private-id");
  });

  it("keeps ambiguous monitoring and activated service states explicit", () => {
    const monitorRun: BrokerMonitorRun = {
      runId: "monitor-private-id",
      status: "partial_review_required",
      question: "FrontMind 是一家什么样的公司？",
      platforms: ["doubao"],
      repeatPerPlatform: 5,
      expectedItems: 5,
      completedItems: 4,
      failedItems: 1,
      submittedAt: "2026-07-23T03:00:00.000Z",
      records: [],
    };

    const log = buildGeoExecutionLog({
      knowledgeBaseTask: { status: "completed", output: [] },
      questionTask: { status: "completed", output: [] },
      monitorRun,
      validated: {
        serviceActivatedAt: "2026-07-23T04:00:00.000Z",
      },
      now: new Date("2026-07-23T04:00:01.000Z"),
    });
    const monitoring = log.entries.find((entry) => entry.id === "monitoring");
    const service = log.entries.find(
      (entry) => entry.id === "service-activation",
    );

    expect(monitoring?.status).toBe("partial_review");
    expect(service).toMatchObject({
      status: "completed",
      progress: 100,
      startedAt: "2026-07-23T04:00:00.000Z",
      completedAt: "2026-07-23T04:00:00.000Z",
    });
    expect(log.currentEntryId).toBe("service-activation");
  });

  it("maps missing or paused task state to waiting and uses the stable submission time", () => {
    const log = buildGeoExecutionLog({
      knowledgeBaseTask: { status: "paused", output: [] },
      submittedAt: {
        knowledgeBase: "2026-07-28T08:00:00.000Z",
      },
      now: new Date("2026-07-28T08:00:30.000Z"),
    });

    expect(log.entries[0]).toMatchObject({
      status: "waiting",
      startedAt: "2026-07-28T08:00:00.000Z",
      events: [
        expect.objectContaining({
          kind: "status",
          message: "企业分析任务已提交，正在同步执行状态。",
        }),
      ],
    });
  });

  it("returns structured crawl progress without exposing its marker as model output", () => {
    const marker =
      'FRONTMIND_GEO_CRAWL_PROGRESS_V1 {"schemaVersion":1,"reportedAt":"2026-07-28T08:05:00.000Z","phase":"crawling","visitedLinks":12,"successfulPages":10,"failedPages":2,"textCharacters":24680,"imagesDiscovered":18,"imagesDownloaded":11,"documentsParsed":3,"webQueriesExecuted":2}';
    const log = buildGeoExecutionLog({
      knowledgeBaseTask: {
        status: "running",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: marker }],
          },
        ],
      },
      submittedAt: {
        knowledgeBase: "2026-07-28T08:00:00.000Z",
      },
    });

    expect(log.entries[0]).toMatchObject({
      updatedAt: "2026-07-28T08:05:00.000Z",
      crawlProgress: {
        visitedLinks: 12,
        successfulPages: 10,
        textCharacters: 24_680,
      },
    });
    expect(log.entries[0]?.events).toContainEqual({
      id: "enterprise-analysis-crawl-progress-2026-07-28T08:05:00.000Z",
      kind: "progress_summary",
      message:
        "已访问 12 个链接，成功采集 10 个页面，提取 24680 字文字，发现 18 张图片并保存 11 张，已解析 3 份文档。",
      createdAt: "2026-07-28T08:05:00.000Z",
    });
    expect(JSON.stringify(log)).not.toContain(
      "FRONTMIND_GEO_CRAWL_PROGRESS_V1",
    );
  });
});
