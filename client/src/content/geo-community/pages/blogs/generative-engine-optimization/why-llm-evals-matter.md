---
path: "/blogs/generative-engine-optimization/why-llm-evals-matter"
kind: "blog"
title: "Why LLM Evals Matter: The Hidden Cost of Shipping AI Without Measuring Quality"
source_title: "Why LLM Evals Matter: The Hidden Cost of Shipping AI Without Measuring Quality"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/why-llm-evals-matter"
author: "Rohit Singh"
date: "11 Apr 2026"
status: "ready"
---
# Why LLM Evals Matter: The Hidden Cost of Shipping AI Without Measuring Quality

LLM 应用一定会产生坏输出，关键问题是：团队是在用户看到之前发现，还是等投诉、退款、舆情和支持队列暴露之后才发现。LLM evals 不是工程洁癖，而是任何上线 AI 产品的团队都需要正视的风险管理机制。

原站开篇的判断很直接：不要问 LLM 应用会不会输出坏答案，它一定会。真正的管理问题是，这些坏答案会在 pull request、模型升级、prompt 修改或索引重建时被团队自己发现，还是在客户邮件、客服工单、退款请求和社交媒体里被用户发现。evals 的价值不是让 AI 永远不犯错，而是把错误发现时间提前。

这篇文章把 evals 定位成风险管理，而不是单纯 engineering best practice。因为 LLM 事故的后果往往跨部门：工程要排查，客服要解释，法务可能要介入，品牌信任会受损，产品路线也会因为恐惧回归而放慢。没有 eval 的团队不是省掉了成本，而是把成本推迟到最混乱、最贵的时候支付。

