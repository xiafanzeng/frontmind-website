---
path: "/blogs/generative-engine-optimization/ga4-regex-chatgpt-perplexity-gemini-claude-copilot"
kind: "blog"
title: "GA4 Regex for ChatGPT, Perplexity, Gemini, Claude & Copilot"
source_title: "GA4 Regex for ChatGPT, Perplexity, Gemini, Claude & Copilot"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/ga4-regex-chatgpt-perplexity-gemini-claude-copilot"
author: "Rohit Singh"
date: "30 Apr 2026"
status: "ready"
---
# GA4 Regex for ChatGPT, Perplexity, Gemini, Claude & Copilot

GA4 自定义 channel group 里可以用 regex 把 ChatGPT、Perplexity、Gemini、Claude、Copilot 等 AI referral sources 单独归类成 AI Search。但 GA4 使用的是 RE2 regex，不是很多 SEO 和分析师熟悉的 PCRE。一个写错的 pattern 可能不会报错，只会悄悄把 sessions 分到错误 channel。

![GA4 Regex Patterns for AI Search Channel Groups — ChatGPT, Perplexity, Gemini, Claude and Copilot](https://thegeocommunity.com/images/ga4-regex-chatgpt-perplexity-gemini-claude-copilot.webp)

这篇文章整理了可用于 GA4 channel conditions 的 RE2 pattern、每个 AI engine 的匹配逻辑、常见错误、上线前验证流程，以及季度维护节奏。它是 GA4 for AI Search measurement series 的一部分：先找到 AI referral，再创建 channel group，再理解 dark traffic 和转化质量。

## RE2 regex in GA4: what's different

GA4 channel conditions 使用 Google 的 RE2 engine。RE2 的设计目标是线性时间匹配，所以它放弃了一些高级 regex 功能。

和 PCRE 相比，实践中最重要的限制是：

- 不支持 lookahead 和 lookbehind，例如 `(?=...)`、`(?<=...)`。
- 不支持 backreferences，例如 `\1`、`\2`。
- 不支持 atomic groups。
- GA4 条件里的大小写处理通常不需要复杂构造。

好消息是，AI Search channel matching 不需要这些高级功能。你需要的只是 alternation、escaped dots 和 anchors。

还要记住：regex 中的 `.` 表示任意字符，所以 `chatgpt.com` 会匹配 `chatgptXcom`。要匹配真实点号，必须写成 `chatgpt\\.com`。如果你希望精确匹配整个 source，需要加 `^` 和 `$`。

## The full AI Search regex

原站给出的安全版本适合放进 GA4 channel group condition：Session source，match type 选择 **matches regex**。

```regex
^(chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|bing\.com|you\.com|meta\.ai)$
```

这个 pattern 做了几件事：

- `^` 和 `$` 要求整段 source 完全匹配，避免 `notchatgpt.com` 或 `chatgpt.com.evil.net` 被误归类。
- `|` 表示多个来源任选其一。
- `\\.` 匹配真实点号。
- 同时包含 `chatgpt.com` 和 `chat.openai.com`，避免漏掉旧链接、书签或不同入口带来的 sessions。

如果你想更宽松地捕捉子域名，可以用包含式 pattern，但风险更高：

```regex
(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|google\.com|microsoft\.com|bing\.com|you\.com|meta\.ai)
```

宽松 pattern 能捕捉 enterprise subdomains 或新入口，但也更容易误匹配非 AI traffic。多数生产报表更适合从严格版开始，再按季度补充真实出现的新 source。

## Per-engine pattern breakdown

每个来源可以这样理解。

- **ChatGPT**：至少包含 `chatgpt.com` 和 `chat.openai.com`。只写一个会漏数据。
- **Perplexity**：`perplexity.ai` 是主要 referral source。
- **Claude**：`claude.ai` 覆盖常见 web referral。
- **Gemini**：常见入口可从 `gemini.google.com` 开始，Google 生态还有其他来源，需要用真实 source report 监控。
- **Copilot / Bing**：`copilot.microsoft.com` 和 `bing.com` 都可能与 AI search 相关，但 `bing.com` 也可能包含传统 Bing referral，是否纳入要看你的 channel 定义。
- **You.com**：`you.com`。
- **Meta AI**：`meta.ai`。

最重要的是不要盲目复制 pattern 后永久不改。AI 产品入口会变化，移动端、企业版、集成产品和新域名可能引入新的 referral sources。

## Common mistakes that break channel definitions

第一，点号没有 escape。`perplexity.ai` 不是精确匹配 `perplexity.ai`，而是匹配 `perplexity` + 任意字符 + `ai`。请写成 `perplexity\\.ai`。

第二，pattern 太宽。比如 `\\.ai$` 会把所有 `.ai` 结尾来源都归为 AI Search，很多 unrelated SaaS、工具站或 referral 也会被混进去。

第三，漏掉 ChatGPT 的两个域名。`chatgpt.com` 和 `chat.openai.com` 都可能出现在数据里，尤其是历史链接、分享链接、旧入口和部分集成。

第四，选错 match type。GA4 提供 contains、exactly matches、matches regex。如果你选择 contains，regex 会被当作普通字符串处理，基本不会按预期工作。输入 regex 时必须选择 matches regex。

第五，不测试就发布。Channel group 改动会影响新 session 分类，错误 pattern 会从上线那一刻开始污染报表。

## How to validate before publishing

上线前至少做三步。

第一，在支持 RE2 的 tester 中测试。可以使用 regex101 并选择 RE2 flavor，或者使用 Google RE2 playground。把你实际看到的 source strings 粘进去，例如 `chatgpt.com`、`perplexity.ai`、`notchatgpt.com`、`claude.ai`、`chatgpt.com.evil.net`，确认该匹配的匹配，不该匹配的不匹配。

第二，用 GA4 的真实 source 数据交叉验证。在 Explorations 中拉出 Session source，按 sessions 降序导出 top 200。把这些来源放进 tester，看 pattern 是否只匹配目标 AI engines。

第三，在 GA4 中预览 channel group。保存前或发布前，用过去 30 天流量比较 AI Search sessions 与手动 filter 结果。如果差距很大，要判断是 over-matching 还是 under-matching。

建议把验证结果写进内部文档：pattern 版本、测试日期、测试 source list、上线人和变更原因。几个月后排查数据异常时，这些记录会很有用。

## Maintenance schedule

AI engine 的 referral domains 会变化。企业版、移动应用、API 产品页、白标集成、搜索入口和新产品发布，都可能带来新 source。

维护节奏建议：

- **每季度**：导出 top 50 或 top 200 referral sources，检查是否有新 AI engine 域名没有覆盖。
- **重大产品发布后 30 天内**：例如 ChatGPT Enterprise、Perplexity Teams、Gemini 新入口、Copilot 新页面，检查是否出现新 referral source。
- **AI Search channel 突然下降时**：优先检查是否新域名被分进了 Referral，而不是 AI Search。
- **每次修改 pattern**：保留版本日期、变更原因和测试样本。

不要期待 regex 一次写完。AI Search measurement 本来就是需要维护的 reporting layer。

## Next step

当 channel group 能正确识别 AI referral 后，下一步是理解 GA4 为什么仍然低估 AI Search traffic。很多 AI-driven visits 会因为 referrer stripping、app webview、privacy settings、direct traffic 混入等原因变成 dark traffic。

因此，AI Search channel 不是完整事实，而是可观测部分。下一篇可以继续读 Why GA4 Underreports AI Search Traffic，以及 custom AI Search channel group、AI referral traffic 和 GEO success measurement 相关指南。

## Related reading — GA4 for AI Search series

这个系列包括如何在 GA4 找 AI referral、创建 custom channel group、理解 dark traffic、衡量 GEO success，以及把 AI traffic 与转化事件连接起来。regex 只是其中一步，但如果这一步错了，后面的所有 reporting 都会偏。

## 图片引用

- GA4 Regex Patterns for AI Search Channel Groups — ChatGPT, Perplexity, Gemini, Claude and Copilot: https://thegeocommunity.com/images/ga4-regex-chatgpt-perplexity-gemini-claude-copilot.webp

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/ga4-regex-chatgpt-perplexity-gemini-claude-copilot/print
- RE2 regex in GA4: what's different: /blogs/generative-engine-optimization/ga4-regex-chatgpt-perplexity-gemini-claude-copilot
- The full AI Search regex: /blogs/generative-engine-optimization/ga4-regex-chatgpt-perplexity-gemini-claude-copilot
- Per-engine pattern breakdown: /blogs/generative-engine-optimization/ga4-regex-chatgpt-perplexity-gemini-claude-copilot
- Common mistakes that break channel definitions: /blogs/generative-engine-optimization/ga4-regex-chatgpt-perplexity-gemini-claude-copilot
- How to validate before publishing: /blogs/generative-engine-optimization/ga4-regex-chatgpt-perplexity-gemini-claude-copilot
- Maintenance schedule: /blogs/generative-engine-optimization/ga4-regex-chatgpt-perplexity-gemini-claude-copilot
- Next step: /blogs/generative-engine-optimization/ga4-regex-chatgpt-perplexity-gemini-claude-copilot
- GA4 for AI Search measurement series: /blogs/generative-engine-optimization/ga4-for-ai-search-measure-ai-traffic-geo-performance-conversions
- RE2: https://github.com/google/re2/wiki/Syntax
- regex101.com: https://regex101.com/
- How to Find AI Referral Traffic in GA4: /blogs/generative-engine-optimization/how-to-find-ai-referral-traffic-ga4
- Why GA4 Underreports AI Search Traffic (Dark Traffic Explained): /blogs/generative-engine-optimization/why-ga4-underreports-ai-search-traffic-dark-traffic
- GA4 for AI Search: How to Measure AI Traffic, GEO Performance & Conversions: /blogs/generative-engine-optimization/ga4-for-ai-search-measure-ai-traffic-geo-performance-conversions
- How to Create a Custom AI Search Channel Group in GA4: /blogs/generative-engine-optimization/custom-ai-search-channel-group-ga4
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
