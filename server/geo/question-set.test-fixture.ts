import {
  GeoQuestionSetSchema,
  PRODUCT_QA_INTENTS,
  type GeoQuestion,
} from "./schemas";

export function buildValidQuestionSet(companyName = "Acme") {
  const reputation = [
    `${companyName}的企业背景和团队能力有哪些公开依据？`,
    `${companyName}具备哪些资质、认证或行业认可？`,
    `${companyName}的技术和项目交付能力是否可靠？`,
    `${companyName}如何说明数据安全与合规边界？`,
    `${companyName}的持续服务和客户口碑怎么样？`,
  ];
  const product = [
    `${companyName} 的服务模块 1 是什么，主要解决哪些业务问题？`,
    `${companyName} 的服务模块 2 包含哪些关键功能和工作机制？`,
    `${companyName} 的服务模块 3 适合哪些客户与应用场景？`,
    `${companyName} 的服务模块 4 通常如何部署和完成交付？`,
    `${companyName} 的服务模块 5 有哪些使用限制与支持边界？`,
  ];
  const industry = [
    "科研企业 GEO 服务商有哪些值得推荐？",
    "企业知识库建设服务商有哪些推荐？",
    "品牌 AI 认知优化领域有哪些代表性公司？",
    "企业级 AI 工作流部署方案怎么选，头部厂商有哪些？",
    "提供持续 GEO 监测服务的平台有哪些推荐？",
  ];
  const comparison = [
    `${companyName}与传统 SEO 服务在交付目标上有什么区别？`,
    `${companyName}和同类方案相比，分别适合哪些客户场景？`,
    `${companyName}与通用 AI 平台在部署方式上有什么差异？`,
    `企业自建团队还是选择${companyName}的交付服务更合适？`,
    `${companyName}与同类企业服务相比，持续支持边界有何不同？`,
  ];

  const questions: GeoQuestion[] = [
    ...reputation.map((question, index) => ({
      id: `reputation-${String(index + 1).padStart(2, "0")}`,
      category: "reputation" as const,
      question,
      rationale: `核验企业可信度维度 ${index + 1} 的独立客户决策与证据基础。`,
      evidenceRefs: [`01_company_overview/item-${index + 1}.md`],
      selectable: true,
    })),
    ...product.map((question, index) => ({
      id: `product-scenario-${String(index + 1).padStart(2, "0")}`,
      category: "product_scenario" as const,
      question,
      rationale: `解释产品与服务意图 ${index + 1} 对应的使用和采购判断。`,
      enterpriseAnchor: companyName,
      offeringAnchor: `服务模块 ${index + 1}`,
      qaIntent: PRODUCT_QA_INTENTS[index],
      evidenceRefs: [`03_products/module-${index + 1}/overview.md`],
      selectable: true,
    })),
    ...industry.map((question, index) => ({
      id: `industry-ranking-${String(index + 1).padStart(2, "0")}`,
      category: "industry_ranking" as const,
      question,
      rationale: `覆盖品类发现维度 ${index + 1} 的候选名单与开放推荐意图。`,
      evidenceRefs: [`06_industries/item-${index + 1}.md`],
      selectable: false,
    })),
    ...comparison.map((question, index) => ({
      id: `competitor-comparison-${String(index + 1).padStart(2, "0")}`,
      category: "competitor_comparison" as const,
      question,
      rationale: `比较采购维度 ${index + 1} 的方案差异和客户取舍依据。`,
      evidenceRefs: [`08_competitive_advantages/item-${index + 1}.md`],
      selectable: true,
    })),
  ];

  return GeoQuestionSetSchema.parse({ questions });
}
