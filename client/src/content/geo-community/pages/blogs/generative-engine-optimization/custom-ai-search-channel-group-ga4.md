---
path: "/blogs/generative-engine-optimization/custom-ai-search-channel-group-ga4"
kind: "blog"
title: "How to Create a Custom AI Search Channel Group in GA4"
source_title: "How to Create a Custom AI Search Channel Group in GA4"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/custom-ai-search-channel-group-ga4"
author: "Rohit Singh"
date: "30 Apr 2026"
status: "ready"
---
# How to Create a Custom AI Search Channel Group in GA4

GA4 默认渠道组长期没有把 AI Search 当成一等渠道。ChatGPT、Perplexity、Gemini、Claude、Copilot 等来源，通常会落进泛泛的 Referral，或者在部分场景里进入 Direct/Unassigned。要真正把 AI search traffic 放进常规报表，你需要创建一个自定义 channel group。

![How to Create a Custom AI Search Channel Group in GA4 — Step-by-Step Setup Guide](https://thegeocommunity.com/images/custom-ai-search-channel-group-ga4.webp)

这篇文章是 GA4 for AI Search measurement 系列里的第二步。第一步是先用 Traffic acquisition filter 找到已经存在的 AI referral；第二步就是把这些来源抽出来，建立一个名为 AI Search 的自定义渠道，让它在 acquisition reports、Explorations、comparisons 和 segments 里都能被直接使用。

## 页面摘要

Step-by-step: create a custom GA4 channel group with an 'AI Search' channel definition. Covers Admin setup, channel priority ordering, regex conditions, and how to use the group in Traffic acquisition reports and Explorations.

## 原站章节结构

1. Why the default channel group doesn't work
2. Step-by-step: create the custom channel group
3. How to use the custom channel group in reports
4. Channel group conditions reference
5. What changes after you create it
6. Next step

## 正文

## Why the default channel group doesn't work

GA4 的 Default Channel Group 是 Google 预设的一套渠道定义。它包含 Organic Search、Paid Search、Direct、Referral、Organic Social、Email 等常见分类，但传统默认规则不是为 AI search 时代设计的。

当用户从 ChatGPT、Perplexity、Claude、Gemini 或 Copilot 点击链接进入你的网站时，GA4 通常能记录 source 和 medium。例如：

```text
session_source = chatgpt.com
session_medium = referral
session_default_channel_group = Referral
```

问题是，在默认渠道组里，这类访问没有被标成 “AI Search”。它们被混在 Referral 里，和普通博客引用、合作伙伴链接、论坛链接放在一起。你当然可以在 source/medium 里搜索 chatgpt 或 perplexity，但这不是长期报表方案。

另一个限制是：Default Channel Group 不能编辑。GA4 保护这套默认定义，以保证不同 property 之间口径一致。你不能直接在默认渠道里插入一个 AI Search 定义。

解决方案是创建 parallel custom channel group。它不会替换默认渠道组，而是在 GA4 里新增一个可选维度，例如 “Session channel group / AI Search Measurement”。你可以在同一张报表里切换到这个自定义维度，让 AI Search 成为独立行。

有一个关键约束：custom channel group 只从创建之日起向前生效。GA4 不会把历史 sessions 重新加工到新渠道组里。所以这件事越早做越好，至少积累 30 天数据后再做趋势判断。

## Step-by-step: create the custom channel group

### 1. 打开 Channel groups

在 GA4 中进入：

```text
Admin -> Data display -> Channel groups
```

点击 Create new channel group。给它一个清晰名称，例如：

```text
AI Search Measurement
```

这个名称之后会出现在维度选择器里，所以不要起太内部、太模糊的名字。

### 2. 添加 AI Search channel

点击 Add new channel，把 channel 命名为：

```text
AI Search
```

然后添加 condition group。原站建议使用 Session source 匹配 major AI engine domains。基础规则可以写成：

```text
Dimension: Session source
Match type: matches regex
Value:
chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|bing\.com/chat|you\.com|meta\.ai
```

这个列表不是永久完整清单。AI search source 会变化，你应该定期从 GA4 source/medium report 里补充新来源。

### 3. 把 AI Search 放到 Referral 之上

这是最容易错的一步。GA4 对 channel group definitions 是从上到下评估的，命中第一个匹配规则就归类。如果 Referral 规则在 AI Search 之前，很多 AI engine sessions 会先被 referral 吞掉，永远不会进入 AI Search。

所以要把 AI Search 拖到 Referral 之上。更稳妥的做法是把 AI Search 放在渠道列表靠前位置，只要不打乱你更高优先级的 paid rules。

### 4. 保留其他标准渠道

自定义 channel group 不应该只包含 AI Search。你仍然需要 Direct、Organic Search、Paid Search、Referral、Email、Social 等渠道，才能在同一个维度里看到完整流量结构。

如果只建一个单独的 AI Search channel，而没有其他渠道定义，报表会变得难解释。目标是创建“带 AI Search 的完整渠道组”，不是创建一个孤立筛选器。

### 5. 保存并等待数据累积

保存后，自定义 channel group 会开始处理之后的新 sessions。不要立刻拿它做同比或长期趋势，因为历史数据不会回填。建议至少等待 30 天，再用它做趋势图和管理层报告。

## How to use the custom channel group in reports

### Traffic acquisition

进入：

```text
Reports -> Acquisition -> Traffic acquisition
```

表格默认维度通常是 Session default channel group。点击维度下拉，搜索你刚创建的 channel group 名称，例如：

```text
Session channel group / AI Search Measurement
```

切换后，表格里应该出现 AI Search 行。你可以查看 sessions、engaged sessions、engagement rate、conversions、revenue 等指标。

### Explorations

在 Explore -> Free form 中，把自定义 channel group 添加为 dimension。你可以把它放在 rows，也可以作为 filter：

```text
Session channel group / AI Search Measurement = AI Search
```

然后添加 Landing page + query string、Session source、Device category、Conversions 等维度指标，分析 AI Search 的具体落地页和表现。

### Comparisons and segments

在标准报表中使用 Add comparison，条件设为自定义 channel group = AI Search。这样你可以把 AI Search users 和 All users 并排比较，看 engagement、conversion、landing pages 是否不同。

在 Explorations 里，也可以用 segment 把 AI Search sessions 单独抽出来，进一步分析用户路径。

## Channel group conditions reference

基础 regex 可以从这组开始：

```regex
chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|bing\.com/chat|you\.com|meta\.ai
```

如果你已经有 GA4 Regex for ChatGPT, Perplexity, Gemini, Claude and Copilot 那篇文章里的更新模式，可以以那篇为准，把更多域名加入规则。

常见来源包括：

| AI engine | Possible session source |
| --- | --- |
| ChatGPT | `chatgpt.com`, `chat.openai.com` |
| Perplexity | `perplexity.ai` |
| Claude | `claude.ai` |
| Gemini | `gemini.google.com` |
| Copilot | `copilot.microsoft.com`, `bing.com/chat` |
| You.com | `you.com` |
| Meta AI | `meta.ai` |

注意 GA4 channel group regex 使用的是 RE2 风格，不能假设所有 PCRE 写法都可用。写规则时保持简单，比追求复杂正则更可靠。

## What changes after you create it

创建后，变化主要有三点。

第一，AI Search 会作为渠道出现在 GA4 报表里，而不是藏在 Referral。团队能更快回答“AI search 带来了多少 sessions、engaged sessions 和 conversions”。

第二，你可以按 landing page 分析 AI Search。哪些页面被 AI engines 引用或推荐，哪些页面能把 AI referral 转成 engaged session 或 conversion，会更清楚。

第三，报表口径变得可复用。以后月报、Looker Studio、Explorations、segments 都可以统一引用这个 custom channel group，而不是每个分析师临时写一套过滤器。

但它也有边界：

- 不会回填历史数据。
- 不会捕捉 referrer 被剥离的 dark traffic。
- 不会衡量 AI answer impression 或品牌提及。
- 需要维护 source regex。
- 2026 年 5 月 13 日后 GA4 也有原生 AI Assistant channel，要注意和自定义口径区分。

## Next step

创建 custom channel group 后，下一步是把它放进完整 measurement system。

建议继续做三件事：

1. 用 Explorations 建 AI Search landing page matrix。
2. 用 regex 定期更新 source coverage。
3. 对比 GA4 native AI Assistant channel 与 custom AI Search channel group。

这样你能同时看到 Google 默认口径、团队自定义口径和实际落地页表现。AI Search measurement 不是一次配置完就结束，它需要随着 AI platforms、referrer behavior 和 GA4 渠道规则持续维护。

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/custom-ai-search-channel-group-ga4/print
- Why the default channel group doesn't work: /blogs/generative-engine-optimization/custom-ai-search-channel-group-ga4
- Step-by-step: create the custom channel group: /blogs/generative-engine-optimization/custom-ai-search-channel-group-ga4
- How to use the custom channel group in reports: /blogs/generative-engine-optimization/custom-ai-search-channel-group-ga4
- Channel group conditions reference: /blogs/generative-engine-optimization/custom-ai-search-channel-group-ga4
- What changes after you create it: /blogs/generative-engine-optimization/custom-ai-search-channel-group-ga4
- Next step: /blogs/generative-engine-optimization/custom-ai-search-channel-group-ga4
- GA4 for AI Search measurement series: /blogs/generative-engine-optimization/ga4-for-ai-search-measure-ai-traffic-geo-performance-conversions
- How to Find AI Referral Traffic in GA4: /blogs/generative-engine-optimization/how-to-find-ai-referral-traffic-ga4
- GA4 Regex for ChatGPT, Perplexity, Gemini, Claude & Copilot: /blogs/generative-engine-optimization/ga4-regex-chatgpt-perplexity-gemini-claude-copilot
- GA4 for AI Search: How to Measure AI Traffic, GEO Performance & Conversions: /blogs/generative-engine-optimization/ga4-for-ai-search-measure-ai-traffic-geo-performance-conversions
- Why GA4 Underreports AI Search Traffic (Dark Traffic Explained): /blogs/generative-engine-optimization/why-ga4-underreports-ai-search-traffic-dark-traffic
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
