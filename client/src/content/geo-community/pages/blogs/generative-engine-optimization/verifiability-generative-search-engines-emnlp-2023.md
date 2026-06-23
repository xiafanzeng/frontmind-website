---
path: "/blogs/generative-engine-optimization/verifiability-generative-search-engines-emnlp-2023"
kind: "blog"
title: "Evaluating Verifiability in Generative Search Engines: Why 50% of AI Answers Lack Citation Support (EMNLP 2023)"
source_title: "Evaluating Verifiability in Generative Search Engines: Why 50% of AI Answers Lack Citation Support (EMNLP 2023)"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/verifiability-generative-search-engines-emnlp-2023"
author: "Rohit Singh"
date: "22 Mar 2026"
status: "ready"
---
# Evaluating Verifiability in Generative Search Engines: Why 50% of AI Answers Lack Citation Support (EMNLP 2023)

生成式搜索承诺“直接答案 + 引用来源”，看起来比传统蓝链更省事，也比无引用聊天更可信。但 Stanford 在 EMNLP 2023 的研究提醒我们：有引用不等于可验证，流畅答案尤其容易制造可信假象。

原站这篇文章围绕一个非常关键的问题展开：Bing Chat、Perplexity、YouChat 这类 generative search engine 让用户看到带 inline citations 的综合答案，但这些 citation 到底有没有支撑它旁边的 statement？Stanford 的 Nelson Liu、Tianyi Zhang 和 Percy Liang 在 EMNLP 2023 的研究给出了不太舒服的答案：只有 51.5% 的 generated statements 被 citations 完全支持，只有 74.5% 的 citations 真正支持对应说法。

这对 GEO 很重要，因为“被引用”本身不再是终点。如果 AI 把你的页面引用到你没有说过的 claim 上，品牌会承担误归因风险；如果 AI 引用你的页面但只支持句子的一半，用户会对来源和答案都产生误解。因此，本地复刻这篇时要保留原站的核心提醒：AI answer 的可验证性需要 statement-level 支撑，而不是页面上有几个链接就够。

