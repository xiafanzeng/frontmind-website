// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "@/contexts/LanguageContext";
import GeoBuildExperience, {
  clearGeoStorageNoticeIfMatching,
  isHistoricalRankingOnlyProject,
} from "./GeoBuildExperience";
import { GeoApiError } from "./api";
import type { GeoProject } from "./types";

const apiMocks = vi.hoisted(() => ({
  getGeoProject: vi.fn(),
  startGeoCurrentAssessment: vi.fn(),
  retryIndustryRankingAssessment: vi.fn(),
}));
const storageMocks = vi.hoisted(() => ({
  listGeoProjects: vi.fn(),
  requestPersistentGeoStorage: vi.fn(),
  saveGeoProjectObservationIfCurrent: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  getGeoProject: apiMocks.getGeoProject,
  startGeoCurrentAssessment: apiMocks.startGeoCurrentAssessment,
  retryIndustryRankingAssessment: apiMocks.retryIndustryRankingAssessment,
}));

vi.mock("./storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./storage")>()),
  listGeoProjects: storageMocks.listGeoProjects,
  requestPersistentGeoStorage: storageMocks.requestPersistentGeoStorage,
  saveGeoProjectObservationIfCurrent:
    storageMocks.saveGeoProjectObservationIfCurrent,
}));

function monitoringProject(overrides: Partial<GeoProject> = {}): GeoProject {
  return {
    id: "dual-lifecycle-project",
    remoteToken: "signed-project-token",
    title: "示例企业",
    input: "示例企业",
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
    stage: "monitoring",
    status: "ready",
    progress: 100,
    files: [],
    questions: [
      {
        id: "product-question",
        category: "reputation",
        question: "示例企业靠谱吗？",
        selectable: true,
      },
      {
        id: "industry-question",
        category: "industry_ranking",
        question: "该行业有哪些值得关注的企业？",
        selectable: true,
      },
    ],
    selectedQuestionId: "product-question",
    selectedIndustryRankingQuestionId: "industry-question",
    monitoringEdition: "domestic",
    selectedPlatformIds: ["deepseek"],
    monitoring: {
      runId: "product-run",
      status: "capturing",
      platforms: ["deepseek"],
      expectedRecords: 5,
      completedRecords: 1,
      failedRecords: 0,
      answers: [],
    },
    industryRankingMonitoring: {
      runId: "industry-run",
      status: "capturing",
      platforms: ["deepseek"],
      expectedRecords: 5,
      completedRecords: 1,
      failedRecords: 0,
      answers: [],
    },
    ...overrides,
  };
}

