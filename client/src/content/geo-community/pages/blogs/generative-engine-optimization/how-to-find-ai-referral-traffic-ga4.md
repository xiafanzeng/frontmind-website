---
path: "/blogs/generative-engine-optimization/how-to-find-ai-referral-traffic-ga4"
kind: "blog"
title: "如何在 GA4 中找到 AI 推荐流量"
source_title: "How to Find AI Referral Traffic in GA4"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/how-to-find-ai-referral-traffic-ga4"
author: "Rohit Singh"
date: "30 Apr 2026"
status: "ready"
---
# 如何在 GA4 中找到 AI 推荐流量

你的 GA4 里很可能已经有 ChatGPT、Perplexity、Gemini、Claude、Copilot 带来的 referral session，只是它们现在混在普通 Referral 里，还没有被单独标成 AI Search。创建自定义渠道之前，先做一次 baseline check：确认当前到底能看到多少 AI referral、来自哪些引擎、落到哪些页面。

![How to Find AI Referral Traffic in GA4 — Traffic Acquisition Filter and Explorations Walkthrough](https://thegeocommunity.com/images/how-to-find-ai-referral-traffic-ga4.webp)

这篇文章是 GA4 衡量 AI 搜索系列的第一步。它不是要一次搭出完整归因模型，而是帮你在 10 分钟内找到 GA4 已经记录到的可见下限：哪些 AI engine 正在带来点击，哪些 landing page 被访问，哪些 session 产生了 engagement 或 conversion。

## 先看结论

用 Traffic acquisition 过滤器和 Free Form Exploration 找出 ChatGPT、Perplexity、Gemini、Claude 等 AI 引擎在 GA4 中留下的 referral 流量，并用 session source 参考表建立第一版可复查的基线。

## 阅读路径

1. AI 流量在 GA4 默认报表里长什么样
2. 方法一：用 Traffic acquisition 过滤 source
3. 方法二：用 Exploration 做页面级分析
4. AI 引擎 session source 参考表
5. 这套方法找不到什么
6. 下一步怎么做

## 操作步骤

## AI 流量在 GA4 默认报表里长什么样

当用户在 ChatGPT、Perplexity 或其他 AI answer engine 里点击引用链接进入你的网站时，浏览器可能会带上 Referer header。GA4 tag 读取到这个 referrer 后，会把 session 记录成类似：

```text
session_source = chatgpt.com
session_medium = referral
session_default_channel_group = Referral
```

问题是，默认 acquisition report 只会显示 Referral 这类大渠道。ChatGPT referral 和普通博客链接、合作伙伴网站、论坛链接都混在同一行里。除非你主动切到 source/medium 或做 filter，否则它们很容易被忽略。

所以第一步不是先写复杂 regex，而是先回答一个基础问题：

```text
GA4 现在已经能看到哪些 AI referral sources？
```

这个 baseline 很重要。它能告诉你当前可见的 AI traffic floor，也能帮你决定后续是否要创建 custom channel group、Looker Studio dashboard、dark traffic 估算或 CRM attribution 字段。

## 方法一：用 Traffic acquisition 过滤 source

最快方法是直接在 Traffic acquisition 里过滤 source。

进入：

```text
Reports -> Acquisition -> Traffic acquisition
```

在表格上方找到 filter/search 控件，添加过滤条件：

```text
Dimension: Session source
Condition: contains
Value: chatgpt
```

GA4 会显示 session source 包含 chatgpt 的 sessions，例如 `chatgpt.com` 或 `chat.openai.com`。记录 sessions、engaged sessions、engagement rate、conversions 和 revenue。

然后清除过滤器，分别重复：

```text
perplexity
claude
gemini
copilot
```

如果想一次看 combined view，可以用 Add comparison，设置条件类似：

```text
Session source contains chatgpt
OR Session source contains perplexity
OR Session source contains claude
OR Session source contains gemini
OR Session source contains copilot
```

这样 AI referral sessions 会作为一个 comparison column 与 all users 对比。你可以快速看到它占总 sessions 的比例，以及 engagement 是否高于站点平均。

这一步能看到的指标包括 sessions、engaged sessions、engagement rate、conversions 和 revenue。它看不到的是 referrer 被剥离后进入 Direct 的 AI-driven sessions。

## 方法二：用 Exploration 做页面级分析

Traffic acquisition filter 能看到总量，但无法很好回答“哪些页面被 AI engines 引用或推荐”。要看页面级数据，用 Explorations。

进入：

```text
Explore -> Free form
```

添加 dimensions：

- Session source
- Landing page + query string
- Device category

添加 metrics：

- Sessions
- Engaged sessions
- Engagement rate
- Conversions
- Revenue（如果适用）

然后设置：

```text
Rows: Landing page + query string
Columns: Session source
Values: Sessions, Conversions
Filter: Session source matches regex for AI engine domains
```

基础 filter 可以是：

```regex
chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com
```

输出会变成一张 matrix：每个 landing page 对应不同 AI source 的 sessions 和 conversions。这张表就是 GA4 当前能观测到的 GEO footprint。

建议再做两个切片。

第一，日期对比。比较最近 28 天和前 28 天。某个页面 AI referral 突然上升，可能说明它开始被 AI answer 引用，也可能是某个外部讨论带来点击。

第二，设备对比。ChatGPT desktop referrer 通常更容易被记录，mobile app、隐私浏览器和某些跳转环境更容易丢 referrer。桌面和移动差距可以间接提示 dark traffic 规模。

## AI 引擎 session source 参考表

下面是常见 AI engine 在 GA4 中可能出现的 source 参考。实际值会变化，所以要以你的 GA4 数据为准。

| AI engine | Possible session source | Notes |
| --- | --- | --- |
| ChatGPT | `chatgpt.com`, `chat.openai.com` | 桌面 referrer 相对更稳定 |
| Perplexity | `perplexity.ai` | citation click 可能较容易出现 |
| Claude | `claude.ai` | 可能被低估，取决于环境 |
| Gemini | `gemini.google.com` | App 和浏览器环境会影响 referrer |
| Copilot | `copilot.microsoft.com`, `bing.com/chat` | 可能与 Bing/Copilot 路径混合 |
| You.com | `you.com` | 视实际来源而定 |
| Meta AI | `meta.ai` | 需要持续观察 |

不要只依赖固定清单。每月可以在 GA4 中按 Session source 搜索：

```text
chat
ai
openai
perplexity
claude
gemini
copilot
bing
```

这样能发现新来源或变体域名。

## 这套方法找不到什么

这套方法只能找到有 referrer 且 GA4 成功记录的 AI referral sessions。它不能找到全部 AI-driven demand。

漏掉的常见场景包括：

- 用户在 AI assistant 里复制 URL，然后手动打开。
- 移动 App 或隐私环境剥离 referrer。
- 用户先在 AI answer 里看到品牌，后来通过 Google 搜索品牌词访问。
- 用户让 AI 总结后直接完成决策，没有点击。
- AI crawler 访问你的内容，但没有产生用户 session。

因此，Traffic acquisition filter 得到的是 floor，不是 total impact。原站提到，dark traffic 可能让实际 AI-driven sessions 高于 GA4 可见数字。不要把过滤出来的 sessions 当作完整 GEO 成效。

为了补充盲区，可以同时看：

- Direct landing page 增长。
- 品牌搜索增长。
- CRM “How did you hear about us?” 字段。
- Server logs 中 AI crawler activity。
- GA4 native AI Assistant channel。
- Custom AI Search channel group。

## 下一步怎么做

做完 baseline check 后，下一步是创建 custom AI Search channel group。这样你不需要每次手动过滤 source，就能在 GA4 报表里看到 AI Search 作为独立渠道。

推荐顺序是：

1. 先用本篇方法记录 baseline。
2. 创建 custom AI Search channel group。
3. 在 Explorations 里建立 AI Search landing page matrix。
4. 对比 GA4 native AI Assistant channel。
5. 把 dark traffic 和 AI crawler 数据纳入更完整的 GEO measurement。

这一步虽然简单，但非常关键。没有 baseline，你很难判断后续自定义配置是否真的改善了可见性，也很难向团队解释为什么 AI traffic 不是一个单一数字。

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/how-to-find-ai-referral-traffic-ga4/print
- What AI traffic looks like in GA4 by default: /blogs/generative-engine-optimization/how-to-find-ai-referral-traffic-ga4
- Method 1: Traffic Acquisition report filter: /blogs/generative-engine-optimization/how-to-find-ai-referral-traffic-ga4
- Method 2: Explorations for page-level analysis: /blogs/generative-engine-optimization/how-to-find-ai-referral-traffic-ga4
- AI engine session source reference: /blogs/generative-engine-optimization/how-to-find-ai-referral-traffic-ga4
- What this method cannot find: /blogs/generative-engine-optimization/how-to-find-ai-referral-traffic-ga4
- Next step: /blogs/generative-engine-optimization/how-to-find-ai-referral-traffic-ga4
- GA4 for AI Search measurement series: /blogs/generative-engine-optimization/ga4-for-ai-search-measure-ai-traffic-geo-performance-conversions
- Why GA4 Underreports AI Search Traffic (Dark Traffic Explained): /blogs/generative-engine-optimization/why-ga4-underreports-ai-search-traffic-dark-traffic
- How to Create a Custom AI Search Channel Group in GA4: /blogs/generative-engine-optimization/custom-ai-search-channel-group-ga4
- GA4 for AI Search: How to Measure AI Traffic, GEO Performance & Conversions: /blogs/generative-engine-optimization/ga4-for-ai-search-measure-ai-traffic-geo-performance-conversions
- GA4 Regex for ChatGPT, Perplexity, Gemini, Claude & Copilot: /blogs/generative-engine-optimization/ga4-regex-chatgpt-perplexity-gemini-claude-copilot
- How to Measure GEO Success in GA4 — Beyond Traffic Counts: /blogs/generative-engine-optimization/how-to-measure-geo-success-ga4-beyond-traffic-counts
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
