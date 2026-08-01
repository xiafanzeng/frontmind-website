import { describe, expect, it } from "vitest";
import { normalizeMonitorRun, toPublicMonitorView } from "./monitoring";

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

describe("monitor result adapter", () => {
  it("keeps final text, safe media and separate source collections", () => {
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
      citations: [{ title: "实际引用" }],
      references: [{ title: "检索参考" }],
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

  it("fails closed on an incomplete completed snapshot", () => {
    const payload = completedRun();
    payload.records.pop();
    expect(() => normalizeMonitorRun(payload)).toThrow(
      "监控记录状态与汇总数量不一致",
    );
  });

  it("accepts a terminal status summary without records only in summary mode", () => {
    const { records: _records, ...summary } = completedRun();

    expect(() => normalizeMonitorRun(summary)).toThrow("监控完成快照不完整");
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

  it("still rejects explicit partial records in terminal summary mode", () => {
    const payload = completedRun();
    payload.records.pop();

    expect(() =>
      normalizeMonitorRun(payload, undefined, {
        allowTerminalSummaryWithoutRecords: true,
      }),
    ).toThrow("监控记录状态与汇总数量不一致");
  });

  it("fails closed on duplicate platform/run slots", () => {
    const payload = completedRun();
    payload.records[4].runIndex = 1;
    expect(() => normalizeMonitorRun(payload)).toThrow("重复的平台轮次");
  });

  it("fails closed on duplicate provider record IDs", () => {
    const payload = completedRun();
    payload.records[4].recordId = payload.records[0].recordId;
    expect(() => normalizeMonitorRun(payload)).toThrow("重复的记录 ID");
  });

  it("fails closed when record states disagree with provider totals", () => {
    const payload = completedRun();
    payload.completedItems = 4;
    expect(() => normalizeMonitorRun(payload)).toThrow(
      "监控记录状态与汇总数量不一致",
    );
  });

  it("rejects a completed record whose final answer is only whitespace", () => {
    const payload = completedRun();
    payload.records[0].answerText = " \n\t ";

    expect(() => normalizeMonitorRun(payload)).toThrow("完成记录缺少最终文字");
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
});