![Evaluating Verifiability in Generative Search Engines: Citation Recall and Precision Study](https://thegeocommunity.com/images/verifiability-generative-search-engines-emnlp-2023.webp)

## 页面摘要

Stanford EMNLP 2023 研究评估 Bing Chat、NeevaAI、Perplexity 和 YouChat。结果显示，只有 51.5% 的生成式搜索 statement 被引用完全支持；即使提供了 citation，也只有 74.5% 真正支持对应说法。

## 原站章节结构

1. What is verifiability in generative search?
2. The two dimensions: citation recall and citation precision
3. How the study was conducted
4. The four systems tested
5. Key finding 1: Only 51.5% citation recall
6. Key finding 2: Only 74.5% citation precision
7. The fluency paradox: convincing answers are least trustworthy
8. Why generative search engines struggle with verifiability
9. What this means for content creators and GEO
10. The path forward: can verifiability be fixed?
11. Related reading

## Key Takeaways

- Verifiability 不是“答案旁边有链接”，而是每个 claim 都能被引用来源支持。
- Citation recall 衡量 statement 是否有来源支持；citation precision 衡量 citation 是否真的支持它旁边的 statement。
- 研究中只有 51.5% statement 被 citations 完全支持，约一半 claim 缺少可验证支撑。
- Citation precision 为 74.5%，意味着四分之一 citation 不相关、支持不足或容易误导。
- 对 GEO 来说，清晰、原子化、可验证的 claim 比流畅但模糊的 prose 更适合被准确引用。

## What is verifiability in generative search?

Generative search engine 的承诺是：先检索网页，再用 LLM 合成答案，并给出 inline citations。用户不必逐个点蓝链，也不必完全相信无来源聊天回答。

Verifiability 指用户能否根据这些 citations 检查 AI 的 statement 是否真实有依据。如果 citation 缺失、引用错位、来源只支持一半，系统就会制造“看起来有出处”的可信假象。

这和传统搜索不同。传统搜索让你自己打开链接判断；纯聊天模型通常没有来源；生成式搜索介于两者之间，因此 citation 质量本身成为产品可信度核心。

verifiability 的承诺很诱人：用户不用自己读十个网页，AI 已经综合好了；同时又不像纯聊天那样无来源，因为每段旁边都有 citation。但这个承诺只有在 citation 和 statement 严格对齐时才成立。否则 citation 会变成信任装饰，给用户一种“这句话有出处”的感觉，实际来源并没有支持。

这也是 Stanford 研究称其为 facade of trustworthiness 的原因。生成式搜索的界面越流畅、引用越整齐，用户越可能放松警惕。但如果 citation recall 和 precision 不够高，漂亮界面反而会掩盖事实支撑不足的问题。

## The two dimensions: citation recall and citation precision

Citation recall 问的是：答案里的每个 statement，有多少被至少一个 citation 完全支持？低 recall 意味着 AI 在无证据地做 claim。

Citation precision 问的是：给出的 citation 中，有多少真的支持它所附着的 statement？低 precision 意味着链接看起来相关，却没有证明那句话。

两者都必须高。高 recall 低 precision 是“每句话都挂链接，但链接不支持”；高 precision 低 recall 是“少数链接可靠，但很多 claim 没来源”。真正可信的生成式搜索需要两者同时成立。

可以用一个例子理解 recall 和 precision 的差别。AI 回答说：“法国人口约 6700 万，并且是西欧面积最大的国家。”如果 citation 只支持人口数字，不支持面积排名，那么这个 statement 没有被完全支持，recall 出问题。另一个例子是 AI 说“埃菲尔铁塔 1889 年完工，并在 1930 年前一直是世界最高建筑”，citation 页面只讲完工年份，不讲最高建筑状态和结束时间，这就是 precision 不足或部分支持。

生成式搜索必须处理的难点是，一个自然语言句子常常包含多个子 claim。传统 citation 往往挂在句末，但句末一个链接可能只支持前半句。真正高质量的 answer engine 需要更细粒度地知道哪条来源支持哪个 claim，而不是只把几个相关网页贴在段落旁。

## How the study was conducted

Stanford 团队收集 306 个 query，来源包括历史 Google 用户查询、Reddit 开放问题、Natural Questions 数据集和 adversarial edge cases。每个 query 都让四个生成式搜索系统回答，再由 Amazon Mechanical Turk 标注人员评估。

标注维度包括 fluency、perceived utility、citation recall、citation precision。标注者要判断回答是否流畅、是否有用、每个 statement 是否被 citations 支持、每个 citation 是否真的支持对应 statement。最终形成 1,021 个经过人工评估的 response。

研究数据集的 query 来源也很重要。历史 Google 查询代表真实搜索需求，Reddit 开放问题代表长尾和自然语言问法，Natural Questions 提供标准问答基准，adversarial queries 则测试边缘场景。306 个 query 不只是简单 fact lookup，而是覆盖了生成式搜索容易遇到的多样问题。

每个系统都用相同 query 生成答案，再由 Mechanical Turk workers 标注。标注不是只看“答案有没有链接”，而是逐条判断 statement 和 citation 的关系。这让研究能区分两个常被混淆的问题：答案读起来是否有用，和答案是否真的可验证。结果显示，用户感知上的流畅和有用，并不能保证 citation support。

## The four systems tested

研究测试的是 2023 年初的四个系统：

- Bing Chat：Microsoft 将 GPT-4 与 Bing Search 结合后的聊天搜索体验。
- NeevaAI：已停止运营的隐私搜索引擎，结合搜索结果和 LLM summary。
- Perplexity.ai：面向研究和 fact-finding 的生成式搜索产品。
- YouChat：You.com 的 conversational search interface。

四者都遵循 retrieve -> synthesize -> cite 的基本路径。研究关注的是最后的 cite 是否能验证 synthesize 结果。

这四个系统代表了 2023 年初 generative search 的主要形态。Bing Chat 把 GPT-4 和 Bing Search 结合，Perplexity 从一开始就强调 research/fact-finding 和可见来源，YouChat 是 You.com 的 conversational interface，NeevaAI 则是隐私搜索引擎里的 LLM summary。它们底层实现不同，但都试图用“检索 + 生成 + 引用”替代传统结果页。

四者结果接近，说明问题不只是某一家产品的 citation UI 做得不好，而是生成式搜索管线本身难以保持 source-grounded generation。检索到资料、生成自然答案、再把每个子 claim 对齐来源，这三个目标同时满足并不容易。

## Key finding 1: Only 51.5% citation recall

跨四个系统，只有 51.5% 的 generated statements 被 citations 完全支持。也就是说，几乎一半 claim 没有充分来源。

原站记录的各系统 recall 非常接近：Bing Chat 52.3%，NeevaAI 50.1%，Perplexity 51.9%，YouChat 51.8%。这种接近说明问题不是某一个产品做得差，而是生成式搜索架构中的系统性困难。

常见 failure modes 有两类：第一，AI 生成 statement 但没有给 citation；第二，给了 citation，但来源只支持句子的一部分，或支持相关但不同的 claim。

51.5% recall 的含义非常严重：在用户看到的 AI answer 中，几乎每两句话就可能有一句没有完整来源支撑。这个结果不是某个系统特别差造成的，因为 Bing、NeevaAI、Perplexity、YouChat 都在 50% 左右徘徊。研究者因此认为这是系统性限制，而不是单点 bug。

对内容创作者来说，这意味着即使你写了高质量内容，AI 也可能在合成答案时跳过 citation、漏引来源或把你的来源只用于部分 claim。GEO 监控不能只数“被引用次数”，还要看每次引用是否准确支持 AI 说法。否则品牌可能在看似成功的 citation 里承担错误归因。

## Key finding 2: Only 74.5% citation precision

即使 citation 出现，也只有 74.5% 真正支持对应 statement。换句话说，四分之一引用是 off-topic、支持不足或误导性的。

原站记录的 precision：Bing Chat 79.1%，NeevaAI 72.8%，Perplexity 74.2%，YouChat 71.9%。Bing 最高，但仍远未接近可放心信任的程度。

Precision failure 常见原因包括：链接页面谈的是相关主题但没有具体 claim；来源说法与 AI statement 不一致；来源太泛，只提到主题却没有 AI 归因给它的细节。

74.5% precision 看起来比 recall 高，但仍意味着四分之一 citation 有问题。对用户来说，这很危险，因为他们通常不会逐条点开引用核对。一个 citation 如果链接到相关页面，界面上就显得可信；但相关不等于支持。页面可能只是提到埃菲尔铁塔，却没有说它何时失去最高建筑地位；页面可能讲某产品功能，却没有支持 AI 对价格或限制的描述。

precision failure 也会伤害来源站点。用户点开你的页面后发现它没有支持 AI 的说法，可能认为是你页面不清楚，或者你在误导。实际上错误可能来自 AI 的 attribution layer。对品牌来说，这是新型 reputation risk：不是你说错了，而是 AI 把错话挂到你名下。

## The fluency paradox: convincing answers are least trustworthy

研究最反直觉的发现是 fluency paradox：写得越流畅、越像完整综合答案的 statement，越可能缺少充分 citation support。

原因并不神秘。直接从单一来源抽取的句子可能笨拙，但容易验证；跨多个来源综合的自然语言句子更像“聪明总结”，却很难把每个子 claim 对齐到正确来源。

这会产生危险动态：用户更容易信任流畅答案，但流畅答案恰恰更可能不可验证。对搜索产品来说，这是可信度 facade；对品牌来说，则可能导致你的页面被错误引用或错误归因。

fluency paradox 是这篇研究最重要的用户体验发现。四个系统在 fluency 和 perceived utility 上得分都不低，说明它们确实能生成可读、连贯、看似有帮助的答案。但越像人类专家综合出来的句子，越可能混合多个来源、补足缺失上下文、改写事实关系，也就越难精确引用。

笨拙句子反而更容易验证，因为它们更接近来源原文；漂亮句子更危险，因为它们更像合成结论。用户自然会相信漂亮句子，这就造成信任和证据之间的反向关系。GEO 内容如果想降低被误引风险，就应该把关键 claim 写得更原子、更清楚、更容易逐句引用，而不是只追求文风流畅。

## Why generative search engines struggle with verifiability

### 1. Multi-source synthesis is hard to cite

一句话可能同时包含来自两个来源的人口数据、一个来源的年份、另一个来源的排名。系统如果只挂一个 citation，就很可能只支持句子的一部分。

### 2. Retrieval doesn't guarantee citation

事实出现在 retrieved documents 里，不代表 LLM 生成时真的使用了它。模型可能依赖训练记忆、改写时丢失来源关系，或者生成看似合理但来源没有说过的细节。

### 3. No explicit citation training

很多系统更重视生成流畅、有用的答案，citation 更像后置 attribution layer。如果训练目标没有明确奖励 citation accuracy，就很难稳定做到 statement-level grounding。

multi-source synthesis 是 citation 难题的核心。一句“Paris is the capital of France, with 2.2 million people in the city proper and 12 million in the metro area” 可能需要一个来源支持首都事实，一个来源支持 city population，一个来源支持 metro population。UI 只挂一个 citation 时，用户无法知道每个数字来自哪里。系统如果挂多个 citation，也需要知道哪个 citation 对应哪个子 claim。

retrieval 和 citation 之间也有断层。事实出现在 retrieved documents 里，不代表模型生成时一定使用了它；模型可能从训练记忆中补事实，或者在 paraphrase 时改变了来源关系。原站引用论文的观点：目前并不总能清楚知道模型多大程度依赖检索内容，还是偏离检索资料自行生成。

最后是训练目标。很多早期系统优化的是 fluent and useful，而不是 citation-accurate。citation 如果只是生成后的归因步骤，就会出现“答案先写好了，再找看起来相关的来源”的风险。真正修复需要把 citation accuracy 放进训练和评估目标。

## What this means for content creators and GEO

### 1. Being cited doesn't mean being accurately represented

被 AI 引用不一定是好事。如果系统把你引用到你没有说过的 claim 上，用户点击后可能认为错误来自你的页面。这是品牌风险。

### 2. Citation-worthy content must be unambiguous

内容要让 AI 更容易准确引用：一个句子表达一个 claim，重要事实靠近来源，明确写出 “according to...”，避免长段落里混合多个事实。

### 3. Verifiability is a competitive advantage

随着用户意识到 AI citation 可能不可靠，可验证性会成为内容优势。Primary sources、structured data、清晰统计、作者信息和更新日期都会帮助建立 trust。

### 4. Monitor how you're being cited

GEO 不能只看“有没有被引用”，还要看“AI 把什么 claim 归因给你”。定期检查核心 query 下的 citation accuracy，发现误归因就改写页面、增加免责声明或补充更清晰的事实段落。

内容侧能做的第一件事是 atomic claims。不要在一个长句里混合年份、排名、价格、定义、比较和限制；每个关键事实尽量独立成句，并在相邻位置放来源。AI 更容易把一句话和一个来源对齐，就更不容易把你误引到错误 claim 上。

第二是 explicit attribution。写 “According to Stanford HAI...” 或 “The EMNLP 2023 paper reports...” 比模糊写 “research shows” 更容易让 AI 保持来源关系。第三是结构化数据和清楚元信息：作者、日期、更新记录、FAQ、HowTo、Dataset、Organization schema 都能帮助系统理解事实边界。

第四是主动监控误归因。对核心 query，定期保存 AI answer、引用 URL、被引用句子和来源页面实际内容。把问题分成三类：citation missing、citation partially supports、citation contradicts。每类都对应不同修复：补来源、拆句、改写 claim、增加限制或更新页面。

## The path forward: can verifiability be fixed?

研究作者并不认为问题无解，但需要把 citation accuracy 当成一等目标。

可能方向包括：在训练中明确奖励 citation recall 和 precision；改进 RAG 架构，让 generated text 与 retrieved evidence 更紧密；生成后再跑 verification pass，逐句检查来源；界面上同时展示 generated answer 和传统结果；教育用户不要把流畅度当准确度。

研究社区已经在做后续工作，例如 CC-GSEO-Bench 用 counterfactual analysis 衡量 source influence，SAGEO Arena 评估 full-pipeline GEO 表现。但至少在这项 2023 年基线里，问题很清楚：一半 statement 缺 citation support，四分之一 citation 不准确。

修复路径需要产品、模型和内容三方配合。模型侧可以训练 explicit citation behavior，让每个 statement 在生成时绑定 evidence，而不是事后找来源；RAG 侧可以保留 chunk-level provenance，让生成器知道哪句话来自哪个 chunk；verification 侧可以在展示前逐句检查来源支持，无法验证的句子删除、降级或标注不确定。

界面侧也可以更诚实。传统搜索结果和生成答案可以并排展示，让用户更容易核对；对低 confidence 或多来源合成的 claim，可以显示更明确的证据范围；对无法完全验证的句子，不应该用同样强的 citation UI 包装。Wikipedia 类比很有启发：用户信任 Wikipedia，不是因为每次都点来源，而是因为引用制度、编辑流程和可审计历史长期建立了信任。生成式搜索也需要类似制度，而不是只给答案加链接。

对 GEO 实践者来说，这篇研究的落点很清楚：优化 AI visibility 时不要追求“任何引用都好”。更好的目标是被准确引用、被正确归因、被用来支持你确实说过的 claim。可验证性会成为长期竞争优势，因为用户和平台都会越来越重视 citation quality。

## Citation QA workflow

GEO reporting 应该加入 citation QA，而不是只统计引用次数。一个可执行流程如下：

1. 选择 20-50 个核心 query。
2. 在多个 AI search engines 中保存答案、引用 URL、日期和截图。
3. 把答案拆成 atomic claims。
4. 对每个 claim 标注引用是否支持：fully supports、partially supports、related but unsupported、contradicts、missing citation。
5. 记录错误来源：页面不清楚、AI 合成错误、引用错 URL、旧内容、竞品混淆。
6. 把可修复问题回写到页面：拆句、补来源、更新日期、增加表格、明确限制。

这套流程能把“我们有没有被引用”升级成“AI 是否正确使用我们的内容”。对品牌来说，后者更重要。

## Page patterns that improve verifiability

可验证页面通常有几个共同点。

| Pattern | 为什么有用 |
| --- | --- |
| Atomic claim | 一句话只表达一个关键事实 |
| Nearby source | 来源紧贴 claim，减少归因漂移 |
| Explicit date | 防止旧事实被当成当前事实 |
| Defined entity | 清楚说明产品、组织、模型、论文是谁 |
| Table or list | 把多事实拆成可引用单元 |
| Limitation note | 说明 claim 的范围，降低过度泛化 |
| Author and update metadata | 提高来源可信度和可审计性 |

这不是为了把文章写得像数据库，而是为了让生成式搜索更难误解。流畅长段落适合人类阅读，但若一个段落同时包含 8 个 claim，AI 很难把每个 claim 绑定到正确来源。

## Monitoring misattribution risk

误归因比没有引用更棘手。没有引用只是 visibility gap；误归因会让用户以为错误来自你的站点。

可以把风险分成三类：

| Risk | 示例 | 修复 |
| --- | --- | --- |
| Overclaim | AI 引用你页面支持你没有说过的结果 | 明确限制、拆句、加免责声明 |
| Competitor bleed | AI 把竞品功能或价格归到你品牌 | 强化品牌实体、产品边界、comparison table |
| Stale fact | AI 引用旧页面里的过期价格或版本 | 更新日期、版本化、301 或 noindex 旧页 |

监控时要保存 query、engine、answer、citation URL、claim、页面实际内容和修复状态。后续如果同类错误重复出现，说明不是单个页面问题，而是站点实体或内容结构问题。

## How to rewrite for citation precision

如果页面经常被 AI 错误引用，可以这样改。

把复合句拆开。例如不要写：“Our platform supports enterprise analytics, custom onboarding, and SOC 2 workflows for regulated teams.” 如果 SOC 2 只适用于某套餐，应拆成多句并写清条件。

把来源从段落末尾移到 claim 附近。长段落最后放一个链接，会让模型和用户都难以判断链接支持哪一句。

把比较信息做成表格。竞品、价格、限制、适用场景如果写在长段落里，容易被模型混合；表格更容易保持边界。

把旧信息标注版本。比如 “As of April 2026” 或 “For the 2026 Enterprise plan”。没有时间边界的事实更容易被长期误用。

把作者和组织信息写清楚。AI 如果无法理解页面是谁写的、属于哪个品牌、更新时间是什么，citation confidence 和 entity accuracy 都会下降。

## Verifiability as a content moat

早期 GEO 很容易把目标理解成“被更多 AI answer 提到”。长期来看，真正的壁垒是“被准确引用”。当用户和平台越来越关注引用质量，含混、过度营销、缺少来源的页面会变得更脆弱。

可验证内容也更适合获得自然链接、媒体引用、AI 引用和内部知识库复用。它能服务多种渠道：搜索用户能核对事实，记者能引用数据，AI agent 能抽取 claim，销售团队能复用解释，客服团队能给出一致答案。

因此，本页应该和 [Brand Guardrails](/blogs/generative-engine-optimization/brand-guardrails-ai-hallucinations)、[Human vs LLM-as-Judge](/blogs/generative-engine-optimization/human-vs-llm-judge-evaluation) 和 [LLM Eval Metrics Taxonomy](/blogs/generative-engine-optimization/llm-eval-metrics-taxonomy) 连起来看。GEO 不是只争取曝光，也要评估答案质量和品牌风险。

## Citation

Liu, N. F., Zhang, T., & Liang, P. (2023). Evaluating Verifiability in Generative Search Engines. Findings of EMNLP 2023. [arXiv:2304.09848](https://arxiv.org/abs/2304.09848)

## Related reading

- [Stanford HAI coverage](https://hai.stanford.edu/news/generative-search-engines-beware-facade-trustworthiness)
- [SAGEO Arena](/blogs/generative-engine-optimization/sageo-arena-realistic-geo-benchmark)
- [CC-GSEO-Bench](/blogs/generative-engine-optimization/cc-gseo-bench-source-influence-generative-search)
- [The Original GEO Paper](/blogs/generative-engine-optimization/geo-princeton-paper-original-study)
- [AutoGEO Framework](/blogs/generative-engine-optimization/autogeo-framework-iclr-2026-cmu)
- [GEO vs SEO User Funnel](/blogs/generative-engine-optimization/geo-vs-seo-user-funnel)
- [Rohit Singh](https://www.linkedin.com/in/rohitsingh017)

## About the author

Rohit Singh 是 The GEO Community 与 GeoZ AI 的创始人，关注 generative search、citation quality、GEO measurement、LLM evals 和 AI visibility 风险。

## Continue your learning journey

如果你正在搭建 AI citation QA，可以继续读 [CC-GSEO-Bench](/blogs/generative-engine-optimization/cc-gseo-bench-source-influence-generative-search)、[SAGEO Arena](/blogs/generative-engine-optimization/sageo-arena-realistic-geo-benchmark) 和 [Human vs LLM-as-Judge](/blogs/generative-engine-optimization/human-vs-llm-judge-evaluation)。

## Read next

- [MAGEO: Multi-Agent GEO](/blogs/generative-engine-optimization/mageo-multi-agent-geo-reusable-strategy-learning)
- [Google AI Optimization Guide](/blogs/generative-engine-optimization/google-ai-optimization-guide-geo-hype)
- [GA4 Native AI Assistant Channel](/blogs/generative-engine-optimization/google-analytics-ai-assistant-channel-native-tracking)
