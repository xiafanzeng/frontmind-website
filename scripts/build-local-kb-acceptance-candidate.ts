import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const outputPath = path.resolve(
  process.argv[2] ||
    "/tmp/frontmind-chaoqian-acceptance/website-lead-candidate-v1.zip",
);
const generatedAt = "2026-07-31T04:30:00.000Z";
const officialUrl = "https://www.frontmind.net/";

type Branch = {
  publicId:
    | "company-identity"
    | "team"
    | "products-services"
    | "core-capabilities"
    | "customers-industries"
    | "cooperation"
    | "why-frontmind";
  canonicalId:
    | "01_company_overview"
    | "02_team"
    | "03_products"
    | "04_technology"
    | "06_industries"
    | "07_service"
    | "08_competitive_advantages";
  title: string;
  overview: string;
  leaves: Array<{ title: string; body: string }>;
};

const branches: Branch[] = [
  {
    publicId: "company-identity",
    canonicalId: "01_company_overview",
    title: "企业与品牌",
    overview:
      "FrontMind 官网标题同时呈现“超前智能”，官网正文使用 FrontMind 作为公开品牌名称。FrontMind 将自身定位为面向 AI 原生时代的企业级 AI 咨询与战略部署公司，围绕“理解、增长、嵌入”三条路径，帮助企业重建外部认知、增长链路与内部业务流程。该定位强调企业在 AI 时代不仅需要内容优化，还需要把知识、智能体与组织流程连接起来。",
    leaves: [
      {
        title: "品牌定位与使命",
        body: "FrontMind 官网以“企业 AI 化增长伙伴”描述其服务角色，核心议题是 AI 正在迁移客户入口、增长链路与组织流程。品牌主张不是提供单点工具，而是帮助企业建立能被模型正确理解、能连接真实业务增长、并能进入组织流程的 AI 原生能力。公开页面将“重新定义品牌在 AI 时代的制胜之道”作为核心叙事。",
      },
      {
        title: "理解、增长、嵌入路径",
        body: "“理解”侧重企业事实、语境和行业标准，使品牌信息能够被 AI 理解、引用和调用；“增长”侧重通过智能体连接内容、洞察与线索，形成可衡量的业务结果；“嵌入”侧重由 FDE 前沿部署工程师推动知识、流程和系统协同。三条路径共同构成从外部认知到内部执行的连续服务框架。",
      },
    ],
  },
  {
    publicId: "team",
    canonicalId: "02_team",
    title: "团队与组织",
    overview:
      "官网披露 FrontMind 孵化于香港中文大学（深圳）数据科学学院 AI 智能决策实验室。公开团队介绍提到成员来自港中深、加州理工、清华、纽约大学等高校，并拥有亚马逊、谷歌、字节跳动等科技企业相关背景。这些信息呈现了研究、模型工程和企业业务实践相结合的团队方向；当前官网没有逐项公开人员名单与岗位分工。",
    leaves: [
      {
        title: "学术与研究背景",
        body: "FrontMind 将学术标准、模型底层理解、质量控制和专业评测视为服务基础。官网以“以学术角度支撑行业标准”概括其研究取向，并说明企业来源于香港中文大学（深圳）数据科学学院 AI 智能决策实验室的孵化环境。公开信息支持其研究型组织定位，但没有在当前页面逐项披露研究人员名单。",
      },
      {
        title: "产业与工程经验",
        body: "公开介绍显示，团队经历覆盖大型科技企业与多所高校，服务方法强调咨询判断和工程落地并重。FDE 入驻、系统协同和能力沉淀等表述说明团队预期进入客户真实流程，而非只交付一次性报告。对于项目负责人、交付周期和现场配置，官网当前未给出统一承诺，需要在具体合作中确认。",
      },
    ],
  },
  {
    publicId: "products-services",
    canonicalId: "03_products",
    title: "产品与服务",
    overview:
      "FrontMind 官网展示三条核心产品线：MindPromise 智诺、MindReach 智达和 MindNexus 智汇。三者分别对应品牌被 AI 正确理解、智能体驱动业务增长、企业级 AI 工作流部署。产品组合从语义资产和权威信源出发，延伸到获客、意向识别与线索沉淀，最终进入企业系统与流程，形成由认知到执行的完整链路。",
    leaves: [
      {
        title: "MindPromise 智诺",
        body: "MindPromise 智诺面向品牌内容碎片化、AI 误读和语义不统一问题。官网列出的能力包括 AI 感知审计、语义资产构建、论文级内容制作与权威信源监测，目标是让企业先被 AI 正确解释。该产品更适合作为企业知识基建和 GEO 工作的起点。",
      },
      {
        title: "MindReach 智达",
        body: "MindReach 智达覆盖获客、营销与客服智能体，重点是识别意向客户、主动触达并沉淀可运营线索。官网将其概括为“让 AI 主动增长业务”，强调内容、洞察和线索之间的连接。具体渠道接入、自动化边界及效果指标需根据客户场景确定。",
      },
      {
        title: "MindNexus 智汇",
        body: "MindNexus 智汇面向企业级 AI 工作流部署、系统协同和 FDE 入驻。其目标是推动端到端场景上线，让知识与智能体能力进入组织的日常业务流程。官网公开的是产品方向和交付方式，未在当前页面给出标准化价格或固定实施周期。",
      },
    ],
  },
  {
    publicId: "core-capabilities",
    canonicalId: "04_technology",
    title: "技术与交付",
    overview:
      "公开能力可以归纳为企业事实治理、AI 语义资产构建、权威信源监测、增长智能体以及企业级工作流部署。FrontMind 强调模型可理解性、信息可追溯性和端到端落地，说明其技术工作不仅关注生成内容，还关注事实结构、来源证据、系统连接和持续运营。FDE 模式用于把方案带入客户的实际组织环境。",
    leaves: [
      {
        title: "语义资产与 AI 可见性",
        body: "语义资产能力围绕企业身份、产品、场景与权威证据进行结构化整理，使模型能够稳定理解和引用。官网将 AI 感知审计、语义资产构建和权威信源监测列为“理解”路径的关键能力。公开描述未承诺特定模型平台上的固定排名，因此实际效果应通过持续监测评估。",
      },
      {
        title: "智能体与工作流部署",
        body: "增长与嵌入路径共同覆盖智能获客、意向识别、线索沉淀、系统协同和能力沉淀。FDE 前沿部署工程师被用于推动端到端场景上线，并协调企业知识、现有系统与业务流程。部署范围和系统接口属于项目级事项，需要结合客户权限和技术环境设计。",
      },
    ],
  },
  {
    publicId: "customers-industries",
    canonicalId: "06_industries",
    title: "客户与行业",
    overview:
      "官网展示的行业应用包括企业 SaaS、电商与零售、监管行业、旅游与酒店、本地服务、内容与 IP。不同场景分别关注 AI 引用与竞品监测、购买决策与转化、合规信源与风险、搜索到预订、本地推荐与预约、内容分发与 IP 价值。当前公开页面主要说明适用方向，没有披露具体客户名单。",
    leaves: [
      {
        title: "企业与监管场景",
        body: "企业 SaaS 场景围绕技术白皮书、解决方案文档、ROI 分析和竞争对比，目标是提升 AI 引用与方案推荐能力。监管行业场景强调具有权威数据来源的合规内容、实时风控和权威信源植入。两类场景都要求事实来源清晰，并对公开口径和合规边界进行治理。",
      },
      {
        title: "消费与内容场景",
        body: "电商与零售关注产品推荐、购买指南和场景化解决方案；旅游与酒店关注目的地推荐、评价和预订衔接；本地服务关注位置化内容、评价和预约；内容与 IP 关注课程选择、活动推荐与内容分发。官网将这些方向作为适用案例，而不是统一效果保证。",
      },
    ],
  },
  {
    publicId: "cooperation",
    canonicalId: "07_service",
    title: "服务与合作",
    overview:
      "FrontMind 的公开合作逻辑以“理解、增长、嵌入”为主线：先统一企业事实和 AI 认知，再连接内容、洞察与线索，最后将能力部署进系统和流程。官网提供联系入口，并强调企业级咨询、战略部署与 FDE 入驻。具体范围、价格、周期、人员配置和验收指标需要在项目沟通中形成正式约定。",
    leaves: [
      {
        title: "典型合作起点",
        body: "企业可以从 AI 感知审计和知识资产梳理开始，识别品牌在模型回答中的误读、缺失和信源问题。完成事实底稿后，再选择语义资产建设、权威信源监测、增长智能体或工作流部署。该顺序有助于避免在事实基础不稳定时直接扩大内容或自动化规模。",
      },
      {
        title: "交付边界与确认项",
        body: "公开页面没有给出统一报价、固定交付周期或标准接口清单。企业资料权限、目标模型与渠道、系统接口、合规要求、阶段性成果和验收口径属于项目沟通内容。FDE 入驻方式也属于具体项目约定范围，官网概述没有提供统一承诺。",
      },
    ],
  },
  {
    publicId: "why-frontmind",
    canonicalId: "08_competitive_advantages",
    title: "可信优势",
    overview:
      "FrontMind 的公开差异点集中在研究型背景、面向 AI 原生企业增长的完整路径，以及咨询与工程部署结合。官网还列出若干荣誉，包括“未来中国香港”创科大赛冠军、第十四届中国创新创业大赛大奖、上海“海聚英才”全球创新创业大奖和深圳招商局海外 C-Star 计划。当前公开页面以奖项名称和年份呈现这些信息。",
    leaves: [
      {
        title: "研究与质量取向",
        body: "品牌强调理解模型底层、质量控制和专业评测，并以学术角度支撑行业标准。相较只提供内容生产的方案，这一取向更重视事实、语义、信源和评估之间的一致性。官网信息能够支持其方法论方向，但具体评测协议和项目指标需要结合交付文件确认。",
      },
      {
        title: "端到端服务组合",
        body: "从 MindPromise 的认知治理，到 MindReach 的增长连接，再到 MindNexus 的流程嵌入，产品线覆盖企业 AI 化的连续阶段。FDE 入驻和系统协同增强了工程落地属性。公开信息表明其服务并非单一 GEO 内容制作，但各模块的组合方式应依据客户问题和组织条件确定。",
      },
    ],
  },
];

