import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgeGeoCustomQuestionCommitted,
  confirmGeoServiceBankTransfer,
  createGeoProject,
  createGeoCustomQuestion,
  createGeoPaymentCheckout,
  createGeoServiceAccount,
  createGeoServicePaymentCheckout,
  deleteGeoProject,
  downloadGeoArchive,
  getGeoPaymentStatus,
  getGeoServiceProvisioningStatus,
  getGeoServicePaymentStatus,
  normalizeGeoProject,
  persistGeoCustomQuestionResultAndAcknowledge,
  readPendingGeoCustomQuestionValidation,
  retryGeoCustomQuestionValidation,
  retryableGeoCustomQuestionValidation,
  resumeGeoCustomQuestionValidation,
  startGeoCurrentAssessment,
  startGeoMonitoring,
  startGeoOptimizationForecast,
  startGeoService,
  submitGeoServiceContractProfile,
  switchGeoPaymentCheckout,
  switchGeoServicePaymentCheckout,
  uploadGeoFile,
  verifyGeoInvitation,
} from "./api";
import type { GeoUploadedFile } from "./api";
import type { GeoProject } from "./types";

const categories = [
  "reputation",
  "product_scenario",
  "industry_ranking",
  "competitor_comparison",
] as const;

describe("normalizeGeoProject", () => {
  it("normalizes the full project contract and locks ranking questions", () => {
    const questions = categories.flatMap((category) =>
      Array.from({ length: 5 }, (_, index) => ({
        id: `${category}-${index + 1}`,
        category,
        question: `${category} question ${index + 1}`,
        selectable: true,
      })),
    );
    const project = normalizeGeoProject({
      projectToken: "signed-token",
      project: {
        id: "project-1",
        companyName: "示例企业",
        status: "completed",
        kbTask: { status: "completed", progress: 100 },
        questionTask: { status: "completed", progress: 100 },
        archive: {
          filename: "示例企业.zip",
          downloadUrl: "/api/geo/projects/signed-token/archive",
        },
        knowledgeBase: {
          summary: "企业知识库摘要",
          metrics: { pages: 72, sources: 118 },
          sections: [{ id: "profile", title: "企业身份", status: "verified" }],
          assets: [
            {
              id: "logo",
              name: "品牌标识.svg",
              branch_id: "profile",
              previewUrl: "/brand/frontmind-logo.svg",
            },
          ],
        },
        questions,
      },
    });

    expect(project.id).toBe("project-1");
    expect(project.remoteToken).toBe("signed-token");
    expect(project.status).toBe("ready");
    expect(project.progress).toBe(100);
    expect(project.knowledgeBase?.sections[0].title).toBe("企业身份");
    expect(project.knowledgeBase?.assets[0].sectionId).toBe("profile");
    expect(project.questions).toHaveLength(20);
    expect(project.monitoringEdition).toBe("domestic");
    expect(
      project.questions.filter(
        (question) => question.category === "industry_ranking",
      ),
    ).toSatisfy((ranking) => ranking.every((question) => !question.selectable));
  });

  it("normalizes overseas monitoring without retaining legacy English question metadata", () => {
    const project = normalizeGeoProject({
      project: {
        id: "overseas-project",
        status: "completed",
        monitoring_edition: "overseas",
        selected_platform_ids: ["chatgpt"],
        questions: [
          {
            id: "reputation-01",
            category: "reputation",
            question: "FrontMind 值得信赖吗？",
            question_english: "Is FrontMind trustworthy?",
            selectable: true,
          },
        ],
      },
    });

    expect(project.monitoringEdition).toBe("overseas");
    expect(project.selectedPlatformIds).toEqual(["chatgpt"]);
    expect(project.questions[0]).not.toHaveProperty("questionEnglish");
  });

  it("treats a completed partial recommendation set as ready", () => {
    const project = normalizeGeoProject({
      project: {
        id: "partial-recommendations",
        status: "completed",
        questionTask: { status: "completed", progress: 100 },
        questions: [
          {
            id: "reputation-01",
            category: "reputation",
            question: "Acme 靠谱吗？",
            selectable: true,
          },
          {
            id: "product-scenario-01",
            category: "product_scenario",
            question: "Acme 的产品适合哪些场景？",
            selectable: true,
          },
          {
            id: "competitor-comparison-01",
            category: "competitor_comparison",
            question: "Acme 和其他方案相比有什么区别？",
            selectable: true,
          },
        ],
      },
    });

    expect(project.status).toBe("ready");
    expect(project.progress).toBe(100);
    expect(project.questions).toHaveLength(3);
  });

  it("uses a neutral archive filename when the API omits one", () => {
    const project = normalizeGeoProject({
      project: {
        id: "project-without-archive-name",
        companyName: "客户企业",
        status: "completed",
        kbTask: { status: "completed", progress: 100 },
        knowledgeBase: { summary: "企业知识库摘要" },
        questions: [],
      },
    });

    expect(project.knowledgeBase?.archiveName).toBe("企业知识库.zip");
  });

  it("normalizes Unix seconds, Unix milliseconds, and ISO timestamps", () => {
    const seconds = 1_785_570_132;
    const project = normalizeGeoProject({
      project: {
        id: "timestamp-normalization",
        status: "completed",
        createdAt: seconds,
        updatedAt: seconds * 1_000,
        knowledgeBase: {
          summary: "企业知识库摘要",
          generatedAt: String(seconds),
        },
      },
    });

    const expected = new Date(seconds * 1_000).toISOString();
    expect(project.createdAt).toBe(expected);
    expect(project.updatedAt).toBe(expected);
    expect(project.knowledgeBase?.generatedAt).toBe(expected);
  });

  it("normalizes the server-owned v2 assessment update flag", () => {
    const camelCase = normalizeGeoProject({
      project: {
        id: "assessment-v2-update-camel",
        assessmentUpdatingToVersion2: true,
      },
    });
    const snakeCase = normalizeGeoProject({
      project: {
        id: "assessment-v2-update-snake",
        assessment_updating_to_version_2: true,
      },
    });

    expect(camelCase.assessmentUpdatingToVersion2).toBe(true);
    expect(snakeCase.assessmentUpdatingToVersion2).toBe(true);
  });

  it("normalizes formal branch overviews, leaves, asset bindings, and local ZIP paths", () => {
    const project = normalizeGeoProject({
      project: {
        id: "project-presentation-contract",
        companyName: "图文企业",
        status: "completed",
        knowledgeBase: {
          summary: "正式知识体系",
          archiveContractVersion: 3,
          sections: [
            {
              id: "products-services",
              title: "产品与服务",
              titleInjected: false,
              summary: "产品族正式综述",
              markdown: "旧版合并正文",
              overviewMarkdown: "## 产品与服务综述\n正式对外正文。",
              overviewAssetIds: ["asset-overview"],
              assetIds: ["asset-overview", "asset-api"],
              leaves: [
                {
                  id: "leaf-api",
                  title: "API 服务",
                  markdown: "## API 服务\n可直接调用的企业服务内容。",
                  status: "verified",
                  assetIds: ["asset-api"],
                },
              ],
            },
          ],
          assets: [
            {
              id: "asset-overview",
              name: "产品总览.webp",
              sectionId: "products-services",
              zipPath: "03_products/images/overview.webp",
              caption: "产品族总览",
              alt: "产品族总览图",
              mimeType: "image/webp",
              width: 1200,
              height: 800,
            },
            {
              id: "asset-unsafe-url",
              name: "来源说明.txt",
              previewUrl: "javascript:alert(1)",
              url: "//untrusted.example/asset",
            },
          ],
        },
      },
    });

    const section = project.knowledgeBase?.sections[0];
    expect(project.knowledgeBase?.archiveContractVersion).toBe(3);
    expect(section?.titleInjected).toBe(false);
    expect(section?.overview).toEqual({
      summary: "产品族正式综述",
      markdown: "## 产品与服务综述\n正式对外正文。",
      assetIds: ["asset-overview"],
    });
    expect(section?.leaves?.[0]).toMatchObject({
      id: "leaf-api",
      title: "API 服务",
      status: "verified",
      assetIds: ["asset-api"],
    });
    expect(project.knowledgeBase?.assets[0]).toMatchObject({
      archivePath: "03_products/images/overview.webp",
      caption: "产品族总览",
      alt: "产品族总览图",
      type: "image/webp",
      width: 1200,
      height: 800,
    });
    expect(project.knowledgeBase?.assets[1]).toMatchObject({
      id: "asset-unsafe-url",
      previewUrl: undefined,
      url: undefined,
    });
  });

  it("normalizes the explicit archive contract v4 marker", () => {
    const project = normalizeGeoProject({
      project: {
        id: "archive-contract-v4",
        status: "completed",
        knowledgeBase: {
          summary: "v4 企业知识库",
          archive_contract_version: 4,
          sections: [],
        },
      },
    });

    expect(project.knowledgeBase?.archiveContractVersion).toBe(4);
  });

  it("drops historical unavailable-summary markers while preserving real summaries", () => {
    const project = normalizeGeoProject({
      project: {
        id: "historical-empty-kb-summaries",
        status: "completed",
        knowledgeBase: {
          summary: "企业知识库摘要",
          sections: [
            {
              id: "company",
              title: "企业与品牌",
              summary: " 暂无可展示摘要。 ",
              leaves: [
                {
                  id: "company-profile",
                  title: "企业简介",
                  summary: "暂无可展示摘要",
                },
              ],
            },
            {
              id: "products",
              title: "产品与服务",
              summary: "核心产品和服务范围。",
            },
          ],
        },
      },
    });

    expect(project.knowledgeBase?.sections[0]).toMatchObject({
      summary: undefined,
      overview: { summary: undefined },
      leaves: [{ summary: undefined }],
    });
    expect(project.knowledgeBase?.sections[1]?.summary).toBe(
      "核心产品和服务范围。",
    );
  });

  it("drops legacy knowledge-base retry fields while preserving other actions", () => {
    const allowed = normalizeGeoProject({
      project: {
        id: "legacy-kb-retry-fields",
        status: "failed",
        knowledgeBaseRetryAvailable: true,
        knowledgeBaseAutoRetryAvailable: true,
        knowledgeBaseRecoveryState: "automatic_in_progress",
        knowledgeBaseSupportRequired: true,
        questionRetryAvailable: true,
        assessmentRetryAvailable: true,
        optimizationForecastRetryAvailable: true,
      },
    });
    const omitted = normalizeGeoProject(
      {
        project: {
          id: "actions-omitted",
          status: "failed",
        },
      },
      {
        knowledgeBaseSupportRequired: true,
        questionRetryAvailable: true,
        assessmentRetryAvailable: true,
        optimizationForecastRetryAvailable: true,
      },
    );
    expect(allowed).not.toHaveProperty("knowledgeBaseRetryAvailable");
    expect(allowed).not.toHaveProperty("knowledgeBaseAutoRetryAvailable");
    expect(allowed).not.toHaveProperty("knowledgeBaseRecoveryState");
    expect(allowed.knowledgeBaseSupportRequired).toBe(true);
    expect(allowed.questionRetryAvailable).toBe(true);
    expect(allowed.assessmentRetryAvailable).toBe(true);
    expect(allowed.optimizationForecastRetryAvailable).toBe(true);
    expect(omitted.knowledgeBaseSupportRequired).toBe(false);
    expect(omitted.questionRetryAvailable).toBe(false);
    expect(omitted.assessmentRetryAvailable).toBe(false);
    expect(omitted.optimizationForecastRetryAvailable).toBeUndefined();
  });

  it.each([
    ["structure", true],
    ["media", true],
    ["content", true],
    ["unsafe", true],
  ] as const)(
    "normalizes the %s knowledge validation category with support guidance",
    (category, supportRequired) => {
      const project = normalizeGeoProject({
        project: {
          id: `validation-${category}`,
          status: "failed",
          knowledgeBaseValidationCategory: category,
          knowledgeBaseSupportRequired: supportRequired,
          error: `${category} validation failed`,
        },
      });

      expect(project).toMatchObject({
        knowledgeBaseValidationCategory: category,
        knowledgeBaseSupportRequired: supportRequired,
      });
    },
  );

  it("accepts the snake-case validation category and drops unknown categories", () => {
    const snakeCase = normalizeGeoProject({
      project: {
        id: "validation-snake-case",
        status: "failed",
        knowledge_base_validation_category: "content",
      },
    });
    const unknown = normalizeGeoProject({
      project: {
        id: "validation-unknown",
        status: "failed",
        knowledgeBaseValidationCategory: "other",
      },
    });

    expect(snakeCase.knowledgeBaseValidationCategory).toBe("content");
    expect(unknown.knowledgeBaseValidationCategory).toBeUndefined();
  });

  it("recalculates knowledge completeness from bounded counts", () => {
    const project = normalizeGeoProject({
      projectToken: "signed-token",
      project: {
        id: "project-completeness",
        companyName: "示例企业",
        status: "completed",
        kbTask: { status: "completed", progress: 100 },
        knowledgeBase: {
          summary: "企业知识库摘要",
          metrics: [
            {
              key: "completeness",
              label: "知识库完整度",
              value: "99%",
            },
          ],
          sections: [{ id: "profile", title: "企业身份" }],
          completeness: {
            score: 99,
            label: "知识库完整度",
            basis: "严格核验节点除以适用节点。",
            counts: {
              totalLeaves: 46,
              applicableLeaves: 5,
              verifiedFirstParty: 31,
              verifiedAuthoritative: 7,
              supportedThirdParty: 2,
              inferred: 2,
              needsVerification: 4,
              notApplicable: 0,
            },
            acquisition: {
              officialPages: { completed: 999, total: 132 },
              webQueries: { completed: 24, total: 28 },
              images: { completed: -3, total: 46 },
            },
            gaps: ["就业数据仍需核验", 42, "证书版式仍需核验"],
            caveat: "不代表整个互联网的绝对覆盖率。",
          },
        },
        questions: [],
      },
    });

    expect(project.knowledgeBase?.completeness).toMatchObject({
      score: 87,
      counts: {
        totalLeaves: 46,
        applicableLeaves: 46,
        verifiedFirstParty: 31,
        verifiedAuthoritative: 7,
        supportedThirdParty: 2,
        inferred: 2,
        needsVerification: 4,
        notApplicable: 0,
      },
      acquisition: {
        officialPages: { completed: 132, total: 132 },
        webQueries: { completed: 24, total: 28 },
        images: { completed: 0, total: 46 },
      },
      gaps: ["就业数据仍需核验", "证书版式仍需核验"],
    });
    expect(
      project.knowledgeBase?.metrics.find(
        (metric) => metric.key === "completeness",
      ),
    ).toMatchObject({
      value: "87%",
      detail: "充分取证 40 / 46",
    });
  });

  it("fails closed when completeness status counts do not match the total", () => {
    const project = normalizeGeoProject({
      project: {
        id: "invalid-completeness",
        status: "completed",
        kbTask: { status: "completed" },
        knowledgeBase: {
          summary: "企业知识库摘要",
          metrics: [
            {
              key: "completeness",
              label: "知识库完整度",
              value: "99%",
            },
          ],
          completeness: {
            score: 99,
            counts: {
              totalLeaves: 47,
              applicableLeaves: 47,
              verifiedFirstParty: 31,
              verifiedAuthoritative: 7,
              supportedThirdParty: 2,
              inferred: 2,
              needsVerification: 4,
              notApplicable: 0,
            },
          },
        },
        questions: [],
      },
    });

    expect(project.knowledgeBase?.completeness).toBeUndefined();
    expect(
      project.knowledgeBase?.metrics.some(
        (metric) => metric.key === "completeness",
      ),
    ).toBe(false);
  });

  it("keeps raw task output out of business sections and preserves local selections", () => {
    const project = normalizeGeoProject(
      {
        projectToken: "new-token",
        project: {
          id: "remote-id",
          stage: "questions",
          questionTask: {
            status: "running",
            progress: 0.45,
            message: "不应出现在进度区域的后台对话",
            output: [
              {
                text: '```json\n{"questions":[{"id":"q1","category":"美誉舆情","question":"品牌口碑好不好？"}]}\n```',
              },
            ],
          },
          executionLog: {
            currentEntryId: "question-recommendation",
            entries: [
              {
                id: "question-recommendation",
                stage: "question_recommendation",
                title: "问题推荐",
                status: "running",
                progress: 45,
                events: [
                  {
                    id: "question-model-output",
                    kind: "model_output",
                    message: "已完成问题意图拆解，正在校验问题结构。",
                  },
                ],
              },
            ],
          },
        },
      },
      {
        id: "local-id",
        remoteToken: "old-token",
        selectedQuestionId: "q1",
        selectedPlatformIds: ["doubao"],
        questions: [],
      },
    );

    expect(project.id).toBe("local-id");
    expect(project.remoteToken).toBe("new-token");
    expect(project.progress).toBe(45);
    expect(project.progressLabel).toBeUndefined();
    expect(project.questions).toEqual([]);
    expect(project.executionLog?.entries[0]?.events[0]?.message).toBe(
      "已完成问题意图拆解，正在校验问题结构。",
    );
    expect(JSON.stringify(project)).not.toContain("品牌口碑好不好");
    expect(project.selectedPlatformIds).toEqual(["doubao"]);
  });

  it("treats explicit empty server fields as authoritative clears", () => {
    const project = normalizeGeoProject(
      {
        projectToken: "new-token",
        project: {
          id: "remote-id",
          questions: [],
          selectedQuestionId: null,
          selectedPlatformIds: [],
          attachments: [],
          monitoring: null,
          assessment: null,
          optimizationForecast: null,
          serviceActivation: null,
          executionLog: null,
          knowledgeBase: null,
          archive: null,
        },
      },
      {
        questions: [
          {
            id: "stale-question",
            category: "reputation",
            question: "不应复活的旧问题",
            selectable: true,
          },
        ],
        selectedQuestionId: "stale-question",
        selectedPlatformIds: ["doubao"],
        files: [
          {
            id: "stale-file",
            name: "stale.pdf",
            size: 1,
            type: "application/pdf",
          },
        ],
        knowledgeBase: { summary: "stale" },
        monitoring: { status: "completed" },
        assessment: { status: "ready" },
        optimizationForecast: { status: "ready" },
        serviceActivation: { status: "active" },
        executionLog: { entries: [] },
      } as unknown as Partial<GeoProject>,
    );

    expect(project.questions).toEqual([]);
    expect(project.selectedQuestionId).toBeUndefined();
    expect(project.selectedPlatformIds).toEqual([]);
    expect(project.files).toEqual([]);
    expect(project.knowledgeBase).toBeUndefined();
    expect(project.monitoring).toBeUndefined();
    expect(project.assessment).toBeUndefined();
    expect(project.optimizationForecast).toBeUndefined();
    expect(project.serviceActivation).toBeUndefined();
    expect(project.executionLog).toBeUndefined();
  });

  it("does not invent ready states from result-shaped fields without a status", () => {
    const project = normalizeGeoProject({
      project: {
        id: "project-without-terminal-status",
        assessment: {
          totalScore: 80,
          dimensions: {
            semantic_visibility: {
              score: 20,
              maxScore: 30,
            },
          },
        },
        optimizationForecast: {
          currentScore: 80,
          dimensions: [
            {
              id: "semantic_visibility",
              currentScore: 20,
              targetLow: 21,
              targetHigh: 24,
              maxScore: 30,
            },
          ],
        },
      },
    });

    expect(project.assessment?.status).toBe("not_started");
    expect(project.optimizationForecast?.status).toBe("not_started");
  });

  it.each(["paused", "upstream_unknown"])(
    "keeps the non-final assessment status %s running",
    (status) => {
      const project = normalizeGeoProject({
        project: {
          id: `project-${status}`,
          assessment: { status },
          optimizationForecast: { status },
          assessmentRetryAvailable: false,
          optimizationForecastRetryAvailable: false,
        },
      });

      expect(project.assessment?.status).toBe("running");
      expect(project.optimizationForecast?.status).toBe("running");
      expect(project.assessmentRetryAvailable).toBe(false);
      expect(project.optimizationForecastRetryAvailable).toBe(false);
      expect(project.stage).toBe("current_assessment");
    },
  );

  it("preserves the allowlisted assessment validation support code", () => {
    const project = normalizeGeoProject({
      project: {
        id: "project-invalid-assessment-output",
        assessment: {
          status: "failed",
          error: "现状评估结果文件暂时无法读取",
          failureCode: "OUTPUT_FILE_UNAVAILABLE",
          dimensions: {},
          comparisons: [],
        },
      },
    });

    expect(project.assessment).toMatchObject({
      status: "failed",
      error: "现状评估结果文件暂时无法读取",
      failureCode: "OUTPUT_FILE_UNAVAILABLE",
    });
  });

  it("preserves the allowlisted forecast validation support code", () => {
    const project = normalizeGeoProject({
      project: {
        id: "project-invalid-forecast-output",
        optimizationForecast: {
          status: "failed",
          error: "优化效果评估结果文件暂时无法读取",
          failure_code: "OUTPUT_FILE_UNAVAILABLE",
          dimensions: [],
          assumptions: [],
          roadmap: [],
        },
      },
    });

    expect(project.optimizationForecast).toMatchObject({
      status: "failed",
      error: "优化效果评估结果文件暂时无法读取",
      failureCode: "OUTPUT_FILE_UNAVAILABLE",
    });
  });

  it("normalizes the safe execution log snapshot", () => {
    const project = normalizeGeoProject({
      projectToken: "signed-token",
      project: {
        id: "project-1",
        status: "running",
        kbTask: { status: "completed", progress: 100 },
        questionTask: { status: "completed", progress: 100 },
        executionLog: {
          currentEntryId: "monitoring",
          updatedAt: "2026-07-23T03:05:00.000Z",
          entries: [
            {
              id: "monitoring",
              stage: "monitoring",
              title: "问题监控",
              status: "running",
              progress: 70,
              startedAt: "2026-07-23T03:00:00.000Z",
              nextPollAt: "2026-07-23T03:10:00.000Z",
              counters: { completed: 6, failed: 1, total: 10 },
              events: [
                {
                  id: "monitoring-counts",
                  kind: "result_summary",
                  message: "已完成 6/10 次平台回答采集。",
                  createdAt: "2026-07-23T03:04:00.000Z",
                },
                {
                  id: "invalid-event",
                  kind: "reasoning",
                  message: "不允许的事件类型",
                },
              ],
            },
            {
              task_id: "provider-task-id-must-not-be-a-public-log-id",
              stage: "monitoring",
              title: "上游任务标识不应成为日志条目 ID",
              status: "running",
              events: [],
            },
          ],
        },
      },
    });

    expect(project.executionLog).toEqual({
      currentEntryId: "monitoring",
      fetchedAt: "2026-07-23T03:05:00.000Z",
      updatedAt: "2026-07-23T03:05:00.000Z",
      entries: [
        {
          id: "monitoring",
          stage: "monitoring",
          title: "问题监控",
          status: "running",
          progress: 70,
          startedAt: "2026-07-23T03:00:00.000Z",
          nextPollAt: "2026-07-23T03:10:00.000Z",
          counters: { completed: 6, failed: 1, total: 10 },
          events: [
            {
              id: "monitoring-counts",
              kind: "result_summary",
              message: "已完成 6/10 次平台回答采集。",
              createdAt: "2026-07-23T03:04:00.000Z",
            },
          ],
        },
      ],
    });
  });

  it("surfaces a result with no renderable questions as a failure", () => {
    const project = normalizeGeoProject({
      projectToken: "signed-token",
      project: {
        id: "project-1",
        status: "completed",
        questionTask: { status: "completed", progress: 100 },
        questionValidationError: "推荐任务未返回可展示的问题，请联系技术支持",
      },
    });

    expect(project.status).toBe("failed");
    expect(project.error).toContain("未返回可展示的问题");
  });

  it("normalizes real monitoring answers and scoped assessment output", () => {
    const project = normalizeGeoProject({
      projectToken: "monitor-token",
      project: {
        id: "project-monitor",
        status: "completed",
        monitoring: {
          run_id: "monitor-run-1",
          state: "polling_until_finished",
          platforms: ["doubao", "qianwen"],
          expected_records: 10,
          completed_records: 2,
          records: [
            {
              id: "record-1",
              platform: "doubao",
              run_index: 1,
              status: "completed",
              answerContent: "示例企业被真实回答提及。",
              media: [
                {
                  type: "video",
                  url: "https://media.example/interview.mp4",
                  thumbnailUrl: "https://media.example/interview.webp",
                  title: "企业采访",
                },
                { type: "image", url: "javascript:alert(1)" },
              ],
              citationList: [
                { title: "官网", url: "https://example.com/about" },
              ],
              referenceList: ["行业参考资料"],
            },
          ],
        },
        assessment: {
          status: "completed",
          result: {
            total_score: 61.5,
            grade: "B",
            coverage_rate: 0.8,
            confidence: "medium",
            dimensions: {
              semantic_visibility: {
                score: 18,
                max_score: 30,
                summary: "回答中存在稳定提及。",
              },
            },
            knowledge_comparisons: [
              {
                id: "fact-1",
                topic: "企业定位",
                classification: "aligned",
                knowledge_base_fact: "科研驱动",
                answer_finding: "回答准确覆盖定位。",
                platforms: ["doubao"],
              },
            ],
          },
        },
        optimizationForecast: {
          status: "completed",
          horizonWeeks: 4,
          currentScore: 61.5,
          targetLow: 69,
          targetExpected: 72,
          targetHigh: 75,
          gradeLow: "B",
          gradeHigh: "A",
          summary: "在完整执行并同口径复测的前提下建立条件目标区间。",
          dimensions: [
            {
              id: "semantic_visibility",
              label: "语义可见度",
              currentScore: 18,
              targetLow: 21,
              targetExpected: 22.5,
              targetHigh: 24,
              maxScore: 30,
              actions: ["建设可引用问答资产"],
            },
          ],
          assumptions: ["内容完成发布与收录检查"],
          roadmap: [
            {
              phase: 1,
              weeks: "第 1 周",
              title: "事实校准",
              actions: ["核验企业事实"],
              verificationGate: "关键事实均可追溯",
            },
          ],
        },
      },
    });

    expect(project.stage).toBe("current_assessment");
    expect(project.monitoring).toMatchObject({
      runId: "monitor-run-1",
      status: "capturing",
      expectedRecords: 10,
      completedRecords: 2,
    });
    expect(project.monitoring?.answers[0]).toMatchObject({
      platformId: "doubao",
      runIndex: 1,
      answer: "示例企业被真实回答提及。",
    });
    expect(project.monitoring?.answers[0].citations).toHaveLength(1);
    expect(project.monitoring?.answers[0].media).toEqual([
      {
        type: "video",
        url: "https://media.example/interview.mp4",
        thumbnailUrl: "https://media.example/interview.webp",
        title: "企业采访",
      },
    ]);
    expect(project.monitoring?.answers[0].references).toEqual([
      { title: "行业参考资料" },
    ]);
    expect(project.assessment).toMatchObject({
      status: "ready",
      totalScore: 61.5,
      grade: "B",
      coverage: 80,
    });
    expect(project.assessment?.dimensions[0]).toMatchObject({
      id: "semantic_visibility",
      score: 18,
      maxScore: 30,
    });
    expect(project.assessment?.comparisons[0].status).toBe("aligned");
    expect(project.optimizationForecast).toMatchObject({
      status: "ready",
      horizonWeeks: 4,
      currentScore: 61.5,
      targetLow: 69,
      targetExpected: 72,
      targetHigh: 75,
      gradeLow: "B",
      gradeHigh: "A",
    });
    expect(project.optimizationForecast?.dimensions[0]).toMatchObject({
      id: "semantic_visibility",
      currentScore: 18,
      targetExpected: 22.5,
    });
  });

  it("normalizes the server public assessment shape without losing root-level dimensions or comparisons", () => {
    const project = normalizeGeoProject({
      projectToken: "public-assessment-token",
      project: {
        id: "public-assessment-project",
        assessment: {
          status: "ready",
          totalScore: 50,
          rawTotalScore: 45,
          grade: "C",
          rawGrade: "D",
          structuralExcludedMaxScore: 10,
          applicableMaxScore: 90,
          coverage: 0.8,
          confidence: "medium",
          scope_label: "单问题可测口径",
          summary: "服务端公开评估摘要",
          dimensions: {
            semantic_visibility: {
              id: "semantic_visibility",
              label: "语义可见度",
              score: 16,
              maxScore: 30,
              summary: "真实维度摘要",
            },
            competitive_advantage: {
              id: "competitive_advantage",
              label: "竞争优势",
              score: 4,
              maxScore: 10,
              summary: "真实竞争优势摘要",
            },
          },
          comparisons: [
            {
              id: "comparison-public-1",
              topic: "企业定位",
              status: "aligned",
              knowledgeBaseFact: "真实知识库事实",
              answerFinding: "真实平台回答发现",
              recommendedAction: "真实建议动作",
              evidenceRefs: ["source-public-1"],
            },
          ],
          platformBreakdown: [
            {
              platform: "doubao",
              responseCount: 5,
              successfulResponses: 4,
              brandMentionRate: 0.5,
              averageRank: 2,
              factAccuracy: 0.8,
              propositionHitRate: 0.7,
              citationCount: 3,
              referenceCount: 4,
              sentiment: "neutral",
              verdict: "服务端返回的真实平台评估结论",
              evidenceRefs: ["doubao/run-01"],
            },
          ],
          priorityActions: [
            {
              priority: 1,
              dimension: "semanticAuthority",
              action: "服务端返回的真实优先动作",
              expectedImpact: "服务端返回的真实预期影响",
              evidenceRefs: ["doubao/run-01"],
            },
          ],
          limitations: ["服务端返回的真实适用限制"],
          rankingDiagnostics: {
            eligible: true,
            totalObservations: 5,
            rankedObservations: 4,
            unmentionedObservations: 1,
            averageRank: 2,
            firstPlaceRate: 0.2,
            top3Rate: 0.8,
            top5Rate: 1,
            competitorRankGap: 1,
            calculationBasis: "服务端返回的真实排名计算口径",
          },
          methodology: {
            assessmentType: "question_baseline",
            isFullBsasAudit: false,
            normalizedMeasuredScore: 55,
            applicableScore: 50,
            applicableMaxScore: 90,
            structuralExcludedMaxScore: 10,
            confidenceScore: 0.8,
          },
        },
      },
    });

    expect(project.assessment?.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "semantic_visibility",
          score: 16,
          summary: "真实维度摘要",
        }),
        expect.objectContaining({
          id: "competitive_advantage",
          score: 4,
          summary: "真实竞争优势摘要",
        }),
      ]),
    );
    expect(project.assessment?.comparisons).toEqual([
      expect.objectContaining({
        id: "comparison-public-1",
        knowledgeBaseFact: "真实知识库事实",
        recommendedAction: "真实建议动作",
      }),
    ]);
    expect(project.assessment).toMatchObject({
      rawTotalScore: 45,
      rawGrade: "D",
      structuralExcludedMaxScore: 10,
      applicableMaxScore: 90,
      coverage: 80,
      confidence: "medium",
      scopeLabel: "单问题可测口径",
      platformBreakdown: [
        expect.objectContaining({
          platformId: "doubao",
          successfulResponses: 4,
          factAccuracy: 0.8,
          verdict: "服务端返回的真实平台评估结论",
        }),
      ],
      priorityActions: [
        expect.objectContaining({
          dimension: "semantic_authority",
          action: "服务端返回的真实优先动作",
        }),
      ],
      limitations: ["服务端返回的真实适用限制"],
      rankingDiagnostics: expect.objectContaining({
        eligible: true,
        rankedObservations: 4,
        calculationBasis: "服务端返回的真实排名计算口径",
      }),
      methodology: expect.objectContaining({
        assessmentType: "question_baseline",
        confidenceScore: 0.8,
      }),
    });
  });

  it("normalizes the server public monitoring record fields", () => {
    const project = normalizeGeoProject({
      projectToken: "public-monitor-token",
      project: {
        id: "public-monitor-project",
        monitoring: {
          runId: "public-monitor-run",
          status: "completed",
          platforms: ["doubao"],
          expectedRecords: 1,
          completedRecords: 1,
          failedRecords: 0,
          records: [
            {
              recordId: "public-monitor-record",
              platform: "doubao",
              runIndex: 1,
              status: "completed",
              answerText: "服务端返回的真实平台回答正文",
              completedAt: "2026-07-26T08:30:00.000Z",
              media: [],
              citations: [],
              references: [],
            },
          ],
        },
      },
    });

    expect(project.monitoring?.answers).toEqual([
      expect.objectContaining({
        id: "public-monitor-record",
        answer: "服务端返回的真实平台回答正文",
        capturedAt: "2026-07-26T08:30:00.000Z",
      }),
    ]);
  });

  it.each([
    ["submission_in_progress", "submitted"],
    ["submitted", "submitted"],
    ["polling", "capturing"],
    ["status_poll_in_flight", "capturing"],
    ["polling_until_finished", "capturing"],
    ["partial_review_required", "partial_review"],
    ["remote_failed", "failed"],
    ["shape_mismatch", "failed"],
    ["submission_unknown", "submitted"],
  ])("maps Agent monitor state %s to %s", (state, expected) => {
    const project = normalizeGeoProject({
      project: {
        id: "project-state",
        monitoring: { runId: "run-state", state, platforms: ["kimi"] },
      },
    });
    expect(project.monitoring?.status).toBe(expected);
  });
});

