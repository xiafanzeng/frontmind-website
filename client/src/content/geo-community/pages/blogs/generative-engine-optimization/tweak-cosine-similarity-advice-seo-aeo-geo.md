---
path: "/blogs/generative-engine-optimization/tweak-cosine-similarity-advice-seo-aeo-geo"
kind: "blog"
title: "My take on “tweak cosine similarity” advice: what I agree with — and where I think SEO/AEO/Generative Engine Optimization (GEO) will go wrong"
source_title: "My take on “tweak cosine similarity” advice: what I agree with — and where I think SEO/AEO/Generative Engine Optimization (GEO) will go wrong"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/tweak-cosine-similarity-advice-seo-aeo-geo"
author: "Rohit Singh"
date: "27 Jan 2026"
status: "ready"
---
# My take on “tweak cosine similarity” advice: what I agree with — and where I think SEO/AEO/Generative Engine Optimization (GEO) will go wrong

Cosine similarity 确实影响 embedding retrieval：如果内容没有被检索出来，它就不可能被引用。但把 GEO 简化成“调高 cosine similarity”会把很多团队带进错误方向。真实 RAG 和 AI answer pipeline 往往包含 query fan-out、diversity selection、redundancy penalty、reranker 和 LLM judge；它们奖励的是有用证据，而不只是向量距离更近。