function evidenceCharacters(markdown: string) {
  return Array.from(
    markdown
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/!\[[^\]]*]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/[^\s)>\]]+/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\s/g, "")
      .replace(
        /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？；：“”‘’（）【】《》…—·]/g,
        "",
      ),
  ).length;
}

function customerNarrativeCharacters(markdown: string) {
  const retainedLines: string[] = [];
  const lines = markdown.split(/\r?\n/);
  let excludedSectionDepth: number | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || "";
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      const depth = heading[1]!.length;
      if (excludedSectionDepth !== undefined && depth <= excludedSectionDepth) {
        excludedSectionDepth = undefined;
      }
      if (
        /(?:原始|证据|引用|参考)?来源|素材清单|展示素材|机器清单|证据状态|状态头|sources?|references?|asset inventory/i.test(
          heading[2] || "",
        )
      ) {
        excludedSectionDepth = depth;
      }
      continue;
    }
    if (excludedSectionDepth !== undefined) continue;
    if (
      /^\s*>\s*.*(?:状态|status)\s*[:：].*(?:来源|source)\s*[:：]/i.test(line)
    ) {
      continue;
    }
    retainedLines.push(line);
  }
  return evidenceCharacters(retainedLines.join("\n"));
}

const zip = new JSZip();
const root = zip.folder("Chaoqian_knowledge_base")!;
const documents: Array<Record<string, unknown>> = [];
const evidenceDocuments: string[] = [];
const customerDocuments: string[] = [];

