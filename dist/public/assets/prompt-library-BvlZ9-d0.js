const n=`---
path: "/resources/prompt-library"
kind: "resource"
title: "GEO Prompt Library"
source_title: "GEO Prompt Library"
source_url: "https://thegeocommunity.com/resources/prompt-library"
author: ""
date: ""
status: "ready"
---
# GEO Prompt Library

这是一组面向 Generative Engine Optimization 的中文可编辑 prompt 模板，覆盖 AI 可见性审计、竞品分析、内容改写、Schema、技术检查和品牌认知测试。使用方式很简单：复制模板，把方括号里的变量替换成你的品牌、URL、主题、受众或内容，再交给 ChatGPT、Gemini、Perplexity 或 Claude。

## GEO Audit & Strategy

### Full GEO Visibility Audit Checklist

用途：系统检查一个网站是否具备被 AI 搜索、AI Overview 和回答引擎引用的基础。

\`\`\`text
请作为 GEO 审计顾问，审计 [网站/品牌] 在 [主题/行业] 中的 AI 可见性准备度。请按以下维度输出：可抓取性、实体清晰度、主题权威、E-E-A-T 信号、可引用段落、结构化数据、内部链接、竞品差距、风险项和 30 天优化优先级。每个维度给出 1-5 分、证据、改进建议和需要补充的页面类型。
\`\`\`

### Competitor GEO Analysis Framework

用途：对比你的品牌和竞争对手在 AI 答案中的出现机会。

\`\`\`text
请比较 [我的品牌] 与 [竞品列表] 在 [核心查询/主题] 上的 GEO 优势。请模拟用户会问的 15 个 AI 搜索问题，预测每个品牌可能被引用的原因，列出我们缺少的内容资产、外部证据、实体信号和可执行补强方案。
\`\`\`

### AI Citation Tracking System Builder

用途：建立手动追踪 AI 引用的表格和流程。

\`\`\`text
请为 [品牌/网站] 设计一个 AI 引用追踪系统。需要包含：要测试的问题清单、测试平台、记录字段、引用来源字段、品牌出现方式、情绪/立场、竞品出现情况、截图证据、复测频率和月度报告模板。请输出可直接复制到表格的列名和操作流程。
\`\`\`

### GEO Strategy Roadmap Generator

用途：把审计结果转成 90 天执行计划。

\`\`\`text
请基于以下背景为 [品牌] 制定 90 天 GEO 路线图：[业务目标]、[目标受众]、[核心主题]、[现有内容资产]、[主要竞品]。请按 0-30 天、31-60 天、61-90 天拆分，每阶段给出内容、技术、权威建设、数据追踪和成功指标。
\`\`\`

## Content Optimization

### AI-Citable Content Rewriter

用途：把普通文章改成更容易被 AI 引用的结构。

\`\`\`text
请把下面内容改写成 AI 更容易引用的版本。要求：保留事实，不夸大；每个章节先给一句直接答案；增加定义、步骤、对比和注意事项；用清晰小标题；把关键观点写成可独立摘取的段落；最后列出 FAQ。内容如下：[粘贴内容]
\`\`\`

### FAQ Section Generator for GEO

用途：为页面生成适合 AI 抽取的问答区。

\`\`\`text
请为 [页面主题] 生成 12 个 FAQ。问题要覆盖入门、比较、成本、风险、实施步骤、常见误解和决策标准。每个答案 60-120 字，第一句直接回答，后面补充条件和例子。请避免空泛营销语。
\`\`\`

### E-E-A-T Signal Enhancer

用途：补足经验、专业性、权威性和可信度。

\`\`\`text
请审查这段内容的 E-E-A-T 信号：[粘贴内容]。请指出缺少哪些作者经验、来源证据、案例、限制条件、更新信息和信任元素。然后给出一版改写建议，让页面更像由有经验的专业人士维护。
\`\`\`

### Definitive Answer Paragraph Writer

用途：生成适合 AI 直接引用的答案段落。

\`\`\`text
请为问题「[问题]」写一个 80-120 字的 definitive answer paragraph。要求：第一句直接回答；第二句说明原因或机制；第三句给出适用场景或限制。语气清晰、可引用，不要堆关键词。
\`\`\`

### AI-Answer-Worthy Query Generator

用途：找到最可能触发 AI 综合答案的问题。

\`\`\`text
请围绕 [主题/产品/服务] 生成 40 个可能触发 AI 生成答案的用户问题。按信息型、比较型、决策型、操作型、风险型和品牌型分组。每个问题后标注搜索意图、理想页面类型和应提供的证据。
\`\`\`

### Topical Authority Cluster Builder

用途：规划主题集群，让站点在一个领域形成权威。

\`\`\`text
请为 [核心主题] 设计一个 topical authority cluster。输出 1 个 pillar page、8-12 个 cluster pages、每页目标问题、内部链接关系、应覆盖实体、需要的证据类型和优先级。目标是提升 AI 引用和传统搜索可见性。
\`\`\`

### Question-Based Content Gap Finder

用途：用问题清单发现内容缺口。

\`\`\`text
请从用户角度列出 [主题] 的完整问题地图，并检查我们已有内容：[粘贴 URL/标题列表]。请标出已覆盖、覆盖不足、完全缺失的问题，并建议新页面、FAQ 或段落补充。
\`\`\`

## Schema & Structured Data

### Comprehensive JSON-LD Schema Generator

用途：为页面生成完整 JSON-LD 草案。

\`\`\`text
请为以下页面生成 JSON-LD 结构化数据草案：[页面 URL/页面内容]。判断最合适的 schema 类型，输出 Article、FAQPage、HowTo、Organization、Person、BreadcrumbList 或其他适用类型。请解释每个字段从哪里取得，缺失字段用占位符标记。
\`\`\`

### FAQPage Schema from Content

用途：从现有内容抽取 FAQ schema。

\`\`\`text
请从下面内容中提取真实问答，并生成 FAQPage JSON-LD。不要编造页面没有回答的问题。每个 answer 保持简洁准确。内容如下：[粘贴内容]
\`\`\`

### HowTo Schema Generator

用途：把操作流程转成 HowTo schema。

\`\`\`text
请把以下步骤转成 HowTo JSON-LD：[粘贴步骤]。请补全 name、description、step、tool、supply、totalTime 和 estimatedCost 等字段；无法确定的字段用占位符，并列出需要人工确认的信息。
\`\`\`

### Speakable Schema Selector

用途：找出页面中最适合语音/AI 摘取的段落。

\`\`\`text
请分析下面页面内容，挑出 3-5 段最适合作为 speakable 或 AI 摘要的文本。标准：直接回答问题、上下文独立、事实明确、长度适中。请输出段落、选择理由和可改写版本。
\`\`\`

## AI Research & Brand Testing

### Brand Perception Test

用途：检查 AI 对品牌的理解是否准确。

\`\`\`text
请模拟 AI 搜索用户如何理解 [品牌]。请回答：这个品牌是什么、服务谁、解决什么问题、与竞品区别是什么、可能有哪些误解。然后列出哪些内容资产可以修正错误认知或强化定位。
\`\`\`

### AI-Citable Content Attributes Analyzer

用途：分析一篇内容为什么容易或不容易被 AI 引用。

\`\`\`text
请评估这篇内容的 AI 可引用性：[粘贴内容]。请从直接答案、信息密度、实体清晰、证据、结构、小标题、原创观点、时效性和外链质量评分。最后给出可立即修改的 10 条建议。
\`\`\`

### AI Knowledge Gap Finder

用途：发现 AI 答案薄弱的主题机会。

\`\`\`text
请围绕 [主题] 找出当前 AI 答案可能薄弱或容易出错的 20 个问题。每个问题说明为什么现有答案可能不足、我们可以创建什么页面、需要哪些数据或专家输入。
\`\`\`

### AI Brand Knowledge Comparison

用途：比较 AI 对多个品牌的认知差异。

\`\`\`text
请比较 AI 可能如何描述 [品牌 A]、[品牌 B]、[品牌 C]。从定位、优势、弱点、目标用户、价格/功能、可信来源和常见误解维度输出。请指出 [品牌 A] 应补哪些内容来改变 AI 认知。
\`\`\`

## Technical GEO

### RAG-Friendliness Content Audit

用途：检查内容是否适合被检索增强生成系统切分、召回和引用。

\`\`\`text
请审查以下页面的 RAG friendliness：[粘贴内容/HTML]。重点检查段落是否独立、标题是否明确、实体是否清楚、表格是否可读、列表是否完整、是否有长段噪音和缺少上下文的代词。请给出改写建议。
\`\`\`

### Robots.txt & AI Crawler Analyzer

用途：检查是否允许合适的 AI 爬虫访问。

\`\`\`text
请分析这个 robots.txt：[粘贴 robots.txt]。请指出 Google、Bing、GPTBot、ClaudeBot、PerplexityBot 等爬虫是否被允许访问关键路径。请标注风险、建议规则和需要谨慎阻止的区域。
\`\`\`

### Technical GEO Audit from HTML Source

用途：从 HTML 角度检查页面是否适合 AI 抓取。

\`\`\`text
请审计以下 HTML 对 AI 抓取和引用是否友好：[粘贴 HTML]。检查 title、meta description、h1-h3、主内容位置、schema、canonical、内部链接、图片 alt、懒加载、客户端渲染依赖和隐藏内容。输出问题和修复优先级。
\`\`\`

### XML Sitemap Optimizer for AI Discovery

用途：优化 sitemap，让重要内容更容易被发现。

\`\`\`text
请审查这个 sitemap：[粘贴 sitemap 或 URL 列表]。请识别重要页面是否缺失、lastmod 是否合理、低价值页面是否过多、主题集群是否清楚。请给出一个更适合搜索和 AI 发现的 sitemap 策略。
\`\`\`

### IndexNow & Instant Indexing Setup

用途：规划新内容快速发现流程。

\`\`\`text
请为 [网站技术栈] 设计 IndexNow 或即时索引提交流程。说明触发时机、提交 URL、失败重试、日志记录、与 sitemap/robots 的关系，以及发布新文章后的检查清单。
\`\`\`

## How to use these prompts

Prompt Library 的目标不是让你把判断外包给模型，而是把重复工作标准化。每次使用 prompt 时，建议同时提供四类上下文：

- Business context：品牌、行业、目标受众、主要产品或服务。
- Page context：URL、标题、正文、目标 query、页面角色。
- Evidence context：已知数据、来源、案例、限制、作者背景。
- Output context：你希望得到表格、清单、JSON、brief、rewrite 还是 QA report。

如果只把一句 “audit my site for GEO” 丢给模型，输出通常会很泛。高质量 prompt 应该告诉模型：要审计什么页面、服务哪个用户、以什么证据为准、输出后要拿去做什么。

## Prompt variables cheat sheet

下面这些变量可以在多个 prompt 里复用。

| Variable | 示例 | 作用 |
| --- | --- | --- |
| \`[brand]\` | The GEO Community | 让输出聚焦实体 |
| \`[topic]\` | Generative Engine Optimization | 限定主题范围 |
| \`[target_engine]\` | ChatGPT、Perplexity、Gemini | 区分 AI surface |
| \`[target_prompts]\` | 20 个用户问题 | 让评估可复测 |
| \`[page_role]\` | revenue、evidence、authority、support | 决定优化目标 |
| \`[source_docs]\` | 官方文档、论文、案例 | 降低幻觉 |
| \`[competitors]\` | 竞品域名或品牌 | 做比较分析 |
| \`[output_format]\` | markdown table、CSV columns、JSON-LD | 控制可用性 |

把变量写清楚，prompt 才能输出可执行结果。

## GEO workflow prompt chain

真实 GEO 项目通常不要只跑一个 prompt，而是一条链。

1. 用 **AI-Answer-Worthy Query Generator** 生成问题地图。
2. 用 **Competitor GEO Analysis Framework** 看竞品和来源类型。
3. 用 **Full GEO Visibility Audit Checklist** 审计现有页面。
4. 用 **AI-Citable Content Attributes Analyzer** 判断哪些段落可引用。
5. 用 **AI-Citable Content Rewriter** 改写核心 section。
6. 用 **FAQ Section Generator for GEO** 补 FAQ。
7. 用 **Comprehensive JSON-LD Schema Generator** 生成 schema 草案。
8. 用 **AI Citation Tracking System Builder** 设计复测表。

这条链路和本站内容维护流程一致：先发现问题，再改内容，再补结构化数据，最后测引用和提及。不要先生成大量内容再问是否有用。

## Prompt QA checklist

使用任何 prompt 前，先检查：

- 是否明确要求模型不要编造来源。
- 是否提供了足够上下文。
- 是否区分事实、推断和建议。
- 是否要求输出优先级，而不是只列建议。
- 是否要求指出不确定性和需要人工确认的项目。
- 是否要求保留品牌、产品、作者和术语一致性。
- 是否让模型输出可复制字段或表格。

使用后也要检查输出。模型给出的 GEO 建议可能有帮助，但仍需人工验证：链接是否存在、schema 是否有效、robots 建议是否安全、引用是否真的支持 claim、竞品分析是否基于当前页面。

## Example: from prompt to page update

一个实际流程可以这样运行。你准备更新一篇关于 AI bot logs 的文章，先让模型生成用户会问的 30 个问题；再让模型检查页面是否回答了这些问题；然后让模型标出缺少证据、表格和 FAQ 的 section；接着人工补充日志字段、SQL 查询、平台差异和链接；最后用 citation tracking prompt 设计复测问题。

这个流程的关键是：prompt 帮助你整理和诊断，最终内容仍由人类确认和编辑。这样才能避免 prompt 变成低质量 AI 内容生产机。

## Maintenance notes for this library

后续新增 prompt 时，建议保留统一格式：标题、用途、模板、输入变量、输出格式、注意事项和相关页面。对高风险 prompt，例如 robots、schema、品牌合规、法律金融医疗内容，应明确写“需要人工复核”。

每季度可以复查一次 prompt：哪些仍然有效，哪些需要增加 Gemini/Perplexity/ChatGPT 的引擎差异，哪些已经有更好的工具或流程。Prompt Library 应该像工具箱一样更新，而不是一次性列表。

## Submit a Prompt

如果你有在 GEO、AI SEO、AEO、内容优化、Schema 或技术审计中反复有效的 prompt，可以通过邮件提交给社区。建议包含 prompt 标题、适用工具、使用场景、输入变量、输出格式和一个示例结果。

相关入口：

- [Start Here](/start)
- [GEO Glossary](/resources/geo-glossary)
- [LLM Evals Guide](/resources/llm-evals)
- [Community Submissions](/community/submissions)
- [Submit Your Prompt](mailto:info@thegeocommunity.com?subject=Prompt%20Library%20Submission%20%E2%80%94%20The%20GEO%20Community)
`;export{n as default};
