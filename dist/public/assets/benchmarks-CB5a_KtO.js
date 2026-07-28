const n=`---
path: "/benchmarks"
kind: "page"
title: "主要 GEO Benchmark 对比"
source_title: "Comparing All Major GEO Benchmarks (2023–2026)"
source_url: "https://thegeocommunity.com/benchmarks"
author: ""
date: ""
status: "ready"
---
# 主要 GEO Benchmark 对比

GEO benchmark 用来评估内容优化在生成式搜索中的效果。不同 benchmark 测的不是同一件事：有些只看生成阶段，有些考虑多角色竞争，有些开始覆盖真实搜索管线中的 retrieval、reranking 和 generation。

目前至少有 5 个主要 benchmark 可以用来理解 Generative Engine Optimization (GEO) 策略：GEO-Bench、AutoGEO、C-SEO Bench、CC-GSEO-Bench 和 SAGEO Arena。它们覆盖的评估面差异很大：有的默认候选文档已经给定，只看最终答案是否使用某个来源；有的模拟多发布者竞争；有的衡量 source 对答案的边际影响；SAGEO Arena 则把 170K 真实网页文档放进完整 search pipeline 中测试。

这个页面对比 2023 到 2026 年的主要 GEO benchmark，帮助实践者判断每个研究能说明什么，又漏掉了什么。它的重点不是给某个 benchmark 排名，而是提醒团队：如果一个实验只覆盖 generation，它就不能回答 retrieval 失败、reranking 失败或结构信息缺失的问题。

## Side-by-Side Comparison

下面的对比基于 SAGEO Arena paper 的比较框架。勾号代表该 benchmark 覆盖这个组件，叉号代表没有覆盖。这个表格是理解各项研究边界的入口。

| Benchmark | Doc. Corpus | Retrieval | Reranking | Generation | Structure Info. | Body Text | Search Eval | Generation Eval | Visibility Metric |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [GEO-Bench](https://arxiv.org/abs/2311.09735) | - | no | no | no | yes | yes | no | no | Word Count (PAWC) |
| [AutoGEO](https://arxiv.org/abs/2510.11438) | - | no | no | no | yes | no | yes | no | Word Count + Utility (GEU) |
| C-SEO Bench | - | no | yes | yes | no | yes | yes | yes | Citation Rank |
| [CC-GSEO-Bench](https://arxiv.org/abs/2509.05607) | - | no | no | yes | no | yes | yes | yes | Influence |
| [SAGEO Arena](https://arxiv.org/abs/2602.12187) | 170K | yes | yes | yes | yes | yes | yes | yes | Hit Rate, Rank Change |

GEO-Bench 是较早的生成式引擎优化基准，关注在给定候选文档下，内容策略是否提升被答案窗口使用的概率。AutoGEO 关注自动提取规则并重写内容。C-SEO Bench 关注对话式搜索中的竞争和拥堵效应。CC-GSEO-Bench 用曝光、忠实归因和因果影响衡量来源影响。SAGEO Arena 则进一步把真实搜索管线纳入评估。

原站页面的核心提示是：绿色勾号多不代表研究“更好”，而是代表它覆盖的真实搜索管线更完整。对 GEO 实践者来说，coverage 决定了你能从结果里推断什么。如果一个 benchmark 没有 retrieval，它就无法证明某种写法会让页面更容易进入候选集；如果没有 reranking，它也无法证明页面在模型上下文中的位置会改善。

## Key Takeaway: Why Pipeline Coverage Matters

最重要的结论是：只优化生成阶段不够。真实 AI 搜索通常先检索文档，再 rerank，再生成答案。内容如果没有进入候选集，后续再适合引用也没有意义。

多数 GEO benchmark 只评估 generation stage 的优化效果，因为它们假设文档已经被 retrieved 和 ranked。但 Perplexity、ChatGPT Search、Google AI Overviews 这类真实 generative search engine 通常不是这样工作：文档必须先进入检索候选集，再通过 reranking，最后才可能被生成器引用。

SAGEO Arena 的价值在于提醒实践者：过度改写正文可能提高“看起来适合 LLM”的程度，却削弱关键词密度、检索排名或结构信号。论文报告 AutoGEO 这类 aggressive rewriting 在 retrieval rank 上可能出现显著下降，因为关键词密度被稀释，传统检索信号变弱。

给 GEO practitioner 的底线结论是：只优化 body text 不够，而且可能伤害可见性。有效 GEO 要同时覆盖 retrieval、reranking 和 generation。结构化信息、meta descriptions、headings、schema markup、页面层级与传统 SEO signals 往往比“把正文改得更像 LLM 喜欢的文字”更关键。

## Benchmark Deep-Dives

### GEO-Bench

GEO-Bench 来自 Pranjal Aggarwal 等人在 Princeton、IIT Delhi、Georgia Tech 的早期 GEO 研究，发表于 ICLR 2024 相关工作线。它是第一个标准化评估 GEO 方法的 benchmark，包含 10,000 个 query，横跨 9 个 domain。

它引入 Position-Adjusted Word Count (PAWC) 和 Subjective Impression 等指标，测试 9 种优化策略，包括 Cite Sources、Quotation Addition、Statistics Addition 等。研究发现，引用来源、增加引语和增加统计数据这类 evidence-oriented 的策略能显著提升 visibility，尤其是让小站在某些设置下获得更高相对提升。

Strengths：

- 第一个标准化 GEO benchmark，给领域建立了共同讨论语言。
- Query set 较大，覆盖 10,000 个查询。
- 涵盖 9 个 domain，不只是单一垂直领域。
- 数据和设置更容易被后续研究引用、比较和复现。

Limitations：

- 没有真实 retrieval pipeline。
- 没有 reranking pipeline。
- 默认候选文档已经被给定，因此无法解释“为什么页面没有进入候选集”。
- 更适合研究 generation 阶段的 source selection，而不是完整 AI search visibility。

入口：[GEO-Bench](https://arxiv.org/abs/2311.09735)

站内深潜：[GEO paper deep dive](/blogs/generative-engine-optimization/geo-princeton-paper-original-study)

### AutoGEO

AutoGEO 来自 CMU 的 Yujiang Wu、Shanshan Zhong、Yubin Kim、Chenyan Xiong 等人，论文方向是自动识别 generative search engine 的内容偏好，并以合作方式优化网页内容。

它关注自动化优化：从生成式引擎行为中提取 preference rules，再重写文档以提升 visibility，同时用 utility 指标约束内容准确性。框架包含 Rule Extraction、AutoGEOAPI 和 AutoGEOMini。AutoGEOAPI 使用 prompt-based 方式，AutoGEOMini 则更偏向低成本、强化学习训练后的优化器。

AutoGEO 引入 GEO score 衡量可见性，引入 GEU score 衡量 utility，让研究不只问“有没有更多曝光”，也问“内容是否仍然准确、有用”。这对未来自动 GEO agent 很重要，因为自动改写如果只追求被引用，很容易把内容推向过度优化、信息漂移或检索损伤。

Strengths：

- 把 GEO 从手工 heuristic 推向自动化优化框架。
- 同时衡量 visibility 和 utility，而不是只看曝光。
- 有开源模型和 HuggingFace 相关资源，便于进一步实验。
- 支持跨多个 generative engine 的偏好学习。

Limitations：

- 没有 end-to-end pipeline evaluation。
- SAGEO Arena 指出它在真实检索设置中可能降低 retrieval rank。
- 仍然依赖预设候选文档，因此不能完全代表真实搜索路径。
- 如果策略直接重写正文，可能稀释关键词、实体和传统检索信号。

入口：[AutoGEO](https://arxiv.org/abs/2510.11438)

站内深潜：[AutoGEO deep dive](/blogs/generative-engine-optimization/autogeo-framework-iclr-2026-cmu)

### C-SEO Bench

C-SEO Bench 把 conversational search 和竞争环境引入评估。它的重点不是“某个页面改写后是否更像 AI 答案”，而是多个发布者同时优化时，单个 tactic 的收益是否会被拥堵稀释。

它使用 multi-actor simulation 测试 conversational SEO tactics。核心发现是：多数 C-SEO 方法在规模化竞争中效果有限，传统 SEO 信号、retrieval ranking 和文档在模型 context 中的位置往往比 LLM-friendly rewriting 更重要。当很多发布者采用相似 tactic 时，收益会因为 congestion dynamics 被压缩。

Strengths：

- 把 realistic competition 放进评估，而不是单页面孤立测试。
- 覆盖 reranking 与 generation 阶段。
- 揭示零和竞争、拥堵效应和 tactic saturation。

Limitations：

- 没有 retrieval stage evaluation。
- 没有保留结构信息。
- 没有大规模真实 document corpus。
- 对“如何进入候选集”的解释仍然有限。

入口：[C-SEO Bench deep dive](/blogs/generative-engine-optimization/c-seo-bench-does-conversational-seo-work)

### CC-GSEO-Bench

CC-GSEO-Bench 是 content-centric benchmark，关注 source influence，而不是只看某个 answer 中是否出现了链接。它衡量三个核心维度：Exposure、Faithful Credit 和 Causal Impact。

Exposure 问的是：source 在答案中有多可见。Faithful Credit 问的是：答案是否准确使用了 source，而不是错误归因或断章取义。Causal Impact 问的是：如果移除该 source，答案会发生什么变化。这个 counterfactual analysis 能更好地隔离一个来源的边际贡献。

数据规模上，它包含 1,000+ source articles 和 5,000+ query-article pairs。对创作者和品牌来说，这比“有没有被引用”更接近真实问题：我的内容是否改变了答案，是否被忠实使用，是否对一个 query cluster 的答案产生稳定影响。

Strengths：

- 以 creator 和 source 为中心，而不是只以最终答案为中心。
- 使用 with/without source 的反事实分析。
- 同时衡量 exposure、faithful credit 和 causal impact。
- 可以跨 query cluster 做 article-level aggregation。

Limitations：

- 没有完整 retrieval 或 reranking pipeline。
- 没有结构信息。
- 没有真实 document corpus 场景。
- 对技术 SEO、schema、metadata 这类前置可见性因素解释不足。

入口：[CC-GSEO-Bench](https://arxiv.org/abs/2509.05607)

站内深潜：[CC-GSEO-Bench deep dive](/blogs/generative-engine-optimization/cc-gseo-bench-source-influence-generative-search)

### SAGEO Arena

SAGEO Arena 是目前最接近真实生成式搜索流程的 GEO benchmark。它把 retrieval、reranking 和 generation 放在同一个评估环境中，在 170K web document corpus 上测试，并保留 schema markup、meta descriptions、headings 等结构信息。

它最重要的发现是：body-text-only optimization 在多个阶段都可能降低 visibility。原因很直接：真实 AI search 不是直接把页面交给 LLM 摘要，而是先通过 retrieval 选候选，再通过 reranking 决定上下文位置，最后才生成答案。如果正文优化破坏了关键词、实体、标题或结构信号，页面可能在前两步就失败。

SAGEO Arena 也把 SEO 与 GEO 重新连接起来：传统 SEO signals 并没有消失，反而在 AI visibility 的前置阶段仍然关键。GEO 不应该只是一组 LLM 写作技巧，而应该同时关注 technical crawlability、结构信息、source authority、context placement 和生成阶段的 evidence design。

Strengths：

- 覆盖完整 end-to-end pipeline：retrieval、reranking、generation。
- 使用 170K 真实 web documents。
- 保留 structural information，而不是只看 body text。
- 支持 pipeline-wide visibility measurement。
- 对现代 GEO 实践最有直接警示意义。

Limitations：

- 相比早期 benchmark 更新，社区采用和复现还在早期。
- 完整 pipeline 更复杂，实验成本更高。
- 结论更接近真实搜索，但也更依赖具体检索和生成设置。

入口：[SAGEO Arena](https://arxiv.org/abs/2602.12187)

站内深潜：[SAGEO Arena deep dive](/blogs/generative-engine-optimization/sageo-arena-realistic-geo-benchmark)

## How GEO Benchmarks Have Evolved

### Generation-Only (2023-2024)

早期 benchmark 多数假设候选文档已经存在，只测生成阶段是否会使用某段内容。GEO-Bench 在这个阶段定义了很多后续讨论会使用的语言：PAWC、citation likelihood、source visibility、内容策略对答案上下文的影响等。

这个阶段的优点是控制变量清楚，能帮助研究者发现证据密度、引用格式、统计数据、权威来源等因素的重要性。它的不足也同样明显：它不能解释为什么很多页面从未进入候选集，也不能衡量一个策略是否会伤害检索排名。

### Multi-Dimensional (2025)

2025 年的 benchmark 开始加入多维指标：可见性、utility tradeoffs、忠实归因、来源影响、竞争环境和不同引擎行为差异。AutoGEO、C-SEO Bench 和 CC-GSEO-Bench 都推动 GEO 从“改写正文”走向更复杂的问题：收益是否稳定，source 是否被忠实使用，竞争者一起优化后收益是否消失，内容改写是否仍然保留准确性。

这个阶段也让实践者意识到：GEO 不是一条固定 checklist。不同引擎、不同 query 类型、不同竞争密度和不同内容结构都会改变效果。一个策略在小规模测试里有效，不代表在拥挤市场中仍然有效。

### Full Pipeline (2026)

2026 年的重点转向全管线评估。SAGEO Arena 这类 benchmark 把 SEO 和 GEO 接回同一条链路：retrieval、reranking、generation。真实 GEO 必须同时处理传统检索信号、结构信息、reranking、内容证据和生成阶段引用。只看最终答案会漏掉前面所有失败原因。

对实际团队来说，这意味着 GEO audit 至少要分层：页面是否可抓取，HTML 是否可解析，结构信息是否清楚，内容是否能进入候选集，文档是否能在 reranking 中保住位置，最终答案是否忠实引用。任何一层失败，最终都可能表现为“AI 没有提到我们”。

## Explore the research

每个 benchmark 都代表 GEO 发展史中的一段。建议按顺序阅读：先理解 GEO-Bench 如何定义 visibility，再看 AutoGEO 如何自动化优化，再看 C-SEO Bench 和 CC-GSEO-Bench 如何处理竞争与 source influence，最后用 SAGEO Arena 理解完整 pipeline 为什么会改变结论。

- [GEO paper deep dive](/blogs/generative-engine-optimization/geo-princeton-paper-original-study)
- [AutoGEO deep dive](/blogs/generative-engine-optimization/autogeo-framework-iclr-2026-cmu)
- [C-SEO Bench deep dive](/blogs/generative-engine-optimization/c-seo-bench-does-conversational-seo-work)
- [CC-GSEO-Bench deep dive](/blogs/generative-engine-optimization/cc-gseo-bench-source-influence-generative-search)
- [SAGEO Arena deep dive](/blogs/generative-engine-optimization/sageo-arena-realistic-geo-benchmark)
- [Start Here](/start)

## Practical use for GEO teams

如果你是在做实际 GEO strategy，可以把这些 benchmark 当作诊断地图：

- 想知道“证据型写法是否更容易被引用”，优先看 GEO-Bench。
- 想知道“能否自动提取引擎偏好并改写内容”，看 AutoGEO。
- 想知道“竞争者也优化时策略是否还有效”，看 C-SEO Bench。
- 想知道“我的 source 是否真的改变答案”，看 CC-GSEO-Bench。
- 想知道“真实 AI search pipeline 中哪里失败”，看 SAGEO Arena。

这个页面后续可以继续扩展成一张内部决策表：每次新增论文或 benchmark，都记录它覆盖的 pipeline stage、数据规模、指标、对 SEO/GEO 实践的含义，以及不能从该研究中推出的结论。
`;export{n as default};
