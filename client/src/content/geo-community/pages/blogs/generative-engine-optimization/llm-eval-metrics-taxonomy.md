---
path: "/blogs/generative-engine-optimization/llm-eval-metrics-taxonomy"
kind: "blog"
title: "The LLM Eval Metrics Taxonomy: Faithfulness, Relevance, Safety, and Beyond"
source_title: "The LLM Eval Metrics Taxonomy: Faithfulness, Relevance, Safety, and Beyond"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/llm-eval-metrics-taxonomy"
author: "Rohit Singh"
date: "11 Apr 2026"
status: "ready"
---

> 选择错误的 eval metric，和没有 eval 一样危险。只看 BLEU 的团队会得到一个几乎不能说明 LLM 应用质量的数字；只看 faithfulness 的团队能知道模型有没有脱离上下文，却不知道回答是否真正帮到用户。LLM eval metrics 必须按失败模式分类，而不是随手堆一组分数。

这篇文章把常见 LLM eval 指标分成六个家族：reference-based、model-based、RAG-specific、safety/alignment、calibration/uncertainty 和 task-specific。每一类捕捉不同 failure mode；任何一类缺席，都意味着对应风险对你不可见。

**In this article:** [taxonomy](#why-metrics-taxonomy-matters) · [six families](#the-six-metric-families) · [reference metrics](#family-1-reference-based-metrics-and-why-to-be-careful) · [LLM-as-judge](#family-2-model-based-metrics-llm-as-judge) · [RAG metrics](#family-3-rag-specific-metrics) · [safety](#family-4-safety-and-alignment-metrics) · [calibration](#family-5-calibration-and-uncertainty-metrics) · [task metrics](#family-6-task-specific-metrics) · [minimum suite](#the-minimum-viable-eval-suite) · [takeaways](#key-takeaways) · [FAQ](#faq)

![LLM eval metrics taxonomy — faithfulness, relevance, safety, and instruction-following metric families](https://thegeocommunity.com/images/llm-eval-metrics-taxonomy.webp)

## Why metrics taxonomy matters

过去三年，LLM evaluation 领域产生了大量指标。很多团队接触它们的方式很碎片：从 NLP 教程里学到 BLEU，从 RAG 文档里学到 faithfulness，从论文里看到 G-Eval，然后把这些指标塞进同一个 dashboard。

问题是，这样的 eval suite 往往同时出现两个错误：

- 重复测量同一个维度，制造“覆盖很全”的错觉。
- 关键 failure mode 完全没被测到，直到上线后才暴露。

taxonomy 的作用是把指标和失败类型对齐。例如，faithfulness 主要测回答是否被提供的 context 支持；safety classifier 测是否违反安全政策；format checker 测结构是否遵守要求。它们不是互相替代的关系。

组织原则很简单：每个 metric family 捕捉一个不同类别的失败。如果你的 eval suite 缺少某个 family，那类失败就不会出现在你的质量信号里。

## The six metric families

| Family | 主要测什么 | 需要什么基础设施 | 常见误用 |
| --- | --- | --- | --- |
| Reference-based | 生成结果和标准答案的 token/string overlap | reference answers | 用在开放式生成上 |
| Model-based | 由 LLM judge 评估语义质量、相关性、连贯性 | judge model API + rubric | 忽视 judge bias |
| RAG-specific | retrieval 与 generation 的耦合质量 | retrieved context + answer | 把 faithfulness 当 truth |
| Safety/alignment | 有害内容、政策违规、注入攻击 | 专门 classifier 或 adversarial suite | 用通用 LLM judge 代替 |
| Calibration/uncertainty | 置信度和准确率是否一致 | probability 或 abstention signal | API-only 场景强行算 ECE |
| Task-specific | 任务特定成功条件 | 任务 rubric、测试或 schema | 只用通用质量分数 |

一个最小可行 eval suite 至少应覆盖：relevance、RAG 场景下的 faithfulness、safety、format/instruction-following。更成熟的系统再加 calibration、domain rubric、human review 和 regression gates。

## Family 1: Reference-based metrics (and why to be careful)

Reference-based metrics 会把生成输出和人工标准答案比较。它们是最早的 NLP eval 指标，也最容易被现代 LLM 应用误用。

**BLEU**

[BLEU](https://aclanthology.org/P02-1040.pdf) 最初用于机器翻译，测 n-gram precision。输出和 reference 越接近，分数越高。

它适合窄输出任务：固定术语、模板化回答、翻译一致性、格式非常受限的摘要。它不适合开放式问答，因为语义正确的 paraphrase 可能几乎没有相同 n-gram，从而被打低分。

**ROUGE**

[ROUGE](https://aclanthology.org/W04-1013.pdf) 更关注 recall，常用于摘要。ROUGE-L 使用 longest common subsequence。

它能告诉你输出有没有覆盖 reference 的关键片段，但不能告诉你输出是否有多余内容、是否事实正确、是否表达清楚。一个长而啰嗦的答案可能因为覆盖了 reference 词块而得高分。

**Reference gap**

现代 LLM 应用最大的挑战是：很多任务没有唯一正确答案。建议、解释、客服对话、创意写作、分析型回答，都可以有多个正确表达。Reference-based metrics 会惩罚这种合理多样性。

[BIG-bench](https://arxiv.org/abs/2206.04615) 这类开放 benchmark 也显示，在开放任务上，reference-overlap 和人类判断的相关性并不稳定。结论很直接：只有当任务输出空间很窄时，才把 BLEU/ROUGE 放在核心位置。

## Family 2: Model-based metrics (LLM-as-judge)

Model-based metrics 用第二个 LLM 来评价主模型输出。judge 会收到任务描述、评分标准、输入、输出，有时还会收到 reference 或 context，然后给出数值或分类结果。

[MT-Bench](https://arxiv.org/abs/2306.05685) 证明 GPT-4 作为 judge 在 pairwise preference 上能达到约 80-85% 的人类一致性。[G-Eval](https://arxiv.org/abs/2303.16634) 则把 chain-of-thought reasoning 引入评分流程，让 judge 先按 rubric 推理，再给分。

Model-based metrics 适合：

- relevance：回答是否针对用户问题。
- coherence：结构是否清晰、是否自洽。
- helpfulness：是否真正可用。
- criteria checks：是否满足某些明确要求。

但 LLM-as-judge 有系统性偏差，需要治理：

- position bias：pairwise 对比时更偏好第一个选项。
- verbosity bias：更长回答可能被误判为更好。
- self-enhancement bias：judge model 更偏好像自己生成风格的答案。

缓解方法包括：随机交换顺序、长度约束、使用不同模型家族做 judge、把整体评分拆成独立 criteria、对关键样本加入 human review。更完整的取舍可以看 [Human vs LLM-as-Judge](/blogs/generative-engine-optimization/human-vs-llm-judge-evaluation)。

## Family 3: RAG-specific metrics

RAG 系统同时包含 retriever 和 generator，所以需要专门指标。只看最终回答质量无法判断问题来自哪里：是没取到正确 context，还是模型拿到 context 后编造了内容？

**Faithfulness**

Faithfulness 测回答中的 claims 是否被 retrieved context 支持。一个 faithful answer 只说 context 里能追溯到的内容；unfaithful answer 会添加、夸大或矛盾。

重要区别：faithfulness 不等于客观真实。一个回答可以忠实于错误 context。Groundedness 更接近“外部事实是否可验证”，faithfulness 只是“是否被给定 context 支持”。

[RAGAS](https://docs.ragas.io/) 通常会把回答拆成 atomic claims，再逐条验证它们是否被 context 支持。实现细节可看 [RAGAS for RAG Evaluation](/blogs/generative-engine-optimization/ragas-rag-evaluation)。

**Context relevance**

Context relevance 测检索到的 passage 是否真的与问题相关。它捕捉的是 retriever failure：取错文档、chunk 太宽、embedding drift、metadata filter 错误。

常见拆分是：

- Context Precision：取回来的 chunks 里有多少相关。
- Context Recall：所有必要信息里有多少被取回。

**Answer relevance**

Answer relevance 测最终回答是否真正回答了问题。一个答案可能 faithful 且 factual，却没有解决用户问题，例如答了相关但不同的问题，或把关键结论埋在长段落里。

**Citation accuracy**

如果系统输出引用，还要检查 citation 是否支持相应 claim。关于生成式搜索可验证性的研究显示，AI 回答里的引用并不总是支持它们旁边的主张，因此 citation eval 是 GEO 和 AI search 产品的关键指标。相关可读 [Verifiability in Generative Search Engines](/blogs/generative-engine-optimization/verifiability-generative-search-engines-emnlp-2023)。

## Family 4: Safety and alignment metrics

Safety metrics 衡量输出是否包含有害、违规或不适当内容。这里不建议只用通用 LLM judge，因为安全分类是专门任务，需要专门数据、边界和 adversarial cases。

**Toxicity**

[Perspective API](https://www.perspectiveapi.com/) 是常见 toxicity classifier，可检测辱骂、冒犯和有害语言。但它主要覆盖广义网络语境，对金融建议、医疗建议、招聘歧视、合规风险等 domain-specific harm 不一定敏感。

**Llama Guard**

[Llama Guard](https://ai.meta.com/research/publications/llama-guard-llm-based-input-output-safeguard-for-human-ai-conversations/) 是 Meta 针对 LLM input/output pair 设计的安全分类模型，可返回 pass/fail 和类别标签。论文报告它在多个安全数据集上优于用通用 LLM prompt 临时做分类。

**Prompt injection**

Prompt injection 不是普通质量问题，而是 adversarial safety 问题。检测它需要攻击样本库：让用户输入尝试覆盖系统指令、泄露 hidden prompt、绕过工具权限或改变输出策略。相关流程可看 [Red-Teaming LLMs](/blogs/generative-engine-optimization/red-teaming-llm-safety-evaluation)。

**Hallucination rate**

Hallucination rate 测输出里事实错误或无支撑 claim 的比例。闭域系统可以用 reference answer；开放域系统需要事实验证工具、retrieval evidence 或 human review。[TruthfulQA](https://arxiv.org/abs/2109.07958) 提醒我们：更大模型不自动意味着更 truthful。

## Family 5: Calibration and uncertainty metrics

Calibration 测模型表达的置信度是否和真实准确率匹配。一个 well-calibrated system 说“我 90% 确信”时，应当大约 90% 情况正确。

**Expected Calibration Error**

ECE 会把预测分成多个 confidence bucket，再计算每个 bucket 的平均置信度与实际准确率差距。差距越小，calibration 越好。

问题是，许多生产 LLM API 不暴露 token-level probabilities，也不会给出可靠 confidence score，因此 ECE 在 API-only 场景下并不总是可行。

**Selective prediction**

如果系统可以拒答或 abstain，就要衡量 coverage 与 accuracy 的 tradeoff。一个好的系统应当在不确定时减少回答，在回答时保持高准确率。这对医疗、法律、金融和高风险运营工具尤其重要。

## Family 6: Task-specific metrics

很多应用需要任务专属指标。通用 helpfulness 分数无法替代实际成功条件。

| Task | Relevant metrics |
| --- | --- |
| Code generation | Pass@k、unit tests、syntax validity、style checks |
| Summarization | compression ratio、information density、ROUGE-L、human adequacy |
| Dialogue | coherence、engagement、turn length、policy adherence |
| Structured output | schema validity、field completeness、type correctness |
| Tool use / agents | tool call accuracy、task completion rate、step efficiency |
| Translation | BLEU、chrF、TER、human fluency/adequacy |

Agentic 系统尤其要看 task completion rate、steps to completion、robustness。只要系统需要多步工具调用，单轮回答质量就不是完整指标。

## The minimum viable eval suite

每个生产 LLM 应用至少应该有以下四类指标：

1. Relevance：回答是否针对问题。
2. Faithfulness：如果是 RAG，回答是否被 context 支持。
3. Safety：是否通过 Llama Guard、Perspective API 或等价安全分类。
4. Format / instruction-following：输出结构、字段、约束是否满足。

这四类覆盖最常见的失败：答非所问、脱离证据、输出有害、格式不合规。随着系统成熟，再加入 calibration、domain-specific rubric、human annotation、CI regression 和 production monitoring。

概念层可以先读 [What Are LLM Evals](/blogs/generative-engine-optimization/what-are-llm-evals)，再读 [Human vs LLM-as-Judge](/blogs/generative-engine-optimization/human-vs-llm-judge-evaluation) 来决定 judge 基础设施。

## Key Takeaways

- LLM eval metrics 可分为六大家族，每类捕捉不同 failure mode。
- BLEU/ROUGE 测 token overlap，不是开放式生成的语义质量。
- Faithfulness 和 groundedness 不同：前者看 context support，后者看外部事实可验证。
- Safety metrics 应使用专门 classifier 或 adversarial suite，而不是只靠通用 judge。
- 最小可行 eval suite 应覆盖 relevance、faithfulness、safety 和 format/instruction-following。

## How to choose metrics by product type

指标选择应从产品类型开始，而不是从工具支持什么开始。客服机器人需要 relevance、policy adherence、tone、hallucination rate、handoff accuracy；RAG 搜索需要 context precision、context recall、faithfulness、citation accuracy、answer relevance；写作工具需要 instruction-following、style adherence、factuality、readability；agent 工具需要 task completion、tool-call accuracy、step efficiency、recovery from errors；安全敏感助手需要 refusal accuracy、jailbreak resistance、toxicity、privacy leakage 和 human escalation rate。

如果是 GEO 或 AI search 产品，最重要的组合是 source attribution、citation faithfulness、answer accuracy、brand/entity accuracy 和 coverage。AI answer 不只要“像答案”，还要正确归因给来源，不能把竞品 claim 归到你身上，也不能引用不支持该 claim 的页面。

如果是内部知识库，faithfulness 和 context relevance 比 general helpfulness 更重要。用户通常要查内部事实，错误答案的代价比回答不够优雅更高。还要加入 abstention metric：当资料不足时，系统是否愿意说不知道，还是编出看似合理的回答。

如果是面向生产的 agent，评估必须覆盖过程而不只是最终答案。一个 agent 最后给出正确总结，但中间点击了错误按钮、读取了无权限数据、绕过确认步骤，仍然是不合格。Agent eval 应记录每一步 tool call、状态变化、权限边界和最终任务结果。

## Metric design pitfalls

第一个陷阱是把相关性当作正确性。一个答案可能非常相关，但事实错误；也可能引用了正确文档，却得出错误结论。Relevance 只能说明方向对，不说明内容真。

第二个陷阱是把 faithfulness 当成 truth。Faithfulness 只说明答案受 context 支持。如果 context 本身过时、错误或有偏见，faithful answer 仍然可能错。高风险系统需要 groundedness 或 external verification。

第三个陷阱是把 LLM judge 分数当绝对值。Judge 分数更适合比较同一任务、同一 rubric、同一 judge model 下的版本变化。跨任务、跨模型、跨时间直接比较 8.2 vs 8.5，很容易过度解释。

第四个陷阱是只看平均分。平均分会隐藏 tail risk。生产系统应该同时看 p50、p90、fail rate、critical failure count、high-severity samples。安全和事实错误常常不是平均质量问题，而是少数严重案例问题。

第五个陷阱是没有 negative set。只用正常用户问题测试，系统会显得很好。每个 eval suite 都需要 hard negatives、adversarial prompts、ambiguous queries、out-of-scope requests、conflicting context 和 stale information。

## Building an eval suite from scratch

从零建立 eval suite，可以先做 100 条 gold set。不要追求覆盖所有情况，先覆盖最常见的任务、最高风险的任务和过去真实失败案例。每条样例至少包含 input、expected behavior、context、rubric、severity、tags 和 owner。

第二步，选择每类失败一个指标。开放式回答用 LLM judge relevance；RAG 用 faithfulness 和 context relevance；安全用 Llama Guard 或等价 classifier；格式用 deterministic schema validation；高风险事实用 human review 或 external verification。

第三步，设置 release gates。不是所有指标都要阻塞发布。比如 style score 可以警告，JSON schema failure 应阻塞，critical safety failure 必须阻塞，minor helpfulness regression 可以进入人工 review。把指标分成 blocking、warning、monitoring 三层，团队才会真正使用。

第四步，建立 drift monitoring。模型、prompt、retriever、知识库、用户问题都会变。每次上线前跑固定 regression set；上线后抽样 production logs；每月复核 failed cases；每季度用 human calibration 检查 LLM judge 是否仍然可靠。

## Mapping metrics to remediation

指标只有连接到修复动作才有价值。Context recall 低，说明 retriever 没拿到必要信息，应该检查 chunking、embedding、metadata、query rewriting 或 index freshness。Context precision 低，说明取回太多噪声，应该改 reranker、filter 或 top-k。Faithfulness 低，说明 generator 没遵守 context，应该改 prompt、citation requirement 或 answer constraints。

Answer relevance 低，通常是 intent understanding 或 prompt routing 问题。Safety failure 高，应该补 red-team cases、guardrail、classifier 或 human escalation。Format failure 高，通常可以用 schema validation、JSON mode、function calling 或 repair loop。Calibration 差，则需要更好 abstention policy 和 confidence display。

GEO 场景的 remediation 也类似。Citation accuracy 低，要检查答案 claim 与 URL 是否匹配；brand accuracy 低，要修 entity clarity、About、schema 和 canonical facts；source diversity 低，要扩展 earned media 和第三方来源；AI visibility 低但 traditional ranking 高，说明传统 SEO 信号没有转化成 AI citation，需要补 evidence density、answer architecture 和 external validation。

## Minimum reporting format

一个可维护的 eval report 不需要很复杂，但要能回答四个问题：本周质量有没有变差，哪里变差，为什么变差，下一步谁处理。建议报告包含：overall pass rate、blocking failures、top failure families、代表性失败样例、与上周对比、release decision、owner actions。

每个失败样例要保留原始输入、模型输出、context、judge rationale、人工备注和修复状态。只保留分数没有用，因为团队不知道如何复现和修。高质量 eval 不是分数 dashboard，而是可行动的质量反馈系统。

这篇 taxonomy 的最终目的不是让团队记住更多指标名，而是避免盲测。先定义 failure mode，再选 metric，再设 gate，再连接 remediation。这样 eval 才能保护生产系统，而不是成为一组漂亮但无用的曲线。

## Metric family map

可以把指标选择压缩成一张决策表：

| Failure mode | 首选指标家族 | 常见实现 |
| --- | --- | --- |
| 答案不相关 | Model-based / task-specific | Relevance judge、intent match |
| 答案编造 | RAG-specific / groundedness | Faithfulness、claim support、source check |
| 检索拿错材料 | RAG-specific | Context precision、context recall、expected-doc hit rate |
| 输出不安全 | Safety and alignment | Llama Guard、Perspective API、red-team pass rate |
| 格式不稳定 | Task-specific / deterministic | JSON schema、field completeness、type checks |
| 模型过度自信 | Calibration | ECE、abstention accuracy、selective prediction |
| 品牌或实体错误 | Task-specific | Entity accuracy、brand claim check、citation attribution |

这张表的用途是防止团队“看见一个指标就加一个指标”。每个指标都应该有对应 failure mode，否则它只是噪音。

## Faithfulness vs groundedness vs attribution

这三个词经常被混用，但在生产系统里必须分开。

Faithfulness 问的是：答案中的 claim 是否被提供的 context 支持。若 context 说产品价格是 99 美元，答案也说 99 美元，它就是 faithful，即使 context 其实已经过期。

Groundedness 问的是：答案中的事实是否能被外部可信来源验证。它要求不仅看当前 context，还要看来源本身是否正确、最新、权威。

Attribution 问的是：答案是否把 claim 正确归到来源。一个答案可能 faithful，但引用错 URL；也可能引用了正确 URL，却把另一个页面的 claim 放在这个 URL 后面。

GEO 和 AI search 特别需要 attribution metric。因为被 AI 引用并不自动等于好事，错误引用可能让品牌承受误述风险。评估 AI visibility 时，应同时看 presence、claim support 和 citation accuracy。

## Safety metric design

安全评估不能只靠“这个回答看起来没问题”。至少要覆盖四类样例：正常请求、边界请求、明显违规请求、伪装成正常任务的 adversarial 请求。

安全指标可以分成：

- Refusal accuracy：该拒绝时是否拒绝。
- Over-refusal rate：不该拒绝时是否过度拒绝。
- Policy category accuracy：是否识别正确风险类别。
- Jailbreak resistance：面对绕过提示时是否仍遵守 policy。
- Human escalation rate：高风险边界是否转人工。

对营销和 GEO 场景，安全不只是暴力、仇恨或自伤，也包括价格承诺、合规声明、医疗金融法律建议、竞品比较、未经批准的 superlatives 和品牌声称。通用 safety classifier 可能覆盖不了这些业务红线，所以要加入自定义规则和人工抽样。

## Calibration and abstention metrics

很多 LLM 系统的问题不是永远错，而是错的时候太自信。Calibration metrics 关注模型置信度与实际正确率是否匹配。

如果系统输出 confidence score，可以用 Expected Calibration Error。若模型说 80% 置信的样例只有 55% 正确，就说明置信度不可用。若没有直接置信度，也可以用 abstention accuracy：资料不足时是否愿意说不知道；高风险时是否转人工；低风险且资料充分时是否正常回答。

Selective prediction 也是重要思路：系统不必回答所有问题，它可以只回答自己把握高的问题，把低置信问题交给人类。对客户可见 AI 来说，一个诚实的 “I don't know” 往往比自信错误更好。

## Reporting and governance

指标进入组织后，需要 owner、阈值和动作。否则 dashboard 会变成装饰。

建议把 report 分成三层：

1. Executive view：总体 pass rate、高 severity failure、趋势、发布决策。
2. Product view：按 workflow、用户意图、模型版本、prompt 版本、retriever 版本拆分。
3. Engineering view：具体失败样例、context、输出、score、judge rationale、修复状态。

每个核心指标都要标注是 blocking、warning 还是 monitoring。格式错误、critical safety failure、客户可见价格幻觉通常应 blocking；tone 小幅下降可以 warning；长期满意度和探索性 metric 可以 monitoring。指标没有治理层级，团队就会在每次发布前重新争论。

## Metric maintenance checklist

指标也会漂移。每次模型更新、产品策略变化、品牌规则变化或用户问题分布变化，都要检查 eval suite。

- 是否有新的失败类型没有样例覆盖？
- 旧样例是否仍然代表当前产品？
- Judge prompt 是否偏向某种风格或长度？
- RAG context 是否引用了旧文档？
- 阈值是否因为业务风险变化而需要调整？
- 人类校准结果是否仍支持当前 LLM judge？

这就是为什么 taxonomy 不是一次性阅读材料，而是 eval 系统的维护地图。

## FAQ

**Can one metric summarize LLM quality?**

不应该。LLM quality 是多维问题：相关性、安全性、事实性、格式、用户价值和任务成功都不同。一个总分可以用于 dashboard，但底层必须保留分项指标。

**Should I use BLEU or ROUGE for chatbot evaluation?**

通常不建议。开放式对话有很多正确表达，BLEU/ROUGE 会惩罚合理 paraphrase。它们更适合翻译、受限摘要或模板输出。

**Is LLM-as-judge good enough for production?**

可以作为 production eval 的一部分，但需要 bias control、human calibration 和 regression set。高风险场景不能只靠单一 judge。

**What is the first metric to add for a RAG product?**

先加 faithfulness 和 context relevance。前者告诉你生成是否基于 context，后者告诉你 retriever 有没有取到正确材料。

## Sources and related reading

- [BLEU, Papineni et al. 2002](https://aclanthology.org/P02-1040.pdf)
- [ROUGE, Lin 2004](https://aclanthology.org/W04-1013.pdf)
- [BIG-bench](https://arxiv.org/abs/2206.04615)
- [MT-Bench](https://arxiv.org/abs/2306.05685)
- [G-Eval](https://arxiv.org/abs/2303.16634)
- [RAGAS](https://docs.ragas.io/)
- [HELM benchmark](https://crfm.stanford.edu/helm/latest/)
- [What Are LLM Evals](/blogs/generative-engine-optimization/what-are-llm-evals)
- [RAGAS for RAG Evaluation](/blogs/generative-engine-optimization/ragas-rag-evaluation)
- [Red-Teaming LLMs](/blogs/generative-engine-optimization/red-teaming-llm-safety-evaluation)

## About the author

[Rohit Singh](https://www.linkedin.com/in/rohitsingh017) is the creator of [GeoZ AI](https://www.geoz.ai/) and The GEO Community. Follow the [learning path](/start) or connect on [LinkedIn](https://www.linkedin.com/in/rohitsingh017).

## Continue your learning journey

如果你已经理解指标分类，可以继续读 [Human vs LLM-as-Judge](/blogs/generative-engine-optimization/human-vs-llm-judge-evaluation) 选择评分方式，再读 [LLM Evals Tool Landscape](/blogs/generative-engine-optimization/llm-evals-landscape-comparison) 选择工具，最后用 [RAGAS for RAG Evaluation](/blogs/generative-engine-optimization/ragas-rag-evaluation) 细化 RAG 指标。

## Read next

- [Why LLM Evals Matter](/blogs/generative-engine-optimization/why-llm-evals-matter)
- [Red-Teaming LLMs](/blogs/generative-engine-optimization/red-teaming-llm-safety-evaluation)
- [OpenAI Evals Guide](/blogs/generative-engine-optimization/openai-evals-guide)
