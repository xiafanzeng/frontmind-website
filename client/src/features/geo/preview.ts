import {
  type GeoMonitoringAnswer,
  type GeoPlatformId,
  type GeoProject,
  type GeoQuestion,
  type GeoQuestionCategory,
} from "./types";
import { PREVIEW_MONITOR_EVIDENCE } from "./preview-monitor-evidence";
import { GEO_STYLE_PREVIEW_ID } from "./preview-mode";

export {
  GEO_STYLE_PREVIEW_ID,
  GEO_STYLE_PREVIEW_PARAM,
  isGeoStylePreviewEnabled,
  isGeoStylePreviewProject,
} from "./preview-mode";

const MONITOR_PLATFORM_IDS: GeoPlatformId[] = [
  "doubao",
  "yuanbao",
  "deepseek",
  "baiduai",
  "qianwen",
  "kimi",
];

const COMPLETED_MONITOR_PLATFORM_IDS = new Set<GeoPlatformId>([
  "doubao",
  "yuanbao",
  "deepseek",
  "baiduai",
]);

const PLATFORM_NAMES: Record<GeoPlatformId, string> = {
  doubao: "豆包",
  yuanbao: "元宝",
  deepseek: "DeepSeek",
  baiduai: "百度 AI+",
  qianwen: "通义千问",
  kimi: "Kimi",
};

const QUESTION_COPY: Record<GeoQuestionCategory, string[]> = {
  reputation: [
    "验收企业的公开口碑如何核验？",
    "验收企业是否具备稳定交付能力？",
    "如何确认验收企业的主体与资质？",
    "验收企业的客户评价是否可信？",
    "验收企业出现争议时应如何核查？",
  ],
  product_scenario: [
    "验收企业的方案适合哪些业务场景？",
    "验收企业的方案包含哪些核心能力？",
    "验收企业的服务实施周期如何确认？",
    "验收企业的方案需要哪些前置条件？",
    "验收企业如何提供持续运营支持？",
  ],
  industry_ranking: [
    "该行业有哪些值得关注的服务方案？",
    "该行业的服务商应该从哪些维度评估？",
    "该行业常见的采购决策标准有哪些？",
    "该行业近期有哪些需求变化值得关注？",
    "该行业的解决方案如何验证真实效果？",
  ],
  competitor_comparison: [
    "验收企业与同类方案 A 的差异是什么？",
    "验收企业与同类方案 B 应该如何选择？",
    "验收企业相比通用工具有哪些服务边界？",
    "验收企业与自建方案的成本如何比较？",
    "验收企业适合替代哪些传统工作方式？",
  ],
};

const QUESTION_RATIONALE: Record<GeoQuestionCategory, string> = {
  reputation: "覆盖用户对企业可信度、交付表现与公开评价的核验意图。",
  product_scenario: "覆盖方案能力、适用场景、实施条件与持续服务问题。",
  industry_ranking: "涉及行业词竞争，仅在获得全域服务权限后执行。",
  competitor_comparison: "覆盖差异定位、选择依据与采购决策边界。",
};

function previewQuestions(): GeoQuestion[] {
  return (
    Object.entries(QUESTION_COPY) as Array<[GeoQuestionCategory, string[]]>
  ).flatMap(([category, questions]) =>
    questions.map((question, index) => ({
      id: `preview-${category}-${index + 1}`,
      category,
      question,
      rationale: QUESTION_RATIONALE[category],
      evidenceRefs: ["企业事实底稿.md", "方案与服务边界.md"],
      selectable: category !== "industry_ranking",
    })),
  );
}

function syntheticAnswerCopy(
  platformId: GeoPlatformId,
  runIndex: number,
): string {
  const roundFindings = [
    "能够识别企业主体和方案方向，但交付边界仍需要官方材料补充。",
    "提及了适用场景与核心能力，部分效果描述缺少对应证据页。",
    "回答结构完整，建议把服务承诺与适用条件放在同一引用入口。",
    "能够引用官网概览，但第三方验证材料的覆盖仍然不足。",
    "结论较为稳定，后续应使用同一问题和采样条件持续复测。",
  ];

  return [
    "### 匿名平台验收样本",
    "",
    `${PLATFORM_NAMES[platformId]} 第 ${runIndex} 次返回：验收企业提供面向组织客户的专业服务方案。`,
    "",
    roundFindings[runIndex - 1],
    "",
    "本样本仅用于验证官网对 API 返回文本、引用来源与多轮结果的渲染，不代表任何真实企业或平台观点。",
  ].join("\n");
}