![My take on tweak cosine similarity advice: what I agree with — and where I think SEO/AEO/GEO will go wrong](https://thegeocommunity.com/images/tweak-cosine-similarity-advice-seo-aeo-geo.webp)

这篇文章的立场很克制：承认 embedding 和 chunking 很重要，但反对把它变成新的“SEO 操纵旋钮”。AEO/GEO 的长期方向，不是让内容看起来更像 prompt，而是让内容成为更清晰、更独特、更可验证、更能通过 reranker 的证据。

## What I agree with

先说同意的部分。向量检索是真实存在的，cosine similarity 也是真实机制。内容结构、chunking、术语一致性和事实密度，都会影响一个 passage 是否被检索出来。

### 1) Retrieval really does care about vector similarity

在 embedding + nearest-neighbor retrieval 中，query 和 document chunk 会被编码成向量，系统用 cosine similarity 或 normalized dot product 寻找相近内容。

```txt
cos(theta) = (q · d) / (||q|| ||d||)
```

如果你的内容从不进入 top-k retrieval，就不会进入后续答案生成，也不可能被引用。所以“检索前置”这个判断是对的。

### 2) Chunking and structure can improve retrieval

chunking 和结构也确实重要。一个 chunk 如果同时混合定义、案例、价格、历史背景和 CTA，embedding 会变得模糊。相反，一个围绕单一事实或单一意图写清楚的 chunk，更容易匹配相关 query。

这不是在“作弊”，而是在帮助系统隔离证据。好的 chunk 应该做到：

- 只回答一个明确问题。
- 有足够上下文可以独立理解。
- 包含实体、范围、条件和事实。
- 不把多个无关主题揉在一起。

这种结构会自然提高相关性，因为内容真的更相关。

### 3) This is bigger than SEO — it’s about evidence selection

AEO/GEO 不是 SEO 改名。传统 SEO 很多时候优化点击路径，而 AI answer surface 优化的是 evidence selection：哪些内容可以被拿来支撑回答。

这意味着内容要在压缩环境下仍然有用。模型需要把多个来源压缩成一段答案，留下来的通常是清楚、可引用、可验证、边界明确的内容。

## Where I think the direction goes wrong

问题出在“tweak cosine similarity”这个框架。它会让人误以为只要把页面向某个 query vector 靠近，就能赢。现实比这复杂得多。

### 1) People will optimize one cosine, but reality is a distribution

真实系统里，用户 query 不是一个固定字符串。LLM pipeline 常常会做 query expansion、multi-query retrieval 或 fan-out。一个问题可能被改写成多个检索方向。

所以你的目标不是最大化某一个 prompt 的 cosine，而是在一组 query distribution 中保持稳定表现。如果你为了一个截图 prompt 过度调优内容，可能会降低其他 fan-out query 下的平均表现。

这和传统 SEO 过度优化单个关键词很像：短期看某个 query 变好，长期看覆盖面变窄。

### 2) Increasing cosine can reduce distinctiveness (and retrieval is relative)

Vector retrieval 是 top-k 竞争，不是超过某个绝对阈值就够了。你和所有候选 chunk 一起被排序。

如果大家都开始“cosine tweaking”，内容会越来越像：同样的术语、同样的句式、同样的定义、同样的品牌句子。结果是 distinctiveness 下降，系统很难判断谁提供了真正独特证据。

在相对检索里，变得更像查询并不一定等于更有竞争力。你可能只是变得和一堆泛化内容一样。

### 3) Modern pipelines penalize redundancy (MMR-style selection)

很多检索系统不会只取 cosine 最高的若干 chunk，而会同时考虑相关性和多样性。MMR-style selection 的思想是：选出的内容既要相关，也不要彼此重复。

简化公式可以理解为：

```txt
score(d) = lambda * relevance(q, d) - (1 - lambda) * redundancy(d, selected)
```

如果你的页面因为 cosine stuffing 变得和其他页面高度重复，可能会被 redundancy penalty 压下去。系统不需要十段说法近乎一样的内容，它需要覆盖不同证据角度。

### 4) Even if you win retrieval, you can lose reranking

很多现代 pipeline 有两阶段：先用 embedding retrieval 找候选，再用 cross-encoder、LLM reranker 或 judge 重新排序。第一阶段看向量距离，第二阶段更像“这个 chunk 是否真的帮助回答问题”。

Cosine manipulation 可能让你进入候选集，但 reranker 会看更深的东西：是否具体，是否有证据，是否回答 query，是否重复，是否可信，是否有清楚实体和数字。

所以你可能赢了 retrieval，却输在 reranking。

### 5) “Cosine tweaking” encourages the wrong SEO mindset

最危险的是心态。SEO 行业很容易把任何新机制变成可操纵指标：关键词密度、标题公式、schema 堆叠、现在又可能变成 cosine tweaking。

但 GEO 的目标不是调一个旋钮，而是在不确定检索和答案生成环境中成为最好的证据。把注意力放在“看起来更相似”，会诱导内容变得重复、泛化、缺少真实信息增量。

## What I think the better direction is for SEO/AEO/Generative Engine Optimization (GEO)

更好的方向不是忽略 embedding，而是用结构帮助检索，用证据通过 reranking。

### 1) Optimize for evidence quality, not similarity hacks

一个 chunk 应该像可被直接引用的证据。它需要包含：

- 清楚 claim。
- 实体和范围。
- 数据、例子或来源。
- 限制条件。
- 与相近概念的区别。

如果一个智能 grader 读完这个 chunk，会认为它能支撑答案，那它才有长期价值。

### 2) Build coverage, not overfit

不要只写一个 query 的完美答案。围绕主题建立覆盖：定义、比较、适用场景、反例、步骤、FAQ、指标、限制、证据来源。

这样做会自然提高 query distribution 下的期望相似度，因为你的内容覆盖了更多真实意图，而不是过拟合某个 phrasing。

### 3) Make your chunks reranker-proof

Reranker-proof 的 chunk 不是堆关键词，而是经得起二次判断：

- 能独立回答一个问题。
- 没有夸张营销话术。
- 具体到足以和竞品区分。
- 有明确事实和上下文。
- 不和页面其他 chunk 重复。

如果 chunk 只是“我们提供领先的 AI SEO 解决方案”，它可能和 query 很近，但几乎没有证据价值。

### 4) Use structure as a “retrieval assist,” not a manipulation tool

结构化内容是 retrieval assist。标题、列表、表格、FAQ、definitions、schema、internal links 都能帮助机器理解内容。但它们的目的应该是清晰表达，不是操纵。

例如把一段长文拆成“定义”“适用场景”“不适用场景”“证据”“下一步”，会让人和机器都更容易使用。这是好结构。把同一句 query 变体重复塞进每个段落，是坏结构。

## My conclusion

我同意技术前提：embedding、cosine similarity 和 chunking 都重要。问题是“tweak cosine similarity for brands”这个表达容易让团队走偏。

真实 AI answer pipeline 不止看一个 cosine。它看 query fan-out、retrieval distribution、chunk diversity、reranker judgment、证据质量和用户反馈。过度优化向量相似度，可能导致泛化、重复、distinctiveness 下降和 reranker 失败。

GEO 会奖励那些成为最好证据的品牌，而不是最会让内容看起来像 prompt 的品牌。更好的工作是提高 evidence density、覆盖真实意图、写出可独立引用的 chunk，并让结构服务于理解。

## About the author

Rohit Singh 是 The GEO Community 的作者与维护者，关注 GEO、AI answer engines、RAG、retrieval 和内容证据质量。这个中文复刻版保留原站结构、图片和链接，方便后续继续扩展实验与案例。

## Continue your learning journey

下一步可以阅读 companion experiment：Cosine Similarity "Tweaking" Can Backfire，它用小实验展示两阶段 reranker 如何改变初始 cosine retrieval 的结果。也可以继续读 AEO vs GEO 和 GEO vs SEO user funnel，理解为什么 evidence selection 正在替代单纯排名思维。

## 图片引用

- My take on tweak cosine similarity advice: what I agree with — and where I think SEO/AEO/GEO will go wrong: https://thegeocommunity.com/images/tweak-cosine-similarity-advice-seo-aeo-geo.webp

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/tweak-cosine-similarity-advice-seo-aeo-geo/print
- Cosine Similarity "Tweaking" Can Backfire: A Small Experiment with a Real Reranker: /blogs/cosine-similarity-tweaking-backfire-reranker-experiment
- AEO vs Generative Engine Optimization (GEO) (Microsoft's framing): /blogs/aeo-vs-geo-microsoft
- Generative Engine Optimization (GEO) vs SEO: How the User Funnel Has Changed: /blogs/geo-vs-seo-user-funnel
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- Explore the Learning Path →: /start
- Is Your Website AI Agent-Ready? The New Lighthouse Agentic Browsing Audit Tests Three Things Most SEOs MissGoogle's new Lighthouse 'Agentic : /blogs/generative-engine-optimization/website-ai-agent-readiness-lighthouse-audit
- Best Courses for AI SEO, AEO & GEO: Ranked Picks for 2026CXL, Coursera, Jellyfish, Reforge, and The GEO Community — ranked and compared acro: /blogs/generative-engine-optimization/best-courses-ai-seo-aeo-geo-2026
- MAGEO: The GEO Framework That Learns From Every Edit and Gets Smarter Across EnginesA new paper (arXiv:2604.19516) proposes MAGEO — a four-a: /blogs/generative-engine-optimization/mageo-multi-agent-geo-reusable-strategy-learning
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
