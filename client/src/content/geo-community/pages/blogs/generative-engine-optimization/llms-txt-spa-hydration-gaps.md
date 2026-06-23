---
path: "/blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps"
kind: "blog"
title: "llms.txt for SPA Hydration Gaps: Why It Exists and How to Use It"
source_title: "llms.txt for SPA Hydration Gaps: Why It Exists and How to Use It"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps"
author: "Rohit Singh"
date: "9 Feb 2026"
status: "ready"
---
# llms.txt for SPA Hydration Gaps: Why It Exists and How to Use It

当一个 SPA 把主要内容都留给浏览器端 JavaScript 渲染，而 AI crawler 请求页面时只看到一个空的 `<div id="root"></div>`，这就是 hydration gap。人类用户在浏览器里能看到完整页面，但很多 AI crawler、训练数据抓取器和 RAG ingestion pipeline 不执行 JavaScript，于是它们看到的只是空壳。

![llms.txt for SPA Hydration Gaps: Why It Exists and How to Use It](https://thegeocommunity.com/images/llms-txt-spa-hydration-gaps.webp)

`llms.txt` 就是在这个缺口上加的一层纯文本 fallback。它不是正式 web standard，也不是替代 SSR 的长期架构方案，而是一个实用补丁：把站点概览、关键页面、核心内容摘要和导航线索放在根目录的文本文件里，让无法渲染前端应用的 AI 系统仍然能读取你最重要的内容。

## The hydration problem

现代 SPA 通常这样工作：服务器先返回一个很轻的 HTML shell，浏览器下载 JavaScript bundle，JS 执行后再把真实内容注入页面，这个过程就是 hydration。对真人浏览器来说，这没有问题；对很多 crawler 来说，问题很大。

如果 crawler 不执行 JS，它拿到的 HTML 可能只有：

```html
<div id="root"></div>
<script src="/assets/app.js"></script>
```

从 crawler 的视角看，这个页面没有 heading、没有 paragraph、没有产品说明、没有 FAQ、没有文档内容。你的页面并不是质量差，而是对它不可见。

Googlebot 是例外之一，因为它可以使用 headless Chromium 渲染页面。但 GEO 不能只面向 Googlebot。GPTBot、ClaudeBot、CCBot、Perplexity 相关 crawler、各种训练数据抓取器和 RAG pipeline，不一定会执行前端 JavaScript。你希望被 AI answer 系统读取的内容，可能正好被困在客户端渲染之后。

这也是为什么 crawlability 在 2026 年有了两层含义：传统 SEO 仍然要确保 Google 可以访问和索引页面；GEO 还要确保 AI crawler 能够在不完整渲染环境下看到关键文本。

## What llms.txt actually is

`llms.txt` 是放在站点根目录的纯文本文件，路径通常是 `/llms.txt`。它用 Markdown 风格标题组织内容，写给语言模型和 AI crawler 阅读。

你可以把它理解成面向 LLM 的内容地图。传统 sitemap 主要告诉 crawler 有哪些 URL；`llms.txt` 不只是列 URL，而是提供这些 URL 背后的核心内容、站点主题、关键页面摘要、导航关系和可引用信息。

它有几个特点：

- **纯文本**：不需要 HTML 解析，不需要 JavaScript，不需要渲染。
- **结构化但轻量**：用 Markdown headings、列表和链接即可。
- **静态服务**：任何 web server、CDN 或静态托管都能提供。
- **fallback 而非修复**：它帮助 AI crawler 读到核心内容，但不解决页面 HTML 本身不可见的问题。

还有一个扩展文件叫 `llms-full.txt`。基础版 `llms.txt` 通常保持精简，适合快速读取；`llms-full.txt` 可以放更完整的文章、文档、产品说明或知识库内容，给需要更深上下文的模型使用。

## When you need it (and when you don't)

是否需要 `llms.txt`，取决于 AI crawler 实际能看到什么，而不是取决于你用了什么前端框架。

### You need llms.txt if:

- 你的站点是 React、Vue、Angular、Svelte 等 client-side SPA，没有 SSR 或 static pre-rendering。
- 用 `curl`、`wget` 或 crawler 模拟请求页面时，只看到空 shell 或少量占位内容。
- 关键内容包括产品信息、文档、FAQ、定价、教程、研究结论，但这些内容都在 JS 执行后才出现。
- 你想参与 AI answer 和 GEO，但短期内不能完成架构迁移。
- 你发现某些 AI crawler 没有抓到核心页面，或者 AI answer 中对你的品牌、产品和内容理解明显不完整。

### You probably don't need it if:

- 你的页面已经通过 SSR、SSG 或传统服务器渲染，在初始 HTML 中就包含完整正文。
- 你使用 Next.js、Nuxt、Astro、Hugo 等方式生成可读 HTML，并且已经验证 crawler 可以直接读取。
- 用 `curl` 查看页面时，能看到真实标题、正文、链接和结构化内容。
- 你已经有高质量 sitemap、robots、schema、canonical 和清晰内部链接，且 AI crawler 访问正常。

即便如此，`llms.txt` 仍然可以作为额外说明文件存在。只是如果 HTML 已经完整可见，它不是最优先的修复项。

## What to put in llms.txt

一个好的 `llms.txt` 应该像“模型一次读取就能理解的站点简介”，而不是营销口号堆叠。建议包括以下内容。

第一，站点概览。用几句话说明网站做什么、服务谁、核心主题是什么、哪些内容最重要。不要写泛泛的品牌宣言，要直接给出可理解的主题范围。

第二，关键页面列表。列出首页、核心产品页、文档入口、博客分类、研究页、工具页、FAQ、联系页等，并为每个链接写一两句摘要。

第三，核心内容摘要。把最希望 AI 系统理解和引用的事实、定义、能力、流程、限制和示例写清楚。模型可能截断上下文，所以重要内容要靠前。

第四，导航提示。告诉 crawler 或模型如果要理解某个主题，应该从哪些页面开始，哪些页面是补充材料，哪些内容是过时或低优先级。

第五，更新说明。标明最后更新时间、主要版本、是否有更完整的 `llms-full.txt`。如果内容经常变化，保持同步非常重要。

实用原则是：基础文件尽量控制在 10,000 tokens 以下；直接回答，不写空泛营销话术；保留链接；当站点内容变化时同步更新。过时的 `llms.txt` 比没有更糟，因为它会给 AI 系统错误上下文。

## How AI crawlers discover and use it

目前还没有统一的正式 discovery protocol，但已经形成一些常见做法。

第一，直接请求 `/llms.txt`。一些 crawler 会像检查 `/robots.txt` 一样，按惯例尝试读取根目录文件。

第二，在 `robots.txt` 中添加引用。例如：

```txt
User-agent: *
Allow: /

LLMs: https://example.com/llms.txt
```

第三，在 HTML head 中加入 link tag。例如：

```html
<link rel="llms" href="/llms.txt">
```

第四，在 sitemap、docs 或站点 footer 中引用它。这样不依赖 crawler 猜测，也能让人类维护者知道这个文件存在。

原站提到，Perplexity 等部分 AI crawler 会在 JavaScript rendering 失败时检查 `llms.txt` 作为 fallback。这个生态还在形成，所以最稳妥的策略是：在根目录提供文件，并在 robots、HTML 或文档中尽可能显式引用。

## llms.txt vs SSR vs pre-rendering

`llms.txt` 不应该被理解为 SSR 的替代品。长期来看，让页面初始 HTML 就包含真实内容，仍然是更稳、更通用的解决方案。

SSR 会在服务器端生成 HTML，让 crawler 和用户都能立即看到内容。SSG 或 pre-rendering 会在构建阶段生成静态 HTML，同样解决了空 shell 问题。Prerender 服务则可以为 crawler 提供预渲染版本，适合不方便立刻改架构的站点。

`llms.txt` 的优势是部署快、风险低、不需要重构前端应用。它适合在架构迁移前桥接缺口，或者作为 AI 系统的额外说明层。但如果你的核心产品页、文档和文章长期只靠 `llms.txt` 暴露给 crawler，那仍然是不稳的：模型可能不读它，可能只读基础版，可能无法获得页面级上下文，也可能错过更新。

更合理的顺序是：

1. 短期用 `llms.txt` 暴露关键内容。
2. 中期为高价值页面做 pre-rendering 或 SSR。
3. 长期让 HTML、schema、sitemap、robots、canonical、internal links 和 `llms.txt` 形成一致信号。

## Implementation: step by step

下面是一个可执行流程。

### 1. Audit what crawlers actually see

先验证问题是否存在。不要只看浏览器渲染后的页面，用命令行或 crawler 工具查看初始 HTML。

```bash
curl -L https://example.com/product-page | head -n 80
```

如果你看到了真实 heading、正文和链接，hydration gap 可能不严重。如果只看到 root div、script bundle 和空模板，就需要修复。

也可以用不同 user agent 测试，尤其是 AI crawler 或普通 bot 的访问方式。记录哪些页面空白、哪些页面部分可见、哪些页面完全可见。

### 2. Create the file

在项目根内容层创建 `public/llms.txt` 或静态托管目录中的同名文件。结构可以从下面开始：

```txt
# Example Site

## Overview
This site helps B2B teams evaluate, buy, and implement workflow automation software.

## Key pages
- /: Main overview and positioning.
- /pricing: Pricing tiers, plan limits, and billing questions.
- /docs: Product documentation and implementation guides.

## Core topics
- Workflow automation for finance teams.
- Approval routing, audit logs, and integrations.
- Security model, roles, and compliance controls.
```

写作时优先放真实内容，不要堆 slogan。模型需要的是可用信息。

### 3. Serve it at the root

确认它可以通过 `https://example.com/llms.txt` 访问，返回 `200`，内容类型可以是 `text/plain`。如果使用 CDN，需要确认缓存策略和更新流程。

同时检查大小、编码和换行。文件应该是 UTF-8，保持可读，不要依赖页面脚本生成。

### 4. Optionally create llms-full.txt

如果站点内容很多，可以创建 `llms-full.txt`。基础版只保留概览和关键链接，full 版放更长的文档摘要、完整 FAQ、产品细节、研究内容或文章目录。

这样做的好处是避免基础文件过长，同时给需要深度上下文的 crawler 一个入口。

### 5. Reference it

把 `llms.txt` 放到 crawler 能发现的位置。可以在 `robots.txt` 添加一行说明，在 HTML head 加 link tag，也可以在 sitemap 或 docs 中列出。

不要假设所有 crawler 都会自动发现它。越明确越好。

### 6. Monitor and update

上线后要监控访问日志，看看是否有 AI crawler 请求 `/llms.txt` 和 `/llms-full.txt`。同时建立更新流程：产品页改了、文档结构改了、核心内容更新了，`llms.txt` 也要同步。

如果它变成没人维护的旧文件，就会把错误信息提供给 AI 系统。

## Common mistakes

常见错误有几类。

第一，把 `llms.txt` 写成广告文案。模型不需要“全球领先、创新驱动、赋能未来”这种内容，它需要清晰实体、功能、页面、定义和事实。

第二，文件太长。基础版如果塞进整站所有内容，模型可能截断，重要信息反而丢失。把概览和关键路径放在基础版，深度内容放进 `llms-full.txt`。

第三，不放链接。没有链接，模型即使理解了摘要，也很难关联到具体页面。

第四，不更新。过时价格、过时功能、过时文档，会让 AI answer 传播错误信息。

第五，把它当作唯一 crawlability 方案。它是 fallback，不是根治。核心页面仍然应该尽量返回可读 HTML。

第六，忽略 robots 和访问控制。如果你不希望某些内容被 AI crawler 使用，不要把它放进 `llms.txt`，同时检查 robots、headers、auth 和 WAF 策略是否一致。

## Key takeaways

`llms.txt` 的价值不在于它是标准，而在于它解决了一个真实问题：很多 AI crawler 不渲染 JavaScript，而很多现代网站把内容藏在 hydration 之后。

如果你的 SPA 对 crawler 是空的，`llms.txt` 可以快速提供纯文本 fallback。它应该包含站点概览、关键页面、核心内容摘要和导航提示，并保持短、清晰、可更新。

但它不是 SSR、SSG 或 pre-rendering 的替代品。最稳的 GEO 技术基础，仍然是让重要内容在初始 HTML 中可见，同时用 schema、sitemap、robots、canonical、internal links 和 `llms.txt` 形成一致信号。

## FAQ

### Is llms.txt an official web standard?

不是。它目前更像社区实践和约定，而不是正式标准。正因为还在形成阶段，最好把它当成辅助文件，而不是唯一依赖。

### Does Google use llms.txt?

目前不要把它当成 Google SEO 排名因素。Googlebot 能渲染 JavaScript，传统索引仍然依赖 HTML、链接、sitemap、schema、canonical 等成熟信号。`llms.txt` 更偏向 AI crawler 和语言模型可读性。

### Can llms.txt hurt my SEO?

正常情况下不会。它只是一个纯文本文件。但如果你放了错误内容、过时内容、敏感内容，或者与页面内容冲突，就可能造成 AI 系统理解错误。维护质量比“有没有文件”更重要。

### How often should I update it?

当核心产品、文档、价格、FAQ、内容目录或品牌描述变化时就应该更新。对内容频繁变化的网站，建议把它纳入发布流程，而不是手动偶尔改一次。

### Should I include everything on my site?

不建议。基础 `llms.txt` 应该帮助模型快速理解最重要内容，而不是完整复制整站。把重点页面和主题放进去，长内容放到 `llms-full.txt` 或让 crawler 通过链接继续读取。

## 图片引用

- llms.txt for SPA Hydration Gaps: Why It Exists and How to Use It: https://thegeocommunity.com/images/llms-txt-spa-hydration-gaps.webp

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
- Download PDF: /blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps/print
- The hydration problem: /blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps
- What llms.txt actually is: /blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps
- When you need it (and when you don't): /blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps
- What to put in llms.txt: /blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps
- How AI crawlers discover and use it: /blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps
- llms.txt vs SSR vs pre-rendering: /blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps
- Implementation: step by step: /blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps
- Common mistakes: /blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps
- Key takeaways: /blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps
- FAQ: /blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps
- React: https://react.dev/
- Vue: https://vuejs.org/
- Angular: https://angular.dev/
- Svelte: https://svelte.dev/
- Jeremy Howard: https://llmstxt.org/
- Next.js: https://nextjs.org/
- Nuxt: https://nuxt.com/
- Astro: https://astro.build/
- Prerender.io: https://prerender.io/
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- Is Crawlability Still an SEO Task in 2026? The Word Now Has Two Meanings: /blogs/generative-engine-optimization/crawlability-seo-geo-two-meanings
- robots.txt for AI Bots: What to Allow, What to Block, and Why: /blogs/robots-txt-ai-bots
- AEO vs Generative Engine Optimization (GEO) (Microsoft's framing): /blogs/aeo-vs-geo-microsoft
- Microsoft Clarity's New AI Bot Activity: /blogs/microsoft-clarity-ai-bot-activity
- Is Crawlability Still an SEO Task in 2026? The Word Now Has Two MeaningsCrawlability used to mean one thing. Make sure Google can access you: /blogs/generative-engine-optimization/crawlability-seo-geo-two-meanings
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
