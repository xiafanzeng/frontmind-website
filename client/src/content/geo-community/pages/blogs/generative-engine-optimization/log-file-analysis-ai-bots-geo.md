---
path: "/blogs/generative-engine-optimization/log-file-analysis-ai-bots-geo"
kind: "blog"
title: "Log File Analysis for AI Bots: How to Track What's Actually Crawling You"
source_title: "Log File Analysis for AI Bots: How to Track What's Actually Crawling You"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/log-file-analysis-ai-bots-geo"
author: "Rohit Singh"
date: "19 Feb 2026"
status: "ready"
---

> robots.txt 是政策声明，server logs 才是事实。你可以允许 GPTBot、ClaudeBot 或 PerplexityBot 抓取，也可以写一套漂亮的 AI crawler policy，但只有访问日志能告诉你：它们到底有没有来、抓了哪些 URL、拿到什么 status code、是否浪费在 404 上、是否遵守你的规则。

GEO 团队如果只优化内容而不看日志，就是在盲飞。AI visibility 的前提是 crawler 已经抓到你的内容；如果 GPTBot 从未访问你的 cornerstone pages，再好的引用、统计和结构化内容也不会进入 ChatGPT 的检索池。

**In this article:** [why logs matter](#why-log-file-analysis-matters-for-geo) · [user agents](#the-ai-bot-user-agents-you-need-to-track) · [log line](#what-a-log-line-tells-you) · [Cloudflare](#cloudflare-analytics-logpush-and-firewall-events) · [GCP](#google-cloud-platform-gcp-cloud-logging-and-bigquery) · [Netlify](#netlify-log-drains-and-traffic-analytics) · [Firebase](#firebase-hosting-cloud-logging-integration) · [Nginx](#nginx-parsing-access-logs-directly) · [Apache](#apache-mod_log_config-and-log-analysis) · [Vercel](#vercel-log-drains) · [CloudFront](#aws-cloudfront-access-logs-and-athena) · [metrics](#cross-platform-what-to-measure) · [red flags](#red-flags-to-watch-for) · [takeaways](#key-takeaways) · [FAQ](#faq)

![Log File Analysis for AI Bots: How to Track What's Actually Crawling You](https://thegeocommunity.com/images/log-file-analysis-ai-bots-geo.webp)

## Why log file analysis matters for GEO

GEO 研究通常讨论内容如何被 AI answer engines 引用。Princeton / IIT Delhi 的原始 GEO 论文指出，加入引用和统计数据可以显著提高 AI 可见性；跨 ChatGPT、Claude、Perplexity、Gemini 的比较研究也显示 earned media 在 AI citation 中占很大比例。

但所有这些都隐含一个前提：bot 已经抓取过你的内容。

日志能回答第三方工具回答不了的问题：

- GPTBot 是否抓过你的站点？
- ClaudeBot 抓的是核心文章，还是 tag archive、分页和无价值 URL？
- 你在 robots.txt 里阻止的 bot 是否真的遵守？
- AI crawler 多久回来一次，是否能及时抓到新内容？
- 是否有伪装成 GPTBot 的 scraper 从异常 IP 段访问？

这就是 technical SEO 里 log analysis 的 GEO 版本。没有日志，你只能猜 crawl coverage；有日志，你可以把 AI visibility 的基础设施变成可度量系统。

## The AI bot user-agents you need to track

User-Agent 是识别 crawler 的第一层信号。需要重点监控的 AI bot 包括：

| Bot | User-Agent | Operator | 可能用途 |
| --- | --- | --- | --- |
| GPTBot | GPTBot | OpenAI | training + retrieval |
| OAI-SearchBot | OAI-SearchBot | OpenAI | ChatGPT real-time web search |
| ChatGPT-User | ChatGPT-User | OpenAI | user-initiated browsing |
| ClaudeBot | ClaudeBot | Anthropic | Claude training |
| anthropic-ai | anthropic-ai | Anthropic | general crawling |
| Google-Extended | Google-Extended | Google | Gemini training controls |
| PerplexityBot | PerplexityBot | Perplexity | real-time retrieval |
| Applebot-Extended | Applebot-Extended | Apple | Apple Intelligence training |
| CCBot | CCBot | Common Crawl | open web dataset |
| Bytespider | Bytespider | ByteDance | model training |
| cohere-ai | cohere-ai | Cohere | model training |
| Meta-ExternalAgent | Meta-ExternalAgent | Meta | Meta AI retrieval |
| YouBot | YouBot | You.com | AI search |

OpenAI 的拆分尤其重要：如果你想阻止训练但希望保留 ChatGPT 搜索可见性，通常应区分 GPTBot 与 OAI-SearchBot。日志里要分开看，不要把所有 OpenAI bot 混成一类。

这张表也会变化。新的 crawler 会出现，旧 bot 会拆分子 agent。建议每季度抽样看一次 raw logs，发现新 user-agent 后同步更新 robots.txt、WAF 和 dashboard。

## What a log line tells you

标准 Nginx/Apache access log 中，一个 AI bot 请求大概包含这些字段：

```text
66.249.64.12 - - [19/Feb/2026:08:23:41 +0000] "GET /blogs/geo-princeton-paper HTTP/1.1" 200 48291 "-" "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)"
```

| Field | 你能判断什么 |
| --- | --- |
| IP address | 是否来自官方发布的 IP ranges，是否可能 spoof |
| Timestamp | crawl frequency，是 daily、weekly 还是 monthly |
| Path | crawler 抓了哪类页面 |
| Status code | 是否成功、被拦截、重定向、404 或 5xx |
| Response size | 是否完整返回，是否被截断 |
| User-Agent | 哪个 bot 发起请求 |

Status code 是最重要的诊断信号：

- 200：成功抓取。
- 301/302：重定向，需确认 crawler 是否跟随。
- 403：被 WAF 或服务器阻止，确认是否符合预期。
- 404：死链，浪费 crawl budget。
- 429：被限速。
- 5xx：服务器在 crawl 时失败，需要优先修。

## Cloudflare: Analytics, Logpush, and Firewall Events

[Cloudflare](https://www.cloudflare.com/) 很适合 AI bot 分析，因为它在请求到 origin 前就能看到流量，包括被缓存命中的请求。

**Cloudflare Analytics**

免费或低门槛路径是 Dashboard → Analytics & Logs → Traffic → Top User Agents。它适合快速确认 GPTBot 或 ClaudeBot 是否出现，但无法做页面级分析。

**Cloudflare Logpush**

更完整的方案是 Logpush，把 HTTP request logs 流式发送到 R2、S3、BigQuery、Splunk 或 Datadog。核心字段应至少包含 ClientIP、ClientRequestURI、ClientRequestUserAgent、EdgeResponseStatus 和 EdgeStartTimestamp。

在 BigQuery 里可以按 user-agent 聚合：

```sql
SELECT
  ClientRequestUserAgent,
  COUNT(*) AS request_count,
  COUNT(DISTINCT ClientRequestURI) AS unique_pages,
  SUM(CASE WHEN EdgeResponseStatus = 200 THEN 1 ELSE 0 END) AS success,
  SUM(CASE WHEN EdgeResponseStatus = 404 THEN 1 ELSE 0 END) AS dead_urls
FROM cloudflare_logs
WHERE REGEXP_CONTAINS(LOWER(ClientRequestUserAgent),
  r'(gptbot|claudebot|perplexitybot|oai-searchbot|google-extended|ccbot)')
GROUP BY ClientRequestUserAgent
ORDER BY request_count DESC;
```

**Firewall Events**

如果你用 WAF 阻止某些 bot，Security → Events 是验证规则是否生效的地方。robots.txt 只表达请求，WAF 才真正执行阻断。

## Google Cloud Platform (GCP): Cloud Logging and BigQuery

GCP 的 Cloud Run、App Engine、GKE、Compute Engine 通常会把 HTTP request logs 写入 Cloud Logging。实时检查可以在 Log Explorer 中过滤：

```text
httpRequest.userAgent=~"(?i)(gptbot|claudebot|perplexitybot|oai-searchbot|ccbot|bytespider|google-extended|cohere-ai)"
```

如果要长期监控，建议建立 log sink 到 [BigQuery](https://cloud.google.com/bigquery)，然后统计 bot、URL、status、first_seen、last_seen 和 crawl_count。

```sql
SELECT
  REGEXP_EXTRACT(httpRequest.userAgent,
    r'(GPTBot|ClaudeBot|PerplexityBot|OAI-SearchBot|CCBot|Bytespider|Google-Extended)'
  ) AS bot_name,
  httpRequest.requestUrl AS page,
  httpRequest.status AS status_code,
  COUNT(*) AS crawl_count,
  MIN(timestamp) AS first_seen,
  MAX(timestamp) AS last_seen
FROM `project.dataset.requests_*`
WHERE DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY bot_name, page, status_code
ORDER BY crawl_count DESC;
```

再接 [Looker Studio](https://lookerstudio.google.com/) 就能做 live dashboard。

## Netlify: Log Drains and Traffic Analytics

Netlify 内置 Analytics 能看到 top pages、bandwidth spikes 和 404，但没有足够的 user-agent 细节。要做 AI bot 分析，有两条路：

- Enterprise：用 Log Drains 把请求发到 Datadog、Splunk 或自定义 endpoint。
- 非 Enterprise：用 Edge Function 拦截请求，识别 AI bot 后异步写入日志端点。

示意逻辑：

```js
export default async (request, context) => {
  const ua = request.headers.get("user-agent") || "";
  const aiBot = /GPTBot|ClaudeBot|PerplexityBot|OAI-SearchBot|CCBot|Bytespider|Google-Extended/i;
  if (aiBot.test(ua)) {
    fetch("/.netlify/functions/log-bot", {
      method: "POST",
      body: JSON.stringify({ url: request.url, ua, ts: new Date().toISOString() })
    }).catch(() => {});
  }
  return context.next();
};
```

关键是 fire-and-forget，不要让日志写入增加用户请求延迟。

## Firebase Hosting: Cloud Logging integration

Firebase Hosting 控制台本身不展示完整 access logs，但 Firebase 背后是 GCP，所以可以在 Cloud Logging 查：

```text
resource.type="firebase_domain"
httpRequest.userAgent=~"(?i)(gptbot|claudebot|perplexitybot|oai-searchbot|ccbot)"
```

CLI 快速抽样也可用：

```bash
gcloud logging read \
  'resource.type="firebase_domain" AND httpRequest.userAgent=~"(?i)(gptbot|claudebot|perplexitybot)"' \
  --limit=500 \
  --format="table(timestamp, httpRequest.requestUrl, httpRequest.userAgent, httpRequest.status)"
```

如果站点认真做 GEO，推荐把 Firebase 项目连接 BigQuery，再复用 GCP 查询。

## Nginx: Parsing access logs directly

自托管 Nginx 是最直接的路径，日志通常在：

```text
/var/log/nginx/access.log
/var/log/nginx/access.log.1
```

统计各 bot 请求量：

```bash
grep -iE "gptbot|claudebot|perplexitybot|oai-searchbot|ccbot|bytespider|google-extended" /var/log/nginx/access.log |
  grep -oiE "gptbot|claudebot|perplexitybot|oai-searchbot|ccbot|bytespider|google-extended" |
  sort | uniq -c | sort -rn
```

看 GPTBot 抓了哪些页面：

```bash
grep -i "gptbot" /var/log/nginx/access.log |
  awk '{print $7}' |
  sort | uniq -c | sort -rn | head -20
```

如果 top URLs 都是 `/tag/`、`/page/2/` 或后台路径，那不是内容质量问题，而是内部链接、sitemap 或 disallow 策略问题。

用 [GoAccess](https://goaccess.io/) 可以很快生成可视化报告：

```bash
grep -iE "gptbot|claudebot|perplexitybot|ccbot" /var/log/nginx/access.log |
  goaccess - --log-format=COMBINED -o /var/www/html/bot-report.html
```

## Apache: mod_log_config and log analysis

Apache 的逻辑和 Nginx 类似，路径常见为：

```text
/var/log/apache2/access.log
/var/log/httpd/access_log
```

统计 bot：

```bash
grep -iE "gptbot|claudebot|perplexitybot|oai-searchbot|ccbot|bytespider" /var/log/apache2/access.log |
  grep -oiE "gptbot|claudebot|perplexitybot|oai-searchbot|ccbot|bytespider" |
  sort | uniq -c | sort -rn
```

看某个 bot 的 status distribution：

```bash
grep -i "gptbot" /var/log/apache2/access.log |
  awk '{print $9}' | sort | uniq -c | sort -rn
```

使用 AWStats 的站点可以建立只过滤 AI bot 的 profile，避免和人类流量混在一起。

## Vercel: Log Drains

Vercel dashboard 不暴露完整 raw access logs。Pro/Enterprise 可以用 Log Drains，把请求发到外部日志系统。[Axiom](https://axiom.co/) 是常见目的地，查询类似：

```text
['vercel-logs']
| where userAgent contains_cs "GPTBot"
    or userAgent contains_cs "ClaudeBot"
    or userAgent contains_cs "PerplexityBot"
    or userAgent contains_cs "OAI-SearchBot"
| summarize count() by userAgent, path, statusCode
| order by count_ desc
```

重点是保留 path、statusCode、userAgent、timestamp 和 IP 信息，否则只能看到流量量级，无法诊断 crawl health。

## AWS CloudFront: Access logs and Athena

CloudFront 默认不记录完整访问日志，需要在 distribution settings 里启用 standard logging 到 S3，然后用 Athena 查询。

基本思路是：

1. 开启 CloudFront access logs 到 S3。
2. 在 Athena 建外部表。
3. 用 `user_agent` 过滤 AI bot。
4. 按 `uri`、`status`、`date` 聚合。

示例查询：

```sql
SELECT
  user_agent,
  uri,
  status,
  COUNT(*) AS requests
FROM cloudfront_logs
WHERE regexp_like(lower(user_agent), 'gptbot|claudebot|perplexitybot|oai-searchbot|ccbot')
GROUP BY user_agent, uri, status
ORDER BY requests DESC;
```

CloudFront 日志特别适合发现 crawler 是否大量命中缓存、是否被 WAF 阻止，以及 bot 是否抓到 CDN 边缘层实际返回的版本。

## Cross-platform: What to measure

无论平台是什么，最终都应度量这五件事：

**1. Crawl coverage**

AI bot 抓取的关键页面占所有关键页面的比例。1000 次 GPTBot 到首页，不如 100 次分布在核心文章、产品页和资源页上。

**2. Crawl frequency**

bot 多久回来一次。daily crawl 表示新内容可能很快进入检索；monthly crawl 意味着发布后几周都可能不可见。

**3. Status code distribution**

404 超过 5% 就值得审计；403 要确认是否符合 policy；5xx 要当成技术故障优先处理。

**4. Crawl depth**

如果 crawler 只停留在 depth 1-2，说明它没进入深层内容。要检查 sitemap、内部链接、分页和导航。

**5. robots.txt compliance**

robots.txt 是请求，不是强制。日志里如果看到被 disallow 的 bot 仍拿到 200，就需要 WAF 或服务器级阻断。

## Red flags to watch for

**GPTBot from unexpected IP ranges**

OpenAI 发布了 [IP ranges](https://openai.com/gptbot-ranges.txt)。如果 user-agent 是 GPTBot，但 IP 不在官方范围，可能是 scraper spoof。应在 WAF 层处理。

**Sudden crawl spikes**

一个平时每天 100 次请求的 bot 突然变成 10,000 次，可能是新 crawl campaign，也可能是 aggressive scraping。需要在影响用户性能前调查。

**Bots ignoring robots.txt**

如果 robots.txt 已阻止 CCBot，但日志仍出现大量 200，robots.txt 已经不够。Nginx 可硬拦：

```nginx
if ($http_user_agent ~* "CCBot") {
    return 403;
}
```

Cloudflare WAF 也可以用 custom rule 阻断。

**High 404 rate**

AI bots 大量命中 404 通常来自旧 URL、迁移残留、分页、参数 URL 或错误 sitemap。修复方式是 301 redirect、sitemap 清理或 disallow。

## Key takeaways

- Logs are ground truth。第三方工具只能推测，access logs 才记录实际请求。
- 每个平台都有路径：Cloudflare Logpush、GCP Cloud Logging + BigQuery、Firebase → BigQuery、Netlify Edge Functions、Nginx grep、Vercel Log Drains、CloudFront + Athena。
- Crawl coverage 比 crawl volume 更重要。抓到核心页面才有 GEO 价值。
- robots.txt 不是 enforcement。日志验证合规，WAF/服务器规则执行阻断。
- spoofed user-agents 真实存在，要用 IP ranges 验证。
- 建立持续监控，而不是一次性审计。

## FAQ

**Do I need enterprise logging to track AI bots?**

不一定。Nginx/Apache 可以直接 grep；Cloudflare Worker、Netlify Edge Function、Firebase Cloud Logging 都能低成本起步。Enterprise logging 主要提升便利性和长期分析能力。

**Which metric should I check first?**

先看 GPTBot、OAI-SearchBot、ClaudeBot、PerplexityBot 是否抓过你的 top content URLs。没有 crawl coverage，后续优化都没有入口。

**Is robots.txt enough to block unwanted AI crawlers?**

不够。合规 bot 会遵守，恶意或伪装 bot 不一定。要靠日志验证，再用 WAF 或 server rule 执行。

## Bot verification workflow

User-agent 字符串本身不可信。任何请求都可以写成 GPTBot、ClaudeBot 或 PerplexityBot，所以日志分析必须包含验证步骤。

基础流程如下：

1. 先按 user-agent 过滤 AI bot 请求。
2. 对高价值 bot 做 IP 验证，例如 GPTBot 对照 OpenAI 官方 IP ranges。
3. 检查 reverse DNS 和 ASN，判断是否来自合理网络。
4. 对异常高频、非官方 IP、命中敏感路径的请求加 WAF challenge 或阻断。
5. 把 spoofed bot 单独记录，不要混入真实 crawler coverage。

如果不做这一步，dashboard 可能会把 scraper 当作 AI crawler，从而错误判断“AI bot 抓取很多”。GEO 需要的是真实可进入 AI index 的 crawler 活动，不是伪装流量。

## Minimum log schema

不管是 Cloudflare、BigQuery、Nginx 还是 Vercel，长期监控最好统一成同一张逻辑表：

| Field | 用途 |
| --- | --- |
| timestamp | 计算 crawl frequency 和 spike |
| host | 多域名、多子域名拆分 |
| uri | 判断 bot 抓了哪些页面 |
| status | 200、3xx、4xx、5xx 分布 |
| user_agent | 初步识别 bot |
| ip / country / ASN | 验证来源和异常地区 |
| referrer | 通常为空，但可排查异常 |
| cache_status | 判断 CDN 命中和边缘返回 |
| response_bytes | 识别空响应、错误响应、过大资源 |
| robots_policy | 当时是否允许抓取 |
| content_type | 区分 HTML、image、JS、API |

统一 schema 的好处是未来换平台也不丢分析逻辑。你可以把 Nginx、Cloudflare、Vercel、Firebase 的日志都映射到同一字段，再用同一套 query 做 GEO reporting。

## Crawl coverage dashboard

一个实用 dashboard 不需要华丽，必须回答五个问题。

第一，哪些 AI bots 抓过站点？按 GPTBot、OAI-SearchBot、ClaudeBot、PerplexityBot、GoogleBot-Extended、Applebot-Extended 分开。

第二，抓的是不是核心页面？把页面分成 homepage、blog、resource、tool、product、about、sitemap、robots、llms.txt。核心内容没有 coverage，首页请求再多也意义有限。

第三，抓取是否成功？看 200、301、403、404、5xx。403 可能是策略，404/5xx 通常是问题。

第四，抓取频率如何？新文章发布后，AI bot 多久首次访问？之后是否回访？

第五，是否遵守 robots.txt？对 disallow 的 bot 是否仍然拿到 200？allow 的 bot 是否被 WAF 误伤？

这五个问题就是 AI crawl observability 的基本盘。后续再把 citation monitoring 接上，才能回答“抓了以后有没有被引用”。

## Editorial loop from logs to content

日志分析不应该只留在技术团队。它应该反馈给内容和 SEO。

如果某篇文章被 GPTBot 抓取频繁但从不被引用，内容团队要检查 evidence density、heading clarity、citation support 和 query alignment。

如果某篇重要文章从未被 AI bot 抓取，技术团队要检查 sitemap、internal links、robots、canonical、rendering、status code 和页面深度。

如果 bot 大量命中旧 URL 或 404，运营团队要修 redirect、更新 sitemap、清理内链。

如果 bot 只抓图片、JS 或无关参数 URL，说明爬取预算可能被浪费，需要规范 URL、屏蔽噪声路径、改善 HTML 内容可见性。

把这些问题放进每月内容复盘，log file analysis 就会从“技术审计”变成 GEO growth loop。

## Alert thresholds

可以先设置几个简单提醒：

- 核心页面 AI bot crawl coverage 连续 14 天低于 20%。
- 新发布文章 7 天内没有任何主要 AI bot 访问。
- 任一主要 AI bot 的 404 rate 超过 5%。
- GPTBot 或 ClaudeBot 请求突然增长 10 倍以上。
- 合规允许的 AI bot 大量返回 403。
- 被 disallow 的 bot 仍大量返回 200。
- spoofed user-agent 占同类 bot 请求超过 10%。

这些阈值不需要一开始完美。先让异常被看见，再根据站点规模调整。

## How this supports full-site replication

对这个中文复刻站来说，log analysis 页面应该和 robots、llms.txt、IndexNow、GA4 AI traffic、Microsoft Clarity、AI citation monitoring 形成 measurement cluster。后续继续更新 blog 时，可以把每个新工具或指标接到这个 cluster 下面。

这样站点不只是翻译内容，还能保留原站的运营逻辑：内容发布、AI bot 抓取、AI answer 引用、GA4/Clarity 流量、citation quality，这些环节要能互相追踪。

## Related reading

- [The Original GEO Paper](/blogs/generative-engine-optimization/geo-princeton-paper-original-study)
- [How to Dominate AI Search](/blogs/generative-engine-optimization/geo-dominate-ai-search-comparative-study)
- [robots.txt for AI Bots](/blogs/generative-engine-optimization/robots-txt-ai-bots)
- [llms.txt for SPA Hydration Gaps](/blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps)
- [Microsoft Clarity AI Bot Activity](/blogs/generative-engine-optimization/microsoft-clarity-ai-bot-activity)
- [IndexNow by Microsoft](/blogs/generative-engine-optimization/indexnow-microsoft-ai-visibility)

## About the author

[Rohit Singh](https://www.linkedin.com/in/rohitsingh017) is the creator of [GeoZ AI](https://www.geoz.ai/) and The GEO Community. Follow the [learning path](/start) or connect on [LinkedIn](https://www.linkedin.com/in/rohitsingh017).