describe("uploadGeoFile", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fails closed when invite verification receives successful HTML", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html>private reverse-proxy error details</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = await verifyGeoInvitation("valid-looking-code").catch(
      (reason: unknown) => reason,
    );

    expect(error).toMatchObject({
      code: "INVALID_RESPONSE_CONTENT_TYPE",
      status: 502,
      message: "服务返回格式无效，请稍后重试。",
    });
    expect(String((error as Error).message)).not.toContain(
      "private reverse-proxy error details",
    );
  });

  it("rejects invalid JSON and an invalid invite success shape", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("{not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: "true" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyGeoInvitation("invite-code")).rejects.toMatchObject({
      code: "INVALID_JSON_RESPONSE",
      status: 502,
    });
    await expect(verifyGeoInvitation("invite-code")).rejects.toMatchObject({
      code: "INVALID_INVITE_RESPONSE",
      status: 502,
    });
  });

  it("converts English API failures into Chinese user-facing messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "UPSTREAM_UNAVAILABLE",
              message: "The request could not be completed",
            },
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(verifyGeoInvitation("invite-code")).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      status: 503,
      message: "服务暂时不可用，请稍后重试。",
    });
  });

  it("fails closed when project creation receives JSON with the wrong shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      createGeoProject("Acme", [], { requestId: "request-1" }),
    ).rejects.toMatchObject({
      code: "INVALID_PROJECT_RESPONSE",
      status: 502,
    });
  });

  it("times out stalled JSON requests", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = verifyGeoInvitation("invite-code").catch(
      (reason: unknown) => reason,
    );
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(result).resolves.toMatchObject({
      code: "REQUEST_TIMEOUT",
      status: 408,
      message: "请求超时，请检查网络后重试。",
    });
  });

  it("aborts a stalled archive body after the download timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const project = {
      remoteToken: "signed-project-token",
      title: "Acme",
    } as GeoProject;

    const result = downloadGeoArchive(project).catch(
      (reason: unknown) => reason,
    );
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    await expect(result).resolves.toMatchObject({
      code: "REQUEST_TIMEOUT",
      status: 408,
    });
  });

  it("preserves caller cancellation without proxy fallback during direct upload", async () => {
    const controller = new AbortController();
    const reason = new DOMException("draft deleted", "AbortError");
    let markDirectUploadStarted: (() => void) | undefined;
    const directUploadStarted = new Promise<void>((resolve) => {
      markDirectUploadStarted = resolve;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fileId: "file-1",
            filename: "企业资料.pdf",
            uploadToken: "signed-upload-token",
            directUploadUrl: "https://storage.example/upload",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockImplementationOnce(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true },
            );
            markDirectUploadStarted?.();
          }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["brochure"], "企业资料.pdf", {
      type: "application/pdf",
    });
    const result = uploadGeoFile(file, {
      signal: controller.signal,
    }).catch((error: unknown) => error);
    await directUploadStarted;
    controller.abort(reason);

    await expect(result).resolves.toBe(reason);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(true);
  });

  it("surfaces a Website proxy upload timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fileId: "file-1",
            filename: "企业资料.pdf",
            uploadToken: "signed-upload-token",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockImplementationOnce(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true },
            );
          }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["brochure"], "企业资料.pdf", {
      type: "application/pdf",
    });
    const result = uploadGeoFile(file).catch((reason: unknown) => reason);
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    await expect(result).resolves.toMatchObject({
      code: "REQUEST_TIMEOUT",
      status: 408,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uploads only through the authenticated Website proxy", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fileId: "file-1",
            filename: "企业资料.pdf",
            uploadToken: "signed-upload-token",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, status: "uploaded" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["brochure"], "企业资料.pdf", {
      type: "application/pdf",
    });

    await expect(uploadGeoFile(file)).resolves.toMatchObject({
      id: "file-1",
      uploadToken: "signed-upload-token",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/geo/uploads/proxy");
  });

  it("ignores any direct storage URL returned by an outdated server", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fileId: "file-1",
            filename: "企业资料.pdf",
            uploadToken: "signed-upload-token",
            directUploadUrl: "https://storage.example/upload",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, status: "uploaded" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["brochure"], "企业资料.pdf", {
      type: "application/pdf",
    });
    const uploaded = await uploadGeoFile(file);

    expect(uploaded).toMatchObject({
      id: "file-1",
      name: "企业资料.pdf",
      uploadToken: "signed-upload-token",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/geo/uploads/proxy");
    expect(
      new Headers(fetchMock.mock.calls[1][1]?.headers).get(
        "x-geo-upload-token",
      ),
    ).toBe("signed-upload-token");
  });

  it("checkpoints each uploaded file and resumes with only missing files", async () => {
    const firstFile = new File(["first"], "first.pdf", {
      type: "application/pdf",
    });
    const secondFile = new File(["second"], "second.pdf", {
      type: "application/pdf",
    });
    const checkpoints: GeoUploadedFile[][] = [];
    const firstAttemptFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fileId: "file-1",
            filename: "first.pdf",
            uploadToken: "upload-token-1",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, status: "uploaded" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "UPLOAD_INIT_FAILED", message: "second failed" },
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", firstAttemptFetch);

    await expect(
      createGeoProject("Acme", [firstFile, secondFile], {
        requestId: "request-1",
        onUploadsReady: (files) => checkpoints.push(files),
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_INIT_FAILED", status: 503 });
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toEqual([
      expect.objectContaining({ id: "file-1", name: "first.pdf" }),
    ]);

    const retryFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fileId: "file-2",
            filename: "second.pdf",
            uploadToken: "upload-token-2",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, status: "uploaded" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            projectToken: "project-token",
            project: {
              id: "project-1",
              companyName: "Acme",
              status: "queued",
              kbTask: { status: "queued", progress: 0 },
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", retryFetch);

    await expect(
      createGeoProject("Acme", [firstFile, secondFile], {
        requestId: "request-1",
        uploadedFiles: checkpoints[0],
        onUploadsReady: (files) => checkpoints.push(files),
      }),
    ).resolves.toMatchObject({ id: "project-1" });

    expect(JSON.parse(String(retryFetch.mock.calls[0][1]?.body))).toMatchObject(
      {
        filename: "second.pdf",
      },
    );
    expect(
      JSON.parse(String(retryFetch.mock.calls[2][1]?.body)).attachments,
    ).toEqual([
      {
        fileId: "file-1",
        filename: "first.pdf",
        uploadToken: "upload-token-1",
      },
      {
        fileId: "file-2",
        filename: "second.pdf",
        uploadToken: "upload-token-2",
      },
    ]);
    expect(checkpoints[1]).toEqual([
      expect.objectContaining({ id: "file-1" }),
      expect.objectContaining({ id: "file-2" }),
    ]);
  });

  it("fails closed when a resumed upload ticket is not for the ordered file prefix", async () => {
    const file = new File(["first"], "first.pdf", {
      type: "application/pdf",
    });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGeoProject("Acme", [file], {
        requestId: "request-1",
        uploadedFiles: [
          {
            id: "file-1",
            name: "first.pdf",
            size: file.size,
            type: file.type,
            uploadToken: "upload-token-1",
            sourceName: "different.pdf",
            sourceLastModified: file.lastModified,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "INVALID_UPLOAD_CHECKPOINT",
      status: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("monitoring and assessment API", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const project: GeoProject = {
    id: "project-1",
    remoteToken: "signed-project-token",
    title: "示例企业",
    input: "示例企业",
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    stage: "monitoring",
    status: "ready",
    progress: 100,
    files: [],
    questions: [],
    selectedQuestionId: "reputation-01",
    selectedPlatformIds: ["doubao", "kimi"],
  };

  it("treats a missing remote project as an idempotent delete", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: "PROJECT_NOT_FOUND", message: "项目不存在" },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteGeoProject(project)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/geo/projects/signed-project-token",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("does not hide incomplete physical project deletion failures", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "PROJECT_DELETE_INCOMPLETE",
            message: "远端资源尚未全部清理",
          },
        }),
        { status: 502, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteGeoProject(project)).rejects.toMatchObject({
      status: 502,
      code: "PROJECT_DELETE_INCOMPLETE",
    });
  });

  it("retries an in-flight project purge until the server confirms deletion", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            projectId: project.id,
            status: "deleting",
            deletedTasks: 1,
            deletedFiles: 2,
            pendingReservations: 1,
            remainingTasks: 1,
            retryAfterMs: 250,
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const deletion = deleteGeoProject(project);
    await vi.advanceTimersByTimeAsync(250);
    await expect(deletion).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("creates and checks a server-priced ZPAY checkout", async () => {
    const checkoutPayload = {
      payment: {
        authorization: "signed-payment-authorization",
        orderId: "202607221800001234567890",
        amountFen: 400,
        unitPriceFen: 200,
        answersPerPlatform: 5,
        expiresAt: "2026-07-23T10:00:00.000Z",
        action: "https://zpayz.cn/submit.php",
        method: "POST",
        fields: {
          pid: "merchant123",
          type: "alipay",
          out_trade_no: "202607221800001234567890",
          notify_url: "https://frontmind.net/api/geo/payments/notify",
          return_url: "https://frontmind.net/api/geo/payments/return",
          name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
          money: "4.00",
          param: "signed-payment-authorization",
          sign: "signed",
          sign_type: "MD5",
        },
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(checkoutPayload), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            payment: {
              ...checkoutPayload.payment,
              fields: {
                ...checkoutPayload.payment.fields,
                type: "wxpay",
                sign: "switched-signature",
              },
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            payment: {
              status: "paid",
              orderId: checkoutPayload.payment.orderId,
              amountFen: 400,
              tradeNo: "zpay-trade-1",
              paidAt: "2026-07-22T10:05:00.000Z",
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const checkout = await createGeoPaymentCheckout(project, {
      questionId: "reputation-01",
      platformIds: ["doubao", "kimi"],
      monitoringEdition: "domestic",
      method: "alipay",
    });
    expect(checkout).toMatchObject({
      action: "https://zpayz.cn/submit.php",
      method: "POST",
      amountFen: 400,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      questionId: "reputation-01",
      platformIds: ["doubao", "kimi"],
      monitoringEdition: "domestic",
      method: "alipay",
    });

    await expect(
      switchGeoPaymentCheckout(project, {
        questionId: "reputation-01",
        platformIds: ["doubao", "kimi"],
        monitoringEdition: "domestic",
        authorization: checkout.authorization,
        method: "wxpay",
      }),
    ).resolves.toMatchObject({
      authorization: checkout.authorization,
      orderId: checkout.orderId,
      fields: { type: "wxpay" },
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/geo/projects/signed-project-token/payments/switch",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      questionId: "reputation-01",
      platformIds: ["doubao", "kimi"],
      monitoringEdition: "domestic",
      authorization: checkout.authorization,
      method: "wxpay",
    });

    await expect(
      getGeoPaymentStatus(project, {
        questionId: "reputation-01",
        platformIds: ["doubao", "kimi"],
        monitoringEdition: "domestic",
        authorization: checkout.authorization,
      }),
    ).resolves.toMatchObject({
      status: "paid",
      amountFen: 400,
      tradeNo: "zpay-trade-1",
    });
  });

  it("renders review-required payments only from complete canonical settlement facts", async () => {
    const orderId = "202607221800001234567890";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            payment: {
              status: "review_required",
              orderId,
              amountFen: 400,
              tradeNo: "zpay-trade-review-1",
              paidAt: "2026-07-23T10:31:00.000Z",
              message: "付款已安全入账，需要人工核对",
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            payment: {
              status: "paid",
              orderId,
              amountFen: 400,
              paidAt: "2026-07-22T10:05:00.000Z",
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            payment: {
              status: "review_required",
              orderId,
              amountFen: 400,
              tradeNo: "zpay-trade-review-1",
              paidAt: "2026-07-23T18:31:00+08:00",
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      questionId: "reputation-01",
      platformIds: ["doubao", "kimi"] as ("doubao" | "kimi")[],
      monitoringEdition: "domestic" as const,
      authorization: "signed-payment-authorization",
    };

    await expect(getGeoPaymentStatus(project, input)).resolves.toMatchObject({
      status: "review_required",
      tradeNo: "zpay-trade-review-1",
      message: "付款已安全入账，需要人工核对",
    });
    await expect(getGeoPaymentStatus(project, input)).rejects.toMatchObject({
      code: "INVALID_PAYMENT_STATUS",
      status: 502,
    });
    await expect(getGeoPaymentStatus(project, input)).rejects.toMatchObject({
      code: "INVALID_PAYMENT_STATUS",
      status: 502,
    });
  });

  it("submits a custom question and adopts the signed project token", async () => {
    const clientRequestId = "33333333-3333-4333-8333-333333333333";
    const customQuestion = {
      id: "custom-1234",
      category: "product_scenario",
      question: "FrontMind 超前智能适合哪些企业使用？",
      rationale: "用户自定义问题",
      evidenceRefs: ["knowledge-base"],
      selectable: true,
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          projectToken: "next-project-token",
          question: customQuestion,
          project: {
            id: "project-1",
            companyName: "示例企业",
            status: "completed",
            questions: [customQuestion],
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGeoCustomQuestion(
      project,
      customQuestion.question,
      { clientRequestId },
    );

    expect(result.question).toMatchObject(customQuestion);
    expect(result.project.remoteToken).toBe("next-project-token");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      question: customQuestion.question,
      clientRequestId,
    });
  });

  it("persists an existing recommended question and clears its UUID without sending an ACK", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "34343434-3434-4434-8434-343434343434";
    const recommendedQuestion = {
      id: "product-scenario-01",
      category: "product_scenario",
      question: "FrontMind 超前智能适合哪些企业使用？",
      rationale: "推荐问题",
      evidenceRefs: ["knowledge-base"],
      selectable: true,
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          validation: {
            schemaVersion: 1,
            clientRequestId,
            question: recommendedQuestion.question,
            state: "completed",
            acknowledgement: "not_required",
            completionMode: "existing_recommended_question",
          },
          projectToken: project.remoteToken,
          question: recommendedQuestion,
          project: {
            id: project.id,
            status: "completed",
            questions: [recommendedQuestion],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGeoCustomQuestion(
      project,
      recommendedQuestion.question,
      { clientRequestId },
    );
    expect(result.acknowledgement).toBe("not_required");
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(clientRequestId);

    await persistGeoCustomQuestionResultAndAcknowledge(
      result,
      async () => undefined,
    );

    expect(readPendingGeoCustomQuestionValidation(project.id)).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("/ack");
  });

  it("recovers a lost direct-completion response from its terminal receipt without ACK", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "35353535-3535-4535-8535-353535353535";
    const recommendedQuestion = {
      id: "product-scenario-01",
      category: "product_scenario",
      question: "FrontMind 超前智能适合哪些企业使用？",
      rationale: "推荐问题",
      evidenceRefs: ["knowledge-base"],
      selectable: true,
    };
    const directPayload = {
      validation: {
        schemaVersion: 1,
        clientRequestId,
        question: recommendedQuestion.question,
        state: "completed",
        acknowledgement: "not_required",
        completionMode: "existing_recommended_question",
      },
      projectToken: project.remoteToken,
      question: recommendedQuestion,
      project: {
        id: project.id,
        status: "completed",
        questions: [recommendedQuestion],
      },
    };
    const projectWithRecommendation = {
      ...project,
      questions: [recommendedQuestion],
    } as GeoProject;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(
        new TypeError("response lost after direct completion"),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(directPayload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGeoCustomQuestion(
        projectWithRecommendation,
        recommendedQuestion.question,
        {
          clientRequestId,
        },
      ),
    ).rejects.toThrow(/response lost/);

    const recovered = await resumeGeoCustomQuestionValidation(
      projectWithRecommendation,
    );
    expect(recovered).toMatchObject({
      clientRequestId,
      acknowledgement: "not_required",
      question: { id: "product-scenario-01" },
    });
    await persistGeoCustomQuestionResultAndAcknowledge(
      recovered!,
      async () => undefined,
    );

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/geo/projects/signed-project-token/questions/custom",
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}`,
    ]);
    expect(readPendingGeoCustomQuestionValidation(project.id)).toBeUndefined();
  });

  it("polls an async custom-question reservation with bounded HTTP requests", async () => {
    vi.useFakeTimers();
    const clientRequestId = "44444444-4444-4444-8444-444444444444";
    const customQuestion = {
      id: "custom-long-running",
      category: "product_scenario",
      question: "FrontMind 超前智能适合哪些企业使用？",
      rationale: "用户自定义问题",
      evidenceRefs: ["knowledge-base"],
      selectable: true,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            validation: {
              clientRequestId,
              state: "submitted",
              nextPollMs: 800,
            },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            validation: {
              clientRequestId,
              state: "submitted",
              nextPollMs: 800,
            },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            validation: { clientRequestId, state: "completed" },
            projectToken: "next-project-token",
            question: customQuestion,
            project: {
              id: "project-1",
              companyName: "示例企业",
              status: "completed",
              questions: [customQuestion],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const pending = createGeoCustomQuestion(project, customQuestion.question, {
      clientRequestId,
      pollIntervalMs: 1,
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({
      question: { id: "custom-long-running" },
      project: { remoteToken: "next-project-token" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/geo/projects/signed-project-token/questions/custom",
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}`,
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}`,
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      question: customQuestion.question,
      clientRequestId,
    });
  });

  it("keeps polling the same UUID across a transient status failure and surfaces the later enterprise rejection", async () => {
    vi.useFakeTimers();
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "47474747-4747-4747-8747-474747474747";
    const question = "FrontMind是什么企业？";
    const rejectionMessage =
      "该问题与「硅基流动」没有明确关系，请重新输入与当前企业相关的非行业排名类问题。";
    const terminalBody = {
      ok: false,
      validation: {
        schemaVersion: 1,
        clientRequestId,
        question,
        state: "rejected",
        error: {
          code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
          message: rejectionMessage,
          status: 422,
          retryable: false,
        },
      },
      error: {
        code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
        message: rejectionMessage,
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            validation: {
              clientRequestId,
              question,
              state: "submitted",
              nextPollMs: 1,
            },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "AGENT_UNAVAILABLE",
              message: "Too Many Requests",
            },
          }),
          { status: 502, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(terminalBody), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            validation: {
              schemaVersion: 1,
              clientRequestId,
              state: "rejected",
              acknowledged: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = createGeoCustomQuestion(project, question, {
      clientRequestId,
      pollIntervalMs: 1,
    }).catch((error: unknown) => error);
    await vi.runAllTimersAsync();

    await expect(outcome).resolves.toMatchObject({
      status: 422,
      code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
      message: rejectionMessage,
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/geo/projects/signed-project-token/questions/custom",
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}`,
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}`,
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}/ack`,
    ]);
    expect(readPendingGeoCustomQuestionValidation(project.id)).toBeUndefined();
  });

  it("does not hide an authoritative retryable terminal 502 behind automatic polling", async () => {
    vi.useFakeTimers();
    const clientRequestId = "48484848-4848-4848-8848-484848484848";
    const question = "FrontMind 超前智能适合哪些企业使用？";
    const terminalBody = {
      ok: false,
      validation: {
        schemaVersion: 1,
        clientRequestId,
        question,
        state: "failed",
        error: {
          code: "CUSTOM_QUESTION_CLASSIFIER_RESULT_UNAVAILABLE",
          message: "问题验证结果持续无法读取，请重试当前问题",
          status: 502,
          retryable: true,
        },
      },
      error: {
        code: "CUSTOM_QUESTION_CLASSIFIER_RESULT_UNAVAILABLE",
        message: "问题验证结果持续无法读取，请重试当前问题",
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            validation: {
              clientRequestId,
              question,
              state: "submitted",
              nextPollMs: 1,
            },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(terminalBody), {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = createGeoCustomQuestion(project, question, {
      clientRequestId,
      pollIntervalMs: 1,
    }).catch((error: unknown) => error);
    await vi.runAllTimersAsync();

    await expect(outcome).resolves.toMatchObject({
      status: 502,
      code: "CUSTOM_QUESTION_CLASSIFIER_RESULT_UNAVAILABLE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts immediately while backing off from a transient status failure", async () => {
    vi.useFakeTimers();
    const clientRequestId = "49494949-4949-4949-8949-494949494949";
    const question = "FrontMind 超前智能适合哪些企业使用？";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            validation: {
              clientRequestId,
              question,
              state: "submitted",
              nextPollMs: 1,
            },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "AGENT_UNAVAILABLE",
              message: "Too Many Requests",
            },
          }),
          { status: 502, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const abortReason = new DOMException("view unmounted", "AbortError");
    const pending = createGeoCustomQuestion(project, question, {
      clientRequestId,
      pollIntervalMs: 1,
      signal: controller.signal,
    });
    const rejected = expect(pending).rejects.toBe(abortReason);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    controller.abort(abortReason);

    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns control with the same recovery UUID after two minutes of continuous status failures", async () => {
    vi.useFakeTimers();
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "50505050-5050-4050-8050-505050505050";
    const question = "FrontMind 超前智能适合哪些企业使用？";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            validation: {
              clientRequestId,
              question,
              state: "submitted",
              nextPollMs: 200,
            },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      )
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              error: {
                code: "AGENT_UNAVAILABLE",
                message: "Too Many Requests",
              },
            }),
            { status: 502, headers: { "content-type": "application/json" } },
          ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = createGeoCustomQuestion(project, question, {
      clientRequestId,
    }).catch((error: unknown) => error);
    await vi.runAllTimersAsync();

    await expect(outcome).resolves.toMatchObject({
      status: 502,
      code: "AGENT_UNAVAILABLE",
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(10);
    expect(fetchMock.mock.calls.length).toBeLessThan(30);
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(clientRequestId);
  });

  it("reuses the same clientRequestId after a disconnected response", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const customQuestion = {
      id: "custom-recovered",
      category: "product_scenario",
      question: "FrontMind 超前智能适合哪些企业使用？",
      rationale: "用户自定义问题",
      evidenceRefs: ["knowledge-base"],
      selectable: true,
    };
    const requestBodies: Array<Record<string, string>> = [];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async (_input, init) => {
        requestBodies.push(JSON.parse(String(init?.body)));
        throw new TypeError("connection reset after request submission");
      })
      .mockImplementationOnce(async (_input, init) => {
        requestBodies.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            validation: {
              clientRequestId: requestBodies[0].clientRequestId,
              state: "completed",
            },
            projectToken: "recovered-project-token",
            question: customQuestion,
            project: {
              id: project.id,
              status: "completed",
              questions: [customQuestion],
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGeoCustomQuestion(project, customQuestion.question),
    ).rejects.toThrow(/connection reset/);
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(requestBodies[0].clientRequestId);
    const recovered = await createGeoCustomQuestion(
      project,
      customQuestion.question,
    );
    expect(recovered).toMatchObject({
      question: { id: "custom-recovered" },
      project: { remoteToken: "recovered-project-token" },
    });
    expect(storage.size).toBe(1);
    acknowledgeGeoCustomQuestionCommitted(
      project.id,
      recovered.clientRequestId,
    );
    expect(storage.size).toBe(0);

    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[0].clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(requestBodies[1]).toEqual(requestBodies[0]);
  });

  it("releases a tombstone-backed expired POST UUID and creates a new UUID only on the next explicit submission", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const expiredRequestId = "45454545-4545-4545-8545-454545454545";
    const questionText = "FrontMind 超前智能如何部署企业知识库？";
    const customQuestion = {
      id: "custom-after-expiration",
      category: "product_scenario",
      question: questionText,
      rationale: "用户自定义问题",
      evidenceRefs: ["knowledge-base"],
      selectable: true,
    };
    const requestIds: string[] = [];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async (_url, init) => {
        requestIds.push(JSON.parse(String(init?.body)).clientRequestId);
        return new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "CUSTOM_QUESTION_VALIDATION_EXPIRED",
              message: "该验证请求的清理标记仍然有效，请重新提交。",
            },
          }),
          { status: 410, headers: { "content-type": "application/json" } },
        );
      })
      .mockImplementationOnce(async (_url, init) => {
        const clientRequestId = JSON.parse(String(init?.body)).clientRequestId;
        requestIds.push(clientRequestId);
        return new Response(
          JSON.stringify({
            validation: {
              clientRequestId,
              question: questionText,
              state: "completed",
              acknowledgement: "required",
              completionMode: "reservation",
            },
            projectToken: "fresh-expiration-project-token",
            question: customQuestion,
            project: {
              id: project.id,
              status: "completed",
              questions: [customQuestion],
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGeoCustomQuestion(project, questionText, {
        clientRequestId: expiredRequestId,
      }),
    ).rejects.toMatchObject({
      status: 410,
      code: "CUSTOM_QUESTION_VALIDATION_EXPIRED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readPendingGeoCustomQuestionValidation(project.id)).toBeUndefined();

    const retried = await createGeoCustomQuestion(project, questionText);
    expect(retried.question.id).toBe("custom-after-expiration");
    expect(requestIds[0]).toBe(expiredRequestId);
    expect(requestIds[1]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(requestIds[1]).not.toBe(expiredRequestId);
  });

  it("releases the exact pending UUID when a resumed status GET reports expiration", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "46464646-4646-4646-8646-464646464646";
    const question = "FrontMind 超前智能如何部署企业知识库？";
    globalThis.localStorage.setItem(
      `frontmind-geo-custom-question-validation:${project.id}`,
      JSON.stringify({
        projectId: project.id,
        clientRequestId,
        question,
        updatedAt: new Date().toISOString(),
      }),
    );
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "CUSTOM_QUESTION_VALIDATION_EXPIRED",
            message: "该自定义问题验证请求已过期。",
          },
        }),
        { status: 410, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resumeGeoCustomQuestionValidation(project),
    ).rejects.toMatchObject({
      status: 410,
      code: "CUSTOM_QUESTION_VALIDATION_EXPIRED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}`,
    );
    expect(readPendingGeoCustomQuestionValidation(project.id)).toBeUndefined();
  });

  it("accepts strict RFC v4/v5 recovery UUIDs, preserves their case, and rejects other versions", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const storageKey = `frontmind-geo-custom-question-validation:${project.id}`;
    const question = "FrontMind 超前智能如何部署企业知识库？";
    const writePending = (clientRequestId: string) =>
      storage.set(
        storageKey,
        JSON.stringify({
          projectId: project.id,
          clientRequestId,
          question,
          updatedAt: "2026-08-01T00:00:00.000Z",
        }),
      );

    for (const clientRequestId of [
      "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      "BBBBBBBB-BBBB-5BBB-9BBB-BBBBBBBBBBBB",
    ]) {
      writePending(clientRequestId);
      expect(
        readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
      ).toBe(clientRequestId);
    }

    for (const invalidClientRequestId of [
      "cccccccc-cccc-3ccc-8ccc-cccccccccccc",
      "dddddddd-dddd-6ddd-8ddd-dddddddddddd",
      "EEEEEEEEEEEE4EEE8EEEEEEEEEEEEEEE",
    ]) {
      writePending(invalidClientRequestId);
      expect(
        readPendingGeoCustomQuestionValidation(project.id),
      ).toBeUndefined();
    }
  });

  it("ACKs a non-retryable terminal decision before releasing its exact local UUID", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "54545454-5454-4454-8454-545454545454";
    const question = "FrontMind 超前智能是否适合个人娱乐？";
    const terminalBody = {
      ok: false,
      validation: {
        schemaVersion: 1,
        clientRequestId,
        question,
        state: "rejected",
        acknowledgement: "required",
        completionMode: "reservation",
        error: {
          code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
          message: "问题与企业无关。",
          status: 422,
          retryable: false,
        },
      },
      error: {
        code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
        message: "问题与企业无关。",
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(terminalBody), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            validation: {
              schemaVersion: 1,
              clientRequestId,
              state: "rejected",
              acknowledged: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGeoCustomQuestion(project, question, { clientRequestId }),
    ).rejects.toMatchObject({
      status: 422,
      code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/geo/projects/signed-project-token/questions/custom",
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}/ack`,
    ]);
    expect(readPendingGeoCustomQuestionValidation(project.id)).toBeUndefined();
  });

  it("does not let an old terminal auto-ACK clear a newer local UUID", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const oldClientRequestId = "57575757-5757-4757-8757-575757575757";
    const newClientRequestId = "58585858-5858-4858-8858-585858585858";
    const oldQuestion = "FrontMind 超前智能是否适合个人娱乐？";
    const newQuestion = "FrontMind 超前智能如何部署企业知识库？";
    const terminalBody = {
      ok: false,
      validation: {
        schemaVersion: 1,
        clientRequestId: oldClientRequestId,
        question: oldQuestion,
        state: "rejected",
        acknowledgement: "required",
        completionMode: "reservation",
        error: {
          code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
          message: "问题与企业无关。",
          status: 422,
          retryable: false,
        },
      },
      error: {
        code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
        message: "问题与企业无关。",
      },
    };
    let resolveAcknowledgement!: (response: Response) => void;
    const acknowledgementResponse = new Promise<Response>((resolve) => {
      resolveAcknowledgement = resolve;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(terminalBody), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockImplementationOnce(async () => acknowledgementResponse);
    vi.stubGlobal("fetch", fetchMock);

    const rejected = createGeoCustomQuestion(project, oldQuestion, {
      clientRequestId: oldClientRequestId,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    globalThis.localStorage.setItem(
      `frontmind-geo-custom-question-validation:${project.id}`,
      JSON.stringify({
        projectId: project.id,
        clientRequestId: newClientRequestId,
        question: newQuestion,
        updatedAt: new Date().toISOString(),
      }),
    );
    resolveAcknowledgement(
      new Response(
        JSON.stringify({
          ok: true,
          validation: {
            schemaVersion: 1,
            clientRequestId: oldClientRequestId,
            state: "rejected",
            acknowledged: true,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(rejected).rejects.toMatchObject({
      status: 422,
      code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
    });
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(newClientRequestId);
  });

  it("keeps the authoritative business rejection when its ACK is rate-limited, then releases the UUID on recovery", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "55555555-5555-5555-8555-555555555555";
    const question = "FrontMind 超前智能是否适合个人娱乐？";
    const terminalBody = {
      ok: false,
      validation: {
        schemaVersion: 1,
        clientRequestId,
        question,
        state: "rejected",
        error: {
          code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
          message: "问题与企业无关。",
          status: 422,
          retryable: false,
        },
      },
      error: {
        code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
        message: "问题与企业无关。",
      },
    };
    const terminalResponse = () =>
      new Response(JSON.stringify(terminalBody), {
        status: 422,
        headers: { "content-type": "application/json" },
      });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(terminalResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "SESSION_RATE_LIMITED",
              message: "Too Many Requests",
            },
          }),
          { status: 429, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(terminalResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            validation: {
              schemaVersion: 1,
              clientRequestId,
              state: "rejected",
              acknowledged: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGeoCustomQuestion(project, question, { clientRequestId }),
    ).rejects.toMatchObject({
      status: 422,
      code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
      message: "问题与企业无关。",
    });
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(clientRequestId);

    await expect(
      resumeGeoCustomQuestionValidation(project),
    ).rejects.toMatchObject({
      status: 422,
      code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/geo/projects/signed-project-token/questions/custom",
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}/ack`,
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}`,
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}/ack`,
    ]);
    expect(readPendingGeoCustomQuestionValidation(project.id)).toBeUndefined();
  });

  it("preserves a recovered enterprise rejection when the recovery ACK is rate-limited", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "59595959-5959-4959-8959-595959595959";
    const question = "FrontMind是什么企业？";
    const message =
      "该问题与「硅基流动」没有明确关系，请重新输入与当前企业相关的非行业排名类问题。";
    globalThis.localStorage.setItem(
      `frontmind-geo-custom-question-validation:${project.id}`,
      JSON.stringify({
        projectId: project.id,
        clientRequestId,
        question,
        updatedAt: new Date().toISOString(),
      }),
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            validation: {
              schemaVersion: 1,
              clientRequestId,
              question,
              state: "rejected",
              error: {
                code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
                message,
                status: 422,
                retryable: false,
              },
            },
            error: {
              code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
              message,
            },
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "SESSION_RATE_LIMITED",
              message: "Too Many Requests",
            },
          }),
          { status: 429, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resumeGeoCustomQuestionValidation(project),
    ).rejects.toMatchObject({
      status: 422,
      code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
      message,
    });
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(clientRequestId);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}`,
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}/ack`,
    ]);
  });

  it("retires a superseded loser after exact recovery and uses a fresh UUID on explicit retry", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const supersededRequestId = "56565656-5656-4656-8656-565656565656";
    const questionText = "FrontMind 超前智能如何部署企业知识库？";
    globalThis.localStorage.setItem(
      `frontmind-geo-custom-question-validation:${project.id}`,
      JSON.stringify({
        projectId: project.id,
        clientRequestId: supersededRequestId,
        question: questionText,
        updatedAt: new Date().toISOString(),
      }),
    );
    const customQuestion = {
      id: "custom-after-supersede",
      category: "product_scenario",
      question: questionText,
      rationale: "该问题与企业知识库能力直接相关。",
      evidenceRefs: ["knowledge-base"],
      selectable: true,
    };
    const submittedRequestIds: string[] = [];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            validation: {
              schemaVersion: 1,
              clientRequestId: supersededRequestId,
              question: questionText,
              state: "failed",
              error: {
                code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED",
                message: "该请求已由项目权威请求替代。",
                status: 409,
                retryable: false,
              },
            },
            error: {
              code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED",
              message: "该请求已由项目权威请求替代。",
            },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      )
      .mockImplementationOnce(async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as {
          clientRequestId: string;
        };
        submittedRequestIds.push(body.clientRequestId);
        return new Response(
          JSON.stringify({
            validation: {
              clientRequestId: body.clientRequestId,
              question: questionText,
              state: "completed",
              acknowledgement: "required",
              completionMode: "reservation",
            },
            projectToken: "fresh-after-supersede-project-token",
            question: customQuestion,
            project: {
              id: project.id,
              status: "completed",
              questions: [customQuestion],
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resumeGeoCustomQuestionValidation(project),
    ).rejects.toMatchObject({
      status: 409,
      code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED",
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/geo/projects/signed-project-token/questions/custom/${supersededRequestId}`,
    );
    expect(readPendingGeoCustomQuestionValidation(project.id)).toBeUndefined();

    const retried = await createGeoCustomQuestion(project, questionText);
    expect(retried.question.id).toBe("custom-after-supersede");
    expect(submittedRequestIds).toHaveLength(1);
    expect(submittedRequestIds[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(submittedRequestIds[0]).not.toBe(supersededRequestId);
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(submittedRequestIds[0]);
  });

  it("keeps a loser UUID recoverable while its exact status response is unknown", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "57575757-5757-4757-8757-575757575757";
    const question = "FrontMind 超前智能如何部署企业知识库？";
    globalThis.localStorage.setItem(
      `frontmind-geo-custom-question-validation:${project.id}`,
      JSON.stringify({
        projectId: project.id,
        clientRequestId,
        question,
        updatedAt: new Date().toISOString(),
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockRejectedValue(new TypeError("exact status response unknown")),
    );

    await expect(resumeGeoCustomQuestionValidation(project)).rejects.toThrow(
      /exact status response unknown/,
    );
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(clientRequestId);
  });

  it("does not clear a newer pending UUID when an older request later reports expiration", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const expiredRequestId = "47474747-4747-4747-8747-474747474747";
    const newerRequestId = "48484848-4848-4848-8848-484848484848";
    const question = "FrontMind 超前智能如何部署企业知识库？";
    let resolveExpired!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveExpired = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const olderRequest = createGeoCustomQuestion(project, question, {
      clientRequestId: expiredRequestId,
    });
    globalThis.localStorage.setItem(
      `frontmind-geo-custom-question-validation:${project.id}`,
      JSON.stringify({
        projectId: project.id,
        clientRequestId: newerRequestId,
        question: "FrontMind 超前智能有哪些核心服务？",
        updatedAt: new Date().toISOString(),
      }),
    );
    resolveExpired(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "CUSTOM_QUESTION_VALIDATION_EXPIRED",
            message: "该自定义问题验证请求已过期。",
          },
        }),
        { status: 410, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(olderRequest).rejects.toMatchObject({
      code: "CUSTOM_QUESTION_VALIDATION_EXPIRED",
    });
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(newerRequestId);
  });

  it("does not let an old ACK completion clear a newer local pending UUID", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const oldRequestId = "49494949-4949-4949-8949-494949494949";
    const newerRequestId = "50505050-5050-4050-8050-505050505050";
    globalThis.localStorage.setItem(
      `frontmind-geo-custom-question-validation:${project.id}`,
      JSON.stringify({
        projectId: project.id,
        clientRequestId: newerRequestId,
        question: "FrontMind 超前智能有哪些核心服务？",
        updatedAt: new Date().toISOString(),
      }),
    );

    acknowledgeGeoCustomQuestionCommitted(project.id, oldRequestId);

    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(newerRequestId);
  });

  it("does not ACK or clear a newer pending UUID when a stale project observation is rejected", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const oldRequestId = "51515151-5151-4151-8151-515151515151";
    const newerRequestId = "52525252-5252-4252-8252-525252525252";
    globalThis.localStorage.setItem(
      `frontmind-geo-custom-question-validation:${project.id}`,
      JSON.stringify({
        projectId: project.id,
        clientRequestId: newerRequestId,
        question: "FrontMind 超前智能有哪些核心服务？",
        updatedAt: new Date().toISOString(),
      }),
    );
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const staleObservation = new Error(
      "项目已被删除或已由更新的操作推进，已忽略本次迟到结果。",
    );

    await expect(
      persistGeoCustomQuestionResultAndAcknowledge(
        {
          project: { ...project, remoteToken: "stale-result-token" },
          clientRequestId: oldRequestId,
          acknowledgement: "required",
        },
        async () => {
          throw staleObservation;
        },
      ),
    ).rejects.toBe(staleObservation);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(newerRequestId);
  });

  it("keeps a completed reservation until durable caller acknowledgement and resumes it after refresh", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "88888888-8888-4888-8888-888888888888";
    const customQuestion = {
      id: "custom-crash-window",
      category: "product_scenario",
      question: "FrontMind 超前智能适合哪些企业使用？",
      rationale: "用户自定义问题",
      evidenceRefs: ["knowledge-base"],
      selectable: true,
    };
    const completedPayload = {
      validation: {
        clientRequestId,
        state: "completed",
        acknowledgement: "required",
        completionMode: "reservation",
      },
      projectToken: "durable-project-token",
      question: customQuestion,
      project: {
        id: project.id,
        status: "completed",
        questions: [customQuestion],
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(completedPayload), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(completedPayload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            validation: {
              clientRequestId,
              state: "completed",
              acknowledged: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const first = await createGeoCustomQuestion(
      project,
      customQuestion.question,
      { clientRequestId },
    );
    expect(storage.size).toBe(1);
    const resumed = await resumeGeoCustomQuestionValidation(project, {
      pollIntervalMs: 1,
    });
    expect(resumed?.clientRequestId).toBe(clientRequestId);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}`,
    );
    expect(storage.size).toBe(1);

    const persistenceFailure = new Error("durable storage unavailable");
    await expect(
      persistGeoCustomQuestionResultAndAcknowledge(first, async () => {
        throw persistenceFailure;
      }),
    ).rejects.toBe(persistenceFailure);
    expect(storage.size).toBe(1);

    await persistGeoCustomQuestionResultAndAcknowledge(
      first,
      async () => undefined,
    );
    expect(storage.size).toBe(0);
    expect(fetchMock.mock.calls[2][0]).toBe(
      `/api/geo/projects/durable-project-token/questions/custom/${clientRequestId}/ack`,
    );
  });

  it("recovers a terminal result from /active when browser storage is unavailable and only ACKs after saving", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
      removeItem: () => {
        throw new Error("storage disabled");
      },
    });
    const clientRequestId = "99999999-9999-4999-8999-999999999999";
    const questionText = "FrontMind 超前智能如何部署企业知识库？";
    const customQuestion = {
      id: "custom-no-local-storage",
      category: "product_scenario",
      question: questionText,
      rationale: "用户自定义问题",
      evidenceRefs: ["knowledge-base"],
      selectable: true,
    };
    const completedPayload = {
      validation: {
        clientRequestId,
        question: questionText,
        state: "completed",
      },
      projectToken: "terminal-project-token",
      question: customQuestion,
      project: {
        id: project.id,
        status: "completed",
        questions: [customQuestion],
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(completedPayload), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(completedPayload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            validation: {
              clientRequestId,
              state: "completed",
              acknowledged: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const first = await createGeoCustomQuestion(project, questionText, {
      clientRequestId,
    });
    await expect(
      persistGeoCustomQuestionResultAndAcknowledge(first, async () => {
        throw new Error("indexed database unavailable");
      }),
    ).rejects.toThrow(/indexed database unavailable/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const recovered = await resumeGeoCustomQuestionValidation(project);
    expect(recovered?.clientRequestId).toBe(clientRequestId);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/geo/projects/signed-project-token/questions/custom/active",
    );
    await persistGeoCustomQuestionResultAndAcknowledge(
      recovered!,
      async () => undefined,
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      `/api/geo/projects/terminal-project-token/questions/custom/${clientRequestId}/ack`,
    );
  });

  it("retains the recovery UUID when an ACK response is lost and retries the same ACK idempotently", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "12121212-1212-4212-8212-121212121212";
    const questionText = "FrontMind 超前智能适合哪些企业使用？";
    const customQuestion = {
      id: "custom-ack-retry",
      category: "product_scenario",
      question: questionText,
      rationale: "用户自定义问题",
      evidenceRefs: ["knowledge-base"],
      selectable: true,
    };
    const resultPayload = {
      validation: {
        clientRequestId,
        question: questionText,
        state: "completed",
      },
      projectToken: "ack-retry-project-token",
      question: customQuestion,
      project: {
        id: project.id,
        status: "completed",
        questions: [customQuestion],
      },
    };
    const ackPayload = {
      ok: true,
      validation: {
        clientRequestId,
        state: "completed",
        acknowledged: true,
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(resultPayload), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(new TypeError("ack response lost"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(ackPayload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGeoCustomQuestion(project, questionText, {
      clientRequestId,
    });
    await expect(
      persistGeoCustomQuestionResultAndAcknowledge(
        result,
        async () => undefined,
      ),
    ).rejects.toThrow(/ack response lost/);
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(clientRequestId);

    await persistGeoCustomQuestionResultAndAcknowledge(
      result,
      async () => undefined,
    );
    expect(readPendingGeoCustomQuestionValidation(project.id)).toBeUndefined();
    expect(fetchMock.mock.calls.slice(1).map(([url]) => url)).toEqual([
      `/api/geo/projects/ack-retry-project-token/questions/custom/${clientRequestId}/ack`,
      `/api/geo/projects/ack-retry-project-token/questions/custom/${clientRequestId}/ack`,
    ]);
  });

  it("recovers a legacy v5 retryable failure and creates exactly one new UUID after explicit ACK", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const oldRequestId = "13131313-1313-5313-8313-131313131313";
    const questionText = "FrontMind 超前智能适合哪些企业使用？";
    const terminalPayload = {
      ok: false,
      validation: {
        schemaVersion: 1,
        clientRequestId: oldRequestId,
        question: questionText,
        state: "failed",
        error: {
          code: "CUSTOM_QUESTION_CLASSIFIER_RESULT_UNAVAILABLE",
          message: "问题验证结果持续无法读取，请重试当前问题",
          status: 502,
          retryable: true,
        },
      },
      error: {
        code: "CUSTOM_QUESTION_CLASSIFIER_RESULT_UNAVAILABLE",
        message: "问题验证结果持续无法读取，请重试当前问题",
      },
    };
    const completedQuestion = {
      id: "custom-explicit-retry",
      category: "product_scenario",
      question: questionText,
      rationale: "用户自定义问题",
      evidenceRefs: ["knowledge-base"],
      selectable: true,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(terminalPayload), {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(terminalPayload), {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            validation: {
              clientRequestId: oldRequestId,
              state: "failed",
              acknowledged: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockImplementationOnce(async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as {
          clientRequestId: string;
        };
        return new Response(
          JSON.stringify({
            validation: {
              clientRequestId: body.clientRequestId,
              question: questionText,
              state: "completed",
            },
            projectToken: "explicit-retry-project-token",
            question: completedQuestion,
            project: {
              id: project.id,
              status: "completed",
              questions: [completedQuestion],
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    const terminalError = await createGeoCustomQuestion(project, questionText, {
      clientRequestId: oldRequestId,
    }).catch((error: unknown) => error);
    expect(retryableGeoCustomQuestionValidation(terminalError)).toEqual({
      clientRequestId: oldRequestId,
      question: questionText,
    });
    await expect(
      resumeGeoCustomQuestionValidation(project),
    ).rejects.toMatchObject({
      code: "CUSTOM_QUESTION_CLASSIFIER_RESULT_UNAVAILABLE",
    });
    expect(
      fetchMock.mock.calls.slice(0, 2).map(([, init]) => init?.method),
    ).toEqual(["POST", undefined]);

    const retried = await retryGeoCustomQuestionValidation(
      project,
      terminalError,
    );
    expect(retried.question.id).toBe("custom-explicit-retry");
    const newSubmission = JSON.parse(
      String(fetchMock.mock.calls[3][1]?.body),
    ) as { clientRequestId: string };
    expect(newSubmission.clientRequestId).not.toBe(oldRequestId);
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(newSubmission.clientRequestId);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(3); // old submission + ACK + exactly one new submission
  });

  it("does not allocate a new retry operation when the old terminal ACK response is unknown", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "14141414-1414-4414-8414-141414141414";
    const question = "FrontMind 超前智能适合哪些企业使用？";
    globalThis.localStorage.setItem(
      `frontmind-geo-custom-question-validation:${project.id}`,
      JSON.stringify({
        projectId: project.id,
        clientRequestId,
        question,
        updatedAt: new Date().toISOString(),
      }),
    );
    const terminalError = await (() => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            validation: {
              clientRequestId,
              question,
              state: "failed",
              error: {
                code: "CUSTOM_QUESTION_CLASSIFIER_RESULT_UNAVAILABLE",
                message: "temporary",
                status: 502,
                retryable: true,
              },
            },
            error: {
              code: "CUSTOM_QUESTION_CLASSIFIER_RESULT_UNAVAILABLE",
              message: "temporary",
            },
          }),
          { status: 502, headers: { "content-type": "application/json" } },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      return resumeGeoCustomQuestionValidation(project).catch(
        (error: unknown) => error,
      );
    })();
    const ackOnly = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("ack response unknown"));
    vi.stubGlobal("fetch", ackOnly);

    await expect(
      retryGeoCustomQuestionValidation(project, terminalError),
    ).rejects.toThrow(/ack response unknown/);
    expect(ackOnly).toHaveBeenCalledTimes(1);
    expect(ackOnly.mock.calls[0][0]).toBe(
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}/ack`,
    );
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(clientRequestId);
  });

  it("discovers the server-authoritative active reservation when local recovery state is missing", async () => {
    vi.useFakeTimers();
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const questionText = "FrontMind 超前智能如何部署企业知识库？";
    const customQuestion = {
      id: "custom-server-authority",
      category: "product_scenario",
      question: questionText,
      rationale: "用户自定义问题",
      evidenceRefs: ["knowledge-base"],
      selectable: true,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            validation: {
              clientRequestId,
              question: questionText,
              state: "submitted",
              nextPollMs: 1,
            },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            validation: {
              clientRequestId,
              question: questionText,
              state: "completed",
            },
            projectToken: "server-authoritative-project-token",
            question: customQuestion,
            project: {
              id: project.id,
              status: "completed",
              questions: [customQuestion],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const resumedPromise = resumeGeoCustomQuestionValidation(project, {
      pollIntervalMs: 1,
    });
    await vi.runAllTimersAsync();
    const resumed = await resumedPromise;

    expect(resumed).toMatchObject({
      clientRequestId,
      question: { id: "custom-server-authority" },
      project: { remoteToken: "server-authoritative-project-token" },
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/geo/projects/signed-project-token/questions/custom/active",
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}`,
    ]);
    expect(storage.size).toBe(1);
    acknowledgeGeoCustomQuestionCommitted(project.id, clientRequestId);
    expect(storage.size).toBe(0);
  });

  it("aborts polling on navigation without discarding the recovery UUID", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const clientRequestId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          validation: {
            clientRequestId,
            state: "submitted",
            nextPollMs: 1_500,
          },
        }),
        { status: 202, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const reason = new DOMException("view unmounted", "AbortError");

    const pending = createGeoCustomQuestion(
      project,
      "FrontMind 超前智能如何部署企业知识库？",
      {
        clientRequestId,
        signal: controller.signal,
        pollIntervalMs: 10_000,
      },
    );
    await Promise.resolve();
    await Promise.resolve();
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.size).toBe(1);
  });

  it("rejects a checkout response that could post to an untrusted host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            payment: {
              authorization: "signed-payment-authorization",
              orderId: "202607221800001234567890",
              amountFen: 200,
              unitPriceFen: 200,
              answersPerPlatform: 5,
              expiresAt: "2026-07-23T10:00:00.000Z",
              action: "https://attacker.example/submit.php",
              method: "POST",
              fields: {},
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      createGeoPaymentCheckout(project, {
        questionId: "reputation-01",
        platformIds: ["doubao"],
        monitoringEdition: "domestic",
        method: "wxpay",
      }),
    ).rejects.toMatchObject({ code: "INVALID_PAYMENT_CHECKOUT" });
  });

  it("submits a strict contract profile with the administrator code and enters payment", async () => {
    const response = {
      projectToken: "manual-contract-token",
      project: {
        id: "project-1",
        stage: "service_activation",
        serviceActivation: {
          status: "payment_required",
          questionId: "reputation-01",
          category: "reputation",
          amountFen: 200_000,
          billingMonths: 1,
          contractWorkflowReference: "manual-order-reference-001",
          manualOrderStatus: "payment_required",
          contractAuthorizationMode: "external_wechat",
          contractAuthorizedAt: "2026-07-24T08:05:00.000Z",
        },
      },
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify(response), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const profile = {
      legalName: "深圳星辰科技有限公司",
      creditCode: "91440300MA5F12345X",
      address: "深圳市南山区科技园一号",
      signatoryName: "张三",
      signatoryTitle: "运营负责人",
      mobile: "13800138000",
      email: "contracts@example.com",
      authorized: true as const,
    };

    const submitted = await submitGeoServiceContractProfile(
      project,
      profile,
      "administrator-code",
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/geo/projects/signed-project-token/services/contracts",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      profile,
      contractCode: "administrator-code",
    });
    expect(submitted.serviceActivation).toMatchObject({
      status: "payment_required",
      contractWorkflowReference: "manual-order-reference-001",
      manualOrderStatus: "payment_required",
      contractAuthorizationMode: "external_wechat",
      contractAuthorizedAt: "2026-07-24T08:05:00.000Z",
    });
  });

  it("creates, checks, and confirms a server-priced one-month service order", async () => {
    const orderId = "202607221800009876543210";
    const authorization = "signed-service-authorization";
    const checkoutPayload = {
      payment: {
        authorization,
        orderId,
        amountFen: 200_000,
        category: "reputation",
        billingMonths: 1,
        expiresAt: "2026-07-23T10:00:00.000Z",
        action: "https://zpayz.cn/submit.php",
        method: "POST",
        fields: {
          pid: "merchant123",
          type: "wxpay",
          out_trade_no: orderId,
          notify_url: "https://frontmind.net/api/geo/payments/notify",
          return_url: "https://frontmind.net/api/geo/payments/return",
          name: "FrontMind GEO 美誉舆情优化服务（1个问题 / 1个月）",
          money: "2000.00",
          param: authorization,
          sign: "signed",
          sign_type: "MD5",
        },
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(checkoutPayload), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            payment: {
              status: "paid",
              orderId,
              amountFen: 200_000,
              tradeNo: "zpay-service-1",
              paidAt: "2026-07-22T10:05:00.000Z",
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            projectToken: "service-paid-token",
            project: {
              id: "project-1",
              stage: "service_activation",
              serviceActivation: {
                status: "profile_required",
                questionId: "reputation-01",
                category: "reputation",
                amountFen: 200_000,
                billingMonths: 1,
                orderId,
                paidAt: "2026-07-22T10:05:00.000Z",
              },
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const checkout = await createGeoServicePaymentCheckout(project, "wxpay");
    expect(checkout).toMatchObject({
      amountFen: 200_000,
      category: "reputation",
      billingMonths: 1,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      method: "wxpay",
    });

    await expect(
      getGeoServicePaymentStatus(project, authorization),
    ).resolves.toMatchObject({
      status: "paid",
      amountFen: 200_000,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      authorization,
    });

    const paid = await startGeoService(
      project,
      authorization,
      "one-time-purchase-intent-001",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      authorization,
      schemaVersion: 2,
      purchaseIntent: "one-time-purchase-intent-001",
    });
    expect(paid).toMatchObject({
      remoteToken: "service-paid-token",
      stage: "service_activation",
      serviceActivation: {
        status: "profile_required",
        amountFen: 200_000,
      },
    });
  });

  it("switches a service checkout and sends only bank-confirmation inputs", async () => {
    const orderId = "202607221800009876543210";
    const authorization = "signed-service-authorization";
    const switchedPayment = {
      payment: {
        authorization,
        orderId,
        amountFen: 200_000,
        category: "reputation",
        billingMonths: 1,
        expiresAt: "2026-07-23T10:00:00.000Z",
        action: "https://zpayz.cn/submit.php",
        method: "POST",
        fields: {
          pid: "merchant123",
          type: "alipay",
          out_trade_no: orderId,
          notify_url: "https://frontmind.net/api/geo/payments/notify",
          return_url: "https://frontmind.net/api/geo/payments/return",
          name: "FrontMind GEO 美誉舆情优化服务（1个问题 / 1个月）",
          money: "2000.00",
          param: authorization,
          sign: "switched-signature",
          sign_type: "MD5",
        },
      },
    };
    const bankConfirmedProject = {
      projectToken: "bank-confirmed-project-token",
      project: {
        id: "project-1",
        stage: "service_activation",
        serviceActivation: {
          status: "account_setup_required",
          questionId: "reputation-01",
          category: "reputation",
          amountFen: 200_000,
          billingMonths: 1,
          orderId,
          paidAt: "2026-07-22T10:05:00.000Z",
        },
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(switchedPayment), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(bankConfirmedProject), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(bankConfirmedProject), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      switchGeoServicePaymentCheckout(project, {
        authorization,
        method: "alipay",
      }),
    ).resolves.toMatchObject({
      authorization,
      orderId,
      fields: { type: "alipay" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/geo/projects/signed-project-token/services/payments/switch",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      authorization,
      method: "alipay",
    });

    await expect(
      confirmGeoServiceBankTransfer(project, {
        confirmationCode: "administrator-bank-code",
        authorization,
        purchaseIntent: "one-time-purchase-intent-001",
      }),
    ).resolves.toMatchObject({
      remoteToken: "bank-confirmed-project-token",
      serviceActivation: { status: "account_setup_required" },
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/geo/projects/signed-project-token/services/payments/bank-transfer/confirm",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      confirmationCode: "administrator-bank-code",
      authorization,
      purchaseIntent: "one-time-purchase-intent-001",
    });

    await confirmGeoServiceBankTransfer(project, {
      confirmationCode: "direct-bank-code",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      confirmationCode: "direct-bank-code",
    });
  });

  it("sends only account credentials and display name to the website account endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          projectToken: "service-provisioned-token",
          project: {
            id: "project-1",
            stage: "service_activation",
            serviceActivation: {
              status: "active",
              questionId: "reputation-01",
              category: "reputation",
              amountFen: 200_000,
              billingMonths: 1,
              accountUsername: "frontmind.user",
              accountDisplayName: "示例企业",
              workspaceUrl: "https://dashboard.frontmind.net/",
            },
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const updated = await createGeoServiceAccount(project, {
      displayName: "示例企业",
      username: "frontmind.user",
      password: "StrongPassword123",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/geo/projects/signed-project-token/services/account",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      displayName: "示例企业",
      username: "frontmind.user",
      password: "StrongPassword123",
    });
    expect(updated.serviceActivation).toMatchObject({
      status: "active",
      accountUsername: "frontmind.user",
      accountDisplayName: "示例企业",
      workspaceUrl: "https://dashboard.frontmind.net/",
    });
  });

  it("uses the password-free v2 account contract and polls the provisioning status", async () => {
    const responseBody = {
      projectToken: "service-v2-token",
      project: {
        id: "project-1",
        stage: "service_activation",
        serviceActivation: {
          status: "signature_required",
          questionId: "reputation-01",
          category: "reputation",
          amountFen: 200_000,
          billingMonths: 1,
          planCode: "basic",
          serviceDays: 30,
          provisioningVersion: 2,
          provisioningReference: "purchase-reference-001",
          provisioningStatus: "pending_confirmation",
          knowledgeImport: { status: "pending" },
        },
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(responseBody), {
          status: 202,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(responseBody), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const submitted = await createGeoServiceAccount(project, {
      schemaVersion: 2,
      account: {
        mode: "create",
        displayName: "示例企业",
        username: "frontmind.user",
      },
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual({
      schemaVersion: 2,
      account: {
        mode: "create",
        displayName: "示例企业",
        username: "frontmind.user",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/password|userId/);
    expect(submitted.serviceActivation).toMatchObject({
      provisioningVersion: 2,
      provisioningStatus: "pending_confirmation",
      knowledgeImport: { status: "pending" },
    });

    await getGeoServiceProvisioningStatus(submitted);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/geo/projects/service-v2-token/services/account/status",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({});
  });

  it("sends the strict payment-free v2 monitoring scope", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          projectToken: "next-token",
          project: {
            id: "project-1",
            monitoring: {
              runId: "run-1",
              status: "submitted",
              platforms: ["doubao", "kimi"],
            },
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const updated = await startGeoMonitoring(project, {
      clientRequestId: "22222222-2222-4222-8222-222222222222",
      questionId: "reputation-01",
      platformIds: ["doubao", "kimi"],
      monitoringEdition: "domestic",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/geo/projects/signed-project-token/monitoring",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      schemaVersion: 2,
      clientRequestId: "22222222-2222-4222-8222-222222222222",
      questionId: "reputation-01",
      platformIds: ["doubao", "kimi"],
      monitoringEdition: "domestic",
    });
    expect(updated.monitoring?.runId).toBe("run-1");
  });

  it("reuses the server-issued recovery project token without calling payments", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            state: "processing",
            retryAfterMs: 500,
            projectToken: "monitor-recovery-token",
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            state: "started",
            projectToken: "monitor-complete-token",
            project: {
              id: "project-1",
              monitoring: {
                runId: "run-1",
                status: "submitted",
                platforms: ["chatgpt"],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const onProcessing = vi.fn();

    const started = startGeoMonitoring(project, {
      clientRequestId: "23232323-2323-4232-8232-232323232323",
      questionId: "reputation-01",
      platformIds: ["chatgpt"],
      monitoringEdition: "overseas",
      onProcessing,
    });
    await vi.advanceTimersByTimeAsync(500);
    const updated = await started;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([path]) => String(path))).toEqual([
      "/api/geo/projects/signed-project-token/monitoring",
      "/api/geo/projects/monitor-recovery-token/monitoring",
    ]);
    expect(
      fetchMock.mock.calls.some(([path]) => String(path).includes("/payments")),
    ).toBe(false);
    expect(fetchMock.mock.calls[0][1]?.body).toBe(
      fetchMock.mock.calls[1][1]?.body,
    );
    expect(onProcessing).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteToken: "monitor-recovery-token",
        monitoringRecovery: expect.objectContaining({
          clientRequestId: "23232323-2323-4232-8232-232323232323",
        }),
      }),
    );
    expect(updated.remoteToken).toBe("monitor-complete-token");
    expect(updated.monitoringRecovery).toBeUndefined();
  });

  it("publishes the durable recovery token before the five-minute deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            state: "processing",
            retryAfterMs: 10_000,
            projectToken: "durable-monitor-recovery-token",
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onProcessing = vi.fn();

    const result = startGeoMonitoring(project, {
      clientRequestId: "24242424-2424-4242-8242-242424242424",
      questionId: "reputation-01",
      platformIds: ["chatgpt"],
      monitoringEdition: "overseas",
      onProcessing,
    }).catch((reason: unknown) => reason);
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    await expect(result).resolves.toMatchObject({
      status: 202,
      code: "QUESTION_TRANSLATION_PENDING",
    });
    expect(onProcessing).toHaveBeenCalledTimes(1);
    expect(onProcessing).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteToken: "durable-monitor-recovery-token",
      }),
    );
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(
      "/projects/durable-monitor-recovery-token/monitoring",
    );
  });

  it("keeps monitor activation alive beyond the default JSON timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = startGeoMonitoring(project, {
      clientRequestId: "33333333-3333-4333-8333-333333333333",
      questionId: "reputation-01",
      platformIds: ["chatgpt"],
      monitoringEdition: "overseas",
    }).catch((reason: unknown) => reason);
    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;

    await vi.advanceTimersByTimeAsync(30_000);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(45_000);
    await expect(result).resolves.toMatchObject({
      code: "REQUEST_TIMEOUT",
      status: 408,
    });
  });

  it("starts assessment through an explicit POST without a request body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          projectToken: "assessment-token",
          project: {
            id: "project-1",
            assessment: { status: "queued" },
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const updated = await startGeoCurrentAssessment(project);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/geo/projects/signed-project-token/assessment",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
    expect(updated.assessment?.status).toBe("queued");
  });

  it("starts optimization forecasting through an explicit POST", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          projectToken: "forecast-token",
          project: {
            id: "project-1",
            optimizationForecast: {
              status: "queued",
              dimensions: [],
              assumptions: [],
              roadmap: [],
            },
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const updated = await startGeoOptimizationForecast(project);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/geo/projects/signed-project-token/optimization-forecast",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
    expect(updated.remoteToken).toBe("forecast-token");
    expect(updated.optimizationForecast?.status).toBe("queued");
  });
});
