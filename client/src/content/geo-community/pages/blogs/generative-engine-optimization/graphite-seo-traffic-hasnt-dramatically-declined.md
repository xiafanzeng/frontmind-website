---
path: "/blogs/generative-engine-optimization/graphite-seo-traffic-hasnt-dramatically-declined"
kind: "blog"
title: "I Read Graphite's “SEO Traffic Hasn't Dramatically Declined” — Here's What I Agree With (and What I'd Challenge)"
source_title: "I Read Graphite's “SEO Traffic Hasn't Dramatically Declined” — Here's What I Agree With (and What I'd Challenge)"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/graphite-seo-traffic-hasnt-dramatically-declined"
author: "Rohit Singh"
date: "23 Jan 2026"
status: "ready"
---
# I Read Graphite's “SEO Traffic Hasn't Dramatically Declined” — Here's What I Agree With (and What I'd Challenge)

这篇文章是对 [Graphite](https://graphite.io/) 关于 SEO 流量变化报告的评论。原报告的核心观点是：大规模站点的 organic search traffic 并没有像很多行业讨论说的那样暴跌，整体下降更接近温和变化，而不是 30% 到 60% 的崩塌。

![I Read Graphite's SEO Traffic Hasn't Dramatically Declined — Here's What I Agree With (and What I'd Challenge)](https://thegeocommunity.com/images/graphite-seo-traffic-hasnt-dramatically-declined.webp)

这篇中文版本按原站结构重写：哪些地方我同意，哪些表述容易造成混淆，以及如果要更严谨地验证 Similarweb 趋势，我会补哪些统计检查。

## TL;DR (my take)

我同意 Graphite 的大方向：把“SEO 已经全面死亡”当成行业事实，证据并不充分。用 40,000 个大型美国站点做观察，比拿一两个网站截图讲宏大叙事要好得多。

但我会挑战两个点。第一，文章里 “SEO traffic”“Google organic traffic”“all search engines” 的说法需要更严格区分。第二，用 Pearson correlation 验证 Similarweb 与一方数据走势一致，只能说明两条曲线共同移动，不等于 Similarweb 的绝对数准确。

换句话说：结论可能是对的，框架也有价值，但定义和验证方式还可以更清楚。

## What I think Graphite got right (and why it feels logical)

### 1) They used a big dataset instead of anecdotes

Graphite 与 Similarweb 合作分析大量站点，这比行业里常见的“我这个客户跌了，所以 SEO 死了”更有说服力。宏观趋势需要宏观样本，尤其在 AI Overviews、AI Search 和社交发现同时变化的阶段。

大样本不保证完美，但至少把讨论从情绪拉回数据。这个方向值得肯定。

### 2) Their headline result is plausible

报告称大型美国站点 organic search traffic 同比下降约 -2.5%。即使不相信每个小数点，这个方向也比“互联网流量从搜索悬崖式消失”更符合现实。很多站点确实在变，但不是所有站点都同时塌陷。

SEO 不是没有冲击，而是冲击被分配得很不均匀。某些品类下跌明显，某些页面类型受 AI 答案影响更大，某些品牌仍然稳定。

### 3) They acknowledge the impact is uneven

Graphite 承认影响按站点规模、行业和类型不同而不同。这点非常重要。AI 搜索带来的不是单一方向的流量灭绝，而是重新分配：信息型查询、低品牌依赖查询、简单答案型查询，可能受到更大影响；品牌型、工具型、交易型和深度研究型查询，变化不一定一样。

## Where I think the write-up creates confusion

### 1) “SEO traffic” is used too loosely

文章中有些地方把 SEO traffic、organic traffic from Google、all search engines 的流量混在一起说。对专业读者来说，这几个概念差异很大。

在真实 dashboard 里，“SEO traffic” 有时被团队拿来指 organic search，有时又被拿来指非付费流量，甚至有人把 Direct 也算进“SEO 影响”。但 Graphite 的数据更准确地说，应是 Similarweb 估算的美国站点来自搜索引擎的 organic visits。

如果要避免误读，我会反复使用一个固定标签：

> Estimated organic search visits (Similarweb; all search engines; US; top 40k sites)

这样读者就不会以为它等同于 GSC 的 Google clicks、GA4 的 Organic Search sessions，或包含 Direct 的非付费整体流量。

### 2) The month range is asymmetric (easy to nitpick)

原站指出 Graphite 比较的月份范围可能容易被挑刺，例如 2024 年 2 月到 12 月对比 2025 年 1 月到 11 月。即便做了 leap year 调整，搜索流量仍然有季节性，1 月和 12 月行为可能不同。

这不代表结论错，但会给反对者留下简单攻击点。我会补一个 sensitivity range：例如比较 Feb-Dec 2024 vs Feb-Dec 2025，或者多个等长窗口，看看结果是否仍接近。

## The “Direct traffic + bots” point I think is missing (and why I care)

很多人说“SEO 在下降”时，看的不是纯 organic search。他们看到的是 GA4 中 Organic Search 下滑、Direct 上升，然后推断用户不再从搜索进入。

但 Direct 并不总是用户手动输入网址。Direct 很多时候是 unknown source：referrer 丢失、App 到 Web、隐私策略、AI 引擎点击、邮件客户端、短链接都可能制造 direct traffic。

同时，AI crawler 和 bot 流量也在增长。Cloudflare 等基础设施数据持续提醒我们，爬虫访问与真实用户访问的边界更复杂。Graphite 的 Similarweb 方法不一定因此失效，但行业讨论如果不提 Direct 和 bot，就容易把归因噪声误读成真实行为变化。

这也是为什么 GEO 测量不能只看 GA4 channel 行。你需要同时看 GSC、GA4、server logs、AI citation monitoring 和页面级 direct anomaly。

## The Pearson correlation part: what I’d challenge (politely)

Graphite 用 Pearson correlation 比较 Similarweb 月度 sessions 与一方数据，并报告较高相关性。Pearson 不是坏工具，但我不会把它当作“准确性证明”的核心。

Pearson 主要回答：“两条线是否一起上下移动？”它不回答：“数字是否接近真实值？”如果 Similarweb 每个月都比真实值高 30%，但走势完全同步，Pearson 仍然很高。

### Why Pearson can mislead (in plain language)

高 Pearson correlation 可能同时存在这些问题：

- 持续偏高或偏低：趋势一致，但绝对值有固定偏差。
- 平滑波动：大方向一致，但漏掉真实尖峰和下跌。
- 共同季节性：两条时间序列都有季节模式，相关性被抬高。
- 规模效应：大站点本身流量波动相似，掩盖小站点误差。

所以我不会说 Similarweb 被“验证准确”。我会说：这是 Similarweb 与一方数据走势共同移动的证据。

## How I’d make their validation stronger (without making it complicated)

### 1) Correlate changes, not only raw totals

除了原始月度总量，可以计算 month-over-month 或 year-over-year percentage change 的相关性。这样能减少“大家都有季节性，所以看起来相关”的问题。

### 2) Add one rank-based correlation

补一个 Spearman correlation。它不要求线性比例完美，更能检查排序关系是否稳定。如果 Pearson 高但 Spearman 弱，说明关系可能被少数点或尺度影响。

### 3) Add real accuracy metrics (the missing piece)

相关性不告诉你偏差多大。我会公开这些指标：

- median percentage error
- mean absolute percentage error
- 有多少月份落在 ±10% 或 ±20% 内
- 按站点规模和行业分组的误差分布

这些指标才更接近日常读者说的“准不准”。

### 4) Check bias with a simple calibration line

画一条一方数据 vs Similarweb 数据的校准线，看 offset 和 slope。offset 显示是否整体偏高/偏低；slope 显示是否夸大或压缩波动。

### 5) Segment the validation results

Graphite 已经承认不同规模和类别站点受影响不同，验证也应该分组。大型媒体站、SaaS、论坛、电商、工具站和新闻站的 Similarweb 误差可能不同。

如果整体相关性高，但某些行业误差很大，那么结论需要更细分呈现。

## If I could rewrite one section of the article (the simplest improvement)

我会把方法说明改得更窄、更明确：

> We analyzed estimated organic search visits from Similarweb across the top 40,000 US sites. This is not Google Search Console click data, not GA4 Organic Search sessions, and not Organic + Direct traffic. We validate Similarweb as a directional trend source using co-movement with first-party data, while acknowledging that absolute counts may vary by site category and size.

这样一段话就能减少很多误读。

## My conclusion

“SEO 已死”这个叙事太粗糙。Graphite 的数据提醒我们，整体流量变化可能远没有行业情绪那么剧烈。但这不代表 SEO 没有被重塑。AI answers、GEO、zero-click、referrer loss、bot traffic 和内容供给过剩，都在改变搜索价值如何分配。

我会把结论写成：SEO 没有全面崩塌，但搜索流量正在重新分配；宏观平均值不能替代行业、页面类型和意图层面的分析。

## Related reading

- [Generative Engine Optimization (GEO) vs SEO: How the User Funnel Has Changed](/blogs/geo-vs-seo-user-funnel)
- [AEO vs Generative Engine Optimization (GEO)](/blogs/aeo-vs-geo-microsoft)
- [Context Graphs and Entity SEO for LLMs](/blogs/context-graphs-entity-seo-llms)
- [How to Find AI Referral Traffic in GA4](/blogs/generative-engine-optimization/how-to-find-ai-referral-traffic-ga4)

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/graphite-seo-traffic-hasnt-dramatically-declined/print
- Graphite: https://graphite.io/
- Similarweb: https://www.similarweb.com/
- GSC: https://search.google.com/search-console
- GA4: https://analytics.google.com/
- Cloudflare: https://www.cloudflare.com/
- Generative Engine Optimization (GEO) vs SEO: How the User Funnel Has Changed (and What to Optimize Now): /blogs/geo-vs-seo-user-funnel
- AEO vs Generative Engine Optimization (GEO) (Microsoft's framing): /blogs/aeo-vs-geo-microsoft
- Context Graphs and Entity SEO for LLMs: The Practical Guide: /blogs/context-graphs-entity-seo-llms
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- Explore the Learning Path →: /start
- Google's AI Optimization Guide Is Useful. The GEO Hype? Not So Much.Google published its AI Overviews optimization guide and the SEO world i: /blogs/generative-engine-optimization/google-ai-optimization-guide-geo-hype
- The Difference Between a Good SEO/GEO Consultant and a Bad One? It's All Attitude.Hygiene is not SEO. Hygiene is table stakes. Here's the un: /blogs/generative-engine-optimization/seo-geo-consultant-attitude
- AI World Models, Layoffs, and the Judgment GapBlock's restructuring reveals a pattern spreading across the industry: companies are replacing: /blogs/generative-engine-optimization/ai-world-models-layoffs-judgment-gap
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
