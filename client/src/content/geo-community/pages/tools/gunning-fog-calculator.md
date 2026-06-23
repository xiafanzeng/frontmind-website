---
path: "/tools/gunning-fog-calculator"
kind: "tool"
title: "Gunning Fog Index Calculator"
source_title: "Gunning Fog Index Calculator"
source_url: "https://thegeocommunity.com/tools/gunning-fog-calculator"
author: ""
date: ""
status: "ready"
---
# Gunning Fog Index Calculator

Gunning Fog Index 用来估算英文文本理解所需的教育年限。它对长句和复杂词尤其敏感，因此适合检查内容是否因为术语、名词堆叠和过长句子而变得难读。

原站工具允许用户粘贴文本，计算 Fog index、平均句长、复杂词比例和 GEO 内容基准。本地中文复刻已经补上前端计算器，可以直接用于后续内容 QA。

它尤其适合检查 AI 写作中的“企业腔”和术语密度。模型常会使用 excessive、comprehensive、robust、utilize、leverage 这类抽象词，并把简单动作写成长句。Fog 分数会把这种复杂度暴露出来，帮助编辑快速定位需要拆分和替换的段落。

Gunning Fog 的逻辑很直接：长句会增加记忆负担，复杂词比例会增加理解负担。它不反对专业词，但会提醒你是否把太多复杂词集中在同一句或同一段。对 GEO 来说，过高的 jargon density 会降低 passage extractability。

## Fog score bands at a glance

常见解读：

- 6-8：非常清晰，适合大众内容。
- 9-10：适合多数营销、教育和产品内容。
- 11-12：偏专业，需要较高注意力。
- 13 以上：通常意味着术语或句子负担过重。

公式：`0.4 * (ASL + 100 * complex words / total words)`，其中 complex words 通常指 3 个以上音节的词。

在内容 QA 中，可以把 Fog 与 Flesch、FKGL 一起看。Flesch 更像整体轻重，FKGL 更像读者年级，Fog 更敏感地指出术语和长句问题。如果三者都显示难读，就应优先改写；如果只有 Fog 偏高，通常说明专业词集中，需要拆分解释。

## Want to enforce this in AI-generated content?

Gunning Fog 很适合做“术语密度”控制。可以把目标分数写进 AI system prompt，并要求模型输出后替换抽象词、拆分长句、减少名词化表达。对 GEO 内容来说，清晰文本更容易被用户理解，也更容易被 AI 系统抽取。

一个实用流程是：先让模型完成事实型初稿，再让第二个审稿提示只检查 Fog 风险，列出 10 个可替换词、5 个需要拆分的句子和 3 个可以前置的结论。这样不会牺牲专业内容，但能明显降低阅读阻力。

相关入口：

- [Read the full Fog Index guide](/blogs/generative-engine-optimization/gunning-fog-index-marketing-ai)
- [Wikipedia reference](https://en.wikipedia.org/wiki/Gunning_fog_index)
