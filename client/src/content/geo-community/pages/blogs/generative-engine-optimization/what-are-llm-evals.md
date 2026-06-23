---
path: "/blogs/generative-engine-optimization/what-are-llm-evals"
kind: "blog"
title: "What Are LLM Evals? A Complete Guide to Evaluating AI Output Quality"
source_title: "What Are LLM Evals? A Complete Guide to Evaluating AI Output Quality"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/what-are-llm-evals"
author: "Rohit Singh"
date: "11 Apr 2026"
status: "ready"
---
# What Are LLM Evals? A Complete Guide to Evaluating AI Output Quality

每个软件团队都需要 test suite。每个 AI 团队也需要 eval suite。区别在于，LLM 输出不是确定性的，质量也不是只有“对/错”一项。LLM evals 的作用，就是用可重复、可衡量的测试，把 correctness、safety、relevance、format 和 faithfulness 这些要求变成可执行的发布门槛。

![What are LLM evals — complete guide to evaluating AI output quality with pipeline overview](https://thegeocommunity.com/images/what-are-llm-evals.webp)

## 页面摘要

这篇文章是 LLM evals 的完整入门：定义 eval、解释 LLM 为什么需要专门测试、比较 automated evals、LLM-as-judge 和 human evals，拆解一个 eval pipeline 的四个组件，并给出从 10 个高价值 test cases 开始的落地路径。

## 原站章节结构

1. The one-sentence definition
2. Why LLMs specifically need evals
3. The three evaluation approaches
4. Anatomy of an eval: the four components
5. What makes a good test case
6. The eval-deploy loop
7. Common eval mistakes
8. The evals tool landscape
9. Where to start
10. Key Takeaways
11. FAQ

## The one-sentence definition

LLM eval 是一个可重复、可衡量的测试，用来检查 AI system 针对特定 input 生成的 output 是否满足预先定义的质量标准。

这个定义里有三个关键词：

- **Repeatable**：同一测试可以反复运行，并能比较结果。
- **Measurable**：测试会产生 score、pass/fail 或其他可记录信号。
- **Defined standard**：团队提前定义了“好输出”是什么，而不是事后凭感觉判断。

缺少任意一项，都只是临时检查，不是 eval。

## Why LLMs specifically need evals

传统软件大多是确定性的：同样输入得到同样输出。测试只需要验证结果是否等于 expected value。

LLM 是概率系统。同一个 prompt 可能生成不同答案；同一个 model 在 fine-tune、system prompt、temperature 或 provider snapshot 更新后，行为也可能漂移。更重要的是，LLM quality 是多维的：一个答案可以事实正确但格式错误，可以有帮助但不安全，可以相关但包含 hallucination。

四类 failure pattern 让 evals 变成必需品：

**1. Silent quality drift**  
模型供应商会持续更新模型。没有固定版本或没有应用级 eval 时，你可能直到用户投诉才发现核心行为退化。非固定 alias（例如 `gpt-4`）可能随时间指向不同 snapshot，而 `gpt-4-0613` 这类 pinned version 才更适合做稳定对比。

**2. Prompt regression**  
system prompt 改一句话，可能影响几十个场景。eval dataset 把关键 query 变成 regression tests，确保上线前发现退化。

**3. Retrieval context mismatch**  
RAG 系统里 retriever 和 generator 相互耦合。embedding model、chunk size、文档批次一变，模型看到的 context 就变。RAG evals 需要测完整链路的 faithfulness 和 relevance，例如 [RAGAS for RAG evaluation](/blogs/generative-engine-optimization/ragas-rag-evaluation)。

**4. Distributional shift**  
用户问题会变化。Q1 的 test set 可能覆盖不了 Q3 的真实 query。eval dataset 需要维护，而不是一次性资产。

## The three evaluation approaches

LLM eval 大致分为三类，各自有成本、速度和准确性的取舍。

### Automated evals (rule-based)

Automated evals 使用确定性 scoring functions：输出是否包含必需字符串，是否是合法 JSON，是否少于 500 tokens，是否匹配 regex，是否包含 citation 字段。

**Best for**：format validation、constraint checking、exact-match questions、structured output verification。  
**Limitations**：无法判断复杂语义质量、开放式答案或细腻正确性。  
**Cost**：几乎为零，通常毫秒级运行。

### Model-based evals (LLM-as-judge)

Model-based evals 用第二个 LLM 来评估主模型输出。judge model 会收到 rubric，并按 helpfulness、faithfulness、safety、relevance 等标准打分。

MT-Bench 和 Chatbot Arena 的研究显示，在 pairwise preference task 上，GPT-4 as judge 与人类评分者约有 80-85% 一致性，接近人类之间的一致水平。

**Best for**：开放式生成质量、语义相关性、需要判断的 nuanced criteria。  
**Limitations**：会继承 judge model 的偏差，例如 verbosity bias、position bias、self-enhancement bias；也会增加成本与延迟。  
**Cost**：按 judge model 和输出长度不同，约为 $0.001-$0.01 per eval。

### Human evals

Human evaluation 使用人工标注者按 rubric 评分。它是高准确性 gold standard，尤其适用于安全评估、新领域失败模式、校准 LLM judge。

**Best for**：safety evaluation、novel domains、calibrating automated eval accuracy、high-stakes decisions。  
**Limitations**：贵、慢、需要标注者培训才能保证一致性。  
**Cost**：约 $0.10-$2.00 per eval。

生产系统通常组合三者：automated evals 跑每次 commit；LLM judges 跑代表性样本；human review 周期性校准和发现 edge cases。

## Anatomy of an eval: the four components

任何 eval 都有四个组件：

**1. Test dataset**  
一组输入，必要时带 expected output 或 expected properties。dataset 是质量合同，定义“系统应当处理哪些情况”。它应该像代码一样 versioned，不能悄悄修改。

**2. LLM pipeline under test**  
被评估的系统：prompt、model、RAG chain、agent 或完整应用。每次 pipeline 变化都应触发 eval suite。

**3. Scoring function**  
把 `(input, output)` 转成 score 的机制。可以是 deterministic checker、LLM judge rubric，也可以是 human annotation rubric。

**4. Threshold**  
最低可接受分数或 pass rate。低于 threshold 时阻止发布。threshold 是产品和风险决策，要在运行 eval 之前定义，而不是看到结果后再调。

## What makes a good test case

test case 是 eval 的基本单元。最少包含一个 input 和一个 expected output property，不一定要求精确字符串匹配。

强 test case 具备五个特点：

- **Grounded in real usage**：来自真实 query logs、support tickets、user interviews。工程师写的样例有用，但往往覆盖不了真实意图。
- **Covers edge cases explicitly**：包含 ambiguous queries、multi-step questions、out-of-scope requests、adversarial inputs。
- **Paired with specific success criteria**：定义必须包含哪些事实、不能声称什么、格式约束是什么、是否需要 citation。
- **Labeled for failure mode**：按 hallucination、format failure、safety violation、retrieval miss 等分类，方便后续分析。
- **Versioned and reviewed**：test case 是产品资产，变更应经过 review。

Stanford CRFM 的 HELM benchmark 用 42 个 evaluation scenarios 评估 30 个模型，展示了 coverage breadth 的重要性。只看单一 metric 或少量 clean examples，会让团队过度自信。

## The eval-deploy loop

Evals 不是一次性检查，而是 AI product 的核心开发循环：

- 从真实 queries 和已知 failure modes 建 eval dataset。
- 对当前 pipeline 跑 evals，并保存结果快照。
- 检查低分样例，而不是只看 aggregate score。
- 修根因：retriever config、prompt、model choice、chunking strategy 或 guardrail。
- 重跑 evals，确认修复没有引入新 regression。
- 用 threshold gate deployment，不达标就阻止发布。
- 从 production 收集新 failure，再加入 dataset。

这个循环会让团队发布更快，而不是更慢。因为质量问题在小时级被发现，不必等用户或客户几天后反馈。CI gate 的实现可参考：[DeepEval pytest-style RAG tests](/blogs/generative-engine-optimization/deepeval-pytest-style-rag-tests)

## Common eval mistakes

**Building evals reactively**  
最常见错误是事故后才补 eval。这样建立的 suite 通常只覆盖已经发生的 failure，而不是完整风险分布。上线前建立 evals，会迫使团队系统思考产品可能在哪些真实场景失败。

**Using a single aggregate score**  
一个总分会隐藏问题类型。faithfulness 下降和 relevance 下降是不同问题，应该拆分指标追踪。

**Testing only happy-path inputs**  
干净、清晰、友好的 query 会让系统看起来都不错。真实世界有歧义、多轮、省略、敌意输入和越界请求。

**Ignoring dataset staleness**  
Q1 的 eval dataset 很可能覆盖不了 Q2 新功能。dataset 应按周期更新，或在新功能上线时触发更新。

**Conflating eval with fine-tuning**  
eval 用来衡量质量，fine-tuning 用来改变模型。不要把 eval dataset 直接拿去 fine-tune，否则分数会虚高，但真实泛化未必提升。

## The evals tool landscape

不同工具覆盖 eval pipeline 的不同层。完整比较可看：[LLM Evals Tool Landscape](/blogs/generative-engine-optimization/llm-evals-landscape-comparison)

| Tool | Best for | Open source |
| --- | --- | --- |
| DeepEval | pytest-style CI gates、RAG tests | Yes |
| RAGAS | RAG faithfulness 和 relevance metrics | Yes |
| Promptfoo | regression testing、model comparison | Yes |
| Braintrust | experiment tracking、dataset management | No (hosted) |
| LangSmith | LangChain apps 的 tracing + eval | No (hosted) |
| Arize Phoenix | open-source observability、span-level tracing | Yes |
| OpenAI Evals | model comparison、registry benchmarks | Yes |

选工具取决于 stack、team size 和 eval maturity。多数团队可以从 open-source option 开始，复杂度上升后再加入 hosted platform。

## Where to start

第一次搭 eval suite 时，不要一上来做“完整平台”。从小而高价值的测试开始：

1. 选产品里最常见的 10 个用户 query。
2. 每个 query 写一条具体 success criterion。不要写“good answer”，要写“必须包含 X，不能声称 Y”。
3. 用当前 pipeline 跑 10 条 query，并保存 output。
4. 至少为每条 query 的一个标准写 scoring function，可以先从字符串包含、JSON schema 或格式检查开始。
5. 设定 passing threshold，并把它接进 CI。

这就已经是一个可工作的 eval suite。之后根据真实失败模式扩展，而不是凭空追求“看起来全面”。下一步可读：[The LLM Eval Metrics Taxonomy](/blogs/generative-engine-optimization/llm-eval-metrics-taxonomy)

## Key Takeaways

- LLM evals 是为概率 AI 系统定义“工作正常”的可重复测试，作用类似软件测试套件。
- automated evals、LLM-as-judge 和 human evals 分别覆盖不同失败模式，生产系统通常需要组合使用。
- 每个 eval 都有四个核心组件：test dataset、pipeline under test、scoring function 和 deployment threshold。
- eval-deploy loop 是 AI 产品的开发循环，它帮助团队更快、更稳地发布。
- 先从 10 个高价值 test cases 和一条具体 scoring function 开始，再逐步扩展。

## Related reading

- [RAGAS for RAG evaluation](/blogs/generative-engine-optimization/ragas-rag-evaluation)
- [DeepEval pytest-style RAG tests](/blogs/generative-engine-optimization/deepeval-pytest-style-rag-tests)
- [LLM Evals Tool Landscape](/blogs/generative-engine-optimization/llm-evals-landscape-comparison)
- [The LLM Eval Metrics Taxonomy](/blogs/generative-engine-optimization/llm-eval-metrics-taxonomy)
- [Why LLM Evals Matter](/blogs/generative-engine-optimization/why-llm-evals-matter)
- [Human vs LLM-as-Judge](/blogs/generative-engine-optimization/human-vs-llm-judge-evaluation)
- [Red-Teaming LLMs](/blogs/generative-engine-optimization/red-teaming-llm-safety-evaluation)

## 图片引用

- What are LLM evals — complete guide to evaluating AI output quality with pipeline overview: https://thegeocommunity.com/images/what-are-llm-evals.webp

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/what-are-llm-evals/print
- The one-sentence definition: /blogs/generative-engine-optimization/what-are-llm-evals
- Why LLMs specifically need evals: /blogs/generative-engine-optimization/what-are-llm-evals
- The three evaluation approaches: /blogs/generative-engine-optimization/what-are-llm-evals
- Anatomy of an eval: the four components: /blogs/generative-engine-optimization/what-are-llm-evals
- What makes a good test case: /blogs/generative-engine-optimization/what-are-llm-evals
- The eval-deploy loop: /blogs/generative-engine-optimization/what-are-llm-evals
- Common eval mistakes: /blogs/generative-engine-optimization/what-are-llm-evals
- The evals tool landscape: /blogs/generative-engine-optimization/what-are-llm-evals
- Where to start: /blogs/generative-engine-optimization/what-are-llm-evals
- Key Takeaways: /blogs/generative-engine-optimization/what-are-llm-evals
- FAQ: /blogs/generative-engine-optimization/what-are-llm-evals
- model versioning documentation: https://platform.openai.com/docs/models
- RAGAS for RAG evaluation: /blogs/generative-engine-optimization/ragas-rag-evaluation
- MT-Bench and Chatbot Arena (Zheng et al., 2023): https://arxiv.org/abs/2306.05685
- HELM benchmark (Holistic Evaluation of Language Models): https://crfm.stanford.edu/helm/
- DeepEval pytest-style RAG tests: /blogs/generative-engine-optimization/deepeval-pytest-style-rag-tests
- LLM Evals Tool Landscape: /blogs/generative-engine-optimization/llm-evals-landscape-comparison
- DeepEval: https://docs.confident-ai.com/
- RAGAS: https://docs.ragas.io/
- Promptfoo: https://www.promptfoo.dev/
- Braintrust: https://www.braintrust.dev/
- LangSmith: https://smith.langchain.com/
- Arize Phoenix: https://phoenix.arize.com/
- OpenAI Evals: https://github.com/openai/evals
- The LLM Eval Metrics Taxonomy: /blogs/generative-engine-optimization/llm-eval-metrics-taxonomy
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- Red-Teaming LLMs: /blogs/generative-engine-optimization/red-teaming-llm-safety-evaluation
- Why LLM Evals Matter: The Hidden Cost of Shipping AI Without Measuring Quality: /blogs/generative-engine-optimization/why-llm-evals-matter
- The LLM Eval Metrics Taxonomy: Faithfulness, Relevance, Safety, and Beyond: /blogs/generative-engine-optimization/llm-eval-metrics-taxonomy
- Human vs LLM-as-Judge: When to Use Each and When to Combine Them: /blogs/generative-engine-optimization/human-vs-llm-judge-evaluation
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
