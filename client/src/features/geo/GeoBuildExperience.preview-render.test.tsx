import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  AssetsPanel,
  GeoAgentUserDashboard,
  IntentPanel,
  KnowledgePanel,
  ProgressPanel,
} from "./GeoAgentUserDashboard";
import {
  AssessmentOverview,
  CurrentAssessment,
  EnterpriseAnalysis,
  expandLegacyTruncatedOverview,
  formatExecutionElapsed,
  GeoWorkspaceHandoff,
  KnowledgeComparison,
  MonitoringResults,
  OptimizationForecastView,
  QuestionRecommendation,
  resolvePaymentCheckoutAction,
  ServiceActivation,
  shouldRenderExecutionProgress,
  StageNavigation,
} from "./GeoBuildExperience";
import { KnowledgeCompletenessDetails } from "./KnowledgeCompletenessDialog";
import { createGeoStylePreviewProject } from "./preview";
import type { GeoAnswerSource } from "./types";

function renderMonitoringAnswerSources({
  sources,
  citations,
  references,
}: {
  sources: GeoAnswerSource[];
  citations: GeoAnswerSource[];
  references: GeoAnswerSource[];
}) {
  const fixture = createGeoStylePreviewProject();
  const answer = fixture.monitoring?.answers.find(
    (item) => item.platformId === "doubao" && item.runIndex === 1,
  );
  if (!answer || !fixture.monitoring) {
    throw new Error("Preview monitoring fixture is incomplete");
  }

  return renderToStaticMarkup(
    <MonitoringResults
      project={{
        ...fixture,
        selectedPlatformIds: ["doubao"],
        monitoring: {
          ...fixture.monitoring,
          platforms: ["doubao"],
          expectedRecords: 5,
          completedRecords: 1,
          failedRecords: 0,
          answers: [
            {
              ...answer,
              sources,
              citations,
              references,
            },
          ],
        },
      }}
      onRefresh={vi.fn(async () => undefined)}
      refreshing={false}
      onContact={vi.fn()}
    />,
  );
}