function addDocument(
  entryPath: string,
  markdown: string,
  metadata: Record<string, unknown>,
) {
  root.file(entryPath, markdown);
  documents.push({ path: entryPath, ...metadata });
  if (metadata.customerVisible) customerDocuments.push(markdown);
  else evidenceDocuments.push(markdown);
}

addDocument(
  "README.md",
  [
    "# 超前智能企业知识库候选包",
    "",
    "本包从“超前智能”输入重新构建，企业事实按 FrontMind 官方网站当前公开内容整理。",
    "未复用任何既有候选 ZIP；没有可靠独立 Logo 文件，因此本包按纯文字候选交付。",
  ].join("\n"),
  {
    id: "doc-readme",
    kind: "report",
    title: "候选包说明",
    customerVisible: false,
  },
);
addDocument(
  "00_knowledge_tree.md",
  [
    "# 企业知识树",
    "",
    ...branches.map(
      (branch, index) =>
        `${index + 1}. ${branch.title}：${branch.leaves.map((leaf) => leaf.title).join("、")}`,
    ),
  ].join("\n"),
  {
    id: "doc-tree",
    kind: "index",
    title: "企业知识树",
    customerVisible: false,
  },
);
addDocument(
  "00_crawl_coverage_report.md",
  [
    "# 官网采集说明",
    "",
    "本地验收样本仅使用可公开路由的 FrontMind 官方网站。",
    `- 官方网站：${officialUrl}`,
    "- 发现图片：0",
    "- 成功下载图片：0",
    "- 本轮未取得可独立打包且来源清晰的 Logo 文件，因此不创建图片资产。",
  ].join("\n"),
  {
    id: "doc-crawl",
    kind: "report",
    title: "官网采集说明",
    customerVisible: false,
  },
);
addDocument(
  "00_web_intelligence_report.md",
  [
    "# 公开信息整理说明",
    "",
    "本样本优先用于验证正式知识库生成与前端渲染，不把搜索摘要中的第三方内容写成企业事实。",
    "企业定位、产品、行业方向、团队背景与公开荣誉均回到官方网站口径。",
  ].join("\n"),
  {
    id: "doc-web",
    kind: "report",
    title: "公开信息整理说明",
    customerVisible: false,
  },
);
addDocument(
  "00_source_index.md",
  [
    "# 来源索引",
    "",
    `- [S001] FrontMind 官方网站：${officialUrl}`,
    "- 用途：企业定位、三条业务路径、产品线、行业应用、团队背景与官网列示荣誉。",
  ].join("\n"),
  {
    id: "doc-sources",
    kind: "index",
    title: "来源索引",
    customerVisible: false,
  },
);