function previewAnswers(): GeoMonitoringAnswer[] {
  return MONITOR_PLATFORM_IDS.flatMap((platformId) =>
    Array.from({ length: 5 }, (_, index) => {
      const runIndex = index + 1;
      const capturedAt = `2026-07-02T${String(8 + runIndex).padStart(2, "0")}:1${index}:00.000Z`;

      if (!COMPLETED_MONITOR_PLATFORM_IDS.has(platformId)) {
        return {
          id: `preview-monitor-${platformId}-${runIndex}-failed`,
          platformId,
          runIndex,
          status: "failed" as const,
          answer: "",
          media: [],
          citations: [],
          references: [],
          capturedAt,
          error: "本轮未返回可用回答",
        };
      }

      const evidence = PREVIEW_MONITOR_EVIDENCE[`${platformId}:${runIndex}`];
      return {
        id: `preview-monitor-${platformId}-${runIndex}`,
        platformId,
        runIndex,
        status: "completed" as const,
        answer: syntheticAnswerCopy(platformId, runIndex),
        media: [],
        citations: evidence?.citations ?? [],
        references: evidence?.references ?? [],
        capturedAt,
      };
    }),
  );
}

/**
 * Development-only, anonymous synthetic project used to exercise every result
 * renderer without embedding customer names, domains, documents, or answers.
 */
