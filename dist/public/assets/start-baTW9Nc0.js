const e=`---
path: "/start"
kind: "page"
title: "Start Here"
source_title: "Start Here"
source_url: "https://thegeocommunity.com/start"
author: ""
date: ""
status: "ready"
---

# Start Here

> This is a living collection, expect frequent updates.

GEO 的范围很宽：AI crawler、内容结构、prompting、RAG、引用率、品牌监控、GA4 流量归因、LLM evals 都在里面。这个页面是 guided starting point，帮助你按角色选择 track，再进入对应的 pillar hubs。

原站把 Start Here 定位成整个 GEO Community 的导航页。它不是单篇文章，而是一张学习地图：先帮助你理解 Transformer 和 AI answer systems 的基础，再让你按自己的角色进入不同路径，最后用 C.I.T.E. framework 把技术、内容、实体和生态信号串起来。

如果你是第一次接触 GEO，建议不要从工具开始。先回答三个问题：你的目标是品牌可见性、内容被引用，还是技术基础设施；你要解决的是 crawl、content、measurement，还是 production workflow；你需要的是一次性审计，还是一个持续更新的系统。

## Featured Resource: Transformer Architecture Visualization

所有能生成答案的现代 AI 模型，包括 ChatGPT、Gemini、Perplexity、Google AI Overviews，都建立在 Transformer 架构之上。理解 Transformer 不需要从数学开始；你只需要知道输入如何变成 token、attention、context、decoder output 和最终答案。

这个可视化资源的使用方式：

- 点击 diagram 中任意 block，看它用 plain English 解释作用。
- 按 Play，看数据如何从 input 流到 output。
- 阅读每个 block 的 “Why This Matters”，理解它和 GEO 的关系。
- 如果想更技术，可以展开 “Under the Hood” 看公式。

它面向 marketers、SEOs、strategists 和 engineers：目标不是让所有人变成 ML researcher，而是理解为什么内容结构会影响 AI 是否能读取、压缩、检索和引用。

[Open the Visualization](/resources/transformer-visualization)

## What is your primary focus?

选择最接近你角色的问题。

### The Strategist

适合 CMOs、VPs、brand leads。

核心问题：“How do we measure and protect our brand in AI answers?”

你应该优先学习：GEO vs SEO、AI answer surfaces、citation rate、brand mentions、AI referral traffic、multi-engine visibility。

Strategist 的目标不是亲手改每个 H2，而是建立一套能向管理层解释的 operating model。你需要回答：AI answers 是否正在影响 pipeline；哪些 query 会让品牌被推荐或被忽略；哪些 competitor 在 ChatGPT、Perplexity、Gemini 和 Google AI Overviews 中更常出现；AI referral traffic 和 citation rate 应该如何进入 dashboard。

推荐路线：先读 [GEO vs SEO](/blogs/generative-engine-optimization/geo-vs-seo-user-funnel)，再读 [How to Measure GEO Success](/blogs/generative-engine-optimization/how-to-measure-geo-success-ga4-beyond-traffic-counts)，然后进入 [GA4 for AI Search](/blogs/generative-engine-optimization/ga4-for-ai-search-measure-ai-traffic-geo-performance-conversions) 和 [Benchmarks](/benchmarks)。

### The Builder

适合 SEOs、content marketers、editors。

核心问题：“How do I structure content to get cited by ChatGPT & Perplexity?”

你应该优先学习：content strategy、entity clarity、statistics、quotes、source citations、heading design、prompt workflows。

Builder 的核心工作是把页面变成更好的 evidence。你需要把用户问题拆成 answer blocks，把 claim 和 source 放在同一上下文中，把比较、步骤、定义和限制写清楚，并让编辑流程保留事实核查。GEO 内容不是单纯更长，而是更容易被 chunk、retrieve、summarize 和 cite。

推荐路线：先读 [The Original GEO Paper](/blogs/generative-engine-optimization/geo-princeton-paper-original-study)，再读 [How to Dominate AI Search](/blogs/generative-engine-optimization/geo-dominate-ai-search-comparative-study) 和 [FeatGEO](/blogs/generative-engine-optimization/feat-geo-paper-feature-level-optimization)，然后用 prompting guides 建立内容 brief 与 refresh workflow。

### The Engineer

适合 developers、researchers、technical SEOs。

核心问题：“How do we build crawl-friendly infrastructure and private RAGs?”

你应该优先学习：robots.txt、llms.txt、SSR、log files、AI bot tracking、RAG chunking、hybrid search、evals。

Engineer 的任务是确保系统层面没有把好内容挡在外面。你需要确认 AI bots 能访问页面、HTML 可解析、SPA 不会只暴露空壳、日志能识别 GPTBot / OAI-SearchBot / PerplexityBot 等 crawler，RAG pipeline 能正确 chunk、retrieve、rerank 和 evaluate。

推荐路线：先看 [robots.txt for AI Bots](/blogs/generative-engine-optimization/robots-txt-ai-bots) 与 [llms.txt for SPA Hydration Gaps](/blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps)，再进入 [Log File Analysis](/blogs/generative-engine-optimization/log-file-analysis-ai-bots-geo)、[Hybrid Search](/blogs/generative-engine-optimization/hybrid-search-bm25-vectors-rag)、[RAG Evaluation](/blogs/generative-engine-optimization/ragas-rag-evaluation) 和 [LLM Evals](/resources/llm-evals)。

## Content Pillar Hubs

原站把内容组织成多个 pillar。每个 pillar 都是一个 topic area，下面链接到具体 guides 和 experiments。

这些 pillar 的作用是防止学习路径变成文章列表。你可以按问题进入，而不是按发布日期进入：如果 crawler 访问有问题，走 Basics；如果页面不能被引用，走 Content Strategy；如果团队需要提高产能，走 Prompting Techniques；如果要证明效果，走 Measurement；如果要理解研究结论，走 GEO Benchmarks。

## Basics

这一层确认 AI bots 能访问、渲染并解析内容。

Basics 是所有后续工作的前置条件。很多团队以为自己有内容问题，实际是可访问性问题：页面依赖客户端渲染，核心内容在 JavaScript 后才出现，robots.txt 阻挡了关键 crawler，或者没有任何日志监控能确认 AI bot 是否访问过页面。

完成这一层后，你应该能回答：主要 AI crawlers 是否被允许；核心页面是否有可读 HTML；是否需要 llms.txt；是否有 sitemap、canonical、structured data；是否能从 server logs 中看到 AI bot 访问路径。

| # | Guide | Type | Read |
| ---: | --- | --- | --- |
| 1 | [llms.txt for SPA Hydration Gaps](/blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps) | Technical | 9 min |
| 2 | [Is Crawlability Still an SEO Task in 2026?](/blogs/generative-engine-optimization/crawlability-seo-geo-two-meanings) | Informational | 8 min |
| 3 | [robots.txt for AI Bots](/blogs/generative-engine-optimization/robots-txt-ai-bots) | Technical | 10 min |
| 4 | [Why JSON-LD Is Important (Google Only)](/blogs/generative-engine-optimization/why-json-ld-is-important-google) | Technical | 11 min |
| 5 | [Who Created WebMCP?](/blogs/generative-engine-optimization/webmcp-history-timeline-15-months-7-engineers-3-companies) | Technical | 12 min |
| 6 | [AEO vs GEO](/blogs/generative-engine-optimization/aeo-vs-geo-microsoft) | Analysis | 5 min |
| 7 | [GEO vs SEO: How the Funnel Changed](/blogs/generative-engine-optimization/geo-vs-seo-user-funnel) | Analysis | 6 min |

## Content Strategy

这一层关注研究支持的内容结构：什么样的页面更容易被 generative engines 引用。注意：这些研究是 directional frameworks，不是永远固定的规则，因为 AI systems 会继续变化。

Content Strategy 是 GEO 的中心层。它不是“多写 FAQ”这么简单，而是把页面改造成可验证证据：清楚定义、具体统计、引用来源、实体关系、独特观点、对比维度、限制条件和简洁答案。研究说明 evidence signals 会影响生成式答案中的可见性，但新的 benchmark 也提醒，过度改写正文可能伤害 retrieval。

完成这一层后，你应该能为每个关键页面写出：目标 query、核心 answer block、需要引用的 sources、独有信息增益、实体关系、支持数据、内部链接和更新计划。

| # | Guide | Type | Read |
| ---: | --- | --- | --- |
| 1 | [The Original GEO Paper](/blogs/generative-engine-optimization/geo-princeton-paper-original-study) | Research | 11 min |
| 2 | [How to Dominate AI Search](/blogs/generative-engine-optimization/geo-dominate-ai-search-comparative-study) | Research | 13 min |
| 3 | [Google LangExtract for GEO](/blogs/generative-engine-optimization/langextract-gemini-generative-engine-optimization) | Technical | 11 min |
| 4 | [Embedding Architecture and Retrieval](/blogs/generative-engine-optimization/embedding-architecture-ai-retrieval) | Expert insights | 15 min |
| 5 | [FeatGEO](/blogs/generative-engine-optimization/feat-geo-paper-feature-level-optimization) | Research | 12 min |

## Prompting Techniques

这一层服务 SEO、marketers 和 content writers，让 LLM 参与研究、brief、内容刷新、审查和迭代。

Prompting Techniques 的目标不是让模型替代策略，而是把重复劳动结构化。好的 prompt workflow 会保留人类判断：模型负责归类、提取、对比、生成初稿和检查格式；人负责选择定位、验证事实、判断品牌语气和决定是否发布。

这部分内容适合建立内部 SOP：关键词聚类 prompt、竞争页面分析 prompt、content brief prompt、title/meta prompt、on-page audit prompt、schema prompt、GA4 解读 prompt。每个 prompt 都应该有输入格式、输出格式、失败模式和人工检查点。

| # | Guide | Type | Read |
| ---: | --- | --- | --- |
| 1 | [Zero-Shot vs Few-Shot Prompting](/blogs/generative-engine-optimization/zero-shot-vs-few-shot-prompting-seo-content) | Guide | 8 min |
| 2 | [Chain-of-Thought Prompting for Content Strategy](/blogs/generative-engine-optimization/chain-of-thought-prompting-content-strategy) | Guide | 9 min |
| 3 | [System Prompts & Role Prompting](/blogs/generative-engine-optimization/system-prompts-role-prompting-brand-voice) | Guide | 10 min |
| 4 | [Prompt Chaining for SEO Workflows](/blogs/generative-engine-optimization/prompt-chaining-seo-workflows) | Guide | 11 min |
| 5 | [Prompt Testing & Iteration](/blogs/generative-engine-optimization/prompt-testing-iteration-evaluate-improve) | Methodology | 9 min |

## Measurement & Bot Intelligence

这一层跟踪 AI bots 是否真的抓取内容、是否遵守 robots.txt，以及如何衡量 crawl coverage 和 AI referral traffic。

Measurement 层把 GEO 从观点变成系统。没有测量，你无法知道是内容没有被抓取、没有被检索、没有被引用，还是被引用了但没有带来点击。AI referral traffic 只是一个低估指标，因为很多 AI answers 不会产生点击，或者 referrer 被隐藏。

推荐至少建立三类信号：server logs 用来确认 crawler access；GA4 或 analytics 用来追踪 AI assistant referrals；citation monitoring 或手工 query tests 用来观察品牌在答案中的出现、引用和语境。

| # | Guide | Type | Read |
| ---: | --- | --- | --- |
| 1 | [Log File Analysis for AI Bots](/blogs/generative-engine-optimization/log-file-analysis-ai-bots-geo) | Technical | 14 min |
| 2 | [IndexNow by Microsoft](/blogs/generative-engine-optimization/indexnow-microsoft-ai-visibility) | Technical | 12 min |
| 3 | [Microsoft Clarity AI Bot Activity](/blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity) | Analysis | 8 min |
| 4 | [Scroll Depth in GA4](/blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm) | Technical | 12 min |
| 5 | [Google Analytics AI Assistant Channel](/blogs/generative-engine-optimization/google-analytics-ai-assistant-channel-native-tracking) | Informational | 6 min |

## Experiments & Novel Ideas

这一层保留 hands-on tests、demonstrations 和 early ideas。适合提出假设、复现实验，再决定是否进入正式 playbook。

GEO 仍然是快速变化领域，很多结论需要实验而不是信仰。这个 pillar 的作用是保存那些还没有变成正式框架、但值得观察的想法：embedding space、cosine similarity tweaking、DOI verification、source provenance、agent workflows 等。

阅读这一层时，要把每篇内容当成 hypothesis。问三个问题：实验条件是什么；结果能推广到哪些场景；哪些情况下可能失效。这样你不会把早期实验误用成永久规则。

| # | Experiment | Type | Read |
| ---: | --- | --- | --- |
| 1 | [Cosine Similarity "Tweaking" Can Backfire](/blogs/generative-engine-optimization/cosine-similarity-tweaking-backfire-reranker-experiment) | Experiment | 6 min |
| 2 | [Watching a Paragraph Move in Embedding Space](/blogs/generative-engine-optimization/semantic-visualization-experiment-embedding-space) | Experiment | 9 min |
| 3 | [DOI Verification for AI Content Trust](/blogs/generative-engine-optimization/ai-visibility-operation-provenance-lattice-construction-using-doi-records) | Novel idea | 8 min |

## GEO Benchmarks

这一层收集研究 benchmark，用来评估 GEO strategies 在不同引擎和 pipeline stages 中是否有效。

这些 benchmark 揭示的关键信号包括：只优化 body text 可能降低 retrieval performance，结构信息比许多 GEO 建议更重要，传统 SEO signals 仍然是 AI visibility 的基础之一。

Benchmarks 是判断 GEO 建议是否可靠的校准器。早期 GEO-Bench 主要看 generation stage，AutoGEO 关注自动化优化，C-SEO Bench 关注竞争动态，CC-GSEO-Bench 衡量 source influence，SAGEO Arena 则把 retrieval、reranking 和 generation 放进同一 pipeline。

实践者最需要记住的是：一个 benchmark 只能证明它覆盖范围内的结论。没有 retrieval 的实验，不能证明页面更容易进入候选集；没有 reranking 的实验，不能证明页面在上下文中的位置会改善；没有 source influence 的实验，不能证明你的页面真的改变答案。

| # | Benchmark | Type | Read |
| ---: | --- | --- | --- |
| 1 | [The Original GEO Paper](/blogs/generative-engine-optimization/geo-princeton-paper-original-study) | Research | 11 min |
| 2 | [CC-GSEO-Bench](/blogs/generative-engine-optimization/cc-gseo-bench-source-influence-generative-search) | Research | 10 min |
| 3 | [AutoGEO (ICLR 2026)](/blogs/generative-engine-optimization/autogeo-framework-iclr-2026-cmu) | Research | 10 min |
| 4 | [C-SEO Bench](/blogs/generative-engine-optimization/c-seo-bench-does-conversational-seo-work) | Research | 8 min |
| 5 | [SAGEO Arena](/blogs/generative-engine-optimization/sageo-arena-realistic-geo-benchmark) | Research | 12 min |

## The C.I.T.E. Framework

C.I.T.E. 是一个四层、可重复的方法论，目标是让内容被 cited。

C.I.T.E. 的价值是把 GEO 从“写作建议”扩展为完整系统。Crawlability & Access 解决 AI 能否读取；Information Gain & Entities 解决 AI 是否理解你是谁、你有什么独特价值；Token Optimization 解决内容是否容易被 chunk 和引用；Ecosystem Signals 解决外部世界是否支持你的可信度。

这四层应该一起工作。只做 token optimization，可能得到一篇很工整但没人信的文章；只做 external PR，可能有权威但页面不可抓取；只做 schema，可能技术干净但没有可引用事实。GEO 的实操是把四层同时拉到足够好。

## Crawlability & Access

**The technical layer**

目标：确保 AI bots 能访问并高效解析内容。

- Permissive Bot Management：在 robots.txt 中允许 GPTBot、ClaudeBot、CCBot 等关键 crawlers，同时阻止有害 scrapers。
- llms.txt for SPAs：llms.txt 只是 plain text 文件。当 SPA hydration 有问题、没有 SSR 或 pre-rendering 时，crawler 可能只看到空壳，\`/llms.txt\` 可以提供可读入口。
- Lightweight HTML：减少 DOM complexity，避免 RAG scrapers 被 JavaScript-heavy rendering 卡住。

## Information Gain & Entities

**The authority layer**

目标：说明你是谁，并提供模型不能轻易 hallucinate 的独特价值。

- Entity Identity：使用 Organization、Person、SameAs schema，把品牌锚定到 Knowledge Graph。
- Fact Density：加入独有统计、原创 quotes、proprietary data，让内容比 generic fluff 更有信息增益。
- Sourcing：大量引用 primary sources，建立模型可验证的 trust graph。

## Token Optimization

**The content layer**

目标：让内容易于 LLM chunk、retrieve 和 synthesize。

- Q&A Blocking：在 heading 后立即给出简洁直接答案，通常控制在 300 characters 内。
- Semantic Heading Structure：H2/H3 应贴近 conversational queries，例如 “How to fix...”。
- Data Serialization：用表格、列表、FAQ 呈现数据，比密集段落更容易被 LLM 解析。

## Ecosystem Signals

**The off-page layer**

目标：通过模型训练和检索体系信任的 seed set 验证权威。

- Digital PR：获得高权威 seed publications、行业 wiki、学术或媒体引用。
- Co-Citation：和同领域已知实体共同出现，例如竞品、类别领导者、标准工具。
- Omnichannel Presence：在网站、GitHub、LinkedIn、媒体、文档和数据集中保持一致事实。

## Quick Wins

**The Generative Engine Optimization Audit Checklist**

用于在一小时内快速审计站点：bot access、llms.txt、核心页面 answerability、引用与统计、schema、日志和 AI referral tracking。

Coming Soon.

在 checklist 正式上线前，可以先用这组快速检查：

1. 打开 robots.txt，确认没有误拦关键 AI crawlers。
2. 抽查核心页面的 HTML 源码，确认主要正文不只存在于 hydration 后。
3. 找 5 个最重要 landing pages，为每页补一个 80-120 字的直接答案块。
4. 给关键 claim 添加 source、date、author 或数据说明。
5. 检查 title、H1、H2、schema、canonical 与内部链接是否一致。
6. 在 analytics 中建立 AI referrals 分组。
7. 在日志里识别 GPTBot、OAI-SearchBot、PerplexityBot、ClaudeBot 等访问。
8. 手工测试 10 个品牌和品类 query，记录 AI answers 是否提到、引用或误解你。
9. 把失败样本分成 crawl、retrieval、citation、message accuracy 四类。
10. 为每类失败指定一个页面或流程的修复动作。

**Join the community**

在 LinkedIn group 里讨论 tracks、分享实验、获得实践者反馈。

[Join LinkedIn Group](https://www.linkedin.com/groups/17147018/)

**Community Submissions**

浏览 GEO practitioners 构建和提交的工具、实验和框架。

[View Submissions](/community/submissions)

## Ready to go deeper?

继续阅读完整 [Blog](/blogs)，或先从 [About](/about) 理解 GEO Community 的定位。

如果你要把这个本地站当成后续更新的工作底稿，可以这样维护：

- 新增文章时，先把它放进对应 pillar，而不是只放进 Blog。
- 每篇文章保留 source、date、author、tags、internal links 和 related reading。
- 对研究类内容，记录 benchmark scope，避免把结论推过头。
- 对工具类内容，补充适用场景、输入、输出、限制和替代方案。
- 对 measurement 内容，明确指标定义，避免把 clicks 当成全部 AI visibility。
- 每次更新内容后运行 \`npm run content:parity\`、\`npm run routes:audit\` 和 \`npm run build\`，确认没有未发布草稿、路由或渲染问题。
`;export{e as default};
