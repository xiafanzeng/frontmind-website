// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecutionLogDialog } from "./GeoBuildExperience";
import { createGeoStylePreviewProject } from "./preview";
import type { GeoProject } from "./types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("execution log dialog", () => {
  it("shows real public log text below the retained timer and escapes HTML", () => {
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
                  '<img src=x onerror="window.__unsafe=1">\n公开结果已返回。',
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
    const log = screen.getByRole("log", { name: "公开执行日志" });
    expect(
      within(log).getByText(
        "收到任务，正在验证文件完整性并解压 Skill，请稍候。",
      ),
    ).not.toBeNull();
    expect(log.textContent).toContain(
      '<img src=x onerror="window.__unsafe=1">',
    );
    expect(log.querySelector("img")).toBeNull();
    expect(log.querySelector("time")).toBeNull();
    expect(log.textContent).not.toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(
      runtime.compareDocumentPosition(log) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(screen.queryByText("最近同步")).toBeNull();
    expect(screen.queryByText("任务样本")).toBeNull();
    expect(screen.queryByText("工作记录")).toBeNull();
    expect(screen.queryByText("完成进度")).toBeNull();
    expect(screen.queryByText("下一次状态同步预计于")).toBeNull();
    expect(screen.queryByText("73%", { exact: false })).toBeNull();
    expect(screen.getByText("历史环节")).not.toBeNull();
    expect(screen.queryByText("当前环节")).toBeNull();
  });

  it("preserves the absolute runtime across polling, reopening and recovery without moving history selection", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T12:01:00.000Z"));
    const fixture = createGeoStylePreviewProject();
    const project: GeoProject = {
      ...fixture,
      executionLog: {
        fetchedAt: "2026-09-05T12:01:00.000Z",
        updatedAt: "2026-09-05T12:01:00.000Z",
        currentEntryId: "current",
        entries: [
          {
            id: "history",
            stage: "enterprise_analysis",
            title: "已完成的企业分析",
            status: "completed",
            startedAt: "2026-09-05T11:00:00.000Z",
            completedAt: "2026-09-05T11:01:00.000Z",
            events: [
              { id: "old", kind: "status", message: "历史任务已完成。" },
            ],
          },
          {
            id: "current",
            stage: "question_recommendation",
            title: "正在执行的问题推荐",
            status: "running",
            startedAt: "2026-09-05T12:00:00.000Z",
            events: [
              { id: "new", kind: "model_output", message: "公开任务消息。" },
            ],
          },
        ],
      },
    };
    const props = {
      open: true,
      project,
      refreshing: false,
      onOpenChange: vi.fn(),
      onRefresh: vi.fn(),
    };
    const view = render(<ExecutionLogDialog {...props} />);
    expect(
      within(screen.getByLabelText("FrontMind Agent 执行计时")).getByText(
        "00:01:00",
      ),
    ).not.toBeNull();
    act(() => vi.advanceTimersByTime(15_000));
    const polled = structuredClone(project);
    polled.executionLog!.entries[1].events.push({
      id: "new-2",
      kind: "model_output",
      message: "新返回的消息。",
    });
    view.rerender(<ExecutionLogDialog {...props} project={polled} />);
    expect(
      within(screen.getByLabelText("FrontMind Agent 执行计时")).getByText(
        "00:01:15",
      ),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /已完成的企业分析/ }));
    view.rerender(
      <ExecutionLogDialog {...props} project={structuredClone(polled)} />,
    );
    expect(
      screen.getByRole("heading", { name: "已完成的企业分析" }),
    ).not.toBeNull();
    expect(screen.queryByText("新返回的消息。")).toBeNull();
    view.rerender(
      <ExecutionLogDialog {...props} project={polled} open={false} />,
    );
    act(() => vi.advanceTimersByTime(15_000));
    view.rerender(<ExecutionLogDialog {...props} project={polled} />);
    expect(
      within(screen.getByLabelText("FrontMind Agent 执行计时")).getByText(
        "00:01:30",
      ),
    ).not.toBeNull();
    view.unmount();
    render(<ExecutionLogDialog {...props} project={polled} />);
    expect(
      within(screen.getByLabelText("FrontMind Agent 执行计时")).getByText(
        "00:01:30",
      ),
    ).not.toBeNull();
  });

  it("expands long logs and does not force history back to the bottom on polling", () => {
    const project = createGeoStylePreviewProject();
    project.executionLog = {
      fetchedAt: "2026-09-05T12:01:00.000Z",
      updatedAt: "2026-09-05T12:01:00.000Z",
      entries: [
        {
          id: "long",
          stage: "enterprise_analysis",
          title: "企业分析",
          status: "completed",
          events: Array.from({ length: 35 }, (_, index) => ({
            id: `event-${index}`,
            kind: "model_output" as const,
            message: `公开日志 ${index}`,
          })),
        },
      ],
    };
    const props = {
      open: true,
      project,
      refreshing: false,
      onOpenChange: vi.fn(),
      onRefresh: vi.fn(),
    };
    const view = render(<ExecutionLogDialog {...props} />);
    expect(screen.queryByText("公开日志 0", { exact: true })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "查看较早的 5 条日志" }),
    );
    expect(screen.getByText("公开日志 0", { exact: true })).not.toBeNull();
    const detail = screen.getByRole("log").parentElement!;
    detail.scrollTop = 50;
    const next = structuredClone(project);
    next.executionLog!.entries[0].events.push({
      id: "event-35",
      kind: "model_output",
      message: "公开日志 35",
    });
    view.rerender(<ExecutionLogDialog {...props} project={next} />);
    expect(screen.getByText("公开日志 0", { exact: true })).not.toBeNull();
    expect(detail.scrollTop).toBe(50);
  });

  it("groups both questions, retains manual selection and ticks either running task until its own completion", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T02:05:00.000Z"));
    const project = createGeoStylePreviewProject();
    project.executionLog = {
      fetchedAt: "2026-09-07T02:05:00.000Z",
      updatedAt: "2026-09-07T02:05:00.000Z",
      currentEntryId: "industry-ranking-optimization-forecast",
      entries: [
        {
          id: "optimization-forecast",
          stage: "current_assessment",
          perspective: "product_opinion",
          title: "优化效果评估",
          status: "running",
          startedAt: "2026-09-07T02:00:00.000Z",
          events: [
            {
              id: "product",
              kind: "model_output",
              message: "产品问题正在评估。",
            },
          ],
        },
        {
          id: "industry-ranking-optimization-forecast",
          stage: "current_assessment",
          perspective: "industry_ranking",
          title: "优化效果评估",
          status: "running",
          startedAt: "2026-09-07T02:03:00.000Z",
          events: [
            {
              id: "industry",
              kind: "model_output",
              message: "行业问题正在评估。",
            },
          ],
        },
      ],
    };
    const props = {
      open: true,
      project,
      refreshing: false,
      onOpenChange: vi.fn(),
      onRefresh: vi.fn(),
    };
    const view = render(<ExecutionLogDialog {...props} />);
    const runtime = () =>
      within(screen.getByLabelText("FrontMind Agent 执行计时"));
    expect(runtime().getByText("00:02:00")).not.toBeNull();
    expect(screen.getByRole("log").textContent).toContain("行业问题正在评估。");
    const productGroup = screen.getByRole("region", { name: "产品与舆情" });
    const industryGroup = screen.getByRole("region", {
      name: "行业排名与品牌优胜",
    });
    fireEvent.click(
      within(productGroup).getByRole("button", { name: /优化效果评估/ }),
    );
    act(() => vi.advanceTimersByTime(2_000));
    expect(runtime().getByText("00:05:02")).not.toBeNull();
    expect(screen.getByText("当前环节")).not.toBeNull();
    const next = structuredClone(project);
    next.executionLog!.entries[0].status = "completed";
    next.executionLog!.entries[0].completedAt = "2026-09-07T02:05:01.000Z";
    view.rerender(<ExecutionLogDialog {...props} project={next} />);
    act(() => vi.advanceTimersByTime(3_000));
    expect(runtime().getByText("00:05:01")).not.toBeNull();
    expect(screen.getByRole("log").textContent).toContain("产品问题正在评估。");
    fireEvent.click(
      within(industryGroup).getByRole("button", { name: /优化效果评估/ }),
    );
    expect(runtime().getByText("00:02:05")).not.toBeNull();
    const completed = structuredClone(next);
    completed.executionLog!.currentEntryId = undefined;
    completed.executionLog!.entries[1].status = "completed";
    completed.executionLog!.entries[1].completedAt = "2026-09-07T02:05:04.000Z";
    view.rerender(<ExecutionLogDialog {...props} project={completed} />);
    act(() => vi.advanceTimersByTime(3_000));
    expect(runtime().getByText("00:02:04")).not.toBeNull();
    expect(screen.getByText("历史环节")).not.toBeNull();
  });

  it("never grows a terminal runtime when the server terminal time is missing", () => {
    const fixture = createGeoStylePreviewProject();
    render(
      <ExecutionLogDialog
        open
        project={{
          ...fixture,
          preview: undefined,
          remoteToken: "signed-project-token",
          executionLog: {
            currentEntryId: "question-recommendation",
            fetchedAt: "2026-08-08T15:59:00.000Z",
            updatedAt: "2026-08-08T15:59:00.000Z",
            entries: [
              {
                id: "question-recommendation",
                stage: "question_recommendation",
                title: "GEO 问题推荐",
                status: "failed",
                startedAt: "2026-08-08T12:00:00.000Z",
                events: [],
              },
            ],
          },
        }}
        refreshing={false}
        onOpenChange={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(
      within(screen.getByLabelText("FrontMind Agent 执行计时")).getByText(
        "--:--:--",
      ),
    ).not.toBeNull();
    expect(screen.getByText("历史环节")).not.toBeNull();
  });
});
