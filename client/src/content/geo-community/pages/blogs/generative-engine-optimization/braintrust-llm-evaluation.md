---
path: "/blogs/generative-engine-optimization/braintrust-llm-evaluation"
kind: "blog"
title: "Braintrust: Production-Grade LLM Evaluation with Datasets, Experiments, and Scoring"
source_title: "Braintrust: Production-Grade LLM Evaluation with Datasets, Experiments, and Scoring"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/braintrust-llm-evaluation"
author: "Rohit Singh"
date: "11 Apr 2026"
status: "ready"
---
# Braintrust: Production-Grade LLM Evaluation with Datasets, Experiments, and Scoring

Braintrust 把 LLM evaluation 里的几件事放到一个工作流里：dataset versioning、experiment tracking、scorers、diff view、CI gate 和 production logging。它适合那些频繁改 prompt、换模型、上线 AI 产品的团队，因为它让“这次改动到底变好了还是变差了”变成可回答的问题。

![Braintrust LLM evaluation — dataset management, experiments, and scorer configuration](https://thegeocommunity.com/images/braintrust-llm-evaluation.webp)

## 页面摘要

Braintrust LLM evaluation guide: dataset versioning, experiment tracking, custom scorers, CI integration, and eval-driven development for AI product teams shipping fast.

## 原站章节结构

1. The core Braintrust model: experiments as a primitive
2. Dataset management: test cases as artifacts
3. Scoring in Braintrust: three types
4. Running your first experiment
5. Comparing experiments: the diff workflow
6. CI integration: gating deployments on eval results
7. Online evaluation: scoring production traffic
8. Human annotation in Braintrust
9. When Braintrust is the right choice
10. Key Takeaways
11. FAQ

## Key Takeaways

- Braintrust 的核心抽象是 experiment：每次 eval run 都记录 dataset、outputs、scores 和 metadata。
- Dataset 在 Braintrust 中是 versioned artifact，测试集变化也会被记录，避免团队悄悄把测试改简单。
- Scorers 可以是 deterministic code、LLM judge 或 human annotation，三者可以在同一个 experiment 中组合。
- Diff workflow 是 Braintrust 的关键价值：看平均分变化，也看每条样本具体哪里变好或变差。
- 它适合快速迭代 AI 产品的团队；如果需要 self-hosted observability，可以考虑 Phoenix，如果深度依赖 LangChain，可以看 LangSmith。

## The core Braintrust model: experiments as a primitive

Braintrust 的核心概念是 experiment。一个 experiment 是把 LLM pipeline 跑在某个 dataset 上，并记录输出和评分的版本化记录。

每次 experiment 通常保存：

- **Inputs**：来自 dataset 的测试样本。
- **Outputs**：模型或 pipeline 对每个输入的回答。
- **Scores**：一个或多个 scorer 对输出的评价。
- **Metadata**：model name、prompt version、temperature、timestamp、commit hash 等。

这个结构让比较变得直接。想知道 prompt v2 是否比 v1 更好，不需要翻日志或凭印象判断。你运行两个 experiment，然后 diff：哪些样本提升，哪些退化，aggregate score 变化多少，metadata 是否不同。

它解决了 LLM 团队常见失败模式：大家手动测试几个例子，觉得新 prompt 更好，但没有 baseline，也无法解释三周后用户投诉来自哪个改动。

## Dataset management: test cases as artifacts

在 Braintrust 里，dataset 是一组 versioned test cases。每行至少应该包含 input 和 expected。

```python
import braintrust

project = braintrust.init_project("my-llm-app")
dataset = project.create_dataset(name="product-qa-v1")

dataset.insert(
    input={"question": "What is your refund policy?"},
    expected={
        "must_include": "30 days",
        "must_not_include": "no refunds",
    },
)
```

`input` 是发给模型或 pipeline 的内容，`expected` 可以是理想答案、必须包含的事实、禁止出现的内容、required citations 或其他可评分属性。

Dataset versioning 很重要。因为测试集本身也会变化。如果分数提高，你要知道是模型真的变好，还是测试集变弱。Braintrust 支持比较 dataset versions，这能防止团队无意中“把测试改到让模型更容易通过”。

最快的高质量 dataset 来源是 production traffic。把真实用户查询记录下来，标记有价值的失败样本，再把它们加入 eval dataset。这样测试集会逐渐覆盖真实边界条件，而不是只覆盖工程师想象中的干净问题。

## Scoring in Braintrust: three types

Braintrust 支持三类 scorer，生产团队通常会组合使用。

### Type 1: Code scorers (deterministic)

Code scorer 是普通函数，读取 input、output、expected，返回 0 到 1 的分数。

```python
import json

def format_check(input, output, expected):
    try:
        parsed = json.loads(output)
        return 1.0 if all(k in parsed for k in expected["required_keys"]) else 0.0
    except Exception:
        return 0.0
```

适合：

- JSON schema validation。
- required keys 检查。
- 必须包含或禁止包含某些内容。
- 格式、长度、枚举值、URL 等 deterministic constraints。

### Type 2: LLM judges (model-based)

LLM judge 用另一个模型评价输出质量。Braintrust 提供常见 built-in scorers，也支持 custom judge prompts。

```python
from braintrust.scorers import Faithfulness, Relevance, Correctness

experiment = braintrust.init(
    project="my-app",
    dataset=dataset,
    scores=[Faithfulness(), Relevance(), Correctness()],
)
```

适合：

- faithfulness。
- answer relevance。
- correctness。
- tone、helpfulness、policy compliance 等主观维度。

LLM judge 不是绝对真理，但它能把大量样本先自动筛出来，再交给人工复核。

### Type 3: Human review

当自动评分不足以判断时，可以把样本送进 human annotation queue。Reviewer 看到 input、output 和 rubric，按同样维度评分。人工分数会和自动分数一起进入 experiment。

实用做法不是让人工 review 每条输出，而是选择性触发。例如 LLM judge 分数低于 0.6、两个 scorer 分歧很大、或样本属于高风险类别时，才进入人工队列。

## Running your first experiment

用 Python SDK 跑一个基础 experiment 的结构很简单。

```python
import braintrust
import openai

@braintrust.traced
def my_llm_pipeline(input):
    response = openai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": input["question"]}],
    )
    return response.choices[0].message.content

experiment = braintrust.Eval(
    "Product QA",
    data=lambda: dataset.fetch(),
    task=my_llm_pipeline,
    scores=[format_check, Relevance()],
)
```

`braintrust.Eval` 会对 dataset 中每个 item 运行 `task`，然后套用 scorers，并把结果写入 Braintrust UI。

`@braintrust.traced` 对多步骤 pipeline 很有用。它可以记录中间步骤，比如 retrieval、reranking、prompt assembly 和 generation。出现低分时，你不只知道输出错了，还能看错在 pipeline 哪一层。

## Comparing experiments: the diff workflow

Braintrust 的 diff view 是日常 prompt engineering 最常用的工作流。

Diff 会展示：

- 每个 scorer 的 aggregate score change。
- 每条 test case 的 score change，并按变化幅度排序。
- 同一输入下两个 experiment 的 output side-by-side。
- Metadata 差异，例如 model、temperature、prompt version。

典型流程：

1. 用当前 prompt 跑 baseline experiment。
2. 修改 prompt 或模型配置。
3. 跑新 experiment。
4. 看 diff：哪些样本变好？哪些变坏？坏在哪里？

分数变化本身不够。比如 relevance 平均提高 0.08，但 medical questions 的 faithfulness 降低 0.12，这种 tradeoff 只有逐样本 diff 才能看清。没有 diff，问题可能三周后才以用户投诉形式出现。

## CI integration: gating deployments on eval results

Braintrust 可以通过 CLI 和 API 接入 CI。

```bash
# Install CLI
npm install -g braintrust

# Run evals in CI
braintrust eval --project "Product QA" --threshold 0.85
```

`--threshold` 定义通过阈值。如果 aggregate score 低于阈值，CLI 返回非零退出码，阻止部署。

GitHub Actions 示例：

```yaml
- name: Run LLM Evals
  run: braintrust eval --project "Product QA" --threshold 0.85
  env:
    BRAINTRUST_API_KEY: ${{ secrets.BRAINTRUST_API_KEY }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

这和 DeepEval pytest-style RAG tests 的纪律相似：eval 不是报告，而是 gate。区别在于 Braintrust 会自动记录结果，并与 baseline 比较，而不仅仅输出 pass/fail。

## Online evaluation: scoring production traffic

Braintrust 也支持 production logging 和 online eval。你可以在生产代码里记录真实请求和输出，再异步评分。

```python
@braintrust.traced
def handle_user_request(request):
    answer = generate_answer(request.query)
    braintrust.current_span().log(
        input={"question": request.query},
        output=answer,
    )
    return answer
```

Online evaluation 的关键是异步。生产请求同步记录 trace，评分在后台运行，不应该增加用户请求延迟。

这能暴露 offline dataset 和真实流量之间的差距。一个模型在 curated test set 上可能 0.92，但在真实用户查询上只有 0.78 到 0.84。真实查询更乱、更长、更含糊，也更容易碰到测试集没有覆盖的边界。

## Human annotation in Braintrust

Braintrust 的 annotation queue 让团队把低分或高风险输出送给人工 reviewer。

```python
experiment.update_score(
    trace_id=trace_id,
    annotator_id="human",
    require_review=(auto_score < 0.6),
)
```

Reviewer 使用同一套 rubric 评分。这样人工反馈不是散落在 Slack 或文档里，而是直接进入 experiment record。

更重要的是 active learning loop：人工标注的失败样本可以被加入 eval dataset，成为未来 regression coverage。每一次人工发现的错误，都能变成以后自动捕捉的测试。

## When Braintrust is the right choice

Braintrust 适合以下团队：

- 每周多次迭代 prompts、models 或 retrieval configs。
- 需要 dataset versioning 和 test set A/B comparison。
- 想在同一平台里组合 code scorers、LLM judges 和 human annotation。
- 需要 CI gate，而且要保留历史结果和 baseline diff。
- 已经或即将记录 production traffic，希望 offline eval 和 online eval 连接起来。

它不一定适合所有情况：

- 需要完全 self-hosted infrastructure，可以看 Arize Phoenix。
- 深度依赖 LangChain 并希望自动 instrumentation，可以看 LangSmith。
- 团队已经在 W&B 生态里管理实验，可以看 W&B Weave。
- 只需要轻量本地 pytest-style eval，DeepEval 可能更简单。

## Key Takeaways

- Braintrust 把 eval run 变成 versioned experiment，方便比较任意两次运行。
- Dataset 是一等公民，版本变化也要被审计。
- Code scorer、LLM judge 和 human review 各自覆盖不同 failure modes。
- Diff view 让 prompt 迭代从“看平均分”变成“看哪些样本具体变了”。
- CI integration 和 online eval 把质量检查从离线评测扩展到部署和生产。

## FAQ

**Braintrust 和 OpenAI Evals 有什么不同？**

OpenAI Evals 更像代码优先的 benchmark runner；Braintrust 更强调 dataset management、experiment tracking、diff UI、人类标注和生产日志。

**Braintrust 是否只能评估 OpenAI 模型？**

不是。它评估的是你的 pipeline 输出，底层可以是 OpenAI、Anthropic、Gemini、本地模型或混合系统。

**第一套 dataset 应该从哪里来？**

从真实用户查询和真实失败样本开始。工程师自造样本可以补充边界条件，但不能替代真实流量。

**Human annotation 会不会太慢？**

如果全量人工评审会很慢。更好的模式是只把低分、高风险或自动 scorer 分歧大的样本送审。

**CI gate 阈值应该设多高？**

先用 baseline 决定，不要拍脑袋。比如当前稳定分数是 0.88，可以先设 0.85 防退化，再逐步提高。

## 图片引用

- Braintrust LLM evaluation — dataset management, experiments, and scorer configuration: https://thegeocommunity.com/images/braintrust-llm-evaluation.webp

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/braintrust-llm-evaluation/print
- The core Braintrust model: experiments as a primitive: /blogs/generative-engine-optimization/braintrust-llm-evaluation
- Dataset management: test cases as artifacts: /blogs/generative-engine-optimization/braintrust-llm-evaluation
- Scoring in Braintrust: three types: /blogs/generative-engine-optimization/braintrust-llm-evaluation
- Running your first experiment: /blogs/generative-engine-optimization/braintrust-llm-evaluation
- Comparing experiments: the diff workflow: /blogs/generative-engine-optimization/braintrust-llm-evaluation
- CI integration: gating deployments on eval results: /blogs/generative-engine-optimization/braintrust-llm-evaluation
- Online evaluation: scoring production traffic: /blogs/generative-engine-optimization/braintrust-llm-evaluation
- Human annotation in Braintrust: /blogs/generative-engine-optimization/braintrust-llm-evaluation
- When Braintrust is the right choice: /blogs/generative-engine-optimization/braintrust-llm-evaluation
- Key Takeaways: /blogs/generative-engine-optimization/braintrust-llm-evaluation
- FAQ: /blogs/generative-engine-optimization/braintrust-llm-evaluation
- Braintrust: https://www.braintrust.dev/
- DeepEval pytest-style RAG tests: /blogs/generative-engine-optimization/deepeval-pytest-style-rag-tests
- LLM Evals Tool Landscape: /blogs/generative-engine-optimization/llm-evals-landscape-comparison
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- RAGAS for RAG Evaluation: /blogs/generative-engine-optimization/ragas-rag-evaluation
- LLM Evals Tool Landscape: Braintrust vs LangSmith vs Arize vs Galileo: /blogs/generative-engine-optimization/llm-evals-landscape-comparison
- Human vs LLM-as-Judge: When to Use Each and When to Combine Them: /blogs/generative-engine-optimization/human-vs-llm-judge-evaluation
- LangSmith for LLM Tracing and Evaluation: A Practical Setup Guide: /blogs/generative-engine-optimization/langsmith-tracing-evaluation
- Explore the Learning Path →: /start
- Is Your Website AI Agent-Ready? The New Lighthouse Agentic Browsing Audit Tests Three Things Most SEOs MissGoogle's new Lighthouse 'Agentic : /blogs/generative-engine-optimization/website-ai-agent-readiness-lighthouse-audit
- Best Courses for AI SEO, AEO & GEO: Ranked Picks for 2026CXL, Coursera, Jellyfish, Reforge, and The GEO Community — ranked and compared acro: /blogs/generative-engine-optimization/best-courses-ai-seo-aeo-geo-2026
- GA4 for AI Search: How to Measure AI Traffic, GEO Performance & ConversionsGA4 wasn't built to measure AI Search — it predates it. With the : /blogs/generative-engine-optimization/ga4-for-ai-search-measure-ai-traffic-geo-performance-conversions
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
