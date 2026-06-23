---
path: "/blogs/generative-engine-optimization/autoregressive-ranking-dual-cross-encoders-paper"
kind: "blog"
title: "双编码器为何需要 464,000 维才能排序百万文档"
source_title: "Dual Encoders Need 464,000 Dimensions to Rank 1M Documents. Autoregressive LLMs Need 512."
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/autoregressive-ranking-dual-cross-encoders-paper"
author: "Rohit Singh"
date: "29 Apr 2026"
status: "ready"
---
# 双编码器为何需要 464,000 维才能排序百万文档

Google Research 与 UMass Amherst 的一篇 2026 年论文给出了一个很硬的结论：如果要在 100 万篇文档里表达所有可能的排序，dual encoder 理论上需要约 464,000 维 embedding；autoregressive LLM ranker 则可以用常数级 hidden dimension 完成同类表达。换句话说，向量检索的问题不只是“调参还不够”，它在大规模排序上存在结构性的容量上限。

![Autoregressive Ranking vs Dual and Cross Encoders — three retrieval architectures compared, with the generative LLM ranker (ARR) bridging expressivity and efficiency](https://thegeocommunity.com/images/dual_encoders_dimensions_banner.webp)

## 先看结论

这篇文章解读 arXiv:2601.05588《Autoregressive Ranking: Bridging the Gap Between Dual and Cross Encoders》。它解释 dual encoder、cross encoder 与 autoregressive ranker 的架构差异，说明为什么 DE 的表达能力会随语料规模撞到硬上限，为什么 ARR 拥有更高的理论天花板，以及 SToICaL loss 如何把排序信号注入 generative retrieval 训练。

## 阅读路径

1. 什么是 dual encoder、cross encoder 和自回归排序？
2. 为什么这篇论文现在值得看？
3. 排序里的“表达能力”到底是什么意思？
4. 为什么 dual encoder 会撞到硬上限？
5. 为什么自回归排序器可以用常数维度完成排序？
6. 为什么 next-token prediction 不适合作为排序损失？
7. SToICaL 是什么？它怎么工作？
8. 实验结果说明了什么？
9. 自回归排序与 DE、CE 正面对比如何？
10. 这对 RAG、搜索和 GEO 从业者意味着什么？

## 核心结论

- 论文证明了严格的 capacity separation：dual encoder 需要 embedding dimension 随 corpus size 近似线性增长，autoregressive LLM ranker 可以保持常数 hidden dimension。
- 三类架构的取舍很清晰：DE 速度快但 query-doc interaction 被压成点积；CE 准确但 query time 是 O(N)；ARR 用 docID token generation 直接生成排序候选。
- 传统 next-token prediction 是 rank-agnostic，会浪费训练数据里的 rank 信息，常常 top-1 看起来不错，但 top-k 排序噪声大。
- SToICaL 通过 item-level reweighting 和 trie-based token target distribution，把 rank-aware supervision 加进 generative retrieval。
- 在 WordNet 与 ESCI 实验中，SToICaL 改善 top-k ranking；ARR 在 WordNet 上接近 cross encoder，同时显著强于 dual encoder。

## 什么是 dual encoder、cross encoder 和自回归排序？

理解论文贡献前，需要先把三类 ranking architecture 放在同一张地图上。

### Dual Encoder（DE）

Dual encoder 分别把 query 和 document 编码到同一个向量空间。query time 只需要算一次 query embedding，然后用 cosine、dot product 或 Euclidean distance 去找最近的 document embedding：

```text
query -> [Encoder_Q] -> q in R^n
doc   -> [Encoder_D] -> d in R^n
similarity(q, d) = q . d
```

它之所以统治 first-stage retrieval，是因为文档向量可以提前算好并存入 FAISS、ScaNN、Pinecone、Weaviate 等 index。线上查询只需要 query embedding + ANN search，通常毫秒级完成。

代价也很明显：query 和 document 没有真正交互。两者的相关性最终被压缩成固定维度向量之间的一个相似度分数。

### Cross Encoder（CE）

Cross encoder 把 query 和候选文档拼在一起，放进一个联合模型里打 relevance score：

```text
[query + doc] -> [Transformer] -> relevance score
```

好处是模型能让 query token 和 document token 互相 attention，相关性判断更细。CE 通常比 DE 更擅长排序。

坏处是不能预计算。要把一个 query 和 100 万文档全部打分，就要跑 100 万次 forward pass，query-time cost 线性增长。所以生产系统常见做法是两阶段：DE 先取 top-100 或 top-1000，CE 再 rerank。

相关背景可看：[Reranking for RAG: Cross-Encoders vs LLM Rerankers](/blogs/reranking-cross-encoder-llm-reranker)

### Autoregressive Ranking（ARR）

Autoregressive ranking，也常被称为 generative retrieval，不再给每个文档显式打分，而是让 LLM 在 query 条件下逐 token 生成 docID：

```text
query -> [LLM] -> docID tokens
score = P(docID | query) = product P(token_i | query, token_<i)
```

inference 时用 constrained beam search，只允许模型生成有效 docID。这样模型可以直接生成 top-k docIDs，而不是逐个扫描整个语料。

ARR 与前两者的关键区别：

- 它不像 DE 那样只用最后点积；生成 docID 的每一步都可以受 query 和已生成 token 影响。
- 它不像 CE 那样必须对每个 document 单独 forward；beam search 直接找候选。
- 它把 retrieve 和 rank 放进同一个模型，而不是 ANN index + reranker 的手工流水线。

这条路线的典型先例包括 DSI、NCI、GENRE 等。论文关注的是 pointwise ARR，也就是每次生成单个 docID，而不是一次生成完整 list。

| 维度 | Dual Encoder | Cross Encoder | Autoregressive Ranker |
| --- | --- | --- | --- |
| 输出 | 每个 item 一个固定向量 | 每个 query-doc pair 一个 relevance score | 自回归生成 docID token |
| query-doc 交互 | 几乎没有，只有最后点积 | 完整 cross-attention | 对 query 与 docID prefix 的条件生成 |
| 预计算 | 文档向量可提前索引 | 不可预计算 | docID vocabulary 与 prefix tree 可缓存 |
| 查询时成本 | ANN 下接近 O(log N) | O(N) forward passes | O(beam x depth)，不随 N 线性扫描 |
| 典型用途 | first-stage retrieval | second-stage reranking | unified retrieve + rank |

论文最核心的说法是：ARR 继承了 CE 级别的表达能力，却不继承 CE 的 O(N) query cost。

## 为什么这篇论文现在值得看？

过去两年，generative retrieval 有一个尴尬状态：实验上有时能打败 DE pipeline，但效果不稳定；直觉上它应该更强，却缺少严格证明。

这篇论文同时补上两个缺口。

第一是理论缺口。论文证明，DE 若要正确表达所有排序，embedding dimension 必须随 document count 增长；ARR 则可以在常数 hidden dimension 下表达任意排序分布。这是严格的架构分离，不是经验观察。

第二是实践缺口。论文指出，常规 ARR 训练使用的 next-token prediction 丢掉了 rank 信息，因此提出 SToICaL 作为 rank-aware loss，并在两个 benchmark 上提升 ranking metrics。

这也是为什么它不只是 IR 学术论文。向量数据库、RAG、reranker、AI search citation 机制都在这条架构谱系上。

## 排序里的“表达能力”到底是什么意思？

这里的 expressive capacity 是一个可数的数学问题。

如果 corpus 里有 k 个文档，一个 ranking model 若要“解决完整排序任务”，就要能表达这 k 个文档的任意排列。k 个文档共有：

```text
k!
```

种可能排序。问题就变成：模型需要多大容量，才能区分这些排序状态？

论文的证明思路是：计算模型能到达多少不同排序状态，再和 k! 做比较。如果模型状态空间不够，就不可能表达所有排序。

## 为什么 dual encoder 会撞到硬上限？

论文的非正式定理可以这样读：

> embedding dimension 为 n 的 dual encoder，在 `k^2n < k!` 时无法解决 k 个文档的完整排序任务。用 Stirling approximation 展开后，n 大约需要满足 `n >= k/2 - k/(2 ln k)`，也就是维度必须随文档数近似线性增长。

直觉原因是：DE 的排序完全由 query embedding 到每个 document embedding 的距离决定。在 n 维欧氏空间里，给定 k 个点，query 点能诱导出的不同 distance ordering 数量有上界，约为 `k^2n`。但所有可能排序是 `k!`，增长更快。固定维度下，DE 不可能覆盖所有排序。

现实翻译：

- 10,000 个文档需要约 4,500 维。
- 1,000,000 个文档需要约 464,000 维。
- 10,000,000 个文档需要约 4,700,000 维。

商业 embedding model 常见维度是 1,024 到 4,096。它们当然仍能做近似检索，但如果要求“任意排序都能表达”，理论保障只覆盖很小规模的语料。大规模 heterogeneous corpus 上经常出现“recall 还行但 top-k 顺序奇怪”，这篇论文给了结构性解释。

进一步背景：[How the Architecture of Embedding Models Determines Whether AI Retrieves Your Content](/blogs/embedding-architecture-ai-retrieval)

## 为什么自回归排序器可以用常数维度完成排序？

ARR 的镜像结论是：只要 docID token embedding matrix 满秩，常数 hidden dimension 的 ARR 可以表达 docID vocabulary 上任意严格正的 probability distribution。

换句话说，它的表达力不直接由 embedding dimension n 决定，而由 docID token embedding matrix `E'` 的 rank 和 token sequence decomposition 决定。

额外表达力来自两点：

- Token-level decomposition：docID 不是一个点，而是一串 token。每个 token 概率都依赖 query 和前缀 token，因此小 hidden dimension 可以生成指数级多样的输出分布。
- Cross-attention over query：LLM 在每一步生成时都能看完整 query，这与 CE 的 rich interaction 更接近，只是交互被摊到 docID generation 过程里。

所以 ARR 在理论上靠近 CE 的 expressivity，同时 query time 更像一次 generation，而不是对每个 document 单独打分。

需要注意：论文的证明是在理想容量设定下成立。真实 LLM 的训练动态、优化难度、docID 设计都会影响能否达到这个上限。高天花板不等于随便训练就能达到。

## 为什么 next-token prediction 不适合作为排序损失？

大多数 generative retrieval 训练直接用 next-token prediction，也就是给 query 和正确 docID，最小化 docID 每个 token 的 negative log-likelihood。

问题是 NTP 是 rank-agnostic。它把每个 `(query, positive docID)` 当成独立监督，不告诉模型：

- 多个 positive docID 之间谁更相关。
- 无效 docID 应该被压制。
- 第 2、第 3、第 10 个相关文档之间应该有概率差异。

pointwise ranking 数据里明明有 rank 信息，NTP 却把它丢掉。结果就是 top-1 可能还可以，但 top-k 后面的排序很吵，因为模型没有被训练去分辨相邻 rank 的概率差。

## SToICaL 是什么？它怎么工作？

SToICaL 是 Simple Token-Item Calibrated Loss。它把 rank 信息分两层注入训练。

### 第一层：item-level reweighting

先在 item 级别加权。对同一个 query，不同 rank 的 docID 不再同权，而是按 rank 递减：

```text
L_item = sum lambda(r) * NTP(query, docID_r)
```

论文讨论了两种简单权重：

- Fractional：`lambda(r) = 1 / r^alpha`。alpha 越大，越接近只强调 top-1。
- Stepwise：`lambda(r) = (n_q - r + 1) / n_q`。按 relevant doc 总数线性递减。

这个技巧很朴素，也很通用。论文发现它不仅能用于 ARR，也能改善 DE 和 CE 的训练。

### 第二层：用 prefix tree 构造 token-level target distribution

第二层更适合 docID token generation。SToICaL 在所有有效 docID 上建 prefix tree，也就是 trie。每个生成位置不再只用 one-hot target，而是把概率质量分配给所有有效 continuation token，权重来自它们通向的 docID rank。

举个小例子：有效 docID 是 `dog`、`cat`、`cats`、`deer`、`fish`。第一位 token 的有效选择是 `{c, d, f}`。

- `c` 通向 `cat`、`cats`。
- `d` 通向 `dog`、`deer`。
- `f` 通向 `fish`。

如果 `dog` rank 1、`cat` rank 2、`cats` rank 3、`deer` rank 4、`fish` rank 5，那么第一位的 target distribution 会把更多质量给 `d`，其次给 `c`，最后给 `f`。模型学到的是整棵 trie 上的 rank-weighted continuation，而不是只猜 top-1 docID 的下一个 token。

这让 token-level loss 具备排序意识，同时避免训练时直接生成完整 ranking list。

## 实验结果说明了什么？

论文用 Mistral-7B-v0.3-it 作为 base model，在两个数据集上测试 SToICaL。

### WordNet：分类体系排序

WordNet 任务来自 taxonomy ranking。给定一个 query synset，比如 `deer`，模型需要按正确顺序排列它的 hypernym path，如 ruminant、even-toed ungulate、ungulate，另加一个随机 negative。

结果要点：

- 没有 SToICaL 时，LLM 容易生成不在 corpus 里的无效 docID；item-level reweighting 把 constraint violation 显著降到接近零。
- `1/r^alpha` 的 fractional reweighting 优于 stepwise reweighting。
- WordNet docID 较短，item-level reweighting 比 trie token reweighting 表现更强。
- 对 K > 2 的 nDCG 和 Recall@K 改善明显，正好补上 vanilla NTP 在 top-1 之后排序混乱的问题。

### ESCI：电商购物查询

ESCI 是 Amazon 的购物 query 数据。每个 query 往往有很多 product title，需要做 reranking。由于 product title 较长，论文先用 sparse dictionary learning 基于 Gecko embeddings 学出压缩 docID，例如 `"25,36,39"` 这种短而适合 trie 的表达。

结果要点：

- 数据规模下 item-level reweighting 成本太高，因此主要使用 trie-based token reweighting。
- R@1 略降，但 K > 1 的 R@K 与 aggregate nDCG 相比 NTP baseline 提升。
- 当训练预算不允许 item-level reweighting 时，trie-based marginalization 是更便宜的可行方案。

总体结论：SToICaL 比 vanilla NTP 更能学习 top-k 排序，item-level reweighting 在预算允许时更强，trie token marginalization 是成本更低的 fallback。

## 自回归排序与 DE、CE 正面对比如何？

论文第 5.3 节做了最关键的对照：在同一个 WordNet ranking task 上训练 DE、CE 和 ARR，然后比较 Recall@K。

结果与理论一致：

- ARR 的 ranking accuracy 接近 CE。
- ARR 明显强于 DE，尤其 relevant document per query 增多时，DE 的维度天花板更容易暴露。
- `1/r^alpha` reweighting 不只对 ARR 有用，也能改善 DE 和 CE，说明 rank-aware supervision 是通用训练信号。

这使论文的贡献不只是“ARR 天花板更高”，而是“在合适 loss 下，这个天花板能转化为实际 ranking quality”。

## 这对 RAG、搜索和 GEO 从业者意味着什么？

### 1. 只靠 dual encoder，很难胜任大规模排序

如果 RAG pipeline 只靠 DE 同时做 retrieve 和 top-k ordering，你就在用一个有硬容量上限的架构。embedding model 可以用于 recall，但精细排序需要 reranker。

这也是为什么很多系统一加 CE 或 LLM reranker，质量就上来。不是单纯 prompt 或 threshold 没调好，而是 DE 没有足够几何自由度表达复杂排序。

相关实验：[Cosine Similarity "Tweaking" Can Backfire](/blogs/cosine-similarity-tweaking-backfire-reranker-experiment)

### 2. Generative retrieval 正在获得更扎实的数学支撑

过去 generative retrieval 看起来像前沿但不稳定的方向。这篇论文把它放进了有证明支撑的 ranking paradigm。未来 12-24 个月，生产检索研究大概率会继续解决 ARR 的部署问题：

- docID 如何分配，才能让 beam search 便宜且覆盖全 corpus。
- corpus 更新时如何避免重训整个 generator。
- corpus 扩到几十万、几百万文档时，docID token space 如何保持可学。

对 2026-2027 年新建 retrieval stack 的团队来说，不应默认 vector DB + DE 就是终局。它更像通往 generative retrieval 的中间层。

### 3. SToICaL 这种训练思路可以迁移到其他排序模型

最立即可复用的发现是 `1/r^alpha` reweighting。训练 embedding 或 reranker 时，如果所有 positive pair 同权，通常会浪费 rank 信息。给更高 rank 的 positive pair 更高 loss weight，可以改善小 K 的 Recall@K。

这不要求你马上采用 ARR。它是对现有 DE、CE、reranker training 都可尝试的训练改动。

### 放到 GEO 和 AI 搜索里的大图景

对 GEO 来说，隐含结论是：AI search 产品正在从“先 retrieve 再 rerank”走向“模型直接生成 citation 或 docID”的方向。这正是论文形式化的 DE -> ARR 转变。

这会影响内容策略：

- Entity clarity 更重要。generative ranker 更容易学习和生成与清晰 canonical entity 对应的 docID。
- Structural consistency 是检索信号。模板、schema、标题、字段稳定的页面更容易被表示为干净 docID。
- 只做 cosine similarity optimization 会越来越局限。未来的目标不是“向量更接近 query”，而是“成为该 query 下模型会生成的 canonical entity”。

论文面向 ML 研究者，但它确实会改变内容被 AI search 引用的策略面。

## 引用

Rozonoyer, B., You, C., Boratko, M., Jain, H., Gupta, N., Bhojanapalli, S., McCallum, A., & Yu, F. (2026). Autoregressive Ranking: Bridging the Gap Between Dual and Cross Encoders. arXiv preprint arXiv:2601.05588.

## 延伸阅读

- [arXiv:2601.05588](https://arxiv.org/abs/2601.05588)
- [Reranking for RAG: Cross-Encoders vs LLM Rerankers](/blogs/reranking-cross-encoder-llm-reranker)
- [How the Architecture of Embedding Models Determines Whether AI Retrieves Your Content](/blogs/embedding-architecture-ai-retrieval)
- [Cosine Similarity "Tweaking" Can Backfire](/blogs/cosine-similarity-tweaking-backfire-reranker-experiment)
- [Hybrid Search in RAG](/blogs/hybrid-search-bm25-vectors-rag)
- [Chunking and Metadata Filters in RAG](/blogs/chunking-metadata-filters-rag)

## 图片引用

- Autoregressive Ranking vs Dual and Cross Encoders — three retrieval architectures compared, with the generative LLM ranker (ARR) bridging expressivity and efficiency: https://thegeocommunity.com/images/dual_encoders_dimensions_banner.webp

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/autoregressive-ranking-dual-cross-encoders-paper/print
- What are dual encoders, cross encoders, and autoregressive ranking?: /blogs/generative-engine-optimization/autoregressive-ranking-dual-cross-encoders-paper
- Why does this paper matter now?: /blogs/generative-engine-optimization/autoregressive-ranking-dual-cross-encoders-paper
- What does "expressive capacity" mean for ranking?: /blogs/generative-engine-optimization/autoregressive-ranking-dual-cross-encoders-paper
- Why do dual encoders hit a hard ceiling?: /blogs/generative-engine-optimization/autoregressive-ranking-dual-cross-encoders-paper
- Why can autoregressive rankers rank with constant dimension?: /blogs/generative-engine-optimization/autoregressive-ranking-dual-cross-encoders-paper
- Why does next-token prediction fail as a ranking loss?: /blogs/generative-engine-optimization/autoregressive-ranking-dual-cross-encoders-paper
- What is SToICaL and how does it work?: /blogs/generative-engine-optimization/autoregressive-ranking-dual-cross-encoders-paper
- What did the experiments find?: /blogs/generative-engine-optimization/autoregressive-ranking-dual-cross-encoders-paper
- How does autoregressive ranking compare head-to-head with DEs and CEs?: /blogs/generative-engine-optimization/autoregressive-ranking-dual-cross-encoders-paper
- What does this mean for RAG, search, and GEO practitioners?: /blogs/generative-engine-optimization/autoregressive-ranking-dual-cross-encoders-paper
- arXiv:2601.05588: https://arxiv.org/abs/2601.05588
- Reranking for RAG: Cross-Encoders vs LLM Rerankers: /blogs/reranking-cross-encoder-llm-reranker
- How the Architecture of Embedding Models Determines Whether AI Retrieves Your Content: /blogs/embedding-architecture-ai-retrieval
- Cosine Similarity "Tweaking" Can Backfire: A Small Experiment with a Real Reranker: /blogs/cosine-similarity-tweaking-backfire-reranker-experiment
- Generative Engine Optimization: /blogs/geo-princeton-paper-original-study
- Reranking for RAG: Cross-Encoders vs LLM Rerankers (and How to Choose): /blogs/reranking-cross-encoder-llm-reranker
- Hybrid Search in RAG (BM25 + Vectors): When and How It Beats Pure Embeddings: /blogs/hybrid-search-bm25-vectors-rag
- Chunking and Metadata Filters in RAG: How to Stop Retrieving the Wrong Context: /blogs/chunking-metadata-filters-rag
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- Explore the Learning Path →: /start
- MAGEO: The GEO Framework That Learns From Every Edit and Gets Smarter Across EnginesA new paper (arXiv:2604.19516) proposes MAGEO — a four-a: /blogs/generative-engine-optimization/mageo-multi-agent-geo-reusable-strategy-learning
- ColBERT Has Been Weighting All Query Tokens Equally. A New Paper Fixes That — and Recall Improves by 3.66%.ColBERT's late-interaction mechan: /blogs/generative-engine-optimization/colbert-idf-token-weights-ai-retrieval-geo
- How DeepSeek V4 Crammed 1 Million Tokens Into 9.62 GB and Cut Inference Costs by 6×DeepSeek V4 (released April 24, 2026) ships a 1-million-t: /blogs/generative-engine-optimization/deepseek-v4-hybrid-attention-1m-context-memory
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
