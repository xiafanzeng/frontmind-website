---
path: "/ai-for-seo"
kind: "page"
title: "SEO Workflows"
source_title: "SEO Workflows"
source_url: "https://thegeocommunity.com/ai-for-seo"
author: ""
date: ""
status: "ready"
---
# SEO Workflows

这个页面收录 Claude 驱动的 SEO 工作流。目标不是让模型替代策略判断，而是把重复、耗时、可结构化的部分交给 LLM：关键词聚类、意图分类、竞品内容分析、内容 brief、标题和 meta 批量生成、站内审计、schema、内链地图和 GA4 报告。

每个工作流都应该保留三个层次：明确输入、可复用提示词、可交付输出格式。这样团队才能在几分钟内运行，而不是每次都从空白对话开始。

## Claude for SEO

Claude 可以替代标准 SEO 流程中大量手动工作，但不能替代判断。适合自动化的是信息整理、模式识别、结构化输出和初步建议；需要人类把关的是优先级、商业语境、品牌风险和最终发布。

完整指南：[Claude for SEO complete guide](/blogs/generative-engine-optimization/claude-for-seo-complete-guide)

## Workflow Library

### Keyword Research & Competitive Intelligence

用 Claude 处理关键词和竞品时，重点是把混乱输入变成清晰结构：按意图聚类、标注 funnel 阶段、识别内容缺口、比较竞品角度，并给机会打分。

- [Keyword Research with Claude](/blogs/generative-engine-optimization/claude-keyword-research-seo)
- [Content Gap Analysis with Claude](/blogs/generative-engine-optimization/claude-content-gap-analysis-seo)
- [Competitor Content Analysis with Claude](/blogs/generative-engine-optimization/claude-competitor-content-analysis)

![Claude keyword research SEO workflow](/images/claude-keyword-research-seo.webp)

![Claude content gap analysis SEO workflow](/images/claude-content-gap-analysis-seo.webp)

![Claude competitor content analysis workflow](/images/claude-competitor-content-analysis.webp)

### Content Production

内容生产工作流覆盖从 brief 到页面刷新。Claude 适合生成结构化 brief、标题/描述候选、站内优化建议和编辑检查清单，但输出必须经过事实核查、品牌语气审查和 SERP/AI 答案验证。

- [SEO Content Briefs with Claude](/blogs/generative-engine-optimization/claude-content-briefs-seo)
- [Title Tags & Meta Descriptions at Scale](/blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale)
- [On-Page SEO Audits with Claude](/blogs/generative-engine-optimization/claude-on-page-seo-audit)

![Claude content briefs SEO](/images/claude-content-briefs-seo.webp)

![Claude title tags and meta descriptions at scale](/images/claude-title-tags-meta-descriptions-scale.webp)

![Claude on-page SEO audit workflow](/images/claude-on-page-seo-audit.webp)

### Technical SEO

技术 SEO 工作流适合生成结构化输出：JSON-LD、内部链接地图、页面类型规则、QA 清单和开发交接说明。这里的关键是让 Claude 输出“可实施”的内容，而不是策略 deck。

- [Schema Markup & JSON-LD Generation](/blogs/generative-engine-optimization/claude-schema-markup-json-ld-generator)
- [Internal Linking Strategy & Map](/blogs/generative-engine-optimization/claude-internal-linking-strategy)

![Claude schema markup generator](/images/claude-schema-markup-json-ld-generator.webp)

![Claude internal linking strategy workflow](/images/claude-internal-linking-strategy.webp)

### Analytics & Reporting

报告工作流把 GA4、Search Console、AI 推荐流量和业务指标变成可解释的叙事。Claude 能帮助发现异常、生成高管摘要、提出假设和组织多指标关联，但数据提取和口径仍要可追溯。

- [SEO Reporting & GA4 Data Interpretation](/blogs/generative-engine-optimization/claude-seo-reporting-data-interpretation)
- [Connect Google Analytics MCP to Claude](/blogs/generative-engine-optimization/connect-google-analytics-mcp-to-claude)
- [Scroll Depth Tracking in GA4](/blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm)

![Claude SEO reporting and GA4 interpretation](/images/claude-seo-reporting-data-interpretation.webp)

![Connect Google Analytics MCP to Claude](/images/connect-google-analytics-mcp-to-claude.webp)

![Scroll depth analysis in GA4 with GTM](/images/scroll-depth-analysis-ga4-gtm.webp)

### Prompting Foundations

提示词基础是所有 SEO 工作流的底层能力。掌握 zero-shot、few-shot、role prompting、prompt chaining 和迭代测试，能让每个工作流更稳定、更可复用。

- [Zero-Shot vs Few-Shot Prompting](/blogs/generative-engine-optimization/zero-shot-vs-few-shot-prompting-seo-content)
- [Chain-of-Thought Prompting for Content](/blogs/generative-engine-optimization/chain-of-thought-prompting-content-strategy)
- [System Prompts & Role Prompting](/blogs/generative-engine-optimization/system-prompts-role-prompting-brand-voice)
- [Prompt Chaining for SEO Workflows](/blogs/generative-engine-optimization/prompt-chaining-seo-workflows)
- [Prompt Testing & Iteration](/blogs/generative-engine-optimization/prompt-testing-iteration-evaluate-improve)

