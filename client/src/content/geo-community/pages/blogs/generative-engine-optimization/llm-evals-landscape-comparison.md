---
path: "/blogs/generative-engine-optimization/llm-evals-landscape-comparison"
kind: "blog"
title: "LLM Evals Tool Landscape: Braintrust vs LangSmith vs Arize vs Galileo vs W&B Weave vs OpenAI Evals"
source_title: "LLM Evals Tool Landscape: Braintrust vs LangSmith vs Arize vs Galileo vs W&B Weave vs OpenAI Evals"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/llm-evals-landscape-comparison"
author: "Rohit Singh"
date: "11 Apr 2026"
status: "ready"
---

> LLM eval 工具没有一个“全维度赢家”。Braintrust 强在实验速度和数据集版本管理，LangSmith 强在 LangChain/LangGraph tracing 到 dataset 的闭环，Arize Phoenix 强在开源自托管，Galileo 强在 hallucination detection，W&B Weave 适合已经使用 W&B 的 ML 团队，OpenAI Evals 则适合代码优先的模型回归测试。

真正的选择问题不是“哪个工具最好”，而是“我的团队现在最需要解决哪类 eval job”。多数成熟团队不会同时堆六个重叠平台，而是用一个 experiment/observability 主平台，再配一个开源 CI regression 工具。