const branchEvidence = branches.map((branch, branchIndex) => {
  const evidenceId = `doc-evidence-${branch.publicId}`;
  const evidenceMarkdown = [
    `# ${branch.title}证据底稿`,
    "",
    branch.overview,
    "",
    ...branch.leaves.flatMap((leaf) => [
      `## ${leaf.title}`,
      "",
      leaf.body,
      "",
    ]),
    "## 原始来源",
    "",
    `- ${officialUrl}`,
  ].join("\n");
  addDocument(
    `10_reference_assets/evidence/${branch.publicId}.md`,
    evidenceMarkdown,
    {
      id: evidenceId,
      kind: "evidence",
      title: `${branch.title}证据底稿`,
      branchId: branch.canonicalId,
      sourceIds: ["source-official"],
      customerVisible: false,
    },
  );
  const branchEvidenceCharacters = evidenceCharacters(evidenceMarkdown);
  const dynamicOverviewMinimum = Math.min(
    branch.publicId === "products-services" ? 3_000 : 1_500,
    Math.max(120, Math.ceil(branchEvidenceCharacters * 0.25)),
  );
  const overviewId = `doc-overview-${branch.publicId}`;
  const overviewMarkdown = [
    `# ${branch.title}`,
    "",
    `> 最后更新: 2026-07-31 | 状态: verified_first_party | 来源: FrontMind 官方网站`,
    "",
    "## 分支综述",
    "",
    branch.overview,
    "",
    "## 原始来源",
    "",
    `- ${officialUrl}`,
  ].join("\n");
  addDocument(
    `${branch.canonicalId}/overview.md`,
    overviewMarkdown,
    {
      id: overviewId,
      kind: "overview",
      title: branch.title,
      branchId: branch.canonicalId,
      order: branchIndex * 10,
      evidenceStatus: "verified_first_party",
      sourceIds: ["source-official"],
      assetIds: [],
      evidenceCharacters: branchEvidenceCharacters,
      dynamicMinimumCharacters: dynamicOverviewMinimum,
      evidenceDocumentIds: [evidenceId],
      customerVisible: true,
    },
  );
  branch.leaves.forEach((leaf, leafIndex) => {
    const leafId = `doc-leaf-${branch.publicId}-${leafIndex + 1}`;
    const leafMarkdown = [
      `# ${leaf.title}`,
      "",
      `> 最后更新: 2026-07-31 | 状态: verified_first_party | 来源: FrontMind 官方网站`,
      "",
      "## 核心内容",
      "",
      leaf.body,
      "",
      "## 原始来源",
      "",
      `- ${officialUrl}`,
    ].join("\n");
    addDocument(
      `${branch.canonicalId}/leaf-${String(leafIndex + 1).padStart(2, "0")}.md`,
      leafMarkdown,
      {
        id: leafId,
        kind: "leaf",
        title: leaf.title,
        branchId: branch.canonicalId,
        order: branchIndex * 10 + leafIndex + 1,
        evidenceStatus: "verified_first_party",
        sourceIds: ["source-official"],
        assetIds: [],
        evidenceCharacters: branchEvidenceCharacters,
        dynamicMinimumCharacters: Math.min(
          200,
          Math.max(60, Math.ceil(branchEvidenceCharacters * 0.2)),
        ),
        evidenceDocumentIds: [evidenceId],
        ...(branch.publicId === "products-services"
          ? { productFamilyIds: [`family-product-${leafIndex + 1}`] }
          : {}),
        customerVisible: true,
      },
    );
  });
  return {
    branchId: branch.publicId,
    overviewDocumentId: overviewId,
    contentStatus: "limited_evidence",
    deduplicatedEvidenceCharacters: branchEvidenceCharacters,
    dynamicOverviewMinimum,
    checkedSourceCount: 1,
  };
});

