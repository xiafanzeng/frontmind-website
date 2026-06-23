---
path: "/blogs/generative-engine-optimization/pyversity-the-python-library-every-geo-researcher-needs-in-their-toolkit"
kind: "blog"
title: "Pyversity: The Python Library Every GEO Researcher Needs in Their Toolkit"
source_title: "Pyversity: The Python Library Every GEO Researcher Needs in Their Toolkit"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/pyversity-the-python-library-every-geo-researcher-needs-in-their-toolkit"
author: "Rohit Singh"
date: "7 Mar 2026"
status: "ready"
---

> Pyversity 是一个面向 retrieval diversification 的 Python 库。对 GEO 研究者来说，它最有价值的地方不是“让结果更漂亮”，而是能把候选集质量、引用多样性和 AI 可见性背后的检索层问题拆开测量。

多数 GEO 建议默认把 retrieval 当作黑盒：只要内容优化得好，AI 引擎自然会把它拿出来引用。这个假设太乐观。生成式搜索通常先检索候选文档，再重排，再交给模型综合。你的内容如果没有通过检索层，就不会进入综合阶段。Pyversity 提供了一种简单办法：在检索之后、生成之前，把候选结果重新排序，让 top-k 里既有相关性，也有语义差异。

它解决的是一个非常具体的问题：dense retriever 常常会返回一堆近似重复结果。Top 10 看似有 10 个文档，实际上可能只有 2 到 3 个独立观点。对 RAG 和 AI search 来说，这会浪费 context window，也会让引用来源集中在少数相似页面上。对 GEO 来说，这意味着很多内容还没被模型判断质量，就已经被“相似性拥挤”挤出候选集。

