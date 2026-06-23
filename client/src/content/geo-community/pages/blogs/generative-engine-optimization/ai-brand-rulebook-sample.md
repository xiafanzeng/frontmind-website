---
path: "/blogs/generative-engine-optimization/ai-brand-rulebook-sample"
kind: "blog"
title: "The AI Brand Rulebook: A Sample Template Every Marketing Team Can Adapt"
source_title: "The AI Brand Rulebook: A Sample Template Every Marketing Team Can Adapt"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/ai-brand-rulebook-sample"
author: "Rohit Singh"
date: "5 Apr 2026"
status: "ready"
---
# The AI Brand Rulebook: A Sample Template Every Marketing Team Can Adapt

AI guardrails 最容易失败的地方，往往不是技术，而是团队没有先写清楚“AI 到底能说什么、不能说什么、依据哪些文档说”。这份 AI Brand Rulebook 是给营销团队的可改模板：先把政策写成文档，再让 prompt、RAG corpus、validators 和人工升级流程去执行它。

![AI Brand Rulebook Sample Template — Marketing Team Guardrails Document](https://thegeocommunity.com/images/ai-brand-rulebook-sample.webp)

## 页面摘要

这篇文章给出一个可直接改写的 AI Brand Rulebook 模板，覆盖 operating perimeter、red lines、sources of truth、tone and format rules、escalation protocol 和 rollout plan。它适合作为营销、法务、品牌、产品和工程团队共同维护的 AI 内容治理文档。

## 原站章节结构

1. How to use this template
2. How the rulebook maps to your guardrail layers
3. Section 1: Operating perimeter
4. Section 2: Red lines — what the AI must never say
5. Section 3: Sources of truth
6. Section 4: Tone and format rules
7. Section 5: Escalation and human review protocol
8. How to roll this out
9. Related reading

## Key Takeaways

- AI Brand Rulebook 是 guardrail 的政策层，应该由 marketing/legal 定义，engineering 负责实现。
- 文档包含五部分：使用边界、绝对红线、事实来源、语气格式、人工升级协议。
- Red lines 必须具体到可放入 system prompt、banned term list 或 validator 的规则。
- Sources of truth 必须有 owner、版本和更新频率；过期资料进入 RAG，比没有资料更危险。
- 先发布 v1，再用每周 QA 和问题反馈持续更新。

## How to use this template

下面的模板以一个虚构 B2B SaaS 公司 Acme SaaS 为例。所有 `[bracketed text]` 都是你需要替换的字段：公司名、产品类别、定价文档、合规文档、Slack channel、审批角色等。

Rulebook 的价值不是写成一份“漂亮规范”，而是把工程团队需要的输入先确定下来：system prompt 需要哪些禁止规则，RAG corpus 应该包含哪些文档，validator 应该拦截哪些 claim，以及哪些输出必须进入人工 review。

没有这份文档时，规则会在 prompt、代码和临时会议中分散出现，最后没人知道哪条才是最新版。

## How the rulebook maps to your guardrail layers

| Rulebook section | Guardrail layer | Implementation |
|---|---|---|
| Section 1: Operating perimeter | Policy blueprint | 决定 AI 能接触哪些 channel、audience、use case |
| Section 2: Red lines | Prompt guardrails + runtime validators | 禁止 claim、禁止措辞、触发拦截 |
| Section 3: Sources of truth | RAG grounding | 定义事实来源、版本、owner 和更新频率 |
| Section 4: Tone and format rules | Prompt guardrails | 品牌语气、阅读难度、渠道格式 |
| Section 5: Escalation protocol | Monitoring and review | 决定什么情况进入人工审批 |

先写 rulebook，再配置系统。否则工程团队只能根据猜测搭建 RAG 和 validators。

## Section 1: Operating perimeter

```text
Document version: v1.0
Owner: [CMO / Head of Marketing]
Last reviewed: [Date]
Next review: [Quarterly]
```

### Approved channels and use cases

| Channel | Approved use cases | Approval level |
|---|---|---|
| Email marketing | Subject lines, body copy drafts, personalization tokens | Marketing review |
| Website chat | FAQ answers, billing navigation, feature explanations | Approved response library only |
| Ad copy | Headline variants, description drafts | Creative review before publishing |
| Content / blog | Research summaries, outline drafts, headline variants | Editorial review before publishing |
| Social media | Post drafts, caption variants | Social team review |
| Sales outreach, Tier B | Prospecting email drafts, follow-up sequences | SDR review |
| Sales outreach, Tier A / Enterprise | Not approved for AI generation without human authorship | VP Sales sign-off |

### Audiences in scope

- Prospects：top-of-funnel、无商业谈判上下文。
- Existing customers：产品教育、支持、续约信息。
- Internal teams：草稿、摘要、研究，不允许未经审核外发。

### Audiences requiring elevated care

- Enterprise accounts，合同价值高于 `$[X]`。
- Regulated industries：healthcare、finance、legal。
- 正在谈判、续约或投诉中的客户。

Operating perimeter 的目标，是让 AI 系统知道“什么时候可以生成，什么时候只能辅助，什么时候必须停止”。

## Section 2: Red lines — what the AI must never say

Red lines 是绝对规则，不是建议。它们应该原样进入 system prompt、banned phrase list、schema rules 或人工 review trigger。

### Pricing and commercial terms

- 不得陈述任何具体价格、折扣或促销，除非它逐字出现在当前 approved rate card。
- 不得暗示价格灵活，例如 “we can usually work something out”。
- 不得引用过期促销、旧版 sales deck 或上一季度价格。
- 不得说明合同条款、SLA、退款条件，除非引用当前公开政策文档。

### Competitive claims

- 不得直接点名贬低竞争对手。
- 不得说竞品“不安全”“不可靠”“更差”，即使用户主动要求比较。
- 功能比较只能引导用户查看 approved comparison page：`[URL]`。
- 不得根据模型记忆生成竞品定价或功能差异。

### Product capabilities

- 不得宣称不存在于当前 Product Spec Sheet `[version and date]` 的功能。
- 不得说 roadmap feature “coming soon”，除非它出现在 approved public roadmap：`[URL]`。
- 不得说明未在 technical documentation 中记录的 integration、API 或 data handling behavior。

### Regulated claims

- 不得陈述 SOC 2、ISO 27001、HIPAA、privacy 或 security claim，除非来源是当前 Compliance FAQ `[version and date]`。
- 不得给出法律、财务、医疗建议。
- 不得超出已发布 SLA 描述 uptime guarantee。

## Section 3: Sources of truth

任何 factual content 都要对应一个 named、versioned、owned source。如果信息不在来源中，AI 必须说不知道或升级给人工。

| Category | Source document | Owner | Update frequency |
|---|---|---|---|
| Product features | Product Spec Sheet v[X.X] | Product Marketing | Each release |
| Pricing | Rate Card Q[X] [Year] | Revenue / Finance | Quarterly |
| Integrations | Integration Directory | Engineering | Monthly |
| Compliance & security | Compliance FAQ v[X] | Legal / Security | Semi-annually |
| Contractual terms | Master Service Agreement v[X] | Legal | As amended |
| Refund policy | Refund & Cancellation Policy | Customer Success | As amended |
| Brand voice | Brand Guidelines v[X] | Brand / Design | Annually |
| Competitive positioning | Approved Battlecards | Product Marketing | Quarterly |
| Public roadmap | Roadmap Page | Product | Ongoing |

维护规则：超过更新频率仍未刷新时，该文档标记为 stale，并从 RAG corpus 中移除，直到 owner 更新。旧文档进入 RAG，会让系统自信地产生过期答案。

## Section 4: Tone and format rules

### Voice

- Tone：direct、professional、warm，但不要过度 casual。
- 避免 corporate jargon，例如 “synergize”、“leverage”、“best-in-class”。
- Reading level：面向 smart generalist，假设读者聪明但不一定懂内部术语。英文内容可用 Flesch Reading Ease > 60 或 FKGL 7-9 做参考。
- Point of view：客户内容用第二人称 “you / your team”；公司说明用 “we / our”。

### Format rules by channel

| Channel | Max length | Format | Prohibited |
|---|---:|---|---|
| Support chat response | 100 words | Plain prose, one follow-up offer | Long bullet lists |
| Email body | 200 words | 2-3 short paragraphs + 1 CTA | More than 1 CTA, pricing |
| Ad headline | 30 characters | Active verb + benefit | Unverified superlatives |
| Blog section | 300 words | Prose with optional bullets | Lists longer than 5 without intro |

### Prohibited language patterns

- 无证据 superlatives：the most powerful、the fastest、the only solution。
- Urgency manipulation：Act now before it's too late。
- 模糊承诺：We'll take care of everything。
- 对 AI capability 的绝对化描述：不要说 deterministic、guaranteed、always correct。

## Section 5: Escalation and human review protocol

不是所有 AI 输出都要人工审核，但高风险条件必须自动升级。

| Trigger | Reviewer | SLA |
|---|---|---|
| Pricing or commercial term claim | Revenue Ops / Finance | 4 business hours |
| Legal or compliance claim | Legal / Compliance | 1 business day |
| Enterprise account output | Account Manager | 2 business hours |
| Negative brand or competitive content | Brand Lead | 4 business hours |
| Ambiguous or staff-flagged issue | Marketing Ops | Same business day |

```text
Flag channel: [Slack channel / CRM tag / form URL]
Weekly reviewer: [Marketing Ops / QA lead]
Pattern rule: 3+ flags on the same issue type trigger a rulebook or prompt update within 5 business days.
```

## How to roll this out

你不需要等 rulebook 完美才能开始。先做 v1，覆盖 80% 高风险场景，然后用 QA 循环持续更新。

**Week 1**：完成 Section 1、2、4。它们足够支撑第一版 system prompt 和 banned rules。

**Week 2**：完成 Section 3。工程团队根据 sources of truth 建立 RAG corpus。如果没有 versioned source list，RAG 会变成“把所有内部文档都塞进去”。

**Week 3**：实现 Section 5 的升级逻辑。先从 2-3 个最高风险 trigger 开始，比如 pricing、compliance、enterprise account。

**Ongoing**：每周抽样 QA。每一个问题都应该反向更新 rulebook、prompt、RAG source 或 validator。

目标不是写一份完美文档，而是建立一个 shared、written、versioned agreement：AI 能做什么，不能做什么，依据什么做。

## Related reading

- [How to Prevent AI Hallucinations with Brand Guardrails](/blogs/generative-engine-optimization/brand-guardrails-ai-hallucinations)
- [Flesch Reading Ease Score](/blogs/generative-engine-optimization/flesch-reading-ease-marketing-ai)
- [Flesch-Kincaid Grade Level](/blogs/generative-engine-optimization/flesch-kincaid-grade-level-marketing-ai)
- [Gunning Fog Index](/blogs/generative-engine-optimization/gunning-fog-index-marketing-ai)
- [SMOG Index](/blogs/generative-engine-optimization/smog-index-marketing-ai)

## 图片引用

- AI Brand Rulebook Sample Template — Marketing Team Guardrails Document: https://thegeocommunity.com/images/ai-brand-rulebook-sample.webp

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/ai-brand-rulebook-sample/print
- How to use this template: /blogs/generative-engine-optimization/ai-brand-rulebook-sample
- How the rulebook maps to your guardrail layers: /blogs/generative-engine-optimization/ai-brand-rulebook-sample
- Section 1: Operating perimeter: /blogs/generative-engine-optimization/ai-brand-rulebook-sample
- Section 2: Red lines — what the AI must never say: /blogs/generative-engine-optimization/ai-brand-rulebook-sample
- Section 3: Sources of truth: /blogs/generative-engine-optimization/ai-brand-rulebook-sample
- Section 4: Tone and format rules: /blogs/generative-engine-optimization/ai-brand-rulebook-sample
- Section 5: Escalation and human review protocol: /blogs/generative-engine-optimization/ai-brand-rulebook-sample
- How to roll this out: /blogs/generative-engine-optimization/ai-brand-rulebook-sample
- Related reading: /blogs/generative-engine-optimization/ai-brand-rulebook-sample
- brand guardrails framework guide: /blogs/generative-engine-optimization/brand-guardrails-ai-hallucinations
- Flesch Reading Ease: /blogs/generative-engine-optimization/flesch-reading-ease-marketing-ai
- FKGL: /blogs/generative-engine-optimization/flesch-kincaid-grade-level-marketing-ai
- How to Prevent AI Hallucinations with Brand Guardrails: A Practical Guide for Marketing Leaders: /blogs/generative-engine-optimization/brand-guardrails-ai-hallucinations
- Flesch Reading Ease Score: What It Is and How to Use It in AI Content: /blogs/generative-engine-optimization/flesch-reading-ease-marketing-ai
- Flesch–Kincaid Grade Level: What the Score Means and How to Use It in AI Content: /blogs/generative-engine-optimization/flesch-kincaid-grade-level-marketing-ai
- Gunning Fog Index: What It Measures and How to Use It in AI Content: /blogs/generative-engine-optimization/gunning-fog-index-marketing-ai
- SMOG Index: What It Measures and How to Use It in AI Content: /blogs/generative-engine-optimization/smog-index-marketing-ai
- How to Track and Analyze Scroll Depth in GA4: A Complete Guide for Marketers: /blogs/generative-engine-optimization/scroll-depth-analysis-ga4-gtm
- The Original GEO Paper: What Princeton & IIT Delhi Actually Found: /blogs/generative-engine-optimization/geo-princeton-paper-original-study
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
