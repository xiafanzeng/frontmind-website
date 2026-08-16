// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "@/contexts/LanguageContext";
import { GeoApiError } from "./api";
import type { GeoUploadProgress } from "./api";
import GeoBuildExperience, {
  EnterpriseAnalysis,
  QuestionRecommendation,
} from "./GeoBuildExperience";
import { createGeoDraftProject } from "./draft";
import { createGeoStylePreviewProject } from "./preview";
import type { GeoProject } from "./types";

const storageMocks = vi.hoisted(() => ({
  listGeoProjects: vi.fn(),
  removeGeoProject: vi.fn(),
  requestPersistentGeoStorage: vi.fn(),
}));
const apiMocks = vi.hoisted(() => ({
  createGeoProject: vi.fn(),
  deleteGeoProject: vi.fn(),
  verifyGeoInvitation: vi.fn(),
  startGeoOptimizationForecast: vi.fn(),
}));

vi.mock("./storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./storage")>()),
  listGeoProjects: storageMocks.listGeoProjects,
  removeGeoProject: storageMocks.removeGeoProject,
  requestPersistentGeoStorage: storageMocks.requestPersistentGeoStorage,
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  createGeoProject: apiMocks.createGeoProject,
  deleteGeoProject: apiMocks.deleteGeoProject,
  verifyGeoInvitation: apiMocks.verifyGeoInvitation,
  startGeoOptimizationForecast: apiMocks.startGeoOptimizationForecast,
}));

