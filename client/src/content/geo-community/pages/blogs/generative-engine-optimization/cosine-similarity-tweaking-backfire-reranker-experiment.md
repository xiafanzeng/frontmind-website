---
path: "/blogs/generative-engine-optimization/cosine-similarity-tweaking-backfire-reranker-experiment"
kind: "blog"
title: "Cosine Similarity \"Tweaking\" Can Backfire: A Small Experiment with a Real Reranker"
source_title: "Cosine Similarity \"Tweaking\" Can Backfire: A Small Experiment with a Real Reranker"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/cosine-similarity-tweaking-backfire-reranker-experiment"
author: "Rohit Singh"
date: "28 Jan 2026"
status: "ready"
---
# Cosine Similarity "Tweaking" Can Backfire: A Small Experiment with a Real Reranker

很多 AEO/GEO 建议会把问题简化成一句话：让内容在 embedding space 里更接近用户 query，cosine similarity 越高，AI visibility 越好。这个判断有一部分道理，但它漏掉了生产级 RAG pipeline 里常见的第二阶段：reranking。

![Cosine Similarity Tweaking Can Backfire: A Small Experiment with a Real Reranker](https://thegeocommunity.com/images/cosine-similarity-tweaking-backfire-reranker-experiment.webp)

这篇实验展示了一个容易被忽略的失败模式：一个短小、cosine-dense 的 summary 可以赢得第一阶段 retrieval，却在真实 reranker 面前输给更长、更有证据、更有解释力的文档。对 GEO 内容策略来说，结论很实用：不要只为向量相似度优化到内容变薄；你需要同时通过 retriever 的门和 reranker 的评审。

## 页面摘要

A two-stage RAG demo showing how cosine similarity can win retrieval but lose to a cross-encoder reranker—and what that means for AEO/Generative Engine Optimization (GEO) content strategy.

## 原站章节结构

1. Experiments & Novel Ideas
2. The intuition in one line
3. What I tested
4. Stage 1: Retriever (embeddings + cosine)
5. Stage 2: Reranker (real cross-encoder-style reranker)
6. Models I used
7. The setup: a “summary” vs a “full explanation”
8. The code (Colab)
9. Example output (one run)
10. What this shows
11. The practical takeaway
12. About the author
13. Rohit Singh
14. Continue learning
15. Semantic Visualization Experiment: Watching a Paragraph Move in Embedding Space

## 正文

## Experiments & Novel Ideas

这篇属于原站的实验与新想法系列。它不是大规模 benchmark，也不是要宣称某个模型的最终性能，而是用一个小型、可理解的 demo，说明内容策略里“只追求 cosine similarity”为什么可能误导。

在很多向量检索系统里，第一阶段确实会用 embeddings 和 cosine similarity 或 normalized dot product 找候选。于是有人会推导出一个简单策略：把内容写得更像 query，或者在摘要里堆更多相似词，让向量距离更近。

问题是，真实系统经常不是只靠第一阶段排序。候选文档通过 retriever 后，reranker 会重新评估 query-document pair 的相关性、证据质量和答案有用性。此时，短小且向量很近的内容不一定赢。

## The intuition in one line

一句话总结：retrieval 是 gate，reranking 是 judge。

Retriever 的任务是把可能相关的候选捞出来。它关心向量接近度，目标是不要漏掉可能有用的文档。

Reranker 的任务是从候选里选最能回答问题的证据。它更像评审，关注 query 和文档之间的细粒度匹配、上下文、具体性和可用性。

所以你可以赢得 gate，却输给 judge。对 GEO 来说，这意味着内容要足够可检索，也要足够有证据价值。

## What I tested

实验模拟了一个简单两阶段 RAG pipeline。

第一阶段：用 embedding model 对 query 和 documents 编码，再用 cosine similarity 排序，找出候选。

第二阶段：用真实 cross-encoder-style reranker 对 query-document pair 重新打分。

测试的核心对比是两类文档：

- 一个短 summary：词面更贴近 query，语义非常集中，可能在 cosine retrieval 中得分更高。
- 一个 full explanation：更长，包含更多解释、证据、细节和上下文，可能在 reranker 中更有用。

原站实验观察到：短 summary 可以在 embedding stage 赢，但 reranker 会更偏向 full explanation，因为后者更能作为回答问题的证据。

## Stage 1: Retriever (embeddings + cosine)

Retriever 阶段使用 embeddings + cosine similarity。它会把 query 和文档转换成向量，然后计算相似度。越接近，越可能进入候选集。

这个阶段对内容策略的启发是：你确实不能完全忽略 query language。如果页面完全不用用户会问的词、实体和上下文，它可能连候选集都进不去。

但 retriever 是粗筛。它不一定真正理解哪篇文档能支持最终答案。一个高度压缩、关键词密集的段落，可能因为向量接近而排名靠前，却没有足够细节回答用户问题。

这就是很多“cosine tweaking”建议的盲点。它只优化第一道门，而没有优化后面的判断。

## Stage 2: Reranker (real cross-encoder-style reranker)

Reranker 阶段会更细地看 query 和文档。Cross-encoder-style reranker 通常把 query 和 document 一起输入模型，让模型判断这段文档作为证据是否真正相关。

与 embedding retriever 相比，reranker 不只是看两个独立向量是否相近。它能更好地评估：

- 文档是否具体回答了问题。
- 是否包含足够上下文。
- 是否有可用证据。
- 是否只是泛泛复述 query。
- 哪个候选更能支持最终答案。

因此，一个 full explanation 可能赢过 short summary。不是因为它向量更近，而是因为它更有用。

## Models I used

原站实验使用了两类模型：

- Retriever embedding model：`sentence-transformers/all-MiniLM-L6-v2`
- Reranker：`BAAI/bge-reranker-base`，通过 `FlagEmbedding` 使用

这些模型不是唯一选择，但足以说明管道结构差异。`all-MiniLM-L6-v2` 是常见轻量 embedding model，适合演示向量检索。`bge-reranker-base` 更接近现代 RAG stack 里常见的 reranking 行为。

重点不是某个模型的绝对分数，而是两阶段优化目标不同：一个找近邻，一个选证据。

## The setup: a “summary” vs a “full explanation”

实验构造了同一主题的两个文档。

Summary 文档很短，包含 query 里容易触发 embedding similarity 的核心词。它像一个为检索写的摘要，语义密度高，但证据少。

Full explanation 文档更长，解释了问题背景、机制、例子和实际影响。它可能不如 summary 那么“贴 query”，但更像一个能被 AI answer 用来回答用户问题的来源。

这正好对应内容策略中的两种写法：

```text
cosine-optimized snippet: 短、密、贴词，但薄。
evidence-rich explanation: 具体、有上下文、有判断，可引用。
```

如果你只盯着第一种，很容易把内容越写越像 keyword-dense abstract。它可能被召回，却不一定被最终答案采用。

## The code (Colab)

原站使用 Colab 演示，大致流程是：

```python
from sentence_transformers import SentenceTransformer
from FlagEmbedding import FlagReranker

embedder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
reranker = FlagReranker("BAAI/bge-reranker-base")

query = "..."
docs = [summary_doc, full_explanation_doc]

query_embedding = embedder.encode(query, normalize_embeddings=True)
doc_embeddings = embedder.encode(docs, normalize_embeddings=True)
cosine_scores = doc_embeddings @ query_embedding

pairs = [[query, doc] for doc in docs]
rerank_scores = reranker.compute_score(pairs)
```

这段不是为了提供完整 production code，而是帮助读者看到：同一批文档在 retriever 和 reranker 下可能出现不同排序。

## Example output (one run)

一次运行中，可能会出现这样的模式：

```text
Retriever / cosine ranking:
1. summary_doc
2. full_explanation_doc

Reranker ranking:
1. full_explanation_doc
2. summary_doc
```

这就是实验的关键。Summary 文档赢了向量相似度，但 full explanation 赢了 reranking。

如果你的 GEO 策略只关注“怎样让段落靠近 prompt 向量”，你可能会误以为 summary_doc 是更好的内容。真实 pipeline 里，它可能只是更容易进候选集，却不是更容易被最终答案使用。

## What this shows

这个实验展示三点。

第一，cosine similarity 重要，但通常不是最终排序。它决定候选进入，不一定决定最终引用。

第二，reranker 会惩罚过于泛化、证据不足、上下文太少的内容。短摘要如果只是复述 query，没有足够支持信息，会在第二阶段失分。

第三，GEO 内容不应该为了向量相似度牺牲可用性。真正有价值的内容应该同时具备 query relevance、entity coverage、clear structure、grounded claims 和 evidence richness。

换句话说，你要写给 retriever 看，也要写给 reranker 看，还要写给最终用户看。

## The practical takeaway

实践上，可以用一个双目标框架。

为了通过 retriever：

- 使用用户会问的语言。
- 明确命名实体、工具、概念和问题。
- 在标题、摘要、段落开头提供清晰主题。
- 避免只用品牌内部术语。

为了赢得 reranker：

- 提供完整解释。
- 加入具体例子和数据。
- 说明条件、限制和适用场景。
- 使用结构化段落、步骤、表格和 FAQ。
- 避免只有关键词密集但没有证据的薄内容。

对 GEO 来说，最稳的策略不是“把内容缩成最贴 query 的摘要”，而是“在清晰主题入口之后，给足可引用证据”。开头可以直接回答，正文必须展开。

## About the author

Rohit Singh 关注 GEO、AEO、RAG evaluation、reranking、AI search measurement 和内容如何在生成式系统里被检索、排序与引用。

## Continue learning

下一篇可以看 semantic visualization experiment。它用 embedding space 的移动来直观展示段落语义如何变化，和这篇 reranker 实验一起，可以帮助内容团队更具体地理解“语义优化”到底意味着什么。

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- View Full Learning Path →: /start
- 1Cosine Similarity "Tweaking" Can Backfire: A Reranker Experiment: /blogs/generative-engine-optimization/cosine-similarity-tweaking-backfire-reranker-experiment
- 2Watching a Paragraph Move in Embedding Space: /blogs/generative-engine-optimization/semantic-visualization-experiment-embedding-space
- 3How to Make Your AI Content Trustworthy: DOI Verification: /blogs/generative-engine-optimization/ai-visibility-operation-provenance-lattice-construction-using-doi-records
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/cosine-similarity-tweaking-backfire-reranker-experiment/print
- sentence-transformers/all-MiniLM-L6-v2: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- BAAI/bge-reranker-base: https://huggingface.co/BAAI/bge-reranker-base
- FlagEmbedding: https://github.com/FlagOpen/FlagEmbedding
- My take on "tweak cosine similarity" advice: /blogs/tweak-cosine-similarity-advice-seo-aeo-geo
- RAGAS evaluation guide: /blogs/ragas-rag-evaluation
- Reranking for RAG: Cross-Encoders vs LLM Rerankers: /blogs/reranking-cross-encoder-llm-reranker
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- Semantic Visualization Experiment: Watching a Paragraph Move in Embedding SpaceEmbed each snapshot, project to 3D with PCA, and watch semant: /blogs/generative-engine-optimization/semantic-visualization-experiment-embedding-space
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
