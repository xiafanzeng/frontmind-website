import { describe, expect, it } from "vitest";

import type { BrokerMonitorRun, BrokerTask } from "./broker";
import { buildGeoExecutionLog } from "./execution";

function task(
  status: BrokerTask["status"],
  events: BrokerTask["safeEvents"] = [],
): BrokerTask {
  return {
    localTaskId: "private-task-id",
    operationId: "private-operation-id",
    status,
    safeEvents: events,
    ...(status === "succeeded"
      ? {
          result: {
            structuredResult: { secret: "never-render" },
            artifacts: [],
          },
        }
      : {}),
  };
}

describe("GEO v2 safe execution log", () => {
  it.each(["product_opinion", "industry_ranking"] as const)(
    "keeps the %s forecast independently current while the other side is completed",
    (runningPerspective) => {
      const log = buildGeoExecutionLog({
        knowledgeBaseTask: task("succeeded"),
        assessmentTask: task("succeeded"),
        optimizationForecastTask: task(
          runningPerspective === "product_opinion" ? "running" : "succeeded",
        ),
        submittedAt: { optimizationForecast: "2026-09-07T01:00:00.000Z" },
        industryRanking: {
          assessmentTask: task("succeeded"),
          optimizationForecastTask: task(
            runningPerspective === "industry_ranking" ? "running" : "succeeded",
          ),
          submittedAt: { optimizationForecast: "2026-09-07T01:05:00.000Z" },
        },
      });
      const activeId =
        runningPerspective === "product_opinion"
          ? "optimization-forecast"
          : "industry-ranking-optimization-forecast";
      expect(log.currentEntryId).toBe(activeId);
      expect(log.entries[0]).not.toHaveProperty("perspective");
      expect(
        log.entries.find((entry) => entry.id === "optimization-forecast"),
      ).toMatchObject({
        perspective: "product_opinion",
        startedAt: "2026-09-07T01:00:00.000Z",
        status:
          runningPerspective === "product_opinion" ? "running" : "completed",
      });
      expect(
        log.entries.find(
          (entry) => entry.id === "industry-ranking-optimization-forecast",
        ),
      ).toMatchObject({
        perspective: "industry_ranking",
        startedAt: "2026-09-07T01:05:00.000Z",
        status:
          runningPerspective === "industry_ranking" ? "running" : "completed",
      });
    },
  );

  it("preserves legacy entry identities for a historical industry-only chain", () => {
    const log = buildGeoExecutionLog({
      knowledgeBaseTask: task("succeeded"),
      primaryPerspective: "industry_ranking",
      assessmentTask: task("succeeded"),
      optimizationForecastTask: task("running"),
    });
    expect(
      log.entries.slice(1).map(({ id, perspective }) => ({ id, perspective })),
    ).toEqual([
      { id: "current-assessment", perspective: "industry_ranking" },
      { id: "optimization-forecast", perspective: "industry_ranking" },
    ]);
  });

  it("does not call invalid or partial forecast output completed on either side", () => {
    const log = buildGeoExecutionLog({
      knowledgeBaseTask: task("succeeded"),
      optimizationForecastTask: task("succeeded"),
      validated: {
        forecastFailureCode: "SCHEMA_MISMATCH",
        forecastResultInvalid: true,
      },
      industryRanking: {
        optimizationForecastTask: {
          ...task("succeeded"),
          terminalAt: "2026-09-07T02:15:00.000Z",
        },
        validated: { forecastResultPartial: true },
      },
    });
    const product = log.entries.find(
      (entry) => entry.id === "optimization-forecast",
    )!;
    const industry = log.entries.find(
      (entry) => entry.id === "industry-ranking-optimization-forecast",
    )!;
    expect(product.status).toBe("failed");
    expect(
      product.events.some((event) => event.message.includes("SCHEMA_MISMATCH")),
    ).toBe(true);
    expect(industry).toMatchObject({
      status: "partial_review",
      completedAt: "2026-09-07T02:15:00.000Z",
    });
    expect(industry.events[0].message).toContain("部分结果可用");
    expect(
      [...product.events, ...industry.events].some(
        (event) => event.message === "优化效果评估已完成。",
      ),
    ).toBe(false);
    expect(log.currentEntryId).toBeUndefined();
  });

  it("keeps the persisted submission time for legacy tasks as public logs advance", () => {
    const submittedAt = { knowledgeBase: "2026-09-05T12:00:00.000Z" };
    for (const createdAt of [
      "2026-09-05T12:01:00.000Z",
      "2026-09-05T12:04:00.000Z",
    ]) {
      const log = buildGeoExecutionLog({
        knowledgeBaseTask: task("running", [
          { id: "event", type: "status", createdAt, message: "真实状态。" },
        ]),
        submittedAt,
      });
      expect(log.entries[0].startedAt).toBe(submittedAt.knowledgeBase);
    }
  });
  it("keeps public event identities stable through polling and repeated text, excluding reasoning", () => {
    const events = Array.from({ length: 8 }, (_, index) => ({
      id: `event-${index}`,
      type: "agent.message",
      message: index === 7 ? "公开回复。" : `真实输出 ${index}`,
      timestamp: 1_788_609_600 + index,
    }));
    const first = buildGeoExecutionLog({
      knowledgeBaseTask: {
        ...task("running", events),
        providerStartedAt: "2026-09-05T12:00:00.000Z",
      },
    }).entries[0];
    const next = buildGeoExecutionLog({
      knowledgeBaseTask: {
        ...task("running", [
          ...events,
          events[7],
          { id: "new-same-text", type: "agent.message", message: "公开回复。" },
          {
            id: "thinking",
            type: "agent.thinking",
            message: "private-reasoning-body",
          },
        ]),
        providerStartedAt: "2026-09-05T12:00:00.000Z",
      },
    }).entries[0];
    const firstModel = first.events.filter(
      (event) => event.kind === "model_output",
    );
    const nextModel = next.events.filter(
      (event) => event.kind === "model_output",
    );
    expect(firstModel).toHaveLength(8);
    expect(nextModel).toHaveLength(9);
    expect(nextModel.slice(0, 8)).toEqual(firstModel);
    expect(next.startedAt).toBe(first.startedAt);
    expect(JSON.stringify(next)).not.toContain("private-reasoning-body");
    expect(JSON.stringify(next)).not.toContain("private-task-id");
  });
  it("renders only bounded safe events and never raw task identities/results", () => {
    const log = buildGeoExecutionLog({
      knowledgeBaseTask: task("running", [
        {
          id: "event-1",
          type: "progress",
          createdAt: "2026-07-23T01:01:30.000Z",
          message: "已完成官网入口识别，正在核验企业主体。",
        },
      ]),
      now: new Date("2026-07-23T01:02:30.000Z"),
    });
    expect(log.entries[0]).toMatchObject({
      id: "enterprise-analysis",
      status: "running",
      startedAt: "2026-07-23T01:01:30.000Z",
      events: expect.arrayContaining([
        expect.objectContaining({
          kind: "model_output",
          message: "已完成官网入口识别，正在核验企业主体。",
        }),
      ]),
    });
    const serialized = JSON.stringify(log);
    expect(serialized).not.toContain("private-task-id");
    expect(serialized).not.toContain("private-operation-id");
    expect(serialized).not.toContain("never-render");
  });

  it("uses validated summaries instead of the typed model payload", () => {
    const log = buildGeoExecutionLog({
      knowledgeBaseTask: task("succeeded"),
      assessmentTask: task("succeeded"),
      validated: {
        knowledgeBaseSummary: "企业知识库已通过结构校验。",
        knowledgeBaseArchiveName: "FrontMind.zip",
        assessmentReady: true,
        assessmentSummary: "平台回答已完成知识核查。",
        comparisonCount: 7,
      },
      now: new Date("2026-07-23T02:03:10.000Z"),
    });
    expect(
      log.entries.find((entry) => entry.id === "current-assessment")?.events,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "result_summary",
          message: expect.stringContaining("已完成 7 项知识事实"),
        }),
      ]),
    );
    expect(JSON.stringify(log)).not.toContain("never-render");
  });

  it("uses provider lifecycle timestamps and clears currentEntryId at terminal", () => {
    const questionTask = {
      ...task("succeeded"),
      providerStartedAt: "2026-08-15T13:00:00.000Z",
      terminalAt: "2026-08-15T13:12:00.000Z",
    };
    const log = buildGeoExecutionLog({
      knowledgeBaseTask: task("succeeded"),
      questionTask,
      validated: { questionCount: 20 },
    });

    expect(log.currentEntryId).toBeUndefined();
    expect(
      log.entries.find((entry) => entry.id === "question-recommendation"),
    ).toMatchObject({
      status: "completed",
      startedAt: "2026-08-15T13:00:00.000Z",
      completedAt: "2026-08-15T13:12:00.000Z",
    });
  });

  it("projects a completed task with an invalid question result as failed history", () => {
    const log = buildGeoExecutionLog({
      knowledgeBaseTask: task("succeeded"),
      questionTask: {
        ...task("succeeded"),
        terminalAt: "2026-08-15T13:12:00.000Z",
      },
      validated: { questionResultInvalid: true },
    });
    const entry = log.entries.find(
      (candidate) => candidate.id === "question-recommendation",
    );

    expect(entry).toMatchObject({
      status: "failed",
      completedAt: "2026-08-15T13:12:00.000Z",
    });
    expect(entry?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "error",
          message: "问题推荐结果未通过完整性校验。",
        }),
      ]),
    );
    expect(log.currentEntryId).toBeUndefined();
  });

  it("separates upstream success from local schema failure", () => {
    const log = buildGeoExecutionLog({
      knowledgeBaseTask: task("succeeded"),
      assessmentTask: task("succeeded"),
      validated: {
        assessmentReady: false,
        assessmentFailureCode: "SCHEMA_MISMATCH",
      },
    });
    const entry = log.entries.find(
      (candidate) => candidate.id === "current-assessment",
    );
    expect(entry?.status).toBe("failed");
    expect(entry?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "error",
          message: expect.stringContaining("SCHEMA_MISMATCH"),
        }),
      ]),
    );
  });

  it("keeps the monitoring counters and 202-style polling state", () => {
    const monitorRun: BrokerMonitorRun = {
      runId: "monitor-private",
      status: "polling",
      question: "Acme 稳定吗？",
      platforms: ["doubao"],
      repeatPerPlatform: 5,
      expectedItems: 5,
      completedItems: 2,
      failedItems: 1,
      nextPollAt: "2026-07-23T03:05:00.000Z",
    };
    const log = buildGeoExecutionLog({
      knowledgeBaseTask: task("succeeded"),
      monitorRun,
    });
    expect(log.entries.at(-1)).toMatchObject({
      stage: "monitoring",
      status: "running",
      counters: { completed: 2, failed: 1, total: 5 },
      progress: 40,
      nextPollAt: "2026-07-23T03:05:00.000Z",
    });
    expect(JSON.stringify(log)).not.toContain("monitor-private");
  });
});
