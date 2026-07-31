import {
  GeoQuestionSetSchema,
  PRODUCT_QA_INTENTS,
  type GeoQuestion,
} from "./schemas";

export function buildValidQuestionSet(companyName = "Acme") {
  const reputation = [
    `${companyName}值得信赖吗？`,
    `${companyName}的产品和服务稳定吗？`,
    `${companyName}保护客户数据安全吗？`,
    `${companyName}的售后服务好吗？`,
    `客户对${companyName}的口碑怎么样？`,
  ];
  const product = [
    `${companyName} 的服务模块 1 主要解决哪些业务问题？`,
    `${companyName} 的服务模块 2 的关键功能如何工作？`,
    `${companyName} 的服务模块 3 适合哪些客户场景？`,
    `${companyName} 的服务模块 4 如何部署交付？`,
    `${companyName} 的服务模块 5 的支持边界是什么？`,
  ];
  const industry = [
    "科研企业 GEO 服务商有哪些值得推荐？",
    "企业知识库建设服务商有哪些推荐？",
    "品牌 AI 认知优化领域有哪些代表性公司？",
    "企业级 AI 工作流部署有哪些头部服务商？",
    "提供持续 GEO 监测服务的平台有哪些推荐？",
  ];
  const competitorAnchors = [
    "云杉科技",
    "星河智能",
    "青峰云",
    "海岳数据",
    "云岚科技",
  ];
  const comparison = [
    `${companyName}与云杉科技在核心功能上有什么区别？`,
    `${companyName}与星河智能在客户场景上有什么区别？`,
    `${companyName}与青峰云在部署方式上有什么差异？`,
    `${companyName}与海岳数据在服务边界上有什么差异？`,
    `${companyName}与云岚科技在长期运维服务上有什么差异？`,
  ];

  const questions: GeoQuestion[] = [
    ...reputation.map((question, index) => ({
      id: `reputation-${String(index + 1).padStart(2, "0")}`,
      category: "reputation" as const,
      question,
      rationale: `核验企业可信度维度 ${index + 1} 的独立客户决策与证据基础。`,
      enterpriseAnchor: companyName,
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
      enterpriseAnchor: companyName,
      competitorAnchor: competitorAnchors[index],
      evidenceRefs: [`08_competitive_advantages/item-${index + 1}.md`],
      selectable: true,
    })),
  ];

  return GeoQuestionSetSchema.parse({ questions });
}
