// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MonitoringConfirmDialog, MonitoringSetup } from "./GeoBuildExperience";
import { createGeoStylePreviewProject } from "./preview";
import type { GeoProject } from "./types";

const baseProject: GeoProject = {
  id: "monitoring-edition-project",
  remoteToken: "signed-project-token",
  title: "示例企业",
  input: "示例企业",
  createdAt: "2026-08-07T00:00:00.000Z",
  updatedAt: "2026-08-07T00:00:00.000Z",
  stage: "monitoring",
  status: "ready",
  progress: 100,
  files: [],
  questions: [
    {
      id: "question-01",
      category: "reputation",
      question: "示例企业值得信赖吗？",
      questionEnglish: "Is Example Company trustworthy?",
      selectable: true,
    },
  ],
  selectedQuestionId: "question-01",
  selectedPlatformIds: ["doubao"],
};

function renderSetup(
  project: GeoProject,
  onChangeEdition = vi.fn(),
  onStartMonitoring = vi.fn(),
) {
  render(
    <MonitoringSetup
      project={project}
      onChangeEdition={onChangeEdition}
      onTogglePlatform={vi.fn()}
      onBack={vi.fn()}
      onStartMonitoring={onStartMonitoring}
      locked={false}
    />,
  );
  return { onChangeEdition, onStartMonitoring };
}

afterEach(cleanup);