![Pyversity: The Python Library Every GEO Researcher Needs in Their Toolkit](https://thegeocommunity.com/images/pyversity-the-python-library-every-geo-researcher-needs-in-their-toolkit.webp)

**In this article:** [What is Pyversity](#what-is-pyversity-and-what-problem-does-it-solve) · [diversify API](#how-does-pyversitys-diversify-api-actually-work) · [strategies](#what-diversification-strategies-does-pyversity-support-and-when-should-you-use-each-one) · [retrieval redundancy](#why-does-retrieval-redundancy-damage-geo-performance) · [benchmark corpus](#how-do-you-use-pyversity-to-build-a-geo-benchmark-corpus) · [RAG audit](#how-do-you-integrate-pyversity-into-a-rag-pipeline-for-geo-auditing) · [Haystack](#how-does-pyversityranker-work-inside-a-haystack-pipeline) · [content signals](#what-does-pyversity-tell-you-about-content-strategy-signals-that-survive-retrieval)

## What is Pyversity and what problem does it solve?

[Pyversity](https://github.com/Pringled/pyversity) 是一个用于 embedding-ranked document list 的多样化重排库。它不会替你做检索，也不会替你生成答案；它只做一件事：在已有候选文档、embedding 和 relevance score 的基础上，重新选择更有信息覆盖度的 top-k。

这个问题在 GEO 里很常见。假设你用向量检索某个查询，前 10 个结果都在讨论同一个定义、同一个统计、同一个二手总结。它们的 cosine similarity 很高，所以排序靠前，但它们共同提供的信息很少。模型拿到这些上下文后，只能在同质证据里合成答案；引用也会集中在几个相似来源上。

Pyversity 的价值在于让你定量观察这种冗余。你可以比较两组结果：纯相似度排序和多样化排序。如果某篇目标内容只在多样化排序中进入 top-k，说明它被近似重复内容压住了；如果它在多样化排序中反而掉出 top-k，说明它本身可能太可替代。

这和 GEO 文献中的发现有关。原始 GEO 论文显示，一些生成阶段策略能提升 word-level visibility；但 SAGEO Arena 这类 full-pipeline benchmark 发现，只改正文可能会在检索阶段伤害排名。检索层不是细节，而是内容能否进入 AI 综合阶段的门槛。

## How does Pyversity's diversify() API actually work?

Pyversity 的核心接口很小：

```python
from pyversity import diversify

diverse_results = diversify(
    embeddings=embeddings,
    scores=scores,
    k=10,
    strategy="mmr",
    diversity=0.6,
)
```

`embeddings` 是候选文档的向量矩阵，`scores` 是初始相关性分数，`k` 是最终返回数量，`strategy` 是多样化算法。函数返回的是原始候选数组里的索引顺序。也就是说，你仍然保留原始文档、分数、metadata 和来源；Pyversity 只改变“选择哪些文档”和“以什么顺序进入上下文”。

这也是它适合研究的原因。它不要求你重写 retriever，不绑定某个模型框架，也不需要 GPU。核心依赖只有 NumPy，可以插在 BM25、dense retriever、hybrid search、cross-encoder reranker 之后，用来观察候选集在进入 LLM 之前发生了什么。

最关键的参数是 `diversity`。当 `diversity=0.0` 时，结果几乎等同于纯相关性排序；当 `diversity=1.0` 时，算法会最大化多样性而弱化相关性。生产型 RAG 通常不应该走极端。GEO 研究里，0.5 到 0.7 往往最有信息量：相关性还在，重复文档会被明显压下去。

## What diversification strategies does Pyversity support, and when should you use each one?

Pyversity 支持多种策略，每种策略回答的问题略有不同。

| Strategy | Full name | 适合场景 |
| --- | --- | --- |
| MMR | Maximal Marginal Relevance | RAG 上下文组装，兼顾相关性和去重复。 |
| MSD | Max-Sum Diversification | 构建 benchmark corpus，追求最大语义跨度。 |
| DPP | Determinantal Point Processes | 小规模研究集，需要更严格的统计多样性。 |
| SSD | Soft Submodularity Diversification | 大语料实验，想平衡覆盖和效率。 |
| COVER | Coverage-based Diversification | 内容策略审计，检查哪些语义 cluster 没被覆盖。 |

MMR 是默认选择。它的直觉很容易理解：每次选下一个文档时，既看它和查询是否相关，也看它是否和已经选中的文档重复。对 RAG 来说，这通常是最自然的行为。

MSD 更适合构建测试集。如果你要从 1000 篇候选文档中选 200 篇做 GEO benchmark，MSD 可以帮助你避免抽到一批同质页面。DPP 更严谨，但计算成本更高，适合较小候选集。COVER 对内容策略尤其有用，因为它能暴露“你的内容没有覆盖哪个语义簇”。

如果 COVER 在高 diversity 权重下总是选择竞品而不是你，问题可能不是页面标题或 FAQ 不够好，而是你的内容和已有强来源太像，检索器删掉它不会损失信息量。

## Why does retrieval redundancy damage GEO performance?

生成式搜索的基本链路通常是：query → retrieve candidates → rerank → generate。GEO 优化如果只看生成阶段，就会错过最早的过滤层。

冗余会带来三个损害。

第一，context window 被浪费。8 段意思几乎一样的 128-token passage，占用了 1024 token，却没有提供 8 倍的信息。LLM 不会因为重复读同一个观点就更理解问题；它更需要不同证据、不同实体和不同角度。

第二，引用来源会收缩。AI answer 如果只看到同一个权威站点的多个相似页面，就更容易引用同一来源。更小的站点、独立研究、特定案例即便质量不错，也可能在 retrieval stage 被挤掉。

第三，内容优化信号会被提前抵消。某些扩写、定义补充、FAQ 加法会让文本更长、更流畅，但也可能让 embedding 更接近大量通用页面。SAGEO Arena 中 body-text-only 策略在 full pipeline 下出现 retrieval rank degradation，本质上就是这个风险：生成阶段看起来更有帮助，检索阶段反而更难进入候选集。

Pyversity 不是让你绕过检索规则，而是让你看清楚规则。它能帮你回答：我的内容输在内容质量，还是输在候选集冗余？如果是后者，继续堆通用段落只会更糟。

## How do you use Pyversity to build a GEO benchmark corpus?

GEO benchmark 的质量很依赖语料构建。如果测试集中有大量近似重复页面，实验结果会虚高：一个策略看似在 5 篇文档上有效，实际只是同一个内容角度重复了 5 次。

一个简单工作流是：

```python
from pyversity import diversify
import numpy as np

diverse_indices = diversify(
    embeddings=corpus_embeddings,
    scores=corpus_scores,
    k=200,
    strategy="msd",
    diversity=0.6,
)

diverse_corpus = [candidate_docs[i] for i in diverse_indices]
selected_embeddings = corpus_embeddings[diverse_indices]
pairwise_distances = 1 - np.dot(selected_embeddings, selected_embeddings.T)
mean_diversity = np.mean(pairwise_distances[np.triu_indices(len(diverse_indices), k=1)])
print(mean_diversity)
```

平均 pairwise cosine distance 是一个很实用的 corpus diagnostic。低于 0.15 通常说明冗余很重；高于 0.30 才说明语义跨度比较健康。原始 GEO-Bench 跨 25 个领域和 10,000 个查询，本质上就是通过设计约束保证 domain diversity。Pyversity 可以把类似约束变成算法选择。

构建 benchmark 时：

- 想要最大语义跨度，用 MSD。
- 想要统计上更严谨的小规模集合，用 DPP。
- 想确保特定子主题 cluster 都出现，用 COVER。

## How do you integrate Pyversity into a RAG pipeline for GEO auditing?

GEO audit 的关键问题是：目标内容在什么检索条件下会被引用，什么时候会被排除。Pyversity 可以把这个问题拆成可控实验。

你可以对同一个 query 和 corpus 跑两次：一次 `diversity=0.0`，一次 `diversity=0.6`。然后观察目标文档是否进入 retrieval top-k，是否最终被答案引用。

```python
def audit_geo_visibility(query, corpus_docs, target_doc_index, diversity=0.6):
    query_emb = embed([query])[0]
    doc_embeddings = embed([d["text"] for d in corpus_docs])
    scores = doc_embeddings @ query_emb

    selected_indices = diversify(
        embeddings=doc_embeddings,
        scores=scores,
        k=10,
        strategy="mmr",
        diversity=diversity,
    )

    target_in_context = target_doc_index in selected_indices
    return {
        "target_in_retrieval": target_in_context,
        "retrieval_rank": list(selected_indices).index(target_doc_index) + 1 if target_in_context else None,
    }
```

结果可以分三种：

- 两种条件都没有进入或没有被引用：更可能是内容质量、权威性或查询匹配问题。
- 纯相似度下失败，多样化后成功：内容被重复 cluster 压住，候选集冗余是主要瓶颈。
- 纯相似度下成功，多样化后失败：内容和其他页面过于相似，靠相关性赢，靠独特性不够。

这个诊断比单一 GEO 分数更有用，因为它把 retrieval-layer problem 和 generation-layer problem 分开了。它也能和 [chunking and metadata filters in RAG](https://thegeocommunity.com/blogs/generative-engine-optimization/chunking-metadata-filters-rag)、[hybrid search in RAG](https://thegeocommunity.com/blogs/generative-engine-optimization/hybrid-search-bm25-vectors-rag)、[query rewriting and multi-query retrieval](https://thegeocommunity.com/blogs/generative-engine-optimization/query-rewriting-multiquery-rag) 一起使用。

## How does PyversityRanker work inside a Haystack pipeline?

[Haystack](https://haystack.deepset.ai/integrations/pyversity) 是常见的 Python RAG 框架，Pyversity 提供了原生组件 `PyversityRanker`，可以放在 retriever 之后，作为 post-retrieval diversification step。

```bash
pip install pyversity-haystack
```

基本结构如下：

```python
from haystack import Pipeline
from haystack.components.retrievers import InMemoryEmbeddingRetriever
from haystack_integrations.components.rankers.pyversity import PyversityRanker

pipeline = Pipeline()
pipeline.add_component("retriever", InMemoryEmbeddingRetriever(
    document_store=document_store,
    top_k=50,
    return_embedding=True,
))
pipeline.add_component("ranker", PyversityRanker(
    strategy="mmr",
    diversity=0.6,
    top_k=10,
))

pipeline.connect("retriever.documents", "ranker.documents")
```

这里有一个要求：文档必须同时带有 score 和 embedding，所以 retriever 要设置 `return_embedding=True`。典型的 GEO 实验栈可以是：BM25 + dense hybrid retrieval，cross-encoder rerank，再用 PyversityRanker 多样化，最后交给 LLM synthesis。这个结构更接近真实生成式搜索系统，而不是只看最终文案。

## What does Pyversity tell you about content strategy signals that survive retrieval?

Pyversity 最有意思的用途，是测试哪些内容信号能在 diversity weight 提高时仍然留在 top-k。

通常能留下来的内容有一个共同点：它占据了独特语义位置，其他文档不能轻易替代。

| Signal | 为什么能存活 | GEO 含义 |
| --- | --- | --- |
| Original primary data | 一手数字和发现很难被二手总结完全替代。 | 自有研究、调查、实验数据更有价值。 |
| Authoritative attribution | 具名专家引用形成独特语义签名。 | 采访、直接引语、作者身份很重要。 |
| Rare entity combinations | 不常见实体组合提高 pairwise distance。 | 垂直行业案例、特殊对比更容易被保留。 |
| Safety / procedural framing | 责任边界和流程说明在敏感领域更稀缺。 | 医疗、法律、金融内容需要明确专业框架。 |

容易被过滤的内容也很典型：

- 泛泛的 “what is X” 定义。
- 对常识事实的 bullet-point 重述。
- 只是更流畅、更长，但没有新信息的扩写。

所以，内容策略的目标不是把每个页面写成更完整的百科，而是增加不可替代的信息密度：一手数据、明确出处、罕见实体关系、真实案例、流程细节和责任边界。

## How do you install and run Pyversity end-to-end?

核心包：

```bash
pip install pyversity
```

Haystack 集成：

```bash
pip install pyversity-haystack
```

带 embedding 实验环境：

```bash
pip install pyversity openai numpy scikit-learn
```

最小 GEO diversity audit 可以从 20 行左右开始：准备候选文档、生成 embedding、计算 query similarity、调用 `diversify()`，再比较 baseline 和 diversified top-k 中目标文档的出现情况。真正的价值不是一次运行，而是对多个 query、多个 diversity weight、多个 strategy 做矩阵实验。

## What are the practical limits of Pyversity for GEO research?

Pyversity 不能替代 retriever，也不能告诉你真实商业搜索引擎的私有检索逻辑。它只能在你控制的 corpus 和 embedding 空间里做重排实验。因此，结论应该被理解为“对候选集质量和冗余风险的可控模拟”，而不是对 Google、Perplexity 或 ChatGPT Search 的完整复刻。

它也依赖 embedding 质量。embedding 模型如果不能捕捉你的领域差异，多样化结果就会偏。对于代码、医学、法律或金融内容，最好使用更适合领域语义的 embedding，或者至少对结果做人工抽样检查。

最后，多样性不是越高越好。`diversity=1.0` 可能会引入不够相关的文档。GEO 研究者应该把它当作 stress test，而不是生产默认值。真正的问题是：在保持相关性的前提下，哪些内容仍然能提供独特证据。

## A practical Pyversity research workflow

如果把 Pyversity 用在真实 GEO 研究里，最小工作流可以分成六步。第一步，定义 query set。不要只选一个关键词，而要覆盖定义型、比较型、实施型、购买决策型和故障排查型问题。第二步，构建 candidate corpus。候选文档应该包括你的页面、直接竞品、第三方评测、官方文档、学术来源和社区讨论，否则多样化结果会只反映单一内容池。

第三步，生成 embeddings。这个模型选择会影响结果：通用 embedding 适合一般网页，代码、医学、法律、金融等垂直领域最好抽样验证语义距离是否合理。第四步，跑 baseline retrieval。记录纯相似度 top-k、目标页面位置、重复 cluster、平均 pairwise distance。第五步，使用 Pyversity 跑 MMR、MSD、DPP 或 COVER，并在多个 diversity weight 上比较。第六步，把结果交给 LLM synthesis，看目标内容是否被引用、是否被正确复述、是否提升答案覆盖面。

这个流程的价值不是模拟某个私有 AI 引擎，而是把“为什么没有被引用”拆得更细。一个页面可能不是输在写作，而是被 8 个相似页面挤掉；也可能不是输在检索，而是进入上下文后没有被模型采用。Pyversity 帮你把 retrieval failure 和 generation failure 分开。

## How to interpret diversity experiments

如果 `diversity=0.0` 和 `diversity=0.6` 都没有选中目标页面，通常说明页面与 query 的语义匹配不足，或者内容缺少独特信息。此时不要急着加表格和 FAQ，先检查页面是否真正回答 query、是否有一手证据、是否包含目标实体、是否用用户会问的语言表达。

如果 baseline 没选中目标页面，但多样化后选中，说明页面有独特角度，但被近似重复 cluster 压住。内容策略上应该强化独特信息：原创数据、垂直案例、特殊实体组合、真实流程、方法论、实验结果。技术策略上可以考虑更好的 chunk boundary、metadata、query rewriting 或 hybrid retrieval。

如果 baseline 选中目标页面，但多样化后掉出，说明页面可能靠“相似”赢，而不是靠“不可替代”赢。它和其他高相关页面太像，一旦系统要求证据池更宽，它就不是必要来源。这个结果对内容团队很有价值：继续写更通用的定义不会提高 GEO，必须增加新信息。

如果目标页面在多种策略和多种 diversity weight 下都稳定保留，说明它拥有强内容地位。这样的页面通常有明确实体、原始数据、可验证来源、独特表格、清楚步骤或专门场景。它值得被升级成 hub，并通过内部链接、schema、作者信号和外部提及进一步强化。

## Pyversity and the larger GEO research stack

Pyversity 只解决检索候选集多样化问题，但它可以和其他 GEO 工具组成更完整的研究栈。BM25 或 keyword retrieval 用来保留精确词匹配；dense retriever 用来捕捉语义相似；cross-encoder reranker 用来重新评估 query-document relevance；Pyversity 用来避免 top-k 同质化；LLM evaluator 用来判断最终答案是否引用并正确复述。

这个栈对应真实 answer engine 的多个阶段。传统 SEO 团队常只看页面内容和排名，忽略候选集质量；RAG 工程团队常只看 recall 和 answer accuracy，忽略品牌可见性；GEO 研究需要把两者接起来：页面有没有进入候选、候选是否多样、答案是否采用、引用是否准确、品牌是否被正确归因。

因此，Pyversity 不应该单独被理解成“提升 RAG 质量的小库”。它更像一个 research lens：通过可控多样化，观察内容在检索层的竞争力。对 The GEO Community 这类内容站来说，它能帮助回答一个现实问题：一篇文章到底因为独特所以被 AI 采用，还是因为 corpus 里没有更好替代品才出现？

## What content teams should learn from Pyversity

第一，内容不要只追求更完整，还要追求更不可替代。一个 3000 字通用指南可能比 800 字原创实验更容易被过滤，因为它和许多现有页面太像。第二，证据要有角度。普通统计和二手引用常常无法增加语义距离；一手数据、方法细节、失败案例、特殊行业条件更有用。

第三，页面结构会影响 chunk 多样性。如果每个 H2 都以同样模板开头，embedding 可能把多个段落压到相似空间。更好的做法是让每个小节承担不同信息功能：定义、机制、实验、限制、案例、步骤、FAQ。这样同一页面内的 chunks 也更容易覆盖多个检索意图。

第四，内部链接应该围绕语义差异组织。不要只把所有相关文章互链成一团，而要让 framework、glossary、technical guide、benchmark、tool page 各自承担不同角色。这样搜索和 AI 系统看到的不是重复内容，而是一个有层级的主题图谱。

第五，GEO 实验应记录失败。Pyversity 最能暴露“看起来相关但没有新信息”的页面。把这些失败结果保存下来，能帮助编辑避免继续生产同质内容。真正的 GEO moat 不是写得更多，而是让每个页面都贡献别人没有的证据或视角。

## Implementation checklist for Pyversity experiments

开始实验前，准备五个文件：queries.csv、corpus.jsonl、embeddings.npy、baseline_results.csv、diversified_results.csv。queries.csv 保存 prompt、intent、target entity、expected page；corpus.jsonl 保存 URL、title、body、source type、domain、date、metadata；embeddings.npy 保存文档向量；两个 results 文件保存排序、策略、diversity weight、target rank 和 pairwise distance。

实验后，生成一张诊断表：目标页面是否进入 baseline top-k；是否进入 diversified top-k；进入后是否被 LLM 答案引用；引用是否准确；被谁替代；替代页面提供了什么独特信息。这个表比单纯的“AI 是否引用我”更有行动价值。

当你发现页面被 competitor 替代，不要只模仿它的表面结构。要问它占据了哪个 semantic cluster：它有更多数据、更强品牌、更明确用例、更稀缺案例，还是更清楚的步骤？Pyversity 会告诉你谁被选中，内容分析要告诉你为什么。

## Strategy selection matrix for GEO teams

Pyversity 支持多种 diversification strategy，不同策略适合回答不同诊断问题。GEO 团队不应该只固定使用 MMR，而应该把 strategy 当成镜头切换。MMR 更适合日常内容审计，因为它同时考虑相关性和差异；MSD 更适合找语义边界，因为它会偏向彼此距离更远的文档；DPP 更适合小规模高价值候选集，因为它能用集合概率表达多样性；COVER 更适合测试主题覆盖，因为它关注候选集是否覆盖足够多语义区域。

| GEO 问题 | 推荐 strategy | 观察指标 | 内容动作 |
| --- | --- | --- | --- |
| 我的页面是否只是和竞品太像？ | MMR | target rank、selected cluster、average pairwise distance | 增加原创数据、案例、限制条件和专家解释 |
| 主题集群是否覆盖过窄？ | COVER | semantic cluster coverage、missing intent | 新增对比页、故障排查页、术语页或案例页 |
| 哪些页面在强多样性下仍然保留？ | MSD | survival rate across weights | 把稳定页面升级为 hub 或 evidence page |
| 小型 benchmark 是否被单一来源主导？ | DPP | source diversity、domain mix | 加入第三方文档、论文、社区讨论和官方资料 |

这个矩阵的目的不是替代人工判断，而是让内容会议更具体。与其争论“这篇文章是不是够好”，不如问：在 MMR 0.6 下它为什么被替代？替代它的页面提供了哪个语义角度？我们的页面要不要补这个角度，还是应该承认那不是我们的任务？

## A repeatable Pyversity audit workbook

一个可复用 workbook 可以分成四张表。第一张是 query inventory，记录 query、intent、目标品牌、目标页面、期望证据、业务优先级。第二张是 corpus inventory，记录 URL、标题、来源类型、作者、发布日期、内容长度、主题标签和是否属于自家站点。第三张是 ranking runs，记录 retriever、embedding model、strategy、diversity weight、top-k、target rank 和替代页面。第四张是 synthesis evaluation，记录 LLM 是否引用目标页面、是否引用竞争页面、答案是否准确、遗漏了哪些事实。

最重要的是保留 run id。每次实验都应该有固定编号，能回溯 query set、corpus version、embedding model 和参数。GEO 团队经常在一个月后发现“我们之前好像测过”，但找不到当时的候选集和参数。没有 run id，就无法判断页面表现变化来自内容更新、模型更新、搜索结果变化，还是实验设置变化。

建议字段如下：

| Field | 用途 |
| --- | --- |
| `query_id` | 让同一个问题跨策略、跨时间对比 |
| `intent_type` | 定义型、比较型、教程型、购买型、排错型 |
| `source_type` | 自家站、竞品、官方文档、论文、新闻、论坛 |
| `strategy` | MMR、MSD、DPP、SSD、COVER |
| `diversity_weight` | 0.0 到 1.0 的多样性强度 |
| `target_rank_baseline` | 纯相关性排序中目标页面位置 |
| `target_rank_diversified` | 多样化后目标页面位置 |
| `replacement_url` | 目标被谁替代 |
| `replacement_reason` | 替代页面的独特信息 |
| `answer_used_source` | LLM 最终答案是否使用该来源 |

这个 workbook 可以先用 spreadsheet 管理，等实验稳定后再自动化。早期手动维护反而有好处：编辑、SEO 和工程团队会一起看见“内容为什么进不了上下文”，而不是只收到一个黑箱分数。

## How to connect Pyversity with article refreshes

Pyversity 实验真正有价值的地方，是把 retrieval diagnosis 变成具体 rewrite brief。假设一个页面在 baseline top-10 中排名第 7，但在 MMR 0.6 下掉出 top-10，说明它相关但不独特。此时 brief 不应该写“扩写到 3000 字”，而应该写“增加一个竞品没有的一手表格、一个真实案例、两个限制条件和一个可验证数据源”。

如果页面在 baseline 和 diversified ranking 中都没有出现，先不要改文风。更可能的问题是 query-document match 不足。内容团队应检查标题、H1、H2、开头 100 words、实体名称、同义词和问题表达。很多页面不是质量差，而是没有用目标用户和 AI 系统会用的语言表达主题。

如果页面在 diversified ranking 中出现，但 LLM synthesis 没有引用它，问题可能在生成阶段。页面已经进入候选集，但段落不够可摘取，证据不够明确，或者答案所需事实藏在长段落中。此时要做 section-level rewrite：把结论前置，拆小段，补数据、来源、FAQ 和表格。

如果页面稳定被选中且被正确引用，下一步不是继续重写，而是强化它的站点角色。给它更多内部链接，加入相关资源页，完善 Article schema 和 author bio，建立外部引用或社区讨论，让它成为主题集群中的 authority node。

## Team workflow: who should own what?

Pyversity 实验跨越内容、工程和分析，最好拆成明确 owner。SEO 或 content lead 负责 query set 和 rewrite brief；工程或 data owner 负责 corpus extraction、embedding generation 和 pipeline；editor 负责判断替代页面的信息增益；analytics owner 负责把实验结果和真实 AI citation、Search Console、日志数据对齐。

每周可以选择 5 到 10 个高价值 query 运行一次。会议不需要讨论所有结果，只看三类异常：目标页面被相似竞品替代；目标页面进入候选但答案没有引用；非预期页面反复被选中。第一类说明信息增益不足，第二类说明答案结构不足，第三类说明站点内部主题定位可能和团队想象不同。

这个工作流适合 The GEO Community 这样的内容站，也适合 SaaS 文档、产品比较页、行业报告和研究库。只要 AI answer 需要从多个页面中选择证据，retrieval diversity 就会影响最终可见性。

## Common mistakes when using Pyversity

第一个错误是把 diversity 当成目标。多样性本身不是好结果，相关且互补的多样性才有价值。如果 diversity weight 太高，系统可能选择语义距离远但不够相关的页面，让答案质量下降。GEO audit 应该比较多个 weight，而不是把最高多样性当成最优。

第二个错误是 corpus 太窄。只把自家站点放进 corpus，实验会告诉你自家页面之间谁更独特，但不能告诉你真实 answer engine 为什么选竞品、论文或官方文档。至少要加入 SERP top results、竞品页面、官方资料和高权威第三方内容。

第三个错误是忽略 chunking。整篇文章 embedding 和按 section/chunk embedding 会得到不同结果。AI search 和 RAG 系统通常处理 chunks，而不是完整网页。对 GEO 来说，最好同时测试 page-level 和 section-level corpus，观察目标页面到底是整篇强，还是只有某几个段落强。

第四个错误是只看排名，不看答案采用。进入 top-k 只是第一关。最终答案是否引用、是否准确复述、是否把品牌放进正确类别，才是 GEO 关心的结果。因此 Pyversity 后面最好接一个固定 prompt 的 synthesis test。

第五个错误是过度相信单次结果。embedding 模型、query wording、候选集、reranker 都会改变排序。真正可靠的信号来自多 query、多 strategy、多时间点的一致趋势。

## Minimum reproducible GEO diversity experiment

如果团队想把 Pyversity 变成可复现研究，而不是一次性 notebook，可以先做一个最小实验包。

第一步，准备 `queries.csv`。每行包含 query、intent、target_url、target_entity 和 expected_evidence。intent 至少覆盖定义型、比较型、实施型、购买型和故障排查型。GEO 的问题通常不是单个关键词，而是一组用户会问 AI 的自然语言问题。

第二步，准备 `corpus.jsonl`。每行包含 url、title、body、source_type、domain、date、author 和 tags。corpus 不能只放自家站点；还要加入竞品、官方文档、论文、社区讨论和高权威第三方来源。否则实验只会告诉你自家页面之间谁更相似，不能模拟真实 answer engine 的竞争环境。

第三步，生成 embeddings 并保存版本。记录 embedding model、维度、chunking 方法、是否使用 page-level 或 section-level 文本。后续结果变化时，你要能判断是内容变了，还是 embedding 或 chunking 变了。

第四步，跑 baseline retrieval。记录 top-k、target rank、相似页面、平均 pairwise distance 和重复 cluster。第五步，跑 Pyversity 多样化，至少比较 diversity 0.0、0.4、0.6、0.8。第六步，把两组候选交给同一个 LLM synthesis prompt，看目标页面是否被引用、是否被正确复述。

这个最小实验不追求完全复制 Google 或 Perplexity。它的价值是把“没有被 AI 引用”拆成可诊断问题：没有进入候选集、进入但被多样化挤掉、进入但生成阶段不用、被引用但表达错误。

## Page-level versus chunk-level testing

Pyversity 实验要同时考虑 page-level 和 chunk-level。整页 embedding 适合判断一篇文章整体是否占据独特语义位置；chunk embedding 更接近 RAG 和 AI search 的实际工作方式，因为系统常常检索段落而不是完整网页。

Page-level 测试适合回答：“这篇文章在主题集群里是否不可替代？”如果它在高 diversity weight 下仍然进入 top-k，说明整篇文章有清晰的独特定位。这样的页面适合作为 hub、framework、benchmark 或 original research。

Chunk-level 测试适合回答：“哪个 section 真正有引用价值？”有些文章整篇很普通，但某个表格、FAQ、公式或实验段落很独特。GEO 编辑可以把这些强 chunk 提前、扩展、加来源、加内部链接，让它们更容易被抽取。

如果 page-level 强但 chunk-level 弱，说明文章定位好，但段落结构不够可摘录。应做 answer architecture rewrite。如果 chunk-level 强但 page-level 弱，说明局部有价值，但整篇缺少清晰主题。应强化标题、开头、摘要、内部链接和 hub 关系。

## How Pyversity informs content pruning

多样化实验不只告诉你写什么，也告诉你删什么或合并什么。如果两个自家页面在多数 query 下总是互相替代，且提供相同事实，就可能存在内容重复。继续同时维护它们会稀释主题信号，也会让 AI 系统不清楚哪个页面是 canonical source。

可以按三种方式处理。第一，merge，把重复内容合并成一个更强的 canonical guide。第二，differentiate，让两个页面承担不同 intent，例如一个做定义，一个做实施，一个做对比。第三，redirect or deprecate，如果旧页面没有独特信息，也没有业务价值，可以把它从核心集群移出。

这和传统 SEO 的 cannibalization 分析相似，但对象更细。SEO 看多个页面是否抢同一关键词；GEO 看多个页面是否在 retrieval space 里提供同质证据。Pyversity 给团队一个可观察窗口，让内容维护更像知识库治理。

## Signals to add when a page is too replaceable

如果 Pyversity 结果显示页面容易被替代，重写 brief 应该要求信息增益，而不是只要求更长。

可加入的信号包括：

- 原创数据：小样本实验、内部观察、benchmark、survey 或 logs。
- 具体方法：步骤、参数、工具、输入输出、失败条件。
- 稀缺案例：垂直行业、特殊实体组合、真实限制。
- 专家解释：为什么某个结果成立，什么情况下不成立。
- 对比表：把相似工具、策略或页面类型拆开比较。
- 维护记录：发布日期、更新日期、变更原因和过期风险。

这些信号会增加 semantic distance，也会提高 human usefulness。GEO 的理想状态不是“模型因为没有别的选择才引用我”，而是“模型即使有很多来源，也需要这篇页面提供的独特证据”。

## Where this fits in the local site

Pyversity 文章属于本地站的 retrieval and RAG cluster。它应该连接到 [Embedding Architecture](/blogs/generative-engine-optimization/embedding-architecture-ai-retrieval)、[Hybrid Search in RAG](/blogs/generative-engine-optimization/hybrid-search-bm25-vectors-rag)、[Chunking and Metadata Filters](/blogs/generative-engine-optimization/chunking-metadata-filters-rag)、[Query Rewriting](/blogs/generative-engine-optimization/query-rewriting-multiquery-rag)、[LLM Evals Guide](/resources/llm-evals) 和 [GEO Benchmarks](/benchmarks)。

后续新增 retrieval 实验时，可以把结果写回这个 cluster：如果主题是候选集多样化，链接回 Pyversity；如果主题是向量空间和相似度，链接回 embedding architecture；如果主题是答案质量，链接回 LLM evals。这样本地站会形成一张可维护的技术知识图谱。

## About the author

### Rohit Singh

Rohit Singh 是 The GEO Community 与 [GeoZ AI](https://www.geoz.ai/) 的创始人，关注 Generative Engine Optimization、AI search visibility、RAG evaluation 和 agentic search 基础设施。你可以在 [LinkedIn](https://www.linkedin.com/in/rohitsingh017) 继续关注他。

## FAQ

### What does Pyversity actually do in plain terms?

它把检索结果重新排序，让 top-k 不只是最相似，也尽量覆盖更多不同语义角度。简单说，就是减少“十篇文章都在讲同一件事”的情况。

### Is Pyversity free and open source?

是。核心项目在 [GitHub](https://github.com/Pringled/pyversity) 上开源，核心依赖很轻，主要是 NumPy。

### What is the difference between Pyversity and a cross-encoder reranker?

Cross-encoder reranker 主要重新评估 query-document relevance；Pyversity 关注 selected set 内部的多样性。两者可以串联：先 rerank，再 diversify。

### Does higher diversity in Pyversity always improve LLM answer quality?

不一定。过高 diversity 会牺牲相关性。GEO audit 里更推荐比较 0.0、0.4、0.6、0.8，而不是只看一个值。

### How does Pyversity relate to MMR in LangChain?

MMR 是一种常见多样化思想，Pyversity 提供 MMR，也提供 MSD、DPP、SSD、COVER 等更多策略，适合做系统化研究。

### What Python version and dependencies does Pyversity require?

核心包面向 Python 3.8+，依赖很轻。生产 pipeline 中的 embedding、retriever、LLM client 由你的系统自行选择。

## Related reading

- [The Original GEO Paper: What Princeton and IIT Delhi Actually Found](https://thegeocommunity.com/blogs/generative-engine-optimization/geo-princeton-paper-original-study)
- [SAGEO Arena: The First Full-Pipeline GEO Benchmark](https://thegeocommunity.com/blogs/generative-engine-optimization/sageo-arena-realistic-geo-benchmark)
- [MAGEO: The GEO Framework That Learns From Every Edit](https://thegeocommunity.com/blogs/generative-engine-optimization/mageo-multi-agent-geo-reusable-strategy-learning)
- [Hybrid Search in RAG](https://thegeocommunity.com/blogs/generative-engine-optimization/hybrid-search-bm25-vectors-rag)
- [Chunking and Metadata Filters in RAG](https://thegeocommunity.com/blogs/generative-engine-optimization/chunking-metadata-filters-rag)
- [Query Rewriting and Multi-Query Retrieval](https://thegeocommunity.com/blogs/generative-engine-optimization/query-rewriting-multiquery-rag)
- [GEO vs SEO: How the User Funnel Has Changed](https://thegeocommunity.com/blogs/generative-engine-optimization/geo-vs-seo-user-funnel)

## Continue your learning journey

如果你正在把 retrieval、RAG 和 GEO 放进同一个研究体系，可以从 [Start Here](https://thegeocommunity.com/start) 进入学习路径，再结合 benchmark、RAG audit 和内容策略实验逐步扩展。

## Read next

### Is Your Website AI Agent-Ready? The New Lighthouse Agentic Browsing Audit Tests Three Things Most SEOs Miss

[这篇文章](https://thegeocommunity.com/blogs/generative-engine-optimization/website-ai-agent-readiness-lighthouse-audit) 解释 Lighthouse Agentic Browsing 报告如何检查 accessibility tree、WebMCP 和 llms.txt。

### Best Courses for AI SEO, AEO & GEO: Ranked Picks for 2026

[课程对比](https://thegeocommunity.com/blogs/generative-engine-optimization/best-courses-ai-seo-aeo-geo-2026) 梳理 CXL、Coursera、Jellyfish、Reforge 和 The GEO Community 等学习路线。

### MAGEO: The GEO Framework That Learns From Every Edit and Gets Smarter Across Engines

[MAGEO](https://thegeocommunity.com/blogs/generative-engine-optimization/mageo-multi-agent-geo-reusable-strategy-learning) 展示多 agent GEO 框架如何沉淀可复用策略，并跨引擎学习。
