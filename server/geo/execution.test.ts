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
      ? { result: { structuredResult: { secret: "never-render" }, artifacts: [] } }
      : {}),
  };
}

describe("GEO v2 safe execution log", () => {
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
    expect(log.entries.find((entry) => entry.id === "current-assessment")?.events)
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "result_summary",
            message: expect.stringContaining("已完成 7 项知识事实"),
          }),
        ]),
      );
    expect(JSON.stringify(log)).not.toContain("never-render");
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
    const entry = log.entries.find((candidate) => candidate.id === "current-assessment");
    expect(entry?.status).toBe("failed");
    expect(entry?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "error", message: expect.stringContaining("SCHEMA_MISMATCH") }),
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
      progress: 60,
      nextPollAt: "2026-07-23T03:05:00.000Z",
    });
    expect(JSON.stringify(log)).not.toContain("monitor-private");
  });
});