![Zero-shot vs few-shot prompting for SEO content](/images/zero-shot-vs-few-shot-prompting-seo-content.webp)

## Looking for GEO fundamentals?

这些 SEO 工作流建立在更广的 GEO 学习路径之上。先理解 AI 引擎如何抓取、检索、排序和引用内容，再用 Claude 提升具体执行速度。

入口：[Explore the GEO Learning Path](/start)

## How to use this workflow library

这个页面在原站里不是一篇普通文章，而是 Claude SEO workflow 的目录。每张卡片都对应一个可执行 workflow：输入什么数据、使用什么提示词、输出什么格式、哪些边界必须人工检查。中文复刻版保留这些入口，方便后续继续扩写每个 workflow。

使用顺序建议从最大的时间消耗开始。如果团队每周花很多时间整理关键词和竞品，先读 [Keyword Research with Claude](/blogs/generative-engine-optimization/claude-keyword-research-seo)、[Content Gap Analysis with Claude](/blogs/generative-engine-optimization/claude-content-gap-analysis-seo) 和 [Competitor Content Analysis with Claude](/blogs/generative-engine-optimization/claude-competitor-content-analysis)。如果瓶颈在生产内容，先读 [SEO Content Briefs with Claude](/blogs/generative-engine-optimization/claude-content-briefs-seo)、[Title Tags & Meta Descriptions](/blogs/generative-engine-optimization/claude-title-tags-meta-descriptions-scale) 和 [On-Page SEO Audits](/blogs/generative-engine-optimization/claude-on-page-seo-audit)。

技术团队可以从 [Schema Markup & JSON-LD Generation](/blogs/generative-engine-optimization/claude-schema-markup-json-ld-generator) 和 [Internal Linking Strategy](/blogs/generative-engine-optimization/claude-internal-linking-strategy) 开始。分析团队则可以读 [SEO Reporting & GA4 Data Interpretation](/blogs/generative-engine-optimization/claude-seo-reporting-data-interpretation)、[Connect Google Analytics MCP to Claude](/blogs/generative-engine-optimization/connect-google-analytics-mcp-to-claude) 和 [Scroll Depth Tracking](/blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm)。

所有 Claude workflow 都应保留人工 gate。模型可以聚类、总结、生成初稿、提出建议和格式化输出，但不能替团队决定优先级、商业风险、事实准确性或最终发布。每个 workflow 都建议输出三层内容：结果表、假设说明、人工检查清单。这样它才是可复用流程，而不是一次性聊天。

## Prompting foundation behind the workflows

原站把 prompting foundations 放在同一页，是因为 SEO workflow 的稳定性来自提示词结构。Zero-shot 适合快速分类和初步分析；few-shot 适合固定输出格式；role prompting 适合让模型扮演编辑、审计员或分析师；prompt chaining 适合把研究、聚类、brief、审稿和报告拆成连续步骤；prompt testing 则用于发现输出漂移。

如果一个 Claude workflow 经常失败，通常不是模型“不够聪明”，而是输入不稳定、任务太大、输出格式不清、没有例子、没有检查标准。把 workflow 变成 SOP 时，要写清楚：需要粘贴哪些字段，禁止模型做哪些推断，输出必须有哪些列，哪些结论必须带来源，哪些项需要人类确认。

这个页面和 [Prompt Library](/resources/prompt-library)、[Zero-Shot vs Few-Shot Prompting](/blogs/generative-engine-optimization/zero-shot-vs-few-shot-prompting-seo-content)、[Chain-of-Thought Prompting](/blogs/generative-engine-optimization/chain-of-thought-prompting-content-strategy)、[System Prompts & Role Prompting](/blogs/generative-engine-optimization/system-prompts-role-prompting-brand-voice)、[Prompt Chaining](/blogs/generative-engine-optimization/prompt-chaining-seo-workflows) 共同组成提示词底层。

## Workflow QA checklist

每次把 Claude 用到 SEO 流程里，都要检查六件事。第一，输入数据是否完整，是否包含 URL、关键词、SERP、竞品、业务目标和限制。第二，输出是否结构化，能否直接进入 brief、issue tracker、report 或 spreadsheet。第三，事实是否可追溯，模型是否标出它不确定的地方。第四，是否有品牌语气和合规检查。第五，是否保留原始数据和模型输出，方便复盘。第六，是否有人类审批最终发布。

对 GEO 来说，还要额外检查输出是否适合 AI citation：首段是否直接回答，关键 claim 是否有来源，FAQ 是否能独立成立，schema 是否与正文一致，内部链接是否指向相关 hub。Claude 可以提高执行速度，但 GEO 的最终目标仍然是更好的证据和更清楚的页面。
