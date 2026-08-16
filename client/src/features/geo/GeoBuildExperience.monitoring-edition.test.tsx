// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MonitoringConfirmDialog, MonitoringSetup } from "./GeoBuildExperience";
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
  onCheckout = vi.fn(),
  paymentPending = false,
) {
  render(
    <MonitoringSetup
      project={project}
      onChangeEdition={onChangeEdition}
      onTogglePlatform={vi.fn()}
      onBack={vi.fn()}
      onCheckout={onCheckout}
      paymentPending={paymentPending}
      locked={false}
    />,
  );
  return { onChangeEdition, onCheckout };
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
    expect(screen.getByText("1 个平台 · 5 次回答")).toBeTruthy();
    expect(screen.queryByText("免费获取")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "获取监控答案",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("allows overseas checkout when the stored English translation is missing", () => {
    const { onCheckout } = renderSetup({
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
    expect(onCheckout).toHaveBeenCalledOnce();
  });

  it("requests the edition change from the switch", () => {
    const { onChangeEdition } = renderSetup(baseProject);

    fireEvent.click(screen.getByRole("button", { name: "海外版" }));
    expect(onChangeEdition).toHaveBeenCalledWith("overseas");
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

  it("describes legacy monitoring continuation without order internals", () => {
    render(
      <MonitoringConfirmDialog
        open
        project={baseProject}
        legacyPending={{
          kind: "monitoring",
          projectId: baseProject.id,
          projectToken: baseProject.remoteToken,
          questionId: "question-01",
          monitoringEdition: "domestic",
          platformIds: ["doubao"],
          checkout: {
            authorization: "legacy-monitoring-authorization",
            orderId: "legacy-monitoring-order",
            amountFen: 0,
            unitPriceFen: 0,
            answersPerPlatform: 5,
            expiresAt: "2026-08-07T01:00:00.000Z",
            action: "https://zpayz.cn/submit.php",
            method: "POST",
            fields: {},
          },
          status: "pending",
        }}
        starting={false}
        error=""
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "检测到此前未完成的监控确认，系统会先核对当前状态后继续。",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/免费|付款订单|权威核对|旧状态/)).toBeNull();
  });

  it("uses a customer-facing continuation hint for an existing monitoring record", () => {
    renderSetup(baseProject, vi.fn(), vi.fn(), true);

    expect(
      screen
        .getByRole("button", { name: "获取监控答案" })
        .getAttribute("title"),
    ).toBe("核对此前监控状态并继续");
  });
});
