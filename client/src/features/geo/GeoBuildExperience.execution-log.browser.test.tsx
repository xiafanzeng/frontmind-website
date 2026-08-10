// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecutionLogDialog } from "./GeoBuildExperience";
import { createGeoStylePreviewProject } from "./preview";
import type { GeoProject } from "./types";

afterEach(() => cleanup());

describe("execution log dialog", () => {
  it("shows only the FrontMind Agent runtime and never exposes API event text", () => {
    const fixture = createGeoStylePreviewProject();
    const project: GeoProject = {
      ...fixture,
      preview: undefined,
      remoteToken: "signed-project-token",
      createdAt: "2026-08-08T12:00:00.000Z",
      executionLog: {
        currentEntryId: "question-recommendation",
        fetchedAt: "2026-08-08T15:59:00.000Z",
        updatedAt: "2026-08-08T15:59:00.000Z",
        entries: [
          {
            id: "question-recommendation",
            stage: "question_recommendation",
            title: "GEO 问题推荐",
            status: "completed",
            progress: 73,
            startedAt: "2026-08-08T12:00:00.000Z",
            completedAt: "2026-08-08T12:11:35.000Z",
            updatedAt: "2026-08-08T15:59:00.000Z",
            nextPollAt: "2026-08-08T16:00:00.000Z",
            counters: {
              total: 20,
              completed: 18,
              failed: 2,
            },
            events: [
              {
                id: "agent-message",
                kind: "model_output",
                message: "收到任务，正在验证文件完整性并解压 Skill，请稍候。",
                createdAt: "2026-08-08T12:01:00.000Z",
              },
              {
                id: "api-message",
                kind: "result_summary",
                message:
                  '翻译API返回：{"questionEnglish":"Is SiliconFlow reliable?"}',
                createdAt: "2026-08-08T12:02:00.000Z",
              },
            ],
          },
        ],
      },
    };

    render(
      <ExecutionLogDialog
        open
        project={project}
        refreshing={false}
        onOpenChange={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    const runtime = screen.getByLabelText("FrontMind Agent 执行计时");
    const agentName = within(runtime).getByText("FrontMind Agent");
    const timerLabel = within(runtime).getByText("执行计时");

    expect(within(runtime).getByText("00:11:35")).not.toBeNull();
    expect(
      agentName.compareDocumentPosition(timerLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      screen.queryByText("收到任务，正在验证文件完整性并解压 Skill，请稍候。"),
    ).toBeNull();
    expect(
      screen.queryByText(
        '翻译API返回：{"questionEnglish":"Is SiliconFlow reliable?"}',
      ),
    ).toBeNull();
    expect(screen.queryByText("最近同步")).toBeNull();
    expect(screen.queryByText("任务样本")).toBeNull();
    expect(screen.queryByText("工作记录")).toBeNull();
    expect(screen.queryByText("完成进度")).toBeNull();
    expect(screen.queryByText("下一次状态同步预计于")).toBeNull();
    expect(screen.queryByText("73%", { exact: false })).toBeNull();
    expect(screen.queryByRole("log")).toBeNull();
  });
});