![Why LLM evals matter — business cost of skipping AI quality measurement and hallucination incidents](https://thegeocommunity.com/images/why-llm-evals-matter.webp)

## 页面摘要

这篇文章解释为什么 LLM evals 应该在生产前建立，而不是在第一次事故后补救。原站的核心观点是：生产中的大部分 LLM 质量事故来自三类可预测问题：模型漂移、prompt regression 和检索上下文错配。它们都可以用基础 eval pipeline 提前发现。

## 原站章节结构

1. The eval gap: what most teams skip
2. The three failure modes that evals prevent
3. The real cost of a quality incident
4. Silent model drift: the failure nobody sees coming
5. Why "we'll review it manually" doesn't scale
6. The eval ROI calculation
7. What evals actually look like in practice
8. The speed argument: evals make shipping faster
9. Key Takeaways
10. FAQ

## Key Takeaways

- 没有 eval 的 AI 产品，通常只靠开发期手测、staging demo 和上线后的用户反馈；这三者都不能替代可重复的评估流水线。
- 原站将生产质量事故归纳为三类：模型版本漂移、prompt regression、retrieval context mismatch。
- 基础 eval suite 不需要一开始就很复杂：20-50 个测试样例、一个评分函数、一个 CI job、一个阻断阈值，就能覆盖最危险的变化。
- 人工审核不能作为主质量门禁，因为它在 volume、coverage 和 repeatability 上都会失效。
- evals 不是拖慢发布，而是让团队敢于更快升级模型、改 prompt、重建索引和迭代 RAG。

## The eval gap: what most teams skip

问一个团队：“你们怎么知道这个 LLM 应用真的在正确工作？”常见回答是：开发时手测过、staging 环境跑过、上线后看用户反馈。问题是，这些都不是 eval pipeline。

手测不可重复，staging 不代表真实查询分布，用户反馈又是滞后信号。等用户报告“AI 回答错了”，很可能已经有成百上千个请求经历了同样问题。eval gap 就存在于“我们觉得它能用”和“我们有证据证明它稳定”之间。

原站把这个问题和 DORA 的 DevOps 研究联系起来：高效软件团队不是靠更慢发布或更多人工审批获得可靠性，而是靠自动化和快速反馈。LLM 系统也一样。真正跑得快的团队不是跳过 eval，而是把 eval 做进发布流程。

eval gap 的危险在于它看起来不像缺陷。团队做过 demo，PM 试过几个问题，staging 环境也没有报错，于是大家会产生“它大概可以上线”的感觉。但 LLM 失败往往藏在分布尾部：罕见问法、模糊输入、越权请求、过期事实、检索不到证据、输出格式边缘情况。手测很难覆盖这些场景，尤其当应用从几十个内部用户扩展到几千个真实用户时，失败分布会突然变宽。

用户反馈也不是质量系统。用户不一定发现错误；发现了也不一定报告；报告时也可能缺少可复现上下文。等支持团队看到趋势，错误可能已经发生很多次。eval pipeline 的意义是把“用户是质量传感器”改成“固定测试集和评分函数是第一道传感器”，让问题在发布前或灰度阶段暴露。

## The three failure modes that evals prevent

### 1. Silent model drift after updates

模型供应商会持续更新模型。一个模型“整体更好”并不代表对你的具体场景更好。更简洁的模型可能省略用户需要的细节；更严格的安全策略可能拒绝本来应该处理的请求；更强的推理可能改变原来 prompt 的输出格式。

使用自动更新 alias 时风险更明显。应用仍然返回 200，API 没有报错，日志里也没有 stack trace，但输出风格、拒答率、事实完整性或格式稳定性已经发生变化。没有 eval 时，团队往往要到用户行为指标下降、支持量上升，才意识到模型漂移已经持续了几周。

成熟做法是：生产环境固定模型版本，升级前对候选版本运行同一套 eval，把模型升级当作 release，而不是把它当作后台自动变化。

silent model drift 常常来自 provider alias。团队以为自己一直在用同一个 “gpt-4” 或类似模型名，但底层 snapshot 已经变化。供应商的更新说明通常只会写整体提升、减少幻觉、提高安全性，但这些宏观改善可能对某个垂直 workflow 造成退化。比如模型变得更简洁，就可能少给必要免责声明；模型更谨慎，就可能拒绝本来合法的客户问题；模型格式偏好变化，就可能破坏下游 parser。

eval suite 在这里相当于模型升级的 smoke test 和 regression test。相同输入、相同 expected properties、相同评分逻辑，在旧模型和新模型上对比。如果关键任务分数下降，就不能把升级当作透明基础设施更新，而要像代码 release 一样分析失败样例、调整 prompt 或推迟升级。

### 2. Prompt regression

System prompt 本质上是代码。任何改写、删例子、加约束、调语气，都可能改变模型行为。手动测试 20 个看起来正常的 query，并不代表另外 200 个边缘 query 也正常。

Prompt regression 是最常见也最容易低估的质量问题。它的防线很朴素：每次 prompt 或 model config 变更都跑 eval，就像代码变更跑 unit tests。对 RAG 或内容生成场景，可以从 [DeepEval pytest-style RAG tests](/blogs/generative-engine-optimization/deepeval-pytest-style-rag-tests) 和 [Promptfoo regression testing](/blogs/generative-engine-optimization/promptfoo-rag-regression-testing) 这样的工作流开始。

prompt regression 的麻烦在于改动看起来常常“只是文案”。把系统 prompt 里的语气从 helpful 改成 concise，可能会减少必要解释；删除一个 few-shot example，可能会让模型忘记输出字段；加入新的 safety instruction，可能会和业务任务冲突；把“不确定时说不知道”写得不够明确，可能会让模型继续猜。Prompt 不像传统代码那样有显式类型系统，但它同样能改变程序行为。

这就是为什么原站说 system prompts are code。既然是代码，就应该有版本、review、测试和 rollback。eval 可以把 prompt 讨论从“我感觉这个更清楚”变成“这个版本在 50 个高风险 case 上通过率从 92% 降到 84%，失败集中在 pricing 和 citation format”。

### 3. Retrieval context mismatch

RAG 应用的答案质量取决于检索上下文。embedding 模型更新、chunk size 调整、文档批量更新、索引重建、metadata filter 改动，都会改变模型拿到的 evidence。用户看到的是“AI 回答错了”，但根因可能是 retriever 没拿到正确资料。

这类问题危险在于它混合了两层不确定性：检索质量和生成质量。没有 eval，你很难判断是召回错了、排序错了、上下文不足，还是 LLM 没有忠实使用上下文。RAGAS 里的 faithfulness、context relevance、answer relevance 等指标，就是为了拆开这些故障模式。

retrieval context mismatch 是 RAG 系统里最隐蔽的失败之一。用户问同一个问题，模型还是同一个模型，prompt 也没变，但因为 embedding model 换了、chunk size 从 800 改到 300、metadata filter 多了一个条件、知识库新导入一批文档，最终检索到的上下文完全不同。模型只能基于拿到的证据回答，于是错误看起来像“模型突然变笨”，其实是 retriever 给错了材料。

成熟 eval 不应只评分最终答案，还要记录检索上下文。对每个测试问题，应该能看到 expected source 是否被召回、rank 是否足够靠前、答案是否忠实使用 retrieved evidence。这样当分数下降时，团队能区分是 retrieval failure、generation failure，还是 citation/provenance failure。否则排查会变成盲目试 prompt。

## The real cost of a quality incident

跳过 eval 并不是省钱，而是把成本延后，而且通常带利息。

一次 LLM 质量事故的直接成本包括工程排查、根因定位、回滚或修复、补测试、客服响应、客户信任受损、退款或合规审查。尤其是客户可见的 hallucination，伤害不同于普通软件 bug：它通常语气自信、表达流畅，用户更难立即发现，却更难重新信任。

事故后的排查也更麻烦。没有 eval 基础设施时，团队要重建当时的 prompt 版本、模型 alias、retrieval index、文档版本和用户输入。仅复现就可能花掉一整天。修复后，如果没有 eval，也无法证明新修复没有引入新的 regression。

相对地，基础 eval suite 的第一版通常只需要一个工程师集中投入一周左右，之后每月维护几个小时。哪怕不采用 hosted platform，只用 open-source 工具和简单脚本，也能先覆盖最重要的风险。

原站强调的成本不是抽象风险，而是事故响应的真实流程。没有 eval 时，第一步就是复现：当时用的 prompt 是哪个版本？模型 alias 指向哪个 snapshot？知识库索引什么时候重建？用户输入里有没有上下文？检索到了哪些文档？这些信息如果没有被记录，工程团队要先做取证，而不是修复。

第二步是 root cause。没有固定测试集，团队只能凭直觉改 prompt、换模型、重建索引，然后拿几个样例试。第三步是验证修复。没有 eval，就不知道修复一个案例是否打坏了另一个案例。事故因此容易循环：今天修 pricing，明天坏 refund policy；今天加强安全，明天合法问题被拒答。

用户信任成本也更高。一个普通 UI bug 用户会认为软件出错；一个流畅、自信、错误的 AI 回答会让用户怀疑产品是否可靠、数据是否可信、品牌是否专业。Edelman 等信任研究反复显示用户对 AI 信息准确性有担忧，面向客户的 AI 功能一旦出现幻觉，信任恢复比普通 bug 更难。

## Silent model drift: the failure nobody sees coming

模型漂移之所以可怕，是因为它不像代码 bug 那样明显。代码错了可能有异常；prompt 坏了可能有用户投诉；模型更新导致的质量变化却会保持系统“正常运行”。请求成功，延迟正常，日志干净，但回答慢慢变差。

OpenAI Evals 一类框架的价值就在这里：模型更新之前，供应商会跑自己的评估，但供应商的“整体质量更好”不等于你的应用场景不退化。一个医疗、金融、法务、客户支持或营销生成场景，都有自己的输出标准。

建议把模型版本管理纳入发布流程：生产固定具体版本；候选版本先跑 eval；过线后再灰度；上线后继续监控关键质量指标。

模型漂移还可能是渐进的。不是一次升级立刻让所有测试失败，而是输出长度变短、引用变少、拒答措辞变硬、品牌语气变平、回答覆盖率轻微下降。单个用户看不出趋势，团队如果没有基线也看不出变化。eval 的价值是提供可比较时间序列：同一批 case 在每个模型版本、prompt 版本、索引版本上的表现如何。

因此，eval 结果也应该存档。不要只在 CI 里看一次 pass/fail，而要保存每次运行的模型、prompt、检索配置、数据集版本、分项指标和失败样例。这样当上线后一周发现转化下降或客服量上升，可以回看是否某次模型或 prompt 变更已经出现早期信号。

## Why "we'll review it manually" doesn't scale

人工审核是团队最常见的替代方案，但它有三个硬伤。

第一是规模。一个 B2B AI 应用每天可能有数千次请求。哪怕只审 1%，也需要固定人力；流量一增长，成本线性增长，而且会把高级工程师和产品专家拖进重复阅读输出的工作里。

第二是覆盖。人类擅长抓自己预期中的问题，却容易错过长尾查询、低频边缘场景和新的对抗输入。审核者看久了还会产生模式疲劳，反而对熟悉的故障变得迟钝。

第三是可重复性。主观质量判断存在 annotator disagreement。两个训练有素的人可能对“这个回答是否足够好”给出不同结论。作为 regression gate，这种不稳定会让团队分不清是模型真的变好，还是审核者标准变了。

evals 的优势恰好对应这三点：单位成本低、覆盖范围可设计、同一输入和评分逻辑可重复运行。

人工审核并非没价值，它适合做三件事：发现新失败模式、标注训练/评估数据、对高风险输出做最终审批。但它不适合承担主发布门禁。原因很简单：发布门禁需要快速、稳定、可重复。人工判断会受审核者经验、疲劳、上下文理解和当天标准影响，同一个输出在不同人手里可能得到不同结论。

LLM quality 里很多维度可以先自动化。格式、字段、来源存在性、禁止词、长度、是否引用 approved source、是否包含价格承诺、是否出现 competitor claim，这些都不需要人每次看。把这些交给 eval，人工审核就可以集中在真正需要 judgment 的样例上，例如语气是否合适、答案是否满足业务意图、边缘合规是否可接受。

## The eval ROI calculation

ROI 不需要精确到每一美元，关键是比较成本结构。

建设基础 eval suite 的成本包括：第一版测试集、评分函数、CI 集成、阈值设定和少量维护。工具可以从 DeepEval、RAGAS、Promptfoo、OpenAI Evals 等开源或低成本方案开始。

没有 eval 时处理事故的成本包括：复现失败场景、定位 root cause、试错修复、验证修复、用户沟通和信任修复。一个事故如果需要两名工程师处理三天，单是工程时间就可能超过一年维护基础 eval suite 的成本。

更重要的是复利。每一次事故、每一个边缘案例、每一次人工发现的问题，都可以被编码成新的 eval case。时间越久，eval 数据集越像团队的制度记忆，避免同类错误反复出现。

ROI 的另一面是 opportunity cost。没有 eval 的团队会因为害怕回归而减少实验：不敢升级更便宜模型，不敢换更强 embedding，不敢改 prompt，不敢优化 chunking，不敢自动化更多工作流。表面上省下了一周 eval 建设时间，实际失去了持续迭代能力。

有 eval 的团队可以更积极地做模型路由、prompt A/B、retriever 参数搜索、成本优化和供应商比较，因为每次变更都有同一把尺子。eval suite 不只是防事故，也是在给产品团队提供试验台。它让“这个模型便宜 40%，质量是否还能过线”这种问题可以被快速回答。

## What evals actually look like in practice

最小可行 eval suite 不复杂：

- 20-50 个代表性测试样例，包括输入、期望属性和风险场景。
- 一个评分函数，至少检查每个样例的一项关键属性。
- 一个 CI job，在 prompt、模型配置、retriever、索引或关键依赖变化时自动运行。
- 一个阻断阈值，分数低于阈值就不能发布。

第一版不必引入 LLM judge。先从 deterministic checks 开始：必须包含某字段、不能包含禁用词、必须输出 JSON、答案长度在范围内、引用来源必须存在、pricing claim 必须来自 rate card。只有当质量维度需要语义判断时，再加入模型评分、人类标注或 pairwise comparison。

进一步学习可以接着看 [What Are LLM Evals](/blogs/generative-engine-optimization/what-are-llm-evals)、[The LLM Eval Metrics Taxonomy](/blogs/generative-engine-optimization/llm-eval-metrics-taxonomy) 和 [LLM Evals Tool Landscape](/blogs/generative-engine-optimization/llm-evals-landscape-comparison)。

一个最低成本实现可以非常朴素：`eval_cases.json` 里保存 input、expected facts、forbidden claims、required format；`run_eval.py` 调用模型并检查输出；GitHub Actions 或其他 CI 在相关文件变更时运行脚本。失败时输出具体 case、实际回答、缺失字段和违规项。这个版本不完美，但已经比“上线后等用户反馈”强很多。

当系统成熟后，可以把 eval 分层：unit eval 检查单个 prompt 行为；retrieval eval 检查 expected documents 是否召回；generation eval 检查 faithfulness 和 answer relevance；safety eval 检查拒答和合规；regression eval 对比新旧版本差异；monitoring eval 抽样线上真实流量。不要一开始就追求全套平台，先让 eval 进入发布路径。

## The speed argument: evals make shipping faster

反对 eval 的常见理由是“会拖慢发布”。实践里通常相反。没有 eval 的团队会慢慢害怕改动：模型升级可能退化，prompt 改动可能破坏格式，retriever 重建可能丢掉正确上下文。于是所有变更都靠更长会议和更多人工审查来换安全感。

有 eval 的团队可以更快，因为他们可以在几个小时内验证变更。模型升级不再是“大家手动测一周”，而是跑完标准套件、看失败样例、修复再跑。Prompt 实验也不必直接拿生产 A/B 赌风险。

DORA 的研究在软件工程里已经说明：高部署频率和低失败率不是对立的，自动化反馈才是连接两者的机制。eval-as-CI-gate 把同样原则搬到 LLM 应用上。

这也是为什么 evals 会让团队心理状态改变。没有 eval 时，每次改动都像黑箱：也许更好，也许更坏，只能靠会议和少量样例猜。有 eval 后，失败会更早、更具体地出现：哪个 case 坏了，哪个指标降了，哪个来源没召回，哪个字段不稳定。具体失败让团队敢于修，模糊风险只会让团队冻结。

速度不等于跳过质量，速度来自缩短反馈回路。模型升级从一周人工 review 变成 overnight eval run，prompt 实验从生产 A/B 风险变成离线测试，索引重建从“希望没坏”变成 retrieval benchmark 对比。AI 产品迭代的瓶颈往往不是能不能生成，而是能不能知道生成质量是否变了；eval 正是这个瓶颈的解法。

## Incident economics in plain terms

LLM 质量事故的成本通常不在单次 API 调用，而在事后追溯。没有 eval 的团队遇到问题时，要先找出当时使用的 prompt、模型 alias、retrieval index、文档版本、用户输入和输出日志。很多团队甚至没有保存这些字段，因此第一天就花在“复现不了”上。

然后才进入真正修复：判断是模型漂移、prompt regression、retriever 召回错、知识库过期、validator 缺失，还是人工审核流程没拦住。若没有固定测试集，修复也只能靠少量手动样例确认，无法证明同类问题不会重现。

eval 的成本更可控。第一版可能只需要一周工程时间：收集样例、写 JSON/CSV、接一个模型调用、写几个 deterministic checks、在 CI 里跑。之后每月维护成本主要是添加新失败样例、更新阈值和复查高风险指标。和一次客户可见质量事故相比，这种投入更像保险，也像研发速度基础设施。

## Eval case anatomy

一条有用的 eval case 不只是“输入和期望答案”。它应尽可能保留能诊断失败的字段。

```json
{
  "id": "pricing-enterprise-001",
  "input": "Does the enterprise plan include SSO and what does it cost?",
  "context": ["pricing_rate_card_2026_04", "enterprise_plan_spec"],
  "expected_behavior": "Answer SSO availability from product spec and defer pricing if rate card lacks public price.",
  "forbidden_claims": ["invented discount", "guaranteed SLA not in context"],
  "required_citations": ["enterprise_plan_spec"],
  "severity": "high",
  "tags": ["pricing", "enterprise", "customer-facing"],
  "owner": "growth-ops"
}
```

这种结构让失败可修。若答案没有引用价格卡，是 citation failure；若编造折扣，是 hallucination 和 policy failure；若格式不对，是 schema failure；若答非所问，是 relevance failure。不同失败需要不同 owner。

## Eval lifecycle

生产 eval 不是一次性项目，而是循环。

1. Seed set：从真实用户问题、客服升级、销售问题、过去事故和高风险政策中收集初始样例。
2. Offline regression：每次改 prompt、模型、retriever、chunking、知识库或 tool call 前运行。
3. Release gate：关键指标低于阈值时阻断发布，高风险失败必须修复。
4. Production sampling：上线后抽样真实流量，用 LLM judge 和 deterministic checks 监控趋势。
5. Human calibration：定期人工复核分歧和高 severity 样例。
6. Case backfill：把生产事故和人工发现的新失败写回 eval suite。

只有最后一步做好，eval suite 才会越来越贴近真实业务。否则它会变成一组漂亮但逐渐过时的测试题。

## Separating retriever and generator failures

RAG 产品最容易误判的问题是把所有坏答案都归给模型。实际上，很多坏答案是 retriever 没拿到正确 context。

如果 expected document 没有出现在 top-k，先修 retrieval：chunk size、metadata、embedding model、query rewriting、reranker、filter 或 index freshness。

如果 expected document 出现了，但答案没有使用，修 generation：system prompt、citation requirement、answer constraints、abstention rule、structured output。

如果答案引用了文档但 claim 不受支持，修 attribution：claim decomposition、sentence-level citation、faithfulness judge、source-grounding validator。

如果 context 本身过期，修 content ops：文档 owner、更新时间、版本控制、知识库发布流程。eval 能把这些问题拆开，而不是让团队在“模型不够好”这个模糊结论里打转。

## Leadership adoption roadmap

给领导层解释 eval，不要从 metric 名词开始，而要从风险开始。第一阶段的问题是：哪些 AI 输出会伤害用户、品牌、收入或合规？第二阶段才是：用什么指标捕捉这些失败？第三阶段是：这些指标如何阻止发布或触发人工审核？

30 天路线可以这样安排：

- 第 1 周：列出 20-50 个高风险样例，定义 forbidden claims 和 required behavior。
- 第 2 周：加入 deterministic checks，例如 JSON、URL、引用、禁用词、长度、价格 claim。
- 第 3 周：加入 LLM judge，评估 relevance、faithfulness、tone 和 instruction following。
- 第 4 周：接入 CI gate，定义 release threshold，并建立人工复核队列。

60-90 天后，再引入平台化工具、trace dashboard、人类标注工作流和生产抽样。不要等架构完美再开始，最小 eval suite 今天就能减少明天的风险。

## Key Takeaways

- 生产 LLM 事故最常见的三类来源是 silent model drift、prompt regression 和 retrieval context mismatch。
- eval 的成本结构比事故响应更可控，而且可以不断积累失败模式。
- 人工审核适合采样、标注和定性研究，不适合作为唯一发布门禁。
- 最小 eval suite 可以从几十个样例和简单规则开始，不需要一开始就上复杂平台。
- 最晚应该在第一次生产部署前建立 eval，而不是第一次质量事故后再补。

## About the author

Rohit Singh 是 The GEO Community 的作者和 GeoZ AI 创始人，关注 Generative Engine Optimization、LLM evaluation、AI visibility 和搜索基础设施。

## FAQ

### What's the minimum viable eval setup for a small team?

从 20-50 个高风险样例开始。每个样例记录输入、期望行为、禁止行为和一个可自动评分的检查。把它放进 CI，只在 prompt、模型、retriever 或知识库变更时运行。

### How do evals relate to monitoring?

eval 是发布前的质量门禁，monitoring 是发布后的观察系统。两者互补：monitoring 发现新问题后，应把典型失败样例回写进 eval suite。

### Do we need evals if we're using a foundation model without fine-tuning?

需要。即使没有 fine-tuning，你仍然会改 prompt、换模型版本、更新知识库、调整 chunking 和 retrieval 参数，这些都可能改变输出质量。

### What's the right threshold to block a deployment?

阈值取决于风险。客户可见、合规敏感或涉及价格承诺的工作流应更严格；内部草稿工具可以允许更低阈值。关键是把阈值写进发布流程，而不是每次临时讨论。

### Can we build evals without dedicated tooling?

可以。早期用 JSON/CSV 测试集、脚本、pytest 和简单 CI 就足够。专门平台的价值在于版本管理、可视化、协作标注和长周期追踪，而不是 eval 的起点。

## Related reading

- [DORA 2023 State of DevOps Report](https://dora.dev/research/2023/dora-report/)
- [OpenAI model versioning documentation](https://platform.openai.com/docs/models)
- [OpenAI Evals framework](https://github.com/openai/evals)
- [MT-Bench paper](https://arxiv.org/abs/2306.05685)
- [DeepEval pytest-style RAG tests](/blogs/generative-engine-optimization/deepeval-pytest-style-rag-tests)
- [Promptfoo regression testing](/blogs/generative-engine-optimization/promptfoo-rag-regression-testing)
- [RAGAS for RAG Evaluation](/blogs/generative-engine-optimization/ragas-rag-evaluation)
- [What Are LLM Evals](/blogs/generative-engine-optimization/what-are-llm-evals)
- [The LLM Eval Metrics Taxonomy](/blogs/generative-engine-optimization/llm-eval-metrics-taxonomy)
- [LangSmith for LLM Tracing and Evaluation](/blogs/generative-engine-optimization/langsmith-tracing-evaluation)
- [Explore the Learning Path](/start)
- [Rohit Singh](https://www.linkedin.com/in/rohitsingh017)

## Continue your learning journey

下一步可以读 [What Are LLM Evals](/blogs/generative-engine-optimization/what-are-llm-evals) 建立概念，再读 [The LLM Eval Metrics Taxonomy](/blogs/generative-engine-optimization/llm-eval-metrics-taxonomy) 选择指标，最后用 [LLM Evals Tool Landscape](/blogs/generative-engine-optimization/llm-evals-landscape-comparison) 选工具栈。

## Read next

- [Human vs LLM-as-Judge](/blogs/generative-engine-optimization/human-vs-llm-judge-evaluation)
- [Red-Teaming LLMs](/blogs/generative-engine-optimization/red-teaming-llm-safety-evaluation)
- [Weights & Biases Weave](/blogs/generative-engine-optimization/weights-biases-weave-llm-evaluation)