describe("GEO monitoring edition setup", () => {
  it("defaults historical projects to the domestic platform set", () => {
    renderSetup(baseProject);

    expect(
      screen
        .getByRole("button", { name: "国内版" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: /豆包/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ChatGPT/ })).toBeNull();
    expect(screen.queryByText("Is Example Company trustworthy?")).toBeNull();
  });

  it("shows only ChatGPT and the answer total overseas without exposing the translation", () => {
    renderSetup({
      ...baseProject,
      monitoringEdition: "overseas",
      selectedPlatformIds: ["chatgpt"],
    });

    const chatgptButton = screen.getByRole("button", { name: /ChatGPT/ });
    expect(chatgptButton).toBeTruthy();
    expect(chatgptButton.querySelector("img")?.getAttribute("src")).toBe(
      "/geo-builder/platforms/chatgpt.png",
    );
    expect(screen.queryByRole("button", { name: /豆包/ })).toBeNull();
    expect(screen.queryByText("Is Example Company trustworthy?")).toBeNull();
    expect(
      screen.getByText(
        "每个平台将独立获取 5 次回答，用于建立当前问题的可见度与内容基线。",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("可选择国内版或海外版进行监控及后续服务"),
    ).toBeTruthy();
    expect(screen.queryByText(/¥|支付/)).toBeNull();
    expect(screen.getByText("本次监控")).toBeTruthy();
    expect(screen.getByText("1 类问题 · 1 个平台 · 5 次回答")).toBeTruthy();
    expect(screen.queryByText("免费获取")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "获取监控答案",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("allows overseas monitoring when the stored English translation is missing", () => {
    const { onStartMonitoring } = renderSetup({
      ...baseProject,
      monitoringEdition: "overseas",
      questions: [{ ...baseProject.questions[0], questionEnglish: undefined }],
      selectedPlatformIds: ["chatgpt"],
    });

    expect(screen.queryByText(/英文翻译/)).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "获取监控答案",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "获取监控答案" }));
    expect(onStartMonitoring).toHaveBeenCalledOnce();
  });

  it("requests the edition change from the switch", () => {
    const { onChangeEdition } = renderSetup(baseProject);

    fireEvent.click(screen.getByRole("button", { name: "海外版" }));
    expect(onChangeEdition).toHaveBeenCalledWith("overseas");
  });

  it("shows compact domestic sampling controls with screenshots enabled in preview", () => {
    const onToggleScreenshot = vi.fn();
    render(
      <MonitoringSetup
        project={createGeoStylePreviewProject("monitoring-setup")}
        onChangeEdition={vi.fn()}
        onChangeRegion={vi.fn()}
        onToggleScreenshot={onToggleScreenshot}
        onTogglePlatform={vi.fn()}
        onBack={vi.fn()}
        onStartMonitoring={vi.fn()}
        locked={false}
      />,
    );

    expect(screen.getByText("采集城市/地区")).toBeTruthy();
    expect(
      screen.queryByText("接口当前提供省级区域，以实时可用列表为准"),
    ).toBeNull();
    expect(
      screen.queryByText("截图按需打开；部分平台或节点可能不返回截图"),
    ).toBeNull();
    const screenshotSwitch = screen.getByRole("switch", {
      name: "采集并展示原始页面截图",
    }) as HTMLButtonElement;
    expect(screenshotSwitch.getAttribute("data-state")).toBe("checked");
    expect(
      screen.getByText(
        "两类问题各按每个平台 5 次采样，共享同一时间窗口与采样范围。",
      ),
    ).toBeTruthy();
    expect(screen.getByText("2 类问题 · 1 个平台 · 10 次回答")).toBeTruthy();
    fireEvent.click(screenshotSwitch);
    expect(onToggleScreenshot).toHaveBeenCalledWith(false);
  });

  it("confirms both preview questions as one shared monitoring scope", () => {
    render(
      <MonitoringConfirmDialog
        open
        project={createGeoStylePreviewProject("monitoring-setup")}
        starting={false}
        error=""
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("华润医药的渠道服务与公开口碑如何？")).toBeTruthy();
    expect(screen.getByText("国内医药流通企业应该如何选择？")).toBeTruthy();
    expect(screen.getByText("10 次")).toBeTruthy();
    expect(
      screen.getByText(
        "确认两类问题、监控版本和平台范围后，即可分别获取并留存回答。",
      ),
    ).toBeTruthy();
  });

  it("keeps shared settings locked while allowing an incomplete dual start to resume", () => {
    const fixture = createGeoStylePreviewProject("monitoring-setup");
    const onStartMonitoring = vi.fn();
    render(
      <MonitoringSetup
        project={{
          ...fixture,
          preview: undefined,
          monitoring: {
            runId: "product-run",
            status: "capturing",
            platforms: ["deepseek"],
            expectedRecords: 5,
            completedRecords: 1,
            failedRecords: 0,
            answers: [],
          },
          industryRankingMonitoring: undefined,
          monitoringRecovery: {
            schemaVersion: 2,
            clientRequestId: "same-dual-start-request",
            questionId: fixture.selectedQuestionId!,
            industryRankingQuestionId:
              fixture.selectedIndustryRankingQuestionId,
            monitoringEdition: "domestic",
            screenshotEnabled: true,
            platformIds: ["deepseek"],
          },
        }}
        onChangeEdition={vi.fn()}
        onChangeRegion={vi.fn()}
        onToggleScreenshot={vi.fn()}
        onTogglePlatform={vi.fn()}
        onBack={vi.fn()}
        onStartMonitoring={onStartMonitoring}
        locked
      />,
    );

    const resume = screen.getByRole("button", {
      name: "继续启动剩余问题",
    }) as HTMLButtonElement;
    expect(resume.disabled).toBe(false);
    expect(
      (screen.getByRole("button", { name: "国内版" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(resume);
    expect(onStartMonitoring).toHaveBeenCalledOnce();
  });

  it("confirms the monitoring scope without exposing any payment action", () => {
    const onConfirm = vi.fn();
    render(
      <MonitoringConfirmDialog
        open
        project={{
          ...baseProject,
          selectedPlatformIds: ["doubao", "kimi"],
        }}
        starting={false}
        error=""
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("国内版")).toBeTruthy();
    expect(screen.getByText("豆包、Kimi")).toBeTruthy();
    expect(screen.getByText("示例企业")).toBeTruthy();
    expect(screen.getByText("默认随机地点")).toBeTruthy();
    expect(screen.getByText("关闭")).toBeTruthy();
    expect(screen.getByText("10 次")).toBeTruthy();
    expect(
      screen.getByText(
        "确认当前问题、监控版本和平台范围后，即可获取并留存本次回答。",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/免费|付款订单|支付方式|确认并支付/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /确认并获取监控答案/ }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

});