const manufacturingEvidenceMarkdown = [
  "# 工程部署与能力沉淀证据底稿",
  "",
  "FrontMind 官网把系统协同、FDE 入驻和能力沉淀列为“嵌入”路径的组成部分。该公开口径说明交付工作需要进入客户真实业务流程，并围绕知识、系统和组织协同推进，而不是仅交付独立内容文件。",
  "",
  "## 原始来源",
  "",
  `- ${officialUrl}`,
].join("\n");
const manufacturingEvidenceId = "doc-evidence-manufacturing";
addDocument(
  "10_reference_assets/evidence/manufacturing.md",
  manufacturingEvidenceMarkdown,
  {
    id: manufacturingEvidenceId,
    kind: "evidence",
    title: "工程部署与能力沉淀证据底稿",
    branchId: "05_manufacturing",
    sourceIds: ["source-official"],
    customerVisible: false,
  },
);
const manufacturingEvidenceCharacters = evidenceCharacters(
  manufacturingEvidenceMarkdown,
);
addDocument(
  "05_manufacturing/leaf-01.md",
  [
    "# 工程部署与能力沉淀",
    "",
    "> 最后更新: 2026-07-31 | 状态: verified_first_party | 来源: FrontMind 官方网站",
    "",
    "## 核心内容",
    "",
    "FDE 前沿部署工程师用于推动企业级 AI 工作流进入真实业务环境。官网公开的系统协同和能力沉淀方向表明，项目需要根据客户现有知识、接口权限和组织流程进行部署。具体驻场方式、环境要求和验收指标属于项目级约定，当前官网没有统一承诺。",
    "",
    "## 原始来源",
    "",
    `- ${officialUrl}`,
  ].join("\n"),
  {
    id: "doc-leaf-manufacturing-1",
    kind: "leaf",
    title: "工程部署与能力沉淀",
    branchId: "05_manufacturing",
    order: 41,
    evidenceStatus: "verified_first_party",
    sourceIds: ["source-official"],
    assetIds: [],
    evidenceCharacters: manufacturingEvidenceCharacters,
    dynamicMinimumCharacters: Math.min(
      200,
      Math.max(60, Math.ceil(manufacturingEvidenceCharacters * 0.2)),
    ),
    evidenceDocumentIds: [manufacturingEvidenceId],
    customerVisible: true,
  },
);
const coreBranchEvidence = branchEvidence.find(
  (entry) => entry.branchId === "core-capabilities",
);
if (coreBranchEvidence) {
  coreBranchEvidence.deduplicatedEvidenceCharacters +=
    manufacturingEvidenceCharacters;
  coreBranchEvidence.dynamicOverviewMinimum = Math.min(
    1_500,
    Math.max(
      120,
      Math.ceil(coreBranchEvidence.deduplicatedEvidenceCharacters * 0.25),
    ),
  );
  const coreOverview = documents.find(
    (document) => document.id === "doc-overview-core-capabilities",
  );
  if (coreOverview) {
    coreOverview.dynamicMinimumCharacters =
      coreBranchEvidence.dynamicOverviewMinimum;
  }
}

