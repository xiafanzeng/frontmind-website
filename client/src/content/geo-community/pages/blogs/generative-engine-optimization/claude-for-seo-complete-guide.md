---
path: "/blogs/generative-engine-optimization/claude-for-seo-complete-guide"
kind: "blog"
title: "Claude for SEO: The Complete Practitioner's Guide (10 Workflows That Replace Manual Work)"
source_title: "Claude for SEO: The Complete Practitioner's Guide (10 Workflows That Replace Manual Work)"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/claude-for-seo-complete-guide"
author: "Rohit Singh"
date: "9 Apr 2026"
status: "ready"
---
# Claude for SEO: The Complete Practitioner's Guide (10 Workflows That Replace Manual Work)

很多 SEO 团队仍在用 2019 年的方式做 2026 年的工作：关键词分类靠表格，brief 靠手写，meta description 一条条改，内链审计靠人工扫站。Claude 不能替代所有 SEO 工具，但它可以替代大量“拿到数据之后的人肉分析和写作”。

![Claude for SEO: The Complete Practitioner's Guide — 10 Workflows That Replace Manual Work](https://thegeocommunity.com/images/claude-for-seo-complete-guide.webp)

## 页面摘要

这篇 hub 文章梳理 10 个 Claude for SEO 工作流：关键词研究、content brief、title/meta 批量生成、on-page audit、content gap、internal linking、schema、竞品分析、SEO 报告，以及面向 AI 引擎的 GEO evidence layer。

## 原站章节结构

1. How to use this guide
2. The honest limitations
3. The core pattern across all 10 workflows
4. Workflow 1: Keyword research and intent classification
5. Workflow 2: Content briefs
6. Workflow 3: Title tags and meta descriptions at scale
7. Workflow 4: On-page SEO audits
8. Workflow 5: Content gap analysis
9. Workflow 6: Internal linking strategy
10. Workflow 7: Schema markup generation
11. Workflow 8: Competitor content analysis
12. Workflow 9: SEO reporting and data interpretation
13. Workflow 10: The GEO layer — optimizing for AI engines
14. Decision matrix: which workflow for which problem
15. Where to start

## Key Takeaways

- Claude 可以大幅加速关键词聚类、content brief、meta 批量生成、on-page audit、content gap、internal linking、schema、竞品分析和 SEO 报告。
- 它不能直接抓取网站、读取实时 SERP、提供搜索量或检查排名。所有需要实时外部数据的流程，都要先从 Ahrefs、Semrush、GSC、GA4、crawler 或 SERP 手动导出。
- 10 个工作流都遵循同一模式：结构化输入、明确约束、要求结构化输出、再跑一轮 quality gate。
- 最容易开始的两个场景是 on-page audit 和 meta description at scale，因为它们不依赖复杂外部数据。
- 每个传统 SEO 输出都应该加一层 GEO evidence pass：统计、来源、命名实体和可引用证据。

## How to use this guide

这篇不是每个 workflow 的完整操作手册，而是一个入口地图。每个工作流回答三件事：Claude 能做什么、你要准备什么输入、完整实施指南在哪里。真正的 prompt template、示例输出和 quality gate，会放在各自的子文章里。

如果团队刚开始，不要一次把 10 个流程都自动化。先挑一个痛点小、输入清楚、输出可验证的任务。等团队熟悉“结构化输入 -> Claude 输出 -> 质量门禁 -> 人工发布”的节奏，再扩展到更复杂的流程。

## The honest limitations

Claude 默认没有实时网页访问。它不能主动拉 Google Search Console 数据、检查 URL 是否 index、读取最新 competitor page、抓取 SERP 结果或打开 GA4 dashboard。你必须先把需要的数据导出，再把它交给 Claude。

Claude 也没有搜索量、KD、CPC 或实时排名数据。这些仍然来自 Ahrefs、Semrush、Google Keyword Planner、GSC、STAT、Sistrix 等工具。Claude 的价值在于分析和组织这些数据，而不是替代数据来源。

它也不是 crawler。status code、canonical conflict、Core Web Vitals、render blocking、hreflang、pagination、JS 渲染问题仍然需要 Screaming Frog、Sitebulb、Lighthouse、CrUX 或日志分析。Claude 适合内容、策略和结构化写作层；技术诊断仍要先拿到可靠数据。

## The core pattern across all 10 workflows

所有 Claude SEO workflow 都有同一个核心模式。

第一，结构化输入。原始混乱数据会得到混乱输出。关键词要有列名，页面列表要有 URL、title、type，竞品内容要分清 H1/H2/body，GA4 数据要有时间范围和指标定义。

第二，设置明确约束。字符限制、语气、输出格式、页面类型规则、禁止事项、必须字段，都应该写在 system prompt 或第一条指令里。隐含要求通常不会稳定执行。

第三，要求结构化输出。表格、编号列表、JSON、CSV-friendly rows 都比散文更容易执行、交付和审查。

第四，运行 quality gate。批量生成 meta、schema、brief 或内链时，不要把第一版直接发布。再跑一条检查 prompt，让 Claude 标记字符超限、关键词遗漏、格式不一致、链接不合理和证据不足。

## Workflow 1: Keyword research and intent classification

Claude 可以把关键词导出按真实搜索意图聚类，而不是只按词面相似度分组。输入可以来自 Ahrefs、Semrush 或 GSC，最好包含 keyword、volume、difficulty、current URL、clicks、impressions 等字段。

输出应包括：cluster name、primary intent、TOFU/MOFU/BOFU、purchase readiness、代表关键词、建议页面类型和优先级。原站强调，这类工作人工做 500 个关键词通常要几个小时，Claude 可以在几分钟内给出第一版。

完整入口：[How to Use Claude for Keyword Research](/blogs/generative-engine-optimization/claude-keyword-research-seo)

## Workflow 2: Content briefs

Claude 适合生成结构完整的 content brief：heading architecture、search intent、语义关键词、目标字数、内部链接、竞品角度、FAQ、证据要求和写作注意事项。

输入需要准备目标关键词、搜索意图、前 5 个竞品页面标题与 H2、已有站内相关 URL，以及品牌语气或产品限制。更稳定的做法是两段式 prompt chain：第一步生成大纲和语义覆盖，第二步把它转换成可交给写作者的 brief。

完整入口：[SEO Content Briefs with Claude](/blogs/generative-engine-optimization/claude-content-briefs-seo)

## Workflow 3: Title tags and meta descriptions at scale

这可能是最快看到效率收益的流程。把页面列表整理成表格：slug、page type、primary keyword、current title、current meta、notes。Claude 可以按页面类型批量生成 title tag 和 meta description，并执行字符限制、关键词位置和品牌语气规则。

质量门禁必须独立运行：检查 title 是否超过约 60 字符、meta 是否超过约 160 字符、是否缺主关键词、是否出现重复模板、是否承诺了页面没有提供的内容。

完整入口：[Title Tags & Meta Descriptions at Scale](/blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale)

## Workflow 4: On-page SEO audits

把页面正文、title、meta、target keyword 和已有内链贴给 Claude，它可以输出 heading hierarchy、关键词覆盖、readability、句长、内部链接机会、缺失 FAQ 和优先修复项。

这一流程特别适合批量比较。把同一主题集群里的 5-10 篇文章放在一起，让 Claude 用同一标准打分，就能看出哪页缺证据、哪页结构松散、哪页和别的页面互相 cannibalize。

完整入口：[On-Page SEO Audits with Claude](/blogs/generative-engine-optimization/claude-on-page-seo-audit)

## Workflow 5: Content gap analysis

Claude 可以把 content gap export 从“关键词表”转换成“内容路线图”。输入是自站和竞品的 gap 数据，以及现有内容 inventory。输出应按主题、意图、商业价值、生产难度和推荐格式排序。

关键价值在于 clustering。原始 gap keyword 没有战略意义，必须先按意图、主题和业务相关性合并。Claude 在这一步通常比电子表格更快，也更容易加入解释。

完整入口：[Content Gap Analysis with Claude](/blogs/generative-engine-optimization/claude-content-gap-analysis-seo)

## Workflow 6: Internal linking strategy

Claude 可以用 sitemap、页面标题和主题标签生成 topic cluster map，再输出 implementation-ready link map：source URL、target URL、anchor text、placement context、priority。

这里要避免只让它写“加强内链”这种泛泛建议。真正有用的输出是可交给内容团队或开发的表格。最好分两步：先做 cluster map，再基于 cluster map 生成 anchor 和放置位置。

完整入口：[Internal Linking Strategy & Map](/blogs/generative-engine-optimization/claude-internal-linking-strategy)

## Workflow 7: Schema markup generation

Claude 很适合生成 JSON-LD，尤其是 Article、FAQPage、HowTo、Product、BreadcrumbList、Organization 等常见类型。输入可以是页面正文，也可以是结构化页面摘要。

但 schema 必须验证。复杂类型容易漏 required property 或 nested field。部署前应使用 [Google Rich Results Test](https://search.google.com/test/rich-results) 或 Schema.org validator 检查。对于批量 schema，要先在少量 URL 上试运行。

完整入口：[Schema Markup & JSON-LD Generation](/blogs/generative-engine-optimization/claude-schema-markup-json-ld-generator)

## Workflow 8: Competitor content analysis

把竞品文章全文贴进去，Claude 可以抽取 heading hierarchy、claim type、evidence density、FAQ 深度、实体覆盖、未展开主题和可差异化角度。把 3-5 篇竞品文章放在一起，它还能输出比较矩阵。

这和 GEO 直接相关。AI 回答引擎更喜欢有证据、有出处、实体明确的内容。如果竞品靠空泛观点排名，你的版本可以通过统计、primary source、专家引用和更清晰的结构建立优势。

完整入口：[Competitor Content Analysis with Claude](/blogs/generative-engine-optimization/claude-competitor-content-analysis)

## Workflow 9: SEO reporting and data interpretation

Claude 可以把 GA4、GSC、Looker Studio 或 CSV 指标转成面向管理层的解释：趋势、异常、可能原因、下一步动作。输入越结构化，报告越有用。

一个高价值 prompt 是异常检测：标记 week-over-week 变化超过 15% 的指标，并给出可能原因和需要验证的数据。连接 Google Analytics MCP 到 Claude Desktop 后，也可以让 Claude 直接查询 GA4，但仍要人工确认指标口径。

完整入口：[SEO Reporting & GA4 Data Interpretation](/blogs/generative-engine-optimization/claude-seo-reporting-data-interpretation) 与 [Connect Google Analytics MCP to Claude](/blogs/generative-engine-optimization/connect-google-analytics-mcp-to-claude)

## Workflow 10: The GEO layer — optimizing for AI engines

2026 年的 SEO 输出不能只为传统 SERP 设计，还要让 ChatGPT、Perplexity、Claude、Gemini 和 Google AI Overviews 能发现、理解和引用。GEO layer 不是独立流程，而是所有内容发布前的最后检查。

原站引用了 Princeton 和 IIT Delhi 的 GEO 研究方向：AI citation visibility 更依赖可验证统计、primary source、明确引用、命名实体和权威证明。每篇内容都应问三件事：哪些 claim 没有数字或来源？哪些段落可以加入 primary source？哪里需要命名专家、论文、工具或实体？

可以让 Claude 做 final evidence pass：标出所有 vague claim，建议可加入的统计、来源、引用和实体名称。这样输出不只是“SEO 可读”，也更适合回答引擎引用。

## Decision matrix: which workflow for which problem

- 关键词池太乱：从 keyword clustering 和 intent classification 开始。
- 新文章生产慢：从 content brief workflow 开始。
- 大量页面缺 title/meta：从 metadata at scale 开始。
- 老内容表现下滑：从 on-page audit 开始。
- 竞品覆盖你没有的主题：从 content gap analysis 开始。
- 页面很多但权重分散：从 internal linking strategy 开始。
- 页面结构化数据缺失：从 schema generation 开始。
- 不知道竞品为什么强：从 competitor content analysis 开始。
- 报告耗时但洞察少：从 SEO reporting workflow 开始。
- 内容要进入 AI answers：每个 workflow 后都跑 GEO evidence layer。

## Where to start

最推荐的两个起点是 on-page SEO audit 和 meta descriptions at scale。它们不需要 Ahrefs、Semrush 或复杂开发配合，只要你有页面内容或 GSC 导出的页面列表，就能马上跑。

先拿最近 6 个月发布的页面做一次 on-page audit，得到优先修复列表。再从 GSC 导出 impressions 最高的 50 个页面，批量生成并审核 title/meta。这个组合成本低、反馈快，也能让团队学会 Claude workflow 的基本节奏。

## Input-output contract for every workflow

原站反复强调 Claude SEO 的关键不是“让模型想办法”，而是给它一个稳定的输入输出合约。每个 workflow 在落地前都应该先写清四件事：输入来自哪里、输出要给谁用、什么算失败、谁负责最终发布。

一个可复用合约可以这样设计：

| Field | Meaning | Example |
| --- | --- | --- |
| Source data | Claude 读取的数据来源 | GSC CSV、Ahrefs keyword export、页面 HTML、竞品 H2 列表 |
| Required columns | 输入必须包含的字段 | URL、keyword、clicks、impressions、title、meta、page type |
| Output format | 输出交付格式 | Markdown table、CSV rows、JSON-LD、writer brief |
| Constraints | Claude 必须遵守的规则 | 字符限制、语气、禁止承诺、品牌词写法、schema 字段 |
| Quality gate | 发布前检查 | 字符超限、链接不存在、source claim 不足、重复模板 |
| Owner | 最终负责人 | SEO lead、content editor、developer、analytics owner |

没有这个合约，Claude 很容易输出一段“看起来有道理”的建议，但无法直接进入执行队列。SEO 团队真正节省时间的地方不是第一版生成，而是减少从建议到发布之间的整理、重写和返工。

## Prompt design pattern used across the 10 workflows

多数 Claude SEO prompt 可以拆成四层。

第一层是 role 和 goal。不是简单说“你是 SEO 专家”，而是说清楚任务目标：例如“你负责把 GSC query export 聚类成可执行 content roadmap，输出给内容策略团队使用”。

第二层是 data schema。把输入字段列出来，并解释每个字段含义。比如 clicks 和 impressions 的时间范围、current position 是否为平均排名、URL 是否 canonical、keyword volume 是否来自同一工具。

第三层是 decision rules。告诉 Claude 如何处理冲突：volume 高但业务价值低怎么办，两个关键词 intent 相似但 funnel stage 不同怎么办，title 超字数时优先保留品牌还是关键词。

第四层是 output contract。要求 Claude 输出表格、JSON、CSV 或编号清单，并固定列名。SEO 工作流通常要进入表格、CMS、Jira、Notion 或开发队列，结构化输出比漂亮段落更重要。

一个通用首段可以写成：

```text
你将收到一个 SEO 数据表。请只基于我提供的数据分析，不要编造搜索量、排名或页面表现。输出必须是 Markdown 表格，列名固定为：priority、cluster、intent、recommended_action、target_url、evidence、risk。每条建议都要引用输入中的具体字段作为依据。
```

这个模式适用于 keyword clustering、content gap、reporting、internal linking 和 on-page audit。差别只在规则和字段，不在基本结构。

## Quality gates by workflow

每个 workflow 都需要单独的 quality gate，而不是用同一条“检查有没有问题”解决所有场景。

| Workflow | Quality gate should catch |
| --- | --- |
| Keyword research | intent 误分、同义词重复、商业意图被归到信息意图、低价值高 volume 关键词被高估 |
| Content briefs | 大纲和 intent 不匹配、缺少证据要求、竞品角度只被复述、内部链接不相关 |
| Title/meta | 字符超限、重复模板、缺主关键词、承诺页面没有的功能、CTR 语言过度夸张 |
| On-page audit | 把风格偏好误当 SEO 问题、忽略页面类型、建议太泛、没有优先级 |
| Content gap | 只按关键词量排序、没有合并 intent、忽略现有内容 cannibalization |
| Internal linking | anchor text 不自然、链接目标不相关、把商业页链接到不合适上下文 |
| Schema | required property 缺失、字段与页面可见内容不一致、使用占位值 |
| Competitor analysis | 只复述竞品结构、没有指出可差异化角度、没有证据密度比较 |
| Reporting | 把相关性写成因果、没有说明时间范围、忽略季节性或 tracking 变化 |
| GEO layer | claim 没有来源、实体不明确、引用路径断裂、统计过期 |

质量门禁最好用独立 prompt 运行。第一条 prompt 负责生成，第二条 prompt 负责审查，第三条 prompt 才负责修订。把生成和审查放在同一次输出里，会让 Claude 更容易自我确认。

## Implementation sequence for a small SEO team

小团队不需要一口气搭完整自动化。更稳的顺序是四周上线一个最小系统。

第一周：metadata at scale。导出前 50 个 impressions 最高但 CTR 偏低的页面，让 Claude 生成 title/meta 变体，再用 quality gate 查字符限制和承诺风险。这个任务输入简单、输出可直接发布，适合建立信任。

第二周：on-page audit。选最近 20 篇文章，把正文、目标关键词、title、meta 和内部链接放入 Claude，让它输出优先级修复表。重点不是重写整篇，而是找出最明显的结构、证据和可读性问题。

第三周：content briefs。对未来 10 篇内容建立 brief 模板。每个 brief 必须包含 intent、受众、H2 结构、证据要求、内部链接、FAQ、GEO evidence pass 和避免事项。这样可以从源头减少低质量稿件。

第四周：content gap 和 internal linking。把已有内容 inventory、竞品主题和 GSC 数据放在一起，让 Claude 生成 topic cluster map。然后把 link map 交给编辑或开发执行。

这个顺序的好处是，团队先在低风险任务里学习 prompt contract 和 quality gate，再进入更战略、更难验证的任务。

## Implementation sequence for an agency or multi-site team

Agency 和多站点团队最大的风险不是 Claude 输出不好，而是不同客户、不同站点、不同编辑反复使用不同规则。原站的 hub 思路可以扩展成一个运营系统。

第一步，建立 client-specific rulebook。每个客户单独维护品牌语气、禁止承诺、核心产品命名、目标受众、合规限制、优先页面类型、常用来源和内部链接边界。所有 Claude prompt 都要引用这份 rulebook。

第二步，建立 reusable workflow templates。不要让每个 strategist 自己写 prompt。关键词聚类、brief、meta、audit、schema、reporting 都应该有版本化模板，并记录最后更新时间和 owner。

第三步，建立 QA sampling。批量输出 100 条 meta 不需要逐条人工重写，但需要抽样检查高风险页面、商业页面、医疗/金融/法律页面，以及所有涉及价格、承诺和合规的页面。

第四步，建立 change log。记录每次 Claude 生成内容的 prompt version、input file、reviewer、发布时间和后续表现。这样当某个模板造成问题时，可以追溯并修复。

Agency 的效率来自复用，而不是把人工判断完全拿掉。Claude 负责加速分析和初稿，人类负责边界、客户语境、合规和最终判断。

## How this hub connects to the individual Claude guides

这篇 hub 页的作用是路由，不是替代每篇子指南。实际使用时可以这样跳转：

- 关键词和 intent 问题，进入 [Claude Keyword Research](/blogs/generative-engine-optimization/claude-keyword-research-seo)。
- 新文章生产和编辑 brief，进入 [Claude Content Briefs](/blogs/generative-engine-optimization/claude-content-briefs-seo)。
- CTR 和 SERP snippet 优化，进入 [Title Tags & Meta Descriptions](/blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale)。
- 老内容诊断，进入 [On-Page SEO Audit](/blogs/generative-engine-optimization/claude-on-page-seo-audit)。
- 主题覆盖和竞品差距，进入 [Content Gap Analysis](/blogs/generative-engine-optimization/claude-content-gap-analysis-seo)。
- Topic cluster 和链接图，进入 [Internal Linking Strategy](/blogs/generative-engine-optimization/claude-internal-linking-strategy)。
- 结构化数据，进入 [Schema Markup Generator](/blogs/generative-engine-optimization/claude-schema-markup-json-ld-generator)。
- 竞品页面拆解，进入 [Competitor Content Analysis](/blogs/generative-engine-optimization/claude-competitor-content-analysis)。
- 报告和解释，进入 [SEO Reporting](/blogs/generative-engine-optimization/claude-seo-reporting-data-interpretation)。

如果要把这个中文复刻站继续运营成一个工作流库，这个 hub 页应该保持为入口目录：每新增一个 Claude workflow，就在这里补入“能做什么、输入是什么、质量门禁是什么、完整指南在哪里”。

## Common mistakes when teams use Claude for SEO

第一个错误是把 Claude 当数据源。模型可以分析关键词表，但不能凭空提供可靠搜索量；可以写排名解释，但不能凭空知道你的实时排名；可以建议内链，但不能自动知道哪些 URL 当前 404。所有外部事实都必须先由工具提供。

第二个错误是用泛 prompt 处理生产任务。比如“帮我优化这些标题”会得到看起来不错但不可控的结果。生产 prompt 必须包含页面类型、字符限制、关键词规则、品牌规则、禁止事项和输出格式。

第三个错误是没有二次检查。Claude 批量输出越快，错误传播也越快。title 批量生成可能会重复模板；schema 批量生成可能会出现页面没有的字段；reporting 可能会把 tracking 变化误解成业务变化。

第四个错误是没有保留输入。两周后如果某个 brief 质量很差，你需要知道当时给 Claude 的竞品标题、关键词、prompt 版本和规则是什么。没有输入记录，就无法复盘。

第五个错误是忽略 GEO layer。传统 SEO 输出即使适合 Google，也未必适合 AI answers。每篇文章都要额外检查 claim、source、entity、definition、FAQ、data table 和 internal evidence path。

## Metrics to track after adopting Claude workflows

效率指标包括：brief 生产时间、meta 批量生成时间、audit 完成时间、reporting 准备时间、人工返工次数。它们能证明 Claude 是否真的节省工时。

质量指标包括：发布后 CTR 变化、页面更新后的 impressions/clicks、内容修复后的排名趋势、内部链接执行率、schema validation pass rate、AI answer inclusion、brand mention accuracy。它们能证明流程是否改善结果。

治理指标包括：prompt version 覆盖率、quality gate 通过率、人工 reviewer 覆盖率、输出回滚次数、发现错误的平均时间。它们能防止自动化变成不可控的内容工厂。

最重要的是不要只看“生成了多少内容”。Claude for SEO 的目标不是增加产量，而是把重复分析和初稿工作机械化，让人类把时间放在判断、证据、编辑、技术验证和策略选择上。

## Claude SEO operating manual

如果要把这篇 hub 变成团队可持续使用的工作手册，建议把每个 workflow 拆成四个文件：input template、generation prompt、quality gate prompt 和 output example。input template 规定 CSV 或 Markdown 字段，generation prompt 负责第一版输出，quality gate prompt 负责找错误，output example 告诉团队什么算合格。

每个文件都应该有版本号和 owner。比如 `claude-meta-v1.3`、`claude-brief-v2.1`、`claude-internal-links-v1.0`。当某个 prompt 输出质量下降或业务规则变化时，只升级对应模板，不要让团队成员各自复制旧 prompt 改来改去。

这个 operating manual 可以放在站内 [Prompt Library](/resources/prompt-library) 或 [Claude Workflows Library](/ai-for-seo) 下。hub 页保留总览，每个子页承接具体 SOP。

## Artifacts each workflow should produce

Claude for SEO 的交付物应该能直接进入 CMS、表格或项目管理工具，而不是只停留在建议段落。可以按 workflow 定义 artifact：

| Workflow | Primary artifact | Secondary artifact |
| --- | --- | --- |
| Keyword research | intent cluster table | content roadmap |
| Content brief | writer brief | evidence checklist |
| Title/meta | CSV-ready title/meta rows | quality gate report |
| On-page audit | prioritized fixes | before/after notes |
| Content gap | topic opportunity map | cannibalization warning |
| Internal linking | source-target-anchor map | cluster diagram |
| Schema | JSON-LD block | validator checklist |
| Competitor analysis | comparison matrix | differentiation angles |
| Reporting | executive summary | anomaly table |
| GEO layer | citation readiness report | claim-source map |

当 artifact 被固定下来，Claude 输出才更容易审查、复用和继续更新。后续新增 blog 时，也可以直接在每篇文章末尾链接对应 artifact 模板。

## Human review boundaries

Claude 可以加速 SEO，但不能替代责任边界。涉及医疗、金融、法律、安全、隐私、价格、承诺、客户数据和合规声明的输出，都必须有人类 reviewer。内部链接和 schema 虽然风险较低，也要检查 URL 是否存在、字段是否和页面可见内容一致。

最稳的做法是给每个 workflow 标注 risk level。低风险输出可以抽样检查，例如 meta 描述和普通 FAQ；中风险输出需要编辑逐条审查，例如 content brief 和竞品分析；高风险输出必须由领域专家或负责人签字，例如法律解释、财务建议、产品承诺和数据报告。

这种边界不会降低效率。相反，它能让团队放心把低风险重复工作交给 Claude，把真正需要判断的地方留给人。

## Workflow routing table

当团队不知道该从哪篇 Claude 子指南开始，可以用 routing table：

| Problem | Start with | Then connect to |
| --- | --- | --- |
| 关键词多但不知道怎么分组 | [Claude Keyword Research](/blogs/generative-engine-optimization/claude-keyword-research-seo) | [Content Gap Analysis](/blogs/generative-engine-optimization/claude-content-gap-analysis-seo) |
| 新文章质量不稳定 | [Claude Content Briefs](/blogs/generative-engine-optimization/claude-content-briefs-seo) | [Competitor Content Analysis](/blogs/generative-engine-optimization/claude-competitor-content-analysis) |
| CTR 低或 snippet 陈旧 | [Title Tags & Meta Descriptions](/blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale) | [On-Page SEO Audit](/blogs/generative-engine-optimization/claude-on-page-seo-audit) |
| 老文章很多但不知道先改谁 | [On-Page SEO Audit](/blogs/generative-engine-optimization/claude-on-page-seo-audit) | [Internal Linking Strategy](/blogs/generative-engine-optimization/claude-internal-linking-strategy) |
| 页面结构化数据缺失 | [Schema Markup Generator](/blogs/generative-engine-optimization/claude-schema-markup-json-ld-generator) | [GEO Framework](/geo-framework) |
| 管理层报告耗时 | [SEO Reporting](/blogs/generative-engine-optimization/claude-seo-reporting-data-interpretation) | [Connect GA MCP to Claude](/blogs/generative-engine-optimization/connect-google-analytics-mcp-to-claude) |

这个表让 hub 页更像原站的路由页：读者先判断自己的问题，再进入可执行教程。

## Maintenance cadence for this hub

后续继续维护中文站时，这篇 hub 应每月检查一次。检查内容包括：子指南是否都存在、链接是否 200、prompt 示例是否过时、Claude 能力限制是否改变、是否新增了 MCP 或 agent workflow、是否需要把传统 SEO workflow 连接到 GEO evidence layer。

每次新增 Claude 相关 blog，都要回到本页补四样东西：一句 summary、一个入口链接、对应 workflow 类型、quality gate。这样本页会保持为中文 Claude SEO 入口，而不是一篇过时长文。

## Related reading

- [Claude Workflows Library](/ai-for-seo)
- [Claude](https://claude.ai/)
- [Prompt Chaining for SEO Workflows](/blogs/generative-engine-optimization/prompt-chaining-seo-workflows)
- [How to Dominate AI Search](/blogs/generative-engine-optimization/geo-dominate-ai-search-comparative-study)
- [GEO Framework](/geo-framework)
- [Prompt Library](/resources/prompt-library)
- [Rohit Singh](https://www.linkedin.com/in/rohitsingh017)
