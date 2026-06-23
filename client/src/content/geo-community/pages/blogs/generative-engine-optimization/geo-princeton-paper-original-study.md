---
path: "/blogs/generative-engine-optimization/geo-princeton-paper-original-study"
kind: "blog"
title: "The Original GEO Paper: What Princeton and IIT Delhi Actually Found (and What It Means for Your Content)"
source_title: "The Original GEO Paper: What Princeton and IIT Delhi Actually Found (and What It Means for Your Content)"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/geo-princeton-paper-original-study"
author: "Rohit Singh"
date: "17 Feb 2026"
status: "ready"
---
# The Original GEO Paper: What Princeton and IIT Delhi Actually Found (and What It Means for Your Content)

如果你在 SEO 或 AI visibility 圈子里听过“Princeton GEO paper”，通常指的就是这篇。它在 2023 年 11 月发布于 arXiv，后发表于 KDD 2024，正式提出 Generative Engine Optimization 这个术语，并用 10,000 个 query 测试了 9 种内容优化策略。

![The Original GEO Paper: What Princeton and IIT Delhi Actually Found](https://thegeocommunity.com/images/geo-princeton-paper-original-study.webp)

## 页面摘要

这篇文章拆解 Princeton/IIT Delhi 的原始 GEO 论文 arXiv:2311.09735：研究要解决什么问题、实验如何设计、9 种优化策略分别是什么、哪些方法把 AI visibility 提升到 30-40%，哪些方法几乎无效，以及为什么小网站可能从 GEO 中获益更大。

## 原站章节结构

1. Is this the Princeton paper everyone talks about?
2. What problem were they solving?
3. How they set up the experiment
4. The 9 optimization strategies they tested
5. What the results actually showed
6. Domain-specific findings
7. The democratization finding: small sites benefit most
8. What didn't work
9. Combining strategies
10. What this means for practitioners today

## Key Takeaways

- 这篇 2023 年 Princeton/IIT Delhi 合作论文正式提出 GEO，并在多种 generative engine 上测试 10,000 个 query。
- 添加可信来源引用、统计数据和权威 quote，能把 AI answer 中的 visibility 提升到约 30-40%。
- 只做“更有说服力、更流畅”的语言包装效果有限，甚至 persuasive fluff 可能伤害结果。
- 小型或低权威网站从 GEO 策略中获得的相对提升更大，论文称之为 democratization effect。
- 最强策略不是单点技巧，而是 fluent writing、specific statistics、credible citations 和 direct quotations 的组合。

## Is this the Princeton paper everyone talks about?

是，也不完全是。论文确实有 Princeton University 作者 Vishvak Murahari，也有 IIT Delhi 作者 Pranjal Aggarwal，以及其他作者。因此更准确的说法是 Princeton/IIT Delhi collaboration，而不是单纯的 Princeton study。

这篇论文的正式名称是 **GEO: Generative Engine Optimization**，arXiv 编号是 `2311.09735`。它后来发表于 KDD 2024，也就是 ACM 的旗舰数据挖掘会议之一。这给 GEO 这个概念提供了最早的一批严肃实验基础。

## What problem were they solving?

论文从一个三方问题开始：传统搜索引擎里，用户得到信息，搜索引擎展示结果和广告，内容创作者通过被索引和排名获得点击流量。

Generative engines 打破了这个交换。ChatGPT、Perplexity、Google AI Overviews 这类系统直接合成答案后，用户可能不再点击原网站。用户得到了更快答案，引擎提升了体验，但内容创作者仍要承担生产高质量内容的成本，却不一定获得流量回报。

论文把这称为 creator economy problem，并提出问题：内容创作者能否通过优化内容，提高自己在生成式答案中的 visibility？

他们给出的框架就是 GEO：不是优化蓝色链接排名，而是优化内容在 generative engine response 中被检索、引用、展示和影响答案的概率。

## How they set up the experiment

研究者构建了 GEO-bench：一个覆盖 25 个领域、共 10,000 个 queries 的 benchmark。领域包括 Arts、Health、Science、Law & Government、History、Games 等。

query 来自 9 个来源：

- MS MARCO 和 ORCAS-1：真实 Bing search queries。
- Natural Questions：真实 Google queries。
- AllSouls：Oxford essay questions，需要多来源推理。
- LIMA：高难推理问题。
- Davinci-Debate：辩论型问题。
- Perplexity.ai Discover：真实趋势问题。
- ELI5：复杂问题的简单解释。
- GPT-4 generated queries：补充多样性。

每个 query 取 Google top 5 search results 作为 source pool。然后研究者随机选择其中一个 source website，应用某种 GEO method，观察该 source 在生成式答案里的 visibility 是否提高。

visibility 用两个指标衡量：

- **Position-Adjusted Word Count (PAWC)**：答案里有多少词引用该 source，并按引用位置加权。越早出现权重越高，类似传统搜索点击率的衰减曲线。
- **Subjective Impression**：由 LLM 评估 relevance、influence、uniqueness、click probability 和 cited material diversity。

主实验使用一个基于 GPT-4 的模拟 RAG 系统，模拟 BingChat 和 Perplexity 这类产品的工作方式；研究者也在 Perplexity.ai 上做了真实环境验证。理解 RAG 里的 retrieve 和 cite，可参考：[Reranking for RAG: Cross-Encoders vs LLM Rerankers](/blogs/reranking-cross-encoder-llm-reranker)

## The 9 optimization strategies they tested

论文测试了 9 种 GEO methods，可以分成两类。

### Group 1: Presenting existing content differently

这些方法不需要引入新研究或外部材料，只改变已有内容的表达与结构。

| Method | What it does | Why it matters |
| --- | --- | --- |
| Authoritative | 把内容改写得更有信心、更具说服力 | 试图向生成式引擎传递可信度 |
| Easy-to-Understand | 简化语言、降低阅读复杂度 | 更容易被模型抽取和引用 |
| Fluency Optimization | 提升语法流畅度和行文质量 | 影响 subjective impression |
| Unique Words | 加入更有区分度的词汇 | 减少重复，增加语义丰富度 |
| Technical Terms | 加入领域术语 | 暗示 subject-matter expertise |

这些属于低成本、易执行的改写方式。任何内容团队都可以做，但它们不一定带来最强效果。

### Group 2: Adding new content

这类方法需要引入新材料：数据、来源、引用、证据。

| Method | What it adds | Why it matters |
| --- | --- | --- |
| Statistics Addition | 用具体数字替代泛泛描述 | 生成式引擎更容易验证和引用 |
| Cite Sources | 加入可信外部来源引用 | 表明内容建立在可核验材料上 |
| Quotation Addition | 加入可信来源的直接 quote | 增加 authenticity 和外部权威 |
| Keyword Stuffing | 增加 query-relevant keywords | 作为传统 SEO control，结果显示基本无效 |

论文最有价值的洞察是：添加可验证证据的 Group 2 通常强于单纯表达优化；但把两类方法组合起来效果最好。

## What the results actually showed

头条结论是：GEO methods 最多能把 generative engine response 中的 visibility 提升约 40%。

表现最强的三类方法是：

**1. Cite Sources**  
PAWC 提升约 30-40%，Subjective Impression 提升约 15-30%。加入可信来源是最稳定的信号。原站解释为：RAG 系统本质上在寻找可 grounding 的证据，已经带有外部引用的内容更像可验证证据。

**2. Quotation Addition**  
PAWC 同样可达约 30-40%，Subjective Impression 提升约 15-30%。直接 quote 与 citation 机制类似，都向模型传递“这不是作者自说自话，而是有外部权威支撑”的信号。

**3. Statistics Addition**  
把 “many studies show” 这种模糊描述改成具体数据，例如 “a 2022 meta-analysis of 47 studies found...” 显著提升 visibility。生成式引擎偏好具体、可核验的数据点。

Fluency Optimization 和 Easy-to-Understand 也有 15-30% 的提升，说明生成式引擎仍奖励清晰、流畅、可抽取的内容。但仅有文风不够，证据更关键。

## Domain-specific findings

论文很实用的一部分是 domain breakdown：同一个 GEO strategy 在不同领域效果不同。

- Authoritative tone 更适合 debate-style questions 和 historical content，因为这些领域里 persuasive framing 更自然。
- Cite Sources 对 factual questions 最有效，citation 给生成式引擎提供 grounding。
- Statistics Addition 在 Law & Government 和 Opinion 中影响更强，因为这些场景更看重数据化证据。
- Quotation Addition 在 People & Society、Explanation、History 中表现更好，因为 personal narrative 和历史叙述更受 direct quote 加持。

实践含义：GEO 不是一套万能动作。你要按内容领域、query type 和用户意图选策略。

## The democratization finding: small sites benefit most

这是论文里最重要但经常被低估的发现。

研究者模拟“所有 source websites 同时优化”的世界，发现低排名网站获得的相对收益更大。使用 Cite Sources 方法时：

- 第 5 名网站 visibility 增加约 115.1%。
- 第 1 名网站相对 visibility 下降约 30.3%，因为低排名网站追了上来。

原因是传统搜索大量依赖 backlinks、domain authority、历史流量等信号，这些都偏向大站。生成式引擎则更直接评估内容质量：如果一个小网站的文章有更好的 citations、statistics 和 quotes，它可以在 answer synthesis 中与大站竞争。

论文把这称为 GEO 的 democratizing potential。对独立创作者和小品牌来说，这比传统 SEO 更有机会突破权威壁垒。

## What didn't work

**Keyword Stuffing** 几乎没有改善。这是关键结论。传统早期 SEO 依赖 exact keyword frequency，但 generative engines 更看语义、证据和可引用内容。把 query terms 塞进页面，不会让它更值得被引用。

**Authoritative tone alone** 在全 benchmark 上也没有显著提升，虽然它在部分领域有效。生成式引擎对“看起来很有信心”的写法相对鲁棒，更关注内容实质，而不是自信语气。

这提醒内容团队：不要把 GEO 误解为“把文章写得更像专家”。如果没有数据、来源、quote 和结构，只是换一种强势语气，效果很有限。

## Combining strategies

论文还测试了四种强策略的两两组合：Cite Sources、Fluency Optimization、Statistics Addition、Quotation Addition。

最佳组合是 **Fluency Optimization + Statistics Addition**，比任何单一策略都高出 5.5% 以上。

另一个有趣发现是：Cite Sources 与其他方法组合时收益更大，平均搭配提升约 31.4%。这说明 citation 像 multiplier：它能放大 statistics 和 quotes 的可信度。

实践结论很简单：不要只选一个 tactic。高表现内容通常同时具备流畅表达、具体数据、可信来源和可引用 quote。

## What this means for practitioners today

这篇论文发表于 2023 年，主实验使用模拟 RAG 系统。2026 年的 AI search landscape 已经复杂得多：AI Overviews、ChatGPT Search、Perplexity、Claude、Gemini 的检索和引用机制都不一样。最新多引擎比较可看：[How to Dominate AI Search](/blogs/generative-engine-optimization/geo-dominate-ai-search-comparative-study)

但核心原则仍很稳：

应该做：

- 添加来自学术论文、官方报告、行业数据等可信外部来源的 citations。
- 用具体数字替代模糊 qualitative claims。
- 加入权威来源的 direct quotes。
- 提升语言 fluency 和 readability。
- 按内容领域选择策略，Law & Government、History、Opinion 的最佳动作并不完全相同。
- 确保 AI bots 能实际抓取内容，可参考 [robots.txt for AI Bots](/blogs/robots-txt-ai-bots) 和 [log file analysis](/blogs/log-file-analysis-ai-bots-geo)。

不值得投入：

- Keyword stuffing 或 keyword density optimization。
- 只把内容改得更“权威”但不增加实质。
- 追求 technical term density，却没有真实内容质量。

更大的心智模型是：GEO 是黑箱优化。你看不到 generative engine 内部权重，也无法完全反推检索排序。但你可以让内容成为更好的证据：更可验证、更具体、更清晰、更容易引用。

## Citation

Aggarwal, P., Murahari, V., Rajpurohit, T., Kalyan, A., Narasimhan, K., & Deshpande, A. (2024). GEO: Generative Engine Optimization. Proceedings of the 30th ACM SIGKDD Conference on Knowledge Discovery and Data Mining (KDD '24). arXiv:2311.09735.

## Related reading

- [arXiv:2311.09735](https://arxiv.org/abs/2311.09735)
- [AEO vs Generative Engine Optimization (GEO)](/blogs/aeo-vs-geo-microsoft)
- [Generative Engine Optimization (GEO) vs SEO: How the User Funnel Has Changed](/blogs/geo-vs-seo-user-funnel)
- [E-GEO Paper: What It Finds and What It Means for Generative Engine Optimization in E-commerce](/blogs/e-geo-paper-ecommerce-geo)
- [How to Dominate AI Search: The First Comparative Study of GEO](/blogs/generative-engine-optimization/geo-dominate-ai-search-comparative-study)

## 图片引用

- The Original GEO Paper: What Princeton and IIT Delhi Actually Found: https://thegeocommunity.com/images/geo-princeton-paper-original-study.webp

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- View Full Learning Path →: /start
- 1The Original GEO Paper: What Princeton & IIT Delhi Actually Found: /blogs/generative-engine-optimization/geo-princeton-paper-original-study
- 2How to Dominate AI Search: The First Comparative Study of GEO Across All Major Engines: /blogs/generative-engine-optimization/geo-dominate-ai-search-comparative-study
- 3How to Use Google's LangExtract Library to Improve Your GEO: /blogs/generative-engine-optimization/langextract-gemini-generative-engine-optimization
- 4How the Architecture of Embedding Models Determines Whether AI Retrieves Your Content: /blogs/generative-engine-optimization/embedding-architecture-ai-retrieval
- 5FeatGEO: Why the Original 9 GEO Tactics Are Failing on Modern AI Engines: /blogs/generative-engine-optimization/feat-geo-paper-feature-level-optimization
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/geo-princeton-paper-original-study/print
- Is this the Princeton paper everyone talks about?: /blogs/generative-engine-optimization/geo-princeton-paper-original-study
- What problem were they solving?: /blogs/generative-engine-optimization/geo-princeton-paper-original-study
- How they set up the experiment: /blogs/generative-engine-optimization/geo-princeton-paper-original-study
- The 9 optimization strategies they tested: /blogs/generative-engine-optimization/geo-princeton-paper-original-study
- What the results actually showed: /blogs/generative-engine-optimization/geo-princeton-paper-original-study
- Domain-specific findings: /blogs/generative-engine-optimization/geo-princeton-paper-original-study
- The democratization finding: small sites benefit most: /blogs/generative-engine-optimization/geo-princeton-paper-original-study
- What didn't work: /blogs/generative-engine-optimization/geo-princeton-paper-original-study
- Combining strategies: /blogs/generative-engine-optimization/geo-princeton-paper-original-study
- What this means for practitioners today: /blogs/generative-engine-optimization/geo-princeton-paper-original-study
- arXiv: https://arxiv.org/abs/2311.09735
- KDD '24: https://kdd2024.kdd.org/
- ChatGPT: https://chatgpt.com/
- Perplexity: https://www.perplexity.ai/
- MS MARCO: https://microsoft.github.io/msmarco/
- Natural Questions: https://ai.google.com/research/NaturalQuestions
- Perplexity.ai: https://www.perplexity.ai/
- Reranking for RAG: Cross-Encoders vs LLM Rerankers: /blogs/reranking-cross-encoder-llm-reranker
- Claude: https://claude.ai/
- Gemini: https://gemini.google.com/
- How to Dominate AI Search: The First Comparative Study of GEO: /blogs/geo-dominate-ai-search-comparative-study
- robots.txt for AI Bots: /blogs/robots-txt-ai-bots
- log file analysis: /blogs/log-file-analysis-ai-bots-geo
- arXiv:2311.09735: https://arxiv.org/abs/2311.09735
- AEO vs Generative Engine Optimization (GEO) (Microsoft's framing): /blogs/aeo-vs-geo-microsoft
- Generative Engine Optimization (GEO) vs SEO: How the User Funnel Has Changed: /blogs/geo-vs-seo-user-funnel
- E-GEO Paper: What It Finds and What It Means for Generative Engine Optimization (GEO) in E-commerce: /blogs/e-geo-paper-ecommerce-geo
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- How to Dominate AI Search: The First Comparative Study of GEO Across All Major EnginesThe first study comparing all major AI engines reveals: /blogs/generative-engine-optimization/geo-dominate-ai-search-comparative-study
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