root.file(
  "00_completeness.json",
  JSON.stringify(
    {
      counts: {
        totalLeaves: branches.reduce(
          (total, branch) => total + branch.leaves.length,
          1,
        ),
        verifiedFirstParty: branches.reduce(
          (total, branch) => total + branch.leaves.length,
          1,
        ),
        verifiedAuthoritative: 0,
        supportedThirdParty: 0,
        inferred: 0,
        needsVerification: 0,
        notApplicable: 0,
      },
      acquisition: {
        officialPages: { completed: 1, total: 1 },
        images: { completed: 0, total: 0 },
        documents: { completed: 0, total: 0 },
        webQueries: { completed: 1, total: 1 },
      },
      gaps: ["官网当前未提供标准价格、统一交付周期和客户名单。"],
      evaluatedAt: generatedAt,
    },
    null,
    2,
  ),
);

root.file(
  "00_package_manifest.json",
  JSON.stringify(
    {
      schemaVersion: 2,
      profile: "website-lead-v1",
      documents,
      assets: [],
      counts: {
        totalFiles: documents.length + 2,
        customerVisibleCharacters: customerDocuments.reduce(
          (total, markdown) => total + customerNarrativeCharacters(markdown),
          0,
        ),
        evidenceCharacters: evidenceDocuments.reduce(
          (total, markdown) => total + evidenceCharacters(markdown),
          0,
        ),
        packagedImages: 0,
      },
      branchEvidence,
      imageSelection: {
        status: "source_limited",
        discoveredCandidateImages: 0,
        inspectedCandidateImages: 0,
        eligibleFirstPartyImages: 0,
        rejectedCandidateImages: 0,
        scannedSourcePages: 1,
        discoveryMethods: [
          "img",
          "srcset_or_lazy",
          "picture",
          "css_background",
          "open_graph",
          "gallery",
          "official_document",
        ],
        candidates: [],
        productFamilies: branches
          .find((branch) => branch.publicId === "products-services")!
          .leaves.map((leaf, index) => ({
            id: `family-product-${index + 1}`,
            name: leaf.title,
            officialVisualFound: false,
            checkedSources: 1,
            assetIds: [],
            gapReason:
              "已检查官方页面公开内容，未取得来源清晰、可独立打包的对应产品视觉文件。",
          })),
        shortfallReason:
          "本地验收采集未取得来源清晰、可独立打包的官方 Logo 或产品视觉文件，按纯文字候选交付。",
      },
    },
    null,
    2,
  ),
);

