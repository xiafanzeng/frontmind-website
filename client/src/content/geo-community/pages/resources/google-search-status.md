---
path: "/resources/google-search-status"
kind: "resource"
title: "Google Search Status Dashboard"
source_title: "Google Search Status Dashboard"
source_url: "https://thegeocommunity.com/resources/google-search-status"
author: ""
date: ""
status: "ready"
---
# Google Search Status Dashboard

这个资源页用于跟踪 Google Search Status Dashboard 的公开更新，关注 ranking、indexing、crawling 和 serving 等搜索系统事件。

对 GEO 和 SEO 团队来说，状态页的价值在于排除误判：如果自然流量、索引量、抓取或排名突然异常，先确认 Google 是否存在公开 incident，再判断是站点问题、算法波动，还是搜索基础设施事件。

## How to use it

把 Google Search Status Dashboard 当作排查流程的第一站。遇到异常时，先记录发生时间、受影响页面、搜索类型、国家/地区和指标，再对照状态页是否有同时间段事件。

如果 Google 有 incident，不要立刻重写内容或大规模改技术配置。先保留证据，等待事件状态更新，再结合 Search Console、日志、GA4 和排名追踪判断影响范围。

## What to record

建议维护一个简单事件记录表：日期、异常开始时间、受影响 URL、查询类型、国家/地区、Search Console 指标、GA4 指标、服务器日志、Google 状态页链接和内部处理结论。这样下次遇到类似波动时，可以区分“平台事件”“算法更新”“站点技术故障”和“内容表现下降”。

对 GEO 团队来说，还要记录 AI answer 侧是否同步变化：Perplexity 是否停止引用、ChatGPT Search 是否换来源、Google AI Overviews 是否消失或替换引用。传统搜索状态和 AI 答案表现不一定同步，但它们都属于发现层基础设施。

## Source

- [Google Search Status Dashboard](https://status.search.google.com/)
- [Google Algorithm Updates](/resources/google-algorithm-updates)
- [Google Algorithm History](/resources/google-algorithm-history)
- [Start Here](/start)
