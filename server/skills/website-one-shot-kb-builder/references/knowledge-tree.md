# Knowledge Tree Structure Reference

## Design Principle: Industry-Adaptive

The tree is not a fixed manufacturing template. It adapts to the enterprise type detected in Phase 1. Seven universal business questions define coverage, while the deliverable always uses the eight canonical content directories required by `output-format.md`:

| #   | Universal question | Canonical directory mapping                 |
| --- | ------------------ | ------------------------------------------- |
| 1   | 你是谁？           | `01_company_overview/`                      |
| 2   | 你的团队？         | `02_team/`                                  |
| 3   | 你卖什么？         | `03_products/`                              |
| 4   | 你怎么做到的？     | `04_technology/` and/or `05_manufacturing/` |
| 5   | 卖给谁？           | `06_industries/`                            |
| 6   | 为什么选你？       | `08_competitive_advantages/`                |
| 7   | 怎么合作？         | `07_service/`                               |

These questions are a coverage taxonomy, not an alternative filesystem layout or seven summary nodes. The bounded inventory must cover each question, every real product family and every canonical directory. All eight canonical content directories must be present; a directory with no supported fact receives one explicit `needs_verification` gap leaf.

For customer presentation, designate exactly one sufficiently substantive inventory leaf as the formal `overview` for each of the seven display branches in `00_package_manifest.json`; designate the other inventory files as `leaf`. The overview is a written synthesis backed by the branch leaves and sources, not a crawl report or raw-page excerpt. `04_technology` and `05_manufacturing` combine into one core-capabilities display branch and therefore share one overview even though both directories still contain at least one leaf.

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
- **3. 产品/服务**（先建立完整产品族清单，再按优先级展开）
  - 3.1 产品族/服务族总览
  - 3.X.1 核心产品族概述与定位
  - 3.X.2 核心参数/功能与差异化卖点
  - 3.X.3 应用场景、案例与常见问题
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

If no listed variant fits, derive capability dimensions from sourced company evidence and industry structure. The eight capability leaves allocated across `04_technology/` and `05_manufacturing/` may use a truthful `not_applicable` or `needs_verification` status when one canonical directory does not fit, but neither directory may be empty.

## Leaf-Node Inventory and Count

Create a stable bounded inventory before population begins. Start with these 40 leaves:

| Coverage branch                        | Base leaves |
| -------------------------------------- | ----------: |
| Enterprise identity                    |           5 |
| Team                                   |           3 |
| Products/services                      |          12 |
| Core capabilities across `04` and `05` |           8 |
| Industries/customers                   |           4 |
| Cooperation/service                    |           4 |
| Competitive advantages                 |           4 |
| **Total**                              |      **40** |

Add at most 16 leaves, prioritizing core product families, important industry scenarios and evidence required by likely customer Q&A. The final inventory must contain **40–56 leaves**. Do not expand merely because the site has many SKUs, news posts, pagination pages or language variants.

For a large catalog:

- Include every real product/service family in the product overview.
- Give detailed parameters, scenarios, cases and FAQ treatment only to core families.
- Consolidate related long-tail SKUs into a sourced family leaf.
- Consolidate duplicate-language and repeated-news evidence instead of creating new leaves.
- Keep third-party discoveries source-labelled; they enrich or verify a leaf but do not automatically create one.

Never replace the inventory with an eight-row summary. If the count is below 40, first allocate missing base leaves without triggering another crawl round. Nodes that are genuinely not applicable remain in the inventory with an explained `not_applicable` status.

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
