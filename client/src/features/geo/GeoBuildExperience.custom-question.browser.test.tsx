// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "@/contexts/LanguageContext";
import { GeoApiError } from "./api";
import GeoBuildExperience, {
  QuestionRecommendation,
} from "./GeoBuildExperience";
import { createGeoStylePreviewProject } from "./preview";
import type { GeoProject } from "./types";

const storageMocks = vi.hoisted(() => ({
  listGeoProjects: vi.fn(),
  removeGeoProject: vi.fn(),
  requestPersistentGeoStorage: vi.fn(),
}));
const apiMocks = vi.hoisted(() => ({
  deleteGeoProject: vi.fn(),
}));

vi.mock("./storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./storage")>()),
  listGeoProjects: storageMocks.listGeoProjects,
  removeGeoProject: storageMocks.removeGeoProject,
  requestPersistentGeoStorage: storageMocks.requestPersistentGeoStorage,
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  deleteGeoProject: apiMocks.deleteGeoProject,
}));

beforeEach(() => {
  storageMocks.listGeoProjects.mockReset().mockResolvedValue([]);
  storageMocks.removeGeoProject.mockReset().mockResolvedValue(undefined);
  storageMocks.requestPersistentGeoStorage.mockReset().mockResolvedValue(false);
  apiMocks.deleteGeoProject.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("custom GEO question validation", () => {
  it("keeps the confirmed delete available when custom-question recovery is stale", async () => {
    const project: GeoProject = {
      id: "project-stale-custom-question",
      remoteToken: "signed-project-token",
      title: "FrontMind",
      input: "FrontMind",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      stage: "enterprise_analysis",
      status: "failed",
      progress: 100,
      files: [],
      questions: [],
      selectedPlatformIds: [],
    };
    storageMocks.listGeoProjects.mockResolvedValue([project]);
    localStorage.setItem(
      `frontmind-geo-custom-question-validation:${project.id}`,
      JSON.stringify({
        projectId: project.id,
        clientRequestId: "47474747-4747-4747-8747-474747474747",
        question: "FrontMind是什么企业？",
        updatedAt: "2026-08-01T00:00:00.000Z",
      }),
    );

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /继续项目：FrontMind/ }),
    );
    const projectSwitcher = document.querySelector<HTMLButtonElement>(
      ".geo-project-switcher > button",
    );
    expect(projectSwitcher).not.toBeNull();
    fireEvent.click(projectSwitcher!);
    fireEvent.click(
      await screen.findByRole("button", { name: "删除 FrontMind" }),
    );

    expect(
      await screen.findByRole("heading", { name: "删除项目记录？" }),
    ).toBeTruthy();
    expect(screen.queryByText(/仍在验证或等待持久化/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "删除项目" }));
    await waitFor(() => {
      expect(apiMocks.deleteGeoProject).toHaveBeenCalledWith(project);
      expect(storageMocks.removeGeoProject).toHaveBeenCalledWith(project.id);
    });
    expect(
      localStorage.getItem(
        `frontmind-geo-custom-question-validation:${project.id}`,
      ),
    ).toBeNull();
  });

  it("shows an enterprise-unrelated rejection as an input error instead of a recoverable rate limit", async () => {
    const message =
      "该问题与「硅基流动」没有明确关系，请重新输入与当前企业相关的非行业排名类问题。";
    const onCreateCustom = vi.fn(async () => {
      throw new GeoApiError(
        message,
        422,
        "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
        {
          validation: {
            clientRequestId: "47474747-4747-4747-8747-474747474747",
            question: "FrontMind是什么企业？",
            state: "rejected",
            error: { retryable: false },
          },
        },
      );
    });

    render(
      <QuestionRecommendation
        project={createGeoStylePreviewProject()}
        selectionLocked={false}
        onSelect={vi.fn()}
        onCreateCustom={onCreateCustom}
        onContact={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("自定义优化问题") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "FrontMind是什么企业？" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(onCreateCustom).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).not.toContain("操作过于频繁");
    expect(alert.textContent).not.toContain("恢复同一验证");

    const blockedButton = screen.getByRole("button", { name: /请修改问题/ });
    expect((blockedButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "硅基流动是什么企业？" } });
    const retryButton = screen.getByRole("button", { name: /验证并继续/ });
    expect((retryButton as HTMLButtonElement).disabled).toBe(false);
  });
});
