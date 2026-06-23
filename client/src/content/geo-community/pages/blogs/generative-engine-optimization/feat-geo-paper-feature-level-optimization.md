---
path: "/blogs/generative-engine-optimization/feat-geo-paper-feature-level-optimization"
kind: "blog"
title: "FeatGEO：为什么原始 9 种 GEO 策略正在失效"
source_title: "FeatGEO: Why the Original 9 GEO Tactics Are Failing on Modern AI Engines (and What's Replacing Them)"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/feat-geo-paper-feature-level-optimization"
author: "Rohit Singh"
date: "28 Apr 2026"
status: "ready"
---

> FeatGEO 是 2026 年一篇重要论文提出的 feature-level GEO 框架。它重新测试了早期 GEO 论文中的 9 个经典策略，结论很不舒服：很多曾经有效的 token-level tactics，在 GPT-4o-mini、Gemini 2.5 Flash 和 Qwen-plus 上已经低于未修改 baseline。

如果你仍然把 GEO 理解成“加引用、加统计、语气更权威、塞关键词”，这篇论文需要认真读。它不是说统计和引用没有价值，而是说把这些东西当作后期补丁，往已经流畅的 LLM-generated 页面上硬贴，可能会降低 citation visibility。

FeatGEO 的替代思路是：不要逐词改写，而是把页面抽象成结构、内容、语言三个层面的 feature vector，再用多目标优化寻找 visibility 和 quality 的 Pareto front。换句话说，GEO 正在从 checklist discipline 变成 design discipline。

原站把这篇论文称为对早期 GEO playbook 的“quietly devastating”复验，因为它不是否认 2023 年 Princeton/IIT Delhi 论文的发现，而是说明环境已经变了。早期策略之所以有效，是因为当时很多网页结构薄、证据少、语气不稳，增加统计、引用、quote 和更清楚的表达确实能填补明显缺口。到 2026 年，大量页面已经由 LLM 协助写作，本身就流畅、结构完整、证据密度较高，再把旧 checklist 机械叠上去，反而会让页面呈现出过度优化、不自然和重复的痕迹。

FeatGEO 的核心价值在于把“优化内容”改成“优化内容特征”。它把页面写作拆成可调参数：标题层级多深、列表密度多高、文档长度多长、统计和引用要多少、语气应更权威还是更自然、可读性和关键词聚焦怎样平衡。然后用多目标搜索同时考虑 citation visibility 和 content quality，而不是只追求某一个分数。这和真实内容运营更接近：有的页面为了被 AI answer 引用，有的页面为了让人深读，有的页面要兼顾品牌调性。

**本文导读：**旧策略为何失效 · 测试了哪些引擎和方法 · 哪些操作开始拖后腿 · 为什么添加引用可能伤害可见性 · saturation effect · feature-level optimization · FeatGEO 流程 · 关键特征 · visibility 与 quality 的取舍

