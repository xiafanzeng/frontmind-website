---
path: "/blogs/generative-engine-optimization/smog-index-marketing-ai"
kind: "blog"
title: "SMOG Index: What It Measures, What the Research Shows, and How to Use It in AI Content"
source_title: "SMOG Index: What It Measures, What the Research Shows, and How to Use It in AI Content"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/smog-index-marketing-ai"
author: "Rohit Singh"
date: "5 Apr 2026"
status: "ready"
---
# SMOG Index: What It Measures, What the Research Shows, and How to Use It in AI Content

SMOG Index，全称 Simple Measure of Gobbledygook，是一个用来估算“完整理解一段文本需要什么教育水平”的可读性公式。它比 Flesch 或 FKGL 更保守，尤其擅长抓住 AI 内容里常见的多音节词堆叠、名词化和看似专业但实际增加理解负担的表达。

![SMOG Index for Marketing and AI Content — Guide for Marketing Teams](https://thegeocommunity.com/images/smog-index-marketing-ai.webp)

## 页面摘要

这篇文章解释 SMOG 公式如何计算、它和 Flesch Reading Ease、Flesch-Kincaid Grade Level、Gunning Fog 的差异、研究为什么认为它更适合预测完整理解，以及如何把 SMOG ceiling 写进 AI Brand Rulebook 和 system prompt。

## 原站章节结构

1. What the SMOG formula calculates
2. How SMOG differs from Flesch, FKGL, and Gunning Fog
3. How to interpret SMOG scores
4. Calibration examples — what each SMOG range looks like
5. What the research shows about SMOG accuracy
6. Why AI content scores high on SMOG
7. How SMOG connects to the AI Brand Rulebook
8. System prompt instructions that enforce a SMOG target
9. SMOG targets by content type
10. Related reading

## Key Takeaways

- SMOG 衡量的是 full comprehension，而不是“读起来还行”。同一段文本的 SMOG 往往比 FKGL 高 1-3 个年级。
- SMOG 重点统计 3 个或更多音节的单词，因此对 jargon、Latinate vocabulary 和 nominalization chain 特别敏感。
- 健康素养研究常偏好 SMOG，因为它比 Flesch 或 FKGL 更接近真实理解门槛。
- 一般营销内容建议把 SMOG 控制在 10-11 以下；面向广泛消费者或压力场景的内容应更低。
- 对 AI 内容最有效的 prompt 约束是限制 polysyllabic word density，例如不超过总词数 10%。

## What the SMOG formula calculates

G. Harry McLaughlin 在 1969 年提出 SMOG，是为了回应当时可读性公式过度依赖平均值的问题。平均词长或平均句长会掩盖局部高密度术语段落，而这些段落正是读者最容易卡住的地方。

经典 SMOG 使用 30 个句子的样本：开头 10 句、中间 10 句、结尾 10 句。然后统计其中所有 3 个或更多音节的词。

公式是：

```text
SMOG Grade = 1.0430 x sqrt(polysyllables x 30 / sentences) + 3.1291
```

其中：

- `polysyllables` 是样本中 3 个或更多音节词的数量。
- `sentences` 是样本句子数量，经典版本建议 30 句。

如果直接用于整篇文章，也可以用全文的 polysyllabic words 和 sentences 代入。输出是美国教育年级水平，表示读者要完整理解这段文本通常需要的最低教育水平。

SMOG 使用平方根，是因为多音节词密度与阅读难度不是线性关系。平方根会压缩高端极值，避免少数超难段落把分数推到不合理高度，同时保留“词汇越复杂，理解门槛越高”的直觉。

短文本要谨慎使用 SMOG。少于 30 句时，单个 jargon-heavy 句子会让分数剧烈波动。短信、广告语、subject line 这类短文本，更适合同时看 Flesch 或 FKGL。

## How SMOG differs from Flesch, FKGL, and Gunning Fog

| Metric | Output | Direction | Syllable measure | Best for | Marketing target |
| --- | --- | --- | --- | --- | --- |
| Flesch Reading Ease | 0-100 分 | 越高越易读 | 平均每词音节 | 快速检查、短文本 | 60-70 |
| FKGL | 年级水平 | 越低越易读 | 平均每词音节 | 通用目标 | 7-9 |
| Gunning Fog | 年级水平 | 越低越易读 | 3+ 音节词比例 | jargon density | <= 12 |
| SMOG | 年级水平 | 越低越易懂 | 3+ 音节词数量 | comprehension accuracy | <= 10 |

SMOG 的目标不是“读起来顺”，而是“能不能完整理解”。Flesch 和 FKGL 更像流畅度检测；SMOG 更像理解门槛检测。健康素养研究偏好 SMOG，正是因为患者材料的理解错误会直接影响真实结果。

对营销内容来说，如果 FKGL 是 8，SMOG 可能仍在 10-11；如果 SMOG 是 14，即使 FKGL 看起来是 10，也说明目标读者很可能无法完整理解。

## How to interpret SMOG scores

| SMOG score | Reading level | Comprehension threshold |
| --- | --- | --- |
| <= 7 | Elementary | 大多数成年人可完整理解 |
| 8-10 | Middle / early high school | 多数营销文案的目标区间 |
| 11-12 | High school | trade 和 B2B 内容可接受 |
| 13-15 | Some college | 复杂专业内容 |
| 16-18 | Undergraduate | 学术期刊、法律文件 |
| 19+ | Graduate | 研究论文、联邦法规级文本 |

McLaughlin 的原始建议是，面向普通消费者的内容不应高于 SMOG 10。美国健康与公共服务部在 Health Literacy Online 中建议患者材料控制在 SMOG <= 8，因为人在压力下阅读时，实际理解水平会比测试教育水平低 1-3 个年级。

营销场景同样有“压力阅读折扣”：读者在邮箱、手机、通知和竞品信息之间切换时，处理文本的认知余量会下降。

## Calibration examples — what each SMOG range looks like

**SMOG 7-8：消费者可轻松理解**

```text
Your plan renews on 15 May. Log in to update your details or cancel before that date.
```

句子短，几乎没有 3 个或更多音节词。适合通知、短信和直接动作提醒。

**SMOG 10：标准营销文本**

```text
Generative AI tools can improve your team's output quality. But without a clear content policy, they introduce consistency risks across every channel you publish on.
```

`Generative` 和 `consistency` 是多音节词，但密度还可控。这类文本对 B2B 或 SEO/GEO blog 是常见可接受区间。

**SMOG 13-16：专业/B2B 重文本**

```text
Organisations adopting generative AI capabilities must establish governance frameworks that address regulatory compliance, intellectual property considerations, and reputational risk management simultaneously.
```

这一句里多音节词密度极高：organisations、generative、capabilities、governance、regulatory、compliance、intellectual、considerations、reputational、management、simultaneously 等都会推高 SMOG。

**SMOG 18+：学术或监管文本**

```text
The promulgation of administrative determinations pursuant to this subparagraph shall be accompanied by a contemporaneous justification articulating the evidentiary basis for each substantive adjudicatory determination.
```

几乎每个核心名词都多音节。这不是营销目标，而是风险信号。

## What the research shows about SMOG accuracy

SMOG 从一开始就是为了更保守地预测 comprehension。McLaughlin 1969 年的验证使用 190 段多样文本，与 Dale-Chall 公式高度相关，相关系数达到 `r = 0.985`，高于同一测试中的 FKGL 和 Fog。

健康素养研究给了 SMOG 更强的独立验证。患者材料的可读性直接影响理解、依从性和结果，因此研究者更关注“是否真的懂”，而不是文本看起来是否流畅。Wang 等人在 2013 年对患者教育材料研究做 meta-analysis 时发现，SMOG 仍可能低估真实难度。这意味着 SMOG 10 是 ceiling，而不是保证 10 年级读者一定完整理解。

Friedman 和 Hoffman-Goetz 2006 年对 185 个消费者健康网站比较 FKGL 和 SMOG，发现 SMOG 通常比 FKGL 高 1.5-2.5 个年级。两者都看音节与句长，但 SMOG 对多音节词密度的权重更强。

实践含义很直接：如果只看 FKGL，内容可能看似达标；但 SMOG 会暴露术语密度和抽象词堆叠带来的理解缺口。

## Why AI content scores high on SMOG

AI 生成文本特别容易在 SMOG 上得高分，因为模型从正式语料、学术语料和商业语料中学到了很多“看起来专业”的表达习惯。

**Latinate vocabulary density**：模型常选择拉丁词源的正式词，而不是更短的日常词。例如 demonstrate 替代 show，utilise 替代 use，commence 替代 start。这些词通常更长，也更可能是多音节词。

**Nominalization chains**：LLM 喜欢把动词变成名词短语，比如把 “how we improve it” 写成 “the implementation of the methodology for optimisation”。名词化会大幅增加多音节词数量。

**Qualifier stacking**：AI 文案经常写 “a comprehensive, systematic, and scalable approach”。每个修饰词都可能是多音节词，SMOG 会逐个计入。

原站观察是，一个常见 GPT-4 marketing section 的 SMOG 经常落在 13-16。只要在 system prompt 里加入多音节词密度限制，就能把它拉回 9-11。

## How SMOG connects to the AI Brand Rulebook

在 AI Brand Rulebook 框架里，SMOG 属于 Layer 4：Tone and Format Rules。它和 Flesch Reading Ease、FKGL、Gunning Fog 一起，用来约束 AI 输出的可读性和品牌语言。

SMOG 的角色有三点：

- **作为 comprehension standard**：FRE 和 FKGL 告诉你文本读起来是否轻松，SMOG 告诉你目标读者是否能完整理解。
- **抓 jargon-heavy sections**：如果一段肉眼看起来还行但 SMOG 很高，通常说明多音节专业词集中。
- **设置发布 ceiling**：例如“任何已发布内容不得超过 SMOG 11”，可以阻止最复杂的 AI 输出直接上线。

相关模板：[AI Brand Rulebook](/blogs/generative-engine-optimization/ai-brand-rulebook-sample)

## System prompt instructions that enforce a SMOG target

最小指令可以写成：

```text
Keep the SMOG Index at or below 10. Limit words with three or more syllables to no more than 10% of total words. Replace every polysyllabic word with a shorter equivalent where meaning is equal.
```

更完整的营销/GEO 指令：

```text
Target a SMOG Index of <= 10. Apply these rules: words with three or more syllables must not exceed 10% of total word count; prefer Anglo-Saxon root words over Latinate equivalents ("show" not "demonstrate"; "use" not "utilise"; "start" not "commence"; "check" not "validate"); avoid nominalisations; avoid qualifier stacking before nouns. Before finalising, count polysyllabic words. If they exceed 10% of total words, identify and replace the least necessary ones first.
```

自检指令：

```text
Review your output. List every word with three or more syllables. For each one, ask: is there a one- or two-syllable word that means exactly the same thing in this context? If yes, replace it. Repeat until polysyllabic words are under 10% of total word count.
```

在实际团队流程里，可以让模型先写，再跑一轮 readability gate，而不是试图一次生成最终稿。

## SMOG targets by content type

| Content type | SMOG target | Max acceptable | Notes |
| --- | ---:| ---:| --- |
| SMS / push notifications | <= 6 | 接近零多音节词 | 没有认知余量 |
| Ad copy / subject lines | <= 7 | 低多音节词密度 | 扫读场景 |
| Social media | <= 8 | 9 | 移动端、注意力分散 |
| Homepage / landing pages | <= 8 | 10 | 第一印象，清晰度影响转化 |
| Email newsletters | <= 9 | 11 | 收件箱扫读 |
| Blog posts (SEO / GEO) | <= 10 | 11 | 信息意图，可停留更久 |
| Help Center / FAQs | <= 9 | 10 | 用户带着问题或压力阅读 |
| Case studies | <= 11 | 12 | B2B 读者，阅读时间更长 |
| B2B white papers | <= 12 | 14 | 专家读者，studied reading |
| Technical documentation | <= 13 | 15 | 仅限专业受众 |

## Related reading

- [Flesch Reading Ease Score: What It Is and How to Use It in AI Content](/blogs/generative-engine-optimization/flesch-reading-ease-marketing-ai)
- [Flesch–Kincaid Grade Level: What the Score Means and How to Use It in AI Content](/blogs/generative-engine-optimization/flesch-kincaid-grade-level-marketing-ai)
- [Gunning Fog Index: What It Measures and How to Use It in AI Content](/blogs/generative-engine-optimization/gunning-fog-index-marketing-ai)
- [The AI Brand Rulebook: A Sample Template Every Marketing Team Can Adapt](/blogs/generative-engine-optimization/ai-brand-rulebook-sample)
- [Free SMOG Calculator](/tools/smog-calculator)
- [Free Flesch Readability Calculator](/tools/flesch-calculator)

## 图片引用

- SMOG Index for Marketing and AI Content — Guide for Marketing Teams: https://thegeocommunity.com/images/smog-index-marketing-ai.webp

## 链接清单

- The GEO Community: /
- Start Here: /start
- About: /about
- www.linkedin.com: https://www.linkedin.com/in/rohitsingh017
- Download PDF: /blogs/generative-engine-optimization/smog-index-marketing-ai/print
- What the SMOG formula calculates: /blogs/generative-engine-optimization/smog-index-marketing-ai
- How SMOG differs from Flesch, FKGL, and Gunning Fog: /blogs/generative-engine-optimization/smog-index-marketing-ai
- How to interpret SMOG scores: /blogs/generative-engine-optimization/smog-index-marketing-ai
- Calibration examples — what each SMOG range looks like: /blogs/generative-engine-optimization/smog-index-marketing-ai
- What the research shows about SMOG accuracy: /blogs/generative-engine-optimization/smog-index-marketing-ai
- Why AI content scores high on SMOG: /blogs/generative-engine-optimization/smog-index-marketing-ai
- How SMOG connects to the AI Brand Rulebook: /blogs/generative-engine-optimization/smog-index-marketing-ai
- System prompt instructions that enforce a SMOG target: /blogs/generative-engine-optimization/smog-index-marketing-ai
- SMOG targets by content type: /blogs/generative-engine-optimization/smog-index-marketing-ai
- Related reading: /blogs/generative-engine-optimization/smog-index-marketing-ai
- Wikipedia: https://en.wikipedia.org/wiki/SMOG
- readabilityformulas.com: https://readabilityformulas.com/learn-about-the-flesch-reading-ease-formula/
- McLaughlin, 1969; Doak, Doak & Root, Teaching Patients With Low Literacy Skills, 1996: https://doi.org/10.1097/00003110-199609000-00037
- McLaughlin, 1969: https://doi.org/10.1080/00461520.1969.10412172
- HHS, Health Literacy Online, 2010: https://health.gov/healthliteracyonline/
- Patient Education and Counseling, 2013: https://doi.org/10.1016/j.pec.2013.01.001
- Journal of Health Communication, 2006: https://doi.org/10.1080/10810730600637066
- AI Brand Rulebook: /blogs/generative-engine-optimization/ai-brand-rulebook-sample
- Flesch Reading Ease: /blogs/generative-engine-optimization/flesch-reading-ease-marketing-ai
- FKGL: /blogs/generative-engine-optimization/flesch-kincaid-grade-level-marketing-ai
- Gunning Fog: /blogs/generative-engine-optimization/gunning-fog-index-marketing-ai
- Flesch Reading Ease Score: What It Is and How to Use It in AI Content: /blogs/generative-engine-optimization/flesch-reading-ease-marketing-ai
- Flesch–Kincaid Grade Level: What the Score Means and How to Use It in AI Content: /blogs/generative-engine-optimization/flesch-kincaid-grade-level-marketing-ai
- Gunning Fog Index: What It Measures and How to Use It in AI Content: /blogs/generative-engine-optimization/gunning-fog-index-marketing-ai
- The AI Brand Rulebook: A Sample Template Every Marketing Team Can Adapt: /blogs/generative-engine-optimization/ai-brand-rulebook-sample
- Free SMOG Calculator: /tools/smog-calculator
- Free Flesch Readability Calculator: /tools/flesch-calculator
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
