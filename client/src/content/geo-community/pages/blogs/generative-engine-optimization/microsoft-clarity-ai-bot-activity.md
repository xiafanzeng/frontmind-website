---
path: "/blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity"
kind: "blog"
title: "Microsoft Clarity’s New AI Bot Activity: Clean Analytics for Marketers, Server-Side Visibility for Technical SEO"
source_title: "Microsoft Clarity’s New AI Bot Activity: Clean Analytics for Marketers, Server-Side Visibility for Technical SEO"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity"
author: "Rohit Singh"
date: "25 Jan 2026"
status: "ready"
---
# Microsoft Clarity’s New AI Bot Activity: Clean Analytics for Marketers, Server-Side Visibility for Technical SEO

Microsoft Clarity 新增的 AI Bot Activity，把过去很容易被埋进服务器日志里的 AI crawler 请求，放进了营销团队和技术 SEO 都能读懂的仪表盘。它不是一个“又多一个流量报表”的小功能，而是在 AI 搜索、AI 摘要和自动化代理开始访问网站之后，给团队补上了两个关键视角：哪些访问是真人，哪些访问来自机器人；哪些机器人只是噪声，哪些可能代表 AI 系统正在读取、理解和引用你的内容。

![Microsoft Clarity’s New AI Bot Activity: Clean Analytics for Marketers, Server-Side Visibility for Technical SEO](https://thegeocommunity.com/images/microsoft-clarity-ai-bot-activity.webp)

如果你只看传统 analytics，AI crawler 很容易被误读成用户行为，或者干脆完全看不见。很多 AI bot 不执行 JavaScript，不触发前端事件，也不会像真实用户一样滚动、点击和转化。Clarity 的变化在于，它把 bot traffic detection 和 AI Bot Activity 放到一起，让营销负责人能重新信任行为数据，也让技术 SEO 可以用更清晰的证据管理 crawl pressure、CDN 成本和内容覆盖。

## Measurement & Bot Intelligence

这篇文章关注的不是“AI 会不会改变搜索”这种抽象判断，而是一个更落地的问题：你的站点现在到底被哪些 AI 系统访问，访问了哪些路径，这些请求是否影响了报表、服务器成本和内容优先级。

在 GEO 语境下，AI crawler 的访问本身就是一种信号。它不等于排名，也不等于一定会被引用，但它说明某些平台正在抓取你的内容，或者至少正在尝试建立可检索的内容索引。对营销团队来说，这可以帮助判断哪些页面可能成为 AI answer 的候选素材。对技术团队来说，它可以帮助判断哪些路径正在承受非人类请求，以及哪些 bot 应该被允许、限制或进一步验证。

## Table of contents

这篇文章按原站结构整理为几个问题：bot traffic 为什么会扭曲决策，Microsoft Clarity 新增了什么，AI Bot Activity 能分析哪些维度，为什么 server-side data 比前端采样更可靠，以及营销团队和技术 SEO 应该如何把它接入日常工作。

你可以把它当作一个实操框架：先用 Clarity 找到 AI bot 请求，再用 server logs、Search Console、CDN/WAF 数据交叉验证，最后决定内容优化、抓取管理和报表过滤的优先级。

## The problem: bot traffic distorts decisions

AI 正在改变“流量”这个词的含义。过去我们通常默认一次 session 对应一个真实用户，一次 pageview 至少代表某个人打开了页面。现在这种假设越来越危险：同一个站点可能同时被真人、scraper、fraud bot、AI crawler、RAG ingestion pipeline 和各种监控系统访问。

这些访问不一定坏。AI crawler 可能是内容被未来答案系统发现的入口，Search crawler 也仍然是 SEO 的基础。但问题在于，机器人不像客户。它们可能瞬间跳转大量页面，触发异常事件，放大 session 数，制造不存在的转化路径，或者让产品团队误以为某个页面被频繁使用。

对营销报表来说，bot traffic 会制造虚假的增长。一个 landing page 可能看起来流量上升，但真实用户质量没有改善。对 UX 分析来说，rage click、drop-off、scroll depth 这些指标可能混入自动请求，导致团队修错问题。对工程和运维来说，crawler 即使不转化，也会消耗真实的请求、带宽、缓存和 CDN 资源。

这就是 Clarity 新功能的核心价值：不是把所有 bot 都当成敌人，而是先把它们从真人行为里分离出来，让团队知道自己面对的到底是什么。

## What’s new: AI Bot Activity in Microsoft Clarity

Microsoft Clarity 新增的 AI Bot Activity，目标是展示经过识别的 AI 系统如何访问你的网站。它把原本需要技术 SEO 手动翻 server logs 的信息，转化为更容易阅读的可视化视图。

在 Clarity 中，入口位于 Dashboards -> AI Visibility -> AI Bot Activity。这个区域把 AI crawler 请求单独拆出来，帮助你观察自动化访问与普通 human traffic 的关系。

### What you can analyze

AI Bot Activity 重点覆盖四类分析。

- **AI crawl request share**：AI bot 请求在总 page requests 中占多少，包括与真人流量的相对比例。
- **Bot activity by purpose**：根据自动化系统访问内容的主要目的，对 bot activity 做分组。
- **Crawler requests by operator**：识别哪些平台或组织正在抓取你的站点，例如搜索、AI answer、训练数据或其他自动化系统相关的访问。
- **Path requests**：展示被自动化系统请求最多的页面和资源，帮助团队找到 crawl pressure 集中的目录、模板或内容类型。

这些视图的价值在于，它们把“我好像被很多 bot 抓取”变成了可以讨论的对象：谁在抓，抓哪里，占比多少，是否集中在高价值内容，是否给系统造成负担。

## Why this is different: built on real server-side data

AI Bot Activity 最关键的技术差异，是它依赖 server-side logs 和 CDN integrations，而不是只依赖前端 JavaScript 事件。

传统行为分析工具天然偏向真人浏览器：页面加载脚本，脚本采集事件，事件进入 analytics。可是很多 AI crawler 并不会执行这些脚本。它们请求 HTML、读取内容、解析链接，然后离开。这样一来，你在前端 analytics 里看到的只是局部世界：真人行为相对完整，bot 行为要么缺失，要么以异常方式出现。

Server-side data 能补上这块盲区。只要请求到达你的边缘网络、CDN 或服务器，就可以被记录。通过这些日志，Clarity 能更可靠地识别 operator、request pattern、路径分布和访问目的。对技术团队来说，这比“猜测某些 session 像机器人”更接近事实。

这也解释了为什么 Clarity 的这个功能对 technical SEO 特别有用。很多 AI visibility 问题最后都会回到基础设施：robots.txt 是否允许，CDN 是否拦截，WAF 是否误杀，canonical 是否稳定，重复路径是否让 crawler 浪费预算。没有 server-side 视角，这些问题很难被看清。

## What this is (and isn’t)

AI Bot Activity 是 intelligence layer，不是 access-control layer。它帮助你理解 AI bot 请求，但不会替你屏蔽、限速或允许某个 bot。

换句话说，它能告诉你哪些 crawler 正在访问、访问了哪些路径、请求是否集中、是否影响报表；但真正的 allow/deny、throttling、rate limiting 和 bot management，仍然应该在 CDN、WAF、服务器配置或 robots.txt 层面完成。

这一区分很重要。很多团队看到 bot traffic 后的第一反应是“全部封掉”。但在 GEO 场景下，盲目封锁可能让内容失去被 AI 系统读取和引用的机会。更合理的做法是先分类：哪些是有价值的 verified AI crawlers，哪些是成本高但价值低的抓取，哪些是明显的垃圾流量或滥用请求。Clarity 提供的是做这些判断所需的数据。

## Getting started (admin + technical SEO friendly)

接入时可以从一个简单流程开始。

1. 在 Microsoft Clarity 中确认站点属性、数据采集和 AI Visibility 面板可用。
2. 打开 Dashboards -> AI Visibility -> AI Bot Activity，观察最近一段时间的 bot request share。
3. 按 path 查看 AI crawler 请求是否集中在某些目录，例如 blog、docs、product、search results、tag pages 或参数化 URL。
4. 把 Clarity 中看到的 operator 与 server logs、CDN logs、WAF events 交叉比对，确认识别结果。
5. 针对异常路径做优先级判断：是内容价值高所以值得保留，还是重复、薄内容或参数页面导致 crawler 浪费请求。

管理层不一定需要看原始日志，但需要看到结论：AI bot 占总请求多少，哪些平台最活跃，哪些内容被抓得最多，这会如何影响 reporting、infrastructure cost 和 AI visibility。

### WordPress note

WordPress 站点同样需要关注这件事。很多 WordPress 内容站的 URL 结构、tag archive、search results、分页和 feed 会制造大量可抓取路径。如果 AI bot 或 scraper 集中访问这些路径，Clarity 的 path view 可以帮助你快速判断：这些请求是在访问核心文章，还是在浪费预算。

对 WordPress 团队来说，下一步通常是检查 canonical、noindex、robots.txt、缓存层和安全插件配置。不要只在 CMS 后台看流量，也要把 CDN/WAF 层面的请求纳入判断。

## What marketing leaders should do with this (fast wins)

营销负责人最先可以做三件事：修正报表口径，识别 AI attention 集中的页面，并把内容价值与工程成本放进同一张图里讨论。

### 1) Trust your performance story again

如果 bot traffic 混进 analytics，conversion rate、session duration、scroll depth、engagement rate 都可能被污染。Clarity 的 bot detection 能帮助团队把真人行为和自动化请求拆开，让 campaign review、landing page analysis 和 funnel diagnosis 更接近真实用户。

这不只是数据洁癖。错误的报表会带来错误预算。一个被 bot 放大的页面可能拿到更多资源，而真正能转化的页面被低估。过滤和识别 bot traffic，是重新建立 performance story 的第一步。

### 2) Spot where AI attention is concentrating

如果某些页面获得了不成比例的 AI crawler attention，这些页面值得进入 GEO 优先级列表。它们可能是答案系统正在读取的素材，也可能是行业主题、实体或数据点被模型检索时更容易命中的页面。

这时不要只问“这个页面带来多少 referral traffic”。AI answer 的路径往往更间接：内容先被抓取和索引，再被检索、摘要、引用，最后才可能影响品牌认知或点击。AI crawler attention 是上游信号，不是最终 KPI，但它能帮助你决定先优化哪些页面的事实密度、引用、结构化数据和内部链接。

### 3) Align marketing + engineering on cost/ROI

AI crawler 访问既可能带来 visibility，也可能带来成本。营销团队希望内容可被 AI 系统读取，工程团队关注请求量、缓存命中、带宽和安全风险。Clarity 的好处在于，它给双方一个共同的数据视图。

如果一个高价值白皮书目录被 verified AI crawlers 频繁访问，可能值得保持开放并优化内容结构。如果一个重复参数目录被低价值 bot 大量请求，就应该考虑 canonical、robots、缓存和限速策略。ROI 不只体现在流量，也体现在让正确的内容被正确的系统读取。

## What technical SEO should do with this (action plan)

技术 SEO 应该把 AI Bot Activity 当成 bot intelligence 的入口，而不是唯一真相。最稳妥的做法是：用 Clarity 找模式，用日志验证模式，再通过抓取控制和内容架构调整降低浪费。

### 1) Identify crawl pressure by path

先按 path 排序，找出 AI bot 请求最集中的目录。重点看几个问题：

- 是否集中在核心内容页面，例如文章、文档、产品页。
- 是否集中在低价值路径，例如搜索结果页、标签页、分页、参数 URL。
- 是否存在重复模板、大小写路径、尾斜杠或查询参数造成的重复抓取。
- 是否有图片、脚本或 API endpoint 被异常请求。

如果某个目录被大量抓取但没有业务或 GEO 价值，就应该进入技术修复队列。

### 2) Cross-check with server logs and Search Console

Clarity 给你可读视图，但 server logs 仍然是最终核对层。把 Clarity 中看到的 operator、path 和 request share，与原始日志里的 user agent、IP range、status code、response time、cache status 做比对。

Search Console 则帮助你区分 Google crawler 与其他 AI crawler 的行为。AI Bot Activity 不是 Google 索引状态的替代品；它更像一张额外地图，告诉你除传统搜索之外，还有哪些自动化系统正在触达内容。

### 3) Reduce duplication and stabilize canonicals

当 AI crawler 遇到大量重复 URL，它会浪费请求，也会看到不一致的内容信号。技术 SEO 应该检查：

- canonical 是否自洽且指向最终版本。
- pagination、tag、search、filter、UTM 参数是否制造重复。
- sitemap 是否只提交高价值、可索引、稳定的 URL。
- 内部链接是否指向统一格式，而不是混合 http/https、尾斜杠、大小写或参数版本。

这些动作并不新，但在 AI crawler 更多样化之后，它们的价值被放大了。

### 4) Separate “bot pollution” from UX reality

最后，别让 bot 行为污染 UX 结论。技术和产品团队在看 heatmap、session recording、scroll depth、rage click 时，需要确认数据集是否排除了 bot-like sessions。否则你可能会优化一个真实用户根本没有遇到的问题。

一个好的流程是：先用 Clarity 的 bot view 标出自动化访问，再回到行为分析里看过滤后的真人样本。真人样本才应该驱动 landing page copy、CTA、form UX 和 navigation 的调整。

## References

原站引用的核心资料包括 Microsoft Clarity、AI Bot Activity 官方说明、bot detection 说明，以及 Fastly、CloudFront、Cloudflare 等 CDN/边缘网络相关资料。复刻版保留完整链接清单，方便后续继续补充中文注释和实测截图。

## Related Microsoft reading

如果你要从更宽的 AI search 框架理解这项功能，可以继续看 Microsoft 关于 AEO 与 GEO 的官方表述，以及 IndexNow、AI assistant channel、log file analysis for AI bots 等相关内容。这些主题共同指向一个变化：AI 可见性不再只是内容策略问题，也越来越是测量、抓取、基础设施和数据治理问题。

## About the author

Rohit Singh 是 The GEO Community 的作者与维护者，长期关注 SEO、GEO、AI search、AI bot crawling 和可衡量的内容实验。这个中文复刻版本保留作者、日期、来源链接和内部链接结构，方便后续继续维护。

## Continue learning

下一篇相关内容可以继续阅读 GA4 scroll depth tracking：它与这篇文章讨论的是同一类问题，即如何从被污染或不完整的行为数据中提取真正能指导内容和转化优化的信号。

## 图片引用

- Microsoft Clarity’s New AI Bot Activity: Clean Analytics for Marketers, Server-Side Visibility for Technical SEO: https://thegeocommunity.com/images/microsoft-clarity-ai-bot-activity.webp

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- View Full Learning Path →: /start
- 1Log File Analysis for AI Bots: How to Track What's Actually Crawling You: /blogs/generative-engine-optimization/log-file-analysis-ai-bots-geo
- 2IndexNow by Microsoft: The Fast Lane to AI Visibility: /blogs/generative-engine-optimization/indexnow-microsoft-ai-visibility
- 3Microsoft Clarity AI Bot Activity: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- 4How to Track and Analyze Scroll Depth in GA4: A Complete Guide for Marketers: /blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm
- 5Google Analytics Now Has a Native AI Assistant Channel. Here's What Changes for GEO Measurement.: /blogs/generative-engine-optimization/google-analytics-ai-assistant-channel-native-tracking
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity/print
- Microsoft Clarity: https://clarity.microsoft.com/
- AEO vs Generative Engine Optimization (GEO) (Microsoft's framing): /blogs/aeo-vs-geo-microsoft
- The problem: bot traffic distorts decisions: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- What’s new: AI Bot Activity in Microsoft Clarity: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- What you can analyze: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- Why this is different: built on real server-side data: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- What this is (and isn’t): /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- Getting started (admin + technical SEO friendly): /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- WordPress note: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- What marketing leaders should do with this (fast wins): /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- 1) Trust your performance story again: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- 2) Spot where AI attention is concentrating: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- 3) Align marketing + engineering on cost/ROI: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- What technical SEO should do with this (action plan): /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- 1) Identify crawl pressure by path: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- 2) Cross-check with server logs and Search Console: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- 3) Reduce duplication and stabilize canonicals: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- 4) Separate “bot pollution” from UX reality: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- References: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- Related Microsoft reading: /blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity
- Fastly: https://www.fastly.com/
- Amazon CloudFront: https://aws.amazon.com/cloudfront/
- Cloudflare: https://www.cloudflare.com/
- Log File Analysis for AI Bots: /blogs/log-file-analysis-ai-bots-geo
- https://clarity.microsoft.com/blog/ai-bot-activity-in-clarity/: https://clarity.microsoft.com/blog/ai-bot-activity-in-clarity/
- https://clarity.microsoft.com/blog/see-how-bots-are-distorting-your-analytics/: https://clarity.microsoft.com/blog/see-how-bots-are-distorting-your-analytics/
- https://learn.microsoft.com/en-us/clarity/ai-visibility/bot-activity: https://learn.microsoft.com/en-us/clarity/ai-visibility/bot-activity
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- How to Track and Analyze Scroll Depth in GA4: A Complete Guide for MarketersGA4's built-in scroll event only tells you who reached 90%. To u: /blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm
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