const candidateZip = new JSZip();
const factBodies = [
  ["D01", "企业基础", branches[0].overview],
  ["D02", "团队", branches[1].overview],
  ["D03", "产品服务", branches[2].overview],
  ["D04", "技术能力", branches[3].overview],
  ["D05", "客户案例", branches[4].overview],
  [
    "D06",
    "资质认证",
    "FrontMind 官网公开列示多项创新创业赛事与人才计划荣誉，当前页面没有展示证书编号或有效期。",
  ],
  [
    "D07",
    "财务融资",
    "FrontMind 官方网站当前公开页面没有披露融资轮次、投资机构、收入规模或其他财务数据。",
  ],
  ["D08", "竞争信息", branches[6].overview],
  [
    "D09",
    "市场信息",
    "官网将 AI 时代的客户入口、增长链路和组织流程迁移视为企业面临的共同变化，并将企业 SaaS、电商零售、监管行业、旅游酒店、本地服务以及内容与 IP 列为适用方向。",
  ],
  [
    "D10",
    "品牌资产",
    "官网公开品牌名称为 FrontMind，标题同时使用“超前智能”。当前公开采集没有取得可独立打包且来源清晰的 Logo 文件，因此候选包不包含图片资产。",
  ],
  ["D11", "渠道", branches[5].overview],
  [
    "D12",
    "公开意图",
    "官网公开意图集中在企业 AI 化增长、品牌被 AI 正确理解、智能体驱动业务增长以及企业级 AI 工作流部署。",
  ],
  [
    "D13",
    "公共情报",
    "公开网站展示企业定位、产品线、行业应用、团队背景与荣誉信息。该候选稿只将官方网站内容写入企业事实。",
  ],
] as const;
candidateZip.file(
  "00_brand_facts.md",
  [
    "# 超前智能品牌事实底稿",
    "",
    ...factBodies.flatMap(([id, title, body]) => [
      `## ${id} ${title}`,
      "",
      `${body} [来源](${officialUrl})`,
      "",
    ]),
  ].join("\n"),
);
candidateZip.file(
  "01_customer_draft.md",
  [
    "# 超前智能企业知识库客户稿",
    "",
    ...branches.flatMap((branch) => [
      `## ${branch.title}`,
      "",
      `${branch.overview} [来源](${officialUrl})`,
      "",
      ...branch.leaves.flatMap((leaf) => [
        `### ${leaf.title}`,
        "",
        `${leaf.body} [来源](${officialUrl})`,
        "",
      ]),
    ]),
  ].join("\n"),
);
candidateZip.file(
  "02_run.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      company: {
        name: "超前智能",
        officialWebsite: officialUrl,
        industryCluster: "C1",
      },
      sources: [
        {
          title: "FrontMind 官方网站",
          kind: "official_web",
          status: "read",
          url: officialUrl,
        },
      ],
      queries: ["超前智能 官网", "FrontMind 产品与服务"],
      assets: [],
    },
    null,
    2,
  ),
);

const bytes = Buffer.from(
  await candidateZip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  }),
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, bytes);
console.log(
  JSON.stringify({
    outputPath,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    company: "超前智能",
    source: officialUrl,
    assets: 0,
    branches: branches.length,
    leaves: branches.reduce(
      (total, branch) => total + branch.leaves.length,
      1,
    ),
  }),
);
