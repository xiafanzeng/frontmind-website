---
path: "/blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale"
kind: "blog"
title: "Claude for Title Tags and Meta Descriptions: A Scalable System for Any Page Type"
source_title: "Claude for Title Tags and Meta Descriptions: A Scalable System for Any Page Type"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale"
author: "Rohit Singh"
date: "9 Apr 2026"
status: "ready"
---
# Claude for Title Tags and Meta Descriptions: A Scalable System for Any Page Type

Title tags 和 meta descriptions 是很多网站最容易 stale 的 SEO assets。它们上线时写一次，然后随着产品、SERP、竞争对手和 Google rewrites 变化而失效。Claude 的价值，是把这项 500 页面级别的机械工作变成可控 batch workflow。

![Claude for Title Tags and Meta Descriptions at Scale — Batch Generation System](https://thegeocommunity.com/images/claude-title-tags-meta-descriptions-scale.webp)

## 页面摘要

这篇文章给出 Claude 批量生成 title tags 和 meta descriptions 的系统：system prompt 中写入字符限制、关键词规则、page type templates、brand voice 和 output format；batch input 使用固定字段；生成后再用 quality gate prompt 检查字符数、关键词、重复模板和禁用词。

## 原站章节结构

1. The system prompt: your entire quality control layer
2. Batch input structure
3. Page type templates
4. The generation prompt
5. The quality gate prompt
6. CTR optimization patterns
7. Handling existing titles and metas (rewrites vs new)
8. Scaling to 500+ pages
9. Common mistakes
10. FAQ

## Key Takeaways

- System prompt 是质量控制层：title <= 60 characters，meta <= 160 characters，primary keyword placement，brand voice，page type formulas 都写在这里。
- Batch input 要结构化：Slug | Page Type | Primary Keyword | Current Title | Current Meta | Notes。
- 每种 page type 需要不同公式：blog、category、product/service、landing page 的搜索意图不同。
- 生成后必须跑 quality gate，让 Claude 标记超字符、缺关键词、重复结构和禁用词。
- 50-100 pages 是较稳 batch size；500+ pages 应按 page type 和 impression priority 拆批。

## The system prompt: your entire quality control layer

最重要的不是 generation prompt，而是 system prompt。它承载所有规则。

```text
You are an SEO copywriter generating title tags and meta descriptions.

Hard rules:
- Title tags: max 60 characters including spaces.
- Meta descriptions: max 160 characters including spaces.
- Every title tag must include the primary keyword.
- Every meta description must include the primary keyword within the first 120 characters.
- Do not use "comprehensive" or "ultimate".
- Count characters and return counts.

Page type formulas:
- Blog post: [Primary Keyword]: [Specific Benefit or Insight] | [Brand]
- Category page: [Category]: [What the Reader Gets] | [Brand]
- Product/service page: [Product/Service] - [Key Differentiator] | [Brand]
- Landing page: [Action] [Benefit]: [Primary Keyword] | [Brand]

Meta formula:
[Specific value statement] + [what the reader gets] + [CTA]

Brand voice:
[direct, data-driven, no filler, active voice]

Output:
Slug | Page Type | Title Tag | Title Char Count | Meta Description | Meta Char Count
```

Character count columns 不是装饰，它们是最快的质量检查入口。

## Batch input structure

Claude 输出稳定，前提是输入稳定。推荐字段：

```text
Slug | Page Type | Primary Keyword | Current Title | Current Meta | Notes
```

示例：

```text
claude-for-seo | blog | claude for seo | Claude for SEO Guide | How to use Claude for SEO in 2026 | hub post
pricing | landing page | AI SEO pricing | Pricing - Our Plans | See our pricing options | emphasize no contract
seo-services | service page | SEO services | SEO Services | Professional SEO services | local service intent
```

Notes 字段用于放页面级约束：CTA、竞争角度、CMS 限制、是否保留旧 title 中的数据点等。

数据来源：

- GSC Performance -> Pages。
- CMS page export。
- Screaming Frog crawl export。
- Ahrefs / Semrush site audit。

## Page type templates

**Blog post**

Formula：`[Primary Keyword]: [Specific Benefit or Insight]`

适合 informational / educational intent。brand 可选，超过 60 chars 时可省略。

**Category / pillar page**

Formula：`[Category]: [What the Reader Gets] | [Brand]`

适合 hub、资源中心、分类页。

**Product / service page**

Formula：`[Product/Service] - [Key Differentiator] | [Brand]`

强调差异化、服务对象或核心结果。

**Landing page**

Formula：`[Action Verb] [Benefit]: [Primary Keyword]`

更适合转化型页面，强调 action 和 benefit。

**Meta description**

统一公式：

```text
[Specific claim or number] + [what reader learns or gets] + [what to do next]
```

例如：`Claude classifies 500 keywords by intent in minutes. Get the workflow, prompts, and scoring table for SEO teams.`

## The generation prompt

system prompt 设置好后，generation prompt 保持短：

```text
Generate title tags and meta descriptions for the following pages.
Follow all rules in the system prompt exactly.
Return the results as a table:
Slug | Page Type | Title Tag | Title Char Count | Meta Description | Meta Char Count

Pages:
[paste batch input table]
```

一次建议 50 pages 左右。超过 100 pages，字符计数和模板一致性更容易出错。

## The quality gate prompt

生成后在同一 conversation 里跑 second pass：

```text
Review the table you generated.
Flag every row with any issue:
1. Title tag over 60 characters.
2. Meta description over 160 characters.
3. Primary keyword missing from title.
4. Primary keyword missing from first 120 characters of meta.
5. Uses banned words: comprehensive, ultimate.
6. Same structural pattern appears more than 3 times.

For each flagged row, provide a corrected version.
```

Quality gate 通常能抓出 5-15% batch issues，比人工逐行检查快很多。

## CTR optimization patterns

- **Numbers improve scanability**：准确时使用具体数字。
- **Parentheticals add context**：如 `(With Prompt Templates)`、`(Step-by-Step)`。
- **Question titles work for informational content**：例如 “Does Claude Replace Ahrefs for Keyword Research?”。
- **Avoid modifier inflation**：少用 best、ultimate、definitive，改用具体结果。
- **Meta needs an action**：结尾用 “Copy the prompts”、“See the workflow”、“Check your page” 等具体动作。

这些规则可以写进 system prompt，避免每批重复提醒。

## Handling existing titles and metas (rewrites vs new)

如果页面已有 title/meta，Claude 应该改进而不是完全替换。

```text
When Current Title or Current Meta exists, treat it as a starting point.
Keep accurate data points and claims.
Rewrite only to fix:
- character limit violations
- missing keywords
- weak CTR patterns
- duplicate phrasing
- brand voice issues
```

优先级：

1. 超字符导致 SERP truncation 的页面。
2. title 缺 primary keyword 的页面。
3. duplicate title tags。
4. 高 impressions 低 CTR 的页面。
5. 旧产品/旧定位页面。

## Scaling to 500+ pages

500+ pages 不要一次性扔给 Claude。

流程：

1. 按 page type 拆批：blog、product、category、landing。
2. 按 GSC impressions 排序，先做 top 100。
3. 每批 50 pages。
4. 每批生成后跑 quality gate。
5. 合并到 spreadsheet。
6. 对合并结果再跑 final quality gate，抓跨批重复模板。
7. 由 developer 或 CMS admin 批量导入。

不要从 chat window 手工复制到 CMS。规模化一定要 spreadsheet 作为 master document。

## Common mistakes

**No system prompt**

每次 inline 重复规则会造成输出不一致。

**Batch too large**

100+ pages 容易出现字符错误和重复模板。

**Skipping quality gate**

Claude 会犯 character count mistakes。Second pass 是必要步骤。

**Same formula for all page types**

Blog title 和 landing page title 的 intent 不同，不能共用一个公式。

**No primary keyword per page**

让 Claude 推断关键词不可靠。每行必须显式提供 primary keyword。

## FAQ

### Will Claude's output get accepted by Google or rewritten?

Google 会重写不匹配页面内容或 query intent 的 title。Claude output 如果准确反映页面、字符不过长、包含目标关键词，接受率与人工写作没有本质差别。

### How do I check if current title tags are over the limit?

用 Screaming Frog、Ahrefs Site Audit 或 Semrush Site Audit 导出 title length 和 meta length，再作为 batch input。

### Can Claude generate titles in other languages?

可以。在 system prompt 写明目标语言，并继续保留字符限制。CJK 字符视觉宽度不同，quality gate 要更仔细。

### What if my CMS auto-generates title tags?

如果 CMS 只能从 page title 生成 SEO title，就要改 page title。如果插件支持独立 SEO title 字段，就把 Claude output 导入 SEO title field。

### How often should titles and metas be refreshed?

高流量页面至少每年 review 一次，或在 core update、产品定位变化、CTR 下滑后 review。低流量页面可 18-24 个月批量检查一次。

## Related reading

- [Claude for SEO: The Complete Practitioner's Guide](/blogs/generative-engine-optimization/claude-for-seo-complete-guide)
- [How to Use Claude for On-Page SEO Audits](/blogs/generative-engine-optimization/claude-on-page-seo-audit)
- [Claude for Schema Markup](/blogs/generative-engine-optimization/claude-schema-markup-json-ld-generator)
- [System Prompts and Role Prompting for Brand Voice](/blogs/generative-engine-optimization/system-prompts-role-prompting-brand-voice)
- [Why JSON-LD Is Important](/blogs/generative-engine-optimization/why-json-ld-is-important-google)

## 图片引用

- Claude for Title Tags and Meta Descriptions at Scale — Batch Generation System: https://thegeocommunity.com/images/claude-title-tags-meta-descriptions-scale.webp

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- View Full Library →: /ai-for-seo
- ★Claude for SEO: The Complete Practitioner's Guide (10 Workflows That Replace Manual Work): /blogs/generative-engine-optimization/claude-for-seo-complete-guide
- 1Keyword Research with Claude: /blogs/generative-engine-optimization/claude-keyword-research-seo
- 2Content Gap Analysis with Claude: /blogs/generative-engine-optimization/claude-content-gap-analysis-seo
- 3Competitor Content Analysis with Claude: /blogs/generative-engine-optimization/claude-competitor-content-analysis
- 1SEO Content Briefs with Claude: /blogs/generative-engine-optimization/claude-content-briefs-seo
- 2Title Tags & Meta Descriptions at Scale: /blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale
- 3On-Page SEO Audits with Claude: /blogs/generative-engine-optimization/claude-on-page-seo-audit
- 1Schema Markup & JSON-LD Generation: /blogs/generative-engine-optimization/claude-schema-markup-json-ld-generator
- 2Internal Linking Strategy & Map: /blogs/generative-engine-optimization/claude-internal-linking-strategy
- 1SEO Reporting & GA4 Data Interpretation: /blogs/generative-engine-optimization/claude-seo-reporting-data-interpretation
- 2Connect Google Analytics MCP to Claude: /blogs/generative-engine-optimization/connect-google-analytics-mcp-to-claude
- 3Scroll Depth Tracking in GA4: /blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm
- 1Zero-Shot vs Few-Shot Prompting: /blogs/generative-engine-optimization/zero-shot-vs-few-shot-prompting-seo-content
- 2Chain-of-Thought Prompting for Content: /blogs/generative-engine-optimization/chain-of-thought-prompting-content-strategy
- 3System Prompts & Role Prompting: /blogs/generative-engine-optimization/system-prompts-role-prompting-brand-voice
- 4Prompt Chaining for SEO Workflows: /blogs/generative-engine-optimization/prompt-chaining-seo-workflows
- 5Prompt Testing & Iteration: /blogs/generative-engine-optimization/prompt-testing-iteration-evaluate-improve
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale/print
- The system prompt: your entire quality control layer: /blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale
- Batch input structure: /blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale
- Page type templates: /blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale
- The generation prompt: /blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale
- The quality gate prompt: /blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale
- CTR optimization patterns: /blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale
- Handling existing titles and metas (rewrites vs new): /blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale
- Scaling to 500+ pages: /blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale
- Common mistakes: /blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale
- FAQ: /blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale
- Claude: https://claude.ai/
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- Claude for SEO: The Complete Practitioner's Guide (10 Workflows That Replace Manual Work): /blogs/generative-engine-optimization/claude-for-seo-complete-guide
- How to Use Claude for On-Page SEO Audits: Faster Analysis, Prioritized Fixes: /blogs/generative-engine-optimization/claude-on-page-seo-audit
- Claude for Schema Markup: Generate Valid JSON-LD for Any Page Type in Under a Minute: /blogs/generative-engine-optimization/claude-schema-markup-json-ld-generator
- System Prompts and Role Prompting for Brand Voice: /blogs/generative-engine-optimization/system-prompts-role-prompting-brand-voice
- Why JSON-LD Is Important (and Why It Only Matters for Google): /blogs/generative-engine-optimization/why-json-ld-is-important-google
- Explore the Learning Path →: /start
- Is Your Website AI Agent-Ready? The New Lighthouse Agentic Browsing Audit Tests Three Things Most SEOs MissGoogle's new Lighthouse 'Agentic : /blogs/generative-engine-optimization/website-ai-agent-readiness-lighthouse-audit
- Best Courses for AI SEO, AEO & GEO: Ranked Picks for 2026CXL, Coursera, Jellyfish, Reforge, and The GEO Community — ranked and compared acro: /blogs/generative-engine-optimization/best-courses-ai-seo-aeo-geo-2026
- Google's AI Optimization Guide Is Useful. The GEO Hype? Not So Much.Google published its AI Overviews optimization guide and the SEO world i: /blogs/generative-engine-optimization/google-ai-optimization-guide-geo-hype
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
