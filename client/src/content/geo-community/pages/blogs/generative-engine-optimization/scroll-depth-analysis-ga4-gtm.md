---
path: "/blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm"
kind: "blog"
title: "How to Track and Analyze Scroll Depth in GA4: A Complete Guide for Marketers"
source_title: "How to Track and Analyze Scroll Depth in GA4: A Complete Guide for Marketers"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm"
author: "Rohit Singh"
date: "5 Apr 2026"
status: "ready"
---
# How to Track and Analyze Scroll Depth in GA4: A Complete Guide for Marketers

Pageview 告诉你用户打开了页面，scroll depth 告诉你用户是否真的读了它。对 blog posts、landing pages、long-form guides 来说，scroll depth 是比 pageview 更接近“内容是否被消费”的 engagement signal。

![How to Track and Analyze Scroll Depth in GA4 with GTM — Complete Setup Guide](https://thegeocommunity.com/images/scroll-depth-analysis-ga4-gtm.webp)

## 页面摘要

这篇文章讲解如何在 GA4 中追踪 scroll depth：先用 Enhanced Measurement 获取 90% scroll event，再用 Google Tag Manager 设置 25/50/75/90% thresholds、发送 `scroll_depth` event 与 `scroll_percentage` parameter，并在 GA4 Explorations 中分析每个页面的 drop-off curve。

## 原站章节结构

1. What is scroll depth and why it matters
2. Two ways to track scroll in GA4
3. Step-by-step: set up custom scroll tracking with GTM and GA4
4. How to analyze scroll depth in GA4
5. How to turn scroll data into action
6. Recommended setup patterns at a glance
7. Actionable next steps
8. Related reading

## Key Takeaways

- GA4 Enhanced Measurement 默认只在约 90% scroll 时触发一个 `scroll` event，适合快速启用，但无法看到 25/50/75% 分布。
- GTM Scroll Depth trigger 可以在 25、50、75、90% 触发 GA4 event，并发送 `scroll_percentage` parameter。
- 在 GA4 Admin 中把 `scroll_percentage` 注册为 event-scoped custom dimension，才能在 Explorations 和 reports 中使用。
- 用 Free Form Exploration，把 Page path 做 rows、Scroll percentage 做 columns，可以看到每个页面的 scroll drop-off。
- Scroll depth 要和内容修改、CTA 位置、流量来源、conversion rate 一起分析，才会变成可执行洞察。

## What is scroll depth and why it matters

Scroll depth 指用户在页面上向下滚动到的比例，常见阈值是 25%、50%、75%、90% 或 100%。实现方式通常是在用户 viewport 跨过某个阈值时发送事件。

它重要，因为 pageview 本身太粗。用户可能只看了标题就走，也可能看完了文章。对内容型页面来说，这两种访问在 pageview 里看起来一样，但商业意义完全不同。

Scroll depth 可以回答：

- 高流量页面是否真的被阅读。
- 用户在 25%、50%、75% 之间哪里流失。
- CTA 是否放在大多数用户看不到的位置。
- 长文章是否过长、开头是否拖沓。
- 不同 acquisition channels 的阅读质量是否不同。

如果 80% 用户到达 25%，但只有 10% 到达 75%，你的核心论点、CTA 或信任证明可能埋得太深。

## Two ways to track scroll in GA4

### Option A: GA4 Enhanced Measurement

GA4 内置 Enhanced Measurement，可在用户接近页面底部时触发 `scroll` event。通常是 90% 阈值。

启用方法：

1. 进入 GA4 Admin。
2. 打开 Data streams。
3. 选择你的 web data stream。
4. 在 Enhanced measurement 中点击 gear icon。
5. 打开 Scrolls。
6. Save。

优点是 2 分钟启用，不需要 GTM。缺点是只有一个 90% 数据点，无法判断用户是在 25%、50% 还是 75% 流失。

### Option B: Custom scroll tracking via GTM

如果要真正分析内容深度，建议用 Google Tag Manager 设置 25/50/75/90% thresholds，再发送自定义 GA4 event。

适合回答：

- 哪些页面用户过不了 50%。
- blog posts 和 product pages 的 scroll pattern 有何不同。
- CTA 放在 70% 页面位置是否太低。
- social traffic 和 organic traffic 的阅读深度是否不同。

## Step-by-step: set up custom scroll tracking with GTM and GA4

### Step 1: Configure the GTM scroll depth trigger

在 GTM 中：

1. 进入 Variables -> Configure。
2. 启用 `Scroll Depth Threshold` 和 `Scroll Depth Units`。
3. 进入 Triggers -> New -> Trigger Configuration -> Scroll Depth。
4. Scroll Direction 选择 Vertical。
5. Threshold units 选择 Percentages。
6. Thresholds 输入 `25, 50, 75, 90`。
7. Enable this trigger on 选择 All Pages，或只限定 blog / landing pages。
8. 命名为 `Scroll - Vertical - 25/50/75/90%`。

发布前先用 GTM Preview mode 测试。滚动页面时，Preview panel 应显示 trigger 在每个阈值触发，并带有正确的 Scroll Depth Threshold。

### Step 2: Create the GA4 event tag

创建一个 GA4 Event tag：

- Tag type：Google Analytics: GA4 Event。
- Configuration：选择现有 GA4 config，或填入 Measurement ID。
- Event name：`scroll_depth`。
- Event parameters：

| Parameter name | Value |
|---|---|
| `scroll_percentage` | `{{Scroll Depth Threshold}}` |

Triggering 选择刚才的 Scroll Depth trigger。

测试方式：

1. 打开 GTM Preview。
2. 在测试页面滚动到 25/50/75/90%。
3. 确认 `scroll_depth` 事件触发。
4. 打开 GA4 Realtime -> Events。
5. 确认 `scroll_percentage` 参数出现。

确认无误后再 publish container。

### Step 3: Register a custom dimension in GA4

发送参数还不够。GA4 要在 reporting 中使用 parameter，需要先注册 custom dimension。

路径：

1. GA4 Admin -> Custom definitions。
2. Create custom dimension。
3. Dimension name：`Scroll percentage`。
4. Scope：Event。
5. Event parameter：`scroll_percentage`。
6. Save。

注意：custom dimension 不追溯历史数据。注册前已经收集的 parameter 不会自动回填到报告。通常需要等待 24-48 小时，数据才会稳定进入 Explorations。

## How to analyze scroll depth in GA4

### A. Quick analysis with Enhanced Measurement only

如果只启用了内置 `scroll` event：

- 进入 Reports -> Engagement -> Events。
- 筛选 Event name = `scroll`。
- 对比同页面 Views，估算 90% completion rate。
- 找出 scroll completion 明显低于平均值的页面。

这能告诉你“用户有没有快看完”，但不能告诉你“在哪里流失”。

### B. Detailed drop-off analysis in Explorations

在 Explore 中创建 Free Form：

- Rows：`Page path`。
- Columns：`Scroll percentage`。
- Values：`Event count` 和 `Total users`。
- Filter：Event name exactly matches `scroll_depth`。

结果会是一张矩阵。横向看一个页面，就能看到到达 25%、50%、75%、90% 的用户数量变化。

你也可以做 Funnel Exploration，把 25 -> 50 -> 75 -> 90 当成 stages，直接可视化流失率。

### C. Custom standard report for ongoing monitoring

如果每月都要看 scroll depth，可以保存成标准报告：

- 在 Pages report 中添加 `Scroll percentage` 作为 secondary dimension。
- filter event name contains `scroll`。
- Save as new report，命名为 `Scroll depth by page`。

这样内容复盘时不需要每次重建 Exploration。

## How to turn scroll data into action

**Identify weak pages**

找出流量高但 50% 或 75% scroll rate 低的页面。常见原因是 intro 太长、首屏没有明确价值、CTA 太靠下、文章结构太散。

**Optimize layout and content length**

如果关键页面大量用户在 50% 前离开，可以测试更短 intro、更早 CTA、更清晰 heading hierarchy，或把核心结论提前。

**Segment by traffic source**

Social traffic scroll depth 低不一定代表内容差，可能是 intent 低。Organic search traffic 如果 scroll depth 低，通常更值得优先修。

**Tie scroll depth to outcomes**

建立一个 reached 75%+ 的 segment，对比没有深度滚动的用户 conversion rate。如果 high-scroll users 转化率明显更高，你就有理由投资内容结构优化。

**Use readability as a companion metric**

长文页面 deep-scroll 差时，同时检查 readability。更清楚的句子、短段落、表格和列表，往往能提升继续阅读概率。

## Recommended setup patterns at a glance

| Goal | Recommended setup | Notes |
|---|---|---|
| Simple engagement signal | Enable GA4 Scrolls in Enhanced Measurement | 90% only，快速上线 |
| Content depth distribution | GTM thresholds 25/50/75/90 + GA4 `scroll_depth` event | 适合内容团队和 CRO |
| Reporting in GA4 | Register `scroll_percentage` custom dimension | 必须提前注册，不追溯 |
| Ongoing monitoring | Save custom Pages report filtered to scroll events | 避免每月重建 Exploration |

## Actionable next steps

1. 今天先打开 GA4 Enhanced Measurement 的 Scrolls。
2. 本周用 GTM 设置 25/50/75/90% scroll thresholds。
3. 发布前用 GTM Preview 和 GA4 Realtime 双重验证。
4. 在 GA4 注册 `scroll_percentage` custom dimension。
5. 48 小时后创建 Free Form Exploration。
6. 找出 top 10 traffic pages 中 deep-scroll 表现最差的页面。
7. 为每页记录一个改动测试：更短 intro、更早 CTA、重写 heading、缩短段落或移动关键 proof。

## Related reading

- [Flesch Reading Ease Score: What It Is and How to Use It in AI Content](/blogs/generative-engine-optimization/flesch-reading-ease-marketing-ai)
- [Search Everywhere Optimization: What the Patent Actually Says](/blogs/generative-engine-optimization/search-everywhere-optimization-thematic-search)
- [Why AI Content at Scale Works — and Why It's Risky](/blogs/generative-engine-optimization/why-ai-content-works-at-scale)
- [The Original GEO Paper: What Princeton & IIT Delhi Actually Found](/blogs/generative-engine-optimization/geo-princeton-paper-original-study)
- [How to Use Google's LangExtract Library to Improve Your GEO](/blogs/generative-engine-optimization/langextract-gemini-generative-engine-optimization)

## 图片引用

- How to Track and Analyze Scroll Depth in GA4 with GTM — Complete Setup Guide: https://thegeocommunity.com/images/scroll-depth-analysis-ga4-gtm.webp

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
- Download PDF: /blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm/print
- What is scroll depth and why it matters: /blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm
- Two ways to track scroll in GA4: /blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm
- Step-by-step: set up custom scroll tracking with GTM and GA4: /blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm
- How to analyze scroll depth in GA4: /blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm
- How to turn scroll data into action: /blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm
- Recommended setup patterns at a glance: /blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm
- Actionable next steps: /blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm
- Related reading: /blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm
- Google Tag Manager: https://support.google.com/tagmanager/answer/7679218?hl=en
- Flesch Reading Ease: /blogs/generative-engine-optimization/flesch-reading-ease-marketing-ai
- Flesch Reading Ease Score: What It Is and How to Use It in AI Content: /blogs/generative-engine-optimization/flesch-reading-ease-marketing-ai
- Search Everywhere Optimization: What the Patent Actually Says: /blogs/generative-engine-optimization/search-everywhere-optimization-thematic-search
- Why AI Content at Scale Works — and Why It's Risky: /blogs/generative-engine-optimization/why-ai-content-works-at-scale
- The Original GEO Paper: What Princeton & IIT Delhi Actually Found: /blogs/generative-engine-optimization/geo-princeton-paper-original-study
- How to Use Google's LangExtract Library to Improve Your GEO: /blogs/generative-engine-optimization/langextract-gemini-generative-engine-optimization
- Rohit Singh: https://www.linkedin.com/in/rohitsingh017
- GeoZ AI: https://www.geoz.ai/
- Connect on LinkedIn: https://www.linkedin.com/in/rohitsingh017
- Google Analytics Now Has a Native AI Assistant Channel. Here's What Changes for GEO Measurement.As of May 13, 2026, Google Analytics automat: /blogs/generative-engine-optimization/google-analytics-ai-assistant-channel-native-tracking
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
