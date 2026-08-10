// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MonitoringSetup } from "./GeoBuildExperience";
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
) {
  render(
    <MonitoringSetup
      project={project}
      onChangeEdition={onChangeEdition}
      onTogglePlatform={vi.fn()}
      onBack={vi.fn()}
      onCheckout={onCheckout}
      paymentPending={false}
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

  it("shows only ChatGPT and the five-yuan total overseas without exposing the translation", () => {
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
    expect(screen.getAllByText("¥5")).toHaveLength(2);
    expect(screen.getByText("ChatGPT · 5 次回答")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "确认并支付",
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
          name: "确认并支付",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "确认并支付" }));
    expect(onCheckout).toHaveBeenCalledOnce();
  });

  it("requests the edition change from the switch", () => {
    const { onChangeEdition } = renderSetup(baseProject);

    fireEvent.click(screen.getByRole("button", { name: "海外版" }));
    expect(onChangeEdition).toHaveBeenCalledWith("overseas");
  });
});
