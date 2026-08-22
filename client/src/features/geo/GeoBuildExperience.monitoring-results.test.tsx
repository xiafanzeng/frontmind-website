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
