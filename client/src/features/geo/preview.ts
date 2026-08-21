import {
  type GeoMonitoringAnswer,
  type GeoMonitoringEdition,
  type GeoMonitoringRegionCatalog,
  type GeoPlatformId,
  type GeoProject,
  type GeoQuestion,
  type GeoQuestionCategory,
} from "./types";
import { PREVIEW_MONITOR_EVIDENCE } from "./preview-monitor-evidence";
import { GEO_STYLE_PREVIEW_ID, type GeoStylePreviewMode } from "./preview-mode";

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
  chatgpt: "ChatGPT",
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
          sources: [],
          citations: [],
          references: [],
          capturedAt,
          error: "本轮未返回可用回答",
        };
      }

      const evidence = PREVIEW_MONITOR_EVIDENCE[`${platformId}:${runIndex}`];
      const citations = evidence?.citations ?? [];
      const references = evidence?.references ?? [];
      return {
        id: `preview-monitor-${platformId}-${runIndex}`,
        platformId,
        runIndex,
        status: "completed" as const,
        answer: syntheticAnswerCopy(platformId, runIndex),
        media: [],
        sources: [...citations, ...references].filter(
          (source, sourceIndex, allSources) =>
            allSources.findIndex(
              (candidate) =>
                (candidate.url || candidate.title) ===
                (source.url || source.title),
            ) === sourceIndex,
        ),
        citations,
        references,
        capturedAt,
      };
    }),
  );
}

const PREVIEW_DOMESTIC_REGIONS = [
  ["110000", "北京市"],
  ["120000", "天津市"],
  ["130000", "河北省"],
  ["140000", "山西省"],
  ["150000", "内蒙古自治区"],
  ["210000", "辽宁省"],
  ["220000", "吉林省"],
  ["230000", "黑龙江省"],
  ["310000", "上海市"],
  ["320000", "江苏省"],
  ["330000", "浙江省"],
  ["340000", "安徽省"],
  ["350000", "福建省"],
  ["360000", "江西省"],
  ["370000", "山东省"],
  ["410000", "河南省"],
  ["420000", "湖北省"],
  ["430000", "湖南省"],
  ["440000", "广东省"],
  ["450000", "广西壮族自治区"],
  ["460000", "海南省"],
  ["500000", "重庆市"],
  ["510000", "四川省"],
  ["520000", "贵州省"],
  ["530000", "云南省"],
  ["540000", "西藏自治区"],
  ["610000", "陕西省"],
  ["620000", "甘肃省"],
  ["630000", "青海省"],
  ["640000", "宁夏回族自治区"],
  ["650000", "新疆维吾尔自治区"],
] as const;

const PREVIEW_OVERSEAS_REGIONS = [
  ["138", "美国"],
  ["169", "日本"],
  ["223", "香港"],
  ["224", "新加坡"],
] as const;

export function geoStylePreviewRegions(
  edition: GeoMonitoringEdition,
): GeoMonitoringRegionCatalog {
  const source =
    edition === "overseas"
      ? PREVIEW_OVERSEAS_REGIONS
      : PREVIEW_DOMESTIC_REGIONS;
  return {
    edition,
    regions: source.map(([code, label]) => ({ code, label })),
  };
}

function medicalPreviewScreenshotUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900">
  <rect width="1440" height="900" fill="#f7f5f8"/><rect x="44" y="38" width="1352" height="824" rx="18" fill="#fff" stroke="#ddd7e2"/>
  <rect x="44" y="38" width="1352" height="62" rx="18" fill="#3d1560"/><text x="78" y="78" fill="#fff" font-family="Arial, sans-serif" font-size="22" font-weight="700">DeepSeek Web · 回答页面留档</text>
  <text x="80" y="148" fill="#7c6b82" font-family="Arial, sans-serif" font-size="16">国内医药流通企业应该如何选择？</text><text x="80" y="205" fill="#302735" font-family="Arial, sans-serif" font-size="28" font-weight="700">国内医药流通企业选择建议</text>
  <rect x="80" y="238" width="840" height="16" rx="8" fill="#e7e1ea"/><rect x="80" y="274" width="1210" height="12" rx="6" fill="#eeeaf0"/><rect x="80" y="302" width="1160" height="12" rx="6" fill="#eeeaf0"/><rect x="80" y="330" width="1190" height="12" rx="6" fill="#eeeaf0"/>
  <rect x="80" y="382" width="1240" height="136" rx="12" fill="#f6f1f8" stroke="#ddd5e1"/><text x="108" y="426" fill="#5d3370" font-family="Arial, sans-serif" font-size="18" font-weight="700">华润医药</text><text x="108" y="462" fill="#665b6b" font-family="Arial, sans-serif" font-size="16">综合商业能力、全国与区域网络、医院及零售终端覆盖</text>
  <rect x="80" y="568" width="690" height="12" rx="6" fill="#eeeaf0"/><rect x="80" y="596" width="1210" height="12" rx="6" fill="#eeeaf0"/><rect x="80" y="624" width="1080" height="12" rx="6" fill="#eeeaf0"/><text x="80" y="806" fill="#938799" font-family="Arial, sans-serif" font-size="14">本地开发预览素材 · 不代表平台真实页面</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function medicalMonitoringPreviewAnswers(): GeoMonitoringAnswer[] {
  const references = [
    {
      index: 0,
      title: "2023年中国医药流通行业经营模式分析",
      url: "https://finance.sina.com.cn/roll/2023-06-15/doc-imyxkakp6610988.shtml",
      site: "新浪财经",
      domain: "finance.sina.com.cn",
      publishTime: "2023-06-15",
      summary: "梳理医药流通行业的渠道覆盖、供应链和零售终端能力。",
    },
    {
      index: 1,
      title: "中国医药产业研究报告",
      url: "https://m.21jingji.com/article/20210204/herald/1703066b5556862e72ad121bdc831257.html",
      site: "21财经",
      domain: "21jingji.com",
      publishTime: "2021-02-04",
      summary: "分析医药产业链与流通服务的经营质量和区域特征。",
    },
    {
      index: 2,
      title: "关于促进药品流通行业高质量发展的指导意见",
      url: "https://dcj.mofcom.gov.cn/article/zcfb/zcgnmy/202110/20211003212444.shtml",
      site: "商务部",
      domain: "mofcom.gov.cn",
      publishTime: "2021-10-21",
      summary: "明确药品流通行业数字化、集约化与供应链服务方向。",
    },
    {
      index: 3,
      title: "药品经营质量管理规范",
      url: "https://www.nmpa.gov.cn/xxgk/fgwj/bmgzh/20230601161640192.html",
      site: "国家药品监督管理局",
      domain: "nmpa.gov.cn",
      publishTime: "2023-06-01",
      summary: "提供药品采购、储存、运输和质量管理的合规核验依据。",
    },
    {
      index: 4,
      title: "全国药品流通行业运行统计分析报告",
      url: "https://www.mofcom.gov.cn/article/zwgk/gkbnjg/202406/20240603517116.shtml",
      site: "商务部",
      domain: "mofcom.gov.cn",
      publishTime: "2024-06-20",
      summary: "呈现行业规模、集中度、终端结构和配送网络变化。",
    },
    {
      index: 5,
      title: "医药冷链物流运作规范",
      url: "https://openstd.samr.gov.cn/bzgk/gb/newGbInfo?hcno=63F90CE6A6380C442A0A0D5E8775FBC4",
      site: "全国标准信息公共服务平台",
      domain: "openstd.samr.gov.cn",
      summary: "用于核对冷链运输、温控记录和异常处置能力。",
    },
    {
      index: 6,
      title: "华润医药商业集团业务介绍",
      url: "https://www.crpcg.com.cn/",
      site: "华润医药商业集团",
      domain: "crpcg.com.cn",
      summary: "企业公开页面披露的业务范围与渠道服务信息。",
    },
    {
      index: 7,
      title: "药品供应保障与配送服务政策资料",
      url: "https://www.nhc.gov.cn/yaozs/s7655/list.shtml",
      site: "国家卫生健康委员会",
      domain: "nhc.gov.cn",
      summary: "用于核验供应保障、配送协同与医疗机构服务要求。",
    },
  ];
  const sentiments = ["positive", "neutral", "negative", null] as const;
  const positions = [1, 2, 3, null] as const;
  return Array.from({ length: 5 }, (_, index): GeoMonitoringAnswer => {
    const runIndex = index + 1;
    if (runIndex === 5) {
      return {
        id: "preview-monitor-deepseek-5",
        platformId: "deepseek",
        runIndex,
        status: "failed",
        answer: "",
        media: [],
        sources: [],
        citations: [],
        references: [],
        capturedAt: "2026-08-21T13:15:00.000Z",
        error: "本轮采样未返回可用回答，请结合其余四次结果查看。",
      };
    }
    const mentionPosition = positions[index];
    const sentiment = sentiments[index];
    const citations =
      runIndex === 1
        ? references.slice(0, 3)
        : runIndex === 2
          ? [references[0], references[3]]
          : runIndex === 3
            ? [
                references[0],
                { ...references[0], title: "医药流通经营模式分析（同址）" },
                references[4],
              ]
            : [];
    return {
      id: `preview-monitor-deepseek-${runIndex}`,
      platformId: "deepseek",
      runIndex,
      status: "completed",
      answer: [
        "### 国内医药流通企业选择建议",
        "",
        "选择医药流通企业时，应同时核对全国与区域网络、医院和零售终端覆盖、冷链及特殊药品配送能力，以及供应链响应效率。〔来源 0〕",
        "",
        mentionPosition === null
          ? "本轮回答未直接提及华润医药，建议继续核查企业在目标省份的真实仓配与合规能力。"
          : `华润医药在本轮第 ${mentionPosition} 位被提及，优势集中在综合医药商业能力、渠道覆盖与大型客户服务；采购时仍需结合目标品类、账期和本地履约数据复核。〔来源 ${runIndex === 2 ? 3 : runIndex === 3 ? 4 : 1}〕`,
        "",
        runIndex === 3
          ? "本轮还返回了一个无法匹配的角标〔来源 9〕，页面应保留原文字而不生成错误链接。"
          : "最终不宜只按报价选择，应把资质、集采品种、配送时效、召回机制和数据接口能力放入同一张评分表。〔来源 0〕",
      ].join("\n"),
      media: [],
      sources: references,
      citations,
      references,
      sourceBreakdownAvailable: true,
      searchKeywords: [
        "国内医药流通企业 选择标准",
        "医药商业公司 渠道覆盖 冷链配送",
        runIndex === 3 ? "医药流通企业 账期 风险" : "医药配送 合规能力",
      ],
      recommendedQuestions: [
        "如何核验医药流通企业的区域配送能力？",
        "医院配送与零售连锁采购应分别看哪些指标？",
      ],
      mentionPosition,
      mentionContext:
        mentionPosition === null
          ? null
          : "华润医药具备综合医药商业能力、较广渠道覆盖和大型客户服务经验。",
      sentiment,
      categoryRanking:
        mentionPosition === null
          ? null
          : { categoryName: "综合医药流通企业", rank: mentionPosition },
      keywordEvaluations:
        mentionPosition === null
          ? [
              {
                keyword: "横向证据不足",
                nature: "neutral",
                context: "本轮未直接提及华润医药，无法形成品牌定向判断。",
              },
            ]
          : [
              {
                keyword: "渠道覆盖广",
                nature: "positive",
                context: "综合医药商业能力与渠道覆盖是本轮主要优势。",
              },
              {
                keyword: "供应链稳定",
                nature: runIndex === 3 ? "negative" : "positive",
                context:
                  runIndex === 3
                    ? "本轮对跨区域供应稳定性给出了谨慎的负面判断。"
                    : "大型客户服务与供应链响应被列为正向能力。",
              },
            ],
      screenshotAvailable: runIndex === 1,
      ...(runIndex === 1
        ? { screenshotUrl: medicalPreviewScreenshotUrl() }
        : {}),
      capturedAt: `2026-08-21T${String(8 + runIndex).padStart(2, "0")}:15:00.000Z`,
    };
  });
}