function completedAnswers(runId: string) {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `${runId}-answer-${index + 1}`,
    platformId: "deepseek" as const,
    runIndex: index + 1,
    status: "completed" as const,
    answer: `有效回答 ${index + 1}`,
    media: [],
    sources: [],
    citations: [],
    references: [],
  }));
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderExperience() {
  return render(
    <LanguageProvider initialLang="zh">
      <GeoBuildExperience />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  localStorage.clear();
  apiMocks.getGeoProject.mockReset();
  apiMocks.startGeoCurrentAssessment.mockReset();
  apiMocks.retryIndustryRankingAssessment.mockReset();
  storageMocks.listGeoProjects.mockReset().mockResolvedValue([]);
  storageMocks.requestPersistentGeoStorage.mockReset().mockResolvedValue(false);
  storageMocks.saveGeoProjectObservationIfCurrent
    .mockReset()
    .mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GEO notice lifecycle and independent assessment starts", () => {
  it("routes a historical ranking-only project through its existing primary task chain", () => {
    const project = monitoringProject({
      selectedQuestionId: "industry-question",
      selectedIndustryRankingQuestionId: undefined,
      industryRankingMonitoring: undefined,
    });

    expect(isHistoricalRankingOnlyProject(project)).toBe(true);
    expect(
      isHistoricalRankingOnlyProject({
        ...project,
        industryRankingMonitoring: {
          runId: "industry-run",
          status: "capturing",
          platforms: ["deepseek"],
          expectedRecords: 5,
          completedRecords: 1,
          failedRecords: 0,
          answers: [],
        },
      }),
    ).toBe(false);
  });

  it("expires one automatic-refresh warning after 60 seconds without retry spam extending it", async () => {
    vi.useFakeTimers();
    const project = monitoringProject();
    storageMocks.listGeoProjects.mockResolvedValue([project]);
    apiMocks.getGeoProject.mockRejectedValue(
      new GeoApiError("服务暂时不可用，请稍后重试。", 503, "UPSTREAM_ERROR"),
    );
    renderExperience();
    await flushEffects();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.queryByText(/项目状态暂时无法更新/)).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByText(/项目状态暂时无法更新/)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(screen.getByText(/项目状态暂时无法更新/)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByText(/项目状态暂时无法更新/)).toBeNull();
    expect(apiMocks.getGeoProject.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("clears its own refresh warning immediately after the next successful poll", async () => {
    vi.useFakeTimers();
    const project = monitoringProject();
    storageMocks.listGeoProjects.mockResolvedValue([project]);
    apiMocks.getGeoProject
      .mockRejectedValueOnce(
        new GeoApiError("服务暂时不可用。", 503, "UPSTREAM_ERROR"),
      )
      .mockRejectedValueOnce(
        new GeoApiError("服务暂时不可用。", 503, "UPSTREAM_ERROR"),
      )
      .mockResolvedValue({
        ...project,
        updatedAt: "2026-08-22T00:01:30.000Z",
      });
    renderExperience();
    await flushEffects();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText(/项目状态暂时无法更新/)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.queryByText(/项目状态暂时无法更新/)).toBeNull();
  });

  it("never clears a different notice when an automatic-refresh warning recovers", () => {
    expect(
      clearGeoStorageNoticeIfMatching(
        "合同确认仍待处理。",
        "项目状态暂时无法更新。",
      ),
    ).toBe("合同确认仍待处理。");
    expect(
      clearGeoStorageNoticeIfMatching(
        "项目状态暂时无法更新。",
        "项目状态暂时无法更新。",
      ),
    ).toBe("");
  });

  it("starts the industry assessment even while the product assessment is not started", async () => {
    const project = monitoringProject({
      monitoring: {
        runId: "product-run",
        status: "completed",
        platforms: ["deepseek"],
        expectedRecords: 5,
        completedRecords: 5,
        failedRecords: 0,
        answers: completedAnswers("product-run"),
      },
      industryRankingMonitoring: {
        runId: "industry-run",
        status: "completed",
        platforms: ["deepseek"],
        expectedRecords: 5,
        completedRecords: 5,
        failedRecords: 0,
        answers: completedAnswers("industry-run"),
      },
      assessment: {
        status: "not_started",
        dimensions: [],
        comparisons: [],
      },
      industryRankingAssessment: undefined,
    });
    storageMocks.listGeoProjects.mockResolvedValue([project]);
    apiMocks.startGeoCurrentAssessment.mockImplementation(
      () => new Promise<GeoProject>(() => undefined),
    );
    apiMocks.retryIndustryRankingAssessment.mockImplementation(
      () => new Promise<GeoProject>(() => undefined),
    );
    renderExperience();

    await waitFor(() => {
      expect(apiMocks.startGeoCurrentAssessment).toHaveBeenCalledWith(project);
      expect(apiMocks.retryIndustryRankingAssessment).toHaveBeenCalledWith(
        project,
      );
    });
  });

  it("does not start either assessment while five visible answers are still polling", async () => {
    const project = monitoringProject({
      monitoring: {
        runId: "product-run",
        status: "capturing",
        platforms: ["deepseek"],
        expectedRecords: 5,
        completedRecords: 5,
        failedRecords: 0,
        answers: completedAnswers("product-run"),
      },
      industryRankingMonitoring: {
        runId: "industry-run",
        status: "capturing",
        platforms: ["deepseek"],
        expectedRecords: 5,
        completedRecords: 5,
        failedRecords: 0,
        answers: completedAnswers("industry-run"),
      },
      assessment: {
        status: "not_started",
        dimensions: [],
        comparisons: [],
      },
      industryRankingAssessment: undefined,
    });
    storageMocks.listGeoProjects.mockResolvedValue([project]);

    renderExperience();
    await screen.findByRole("button", { name: /继续项目：示例企业/ });
    await flushEffects();

    expect(apiMocks.startGeoCurrentAssessment).not.toHaveBeenCalled();
    expect(apiMocks.retryIndustryRankingAssessment).not.toHaveBeenCalled();
  });
});
