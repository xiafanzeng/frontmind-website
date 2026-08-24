// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MonitoringResults } from "./GeoBuildExperience";
import { createGeoStylePreviewProject } from "./preview";

afterEach(cleanup);

function renderResults() {
  return render(
    <MonitoringResults
      project={createGeoStylePreviewProject("monitoring")}
      onRefresh={vi.fn(async () => undefined)}
      refreshing={false}
      onContact={vi.fn()}
    />,
  );
}

describe("monitoring result interaction", () => {
  it("shows failed polling slots as automatic recovery and counts only valid answers", () => {
    const project = createGeoStylePreviewProject("monitoring");
    const monitoring = project.monitoring!;
    project.monitoring = {
      ...monitoring,
      status: "capturing",
      completedRecords: 3,
      failedRecords: 2,
      quality: undefined,
      answers: monitoring.answers.map((answer, index) =>
        index < 3
          ? answer
          : {
              ...answer,
              status: "failed",
              answer: "",
              error: "本轮采样暂未返回",
            },
      ),
    };

    render(
      <MonitoringResults
        project={project}
        onRefresh={vi.fn(async () => undefined)}
        refreshing={false}
        onContact={vi.fn()}
      />,
    );

    expect(screen.getByText("平台回答正在自动补齐采样")).toBeTruthy();
    expect(screen.getByText("自动补采中")).toBeTruthy();
    expect(screen.getByText("3 / 5 条有效回答")).toBeTruthy();
    expect(screen.getByText("3 条有效回答 · 2 条正在自动补齐")).toBeTruthy();
    expect(screen.queryByText(/已停止自动评估/)).toBeNull();
  });

  it("continues assessment for terminal 3/5 but fails closed below the threshold", () => {
    const project = createGeoStylePreviewProject("monitoring");
    const monitoring = project.monitoring!;
    const partialAnswers = monitoring.answers.map((answer, index) =>
      index < 3
        ? answer
        : {
            ...answer,
            status: "failed" as const,
            answer: "",
            error: "本轮采样未完成",
          },
    );
    project.monitoring = {
      ...monitoring,
      status: "partial_review",
      completedRecords: 3,
      failedRecords: 2,
      quality: {
        completeness: "partial",
        downstreamEligible: true,
      },
      answers: partialAnswers,
    };
    const view = render(
      <MonitoringResults
        project={project}
        onRefresh={vi.fn(async () => undefined)}
        refreshing={false}
        onContact={vi.fn()}
      />,
    );

    expect(screen.getByText("补采结束，已基于实际样本继续评估")).toBeTruthy();
    expect(
      screen.getByText(
        "本次共获得 3/5 条有效回答，现状评估会保留实际样本覆盖度。",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "联系技术支持" })).toBeNull();

    project.monitoring = {
      ...project.monitoring,
      completedRecords: 2,
      failedRecords: 3,
      answers: partialAnswers.map((answer, index) =>
        index < 2 ? answer : { ...answer, status: "failed", answer: "" },
      ),
    };
    view.rerender(
      <MonitoringResults
        project={project}
        onRefresh={vi.fn(async () => undefined)}
        refreshing={false}
        onContact={vi.fn()}
      />,
    );
    expect(screen.getByText("本次有效样本不足，无法生成可靠评估")).toBeTruthy();
    expect(screen.getByRole("button", { name: "联系技术支持" })).toBeTruthy();
  });

  it("mounts one of five slots and keeps the failed slot selectable", () => {
    const view = renderResults();
    const previous = screen.getByRole("button", {
      name: "查看DeepSeek上一次回答",
    }) as HTMLButtonElement;
    const next = screen.getByRole("button", {
      name: "查看DeepSeek下一次回答",
    }) as HTMLButtonElement;

    expect(previous.disabled).toBe(true);
    expect(screen.getByText("第 1 / 5 次")).toBeTruthy();
    expect(
      view.container.querySelectorAll(
        ".geo-answer-current .geo-answer-markdown",
      ),
    ).toHaveLength(1);

    fireEvent.click(next);
    expect(screen.getByText("第 2 / 5 次")).toBeTruthy();
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);

    expect(screen.getByText("第 5 / 5 次")).toBeTruthy();
    expect(next.disabled).toBe(true);
    expect(screen.getByText("本轮采样未完成")).toBeTruthy();
    expect(
      screen.getByText("本轮采样未返回可用回答，请结合其余四次结果查看。"),
    ).toBeTruthy();
    expect(
      view.container.querySelector(".geo-answer-current .geo-answer-markdown"),
    ).toBeNull();
  });

  it("preserves a separate active answer round for each perspective", () => {
    renderResults();
    const next = () =>
      screen.getByRole("button", {
        name: "查看DeepSeek下一次回答",
      });

    fireEvent.click(next());
    expect(screen.getByText("第 2 / 5 次")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /行业排名与品牌优胜/ }));
    expect(screen.getByText("第 1 / 5 次")).toBeTruthy();
    fireEvent.click(next());
    fireEvent.click(next());
    expect(screen.getByText("第 3 / 5 次")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /产品与舆情/ }));
    expect(screen.getByText("第 2 / 5 次")).toBeTruthy();
  });

  it("keeps product answers free of brand metrics and shows them only in ranking", () => {
    const view = renderResults();

    expect(screen.getByText("完整参考来源")).toBeTruthy();
    expect(screen.getAllByText("正文引用")).toHaveLength(3);
    expect(screen.queryByText("本轮检索词")).toBeNull();
    expect(screen.queryByText("推荐追问")).toBeNull();
    expect(
      view.container.querySelector(".geo-answer-brand-analysis"),
    ).toBeNull();
    expect(view.container.querySelector(".geo-answer-auxiliary")).toBeNull();
    expect(screen.queryByText("华润医药在本轮回答中的表现")).toBeNull();
    expect(screen.queryByText("本品提及")).toBeNull();
    expect(screen.queryByText("类目位置")).toBeNull();
    expect(
      screen.queryByText(
        "华润医药具备综合医药商业能力、较广渠道覆盖和大型客户服务经验。",
      ),
    ).toBeNull();
    expect(screen.getByText("引用分析")).toBeTruthy();
    expect(screen.getByText("渠道引用")).toBeTruthy();
    expect(screen.getByText("内容引用")).toBeTruthy();
    expect(screen.getByText("情感倾向")).toBeTruthy();
    expect(screen.getByText("评价词")).toBeTruthy();
    expect(
      screen.getByText("情感倾向").closest(".geo-insight-analysis-grid"),
    ).toBe(screen.getByText("评价词").closest(".geo-insight-analysis-grid"));
    expect(screen.queryByText("本品表现")).toBeNull();
    expect(screen.queryByText(/最佳第 \d+ 名/)).toBeNull();
    expect(screen.queryByText(/次观测/)).toBeNull();
    expect(screen.getAllByText("4/5 条有效回答")).toHaveLength(2);
    expect(screen.getByText("北京市")).toBeTruthy();
    expect(screen.getByText("页面截图已开启")).toBeTruthy();
    const screenshotEntry = view.container.querySelector(
      ".geo-answer-screenshot-entry",
    );
    const markdown = view.container.querySelector(".geo-answer-markdown");
    expect(
      screenshotEntry?.compareDocumentPosition(markdown as Node) ?? 0,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    fireEvent.click(screen.getByRole("tab", { name: /行业排名与品牌优胜/ }));
    expect(screen.getByText("本品表现")).toBeTruthy();
    expect(screen.getByText("每项指标使用自身有值回答作为分母")).toBeTruthy();
    expect(screen.queryByText("华润医药渠道服务与公开口碑观察")).toBeNull();
    expect(screen.getByText("国内医药流通企业选择建议")).toBeTruthy();
    expect(view.container.querySelectorAll('[role="tabpanel"]')).toHaveLength(
      1,
    );
  });

  it("does not mount the screenshot image until the dialog opens", () => {
    renderResults();
    const alt = "DeepSeek第 1 次回答页面截图";

    expect(screen.queryByAltText(alt)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看页面截图" }));
    const screenshot = screen.getByAltText(alt) as HTMLImageElement;
    expect(screenshot).toBeTruthy();
    Object.defineProperties(screenshot, {
      naturalWidth: { configurable: true, value: 1200 },
      naturalHeight: { configurable: true, value: 2400 },
    });
    fireEvent.load(screenshot);
    fireEvent.click(screen.getByRole("button", { name: "100%" }));
    expect(screenshot.style.width).toBe("1200px");
    fireEvent.click(screen.getByRole("button", { name: "放大截图" }));
    expect(screenshot.style.width).toBe("1500px");
    expect(
      document.querySelector(".geo-monitor-screenshot-overlay"),
    ).toBeTruthy();
    expect(
      document.querySelector(".geo-monitor-screenshot-dialog"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByAltText(alt)).toBeNull();
  });
});