export function createGeoStylePreviewProject(): GeoProject {
  const questions = previewQuestions();
  const answers = previewAnswers();
  const selectedQuestionId = "preview-reputation-1";

  return {
    id: GEO_STYLE_PREVIEW_ID,
    preview: true,
    remoteToken: "preview-only-do-not-submit",
    title: "验收企业",
    input: "https://company.example.invalid",
    createdAt: "2026-07-02T08:00:00.000Z",
    updatedAt: "2026-07-03T10:18:00.000Z",
    stage: "current_assessment",
    status: "ready",
    progress: 100,
    progressLabel: "监控采样已结束 · 20 条有效回答进入现状评估",
    files: [
      {
        id: "preview-file-1",
        name: "匿名企业_GEO验收资料.pdf",
        size: 4_856_678,
        type: "application/pdf",
      },
    ],
    knowledgeBase: {
      companyName: "验收企业",
      summary:
        "验收企业是一家用于本地界面验收的匿名合成企业，知识库覆盖企业主体、方案能力、服务边界、实施流程与可信证据。",
      generatedAt: "2026-07-02T08:35:00.000Z",
      archiveName: "匿名企业_GEO知识库.zip",
      reportMarkdown: [
        "# 验收企业知识基建覆盖报告",
        "",
        "## 覆盖结论",
        "- 企业主体、方案能力、服务边界与交付流程已形成事实底稿。",
        "- 匿名官网页面与合成材料已归入可追溯证据索引。",
        "- 重点问题仍需建立稳定回答结构，并通过同口径监控复测。",
      ].join("\n"),
      metrics: [
        { key: "questions", label: "重点问题", value: 11, detail: "四类场景" },
        { key: "samples", label: "回答样本", value: 275, detail: "方案口径" },
        { key: "facts", label: "事实证据砖", value: 6, detail: "核心事实" },
        {
          key: "completeness",
          label: "知识库完整度",
          value: "87%",
          detail: "充分取证 40 / 46",
        },
      ],
      completeness: {
        score: 87,
        label: "知识库完整度",
        basis: "证据完整度 = 已获充分来源支持的适用叶节点 ÷ 全部适用叶节点。",
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
          officialPages: { completed: 128, total: 132 },
          images: { completed: 42, total: 46 },
          documents: { completed: 9, total: 10 },
          webQueries: { completed: 24, total: 28 },
        },
        gaps: [
          "服务效果仍需绑定明确样本、时间范围与统计口径。",
          "部分实施条件需要补充经过确认的企业材料。",
          "第三方可信证据仍需增加可追溯来源。",
        ],
        evaluatedAt: "2026-07-02T08:35:00.000Z",
        caveat:
          "87% 仅衡量本次已定义采集范围与知识节点，不代表对整个互联网的绝对覆盖率。",
      },
      sections: [
        {
          id: "preview-company",
          title: "企业主体与品牌定位",
          summary: "企业主体、品牌定位与核心服务对象。",
          markdown:
            "## 企业主体与品牌定位\n验收企业为匿名合成数据，仅用于校验企业事实、品牌定位和来源状态的展示。",
          evidenceCount: 8,
          status: "verified",
        },
        {
          id: "preview-products",
          title: "方案能力与服务边界",
          summary: "核心能力、交付内容、适用条件与不适用范围。",
          markdown:
            "## 方案能力与服务边界\n- 分别说明方案能力与服务承诺\n- 对效果描述保留条件和证据\n- 未确认信息不进入正式回答",
          evidenceCount: 11,
          status: "verified",
        },
        {
          id: "preview-scenes",
          title: "实施流程与适用场景",
          summary: "前置条件、实施周期、协作角色与持续运营支持。",
          markdown:
            "## 实施流程与适用场景\n围绕采购决策、实施准备、交付验收和持续运营建立可复用问答。",
          evidenceCount: 14,
          status: "verified",
        },
        {
          id: "preview-evidence",
          title: "交付结果与可信证据",
          summary: "效果口径、客户证据、公开来源与核验边界。",
          markdown:
            "## 交付结果与可信证据\n所有效果描述必须绑定样本、时间范围和可追溯来源；缺少证据的结论标记为待核验。",
          evidenceCount: 10,
          status: "needs_verification",
        },
      ],
      sources: [
        {
          id: "preview-source-home",
          title: "验收企业官网｜企业概览",
          url: "https://company.example.invalid/about",
          domain: "company.example.invalid",
          type: "企业官网",
          capturedAt: "2026-07-02T08:10:00.000Z",
        },
        {
          id: "preview-source-solutions",
          title: "验收企业官网｜方案能力",
          url: "https://company.example.invalid/solutions",
          domain: "company.example.invalid",
          type: "企业官网",
          capturedAt: "2026-07-02T08:12:00.000Z",
        },
        {
          id: "preview-source-evidence",
          title: "验收企业官网｜可信证据",
          url: "https://company.example.invalid/evidence",
          domain: "company.example.invalid",
          type: "企业官网",
          capturedAt: "2026-07-02T08:14:00.000Z",
        },
      ],
      assets: [
        {
          id: "preview-asset-overview",
          name: "企业与方案概览",
          sectionId: "preview-company",
          type: "品牌视觉",
          source: "匿名验收资料",
        },
        {
          id: "preview-asset-solution",
          name: "方案能力示意",
          sectionId: "preview-products",
          type: "方案视觉",
          source: "匿名验收资料",
        },
        {
          id: "preview-asset-process",
          name: "实施流程示意",
          sectionId: "preview-scenes",
          type: "流程视觉",
          source: "匿名验收资料",
        },
        {
          id: "preview-asset-evidence",
          name: "可信证据卡",
          sectionId: "preview-evidence",
          type: "证据视觉",
          source: "匿名验收资料",
        },
      ],
    },
    questions,
    selectedQuestionId,
    selectedPlatformIds: [...MONITOR_PLATFORM_IDS],
    monitoring: {
      runId: "preview-monitor-run",
      status: "completed",
      platforms: [...MONITOR_PLATFORM_IDS],
      expectedRecords: 30,
      completedRecords: 20,
      failedRecords: 10,
      startedAt: "2026-07-02T08:50:00.000Z",
      completedAt: "2026-07-02T13:30:00.000Z",
      partialAccepted: true,
      answers,
    },
    assessment: {
      status: "ready",
      totalScore: 64,
      rawTotalScore: 64,
      grade: "B",
      rawGrade: "B",
      structuralExcludedMaxScore: 0,
      applicableMaxScore: 100,
      scopeLabel: "本问题现状综合评分",
      summary:
        "企业主体和方案方向已能被稳定识别，但服务边界、效果口径与第三方证据仍有表达漂移；当前应优先建立可引用的官方答案入口。",
      generatedAt: "2026-07-03T09:50:00.000Z",
      dimensions: [
        {
          id: "semantic_visibility",
          label: "语义可理解度",
          score: 17,
          maxScore: 30,
          summary: "企业主体可被识别，但复杂采购问题中的方案定位仍不稳定。",
        },
        {
          id: "semantic_coherence",
          label: "语义一致性",
          score: 14.5,
          maxScore: 20,
          summary: "核心能力基本一致，服务承诺和适用条件仍需统一口径。",
        },
        {
          id: "semantic_richness",
          label: "语义丰富度",
          score: 16,
          maxScore: 20,
          summary: "场景与流程材料较完整，但需要转成可复用 FAQ 和证据卡。",
        },
        {
          id: "semantic_authority",
          label: "语义权威性",
          score: 7.5,
          maxScore: 15,
          summary: "官方事实已经存在，第三方可核验引用仍然不足。",
        },
        {
          id: "competitive_advantage",
          label: "竞品语义抗压能力",
          score: 9,
          maxScore: 15,
          summary: "差异点能够按采购目标拆解，但仍需压缩无条件比较表述。",
        },
      ],
      comparisons: [
        {
          id: "preview-comparison-entity",
          topic: "企业主体",
          status: "aligned",
          knowledgeBaseFact: "企业主体与品牌名称已经形成统一事实口径。",
          answerFinding: "四个平台均能够稳定识别验收企业及其方案方向。",
          recommendedAction: "把企业主体标准答案设为相关 FAQ 的统一引用入口。",
          platforms: ["baiduai", "doubao", "deepseek", "yuanbao"],
          evidenceRefs: ["企业事实底稿.md#企业主体", "官方来源索引.json"],
        },
        {
          id: "preview-comparison-boundary",
          topic: "服务边界",
          status: "conflict",
          knowledgeBaseFact: "服务范围、前置条件和不适用场景需要分别说明。",
          answerFinding: "部分回答把方案能力与无条件效果承诺混在一起。",
          recommendedAction:
            "建设服务边界标准答案页，禁止缺少条件的绝对化表达。",
          platforms: ["doubao", "yuanbao"],
          evidenceRefs: ["方案与服务边界.md#服务边界", "企业官网-方案能力"],
        },
        {
          id: "preview-comparison-delivery",
          topic: "实施与交付",
          status: "missing",
          knowledgeBaseFact: "实施周期由前置条件、协作范围和验收标准共同决定。",
          answerFinding: "多数回答没有完整交代实施前提和双方协作责任。",
          recommendedAction:
            "制作实施流程图和 FAQ，在同一页面解释周期、责任与验收。",
          platforms: ["baiduai", "doubao", "deepseek", "yuanbao"],
          evidenceRefs: ["实施流程.md", "方案与服务边界.md"],
        },
        {
          id: "preview-comparison-evidence",
          topic: "效果与证据",
          status: "opportunity",
          knowledgeBaseFact: "效果表述应绑定样本、周期、统计口径和来源。",
          answerFinding: "多轮回答使用宽泛效果描述，缺少对应证据锚点。",
          recommendedAction: "建立效果证据卡，用有条件的验证结果替代笼统结论。",
          platforms: ["baiduai", "doubao", "deepseek", "yuanbao"],
          evidenceRefs: ["可信证据.md", "官方来源索引.json"],
        },
      ],
    },
    optimizationForecast: {
      status: "ready",
      horizonWeeks: 4,
      currentScore: 64,
      targetLow: 76.5,
      targetExpected: 81.5,
      targetHigh: 86.5,
      gradeLow: "B",
      gradeHigh: "A",
      challengeUpperOnly: "A",
      rawCurrentScore: 64,
      rawTargetLow: 76.5,
      rawTargetExpected: 81.5,
      rawTargetHigh: 86.5,
      scoreBasis: {
        type: "applicable_scope",
        applicableMaxScore: 100,
        structuralExcludedMaxScore: 0,
      },
      summary:
        "在一个月完成事实校准、重点问答资产上线、权威引用建设与同口径复测的条件下，整体语义资产可稳定处于 B，并以 A 作为挑战区间。",
      dimensions: [
        {
          id: "semantic_visibility",
          label: "语义可理解度",
          currentScore: 17,
          targetLow: 22,
          targetExpected: 23.5,
          targetHigh: 25,
          maxScore: 30,
          summary: "让复杂采购问题也能主动解释方案定位和适用场景。",
          actions: ["建设采购决策问答页", "补齐方案定位解释入口"],
        },
        {
          id: "semantic_coherence",
          label: "语义一致性",
          currentScore: 14.5,
          targetLow: 16,
          targetExpected: 17,
          targetHigh: 18,
          maxScore: 20,
          summary: "统一企业主体、方案边界、服务承诺与实施条件。",
          actions: ["上线方案边界标准答案", "形成可公开与待核验口径清单"],
        },
        {
          id: "semantic_richness",
          label: "语义丰富度",
          currentScore: 16,
          targetLow: 17.5,
          targetExpected: 18,
          targetHigh: 18.5,
          maxScore: 20,
          summary: "把场景、流程和效果材料转成可直接复用的 FAQ 与证据卡。",
          actions: ["建设实施流程与效果证据卡", "制作目标导向方案矩阵"],
        },
        {
          id: "semantic_authority",
          label: "语义权威性",
          currentScore: 7.5,
          targetLow: 10,
          targetExpected: 11,
          targetHigh: 12,
          maxScore: 15,
          summary: "让官方答案和可信证据成为平台优先引用来源。",
          actions: ["建设官方事实中心与结构化数据", "建立外部权威引用链"],
        },
        {
          id: "competitive_advantage",
          label: "竞品语义抗压能力",
          currentScore: 9,
          targetLow: 11,
          targetExpected: 12,
          targetHigh: 13,
          maxScore: 15,
          summary: "差异点能够按采购目标拆解，但仍需压缩无条件比较表述。",
          actions: ["按采购目标拆解方案差异", "避免无依据的优胜表述"],
        },
      ],
      assumptions: [
        "企业主体、方案边界、服务承诺和效果数据均由企业相关负责人确认。",
        "重点官方答案页面完成真实发布，并通过抓取、结构化数据与可访问性检查。",
        "外部引用来自可追溯的行业、媒体或客户公开页面。",
        "第 4 周使用同一问题、同一平台和每平台 5 次回答复测。",
      ],
      roadmap: [
        {
          phase: 1,
          weeks: "第 1 周",
          title: "校准核心事实与传播边界",
          actions: [
            "核验主体、方案边界与服务承诺",
            "形成可公开与待核验口径清单",
          ],
          verificationGate: "六类核心事实均有负责人确认和证据锚点。",
        },
        {
          phase: 2,
          weeks: "第 2 周",
          title: "上线重点官方答案资产",
          actions: ["发布方案能力与服务边界页面", "上线实施流程与效果证据卡"],
          verificationGate: "核心页面可抓取、可索引，FAQ 结构化数据校验通过。",
        },
        {
          phase: 3,
          weeks: "第 3 周",
          title: "建立权威引用与场景分发",
          actions: ["发布目标导向方案矩阵", "向行业媒体与采购场景分发"],
          verificationGate: "官方与外部来源形成可核验的交叉引用。",
        },
        {
          phase: 4,
          weeks: "第 4 周",
          title: "同口径复测与校准",
          actions: ["重复六平台监控", "核查高风险表达和官方引用变化"],
          verificationGate: "问题、平台、重复次数与当前基线保持一致。",
        },
      ],
      generatedAt: "2026-07-03T10:18:00.000Z",
    },
    executionLog: {
      currentEntryId: "optimization-forecast",
      fetchedAt: "2026-07-03T10:18:00.000Z",
      updatedAt: "2026-07-03T10:18:00.000Z",
      entries: [
        {
          id: "enterprise-analysis",
          stage: "enterprise_analysis",
          title: "企业分析",
          status: "completed",
          progress: 100,
          startedAt: "2026-07-02T08:00:00.000Z",
          updatedAt: "2026-07-02T08:35:00.000Z",
          completedAt: "2026-07-02T08:35:00.000Z",
          events: [
            {
              id: "preview-kb-status",
              kind: "status",
              message: "已读取匿名官网与验收资料，正在建立可追溯事实索引。",
              createdAt: "2026-07-02T08:04:00.000Z",
            },
            {
              id: "preview-kb-result",
              kind: "result_summary",
              message:
                "知识库结构校验通过：覆盖 11 个重点问题、6 类事实证据砖与 275 条方案样本。",
              createdAt: "2026-07-02T08:34:00.000Z",
            },
            {
              id: "preview-kb-artifact",
              kind: "artifact",
              message: "已生成知识库归档：匿名企业_GEO知识库.zip",
              createdAt: "2026-07-02T08:35:00.000Z",
            },
          ],
        },
        {
          id: "question-recommendation",
          stage: "question_recommendation",
          title: "问题推荐",
          status: "completed",
          progress: 100,
          startedAt: "2026-07-02T08:36:00.000Z",
          updatedAt: "2026-07-02T08:44:00.000Z",
          completedAt: "2026-07-02T08:44:00.000Z",
          events: [
            {
              id: "preview-question-result",
              kind: "result_summary",
              message: "已生成并校验四类共 20 道 GEO 优化问题。",
              createdAt: "2026-07-02T08:44:00.000Z",
            },
          ],
        },
        {
          id: "monitoring",
          stage: "monitoring",
          title: "问题监控",
          status: "completed",
          progress: 100,
          startedAt: "2026-07-02T08:50:00.000Z",
          updatedAt: "2026-07-02T13:30:00.000Z",
          completedAt: "2026-07-02T13:30:00.000Z",
          counters: { completed: 20, failed: 10, total: 30 },
          events: [
            {
              id: "preview-monitor-status",
              kind: "status",
              message: "已向六个平台提交匿名验收问题，每个平台获取 5 轮回答。",
              createdAt: "2026-07-02T08:50:00.000Z",
            },
            {
              id: "preview-monitor-result",
              kind: "result_summary",
              message:
                "30 个预期样本中已获得 20 条有效回答，10 条失败记录已保留。",
              createdAt: "2026-07-02T13:30:00.000Z",
            },
          ],
        },
        {
          id: "current-assessment",
          stage: "current_assessment",
          title: "现状评估与知识核查",
          status: "completed",
          progress: 100,
          startedAt: "2026-07-03T09:15:00.000Z",
          updatedAt: "2026-07-03T09:50:00.000Z",
          completedAt: "2026-07-03T09:50:00.000Z",
          events: [
            {
              id: "preview-assessment-result",
              kind: "result_summary",
              message:
                "已形成 4 条事实核查结论与五维现状评估，当前总分 64.0，等级 B。",
              createdAt: "2026-07-03T09:50:00.000Z",
            },
          ],
        },
        {
          id: "optimization-forecast",
          stage: "current_assessment",
          title: "优化效果评估",
          status: "completed",
          progress: 100,
          startedAt: "2026-07-03T09:51:00.000Z",
          updatedAt: "2026-07-03T10:18:00.000Z",
          completedAt: "2026-07-03T10:18:00.000Z",
          events: [
            {
              id: "preview-forecast-result",
              kind: "result_summary",
              message:
                "已生成 76.5–86.5 的条件目标区间和四周行动路径，A 为挑战上沿。",
              createdAt: "2026-07-03T10:18:00.000Z",
            },
          ],
        },
      ],
    },
    serviceActivation: {
      status: "profile_required",
      questionId: selectedQuestionId,
      category: "reputation",
      amountFen: 200_000,
      billingMonths: 1,
    },
  };
}
