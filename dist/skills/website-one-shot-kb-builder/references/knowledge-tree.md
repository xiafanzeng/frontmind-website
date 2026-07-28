# Knowledge Tree Structure Reference

## Design Principle: Industry-Adaptive

The tree is not a fixed manufacturing template. It adapts to the enterprise type detected in Phase 1. Seven universal business questions define coverage, while the deliverable always uses the eight canonical content directories required by `output-format.md`:

| #   | Universal question | Canonical directory mapping |
| --- | ------------------ | --------------------------- |
| 1   | 你是谁？           | `01_company_overview/`      |
| 2   | 你的团队？         | `02_team/`                  |
| 3   | 你卖什么？         | `03_products/`              |
| 4   | 你怎么做到的？     | `04_technology/` and/or `05_manufacturing/` |
| 5   | 卖给谁？           | `06_industries/`            |
| 6   | 为什么选你？       | `08_competitive_advantages/` |
| 7   | 怎么合作？         | `07_service/`               |

These questions are a coverage taxonomy, not an alternative filesystem layout or seven summary nodes. Every terminal item below must become a leaf in its mapped canonical directory and must be pre-filled, source-attributed, and evidence-classified automatically. All eight canonical content directories must be present; a directory with no supported fact receives one explicit `needs_verification` gap leaf.

## Universal Tree Template

- **1. 企业身份**
  - 1.1 一句话定位
  - 1.2 企业简介
  - 1.3 发展历程与里程碑
  - 1.4 使命、愿景、价值观
  - 1.5 资质与荣誉
- **2. 团队**
  - 2.1 创始人/核心领导
  - 2.2 核心团队介绍
  - 2.3 团队规模与文化
- **3. 产品/服务**（按真实产品线与服务线动态扩展）
  - 3.X.1 概述与定位
  - 3.X.2 核心参数/功能
  - 3.X.3 差异化卖点
  - 3.X.4 应用场景
  - 3.X.5 客户案例
  - 3.X.6 常见问题
- **4. 核心能力**（按行业选择或推导能力维度）
  - 4.1 能力维度 A
  - 4.2 能力维度 B
  - 4.3 能力维度 C
  - 4.4 能力维度 D
- **5. 客户与行业**（按真实行业/客群动态扩展）
  - 5.X.1 行业痛点
  - 5.X.2 企业方案
  - 5.X.3 成功案例
- **6. 为什么选我们**
  - 6.1 核心竞争优势
  - 6.2 竞品对比
  - 6.3 客户评价与口碑
  - 6.4 数据与成果
- **7. 合作方式**
  - 7.1 合作流程
  - 7.2 定价/商业模式
  - 7.3 售后与支持
  - 7.4 联系方式

## Branch 4 Industry Variants

| 企业类型  | Branch 4 子节点                                |
| --------- | ---------------------------------------------- |
| 制造业    | 生产能力、质量控制体系、供应链管理、定制化能力 |
| SaaS/科技 | 技术架构、数据安全与合规、部署方式、集成与 API |
| 服务/咨询 | 服务方法论、交付流程、团队资质、知识产权       |
| 贸易/电商 | 供应商体系、物流配送、库存管理、品控体系       |
| 教育/培训 | 课程体系、师资力量、教学方法、学习平台         |
| 医疗/健康 | 临床能力、合规资质、设备设施、安全体系         |
| 金融/保险 | 风控体系、合规牌照、技术平台、资金安全         |
| 创意/设计 | 创作流程、工具与技术栈、作品集、版权管理       |

If no listed variant fits, infer at least four capability dimensions from sourced company evidence and industry structure.

## Leaf-Node Inventory and Count

Create the complete inventory before population begins. Product/service and customer/industry leaves must expand for every real line found across uploads, exhaustive official-site crawling and full-web enterprise intelligence. Third-party discoveries may create candidate leaves or enrich existing leaves, but must remain source-labelled until verified.

| Enterprise scope | Product/service lines | Customer industries | Expected leaf nodes |
| ---------------- | --------------------: | ------------------: | ------------------: |
| Small            |                   1–3 |                 2–3 |               40–55 |
| Medium           |                   4–6 |                 3–5 |               60–80 |
| Large            |                  7–10 |                 5–8 |              85–115 |

Never replace the true inventory with an eight-row summary. If the count falls below 40, audit the official-site crawl, product/service expansion, application/case coverage, FAQs, support and media assets before proceeding. Nodes that are genuinely not applicable remain in the inventory with an explained `not_applicable` status.

## Evidence and Completion Status Model

| Status                   | Meaning                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `verified_first_party`   | Directly supported by an upload, official site, or official linked document                 |
| `verified_authoritative` | Supported by a resolved authoritative registry, certification, patent, or equivalent source |
| `supported_third_party`  | Supported by a resolved third-party source and labelled with provenance                     |
| `inferred`               | A bounded synthesis based on cited evidence, never presented as a confirmed company claim   |
| `needs_verification`     | Content exists but lacks adequate or conflict-free evidence                                 |
| `not_applicable`         | The leaf is genuinely irrelevant and includes a reason                                      |

Completion means every inventory leaf has Markdown content and one of these statuses. There are no user-interaction states and no handled-versus-pending conversation counters.

## Required Completion View

Use a normal Markdown table, not an ASCII tree or character bar. Every brace-delimited token is a runtime value that must be calculated from the current company's final inventory and packaged leaves. Repeat the data row once for every actual top-level branch; never copy counts from this reference or another company.

### 知识库构建完成度

| 状态                           | 分支           |                           已写入 / 总数 |                               待核验 |                           不适用 |
| ------------------------------ | -------------- | --------------------------------------: | -----------------------------------: | -------------------------------: |
| `{由该分支实际计数得出的状态}` | `{实际分支名}` | `{该分支已写入数} / {该分支叶节点总数}` | `{该分支 needs_verification 节点数}` | `{该分支 not_applicable 节点数}` |

**全部叶节点已处理：** `{已写入或说明不适用的叶节点数} / {最终叶节点总数}`  
**待核验：** `{needs_verification 节点总数}`　**不适用：** `{not_applicable 节点总数}`

## One-Shot Traversal Contract

- Process every leaf automatically without a user interaction.
- Never ask for confirmation, correction, skip/direct-prefill, structure approval, or packaging approval.
- Never skip a whole branch or collapse real leaves into a summary.
- Package automatically when every leaf has content or a reasoned `not_applicable` status.
- Do not create an interactive research page, HTML site, or webpage preview; only produce Markdown/ZIP for the website application to render separately.
