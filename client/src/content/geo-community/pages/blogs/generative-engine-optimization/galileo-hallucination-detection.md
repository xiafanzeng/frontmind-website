---
path: "/blogs/generative-engine-optimization/galileo-hallucination-detection"
kind: "blog"
title: "Galileo for Hallucination Detection and LLM Evaluation at Scale"
source_title: "Galileo for Hallucination Detection and LLM Evaluation at Scale"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/galileo-hallucination-detection"
author: "Rohit Singh"
date: "11 Apr 2026"
status: "ready"
---
# Galileo for Hallucination Detection and LLM Evaluation at Scale

LLM hallucination 最难的地方在于它通常不“看起来错”。答案可能语法正确、语义连贯、语气自信，还把真实事实和编造细节混在一起。Galileo 的定位就是生产级 hallucination detection 和 factual quality evaluation：不是泛泛看输出好不好，而是把 completeness、groundedness、correctness 拆开衡量。

![Galileo hallucination detection — ChainPoll methodology and LLM evaluation at scale](https://thegeocommunity.com/images/galileo-hallucination-detection.webp)

## 页面摘要

这篇文章解释 Galileo 如何用 ChainPoll 方法降低 LLM judge 的随机性，Hallucination Index 的三个维度分别意味着什么，Galileo Luna 为什么适合大规模生产监控，以及 RAG 场景下如何区分 retrieval hallucination 和 generation hallucination。

## 原站章节结构

1. Why hallucination detection is uniquely hard
2. Galileo's ChainPoll methodology
3. The Hallucination Index: three dimensions
4. Galileo Luna: purpose-built evaluation model
5. RAG evaluation: separating retrieval from generation hallucinations
6. Production monitoring with Galileo
7. Integration: Python SDK and pipeline setup
8. Interpreting Galileo scores
9. When Galileo is the right choice
10. Key Takeaways
11. FAQ

## Why hallucination detection is uniquely hard

幻觉检测比普通质量检测更难，因为 hallucinated output 不一定有表面异常。它可能：

- 语法完全正确。
- 语义上听起来很合理。
- 语气自信、权威。
- 在同一段里混合正确事实和编造信息。

普通指标很容易失败。semantic similarity 可能把“听起来像参考答案但事实错误”的输出评高；fluency score 不会惩罚事实错误；safety classifier 也通常关注显式安全类别，而不是细粒度 factual hallucination。

TruthfulQA 等 benchmark 提醒我们：更强、更流畅的模型并不总是更真实。模型越会写，越能生成让人难以一眼识别的错误。幻觉检测需要事实知识、claim decomposition 和多步推理，单次 LLM judge 往往不够稳定。

## Galileo's ChainPoll methodology

Galileo 的核心方法是 ChainPoll：多次运行、链式推理、投票聚合的 hallucination evaluation。

流程可以拆成四步：

1. **Decompose the answer into atomic claims**：把答案拆成可独立判断的事实声明。
2. **Run multiple evaluation passes**：每个 claim 由 chain-of-thought judge 多次独立评估。
3. **Aggregate votes**：N 次评估中有多少次认为 claim 是 hallucinated，就形成该 claim 的 hallucination score。
4. **Propagate to answer level**：任何 hallucinated claim 都会影响整条 answer-level score。

关键不是单次 judge，而是多次聚合。LLM judge 本身也有随机性，同一个 claim 在不同 run 里可能得到不同判断。ChainPoll 通过 5-10 次评估降低方差，把随机判断变成更稳定信号。

ChainPoll paper 报告其与 human rater judgment 的 Spearman rank correlation 达到 0.87，而 single-pass evaluation 为 0.72。chain-of-thought 提升单次判断质量，multi-run aggregation 降低噪声，两者组合效果最好。

## The Hallucination Index: three dimensions

Galileo 的 Hallucination Index 不是单一分数，而是三个独立维度：

**1. Completeness**  
模型是否完整回答了问题。0.0 表示完全没有回应，1.0 表示所有必需信息都在。低 completeness 不一定是幻觉，可能只是漏答。

**2. Groundedness**  
答案中的事实 claim 是否能被外部来源支持。groundedness 不等于 RAG 里的 faithfulness；它关注 claim 是否可被客观知识验证，即使没有固定 retrieval corpus。

**3. Correctness**  
答案事实是否正确。closed-domain 系统通常有 reference answer，可以直接比较。open-domain 系统则需要外部事实验证。

三个维度的价值在于诊断根因：

- 低 completeness + 高 groundedness：可能是 retrieval coverage 不足，模型没有足够信息。
- 高 completeness + 低 groundedness：典型 generation hallucination，模型编造了 context 之外的内容。
- 低 correctness + 高 groundedness：可能是 context 本身错误，模型忠实使用了坏信息。

## Galileo Luna: purpose-built evaluation model

通用 LLM judge（GPT-4、Claude 等）能做很多事，但未必专为 hallucination classification 优化。Galileo Luna 是 7B 参数的 evaluation model，专门针对 hallucination detection 和 factual accuracy task 训练。

原站强调三个实际影响：

- **Speed**：Luna 评估速度约为 GPT-4 as judge 的 10 倍。
- **Cost**：每次 evaluation 成本约低两个数量级。
- **Accuracy**：在 hallucination classification 这类训练目标上有竞争力；但对泛化质量维度，大模型 judge 仍可能有优势。

这使 continuous production monitoring 变得更现实。每小时评估数千条输出时，用 GPT-4-class model 持续打分成本太高；7B evaluator 则可以持续跑。严格场景也可以组合使用：Luna 做 continuous monitoring，GPT-4 ChainPoll 对代表性样本做周期性深度评估。

## RAG evaluation: separating retrieval from generation hallucinations

RAG hallucination 有两个来源：

**Retrieval hallucination**：retriever 拿到了错误或无关 context。generator 可能忠实使用 context，但 context 本身错。

**Generation hallucination**：retriever 拿到了正确 context，但模型生成了超出或违背 context 的 claim。

混淆这两类问题会浪费大量工程时间。若根因是 retriever，你再怎么加强 generator faithfulness 都解决不了。

Galileo 的 RAG evaluation 会把 retrieval 和 generation 分开测：

```python
from galileo import GalileoPromptScorer

scorer = GalileoPromptScorer(
    evaluate_retrieval=True,
    evaluate_generation=True,
    decompose_hallucinations=True,
)

results = scorer.score(
    inputs=queries,
    outputs=answers,
    contexts=retrieved_docs,
)

retrieval_scores = results["retrieval_adherence"]
generation_scores = results["context_adherence"]
```

`context_adherence` 衡量模型是否忠实使用 context；`retrieval_adherence` 衡量 retriever 是否取到了相关 context。前者低，修 generator；后者低，先修 retrieval。

相关指标背景可看：[RAGAS for RAG Evaluation](/blogs/generative-engine-optimization/ragas-rag-evaluation)

## Production monitoring with Galileo

Galileo 可以在生产环境持续评估 outgoing LLM responses。可以同步拦截，也可以异步打分：

```python
from galileo import GalileoObserve

observe = GalileoObserve()

@observe.watch
def my_rag_endpoint(query: str) -> str:
    context = retrieve(query)
    answer = generate(query, context)
    return answer
```

`@observe.watch` 会记录 inputs、outputs 和中间 context，并自动评分。dashboard 可显示：

- hallucination rate trend。
- 按 query category 拆分的 score distribution。
- 高风险输出 review queue。
- 当 score 低于阈值时触发 drift alert。

drift alert 是生产价值核心。例如设置 groundedness 必须高于 0.85，一旦模型更新或检索配置变更导致分数下降，团队能在流量开始后几小时内发现，而不是等用户反馈堆起来。

## Integration: Python SDK and pipeline setup

基础安装：

```bash
pip install galileo-protect galileo-observe
```

离线评估示例：

```python
import os
os.environ["GALILEO_API_KEY"] = "your-api-key"

from galileo import GalileoPromptScorer, GalileoObserve

scorer = GalileoPromptScorer()
eval_results = scorer.score(
    inputs=[
        "What is the capital of France?",
        "What year was the Eiffel Tower built?",
    ],
    outputs=[
        "The capital of France is Paris.",
        "The Eiffel Tower was built in 1887.",
    ],
    contexts=[
        "Paris is the capital and most populous city of France.",
        "The Eiffel Tower was built between 1887 and 1889.",
    ],
)

print(eval_results)
```

第二个答案会暴露 context adherence 问题：输出说 1887，但 context 是 1887 到 1889。对 LangChain、LlamaIndex 等框架，Galileo 也提供 callback handlers，减少手工 wiring。

## Interpreting Galileo scores

| Score | Interpretation | Action |
| --- | --- | --- |
| 0.9-1.0 | 高质量，低 hallucination risk | Ship |
| 0.7-0.9 | 多数非关键场景可接受 | Monitor |
| 0.5-0.7 | 幻觉风险升高 | 发布前 review，改善 retrieval 或 generation |
| Below 0.5 | 高幻觉风险 | Block，调查根因 |

不要只看单分数。completeness、groundedness、correctness 应一起解释，因为它们指向不同修复路径。

## When Galileo is the right choice

Galileo 适合这些场景：

- hallucination detection 是产品核心风险，比如法律、医疗、金融、customer-facing AI。
- 每天需要评估上万条输出，成本必须可控。
- RAG accuracy 很关键，需要区分 retrieval failure 和 generation failure。
- 需要 production monitoring 和 drift alerts，而不仅是离线实验。

如果主要需求是 experiment management 或 prompt iteration，Braintrust 可能更合适；如果主要是 tracing 和 debugging，LangSmith 或 Phoenix 更自然；如果成本极敏感且幻觉检测准确性要求不高，可以先用 RAGAS 或 DeepEval。

完整比较：[LLM Evals Tool Landscape](/blogs/generative-engine-optimization/llm-evals-landscape-comparison)

## Key Takeaways

- ChainPoll 通过 chain-of-thought reasoning 和 multi-run aggregation，把与 human raters 的相关性提升到 0.87。
- Hallucination Index 拆成 completeness、groundedness、correctness，能指向不同根因。
- Galileo Luna 是为 hallucination classification 优化的 evaluation model，使 production-scale monitoring 更可行。
- RAG evaluation 必须把 retrieval hallucination 和 generation hallucination 分开，否则会修错层。
- drift alerts 能在模型或 pipeline 更新后快速发现质量退化。

## Related reading

- [Galileo](https://www.rungalileo.io/)
- [ChainPoll paper](https://arxiv.org/abs/2308.08067)
- [Galileo Luna](https://www.rungalileo.io/blog/galileo-luna)
- [RAGAS for RAG Evaluation](/blogs/generative-engine-optimization/ragas-rag-evaluation)
- [LLM Evals Tool Landscape](/blogs/generative-engine-optimization/llm-evals-landscape-comparison)
- [The LLM Eval Metrics Taxonomy](/blogs/generative-engine-optimization/llm-eval-metrics-taxonomy)

## 图片引用

- Galileo hallucination detection — ChainPoll methodology and LLM evaluation at scale: https://thegeocommunity.com/images/galileo-hallucination-detection.webp

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/galileo-hallucination-detection/print
- Why hallucination detection is uniquely hard: /blogs/generative-engine-optimization/galileo-hallucination-detection
- Galileo's ChainPoll methodology: /blogs/generative-engine-optimization/galileo-hallucination-detection
- The Hallucination Index: three dimensions: /blogs/generative-engine-optimization/galileo-hallucination-detection
- Galileo Luna: purpose-built evaluation model: /blogs/generative-engine-optimization/galileo-hallucination-detection
- RAG evaluation: separating retrieval from generation hallucinations: /blogs/generative-engine-optimization/galileo-hallucination-detection
- Production monitoring with Galileo: /blogs/generative-engine-optimization/galileo-hallucination-detection
- Integration: Python SDK and pipeline setup: /blogs/generative-engine-optimization/galileo-hallucination-detection
- Interpreting Galileo scores: /blogs/generative-engine-optimization/galileo-hallucination-detection
- When Galileo is the right choice: /blogs/generative-engine-optimization/galileo-hallucination-detection
- Key Takeaways: /blogs/generative-engine-optimization/galileo-hallucination-detection
- FAQ: /blogs/generative-engine-optimization/galileo-hallucination-detection
- Galileo: https://www.rungalileo.io/
- TruthfulQA (Lin et al., 2022): https://arxiv.org/abs/2109.07958
- ChainPoll: https://arxiv.org/abs/2308.08067
- ChainPoll paper (Friel et al., 2023): https://arxiv.org/abs/2308.08067
- Galileo Luna: https://www.rungalileo.io/blog/galileo-luna
- RAGAS for RAG Evaluation: /blogs/generative-engine-optimization/ragas-rag-evaluation
- LLM Evals Tool Landscape: /blogs/generative-engine-optimization/llm-evals-landscape-comparison
- Friel et al., 2023: https://arxiv.org/abs/2308.08067
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- LLM Evals Tool Landscape: Braintrust vs LangSmith vs Arize vs Galileo: /blogs/generative-engine-optimization/llm-evals-landscape-comparison
- RAGAS for RAG Evaluation: What It Measures and How to Use It Well: /blogs/generative-engine-optimization/ragas-rag-evaluation
- The LLM Eval Metrics Taxonomy: Faithfulness, Relevance, Safety, and Beyond: /blogs/generative-engine-optimization/llm-eval-metrics-taxonomy
- Explore the Learning Path →: /start
- Red-Teaming LLMs: A Systematic Guide to Safety and Robustness EvaluationRed-teaming is the discipline of deliberately probing LLMs for failu: /blogs/generative-engine-optimization/red-teaming-llm-safety-evaluation
- Weights & Biases Weave: End-to-End LLM Evaluation WorkflowsWeave is Weights & Biases's LLM-native layer for tracing, evaluation, and dataset: /blogs/generative-engine-optimization/weights-biases-weave-llm-evaluation
- Arize Phoenix: Open-Source LLM Observability and EvaluationArize Phoenix is an open-source tool for LLM tracing, evaluation, and dataset cur: /blogs/generative-engine-optimization/arize-phoenix-llm-observability
- www.linkedin.com: https://www.linkedin.com/groups/17147018/
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017/
- Claude Workflows: /ai-for-seo
- Paperclip Workflows: /paperclip-for-seo
- All Articles: /blogs
- Research: /blogs
- Guides: /blogs
- Technical: /blogs
- GEO Benchmarks: /benchmarks
- GEO Glossary: /resources/geo-glossary
- Transformer Viz: /resources/transformer-visualization
- Algorithm Updates: /resources/google-algorithm-updates
- Algorithm History: /resources/google-algorithm-history
- Search Status: /resources/google-search-status
- LLM Evals Guide: /resources/llm-evals
- Prompt Library: /resources/prompt-library
- Flesch RE Calculator: /tools/flesch-calculator
- FKGL Calculator: /tools/fkgl-calculator
- Gunning Fog Calculator: /tools/gunning-fog-calculator
- SMOG Calculator: /tools/smog-calculator
- PromptSource: https://github.com/bigscience-workshop/promptsource
- Dolly-15K: https://huggingface.co/datasets/databricks/databricks-dolly-15k
- OpenOrca: https://huggingface.co/datasets/Open-Orca/OpenOrca
- HH-RLHF: https://huggingface.co/datasets/Anthropic/hh-rlhf
- ShareGPT (Vicuna): https://huggingface.co/datasets/anon8231489123/ShareGPT_Vicuna_unfiltered
- OpenAI Evals: https://platform.openai.com/docs/guides/evals
- Share Ideas: /ideas
- Community Submissions: /community/submissions
- Join Waitlist: /waitlist
- LinkedIn Group: https://www.linkedin.com/groups/17147018/
- info@thegeocommunity.com: mailto:info@thegeocommunity.com