describe("GEO style preview rendering", () => {
  it("expands a legacy 72-character structural overview from its complete leaf titles", () => {
    const markdown = [
      "# 产品与服务综述",
      "",
      "产品与服务分支涵盖MindPromise 智诺：构建 AI 可理解的企业语义资产、MindReach 智达：连接获客、营销与客服智能体、Mind。",
    ].join("\n");
    const expanded = expandLegacyTruncatedOverview(markdown, "产品与服务", [
      {
        id: "mindpromise",
        title: "MindPromise 智诺：构建 AI 可理解的企业语义资产",
        assetIds: [],
      },
      {
        id: "mindreach",
        title: "MindReach 智达：连接获客、营销与客服智能体",
        assetIds: [],
      },
      {
        id: "mindnexus",
        title: "MindNexus 智汇：把企业级 AI 工作流接入现有系统",
        assetIds: [],
      },
    ]);

    expect(expanded).toContain(
      "MindNexus 智汇：把企业级 AI 工作流接入现有系统，详细事实与来源已按条目分别整理。",
    );
    expect(expanded).not.toContain("、Mind。");
  });

  it("redirects only signed local-acceptance checkouts to the loopback payment page", () => {
    const checkout = {
      authorization: "local-payment-889100000001",
      orderId: "889100000001",
      amountFen: 200,
      unitPriceFen: 200,
      answersPerPlatform: 5,
      expiresAt: "2026-07-31T13:00:00.000Z",
      action: "https://zpayz.cn/submit.php" as const,
      method: "POST" as const,
      fields: {
        pid: "frontmind-local-acceptance",
        param: "frontmind-local-acceptance",
      },
    };

    expect(
      resolvePaymentCheckoutAction(checkout, {
        hostname: "127.0.0.1",
        origin: "http://127.0.0.1:8891",
      }),
    ).toBe("http://127.0.0.1:8891/__acceptance__/paid");
    expect(
      resolvePaymentCheckoutAction(checkout, {
        hostname: "frontmind.net",
        origin: "https://frontmind.net",
      }),
    ).toBe("https://zpayz.cn/submit.php");
  });

  it("starts execution timing at zero when no remote start time exists", () => {
    expect(formatExecutionElapsed(undefined, undefined, 1_000)).toBe(
      "00:00:00",
    );
    expect(
      formatExecutionElapsed(
        "2026-07-28T08:00:00.000Z",
        undefined,
        Date.parse("2026-07-28T09:02:03.000Z"),
      ),
    ).toBe("01:02:03");
    expect(
      formatExecutionElapsed(
        "2026-07-28T08:00:00.000Z",
        "2026-07-28T08:00:30.000Z",
        Date.parse("2026-07-28T09:00:00.000Z"),
      ),
    ).toBe("00:00:30");
  });

  it("never renders vendor percentage progress for enterprise analysis", () => {
    expect(
      shouldRenderExecutionProgress({
        stage: "enterprise_analysis",
        progress: 12,
      }),
    ).toBe(false);
    expect(
      shouldRenderExecutionProgress({
        stage: "monitoring",
        progress: 12,
      }),
    ).toBe(true);
  });

  it("keeps the active stage readable in the compact navigation", () => {
    const html = renderToStaticMarkup(
      <StageNavigation
        project={createGeoStylePreviewProject()}
        activeStage="current_assessment"
        onChange={vi.fn()}
        onOpenExecutionLog={vi.fn()}
      />,
    );

    expect(html).toContain("geo-mobile-stage-summary");
    expect(html).toContain("第 4 / 5 步");
    expect(html).toContain("现状评估");
  });

  it("keeps the locked question step reviewable without allowing scope mutation", () => {
    const html = renderToStaticMarkup(
      <StageNavigation
        project={createGeoStylePreviewProject()}
        activeStage="monitoring"
        questionSelectionLocked
        onChange={vi.fn()}
        onOpenExecutionLog={vi.fn()}
      />,
    );

    expect(html).toContain(
      "步骤 2：问题推荐，筛选优化问题，订单范围已锁定，只读查看",
    );
    const questionStep = html.match(
      /<button(?=[^>]*aria-label="步骤 2：问题推荐)[^>]*>/,
    );
    expect(questionStep?.[0]).not.toContain("disabled");
  });

  it("shows the one-shot knowledge completeness entry without P0 copy", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      updatedAt: "1785570132",
      knowledgeBase: {
        ...fixture.knowledgeBase!,
        generatedAt: "1785570132",
      },
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
      />,
    );

    expect(html).toContain("完整度评估 87%");
    expect(html).toContain("知识库完整度");
    expect(html).not.toContain("首要优先级");
    expect(html).not.toContain("P0");
    expect(html).not.toContain("急需修复");
    expect(html).not.toContain("1785570132");
  });

  it("shows GEO question generation as an explicit action below the archive actions", () => {
    const project = {
      ...createGeoStylePreviewProject(),
      status: "ready" as const,
      questions: [],
      selectedQuestionId: undefined,
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
        onContinueToQuestions={vi.fn()}
      />,
    );

    expect(html).toContain("geo-question-generate-button");
    expect(html).toContain("生成 GEO 问题");
    expect(html.indexOf("下载知识库 ZIP")).toBeLessThan(
      html.indexOf("生成 GEO 问题"),
    );
  });

  it("groups the five media platforms in a separate authority-source box", () => {
    const html = renderToStaticMarkup(
      <QuestionRecommendation
        project={createGeoStylePreviewProject()}
        selectionLocked={false}
        onSelect={vi.fn()}
        onCreateCustom={vi.fn()}
        onContact={vi.fn()}
      />,
    );

    expect(html).toContain('class="geo-authority-sources"');
    expect(html).toContain("权威信源");
    expect(html).toContain("搜狐");
    expect(html).toContain("新浪");
    expect(html).toContain("今日头条");
    expect(html).toContain("网易");
    expect(html).toContain("腾讯新闻");
    expect(html).toContain("/geo-builder/channels/sohu.png");
    expect(html).toContain("/geo-builder/channels/tencent-news.png");
  });

  it("shows partial recommendations without presenting them as an unfinished error", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      questions: fixture.questions.slice(0, 3),
    };
    const html = renderToStaticMarkup(
      <QuestionRecommendation
        project={project}
        selectionLocked={false}
        onSelect={vi.fn()}
        onCreateCustom={vi.fn()}
        onContact={vi.fn()}
      />,
    );

    expect(html).toContain("已优先展示本次生成的 3 道问题");
    expect(html).toContain("仍会正常展示，符合条件的问题可继续选择");
    expect(html).toContain("本分类本次暂无可展示问题");
    expect(html).not.toContain("推荐结果正在完成");
  });

  it("does not invent crawl scope or evidence claims when the archive omits them", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      knowledgeBase: {
        ...fixture.knowledgeBase!,
        summary: "",
        sources: [],
        assets: [],
        metrics: [],
        completeness: {
          ...fixture.knowledgeBase!.completeness!,
          acquisition: {},
        },
        sections: fixture.knowledgeBase!.sections.map((section) => ({
          ...section,
          summary: "",
          evidenceCount: 0,
        })),
      },
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
      />,
    );

    expect(html).toContain("知识库结构校验已通过");
    expect(html).toContain("摘要暂不可用");
    expect(html).toContain("暂无知识条目");
    expect(html).not.toContain("全面抓取已完成");
    expect(html).not.toContain("官网与权威公开来源");
    expect(html).not.toContain("已完成系统整理");
  });

  it("renders every knowledge leaf without the low-value branch overview", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      knowledgeBase: {
        ...fixture.knowledgeBase!,
        reportMarkdown: "这段抓取报告不应混入默认知识正文。",
        sections: [
          {
            id: "products-services",
            title: "产品与服务",
            summary: "正式产品综述摘要",
            markdown: "旧版合并正文",
            overview: {
              summary: "正式产品综述摘要",
              markdown: "## 正式产品综述\n这是整理后的客户可见正文。",
              assetIds: ["asset-1", "asset-2", "asset-3", "asset-4"],
            },
            leaves: [
              {
                id: "leaf-api",
                title: "API 服务",
                markdown: "叶子正文仅在切换后显示。",
                status: "verified" as const,
                assetIds: ["asset-4"],
              },
            ],
            assetIds: ["asset-1", "asset-2", "asset-3", "asset-4"],
            status: "verified" as const,
            contentAvailability: "limited_evidence" as const,
          },
        ],
        assets: Array.from({ length: 4 }, (_, index) => ({
          id: `asset-${index + 1}`,
          name: `产品图片 ${index + 1}.webp`,
          sectionId: "products-services",
          previewUrl: `/api/assets/${index + 1}`,
          type: "image/webp",
        })),
      },
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
      />,
    );

    expect(html).toContain("KNOWLEDGE BRANCH");
    expect(html).not.toContain("正式产品综述");
    expect(html).not.toContain("这是整理后的客户可见正文");
    expect(html).not.toContain("正式产品综述摘要");
    expect(html).toContain("API 服务");
    expect(html).toContain("叶子正文仅在切换后显示");
    expect(html).not.toContain("该分支公开证据有限");
    expect(html).not.toContain("未确认信息不会补写");
    expect(html).not.toContain("分支综述");
    expect(html).not.toContain("查看知识叶子");
    expect(html).not.toContain("geo-document-lead");
    expect(html).not.toContain("geo-section-media");
    expect(html).not.toContain("geo-status-pill");
    expect(html).not.toContain("企业素材 4");
    expect(html).not.toContain("抓取报告");
    expect(html).not.toContain("这段抓取报告不应混入默认知识正文");
  });

  it("does not render a branch overview or borrow leaf images", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      knowledgeBase: {
        ...fixture.knowledgeBase!,
        sections: [
          {
            id: "products-services",
            title: "产品与服务",
            overview: {
              markdown: "## 产品综述\n本综述没有关联图片。",
              assetIds: [],
            },
            leaves: [
              {
                id: "leaf-api",
                title: "API 服务",
                markdown: "叶子正文",
                status: "verified" as const,
                assetIds: ["asset-leaf"],
              },
            ],
            assetIds: ["asset-leaf"],
            status: "verified" as const,
          },
        ],
        assets: [
          {
            id: "asset-leaf",
            name: "仅属于叶子的图片.webp",
            sectionId: "products-services",
            previewUrl: "/api/assets/leaf",
            type: "image/webp",
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
      />,
    );

    expect(html).not.toContain("本综述没有关联图片");
    expect(html).toContain("叶子正文");
    expect(html).not.toContain("geo-section-media-image");
    expect(html).not.toContain('src="/api/assets/leaf"');
  });

  it("places a single brand logo in the 01 branch slot without creating an image panel", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      knowledgeBase: {
        ...fixture.knowledgeBase!,
        assets: [
          {
            id: "asset-logo",
            name: "brand-logo.png",
            previewUrl: "/api/assets/logo",
            type: "image/png",
            assetType: "brand_identity" as const,
            displayRole: "badge" as const,
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
      />,
    );

    expect(html).toContain("geo-branch-index has-logo");
    expect(html).toContain('src="/api/assets/logo"');
    expect(html).not.toContain("geo-section-media");
    expect(html.match(/src="\/api\/assets\/logo"/g)).toHaveLength(1);
  });

  it.each(["structure", "media", "content", "unsafe"] as const)(
    "routes a failed single-pass %s result to technical support",
    (category) => {
      const project = {
        ...createGeoStylePreviewProject(),
        status: "failed" as const,
        knowledgeBase: undefined,
        knowledgeBaseValidationCategory: category,
        knowledgeBaseSupportRequired: true,
        error: `${category} validation failed`,
      };
      const html = renderToStaticMarkup(
        <EnterpriseAnalysis
          project={project}
          onDownload={vi.fn()}
          onContact={vi.fn()}
          onStart={vi.fn()}
          starting={false}
        />,
      );

      expect(html).toContain("企业知识库生成未能完成");
      expect(html).toContain("联系技术支持");
      expect(html).not.toContain("重新生成知识库");
      expect(html).not.toContain("正在重新生成");
    },
  );

  it("routes a finalizer failure to technical support without a retry action", () => {
    const project = {
      ...createGeoStylePreviewProject(),
      status: "failed" as const,
      knowledgeBase: undefined,
      knowledgeBaseFinalization: {
        finalizationState: "failed_internal" as const,
        finalizerVersion: "website-kb-finalizer-v3",
        candidateSha256: "a".repeat(64),
        errorCode: "KB_FINALIZER_CONTRACT_VIOLATION" as const,
      },
      error: "企业知识库最终整理未通过校验，请联系技术支持。",
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
      />,
    );

    expect(html).toContain("知识库生成未能完成");
    expect(html).toContain("联系技术支持");
    expect(html).not.toContain("重试最终整理");
    expect(html).not.toContain("重新生成知识库");
  });

  it("shows delayed status as non-terminal support guidance", () => {
    const project = {
      ...createGeoStylePreviewProject(),
      preview: undefined,
      status: "analyzing" as const,
      knowledgeBase: undefined,
      knowledgeBaseSupportRequired: true,
      executionLog: {
        currentEntryId: "enterprise-analysis",
        fetchedAt: "2026-07-28T08:15:00.000Z",
        updatedAt: "2026-07-28T08:15:00.000Z",
        entries: [
          {
            id: "enterprise-analysis",
            stage: "enterprise_analysis" as const,
            title: "企业分析",
            status: "waiting" as const,
            startedAt: "2026-07-28T08:00:00.000Z",
            events: [
              {
                id: "progress-summary-1",
                kind: "progress_summary" as const,
                message:
                  "已访问 12 个链接，成功采集 10 个页面，提取 24680 字文字，发现 18 张图片并保存 11 张，已解析 3 份文档。",
                createdAt: "2026-07-28T08:05:00.000Z",
              },
            ],
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
      />,
    );

    expect(html).toContain("状态同步延迟");
    expect(html).toContain("联系技术支持");
    expect(html).toContain("不会重复创建任务");
    expect(html).not.toContain("重新生成知识库");
  });

  it("renders the latest trusted crawl checkpoint on the analysis page", () => {
    const project = {
      ...createGeoStylePreviewProject(),
      preview: undefined,
      status: "analyzing" as const,
      knowledgeBase: undefined,
      executionLog: {
        currentEntryId: "enterprise-analysis",
        fetchedAt: "2026-07-28T08:05:10.000Z",
        updatedAt: "2026-07-28T08:05:10.000Z",
        entries: [
          {
            id: "enterprise-analysis",
            stage: "enterprise_analysis" as const,
            title: "企业分析",
            status: "running" as const,
            startedAt: "2026-07-28T08:00:00.000Z",
            crawlProgress: {
              schemaVersion: 1 as const,
              reportedAt: "2026-07-28T08:05:00.000Z",
              phase: "crawling" as const,
              visitedLinks: 12,
              successfulPages: 10,
              failedPages: 2,
              textCharacters: 24_680,
              imagesDiscovered: 18,
              imagesDownloaded: 11,
              documentsParsed: 3,
              webQueriesExecuted: 2,
            },
            events: [],
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
      />,
    );

    expect(html).toContain("最新采集摘要");
    expect(html).toContain("已访问 12 个链接，成功采集 10 个页面");
    expect(html).toContain("24680 字文字");
    expect(html).toContain("已解析 3 份文档");
    expect(html.match(/已访问 12 个链接/g)).toHaveLength(1);
  });

  it("does not offer a question retry even for a legacy retry flag", () => {
    const project = {
      ...createGeoStylePreviewProject(),
      preview: undefined,
      status: "failed" as const,
      questions: [],
      questionRetryAvailable: true,
      error: "问题结构校验未通过。",
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
      />,
    );

    expect(html).toContain("问题推荐未能完成");
    expect(html).toContain("联系技术支持");
    expect(html).not.toContain(">重新生成<");
    expect(html).not.toContain("正在重新生成");
  });

  it("offers technical support for a failed single question run", () => {
    const project = {
      ...createGeoStylePreviewProject(),
      preview: undefined,
      status: "failed" as const,
      questions: [],
      questionRetryAvailable: false,
      error: "问题结构校验再次失败。",
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
      />,
    );

    expect(html).toContain("问题推荐未能完成");
    expect(html).toContain("联系技术支持");
    expect(html).not.toContain(">重新生成<");
    expect(html).not.toContain("正在重新生成");
  });

  it("explains the completeness denominator, acquisition scope, and caveat", () => {
    const project = createGeoStylePreviewProject();
    const html = renderToStaticMarkup(
      <KnowledgeCompletenessDetails
        completeness={project.knowledgeBase?.completeness}
      />,
    );

    expect(html).toContain("40 / 46");
    expect(html).toContain("证据完整度");
    expect(html).toContain("严格核验（第一方 + 权威记录）38 /");
    expect(html).toContain("全网查询矩阵");
    expect(html).toContain("24 / 28");
    expect(html).toContain("当前缺口");
    expect(html).toContain("不代表对整个互联网的绝对覆盖率");
  });

  it("makes the user dashboard completeness metric a dialog entry", () => {
    const project = createGeoStylePreviewProject();
    const html = renderToStaticMarkup(
      <KnowledgePanel project={project} view="knowledge-build" />,
    );

    expect(html).toContain("知识库完整度");
    expect(html).toContain("87%");
    expect(html).toContain("查看评估明细");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("发布本次采集快照");
    expect(html).not.toContain("持续补充");
    expect(html).not.toContain("可持续更新");
  });

  it("renders roadmap actions and folds execution conditions into the roadmap", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      optimizationForecast: fixture.optimizationForecast
        ? {
            ...fixture.optimizationForecast,
            limitations: ["仅适用于本次问题与所选平台样本。"],
            roadmap: fixture.optimizationForecast.roadmap.map((item, index) =>
              index === 0
                ? {
                    ...item,
                    verificationGate:
                      "验收标准：六类核心事实均有负责人确认和证据锚点。",
                  }
                : item,
            ),
          }
        : undefined,
    };
    const html = renderToStaticMarkup(
      <OptimizationForecastView project={project} onContact={vi.fn()} />,
    );

    expect(html).toContain("核验主体、方案边界与服务承诺");
    expect(html).toContain("形成可公开与待核验口径清单");
    expect(html).toContain("验收标准：六类核心事实均有负责人确认和证据锚点。");
    expect(html).not.toContain("验收标准：验收标准：");
    expect(html).toContain("路线执行条件");
    expect(html).not.toContain("目标适用限制");
    expect(html).not.toContain("仅适用于本次问题与所选平台样本");
    expect(html).toContain("预期 81.5");
    expect(html).not.toContain("等级参考");
    expect(html).not.toContain("A 为挑战上沿");
    expect(html).not.toContain("原始现状分");
    expect(html).not.toContain("原始目标下沿");
    expect(html).not.toContain("原始预期分");
    expect(html).not.toContain("原始目标上沿");
    expect(html).not.toContain("可测项口径");
    expect(html).toContain("预期 23.5");
    expect(html.indexOf("geo-forecast-roadmap")).toBeLessThan(
      html.indexOf("geo-forecast-roadmap-assumptions"),
    );
    expect(html).not.toContain("每一条企业事实，都保留来源线索");
    expect(html).not.toContain("需同口径复测");
    expect(html).not.toContain("执行前提");
    expect(html).not.toContain("与直接竞品对比能清晰陈述优势");
    expect(html).not.toContain("07/03");
    expect(html).not.toContain("18:18");
  });

  it("renders the customer-facing assessment without internal audit details", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      assessment: {
        ...fixture.assessment!,
        rawTotalScore: 45,
        rawGrade: "D" as const,
        structuralExcludedMaxScore: 10,
        applicableMaxScore: 90,
        coverage: 80,
        confidence: "medium" as const,
        scopeLabel: "单问题可测口径",
        platformBreakdown: [
          {
            platformId: "doubao" as const,
            responseCount: 5,
            successfulResponses: 4,
            brandMentionRate: 0.6,
            averageRank: 2,
            factAccuracy: 0.8,
            propositionHitRate: 0.7,
            sourceCount: 4,
            citationCount: 3,
            referenceCount: 4,
            sentiment: "neutral" as const,
            verdict: "真实平台拆分结论",
            evidenceRefs: ["doubao/run-01"],
          },
        ],
        priorityActions: [
          {
            priority: 1,
            dimension: "semantic_authority" as const,
            action: "真实评估优先动作",
            expectedImpact: "真实预期影响",
            evidenceRefs: ["doubao/run-01"],
          },
        ],
        limitations: ["真实评估适用限制"],
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
          calculationBasis: "真实排名计算口径",
        },
        methodology: {
          assessmentType: "question_baseline",
          isFullBsasAudit: false,
          normalizedMeasuredScore: 71.1,
          applicableScore: 64,
          applicableMaxScore: 90,
          structuralExcludedMaxScore: 10,
          confidenceScore: 0.8,
        },
      },
    };
    const html = renderToStaticMarkup(
      <AssessmentOverview project={project} assessmentReady />,
    );

    expect(html).toContain("平台评估拆分");
    expect(html).toContain("真实平台拆分结论");
    expect(html).toContain("情绪判断");
    expect(html).toContain("中性");
    expect(html).toContain("可追溯来源");
    expect(html).not.toContain("答案引用");
    expect(html).not.toContain("检索参考");
    expect(html).not.toContain("来源线索");
    expect(html).not.toContain("doubao/run-01");
    expect(html).toContain("评估优先动作");
    expect(html).toContain("真实评估优先动作");
    expect(html).toContain("真实预期影响");
    expect(html).toContain(
      "本结果反映当前问题在所选平台的回答表现，不代表全网自然排名。",
    );
    expect(html.indexOf("评估优先动作")).toBeLessThan(
      html.indexOf(
        "本结果反映当前问题在所选平台的回答表现，不代表全网自然排名。",
      ),
    );
    expect(html).not.toContain("真实排名计算口径");
    expect(html).not.toContain("真实评估适用限制");
    expect(html).not.toContain("question_baseline");
    expect(html).not.toContain("单问题可测口径");
    expect(html).not.toContain("原始总分");
    expect(html).not.toContain("完整 BSAS 审计");
    expect(html).not.toContain("SEMANTIC ASSET DIMENSIONS");
    expect(html).not.toContain("PLATFORM BREAKDOWN");
    expect(html).not.toContain("PRIORITY ACTIONS");
    expect(html).not.toContain("ASSESSMENT SCOPE");
  });

  it("shows only the passive v2 update state while an old score is being replaced", () => {
    const project = {
      ...createGeoStylePreviewProject(),
      assessmentUpdatingToVersion2: true,
    };
    const html = renderToStaticMarkup(
      <AssessmentOverview project={project} assessmentReady />,
    );

    expect(html).toContain("评估结果正在按新版口径更新");
    expect(html).toContain("无需手动刷新");
    expect(html).not.toContain("当前等级");
    expect(html).not.toContain("五维语义资产现状");
  });

  it("replaces internal assessment tokens and run identifiers in customer copy", () => {
    const fixture = createGeoStylePreviewProject();
    const comparison = fixture.assessment!.comparisons[0]!;
    const dimension = fixture.assessment!.dimensions[0]!;
    const project = {
      ...fixture,
      assessment: {
        ...fixture.assessment!,
        executiveSummary: "question_baseline_v2 来自 doubao/run-01。",
        dimensions: [
          {
            ...dimension,
            label: "Schema",
            currentFinding: "依据 citationList 与 doubao/run-01 计算。",
          },
          ...fixture.assessment!.dimensions.slice(1),
        ],
        comparisons: [
          {
            ...comparison,
            topic: "doubao/run-01",
            knowledgeBaseFact: "referenceList 尚待处理",
            answerFinding: "unknown",
            recommendedAction: "检查 citationList",
          },
        ],
        platformBreakdown: [
          {
            platformId: "doubao" as const,
            responseCount: 5,
            successfulResponses: 5,
            brandMentionRate: null,
            averageRank: null,
            factAccuracy: 0.8,
            propositionHitRate: 0.7,
            sourceCount: 28,
            sentiment: "mixed" as const,
            verdict: "来自 doubao/run-01 的 unavailable 结论",
            evidenceRefs: [],
          },
        ],
        priorityActions: [
          {
            priority: 1,
            dimension: "semantic_visibility" as const,
            action: "处理 question_baseline",
            expectedImpact: "复核 doubao/run-01",
            evidenceRefs: [],
          },
        ],
      },
    };
    const overview = renderToStaticMarkup(
      <AssessmentOverview project={project} assessmentReady />,
    );
    const comparisons = renderToStaticMarkup(
      <KnowledgeComparison project={project} />,
    );
    const combined = `${overview}${comparisons}`;

    expect(combined).not.toMatch(/question_baseline/i);
    expect(combined).not.toMatch(/citationList/i);
    expect(combined).not.toMatch(/referenceList/i);
    expect(combined).not.toMatch(/\bSchema\b/i);
    expect(combined).not.toMatch(/doubao\/run-01/i);
    expect(combined).not.toMatch(/\bunknown\b/i);
    expect(combined).not.toMatch(/\bunavailable\b/i);
    expect(comparisons).toContain("事实对照项 1");
    expect(comparisons).toContain("未提供可核验事实");
    expect(comparisons).toContain("未提供对照结论");
    expect(comparisons).toContain("暂未提供建议处理动作");
  });

  it("renders all 25 fact comparisons and expands the remaining knowledge ledger items", () => {
    const fixture = createGeoStylePreviewProject();
    const baseSection = fixture.knowledgeBase!.sections[0]!;
    const baseSource = fixture.knowledgeBase!.sources[0]!;
    const baseComparisons = fixture.assessment!.comparisons;
    const project = {
      ...fixture,
      knowledgeBase: {
        ...fixture.knowledgeBase!,
        generatedAt: "1785570132",
        sections: Array.from({ length: 7 }, (_, index) => ({
          ...baseSection,
          id: `knowledge-section-${index + 1}`,
          title: `知识主题 ${index + 1}`,
        })),
        sources: Array.from({ length: 28 }, (_, index) => ({
          ...baseSource,
          id: `knowledge-source-${index + 1}`,
          title: `可追溯来源 ${index + 1}`,
          url: `https://sources.example.invalid/${index + 1}`,
        })),
      },
      assessment: {
        ...fixture.assessment!,
        comparisons: Array.from({ length: 25 }, (_, index) => ({
          ...baseComparisons[index % baseComparisons.length]!,
          id: `comparison-${index + 1}`,
          topic: `回答事实主题 ${index + 1}`,
        })),
      },
    };
    const html = renderToStaticMarkup(
      <KnowledgeComparison project={project} />,
    );

    expect(html).toContain("回答事实对照 25 项");
    expect(html.match(/geo-comparison-card-header/g)).toHaveLength(25);
    expect(html).toMatch(/知识主题<\/span><strong[^>]*>7 项/);
    expect(html).toMatch(/可追溯来源<\/span><strong[^>]*>28 项/);
    expect(html).toContain("展开其余 2 个知识主题");
    expect(html).toContain("展开其余 23 个来源");
    expect(html).toContain("收起知识主题");
    expect(html).toContain("收起可追溯来源");
    expect(html.match(/geo-comparison-ledger-disclosure/g)).toHaveLength(2);
    expect(html).toContain("知识主题 7");
    expect(html).toContain("可追溯来源 28");
    expect(html).not.toContain("知识库生成于");
    expect(html).not.toContain("1785570132");
    expect(html).not.toContain("另有 2 个知识主题");
    expect(html).not.toContain("另有 23 个来源");
  });

  it("shows a passive five-minute forecast wait state without a refresh control", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      preview: undefined,
      optimizationForecast: {
        ...fixture.optimizationForecast!,
        status: "running" as const,
        currentScore: undefined,
        targetLow: undefined,
        targetHigh: undefined,
      },
    };
    const html = renderToStaticMarkup(
      <OptimizationForecastView project={project} onContact={vi.fn()} />,
    );

    expect(html).toContain("正在生成优化效果评估");
    expect(html).toContain("通常需要约 5 分钟");
    expect(html).toContain("完成后会自动显示，无需手动刷新");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("重新生成");
    expect(html).not.toContain("刷新评估");
  });

  it("keeps the user dashboard tab available in the local preview fixture", () => {
    const project = createGeoStylePreviewProject();
    const html = renderToStaticMarkup(
      <ServiceActivation
        project={project}
        paymentPending={false}
        onCheckout={vi.fn()}
        onSubmitProfile={vi.fn(async () => undefined)}
        onCreateAccount={vi.fn(async () => undefined)}
        onCheckStatus={vi.fn(async () => undefined)}
        onBack={vi.fn()}
      />,
    );
    const labelIndex = html.indexOf("企业服务工作台");
    const buttonStart = html.lastIndexOf("<button", labelIndex);
    const buttonEnd = html.indexOf(">", buttonStart);
    const dashboardButton = html.slice(buttonStart, buttonEnd + 1);

    expect(labelIndex).toBeGreaterThan(-1);
    expect(dashboardButton).not.toContain("disabled");
    expect(html).toContain("查看用户端内容骨架");
  });

  it("offers a clearly labelled luxury workspace sample before service activation", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      preview: undefined,
      serviceActivation: {
        ...fixture.serviceActivation!,
        status: "profile_required" as const,
      },
    };
    const html = renderToStaticMarkup(
      <ServiceActivation
        project={project}
        paymentPending={false}
        onCheckout={vi.fn()}
        onSubmitProfile={vi.fn(async () => undefined)}
        onCreateAccount={vi.fn(async () => undefined)}
        onCheckStatus={vi.fn(async () => undefined)}
        onBack={vi.fn()}
      />,
    );
    const labelIndex = html.indexOf("企业服务工作台");
    const buttonStart = html.lastIndexOf("<button", labelIndex);
    const buttonEnd = html.indexOf(">", buttonStart);
    const dashboardButton = html.slice(buttonStart, buttonEnd + 1);

    expect(labelIndex).toBeGreaterThan(-1);
    expect(dashboardButton).not.toContain("disabled");
    expect(html).toContain("查看豪华版工作台样例");
    expect(html).not.toContain("完成合同、付款和账号创建后开放");
  });

  it("opens the workspace sample when the assessment is ready but the forecast failed", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      preview: undefined,
      optimizationForecast: {
        ...fixture.optimizationForecast!,
        status: "failed" as const,
        error: "优化评估暂未生成",
      },
    };
    const navigation = renderToStaticMarkup(
      <StageNavigation
        project={project}
        activeStage="current_assessment"
        onChange={vi.fn()}
        onOpenExecutionLog={vi.fn()}
      />,
    );
    const stageLabelIndex = navigation.indexOf(
      "步骤 5：启动服务，预览企业服务工作台",
    );
    const buttonStart = navigation.lastIndexOf("<button", stageLabelIndex);
    const buttonEnd = navigation.indexOf(">", buttonStart);
    const serviceStageButton = navigation.slice(buttonStart, buttonEnd + 1);

    expect(stageLabelIndex).toBeGreaterThan(-1);
    expect(serviceStageButton).not.toContain("disabled");

    const activation = renderToStaticMarkup(
      <ServiceActivation
        project={project}
        paymentPending={false}
        onCheckout={vi.fn()}
        onSubmitProfile={vi.fn(async () => undefined)}
        onCreateAccount={vi.fn(async () => undefined)}
        onCheckStatus={vi.fn(async () => undefined)}
        onBack={vi.fn()}
      />,
    );

    expect(activation).toContain("企业服务工作台样例");
    expect(activation).toContain("豪华版企业服务工作台样例");
    expect(activation).toContain("预览不会触发签约、付款或真实交付");
    expect(activation).not.toContain("提交合同主体与签约经办人");
  });

  it("hands an active customer off only to the URL returned for that service", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      preview: undefined,
      serviceActivation: {
        ...fixture.serviceActivation!,
        status: "active" as const,
        accountDisplayName: "真实企业名称",
        accountUsername: "real.customer",
        accountSetupUrl: undefined,
        workspaceUrl: "https://workspace.example.com/company/real",
      },
    };
    const html = renderToStaticMarkup(
      <GeoWorkspaceHandoff project={project} onRefresh={vi.fn()} />,
    );

    expect(html).toContain("真实企业名称");
    expect(html).toContain("real.customer");
    expect(html).toContain('href="https://workspace.example.com/company/real"');
    expect(html).toContain("进入企业服务工作台");
    expect(html).not.toContain("语义资产库");
    expect(html).not.toContain("https://dashboard.frontmind.net/");
  });

  it("shows a recoverable configuration warning instead of a generic workspace fallback", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      preview: undefined,
      serviceActivation: {
        ...fixture.serviceActivation!,
        status: "active" as const,
        accountSetupUrl: undefined,
        workspaceUrl: undefined,
      },
    };
    const html = renderToStaticMarkup(
      <GeoWorkspaceHandoff project={project} onRefresh={vi.fn()} />,
    );

    expect(html).toContain("后台尚未返回工作台地址");
    expect(html).toContain("重新获取开通信息");
    expect(html).not.toContain('href="https://dashboard.frontmind.net/');
  });

  it("does not hand off to a credential-bearing or private workspace URL", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      preview: undefined,
      serviceActivation: {
        ...fixture.serviceActivation!,
        status: "active" as const,
        accountSetupUrl: "https://user:secret@workspace.example.com/setup",
        workspaceUrl: "https://127.0.0.1/admin",
      },
    };
    const html = renderToStaticMarkup(
      <GeoWorkspaceHandoff project={project} onRefresh={vi.fn()} />,
    );

    expect(html).toContain("后台尚未返回工作台地址");
    expect(html).not.toContain("user:secret");
    expect(html).not.toContain("127.0.0.1");
  });

  it("offers a manual assessment retry while keeping forecast support-only", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      preview: undefined,
      assessment: {
        ...fixture.assessment!,
        status: "failed" as const,
        totalScore: undefined,
        error: "评估任务失败",
      },
      optimizationForecast: {
        ...fixture.optimizationForecast!,
        status: "failed" as const,
        currentScore: undefined,
        targetLow: undefined,
        targetHigh: undefined,
        error: "预测任务失败",
      },
      assessmentRetryAvailable: true,
      optimizationForecastRetryAvailable: true,
    };
    const assessmentHtml = renderToStaticMarkup(
      <CurrentAssessment
        project={project}
        onContact={vi.fn()}
        onRetryAssessment={vi.fn()}
      />,
    );
    const forecastHtml = renderToStaticMarkup(
      <OptimizationForecastView
        project={{
          ...project,
          assessment: {
            ...fixture.assessment!,
            status: "ready",
          },
        }}
        onContact={vi.fn()}
      />,
    );

    expect(assessmentHtml).toContain("联系技术支持");
    expect(assessmentHtml).toContain("重新评估");
    expect(assessmentHtml).toContain("现状评估暂未生成");
    expect(assessmentHtml).not.toContain("知识库对照评估未能完成");
    expect(assessmentHtml).not.toContain("刷新评估");
    expect(assessmentHtml).not.toContain("最后刷新");
    expect(forecastHtml).toContain("联系技术支持");
    expect(forecastHtml).not.toContain("重新生成优化评估");
    expect(forecastHtml).not.toContain("正在重试");
  });

  it("keeps manual assessment retry available after the legacy retry flag is exhausted", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      preview: undefined,
      assessmentRetryAvailable: false,
      optimizationForecastRetryAvailable: false,
      assessment: {
        ...fixture.assessment!,
        status: "failed" as const,
        totalScore: undefined,
        error: "评估任务再次失败",
      },
      optimizationForecast: {
        ...fixture.optimizationForecast!,
        status: "failed" as const,
        currentScore: undefined,
        targetLow: undefined,
        targetHigh: undefined,
        error: "预测任务再次失败",
      },
    };
    const assessmentHtml = renderToStaticMarkup(
      <CurrentAssessment
        project={project}
        onContact={vi.fn()}
        onRetryAssessment={vi.fn()}
      />,
    );
    const forecastHtml = renderToStaticMarkup(
      <OptimizationForecastView
        project={{
          ...project,
          assessment: {
            ...fixture.assessment!,
            status: "ready",
          },
        }}
        onContact={vi.fn()}
      />,
    );

    expect(assessmentHtml).toContain("联系技术支持");
    expect(assessmentHtml).toContain("评估需支持");
    expect(assessmentHtml).toContain("重新评估");
    expect(assessmentHtml).not.toContain("评估待重试");
    expect(forecastHtml).toContain("联系技术支持");
    expect(forecastHtml).not.toContain("重新生成优化评估");
  });

  it("disables manual assessment retry while a retry request is in flight", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      preview: undefined,
      assessmentRetryAvailable: false,
      assessment: {
        ...fixture.assessment!,
        status: "failed" as const,
        totalScore: undefined,
        error: "评估任务失败",
      },
    };
    const html = renderToStaticMarkup(
      <CurrentAssessment
        project={project}
        onContact={vi.fn()}
        onRetryAssessment={vi.fn()}
        retryingAssessment
      />,
    );

    expect(html).toContain("正在重新评估");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).toContain("联系技术支持");
  });

  it.each(["failed", "partial_review"] as const)(
    "offers an actionable support entry when paid monitoring is %s",
    (status) => {
      const fixture = createGeoStylePreviewProject();
      const project = {
        ...fixture,
        preview: undefined,
        monitoring: {
          ...fixture.monitoring!,
          status,
          error: status === "failed" ? "采集服务返回异常" : undefined,
        },
      };
      const html = renderToStaticMarkup(
        <MonitoringResults
          project={project}
          onRefresh={vi.fn(async () => undefined)}
          refreshing={false}
          onContact={vi.fn()}
        />,
      );

      expect(html).toContain("联系技术支持");
      expect(html).toContain("<button");
      expect(html).not.toContain("重新支付");
    },
  );

  it("renders all 26 canonical sources in the single source box", () => {
    const sources = Array.from({ length: 26 }, (_, index) => ({
      title: `可追溯来源 ${index + 1}`,
      url: `https://references.example.invalid/${index + 1}`,
    }));
    const html = renderMonitoringAnswerSources({
      sources,
      citations: [
        {
          title: "不应展示的实际引用",
          url: "https://citations.example.invalid/hidden",
        },
      ],
      references: [],
    });

    expect(html).toContain("可追溯来源 26 条");
    expect(html).toContain("可追溯来源");
    expect(html).toContain("可追溯来源 1");
    expect(html).toContain("可追溯来源 26");
    expect(html).toContain('href="https://references.example.invalid/26"');
    expect(html).toContain("以下为本次回答关联的可追溯来源，供进一步核验。");
    expect(html).not.toContain("答案实际引用");
    expect(html).not.toContain("不应展示的实际引用");
  });

  it("does not expose citation-only source data in a monitoring answer", () => {
    const html = renderMonitoringAnswerSources({
      sources: [],
      citations: [
        {
          title: "仅存在于 citations 的来源",
          url: "https://citations.example.invalid/only",
        },
      ],
      references: [],
    });

    expect(html).toContain("可追溯来源 0 条");
    expect(html).not.toContain("答案实际引用");
    expect(html).not.toContain("仅存在于 citations 的来源");
    expect(html).not.toContain("https://citations.example.invalid/only");
  });

  it("keeps the retrieval-reference empty state when no sources return", () => {
    const html = renderMonitoringAnswerSources({
      sources: [],
      citations: [],
      references: [],
    });

    expect(html).toContain("可追溯来源");
    expect(html).toContain("0 条");
    expect(html).toContain("平台本轮未返回可追溯来源。");
  });

  it("uses retrieval-only copy while waiting for the first answer", () => {
    const fixture = createGeoStylePreviewProject();
    const html = renderToStaticMarkup(
      <MonitoringResults
        project={{
          ...fixture,
          monitoring: {
            ...fixture.monitoring!,
            status: "capturing",
            completedRecords: 0,
            failedRecords: 0,
            answers: [],
          },
        }}
        onRefresh={vi.fn(async () => undefined)}
        refreshing={false}
        onContact={vi.fn()}
      />,
    );

    expect(html).toContain(
      "回答返回后，将按平台和轮次展示正文、媒体和检索参考来源。",
    );
    expect(html).not.toContain("答案实际引用");
  });

  it("uses a neutral synchronization label instead of the fixture date", () => {
    const project = createGeoStylePreviewProject();
    const question = project.questions.find(
      (item) => item.id === project.serviceActivation?.questionId,
    );
    expect(question).toBeDefined();

    const html = renderToStaticMarkup(
      <GeoAgentUserDashboard
        project={project}
        question={question!}
        categoryLabel="产品场景"
        active
      />,
    );

    expect(html).toContain("项目数据已同步");
    expect(html).toContain("已生效 · 30 天单题服务");
    expect(html).not.toContain("更新于 07/03");
  });

  it("uses the new service overview as the simplified dashboard landing page", () => {
    const fixture = createGeoStylePreviewProject();
    const selectedQuestion = fixture.questions.find(
      (item) => item.id === fixture.serviceActivation?.questionId,
    );
    expect(selectedQuestion).toBeDefined();
    const companyName = "动态企业验收样本";
    const questionText = "动态服务问题是否会从项目数据正确渲染？";
    const project = {
      ...fixture,
      title: companyName,
      knowledgeBase: fixture.knowledgeBase
        ? {
            ...fixture.knowledgeBase,
            companyName,
          }
        : undefined,
      questions: fixture.questions.map((item) =>
        item.id === selectedQuestion!.id
          ? { ...item, question: questionText }
          : item,
      ),
    };

    const html = renderToStaticMarkup(
      <GeoAgentUserDashboard
        project={project}
        question={{ ...selectedQuestion!, question: questionText }}
        categoryLabel="产品场景"
        active={false}
      />,
    );

    expect(html).toContain("服务概览");
    expect(html).toContain("当前服务版本");
    expect(html).toContain("基础版");
    expect(html).toContain("当前知识库");
    expect(html).toContain("套餐配额");
    expect(html).toContain("智能服务路径");
    expect(html).toContain(companyName);
    expect(html).toContain(questionText);
    expect(html.match(/应答逻辑智能体/g)).toHaveLength(2);
    expect(html.match(/品牌全域词库/g)).toHaveLength(1);
    expect(html).toMatch(
      /进度报告<\/h4><span[^>]*class="geo-agent-journey-status state-pending">待前置/,
    );
    expect(html).not.toContain("内容制作体系");
  });

  it("renders the luxury workspace sample with service scope and demo disclosure", () => {
    const project = createGeoStylePreviewProject();
    const question = project.questions.find(
      (item) => item.id === project.serviceActivation?.questionId,
    );
    expect(question).toBeDefined();

    const html = renderToStaticMarkup(
      <GeoAgentUserDashboard
        project={{ ...project, preview: undefined }}
        question={question!}
        categoryLabel="美誉舆情"
        active={false}
        sampleMode="luxury"
      />,
    );

    expect(html).toContain('aria-label="豪华版企业服务工作台样例"');
    expect(html).toContain("豪华版工作台样例");
    expect(html).toContain("下列进度与数量为界面演示");
    expect(html).toContain("32 个品牌问题");
    expect(html).toContain("6 个主流 AI 平台");
    expect(html).toContain("行业排名");
    expect(html).toContain("竞品对比");
    expect(html).toContain("美誉舆情");
    expect(html).toContain("产品场景");
    expect(html).toContain("权威内容与 AI 友好官网");
    expect(html).toContain("演示数据 · 不代表实际交付");
  });

  it("mirrors the latest Agent response-logic workspace as a compact read-only view", () => {
    const project = createGeoStylePreviewProject();
    const question = project.questions.find(
      (item) => item.id === project.selectedQuestionId,
    );
    expect(question).toBeDefined();

    const html = renderToStaticMarkup(
      <IntentPanel
        project={project}
        question={question!}
        categoryLabel="美誉舆情"
        view="intent-logic"
      />,
    );

    expect(html).toContain('aria-label="应答逻辑简略工作台"');
    expect(html).toContain('aria-label="应答逻辑问题目录"');
    expect(html).toContain('aria-label="企业交流与资料补充"');
    expect(html).toContain('aria-label="应答逻辑预填"');
    expect(html).toContain(question!.question);
    expect(html).toContain("当前知识调用");
    expect(html).toContain("官网基础版展示已同步的流程骨架");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("提交企业资料");
  });

  it("keeps the service overview honest when backend fields are missing", () => {
    const fixture = createGeoStylePreviewProject();
    const fallbackQuestion = fixture.questions[0];
    expect(fallbackQuestion).toBeDefined();
    const project = {
      ...fixture,
      knowledgeBase: undefined,
      questions: [],
      selectedQuestionId: undefined,
      selectedPlatformIds: [],
      monitoring: undefined,
      assessment: undefined,
      optimizationForecast: undefined,
      serviceActivation: undefined,
    };

    const html = renderToStaticMarkup(
      <GeoAgentUserDashboard
        project={project}
        question={fallbackQuestion!}
        categoryLabel="美誉舆情"
        active={false}
      />,
    );

    expect(html).toContain("知识库待接入");
    expect(html).toContain("开通后由 Agent 同步");
    expect(html).toContain("当前服务问题");
    expect(html).toContain("待选择");
    expect(html).not.toContain("1 个已选问题");
    expect(html).not.toContain("企业知识库");
  });

  it("uses the Agent knowledge import status instead of the pre-service knowledge draft", () => {
    const fixture = createGeoStylePreviewProject();
    const selectedQuestion = fixture.questions[0];
    expect(selectedQuestion).toBeDefined();
    const project = {
      ...fixture,
      serviceActivation: fixture.serviceActivation
        ? {
            ...fixture.serviceActivation,
            knowledgeImport: {
              status: "failed" as const,
              message: "知识库导入返回可重试错误",
              retryable: true,
            },
          }
        : undefined,
    };

    const html = renderToStaticMarkup(
      <GeoAgentUserDashboard
        project={project}
        question={selectedQuestion!}
        categoryLabel="美誉舆情"
        active={false}
      />,
    );

    expect(html).toContain("知识库同步需处理");
    expect(html).toContain("知识库导入返回可重试错误");
    expect(html).toMatch(
      /知识库展示<\/h4><span[^>]*class="geo-agent-journey-status state-attention">需处理/,
    );
  });

  it("renders every API roadmap action and keeps conditions inside the route panel", () => {
    const project = createGeoStylePreviewProject();
    const html = renderToStaticMarkup(
      <ProgressPanel project={project} active view="progress-report" />,
    );

    expect(html).toContain("分阶段执行路线");
    expect(html).toContain("核验主体、方案边界与服务承诺");
    expect(html).toContain("形成可公开与待核验口径清单");
    expect(html).toContain("路线执行条件");
    expect(html).toContain("阶段验收");
    expect(html).not.toContain("验收与复测要求");
    expect(html).not.toContain("需同口径复测");
    expect(html).not.toContain("执行前提");
  });

  it("does not invent roadmap phases or planned assets when APIs return none", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      optimizationForecast: undefined,
      knowledgeBase: fixture.knowledgeBase
        ? { ...fixture.knowledgeBase, assets: [] }
        : undefined,
    };
    const progressHtml = renderToStaticMarkup(
      <ProgressPanel project={project} active view="progress-report" />,
    );
    const assetsHtml = renderToStaticMarkup(<AssetsPanel project={project} />);

    expect(progressHtml).toContain("等待优化评估 API 返回分阶段路线");
    expect(progressHtml).not.toContain("事实校准");
    expect(progressHtml).not.toContain("同口径复测");
    expect(assetsHtml).toContain("当前知识库 API 未返回可展示的图文素材");
    expect(assetsHtml).not.toContain("本月 GEO 问题 FAQ 与标准回答页");
    expect(assetsHtml).not.toContain("企业全景介绍与品牌事实稿");
    expect(assetsHtml).not.toContain("待排期");
  });

  it("keeps model conversation text inside the execution log instead of the progress page", () => {
    const fixture = createGeoStylePreviewProject();
    const project = {
      ...fixture,
      status: "analyzing" as const,
      knowledgeBase: undefined,
      executionLog: {
        currentEntryId: "enterprise-analysis",
        fetchedAt: "2026-07-26T08:00:00.000Z",
        updatedAt: "2026-07-26T08:00:00.000Z",
        entries: [
          {
            id: "enterprise-analysis",
            stage: "enterprise_analysis" as const,
            title: "企业分析",
            status: "running" as const,
            progress: 42,
            events: [
              {
                id: "status-event",
                kind: "status" as const,
                message: "后台任务正在执行",
              },
              {
                id: "model-event",
                kind: "model_output" as const,
                message: "仅允许在执行日志中展示的模型对话",
              },
            ],
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
      />,
    );

    expect(html).toContain("后台任务正在执行");
    expect(html).not.toContain("仅允许在执行日志中展示的模型对话");
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("42%");
  });
});