![FeatGEO feature-level multi-objective optimization framework for citation visibility — Pareto front diagram showing the trade-off between visibility and quality across structural, content, and linguistic features](https://thegeocommunity.com/images/featgeo_banner.webp)

## 为什么原始 GEO 策略在 2026 年开始失效？

原始 Princeton/IIT Delhi GEO 论文测试了 9 个策略：

- 权威语气
- 添加统计数据
- 关键词堆叠
- 引用来源
- 添加引语
- 更易理解
- 流畅度优化
- 增加独特词汇
- 使用技术术语

当时的结论是，Cite Sources、Quotation Addition、Statistics Addition 等策略能明显提高可见性，因此它们成为很多 GEO checklist 的基础。

FeatGEO 重新在现代引擎上测试后发现：这些方法对 LLM-generated 页面往往不再有效。论文报告的对比包括：

| 引擎 | Baseline visibility | 最佳 heuristic GEO | 最佳 AutoGEO |
| --- | ---: | ---: | ---: |
| GPT-4o-mini | 13.34% | 12.21% | 12.12% |
| Gemini 2.5 Flash | 8.89% | 5.62% | 7.04% |
| Qwen-plus | 5.20% | 3.72% | 4.25% |

每个引擎上，最佳 classical heuristic 都低于未修改 baseline。Gemini 上尤其明显，最佳 heuristic 只恢复了 baseline visibility 的一部分。

这不代表早期论文错了。更准确的解释是环境变了：2023 年的 baseline 页面较弱，表面补丁能填补明显缺口；2026 年的 baseline 内容更流畅，很多页面已经由 AI 辅助写作。继续追加 token-level edits，会破坏自然性和结构协调。

原站特别点名了 9 个早期策略的历史影响：Authoritative tone、Statistics Addition、Keyword Stuffing、Cite Sources、Quotation Addition、Easy-to-Understand、Fluency Optimization、Unique Words、Technical Terms。过去两年里，很多 GEO checklist 几乎就是把这 9 个策略变成操作表。然而 FeatGEO 在 GPT-4o-mini、Gemini 2.5 Flash 和 Qwen-plus 上复跑后发现，平均 heuristic GEO 方法比什么都不做更差。这个结论对从业者很刺耳，因为它意味着“照着旧论文做”已经不能保证提升。

这也解释了为什么原站标题用“failing”，而不是“less effective”。如果一个策略只是效果变弱，团队还可以当作低优先级优化；如果它在现代引擎上变成负效应，继续批量应用就会直接伤害 AI visibility。特别是对 LLM-generated pages，内容本来已经有高 fluency 和标准化结构，额外插入统计、引用或权威语气会改变文本节奏，让模型更难判断它是一篇自然形成的有用内容，还是为了被引用而加工的页面。

## FeatGEO 实际测试了哪些引擎和方法？

FeatGEO 使用 GEO-Bench 作为基础，也就是原始 GEO 研究里的 10,000 个 query、25 个 domain，但评价方式更新了。

它测试了三个生成引擎：

- GPT-4o-mini
- Gemini 2.5 Flash
- Qwen-plus

方法族包括：

- Baseline：未修改 advertiser page。
- GEO methods：原始 9 个 token-level heuristics。
- AutoGEO-global：自动学习全局内容偏好并应用到所有页面。
- AutoGEO-instance：按 query 自适应生成 proxy queries，再合并 instance-level rules。
- FeatGEO：feature-level multi-objective optimization。

另一个关键更新是 topic-level evaluation。原始 query 级优化很不稳定，因为真实用户不会只问一个固定短语。FeatGEO 聚合语义相关 query 的 citation 行为，在 topic 层面建模哪些 feature 更稳定。

这对实操很重要。内容团队不应该只优化“一个主关键词”，而应定义一组语义相关问题，再围绕整个 topic space 设计页面。

FeatGEO 继续使用 GEO-Bench 的基础规模：10,000 个 query，25 个 domain。这让它和原始论文之间有可比性，同时又把评价对象换成了现代生成引擎。原始 Princeton 研究更多依赖 simulated GPT-4 RAG，并用 live Perplexity 交叉验证；FeatGEO 则直接把 GPT-4o-mini、Gemini 2.5 Flash 和 Qwen-plus 放进实验矩阵。这样做的结果是可以看到平台差异：有些 feature 在 GPT 系列上较稳，在 Gemini 或 Qwen 上就会变成不同权重。

方法族的扩展也很重要。AutoGEO-global 代表“学出一套全局规则，然后到处用”；AutoGEO-instance 代表“每个 query 自适应生成规则”；FeatGEO 则进一步把优化目标从规则文本转成 feature vector。原站的实操解读是：如果你的团队只是按全站统一模板加引用、加 FAQ、加统计，那更接近 AutoGEO-global；如果你按每个关键词写不同 brief，更接近 AutoGEO-instance；如果你在页面规划阶段就决定 feature trade-off，才接近 FeatGEO。

## 到底哪些策略失效了？原因是什么？

最重要的发现是 regime asymmetry。

对弱的人类原创页面，经典 GEO heuristics 仍可能有帮助，因为它们补上了结构和证据缺口。但对已经流畅的 LLM-generated 页面，同样策略可能伤害 visibility。

原因是 saturation effect。早期页面有明显问题：缺少 heading、证据密度低、语言不流畅、结构松散。加统计、加引用、改善流畅度会提高引擎对内容的信任。今天许多页面已经具备这些表面特征，再硬加一层，就会变成冗余、堆叠和不自然。

实操翻译：如果你的文章已经结构清楚、表达自然、证据足够，继续按旧 checklist 加引用和关键词，可能不会提高可见性，反而让页面看起来像为了 AI 引用而过度加工。

论文里最关键的不是某一个 heuristic 掉线，而是 human-written pages 和 LLM-generated pages 之间的 regime asymmetry。对原本粗糙的人类页面，AutoGEO-global 仍能把 visibility 从约 18.72% 推到约 22.86%，说明旧策略并非完全失效。失效发生在已经被 AI 或强模板打磨过的内容上：这些页面的 baseline 已经高，再加 token-level patch 就不再是修补，而是扰动。

从内容运营角度看，这会改变旧内容审计。2023-2025 年很多团队把文章批量“GEO 化”：每段加 statistic、每节加 citation、每个概念加 definition、每篇加 authoritative tone。FeatGEO 的信号意味着，这些页面需要重新分层检查。低质量旧文可以继续补证据，高质量 AI-assisted 文章则可能需要减少过密引用、删掉重复统计、恢复自然段落节奏，并让结构在 topic 层面更完整。

## 为什么给 LLM 生成页面继续加引用，反而可能伤害可见性？

这点最反直觉。原始 GEO 论文把 Cite Sources 视为强策略；FeatGEO 发现，对 LLM-generated 内容，添加引用在三个现代引擎上都降低 visibility。

可能机制有两个。

第一，citation stuffing 读起来不真实。一个 600 词页面突然塞进 12 个 inline citations，会形成很强的引用簇模式。现代模型可能把它视为不自然或低质量信号。

第二，自然性和整体 coherence 变得更重要。论文的 feature analysis 暗示，Gemini 和 Qwen 这类引擎不只是看有没有证据标记，也看页面是不是一篇组织良好的真实内容。单独补证据标记，可能会破坏文档层面的流畅性。

这不是说不要引用。正确做法是把 citation density 当作 feature 之一，与统计密度、heading depth、list density、fluency、readability 等一起权衡，而不是把“加引用”当作万能补丁。

原站在这里做了一个细微区分：引用本身仍然可能是强 feature，但“后加引用”是另一回事。自然引用通常和论点、数据、方法、来源背景一起出现，读者能看出它为什么在这里；citation stuffing 则是在已有文本上硬塞来源，结果是段落中出现密集外链、括号和来源名，却没有增加真正的信息量。现代 LLM 在决定是否引用一个页面时，可能更看重整体文档是否像可信内容，而不是单纯数链接数量。

这对中文复刻站后续更新也有提醒：不要把每篇文章都改成脚注堆。更好的写法是先给出清楚 claim，再把来源、数字和限制放在同一语义块里。例如“某研究在 10,000 个 query 上发现 X”比“X（来源 1）（来源 2）（来源 3）”更适合 AI 检索。FeatGEO 的思路是让 optimizer 决定 citation density 的合适范围，而人工团队则可以用 editor judgment 避免引用密度压过内容本身。

## 什么是让 heuristic GEO 失灵的 saturation effect？

可以用一个简单类比理解：早期优化像修糟糕代码，很多 aggressive transformation 都能带来提升；后期优化像对已经调优的代码继续乱改，可能破坏 runtime 已经偏好的模式。

2023 年很多网页 baseline 弱，GEO patch 有明显边际收益。2026 年内容生产工具、AI 辅助写作、CMS 模板和 GEO 最佳实践都提高了内容地板。继续用同一套 token-level tactics，收益趋近于零甚至为负。

这也解释了为什么 GEO 不能停留在“给现有文章加东西”。真正有效的优化要发生在结构设计阶段：决定 topic coverage、证据密度、页面长度、标题层级、列表密度、引用策略和语气，而不是发布前补三条统计。

saturation effect 还会让不同站点的最佳策略分化。一个没有专业作者、没有数据、没有结构的小站，可能仍然从经典 GEO tactics 获得明显收益；一个已经有强编辑、强数据、强模板的站，最需要的可能是删减、聚焦和重新组织。原站的隐含建议是先诊断页面处在哪个成熟度区间，再决定是否使用旧策略，而不是把所有 URL 放进同一个自动改写流水线。

这个变化也和搜索生态有关。AI-assisted writing 提高了网页平均流畅度，CMS 模板提高了标题和列表质量，GEO 社区传播了引用和统计意识，导致 baseline 集体上移。当所有人都加统计时，“有统计”不再稀缺；当所有人都能写流畅段落时，“fluency”不再区分优劣。下一层竞争就转向 feature configuration：同样都有统计，多少才合适？同样都有标题，多深才不显得碎？同样都有引用，哪些来源才真的帮助 citation visibility？

## FeatGEO 比 token-level rewriting 更适合新阶段吗？

FeatGEO 的核心优势是把优化单位从“词和句子”提升到“页面特征”。

| Token-level GEO | Feature-level GEO |
| --- | --- |
| 修改现有 prose | 设计 feature spec，再生成页面 |
| 通常面向单个 query | 面向 topic query set |
| 单目标：提升 visibility | 多目标：visibility 和 quality |
| 内容和风格纠缠 | 先抽象 feature，再实现文本 |
| 输出一个改写版本 | 输出一组 Pareto-optimal trade-offs |

FeatGEO 把页面抽象成 13 个 feature，覆盖结构、内容和语言。优化器不是直接改句子，而是在 feature 空间里搜索。例如 statistics_density、citation_density、heading depth、list density、fluency、readability、keyword focus 等。

这对人工团队同样有启发。即使你不跑 NSGA-II，也可以先问：这篇页面的目标是 visibility-first 还是 quality-first？它需要多少统计？多少引用？多深的标题层级？适合短而密，还是长而清楚？

Token-level rewriting 的问题在于它无法独立控制“内容”和“表达”。你让模型把段落改得更权威，它可能同时改变事实顺序；你让它加统计，它可能破坏原有故事线；你让它更易懂，它可能删掉技术精度。FeatGEO 先把页面抽象成 feature spec，再让 LLM 根据 spec 生成文本，相当于把高层策略和低层写作拆开。这个拆分对团队协作很有用：策略负责人决定 feature target，编辑负责最终自然度，工程可以测 visibility 和 quality。

Topic-level modelling 是另一个可直接落地的部分。真实用户不会只问“best ai seo tools”，他们还会问“how to measure ai visibility”、“which pages get cited by ChatGPT”、“what replaces backlinks in AI search”。如果页面只为一个 query 写，可能在相邻意图上表现很差。FeatGEO 通过 topic-consistent citation exemplars 找出一组查询共同引用的页面，等于用引擎行为反推“这个主题真正需要哪些特征”。

## FeatGEO 实际上怎样优化页面？

论文中的 pipeline 分四步。

第一，topic and exemplar identification。给定一个 topic，系统生成一组语义相关 query，跑过目标生成引擎，收集被引用页面。跨多个 query 重复出现的页面，成为 topic-consistent citation exemplars。

第二，feature extraction。每个 exemplar 被抽象成一个 13 维 feature vector，覆盖三个层面：

- Structure：heading level、list density、document length 等。
- Content：statistics density、citation density、quotation density、unique information、technical terminology。
- Language：authoritative tone、fluency、readability、keyword focus。

第三，multi-objective search。系统使用 NSGA-II，在 visibility 和 quality 两个目标之间进化 feature vectors，逐步逼近 Pareto front。

第四，page realization。最终 feature spec 被 LLM 实现成真实页面。输出不是唯一答案，而是一组可选页面，每个代表不同 trade-off。

论文报告的 headline gains 是：

| Engine | Baseline | FeatGEO | Improvement |
| --- | ---: | ---: | ---: |
| GPT-4o-mini | 13.34% | 18.31% | +37% |
| Gemini 2.5 Flash | 8.89% | 15.35% | +73% |
| Qwen-plus | 5.20% | 10.17% | +96% |

更有意思的是，引擎越难被旧 heuristic 影响，FeatGEO 的相对优势越大。

四步 pipeline 里最像“研究系统”的是 exemplar identification。系统不是凭空猜什么页面好，而是先让目标引擎回答一组同主题 query，观察哪些页面反复被引用。这些重复出现的页面就是 topic-consistent citation exemplars。它们不一定传统排名第一，但它们在生成式回答里被系统反复选中，说明它们携带了当前引擎偏好的结构、证据和语言特征。

Feature extraction 不是把页面变成僵硬模板，而是提取软控制信号。比如 statistics_density=0.7 不意味着必须每 100 字放一个数字，而是告诉生成器这篇页面应明显强调量化证据；heading_depth 较高不意味着无限拆标题，而是提示页面需要清晰层级；readability 较高或较低会影响术语解释和句子复杂度。原站强调这些数值最终会被转成 prompt-level instructions，而不是作为硬规则直接拼到页面里。

NSGA-II 的作用是维护多样性，而不是只找一个最高 visibility 方案。多目标优化里，一个方案如果 visibility 更高但 quality 更低，另一个 quality 更高但 visibility 更低，二者可能都不是对方的绝对替代。这就是 Pareto front 的意义：给内容负责人一组可选方案，而不是假装存在唯一最佳文章。

## 哪些特征真正影响 citation visibility？

论文做了 ablation study：把某个 feature 固定在最低值，让其他 feature 优化，观察 visibility 变化。

大体结论是：

- Statistics density 和 citation density 是最强的 visibility contributors。
- Heading level、list density、document length 更稳定地提升 quality score。
- Fluency 和 keyword focus 有时有帮助，有时会和其他 feature 互动产生负效应。
- Unique information 和 technical terminology 并不总是正向，尤其当它们破坏整体可读性或相关性时。

两个实操 insight 很重要。

第一，内容 feature 更影响 citation visibility，结构 feature 更影响 quality。你需要决定哪一个是当前页面的主目标。

第二，feature interactions 比单独 feature 更重要。引用密度本身可能有帮助，但和过高统计密度、过低结构清晰度结合时可能变坏。这正是旧 checklist 无法处理的地方。

Ablation study 的启发是：不要把 feature 当成孤立开关。Statistics density 和 citation density 在很多主题里确实是 visibility 的强贡献者，但如果页面结构弱、语气太 promotional、列表组织混乱，更多统计也可能让读者和模型都更难理解。Heading level、list density 和 document length 往往更接近 quality signal，它们让内容可读、可扫描、可评估，却未必直接增加被引用字数。

Unique information 和 technical terminology 的结果尤其值得警惕。内容团队常以为“越独特越好”“越专业越好”，但生成式引擎引用的是能回答用户问题的材料，不是最稀有的词。独特信息如果偏离 topic intent，会拉低相关性；术语如果没有定义，会提高理解成本。FeatGEO 把这些 feature 放在交互空间里评估，避免了“某个指标越高越好”的直觉误导。

## 应该优先优化 visibility，还是 content quality？

FeatGEO 最有用的概念是 Pareto front。visibility 和 quality 不总是同向，有些 topic 下，想要更高 visibility 就会牺牲一些 quality；另一些 topic 下，两者可以一起提升。

论文举例显示，同一个 education-domain query 可以有两个 Pareto-optimal 方案：

- Visibility-first：高 statistics density、高 citation density、高 quotation density、更强 promotional framing，visibility 很高，但 quality 较低。
- Quality-first：更深 heading、更多 list、更长文档、更保守语气，quality 更高，但 visibility 低很多。

这给内容团队一个很实际的问题：这篇内容是为了被 AI 引用，还是为了让读者深入阅读？

两者不一定冲突，但优先级应该提前决定。Lead magnet、comparison page、数据摘要可能更偏 visibility-first；pillar content、品牌立场文章、长期 reference page 可能更偏 quality-first。

原站提到的 Appendix D 案例很能说明问题。同一个 education-domain query，可以得到两个都合理的页面：A 方案高 visibility，大量统计、引用、quote，语气更强，结构相对简单；B 方案高 quality，更深标题、更高列表密度、更长文档、更保守语气，但 citation visibility 低很多。它们不是一个对、一个错，而是服务目标不同。对增长团队来说，A 可能适合获取 AI answer 曝光；对品牌团队来说，B 更适合作为长期权威页。

不同 topic 的 Pareto front 形状也不同。Education 主题可能出现陡峭 trade-off，想要 visibility 就明显牺牲 quality；Food 主题可能更平滑，提升 visibility 不必损害可读性。这意味着 GEO 策略不能写成全站统一规则。每个内容 cluster 都应该有自己的 trade-off 判断：这个主题的用户是否需要深度阅读？AI 引擎是否偏好短证据块？品牌是否能接受更强 promotional framing？这些都应该进入 brief。

## 这些发现今天应该怎么落地？

不用马上给每篇文章跑 NSGA-II，但可以立刻改变工作流。

停止做这些事：

- 对已经流畅的内容机械套用旧 GEO checklist。
- 只优化一个 head-term query。
- 把 GEO 当成单目标问题，只追求 citation count。

开始做这些事：

- Think topics, not queries。每篇内容定义 5-10 个语义相关问题。
- 在写之前决定 visibility vs quality 的主目标。
- 在结构阶段设计 feature，而不是发布前 patch。
- 审计 2023-2025 年被过度 token-edited 的旧页面，测试是否需要回滚过密引用和统计。

继续做这些事：

- 谨慎添加统计和引用，它们仍然是强 feature，但必须自然。
- 投资清晰结构，heading、list、scannable sections 是跨引擎质量信号。
- 按目标引擎优化。GPT、Gemini、Qwen 的偏好并不相同。

更大的结论是：GEO 正在变成页面设计问题。未来赢的团队不是 checklist 最长的团队，而是能理解 feature space、topic space 和 trade-off 的团队。

可以把这篇论文转成一个实际发布流程。第一步，在 brief 阶段列出 topic query set，而不是只写一个关键词。第二步，手工收集或自动抓取这些 query 下被 AI 引用的页面，记录它们共同特征。第三步，为目标页面选择 feature target：长短、标题深度、统计密度、引用密度、quote 密度、语气、可读性。第四步，写作时围绕 feature target 生成，而不是写完再贴补丁。第五步，发布后在 ChatGPT、Perplexity、Gemini、Copilot 等引擎里监控是否被引用，并把反馈更新到下一轮 brief。

这也是本地复刻站后续可以直接沿用的维护方式。以后新增中文博客时，不只是翻译原文，还可以保留原站这种“论文发现 + 数据表 + 方法论 + 实操建议 + related reading”的结构密度。FeatGEO 本身的教训就是：内容要在设计层面保持完整，而不是靠最后一轮 checklist 把页面伪装成高质量。

## 特征 brief 模板

FeatGEO 最适合转成 brief，而不是发布后的修补清单。写作前可以先为每篇页面定义 feature target：

| Feature | Brief question |
| --- | --- |
| Topic query set | 这篇文章要服务哪 5-10 个语义相关问题？ |
| Statistics density | 是否需要原创数据、公开 benchmark、百分比、样本量？ |
| Citation density | 每个关键 claim 是否有来源或相关研究？ |
| Heading depth | 是否需要 H2/H3 拆出子问题？ |
| List density | 哪些内容应以步骤、表格、清单表达？ |
| Technical terminology | 哪些 canonical terms 必须出现并解释？ |
| Promotional framing | 这篇是客观解释、产品页、对比页还是观点页？ |
| Document length | 用户需要快速答案还是 reference guide？ |
| Quality target | 这篇更偏 visibility-first 还是 quality-first？ |

这张表能避免最常见错误：写完文章后才问“要不要加点统计和引用”。Feature-level optimization 的核心是设计内容形状，而不是堆素材。

## 给编辑使用的 Pareto workflow

不跑 NSGA-II 也可以借用 Pareto 思维。

第一步，做两个版本的 outline。Version A 偏 visibility：更多统计、引用、短段落、直接回答和可引用句子。Version B 偏 quality：更深解释、更多背景、更多限制、结构更完整。

第二步，针对目标 query 测试两个 outline。问自己：AI answer 更可能引用哪一个？人类读者更可能读完哪一个？品牌是否能接受 visibility-first 的语气？

第三步，选择折中点。有些页面可以 visibility-first，例如比较页、统计页、工具页；有些页面应 quality-first，例如原则文、框架文、学习路径和品牌立场页。

第四步，发布后复测。若 visibility 高但用户停留低，说明质量不足；若质量高但 AI citation 低，说明页面可能缺少可抽取 evidence blocks。下一轮迭代就有方向。

## 旧 GEO checklist 审计

2023-2025 年很多 GEO 内容会机械套用旧建议：加引用、加统计、加 authoritative tone、加 keywords、加 quote。FeatGEO 的价值是提醒团队检查这些做法是否已经过度。

审计旧页面时可以问：

- 是否为了加 citation 把来源塞进了不相关段落？
- 是否每段都有数字，但没有解释数字与用户问题的关系？
- 是否 quote 太多，反而削弱了原本清楚的答案？
- 是否 keyword focus 过强，导致自然语言变得重复？
- 是否所有页面都采用同一模板，而没有 topic-specific feature target？

如果答案是肯定的，应该先回滚过度编辑，再重新设计 feature balance。现代 AI engine 更能识别模式化优化，低质量改写可能不再带来收益。

## 分引擎记录 feature 偏好

FeatGEO 之所以重要，是因为不同 engine 对 feature 的响应不同。GPT、Gemini、Qwen 并不共享完全相同的 citation preference。一个在 Gemini 上有效的 feature 组合，未必在 GPT-4o-mini 上同样有效。

这意味着内容团队要把“引擎”加入实验表。每次测试记录：query、engine、page version、citation position、quoted passage、answer sentiment、competitors present、feature changes。几轮之后，你会发现某些 topic 下 Gemini 更重结构，某些 topic 下 GPT 更重直接回答，某些 topic 下 Perplexity 更重来源多样性。

不要把一次结果推广到全站。FeatGEO 的方法论更像 A/B infrastructure：它让团队持续观察 feature 与 visibility 的关系，而不是寻找永远有效的万能战术。

## 如何维护这个文章集群

本页应和几篇文章组成研究集群：[The Original GEO Paper](/blogs/generative-engine-optimization/geo-princeton-paper-original-study) 解释 2023 年基线，[How to Dominate AI Search](/blogs/generative-engine-optimization/geo-dominate-ai-search-comparative-study) 解释跨引擎来源差异，[Embedding Architecture](/blogs/generative-engine-optimization/embedding-architecture-ai-retrieval) 解释底层召回，[MAGEO](/blogs/generative-engine-optimization/mageo-multi-agent-geo-reusable-strategy-learning) 解释策略学习。

后续更新时，建议把每篇新论文归入这条线：它是在挑战旧 GEO tactics，还是在补 retrieval architecture，还是在改 evaluation? 这样中文复刻站会逐步变成可维护的 research map，而不是孤立文章集合。

## FeatGEO 审计工作表

可以把 FeatGEO 转成一个审计表，专门检查页面是否被旧 checklist 过度编辑。

| Audit field | Question | Action |
| --- | --- | --- |
| Topic query set | 这篇文章是否只围绕一个关键词？ | 扩展到 5-10 个相关 prompts |
| Citation density | 引用是否自然支持 claim？ | 删除无关或重复引用，补强 primary source |
| Statistics density | 数字是否解释了问题？ | 保留关键数字，删掉装饰性数字 |
| Heading depth | 标题是否帮助抽取？ | 合并空标题，拆开复杂标题 |
| List density | 列表是否承载步骤或比较？ | 把叙事型列表改回段落或表格 |
| Quality target | 页面偏 visibility 还是 quality？ | 在 brief 中明确，不要两头模糊 |
| Engine notes | 哪个 AI surface 是目标？ | 分别记录 ChatGPT、Gemini、Perplexity 结果 |

这张表的核心是避免机械“加更多”。FeatGEO 的教训不是不要引用和统计，而是不要把引用、统计、语气和关键词当成独立开关。页面需要的是 feature balance。

## FeatGEO 如何改变旧内容刷新

传统 content refresh 常常按 SEO 清单来：更新年份、补关键词、加 FAQ、加内链、扩写字数。FeatGEO 提醒我们，GEO refresh 应先问页面处于什么成熟度。

如果页面是低质量旧文，确实可以补 structure、statistics、citations、FAQ 和 evidence。它缺的是基本信息质量。若页面已经是 AI-assisted、高流畅度、高结构化页面，refresh 的目标可能反而是减少噪声：删掉重复引用、合并过碎标题、压缩无意义统计、恢复自然段落、重新定义 topic query set。

因此，旧内容刷新可以分三类。Repair pages 是明显薄弱页，适合旧 GEO tactics。Rebalance pages 是过度优化页，适合 FeatGEO 思维。Rebuild pages 是主题或意图已经变化的页面，应该从 feature brief 重新设计，而不是局部修补。

这种分层能避免“所有页面都加 FAQ”这类粗暴更新。GEO 维护越成熟，越需要判断哪些页面该加，哪些页面该减。

## 不同页面类型的 feature target

| Page type | Visibility feature | Quality feature | Watchout |
| --- | --- | --- | --- |
| Research summary | statistics、citations、method、limitations | clear explanation、source context | 不要只摘 headline number |
| Tool comparison | comparison table、criteria、pricing/source links | fair trade-offs、use cases | 不要堆竞品名 |
| Framework guide | headings、steps、FAQ、internal links | completeness、examples、workflow | 不要为了短而失去深度 |
| Glossary entry | definition、related terms、examples | canonical wording | 不要引入多个译名 |
| Product page | feature fields、limits、proof points | clarity、CTA、trust | 不要把限制藏起来 |
| Benchmark article | claim ledger、model/date/source | interpretation、caveats | 不要把 benchmark 当排名预测 |

这个表可以直接放进未来内容 brief。每类页面都有不同 feature target，团队不应把同一套结构套到所有页面。FeatGEO 的实际价值就在这里：它让编辑先设计页面特征，再写正文。

## 与 MAGEO 和 Skill Bank 的关系

FeatGEO 和 [MAGEO](/blogs/generative-engine-optimization/mageo-multi-agent-geo-reusable-strategy-learning) 可以连起来看。FeatGEO 解决“页面特征如何影响 visibility 和 quality”，MAGEO 解决“成功策略如何被记住并复用”。前者是 feature space，后者是 learning system。

手工团队可以这样结合：每次做 FeatGEO-style refresh 时，先写 feature brief；发布后用 prompt set 复测；如果某个 feature 组合有效，就写进 Skill Bank；如果无效或伤害 fidelity，就写进 negative examples。几个月后，团队会拥有自己的 engine-specific 和 topic-specific feature 知识，而不是只依赖论文结论。

这对中文复刻站很重要。后续更新 blog 时，可以把每篇文章的 feature choice 记录下来：为什么用了表格，为什么加 claim ledger，为什么保留长背景，为什么没有加更多引用。这样站点会积累编辑策略，而不只是积累页面。

## 延伸阅读与来源

- [arXiv:2604.19113](https://arxiv.org/abs/2604.19113)
- [The Original GEO Paper](https://thegeocommunity.com/blogs/generative-engine-optimization/geo-princeton-paper-original-study)
- [Reranking for RAG](https://thegeocommunity.com/blogs/generative-engine-optimization/reranking-cross-encoder-llm-reranker)
- [E-GEO Paper on commerce contexts](https://thegeocommunity.com/blogs/generative-engine-optimization/e-geo-paper-ecommerce-geo)
- [How to Dominate AI Search](https://thegeocommunity.com/blogs/generative-engine-optimization/geo-dominate-ai-search-comparative-study)
- [LangExtract and GEO](https://thegeocommunity.com/blogs/generative-engine-optimization/langextract-gemini-generative-engine-optimization)
- [Embedding architecture and retrieval](https://thegeocommunity.com/blogs/generative-engine-optimization/embedding-architecture-ai-retrieval)
- [Zero-Shot vs Few-Shot Prompting](https://thegeocommunity.com/blogs/generative-engine-optimization/zero-shot-vs-few-shot-prompting-seo-content)

## 引用

Liu, Z., & Xu, P. (2026). Think Before Writing: Feature-Level Multi-Objective Optimization for Generative Citation Visibility. arXiv preprint [arXiv:2604.19113](https://arxiv.org/abs/2604.19113).

## 关于作者

### Rohit Singh

Rohit Singh 是 The GEO Community 与 [GeoZ AI](https://www.geoz.ai/) 的创始人，关注 GEO、AI search benchmarks、feature-level optimization 和内容策略。你可以在 [LinkedIn](https://www.linkedin.com/in/rohitsingh017) 继续关注他。

## 继续学习

如果你想继续学习 feature-level GEO，可以先读 [The Original GEO Paper](/blogs/generative-engine-optimization/geo-princeton-paper-original-study)，再读 [How to Dominate AI Search](/blogs/generative-engine-optimization/geo-dominate-ai-search-comparative-study)，最后用 [GEO Framework](/geo-framework) 把论文发现转成持续运营流程。

## 继续阅读

- [Zero-Shot vs Few-Shot Prompting](/blogs/generative-engine-optimization/zero-shot-vs-few-shot-prompting-seo-content)
- [Embedding Architecture and AI Retrieval](/blogs/generative-engine-optimization/embedding-architecture-ai-retrieval)
- [MAGEO: Multi-Agent GEO](/blogs/generative-engine-optimization/mageo-multi-agent-geo-reusable-strategy-learning)
