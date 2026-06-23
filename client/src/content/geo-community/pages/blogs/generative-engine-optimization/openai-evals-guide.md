---
path: "/blogs/generative-engine-optimization/openai-evals-guide"
kind: "blog"
title: "OpenAI Evals: How the Framework Works and When to Use It"
source_title: "OpenAI Evals: How the Framework Works and When to Use It"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/openai-evals-guide"
author: "Rohit Singh"
date: "11 Apr 2026"
status: "ready"
---
# OpenAI Evals: How the Framework Works and When to Use It

OpenAI Evals 是一个代码优先的评测框架：用 YAML 定义 eval，用 JSONL 保存样本，用 completion function 把同一套测试跑到不同模型上。它不适合承担所有 LLM observability 工作，但非常适合做 model comparison、回归测试和可复现 benchmark。

![OpenAI Evals framework — registry structure, YAML eval definitions, and model comparison workflow](https://thegeocommunity.com/images/openai-evals-guide.webp)

## 页面摘要

OpenAI Evals framework guide: registry structure, YAML eval definitions, custom eval classes, model comparison, and when to use it vs alternatives like Braintrust and LangSmith.

## 原站章节结构

1. What OpenAI Evals actually is
2. The eval registry: structure and community contributions
3. YAML eval definition: the core format
4. The three built-in eval types
5. Model-graded evals: evaluating open-ended outputs
6. Running evals: the CLI workflow
7. Writing a custom eval class
8. When OpenAI Evals is the right tool
9. Limitations and when to look elsewhere
10. Key Takeaways
11. FAQ

## Key Takeaways

- OpenAI Evals 是 Python library + CLI + YAML registry 的组合，核心目标是让评测可复现、可版本化、可对比。
- 每个 eval 通常由 YAML spec 和 JSONL dataset 组成；YAML 说明如何跑，JSONL 保存测试样本和 ideal output。
- Match、Includes、FuzzyMatch 覆盖很多确定性评分场景；开放式输出可以用 model-graded eval。
- 它适合 model comparison、model upgrade 前的 regression test、代码优先团队的自托管评测。
- 它不是完整生产监控平台；dataset management、协作标注、可视化实验追踪通常需要 Braintrust、LangSmith、Weave、Phoenix 等工具补足。

## What OpenAI Evals actually is

OpenAI Evals 可以理解为三件东西的组合：

- 一个 Python library。
- 一个命令行运行器。
- 一个 registry，用 YAML 注册 eval，用 JSONL 存放样本。

一个 eval 要回答三个问题：给模型发什么输入、评估哪个模型、如何给输出打分。框架负责调用模型、记录结果、汇总指标。

它的价值不在于界面华丽，而在于可复现。一个 YAML spec 加一个 JSONL dataset 可以进入版本控制，团队可以在 GPT-4o、Claude、Gemini、local model 之间跑同一组测试，比较升级前后的差异。

几个关键属性：

- **Reproducibility**：同一套 eval spec、同一批样本、同一种 scoring logic 可以反复运行。
- **Model-agnostic execution**：通过 completion functions，可以把非 OpenAI 模型接入同一套评测。
- **Registry-based sharing**：eval 可以按名字注册和运行，团队也能复用社区已有评测。

## The eval registry: structure and community contributions

OpenAI Evals 的 registry 位于类似 `evals/registry/evals/` 的目录。每个 YAML 文件定义一个或多个 eval entry。

```yaml
your-eval-name:
  id: your-eval-name.v1
  description: "What this eval tests"
  disclaimer: "Any caveats"
  metrics: [accuracy]
```

社区贡献的 eval 覆盖范围很广：

- **Reasoning**：数学题、逻辑推理、空间推理。
- **Coding**：Python completion、代码审查、bug detection。
- **Safety**：有害内容、jailbreak resistance、toxicity。
- **Knowledge**：事实问答、领域知识、时间敏感问题。
- **Summarization**：摘要质量、信息保留。
- **Instruction-following**：复杂约束、格式遵循、多步骤指令。

即使团队不打算写 custom eval，registry 也能当作现成 benchmark library，用来快速比较多个模型在不同能力维度上的表现。

## YAML eval definition: the core format

每个 eval 通常包含两个文件：YAML spec 和 JSONL dataset。

YAML spec 定义运行方式：

```yaml
coding-pythonfunctions:
  id: coding-pythonfunctions.v0
  description: "Tests ability to complete Python function implementations."
  disclaimer: "Requires accurate Python code completion."
  metrics: [accuracy]

coding-pythonfunctions.v0:
  class: evals.elsuite.basic.match:Match
  args:
    samples_jsonl: coding/pythonfunctions.jsonl
```

这里的 `class` 决定使用哪种评分器，`args.samples_jsonl` 指向测试样本。

JSONL dataset 每一行是一条样本：

```json
{"input": [{"role": "system", "content": "Complete the Python function."}, {"role": "user", "content": "def add(a, b):\n    "}], "ideal": "return a + b"}
```

`input` 是发送给模型的对话，`ideal` 是用于评分的期望输出。这个格式非常适合源代码管理和 CI，因为它就是普通文本文件。

## The three built-in eval types

OpenAI Evals 内置几类常见确定性评分方式。

### Match

`Match` 做 exact string match。模型输出必须和 ideal answer 一致，通常会先处理一些基础空白。

```yaml
class: evals.elsuite.basic.match:Match
```

适合：

- 单选题。
- yes/no 题。
- 单 token 输出。
- 固定格式答案。

限制也明显：正确 paraphrase 可能会被判错，大小写和格式差异也会影响结果。

### Includes

`Includes` 做 case-insensitive substring match。只要输出中包含目标短语，就可以计为正确。

```yaml
class: evals.elsuite.basic.includes:Includes
```

适合抽取类任务：答案必须包含某个实体、日期、短语，但模型可以在前后添加解释。

### FuzzyMatch

`FuzzyMatch` 使用规范化后的 edit distance，允许轻微格式差异。

```yaml
class: evals.elsuite.basic.fuzzy_match:FuzzyMatch
```

适合标点、空白、大小写容易波动的任务，例如短代码片段、格式化输出、轻微拼写差异。

## Model-graded evals: evaluating open-ended outputs

很多 LLM 输出无法用字符串匹配评价：摘要、解释、建议、创意写作、客服回复都属于这种情况。OpenAI Evals 里的 model-graded eval 会让另一个模型根据 rubric 来评估输出。

```yaml
class: evals.elsuite.modelgraded.classify:ModelBasedClassify
args:
  samples_jsonl: summarization/news.jsonl
  eval_type: cot_classify
  modelgraded_spec: summarization_quality
```

`modelgraded_spec` 指向 judge rubric，`cot_classify` 会让 judge 先推理再分类，提升复杂判断的一致性。

常见 model-graded spec 包括：

- `closedqa`：对照 reference 检查事实正确性。
- `humor`：评估回答是否足够幽默。
- `summarization_quality`：检查摘要的简洁度和信息保留。
- `safety`：检查有害内容或不当输出。

团队也可以写自己的 rubric，用来评估品牌语气、法律合规、医学免责声明、客服升级规则等领域标准。

## Running evals: the CLI workflow

OpenAI Evals 的主要交互方式是 CLI。

```bash
# Install
pip install -e ".[evals]"

# Set API key
export OPENAI_API_KEY="..."

# Run an existing eval from the registry
oaieval gpt-4o coding-pythonfunctions

# Run against a custom model
oaieval your-completion-fn your-eval-name

# Run multiple evals in sequence
oaieval gpt-4o-mini coding-pythonfunctions summarization-quality safety-basic
```

结果通常会写入 log file 和 results JSON/JSONL。你可以查看每条样本的输入、输出、得分，也可以读取最终汇总指标。

```bash
# Summary metrics
oaieval --show_usage_stats gpt-4o your-eval

# Export final report
jq '.final_report' results/your-eval-run.jsonl
```

CLI 是优点也是限制。它对工程团队友好，容易接入 CI；但没有 dashboard、run comparison UI、annotation queue 或 dataset management。需要长期协作时，通常要搭配其他平台。

## Writing a custom eval class

当 Match、Includes、FuzzyMatch 和 model-graded eval 都不够时，可以写 custom `Eval` subclass。

```python
from evals.api import CompletionFn
from evals.eval import Eval
from evals.record import RecorderBase


class MyCustomEval(Eval):
    def __init__(self, completion_fns: list[CompletionFn], samples_jsonl: str, *args, **kwargs):
        super().__init__(completion_fns, *args, **kwargs)
        self.samples = self.get_samples()

    def eval_sample(self, sample, rng):
        prompt = sample["input"]
        result = self.completion_fn(prompt=prompt)
        output = result.get_completions()[0]
        score = self.score(output, sample["ideal"])
        self.recorder.record_match(correct=(score > 0.8), expected=sample["ideal"], got=output)

    def run(self, recorder: RecorderBase):
        samples = self.get_samples()
        self.eval_all_samples(recorder, samples)
        events = recorder.get_events("match")
        return {"accuracy": sum(e.data["correct"] for e in events) / len(events)}
```

Custom eval 可以做更复杂的事情：运行代码、调用外部 API 验证事实、做多步骤评分、读取 domain-specific rules，或者把多个指标合成一个 pass/fail gate。

## When OpenAI Evals is the right tool

OpenAI Evals 最适合四类场景。

**1. Model comparison across providers**

如果要比较 GPT-4o、Claude、Gemini、本地模型在同一任务上的表现，用同一套 YAML + JSONL 跑起来，结果更可比。

**2. Regression testing before model upgrades**

模型升级前跑自定义 eval suite，可以捕捉通用 benchmark 看不到的业务回归。把 eval 放在应用代码旁边，也便于 code review 和版本追踪。

**3. Contributing to the community registry**

如果团队发现新的 failure mode 或评测方法，可以贡献到 registry，让社区复用，也让模型开发团队更容易看到这类问题。

**4. Code-first, no-SaaS requirement**

某些团队不能把数据送到第三方 SaaS。OpenAI Evals 可以在自己的环境里运行，只有模型 API 调用是外部依赖。

## Limitations and when to look elsewhere

OpenAI Evals 不适合所有场景。

**Production monitoring**

它没有针对 live production traffic 的连续监控机制。如果你需要追踪线上 traces、latency、cost、failure samples，可以考虑 LangSmith、Arize Phoenix 或类似 observability 工具。

**Team collaboration and annotation**

没有 annotation queue、dataset curation UI、shared dashboard。多人协作和人工标注流程更适合 Braintrust 或 LangSmith。

**Experiment tracking and comparison**

如果你要频繁比较 prompts、datasets、model versions，并需要图形化 diff 和历史趋势，Braintrust、W&B Weave 这类工具更顺手。

**Safety evaluation at scale**

内置 safety spec 只能覆盖一部分需求。大规模 red teaming、jailbreak testing、policy coverage 往往需要 Galileo、Garak、PyRIT 或自建测试集。

**RAG-specific metrics**

OpenAI Evals 没有直接内置 RAGAS 那样的 faithfulness、context relevance、answer relevance 指标。RAG 评测通常需要把它和 RAGAS、DeepEval、Phoenix 等工具组合使用。

实用组合是：OpenAI Evals 做 CI regression benchmark；Braintrust 或 LangSmith 做 dataset management、experiment tracking 和团队协作。

## Key Takeaways

- OpenAI Evals 的核心价值是可复现评测，而不是生产监控。
- YAML spec + JSONL dataset 的格式简单、可版本化、适合 CI。
- 内置评分器能覆盖很多确定性任务；model-graded eval 处理开放式质量判断。
- Custom eval class 是扩展复杂业务评分的入口。
- 当需要可视化协作、持续监控、dataset UI 时，应搭配其他 eval/observability 平台。

## FAQ

**OpenAI Evals 只能评估 OpenAI 模型吗？**

不是。它原生支持 OpenAI completion function，但可以通过 custom completion functions 接入其他模型或本地服务。

**它适合放进 CI 吗？**

适合。尤其是小而稳定的 regression suite。需要注意成本、运行时间和随机性，最好固定模型版本、temperature 和样本集。

**什么时候不用 model-graded eval？**

当答案可以明确判定时，优先用 Match、Includes、FuzzyMatch 或程序化检查。model grading 更灵活，但成本更高，也会引入 judge model 的偏差。

**OpenAI Evals 能替代 Braintrust 或 LangSmith 吗？**

不能完全替代。它更像可复现 benchmark runner；Braintrust、LangSmith、Weave、Phoenix 更偏实验管理、trace、协作和生产观测。

**第一套 eval 应该怎么开始？**

先选 30 到 100 个真实业务样本，定义 pass/fail 标准，用 YAML + JSONL 固化下来。不要一开始追求大而全，先抓最会影响产品质量的失败类型。

## 图片引用

- OpenAI Evals framework — registry structure, YAML eval definitions, and model comparison workflow: https://thegeocommunity.com/images/openai-evals-guide.webp

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/openai-evals-guide/print
- What OpenAI Evals actually is: /blogs/generative-engine-optimization/openai-evals-guide
- The eval registry: structure and community contributions: /blogs/generative-engine-optimization/openai-evals-guide
- YAML eval definition: the core format: /blogs/generative-engine-optimization/openai-evals-guide
- The three built-in eval types: /blogs/generative-engine-optimization/openai-evals-guide
- Model-graded evals: evaluating open-ended outputs: /blogs/generative-engine-optimization/openai-evals-guide
- Running evals: the CLI workflow: /blogs/generative-engine-optimization/openai-evals-guide
- Writing a custom eval class: /blogs/generative-engine-optimization/openai-evals-guide
- When OpenAI Evals is the right tool: /blogs/generative-engine-optimization/openai-evals-guide
- Limitations and when to look elsewhere: /blogs/generative-engine-optimization/openai-evals-guide
- Key Takeaways: /blogs/generative-engine-optimization/openai-evals-guide
- FAQ: /blogs/generative-engine-optimization/openai-evals-guide
- OpenAI Evals GitHub repo: https://github.com/openai/evals
- custom completion functions: https://github.com/openai/evals/blob/main/docs/completion-fns.md
- Red-Teaming LLMs: /blogs/generative-engine-optimization/red-teaming-llm-safety-evaluation
- RAGAS for RAG Evaluation: /blogs/generative-engine-optimization/ragas-rag-evaluation
- LLM Evals Tool Landscape: /blogs/generative-engine-optimization/llm-evals-landscape-comparison
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- completion functions documentation: https://github.com/openai/evals/blob/main/docs/completion-fns.md
- DeepEval pytest-style RAG tests: /blogs/generative-engine-optimization/deepeval-pytest-style-rag-tests
- LLM Evals Tool Landscape: Braintrust vs LangSmith vs Arize vs Galileo: /blogs/generative-engine-optimization/llm-evals-landscape-comparison
- DeepEval and Pytest-Style RAG Tests: Turning Quality into a CI Gate: /blogs/generative-engine-optimization/deepeval-pytest-style-rag-tests
- Braintrust: Production-Grade LLM Evaluation with Datasets, Experiments, and Scoring: /blogs/generative-engine-optimization/braintrust-llm-evaluation
- Explore the Learning Path →: /start
- Red-Teaming LLMs: A Systematic Guide to Safety and Robustness EvaluationRed-teaming is the discipline of deliberately probing LLMs for failu: /blogs/generative-engine-optimization/red-teaming-llm-safety-evaluation
- Weights & Biases Weave: End-to-End LLM Evaluation WorkflowsWeave is Weights & Biases's LLM-native layer for tracing, evaluation, and dataset: /blogs/generative-engine-optimization/weights-biases-weave-llm-evaluation
- Galileo for Hallucination Detection and LLM Evaluation at ScaleGalileo focuses on the hardest part of LLM quality — detecting hallucinations: /blogs/generative-engine-optimization/galileo-hallucination-detection
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