beforeEach(() => {
  storageMocks.listGeoProjects.mockReset().mockResolvedValue([]);
  storageMocks.removeGeoProject.mockReset().mockResolvedValue(undefined);
  storageMocks.requestPersistentGeoStorage.mockReset().mockResolvedValue(false);
  apiMocks.createGeoProject
    .mockReset()
    .mockResolvedValue(createGeoStylePreviewProject());
  apiMocks.deleteGeoProject.mockReset().mockResolvedValue(undefined);
  apiMocks.verifyGeoInvitation.mockReset().mockResolvedValue({
    inviteContextToken: "sealed-invite-context-token-at-least-32-characters",
    businessOwnerName: "Alice 张三",
  });
  apiMocks.startGeoOptimizationForecast.mockReset();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("custom GEO question validation", () => {
  it("labels a draft with upload checkpoints as continue upload", () => {
    render(
      <EnterpriseAnalysis
        project={createGeoDraftProject("Acme", [])}
        onDownload={() => undefined}
        onContact={() => undefined}
        onStart={() => undefined}
        starting={false}
        hasUploadCheckpoint
      />,
    );

    expect(screen.getByRole("button", { name: /继续上传/ })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /开始构建企业知识库/ }),
    ).toBeNull();
  });

  it("does not auto-start a forecast for a display-only partial assessment", async () => {
    const partialProject: GeoProject = {
      id: "project-partial-assessment",
      remoteToken: "signed-project-token",
      title: "FrontMind",
      input: "FrontMind",
      createdAt: "2026-08-16T00:00:00.000Z",
      updatedAt: "2026-08-16T00:00:00.000Z",
      stage: "current_assessment",
      status: "ready",
      progress: 100,
      files: [],
      questions: [],
      selectedPlatformIds: [],
      assessment: {
        status: "ready",
        dimensions: [
          {
            id: "semantic_visibility",
            label: "语义可见度",
            currentFinding: "当前回答已形成基础认知。",
          },
        ],
        comparisons: [],
        quality: {
          completeness: "partial",
          downstreamEligible: false,
        },
      },
    };
    storageMocks.listGeoProjects.mockResolvedValue([partialProject]);

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );

    await screen.findByRole("button", { name: /继续项目：FrontMind/ });
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(apiMocks.startGeoOptimizationForecast).not.toHaveBeenCalled();
  });

  it("requires the business owner in the invite dialog and retains its context for project creation", async () => {
    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );

    fireEvent.change(
      await screen.findByLabelText("企业名称、官网或宣传册说明"),
      { target: { value: "Acme" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /开始构建/ }));

    expect(
      await screen.findByText(
        "企业知识基建目前采用邀请制，资料将在您点击“开始构建企业知识库”后上传。",
      ),
    ).toBeTruthy();
    const ownerInput = await screen.findByLabelText("商务负责人姓名");
    const inviteInput = screen.getByLabelText("邀请码");
    fireEvent.change(inviteInput, { target: { value: "invite-code" } });
    fireEvent.click(screen.getByRole("button", { name: /验证并打开工作台/ }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "请输入有效的商务负责人姓名",
    );
    expect(apiMocks.verifyGeoInvitation).not.toHaveBeenCalled();

    fireEvent.change(ownerInput, { target: { value: "  Ａｌｉｃｅ　张三  " } });
    fireEvent.click(screen.getByRole("button", { name: /验证并打开工作台/ }));
    await waitFor(() =>
      expect(apiMocks.verifyGeoInvitation).toHaveBeenCalledWith(
        "invite-code",
        "Alice 张三",
      ),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /开始构建企业知识库/ }),
    );
    await waitFor(() =>
      expect(apiMocks.createGeoProject).toHaveBeenCalledWith(
        "Acme",
        [],
        expect.objectContaining({
          inviteContextToken:
            "sealed-invite-context-token-at-least-32-characters",
        }),
      ),
    );
  });

  it("uses phase-accurate customer copy for reservation, transfer, reconciliation and confirmation", async () => {
    let reportProgress: ((progress: GeoUploadProgress) => void) | undefined;
    let resolveProject!: (project: GeoProject) => void;
    apiMocks.createGeoProject.mockImplementationOnce(
      (
        _input: string,
        _files: File[],
        options: { onUploadProgress?: (progress: GeoUploadProgress) => void },
      ) => {
        reportProgress = options.onUploadProgress;
        return new Promise<GeoProject>((resolve) => {
          resolveProject = resolve;
        });
      },
    );

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );

    fireEvent.change(
      await screen.findByLabelText("企业名称、官网或宣传册说明"),
      { target: { value: "Acme" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /开始构建/ }));
    fireEvent.change(await screen.findByLabelText("商务负责人姓名"), {
      target: { value: "Alice 张三" },
    });
    fireEvent.change(screen.getByLabelText("邀请码"), {
      target: { value: "invite-code" },
    });
    fireEvent.click(screen.getByRole("button", { name: /验证并打开工作台/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: /开始构建企业知识库/ }),
    );
    await waitFor(() => expect(reportProgress).toBeTypeOf("function"));

    const progress = {
      fileIndex: 3,
      fileCount: 3,
      filename: "company.pdf",
      fileLoadedBytes: 512,
      fileTotalBytes: 1_024,
      batchLoadedBytes: 10 * 1_024 * 1_024,
      batchTotalBytes: 11 * 1_024 * 1_024,
      confirmedFiles: 2,
    } satisfies Omit<GeoUploadProgress, "phase">;

    act(() => reportProgress?.({ ...progress, phase: "reserving" }));
    expect(
      screen.getByText(
        "企业资料上传中：正在为第 3 / 3 份保留上传任务，全部资料 10.0 MB / 11 MB。",
      ),
    ).toBeTruthy();

    act(() => reportProgress?.({ ...progress, phase: "uploading" }));
    expect(
      screen.getByText(
        "企业资料上传中：正在上传第 3 / 3 份：512 B / 1 KB，全部资料 10.0 MB / 11 MB。",
      ),
    ).toBeTruthy();

    act(() =>
      reportProgress?.({
        ...progress,
        phase: "awaiting_dashboard",
        fileLoadedBytes: 1_024,
        batchLoadedBytes: 11 * 1_024 * 1_024,
      }),
    );
    expect(
      screen.getByText(
        "企业资料上传中：第 3 / 3 份已发送，等待服务器确认，全部资料 11 MB / 11 MB。",
      ),
    ).toBeTruthy();

    act(() =>
      reportProgress?.({
        ...progress,
        phase: "reconciling",
        fileLoadedBytes: 1_024,
        batchLoadedBytes: 11 * 1_024 * 1_024,
      }),
    );
    expect(
      screen.getByText(
        "企业资料上传中：第 3 / 3 份传输结果待确认，正在核对服务器回执，全部资料 11 MB / 11 MB。",
      ),
    ).toBeTruthy();

    act(() => reportProgress?.({ ...progress, phase: "retrying" }));
    expect(
      screen.getByText(
        "企业资料上传中：第 3 / 3 份连接中断，正在按原凭证重试，全部资料 10.0 MB / 11 MB。",
      ),
    ).toBeTruthy();

    act(() =>
      reportProgress?.({
        ...progress,
        phase: "confirmed",
        fileLoadedBytes: 1_024,
        batchLoadedBytes: 11 * 1_024 * 1_024,
        confirmedFiles: 3,
      }),
    );
    const completedNotice = screen.getByText(
      "企业资料上传中：第 3 / 3 份已确认，全部资料 11 MB / 11 MB。",
    );
    expect(completedNotice).toBeTruthy();
    expect(completedNotice.textContent).not.toContain("Dashboard");
    expect(completedNotice.textContent).not.toMatch(
      /整体进度|已完成|上传中断|继续处理/,
    );

    await act(async () => resolveProject(createGeoStylePreviewProject()));
  });

  it("explains that prior receipts and the current file survive retry exhaustion", async () => {
    apiMocks.createGeoProject.mockImplementationOnce(
      async (
        _input: string,
        _files: File[],
        options: {
          onUploadsReady?: (files: unknown[]) => void;
          onUploadReservationsReady?: (files: unknown[]) => void;
        },
      ) => {
        const checkpoint = [
          {
            id: "file-1",
            name: "first.pdf",
            size: 1,
            type: "application/pdf",
            uploadToken: "upload-token-1",
            sourceName: "first.pdf",
            sourceLastModified: 1,
          },
          {
            id: "file-2",
            name: "second.pdf",
            size: 1,
            type: "application/pdf",
            uploadToken: "upload-token-2",
            sourceName: "second.pdf",
            sourceLastModified: 2,
          },
        ];
        options.onUploadsReady?.(checkpoint);
        options.onUploadReservationsReady?.(checkpoint);
        throw new GeoApiError(
          "当前文件自动重试 3 次仍未上传完成；文件和上传凭证已保留，请直接继续上传。",
          503,
          "UPLOAD_RETRY_EXHAUSTED",
        );
      },
    );

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );
    fireEvent.change(
      await screen.findByLabelText("企业名称、官网或宣传册说明"),
      { target: { value: "Acme" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /开始构建/ }));
    fireEvent.change(await screen.findByLabelText("商务负责人姓名"), {
      target: { value: "Alice 张三" },
    });
    fireEvent.change(screen.getByLabelText("邀请码"), {
      target: { value: "invite-code" },
    });
    fireEvent.click(screen.getByRole("button", { name: /验证并打开工作台/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: /开始构建企业知识库/ }),
    );

    expect(
      await screen.findByText(/前 2 份已保留，只重试当前文件/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /继续上传/ })).toBeTruthy();
    expect(screen.queryByText(/企业分析尚未启动/)).toBeNull();
  });

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
      serviceActivation: {
        status: "account_setup_required",
        questionId: "question-01",
        category: "product_scenario",
        amountFen: 150_000,
        billingMonths: 1,
        contractWorkflowReference: "manual-order-still-opening",
      },
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
      await screen.findByRole("heading", { name: "从当前浏览器移除项目？" }),
    ).toBeTruthy();
    expect(screen.queryByText(/仍在验证或等待持久化/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "从本机移除" }));
    await waitFor(() => {
      expect(apiMocks.deleteGeoProject).not.toHaveBeenCalled();
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