**In this article:** [how to read](#how-to-read-this-comparison) · [four categories](#the-four-evaluation-tool-categories) · [Braintrust](#braintrust-experiment-platform) · [LangSmith](#langsmith-observability-with-evaluation) · [Arize Phoenix](#arize-phoenix-open-source-observability) · [Galileo](#galileo-quality-intelligence-platform) · [W&B Weave](#weights--biases-weave-ml-native-evaluation) · [OpenAI Evals](#openai-evals-open-framework-for-model-benchmarking) · [DeepEval/RAGAS/Promptfoo](#also-in-the-stack-deepeval-ragas-promptfoo) · [comparison](#side-by-side-feature-comparison) · [team fit](#choosing-by-team-type) · [takeaways](#key-takeaways) · [FAQ](#faq)

![LLM evals tool landscape comparison — Braintrust vs LangSmith vs Arize Phoenix vs Galileo vs W&B Weave](https://thegeocommunity.com/images/llm-evals-landscape-comparison.webp)

## How to read this comparison

LLM eval 工具市场在 2023 到 2025 年快速膨胀，表面功能重叠很多：dataset、experiments、traces、scorers、human review、monitoring、CI。营销页面经常把每个产品都说成完整解决方案，反而让团队更难选。

读这篇比较时，建议先问三个问题：

1. 你的主要痛点是离线实验、生产可观测性、幻觉检测，还是模型回归测试？
2. 你的技术栈是否已经绑定 LangChain、W&B、OpenTelemetry 或某个云环境？
3. 你的约束是速度、合规、自托管、人工标注、还是成本？

价格、功能和集成会按季度变化，所以本文更像决策框架。签合同前仍要去各供应商网站确认当前价格和限制。

## The four evaluation tool categories

| Category | 解决什么 job | 代表工具 |
| --- | --- | --- |
| Experiment platforms | 管理数据集、运行实验、比较版本、追踪 scorer 变化 | Braintrust, W&B Weave |
| Observability tools | 捕获 LLM traces、监控生产质量、从失败 case 生成 eval dataset | LangSmith, Arize Phoenix |
| Quality intelligence | 专门检测 hallucination、toxicity、factuality 和高风险质量问题 | Galileo |
| Open frameworks | CLI/code-first 的模型比较、回归测试、CI gates | OpenAI Evals, DeepEval, RAGAS, Promptfoo |

成熟模式通常是：一个主平台负责 dataset + experiment 或 production traces，再用一个开源框架进入 CI。不要同时上六个互相覆盖的工具，否则团队会花更多时间同步指标，而不是修质量问题。

## Braintrust: experiment platform

[Braintrust](https://www.braintrust.dev/) 以 experiment 为中心。你定义 datasets，配置 scorers，运行多个 prompt/model/config 版本，然后比较结果。

它擅长：

- Dataset management：测试样本是可版本化 artifact。
- Experiment velocity：新 scorer、多个模型配置、结果对比可以快速完成。
- Scorer flexibility：同一轮里混合 deterministic code scorer、LLM judge 和 human annotation。
- SDK coverage：Python、TypeScript、REST 都可用。
- Online logging：用离线 scorer 评估生产流量。

短板：

- cloud-only，不适合 air-gapped 或强自托管环境。
- tracing 深度不如专门 observability 工具。
- human annotation UI 可用，但不是独立标注平台级别。

适合：快速迭代 AI 产品、需要 prompt/model 实验管理、强调 dataset versioning 的产品团队。更多细节可看 [Braintrust: Production-Grade LLM Evaluation](/blogs/generative-engine-optimization/braintrust-llm-evaluation) 和 [pricing](https://www.braintrust.dev/pricing)。

## LangSmith: observability with evaluation

[LangSmith](https://smith.langchain.com/) 是 LangChain 生态的 observability + eval 平台。它最强的能力是从 production trace 到 eval dataset 的闭环。

它擅长：

- Trace-to-dataset：发现一个失败 trace 后，可以直接加入 eval set。
- LangChain/LangGraph native instrumentation：自动捕获 chain、retriever、tool、LLM calls。
- Pre-built evaluators：correctness、helpfulness、conciseness、toxicity、自定义 criteria。
- Annotation queue：把 traces 分配给人工 reviewer。
- Online evaluation：采样生产流量并自动评分。

短板：

- 非 LangChain 栈也能用，但自动 instrumentation 价值会降低。
- dataset versioning 和 experiment comparison 不如 Braintrust 强。
- 视觉化对比更偏 functional，不是最强项。

适合：LangChain/LangGraph 团队、需要从生产失败快速生成测试覆盖的团队、需要 annotation workflow 的团队。可继续看 [LangSmith for LLM Tracing and Evaluation](/blogs/generative-engine-optimization/langsmith-tracing-evaluation)。

## Arize Phoenix: open-source observability

[Arize Phoenix](https://phoenix.arize.com/) 是开源 LLM observability 工具，Apache 2.0，可本地或云端运行。它的最大价值是：默认不必把 trace data 发给第三方 SaaS。

它擅长：

- Self-hosted：适合医疗、金融、政府、强监管行业。
- OpenTelemetry-native：已有 OTel instrumentation 的系统可以接入。
- Span-level tracing：检索、LLM call、tool use 都能拆成 traceable spans。
- Eval templates：hallucination、relevance、toxicity、Q&A correctness 等可复用模板。
- Dataset curation：从失败 spans 中标记样本并导出 eval set。

短板：

- 自托管需要 DevOps。
- experiment management 不如 Braintrust。
- annotation assignment 和团队协作较轻量。

适合：必须自托管、已有 OpenTelemetry、重视开源灵活性的 infra/ML 团队。可读 [Arize Phoenix: Open-Source LLM Observability and Evaluation](/blogs/generative-engine-optimization/arize-phoenix-llm-observability)。

## Galileo: quality intelligence platform

[Galileo](https://www.rungalileo.io/) 更像质量智能平台，重点是 hallucination detection 和 factual quality。它不是最通用的实验平台，而是为高风险质量问题做深度检测。

它擅长：

- ChainPoll methodology：多次评估 + reasoning，提高与人类标注的一致性。
- Hallucination index：把 completeness、groundedness、correctness 拆成独立信号。
- Galileo Luna：专门面向 eval 的模型，适合大规模质量分类。
- RAG decomposition：区分 retrieval hallucination 和 generation hallucination。
- Production monitoring：监控离线 eval 与生产流量之间的 drift。

短板：

- 成本通常高于开源方案。
- 泛化实验管理不如 Braintrust。
- 更适合 quality/hallucination 深度场景，而不是所有 eval job。

适合：高风险输出、RAG accuracy 要求高、hallucination 是核心业务风险的团队。相关资料可看 [Galileo for Hallucination Detection](/blogs/generative-engine-optimization/galileo-hallucination-detection) 和相关 [paper](https://arxiv.org/abs/2308.08067)。

## Weights & Biases Weave: ML-native evaluation

[W&B Weave](https://weave-docs.wandb.ai/) 是 Weights & Biases 面向 LLM 的 evaluation/tracing 层。已经用 W&B 管模型训练、实验和指标的团队，最容易从 Weave 获益。

它擅长：

- `@weave.op()` 风格的低摩擦 tracing。
- training metrics 与 LLM eval scores 在同一工作台。
- dataset versioning 和 lineage。
- scorer library，可组合 hallucination、coherence、自定义 criteria。
- online evaluation，用同一套 scorer 跑生产样本。

短板：

- 对非 W&B 用户，上手成本比 Braintrust 或 LangSmith 高。
- 对复杂 multi-agent tracing 的深度通常不如 Phoenix。

适合：已经在 W&B 里管理模型训练和实验的 ML/AI 团队，以及同时做 custom model 和 LLM application 的团队。可继续读 [Weights & Biases Weave](/blogs/generative-engine-optimization/weights-biases-weave-llm-evaluation)。

## OpenAI Evals: open framework for model benchmarking

[OpenAI Evals](https://github.com/openai/evals) 是开源 Python framework，用于定义和运行模型评测。它更像 benchmark/regression 框架，不是 hosted observability 平台。

它擅长：

- 社区 registry 中有大量 eval examples。
- model-agnostic，可跑 OpenAI-compatible API。
- YAML-based specs，可版本化、可进 CI。
- 适合 model comparison 和 release regression。

短板：

- 没有 hosted UI。
- 不适合 continuous production monitoring。
- 没有 annotation queue、team workflow 和完整 dataset management。

适合：代码优先、想避免 SaaS 依赖、要做模型对比和回归测试的团队。可看 [OpenAI Evals Guide](/blogs/generative-engine-optimization/openai-evals-guide)。

## Also in the stack: DeepEval, RAGAS, Promptfoo

这三类工具常常作为补充，而不是替代主平台。

- [DeepEval](https://docs.confident-ai.com/)：pytest-style eval framework，适合把 evals 放进 CI gate。相关页：[DeepEval pytest-style RAG tests](/blogs/generative-engine-optimization/deepeval-pytest-style-rag-tests)。
- [RAGAS](https://docs.ragas.io/)：RAG 指标库，覆盖 faithfulness、context relevance、answer relevance。相关页：[RAGAS for RAG Evaluation](/blogs/generative-engine-optimization/ragas-rag-evaluation)。
- [Promptfoo](https://www.promptfoo.dev/)：prompt/model regression testing harness，适合比较多个 prompt 和模型组合。相关页：[Promptfoo regression testing](/blogs/generative-engine-optimization/promptfoo-rag-regression-testing)。

一个常见组合是：Braintrust 或 LangSmith 管主数据集和可视化，DeepEval/Promptfoo 做 CI，RAGAS 提供 RAG 专项指标。

## Side-by-side feature comparison

| Feature | Braintrust | LangSmith | Arize Phoenix | Galileo | W&B Weave | OpenAI Evals |
| --- | --- | --- | --- | --- | --- | --- |
| Open source | No | No | Yes | No | No | Yes |
| Self-hostable | No | No | Yes | No | No | Yes |
| Primary strength | experiment velocity | trace to dataset | self-hosted OSS | hallucination depth | ML + eval unified | model benchmarking |
| Production monitoring | Yes | Yes | Yes | Yes | Yes | No |
| Human annotation queue | Yes | Strong | Basic | Yes | Basic | No |
| LangChain support | Good | Native | Good | Good | Good | Partial |
| Multi-step tracing | Good | Good | Strong | Good | Good | No |
| Free tier | Yes | Yes | OSS | No | Yes | OSS |

隐藏成本通常不是 list price，而是：

- judge model API cost。
- trace volume。
- annotation seats。
- custom scorer compute。
- 数据保留和导出限制。

## Choosing by team type

| Team profile | Recommended primary | Recommended secondary |
| --- | --- | --- |
| AI product team, shipping fast | Braintrust | DeepEval |
| LangChain/LangGraph stack | LangSmith | RAGAS |
| Regulated industry, self-hosted required | Arize Phoenix | Promptfoo |
| High-stakes hallucination prevention | Galileo | Braintrust |
| ML team already on W&B | W&B Weave | DeepEval |
| Code-first, no SaaS | OpenAI Evals | RAGAS + DeepEval |

经验法则：选一个主系统承载团队协作和历史记录，再选一个轻量开源框架进 CI。不要让同一条 trace 同时进入五个平台。

## Selection workflow for teams

选 eval 工具时，可以用五步流程代替功能表投票。

第一步，定义主任务。团队到底要解决 prompt regression、RAG hallucination、production trace debugging、human review、model comparison，还是 compliance audit？如果主任务不清楚，任何平台看起来都“差一点但也能做”。

第二步，选数据源。离线 benchmark、人工标注数据、生产 traces、RAG 检索日志、用户反馈和客服升级记录都可以成为 eval dataset，但它们的治理方式不同。生产 traces 最需要隐私和采样策略；人工标注最需要 reviewer workflow；RAG 日志最需要上下文、source document 和 answer 绑定。

第三步，定义 scorer 组合。多数团队最终会同时使用 deterministic scorer、LLM judge、RAG metric、human label 和 business metric。工具要能保存 scorer 版本，否则你无法判断分数变化来自模型变化、prompt 变化还是评分器变化。

第四步，做两周试点。不要先签长期合同。选 100 到 300 条真实样本，跑两个模型、两个 prompt 版本和三类 scorer，看工具是否能让团队更快发现失败、复现失败、修复失败。

第五步，决定主平台和 CI 框架。主平台承载协作、历史、可视化和 reviewer workflow；CI 框架承载代码库里的发布门槛。两者职责分开，系统会更干净。

## Reference architectures

小型 AI 产品团队常见架构是：Braintrust 管 dataset、experiments 和 human review，DeepEval 或 Promptfoo 跑 pull request regression。生产流量先抽样记录到 Braintrust，失败样本再回流到固定 eval set。

LangChain/LangGraph 团队常见架构是：LangSmith 捕获 traces、观察 agent steps、把失败 trace 转成 dataset；RAGAS 或 DeepEval 负责 RAG 指标和 CI。这样从 production bug 到 eval regression 的路径最短。

受监管行业常见架构是：Arize Phoenix 自托管 capture traces，OpenTelemetry 统一链路，Promptfoo 或 OpenAI Evals 在内部 CI 跑回归。敏感数据不离开基础设施，必要时只把匿名指标发到外部 BI。

高风险 RAG 团队常见架构是：Galileo 或类似质量平台专门监控 hallucination、groundedness 和 factuality；Braintrust 或自建 dataset 管实验历史；人工 reviewer 处理高 severity case。这里的重点不是跑最多工具，而是把 retrieval failure、generation failure 和 citation failure 分开。

ML-native 团队常见架构是：W&B Weave 和原有 W&B 项目共用数据集、模型版本、实验记录，DeepEval 做轻量 CI。适合同时训练模型、微调模型和构建 LLM application 的团队。

## Cost, governance, and migration questions

价格表通常不是总成本。真正决定成本的是 trace volume、judge model 调用次数、annotation seats、数据保留周期、在线评估采样率和自定义 scorer compute。

采购前要问清楚：

- trace data 是否可以导出，导出格式是否保留 span、prompt、response、retrieved context、metadata 和 scores？
- scorer 版本、dataset 版本和 experiment 配置是否可审计？
- 是否支持 PII redaction、field-level masking、region residency 和 retention policy？
- human annotation 是否按 seat、任务量或项目数收费？
- online evaluation 的采样率和模型调用成本由谁承担？
- 如果一年后迁移，历史数据能否离开平台？

治理问题也很实际。一个 eval 平台会存储用户输入、模型输出、内部提示词、检索文档和失败案例，这些往往比普通 analytics 更敏感。上线前应明确谁能看 traces、谁能导出数据、谁能修改 scorer、谁能批准 release gate。

## Migration strategy

如果团队已经在多个工具里分散了 eval 数据，不建议一次性重建。更稳的迁移方式是先定义 canonical dataset schema：`input`、`expected`、`context`、`actual`、`metadata`、`scores`、`labels`、`trace_id`、`source_url`、`created_at`、`version`。然后把现有工具导出的数据映射到这个 schema。

下一步选择一个主平台承载未来数据，同时保留旧工具只读。新工具上线后的前两到四周，双跑关键 eval，比较分数差异和 reviewer 一致性。确认结果可解释后，再把 CI gate 切到新系统。

迁移时最容易丢的是失败样本背后的上下文。很多 eval row 只有用户问题和最终答案，却没有 retrieved documents、tool calls、system prompt version 和 model config。没有这些字段，迁移后的数据只能做粗略评分，不能真正帮助修 bug。

## Tooling anti-patterns

第一个反模式是“工具先行”。团队买了平台，却没有定义失败类型、release threshold 和数据集 owner，最后只得到漂亮 dashboard。

第二个反模式是“所有东西都用 LLM judge”。LLM judge 很有用，但它不适合替代所有 deterministic checks。格式、JSON schema、引用数量、禁止词、URL 可访问性、工具调用参数都应该先用代码检查。

第三个反模式是“生产监控和离线评估断开”。如果生产失败不能回流到 eval dataset，系统会反复在同一类问题上摔倒。每个严重失败都应该被转成 regression test。

第四个反模式是“指标太多但没人负责”。一个页面有 20 个分数并不代表质量更清楚。每个核心 metric 都要有 owner、解释文档、阈值和修复路径。

第五个反模式是“没有人类校准”。LLM eval 最终要服务用户和业务。高影响样本、边界样本和评分器分歧样本需要人工审核，否则工具会把模型自己的偏差包装成客观指标。

## Tool category decision tree

如果团队还没有 eval 工具，可以先按主问题选择类别。

| 主问题 | 优先类别 | 典型选择 |
| --- | --- | --- |
| 我们要快速比较 prompt 和模型版本 | Experiment platform | Braintrust、W&B Weave |
| 我们要从生产 trace 找问题 | Observability | LangSmith、Arize Phoenix |
| 我们最怕幻觉和事实错误 | Quality intelligence | Galileo、RAG-specific evaluators |
| 我们只想在 CI 里跑回归 | Open framework | OpenAI Evals、DeepEval、Promptfoo、RAGAS |
| 我们处理敏感数据 | Self-hosted observability | Arize Phoenix、自建 OTel pipeline |

先选类别，再选产品。很多采购失败不是因为工具差，而是团队把 experiment platform 当 tracing 工具用，或把 open-source CLI 当协作平台用。

## Evaluation data model

无论选哪个工具，建议先定义内部 canonical eval schema。否则后续迁移和跨工具比较会很痛。

核心字段包括：`input`、`expected_behavior`、`actual_output`、`retrieved_context`、`model`、`prompt_version`、`dataset_version`、`scorer_version`、`scores`、`human_label`、`trace_id`、`metadata`、`severity`、`owner`、`created_at`。

RAG 和 GEO 系统还应加 `source_url`、`citation_url`、`claim_span`、`supported_by_context`、`brand_entity`、`competitor_entities` 和 `market_language`。这些字段能帮助你判断 AI answer 只是提到品牌，还是正确引用、正确归因、正确推荐。

如果工具不能导出这些字段，迁移成本会很高。评估平台保存的往往是最敏感、最有诊断价值的数据，数据所有权比 UI 更重要。

## Two-tool architecture

成熟团队很少只用一个工具，也不该同时用六个。最常见的稳定架构是“两件套”。

第一件是协作平台：保存数据集、实验结果、trace、人工标签、review workflow 和历史趋势。它服务产品、工程、QA、运营和领导层。

第二件是代码库里的 CI 框架：在 pull request 或部署前运行固定 regression set。它服务工程发布门禁，要求可复现、可脚本化、可在本地或 CI 跑。

两者之间要有回流：生产 trace 里的严重失败进入协作平台，人类确认后写入 canonical dataset，再同步到 CI regression。这样每次事故都会变成未来保护，而不是只留在某个 dashboard 里。

## Procurement questions

签约前要问的问题通常比 feature checklist 更重要。

- Trace、prompt、retrieved context、score 和 human labels 能否完整导出？
- 是否支持 PII redaction、字段级 masking、region residency 和 retention policy？
- Judge model 调用成本是否包含在平台费里，还是另算？
- Dataset、scorer、prompt 和 experiment 配置是否有版本历史？
- 能否把生产失败一键转成 eval case？
- 是否支持 human review 队列、权限和审计日志？
- 如果团队一年后迁移，历史数据能否保持可用？

这些问题决定总拥有成本和治理风险。Eval 平台不是普通 analytics，它会看到用户输入、模型输出、内部提示词和检索资料，安全要求应更高。

## Maturity roadmap

工具选择也应随成熟度变化。

第一阶段，团队只需要轻量开源框架和几十条测试样例。目标是把 eval 接进发布流程。

第二阶段，加入实验平台，管理 dataset、prompt 版本、模型比较和人类标注。目标是让迭代速度变快。

第三阶段，接 production tracing 和 online evaluation。目标是让线上失败回流到测试集。

第四阶段，加入治理：权限、审计、PII、region、retention、SLA、成本监控和跨团队 reporting。

不要在第一阶段购买第四阶段的复杂度，也不要在第三阶段还靠散落的 CSV。工具要跟着组织成熟度升级。

## Key Takeaways

- LLM eval 工具可分为 experiment platforms、observability tools、quality intelligence 和 open frameworks。
- Braintrust 强在 experiment velocity；LangSmith 强在 LangChain trace-to-dataset；Arize 强在 OSS self-hosting；Galileo 强在 hallucination detection。
- 大多数团队需要两个工具，而不是六个：一个主平台 + 一个 CI/open framework。
- 总拥有成本常由 trace volume、annotation seats 和 judge model cost 决定。
- 工具选择要映射到团队类型，不要按功能清单盲选。

## FAQ

**Which tool should a small AI product team start with?**

如果你主要在迭代 prompts、models 和 datasets，Braintrust 是直接路径；如果你的应用已经是 LangChain/LangGraph，LangSmith 更自然。

**Do I need a hosted platform and an open-source framework?**

成熟团队通常需要。hosted platform 用于协作、可视化和历史记录；open-source framework 用于 CI regression 和代码库内的可复现测试。

**Which option is best for regulated data?**

优先看 Arize Phoenix 或其他可自托管方案。核心问题不是功能，而是 trace data 是否能离开你的基础设施。

**Is OpenAI Evals enough by itself?**

对 model benchmarking 和 CI regression 足够；对 production tracing、annotation queue 和 team workflow 不够。

## Related reading

- [What Are LLM Evals?](/blogs/generative-engine-optimization/what-are-llm-evals)
- [Human vs LLM-as-Judge](/blogs/generative-engine-optimization/human-vs-llm-judge-evaluation)
- [Braintrust: Production-Grade LLM Evaluation](/blogs/generative-engine-optimization/braintrust-llm-evaluation)
- [LangSmith for LLM Tracing and Evaluation](/blogs/generative-engine-optimization/langsmith-tracing-evaluation)
- [Arize Phoenix LLM Observability](/blogs/generative-engine-optimization/arize-phoenix-llm-observability)
- [Galileo Hallucination Detection](/blogs/generative-engine-optimization/galileo-hallucination-detection)
- [OpenAI Evals Guide](/blogs/generative-engine-optimization/openai-evals-guide)

## About the author

[Rohit Singh](https://www.linkedin.com/in/rohitsingh017) is the creator of [GeoZ AI](https://www.geoz.ai/) and The GEO Community. Follow the [learning path](/start) or connect on [LinkedIn](https://www.linkedin.com/in/rohitsingh017).

## Continue your learning journey

如果还没有指标体系，先读 [The LLM Eval Metrics Taxonomy](/blogs/generative-engine-optimization/llm-eval-metrics-taxonomy)。如果已经有指标但缺少评分方式，读 [Human vs LLM-as-Judge](/blogs/generative-engine-optimization/human-vs-llm-judge-evaluation)。如果要把失败样例接进 CI，可以继续看 [DeepEval pytest-style RAG tests](/blogs/generative-engine-optimization/deepeval-pytest-style-rag-tests) 和 [Promptfoo regression testing](/blogs/generative-engine-optimization/promptfoo-rag-regression-testing)。

## Read next

- [Braintrust LLM Evaluation](/blogs/generative-engine-optimization/braintrust-llm-evaluation)
- [LangSmith Tracing and Evaluation](/blogs/generative-engine-optimization/langsmith-tracing-evaluation)
- [OpenAI Evals Guide](/blogs/generative-engine-optimization/openai-evals-guide)
