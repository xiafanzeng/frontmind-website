const e=`---
path: "/tools/fkgl-calculator"
kind: "tool"
title: "Flesch-Kincaid Grade Level Calculator"
source_title: "Flesch–Kincaid Grade Level Calculator"
source_url: "https://thegeocommunity.com/tools/fkgl-calculator"
author: ""
date: ""
status: "ready"
---
# Flesch-Kincaid Grade Level Calculator

Flesch-Kincaid Grade Level 把英文文本难度转成美国学校年级水平。分数越低，说明更容易理解；分数越高，说明句子更长、词更复杂，适合更高阅读水平的读者。

原站工具允许用户粘贴文本，直接计算 grade level、平均句长、音节密度和分数区间。本地中文复刻已经补上浏览器端计算器，可以直接用于后续内容 QA。

它适合给 AI 生成内容设置明确阈值。比如产品页面、帮助中心、销售邮件和 FAQ 可以要求 Grade 6-9；B2B 技术文章可以允许 Grade 9-11；研究解读和专业白皮书可以更高，但开头摘要仍应更低。FKGL 的价值在于把“写得太复杂”变成可讨论的数字。

这个公式最初用于美国海军技术材料，目标是判断读者大概需要什么教育水平才能理解文本。它不能判断事实是否正确，也不能判断内容是否有洞察，但能快速发现句子过长、词汇过复杂、AI 输出过度正式的问题。

## Grade level bands at a glance

常见目标：

- Grade 6-8：适合大多数大众营销内容。
- Grade 9-10：适合较专业但仍要清晰的 B2B 内容。
- Grade 11-12：适合复杂主题、技术解释或专业受众。
- 12 以上：需要谨慎，可能增加理解门槛。

公式：\`0.39 * ASL + 11.8 * ASW - 15.59\`，其中 ASL 是平均句长，ASW 是平均每词音节数。

分数解释要结合内容类型。Grade 8 不一定比 Grade 11 “更好”；如果受众是工程师，术语可以保留。但关键结论、CTA、FAQ、错误说明和 onboarding 文案应该尽量降低年级水平。越接近用户做决定的文本，越应该清晰。

## Want to enforce this in AI-generated content?

在 AI 内容工作流里，FKGL 适合做目标阈值。例如要求产品页保持 Grade 8-10，技术白皮书可以更高，但摘要和 FAQ 应该更低。把目标写进 prompt 和 QA checklist，可以让 AI 输出更稳定。

一个实用的 system prompt 规则是：先按专业准确性生成，再执行 readability pass；保留必要术语，但拆短长句，替换抽象动词，删除重复限定词。最后给出 FKGL 估算和三条改写说明。这样 FKGL 就不是写作束缚，而是编辑反馈。

相关入口：

- [Read the full FKGL guide](/blogs/generative-engine-optimization/flesch-kincaid-grade-level-marketing-ai)
- [Wikipedia reference](https://en.wikipedia.org/wiki/Flesch%E2%80%93Kincaid_readability_tests)
`;export{e as default};