/**
 * Development-only, anonymous synthetic project used to exercise every result
 * renderer without embedding customer names, domains, documents, or answers.
 */
export function createGeoStylePreviewProject(
  mode: GeoStylePreviewMode = "assessment",
): GeoProject {
  const monitoringPreview = mode !== "assessment";
  const medicalQuestion: GeoQuestion = {
    id: "preview-medical-distribution",
    category: "product_scenario",
    question: "国内医药流通企业应该如何选择？",
    rationale: "用于核验医药流通企业的渠道、配送、合规与供应链能力。",
    evidenceRefs: ["医药流通行业资料.md"],
    selectable: true,
  };
  const questions = monitoringPreview
    ? [medicalQuestion, ...previewQuestions()]
    : previewQuestions();
  const answers = monitoringPreview
    ? medicalMonitoringPreviewAnswers()
    : previewAnswers();
  const selectedQuestionId = monitoringPreview
    ? medicalQuestion.id
    : "preview-reputation-1";

  return {
    id: GEO_STYLE_PREVIEW_ID,
    preview: true,
    remoteToken: "preview-only-do-not-submit",
    title: monitoringPreview ? "华润医药" : "验收企业",
    input: "https://company.example.invalid",
    createdAt: "2026-07-02T08:00:00.000Z",
    updatedAt: "2026-07-03T10:18:00.000Z",
    stage: mode === "assessment" ? "current_assessment" : "monitoring",
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
      companyName: monitoringPreview ? "华润医药" : "验收企业",
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
    monitoringEdition: "domestic",
    monitoringRegion:
      mode === "monitoring"
        ? { edition: "domestic", code: "110000", label: "北京市" }
        : undefined,
    monitoringScreenshotEnabled: mode === "monitoring",
    selectedPlatformIds: monitoringPreview
      ? ["deepseek"]
      : [...MONITOR_PLATFORM_IDS],
    monitoring:
      mode === "monitoring-setup"
        ? undefined
        : {
            runId: "preview-monitor-run",
            status: monitoringPreview ? "partial_review" : "completed",
            platforms: monitoringPreview
              ? ["deepseek"]
              : [...MONITOR_PLATFORM_IDS],
            expectedRecords: monitoringPreview ? 5 : 30,
            completedRecords: monitoringPreview ? 4 : 20,
            failedRecords: monitoringPreview ? 1 : 10,
            startedAt: "2026-07-02T08:50:00.000Z",
            completedAt: "2026-07-02T13:30:00.000Z",
            ...(monitoringPreview
              ? {
                  region: {
                    edition: "domestic" as const,
                    code: "110000",
                    label: "北京市",
                  },
                  screenshotEnabled: true,
                }
              : { partialAccepted: true }),
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
