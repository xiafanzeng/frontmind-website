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
  GeoWorkspaceHandoff,
  MonitoringResults,
  OptimizationForecastView,
  ServiceActivation,
  StageNavigation,
} from "./GeoBuildExperience";
import { KnowledgeCompletenessDetails } from "./KnowledgeCompletenessDialog";
import { createGeoStylePreviewProject } from "./preview";

describe("GEO style preview rendering", () => {
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
    const project = createGeoStylePreviewProject();
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onRetry={vi.fn()}
        onNewProject={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
        retrying={false}
      />,
    );

    expect(html).toContain("完整度评估 87%");
    expect(html).toContain("知识库完整度");
    expect(html).not.toContain("首要优先级");
    expect(html).not.toContain("P0");
    expect(html).not.toContain("急需修复");
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
        onRetry={vi.fn()}
        onNewProject={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
        retrying={false}
      />,
    );

    expect(html).toContain("知识库结构校验已通过");
    expect(html).toContain("摘要暂不可用");
    expect(html).toContain("暂无可展示摘要");
    expect(html).not.toContain("全面抓取已完成");
    expect(html).not.toContain("官网与权威公开来源");
    expect(html).not.toContain("已完成系统整理");
  });

  it("only offers an authorized enterprise-analysis retry and locks it in flight", () => {
    const project = {
      ...createGeoStylePreviewProject(),
      status: "failed" as const,
      knowledgeBase: undefined,
      knowledgeBaseRetryAvailable: true,
      error: "知识库结构校验未通过。",
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onRetry={vi.fn()}
        onNewProject={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
        retrying
      />,
    );

    expect(html).toContain("知识库结构校验未通过");
    expect(html).toContain("正在重新检查");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("自动修复次数已用完");
    expect(html).not.toContain("新建企业项目");
  });

  it("offers a fresh project instead of a dead retry after repair is exhausted", () => {
    const project = {
      ...createGeoStylePreviewProject(),
      status: "failed" as const,
      knowledgeBase: undefined,
      knowledgeBaseRetryAvailable: false,
      error: "知识库结构校验仍未通过。",
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onRetry={vi.fn()}
        onNewProject={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
        retrying={false}
      />,
    );

    expect(html).toContain("自动修复次数已用完");
    expect(html).toContain("请新建企业项目后重新提交资料");
    expect(html).toContain("新建企业项目");
    expect(html).not.toContain("重新检查");
  });

  it("routes an unknown knowledge-base state to support without claiming retries are exhausted", () => {
    const project = {
      ...createGeoStylePreviewProject(),
      status: "failed" as const,
      knowledgeBase: undefined,
      knowledgeBaseRetryAvailable: false,
      knowledgeBaseSupportRequired: true,
      error: "企业知识库任务状态暂不可识别，系统已阻止重复创建。",
    };
    const html = renderToStaticMarkup(
      <EnterpriseAnalysis
        project={project}
        onDownload={vi.fn()}
        onRetry={vi.fn()}
        onNewProject={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
        retrying={false}
      />,
    );

    expect(html).toContain("联系技术支持");
    expect(html).not.toContain("自动修复次数已用完");
    expect(html).not.toContain("新建企业项目");
    expect(html).not.toContain("重新检查");
  });

  it("only offers an authorized question retry and locks it in flight", () => {
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
        onRetry={vi.fn()}
        onNewProject={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
        retrying
      />,
    );

    expect(html).toContain("问题推荐未能完成");
    expect(html).toContain("正在重新生成");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("联系技术支持");
  });

  it("replaces an exhausted question retry with technical support", () => {
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
        onRetry={vi.fn()}
        onNewProject={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
        retrying={false}
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
          }
        : undefined,
    };
    const html = renderToStaticMarkup(
      <OptimizationForecastView project={project} onContact={vi.fn()} />,
    );

    expect(html).toContain("核验主体、方案边界与服务承诺");
    expect(html).toContain("形成可公开与待核验口径清单");
    expect(html).toContain("路线执行条件");
    expect(html).toContain("目标适用限制");
    expect(html).toContain("仅适用于本次问题与所选平台样本");
    expect(html).toContain("预期 81.5");
    expect(html).toContain("A 为挑战上沿");
    expect(html).toContain("原始现状分");
    expect(html).toContain("原始目标下沿");
    expect(html).toContain("原始预期分");
    expect(html).toContain("原始目标上沿");
    expect(html).toContain("可测项口径");
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

  it("renders every structured assessment result in the assessment overview", () => {
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
    expect(html).toContain("来源线索 1 条");
    expect(html).toContain("doubao/run-01");
    expect(html).toContain("评估优先动作");
    expect(html).toContain("真实评估优先动作");
    expect(html).toContain("真实预期影响");
    expect(html).toContain("真实排名计算口径");
    expect(html).toContain("已排名样本");
    expect(html).toContain("前五率");
    expect(html).toContain("竞品排名差");
    expect(html).toContain("真实评估适用限制");
    expect(html).toContain("question_baseline");
    expect(html).toContain("单问题可测口径");
    expect(html).toContain("原始总分");
    expect(html).toContain("原始等级");
    expect(html).toContain("评估覆盖率");
    expect(html).toContain("置信等级");
    expect(html).toContain("完整 BSAS 审计");
    expect(html).toContain("可测项归一分");
    expect(html).toContain("可测项得分");
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
    const labelIndex = html.indexOf("用户角色看板");
    const buttonStart = html.lastIndexOf("<button", labelIndex);
    const buttonEnd = html.indexOf(">", buttonStart);
    const dashboardButton = html.slice(buttonStart, buttonEnd + 1);

    expect(labelIndex).toBeGreaterThan(-1);
    expect(dashboardButton).not.toContain("disabled");
    expect(html).toContain("查看用户端内容骨架");
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

  it("offers explicit retries for failed assessment and forecast jobs", () => {
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
        onRefresh={vi.fn(async () => undefined)}
        onRetryAssessment={vi.fn(async () => undefined)}
        onRetryForecast={vi.fn(async () => undefined)}
        onContact={vi.fn()}
        refreshing
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
        onRetry={vi.fn(async () => undefined)}
        onContact={vi.fn()}
        retrying
      />,
    );

    expect(assessmentHtml).toContain("正在重试");
    expect(assessmentHtml).toContain("disabled");
    expect(assessmentHtml).toContain('aria-busy="true"');
    expect(forecastHtml).toContain("正在重试");
    expect(forecastHtml).toContain("disabled");
    expect(forecastHtml).toContain('aria-busy="true"');
  });

  it("replaces exhausted assessment and forecast retries with technical support", () => {
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
        onRefresh={vi.fn(async () => undefined)}
        onRetryAssessment={vi.fn(async () => undefined)}
        onRetryForecast={vi.fn(async () => undefined)}
        onContact={vi.fn()}
        refreshing={false}
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
        onRetry={vi.fn(async () => undefined)}
        onContact={vi.fn()}
      />,
    );

    expect(assessmentHtml).toContain("联系技术支持");
    expect(assessmentHtml).toContain("评估需支持");
    expect(assessmentHtml).not.toContain("评估待重试");
    expect(assessmentHtml).not.toContain("重新生成评估");
    expect(forecastHtml).toContain("联系技术支持");
    expect(forecastHtml).not.toContain("重新生成优化评估");
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
        onRetry={vi.fn()}
        onNewProject={vi.fn()}
        onContact={vi.fn()}
        onStart={vi.fn()}
        starting={false}
        retrying={false}
      />,
    );

    expect(html).toContain("后台任务正在执行");
    expect(html).not.toContain("仅允许在执行日志中展示的模型对话");
  });
});
