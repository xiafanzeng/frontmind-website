---
path: "/blogs/generative-engine-optimization/robots-txt-ai-bots"
kind: "blog"
title: "robots.txt for AI Bots: What to Allow, What to Block, and Why"
source_title: "robots.txt for AI Bots: What to Allow, What to Block, and Why"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/robots-txt-ai-bots"
author: "Rohit Singh"
date: "9 Feb 2026"
status: "ready"
---
# robots.txt for AI Bots: What to Allow, What to Block, and Why

`robots.txt` 过去主要是搜索引擎爬虫的访问规则，现在也成了 AI bot 访问政策的第一层。问题不再只是“要不要让爬虫进站”，而是“哪些 bot、为了什么目的、访问哪些内容、对 GEO 可见性有什么代价”。

![robots.txt for AI Bots: What to Allow, What to Block, and Why](https://thegeocommunity.com/images/robots-txt-ai-bots.webp)

## 页面摘要

这篇文章说明如何为 GPTBot、ClaudeBot、PerplexityBot、Google-Extended、CCBot 等 AI crawlers 配置 `robots.txt`，并给出三套可直接改写的方案：最大可见性、允许搜索型爬虫但拦训练型爬虫、以及完整拦截 AI crawlers。

## 原站章节结构

1. Why robots.txt matters more now
2. The AI crawlers you need to know
3. How robots.txt actually works (quick refresher)
4. The key decision: allow, block, or selective access
5. Recommended robots.txt configurations
6. Option 1: Allow all AI crawlers (maximum visibility)
7. Option 2: Allow search-linked crawlers, block training-only crawlers
8. Option 3: Block all AI crawlers
9. What blocking actually does (and doesn't do)
10. Crawl-delay and rate limiting
11. Protecting specific content types
12. Monitoring who's actually crawling you
13. The Generative Engine Optimization (GEO) tradeoff
14. Key takeaways
15. FAQ

## Key Takeaways

- `robots.txt` 对 AI bot 仍然是协议层规则，但它不是防火墙，恶意爬虫可以忽略。
- 不同 bot 目的不同：training、retrieval、user-initiated browsing、传统 search indexing 要分开判断。
- GEO 目标通常倾向允许 search-linked crawlers，因为它们影响 AI answers 的引用和可见性。
- 如果内容本身就是产品，可以选择 block training-only crawlers，同时保留 AI search retrieval。
- 配置后必须看 server logs、Clarity、GSC 或 log analyzer，确认实际访问情况。

## Why robots.txt matters more now

传统 Googlebot / Bingbot 的交换关系相对清晰：它们抓取你的页面，建立索引，并通过搜索结果给你带来点击。AI crawlers 改变了这件事。

现在有三种访问场景：

- **Training crawlers**：读取内容，用于训练或改进模型权重，未必给你带来访问。
- **Retrieval crawlers**：实时抓取内容，用于 ChatGPT、Perplexity、Copilot 等答案中的 grounding 和 citation。
- **Answer engines**：直接把你的内容摘要给用户，可能有引用，也可能没有点击。

所以问题变成：哪些内容值得被 AI 引用，哪些内容不应该进入训练集，哪些内容要保护，哪些 bot 只是增加服务器负载。

## The AI crawlers you need to know

| Bot | Operator | Purpose | Usually respects robots.txt |
|---|---|---|---|
| GPTBot | OpenAI | Training and some retrieval contexts | Yes |
| OAI-SearchBot | OpenAI | Real-time search for ChatGPT | Yes |
| ChatGPT-User | OpenAI | User-initiated browsing | Yes |
| ClaudeBot | Anthropic | Claude training / crawling | Yes |
| Google-Extended | Google | Gemini / AI training opt-out control | Yes |
| Googlebot | Google | Search indexing | Yes |
| Bingbot | Microsoft | Search indexing and Copilot retrieval | Yes |
| CCBot | Common Crawl | Open dataset used by many AI labs | Yes |
| Bytespider | ByteDance | Training data collection | Claims to |
| PerplexityBot | Perplexity | Real-time retrieval for answers | Yes |
| Applebot-Extended | Apple | Apple Intelligence training control | Yes |
| cohere-ai | Cohere | Training crawler | Yes |

这张表需要定期更新。AI crawler 名称、用途和拆分方式变化很快。

## How robots.txt actually works (quick refresher)

`robots.txt` 位于站点根路径：

```text
https://example.com/robots.txt
```

基本格式：

```text
User-agent: GPTBot
Disallow: /private/
Allow: /blog/
```

规则含义：

- `User-agent` 指定 bot。
- `Disallow` 阻止某路径。
- `Allow` 显式允许某路径。
- `User-agent: *` 适用于没有单独规则的所有 bot。

重要提醒：`robots.txt` 是 request，不是 enforcement。守规矩的 bot 会遵守，恶意 scraper 不会。真正拦截要用 CDN/WAF/rate limiting。

## The key decision: allow, block, or selective access

有三种策略。

**Maximum AI visibility**

允许主要 AI crawlers。适合 SaaS、品牌内容、文档、教育内容和希望被 AI answer engines 引用的网站。

**Selective access**

允许 search-linked / retrieval crawlers，例如 OAI-SearchBot、ChatGPT-User、PerplexityBot、Bingbot；阻止 training-only crawlers，例如 CCBot、Google-Extended、部分 extended crawlers。这是常见折中。

**Full block**

阻止 AI-specific crawlers。适合 paywalled content、proprietary research、premium analysis 或内容本身就是主要收入来源的站点。

## Recommended robots.txt configurations

### Option 1: Allow all AI crawlers (maximum visibility)

```text
User-agent: *
Allow: /

Sitemap: https://yoursite.com/sitemap.xml
```

这是最简单的 GEO visibility 配置。所有合规 bot 都可以访问内容，最大化被检索、引用、推荐的机会。

### Option 2: Allow search-linked crawlers, block training-only crawlers

```text
User-agent: GPTBot
Disallow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Google-Extended
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: cohere-ai
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: PerplexityBot
Allow: /

User-agent: *
Allow: /

Sitemap: https://yoursite.com/sitemap.xml
```

这个配置的意图是：保留 AI search / answer visibility，同时减少 training data exposure。需要注意的是，training 和 retrieval 的边界正在变模糊，运营商的 crawler 说明也会变化。

### Option 3: Block all AI crawlers

```text
User-agent: GPTBot
Disallow: /

User-agent: OAI-SearchBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: PerplexityBot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: cohere-ai
Disallow: /

User-agent: *
Allow: /

Sitemap: https://yoursite.com/sitemap.xml
```

这会阻止 AI-specific crawlers，同时保留传统搜索爬虫的访问。

## What blocking actually does (and doesn't do)

Blocking 会做的事：

- 告诉合规 bot 不要抓取指定路径。
- 降低合规 crawler 对服务器的访问负载。
- 向 AI operators 发出你的内容访问政策信号。

Blocking 不会做的事：

- 不会删除已经被抓取的数据。
- 不会阻止第三方镜像、缓存页、聚合站被抓取。
- 不会拦住不遵守 `robots.txt` 的 scraper。
- 阻止 `Google-Extended` 不等于阻止 `Googlebot`，也不应直接影响传统 Google Search indexing。

## Crawl-delay and rate limiting

部分 bot 支持 `Crawl-delay`：

```text
User-agent: CCBot
Crawl-delay: 10
```

这表示请求 bot 每次访问之间等待 10 秒。不是所有 bot 都支持；Googlebot 不使用这条规则，Google 相关 crawl 控制应在 Search Console 中处理。

真正的 rate limiting 应该在基础设施层做：

- Cloudflare：Bot Management + rate limiting rules。
- AWS CloudFront：WAF rules based on user-agent。
- Fastly：VCL-based bot detection。

## Protecting specific content types

你不必全开或全关。很多站点适合按内容类型控制。

```text
User-agent: GPTBot
Disallow: /premium/
Disallow: /api/
Disallow: /internal/
Allow: /blog/
Allow: /docs/
Allow: /pricing/
```

常见模式：

- Block premium / paywalled content，保护收入。
- Block API endpoints，避免无意义 crawl load。
- Block internal tools，避免暴露内部路径。
- Allow blog and docs，提高 GEO citation potential。
- Allow pricing and product pages，让 AI answers 能准确回答商业查询。

## Monitoring who's actually crawling you

配置只是第一步，验证才是第二步。

### Server logs

```bash
grep -i "gptbot\\|claudebot\\|ccbot\\|perplexitybot\\|bytespider\\|oai-searchbot" /var/log/nginx/access.log
```

### Microsoft Clarity

如果使用 Clarity，可查看 AI Bot Activity dashboard，按 operator 和 purpose 观察 server-side crawl 行为。

### Google Search Console

GSC 的 crawl stats report 可用于 Googlebot 请求量、response codes 和 crawl budget 观察。

### Third-party tools

Botify、Screaming Frog log analyzer、Lumar 等可以规模化识别 crawler 模式。

## The Generative Engine Optimization (GEO) tradeoff

核心张力是：

- Blocking 保护内容不被无偿训练或摘要。
- Allowing 提高被 AI answers 引用、推荐、展示的概率。

对大多数以 GEO 为目标的业务网站，默认策略通常是允许 search / retrieval crawlers，并对 training-only crawlers 做明确选择。

如果内容本身就是产品，比如新闻、研究、付费分析，block training crawlers、allow search crawlers 是合理折中。

如果内容服务于产品或服务，比如 SaaS docs、电商、品牌内容，最大可见性通常更有价值。

## Key takeaways

- `robots.txt` 是 AI bot access 的第一层政策，但不是技术强制。
- GPTBot、ClaudeBot、CCBot、PerplexityBot、Google-Extended 等目的不同，不能一刀切理解。
- 根据商业模式选择 full access、selective access 或 full block。
- Blocking 不会撤回历史抓取内容。
- 配置后必须监控 logs / Clarity / GSC / log tools。
- 对 GEO 来说，除非有明确保护理由，否则应倾向允许 search-linked crawlers。

## FAQ

**Blocking GPTBot 会阻止 ChatGPT 引用我的页面吗？**

不一定。训练 crawler 和 search / user retrieval crawler 可能分开。要看 OpenAI 当前 crawler 文档与实际 logs。

**阻止 Google-Extended 会影响 Google Search 排名吗？**

通常不应影响传统 Googlebot indexing；它是与 Google AI training / usage opt-out 相关的控制。

**robots.txt 能阻止恶意 scraper 吗？**

不能。需要 CDN、WAF、rate limiting、bot detection 和身份验证。

**我应该完全阻止 AI crawlers 吗？**

只有当内容本身是付费产品、专有研究或被摘要会直接伤害收入时，full block 才更合理。多数产品型网站更适合 selective 或 permissive。

## 图片引用

- robots.txt for AI Bots: What to Allow, What to Block, and Why: https://thegeocommunity.com/images/robots-txt-ai-bots.webp

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- View Full Learning Path →: /start
- 1llms.txt for SPA Hydration Gaps: /blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps
- 2Is Crawlability Still an SEO Task in 2026? The Word Now Has Two Meanings: /blogs/generative-engine-optimization/crawlability-seo-geo-two-meanings
- 3robots.txt for AI Bots: /blogs/generative-engine-optimization/robots-txt-ai-bots
- 4Why JSON-LD Is Important (Google Only): /blogs/generative-engine-optimization/why-json-ld-is-important-google
- 5Who Created WebMCP? The Complete History & Timeline (15 Months, 7 Engineers, 3 Companies): /blogs/generative-engine-optimization/webmcp-history-timeline-15-months-7-engineers-3-companies
- 6AEO vs Generative Engine Optimization (GEO) (Microsoft's Framing): /blogs/generative-engine-optimization/aeo-vs-geo-microsoft
- 7Generative Engine Optimization (GEO) vs SEO: How the User Funnel Changed: /blogs/generative-engine-optimization/geo-vs-seo-user-funnel
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/robots-txt-ai-bots/print
- Why robots.txt matters more now: /blogs/generative-engine-optimization/robots-txt-ai-bots
- The AI crawlers you need to know: /blogs/generative-engine-optimization/robots-txt-ai-bots
- How robots.txt actually works (quick refresher): /blogs/generative-engine-optimization/robots-txt-ai-bots
- The key decision: allow, block, or selective access: /blogs/generative-engine-optimization/robots-txt-ai-bots
- Recommended robots.txt configurations: /blogs/generative-engine-optimization/robots-txt-ai-bots
- ChatGPT: https://chatgpt.com/
- Perplexity: https://www.perplexity.ai/
- Gemini: https://gemini.google.com/
- Option 1: Allow all AI crawlers (maximum visibility): /blogs/generative-engine-optimization/robots-txt-ai-bots
- Option 2: Allow search-linked crawlers, block training-only crawlers: /blogs/generative-engine-optimization/robots-txt-ai-bots
- Option 3: Block all AI crawlers: /blogs/generative-engine-optimization/robots-txt-ai-bots
- What blocking actually does (and doesn't do): /blogs/generative-engine-optimization/robots-txt-ai-bots
- Crawl-delay and rate limiting: /blogs/generative-engine-optimization/robots-txt-ai-bots
- Protecting specific content types: /blogs/generative-engine-optimization/robots-txt-ai-bots
- Monitoring who's actually crawling you: /blogs/generative-engine-optimization/robots-txt-ai-bots
- The Generative Engine Optimization (GEO) tradeoff: /blogs/generative-engine-optimization/robots-txt-ai-bots
- Key takeaways: /blogs/generative-engine-optimization/robots-txt-ai-bots
- FAQ: /blogs/generative-engine-optimization/robots-txt-ai-bots
- Cloudflare: https://www.cloudflare.com/
- AWS CloudFront: https://aws.amazon.com/cloudfront/
- Fastly: https://www.fastly.com/
- AI Bot Activity dashboard: /blogs/microsoft-clarity-ai-bot-activity
- Google Search Console: https://search.google.com/search-console
- Botify: https://www.botify.com/
- Screaming Frog: https://www.screamingfrog.co.uk/
- Lumar: https://www.lumar.io/
- AEO vs Generative Engine Optimization (GEO) (Microsoft's framing): /blogs/aeo-vs-geo-microsoft
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- Is Crawlability Still an SEO Task in 2026? The Word Now Has Two Meanings: /blogs/generative-engine-optimization/crawlability-seo-geo-two-meanings
- llms.txt for SPA Hydration Gaps: /blogs/llms-txt-spa-hydration-gaps
- Microsoft Clarity's New AI Bot Activity: /blogs/microsoft-clarity-ai-bot-activity
- Why JSON-LD Is Important (and Why It Only Matters for Google, Not ChatGPT or Perplexity)JSON-LD drives rich results and Knowledge Graph inte: /blogs/generative-engine-optimization/why-json-ld-is-important-google
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
