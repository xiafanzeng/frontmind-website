---
path: "/blogs/generative-engine-optimization/webmcp-history-timeline-15-months-7-engineers-3-companies"
kind: "blog"
title: "Who Created WebMCP? The Complete History & Timeline (15 Months, 7 Engineers, 3 Companies)"
source_title: "Who Created WebMCP? The Complete History & Timeline (15 Months, 7 Engineers, 3 Companies)"
source_url: "https://thegeocommunity.com/blogs/generative-engine-optimization/webmcp-history-timeline-15-months-7-engineers-3-companies"
author: "Rohit Singh"
date: "11 Mar 2026"
status: "ready"
---

> WebMCP 常被简单归功于 Google 或 Microsoft，但原站文章梳理出的时间线更复杂：Anthropic 在 2024 年 11 月发布 MCP，Amazon 工程师 Alex Nahas 在 2025 年初为了解决 OAuth 瓶颈做出 MCP-B，Bright Data 在 2025 年 8 月推出同名但不同架构的 Web MCP，随后 Google Chrome 与 Microsoft Edge 团队在 W3C 路径上合流，并在 2026 年 2 月由 Chrome 发布早期预览。

这件事重要的原因不只是“谁先发明了名字”。WebMCP 是浏览器厂商第一次围绕 AI agent 与网页交互协议形成统一标准。如果 Chrome 和 Edge 都采用同一 W3C 方向，它覆盖的浏览器份额约 78.6%，足以让 WebMCP 成为 agentic web 的事实标准之一。

原站开篇还强调了时间跨度：从 Anthropic 在 2024 年 11 月 25 日开源 MCP，到 Google 在 2026 年 2 月 10 日宣布 WebMCP Early Preview Program，中间大约 15 个月又 16 天。这个时间线包括四个主要里程碑、三个平行开发努力，以及 2025 年底的一次关键合流。媒体报道常常把 WebMCP 简化成 Google/Microsoft 的发布，但真正的技术路径先经过 Anthropic 的协议基础、Amazon 工程师的浏览器化实验、Bright Data 的同名平行产品，以及 W3C 标准化协作。

这段归因之所以重要，是因为 WebMCP 不是普通 API 名字，而是 agentic web 的接口层。如果它成功，网站未来不只是给人类浏览和搜索爬虫抓取，还要明确告诉浏览器里的 AI agent：“我有哪些工具、参数是什么、调用后会发生什么、当前用户是否有权限”。这会直接影响 GEO、AEO、技术 SEO、SaaS 产品设计和电商 checkout。

**In this article:** [Anthropic MCP](#anthropics-mcp--the-foundation-november-2024) · [Alex Nahas](#alex-nahas--the-amazon-origin-story-early-2025) · [Bright Data](#bright-datas-the-web-mcp--a-parallel-effort-august-2025) · [Google & Microsoft](#google--microsoft-join-forces-late-2025--early-2026) · [Chrome preview](#google-ships-webmcp-early-preview-february-10-2026) · [timeline](#timeline-summary)

![Who Created WebMCP? The Complete History & Timeline (15 Months, 7 Engineers, 3 Companies)](https://thegeocommunity.com/images/webmcp-history-timeline-15-months-7-engineers-3-companies.webp)

## Anthropic's MCP — The Foundation (November 2024)

[Anthropic](https://www.anthropic.com/) 在 2024 年 11 月 25 日开源 [Model Context Protocol](https://www.anthropic.com/news/model-context-protocol)，解决的是工具连接里的 M×N integration problem。没有统一协议时，10 个 AI model 接 100 个工具，就要 1,000 个定制集成；有 MCP 后，只需要模型侧和工具侧各实现协议，总集成复杂度变成 10 + 100。

MCP 定义了几个关键组件：

- JSON-RPC 2.0 transport，用于标准化消息。
- client-server 架构，AI assistant 是 client，工具是 server。
- structured tool schemas，描述工具能力和参数。
- OAuth 2.1 authentication，用于安全访问。

这个协议很快获得采用：Claude Desktop、Cline、Zed 等 AI 工具链开始支持，社区也快速构建大量 MCP server。MCP 的路线图显示，短时间内出现了 Python、TypeScript、Go、Rust、Java、C#、Swift 等语言 SDK。

但 MCP 留下了一个 gap：它默认是 server-side integration，不是 browser-native execution。网页里的 session cookie、localStorage、DOM、可视渲染、已有 SSO，都不是 MCP 原始架构天然能直接使用的东西。这个 gap 后来成了 WebMCP 的入口。更多 agent 与网站交互的背景可参考 [BrowseComp Benchmark](/blogs/generative-engine-optimization/browsecomp-benchmark-browsing-agents-geo)。

原站用一个简单公式解释 MCP 的价值：没有统一协议时，M 个模型连接 N 个工具需要 M×N 个集成；有 MCP 后，模型和工具各自实现协议，总复杂度更接近 M+N。比如 10 个 AI models 和 100 个 tools，本来需要 1,000 个定制连接；采用 MCP 后，理论上只需要 110 个实现，复杂度下降约 90.9%。这个“反 M×N”思想后来被 WebMCP 继承，只是对象从 server tools 扩展到网页功能。

MCP 发布后的 90 天内，生态增长很快：社区构建大量 MCP servers，多语言 SDK 出现，Claude Desktop、Cline、Zed 等工具开始支持。它证明开发者确实需要统一 tool interface。但 MCP 的 OAuth 2.1 和 server-side assumption 对浏览器场景不友好。许多企业内部工具并没有标准 OAuth server，只有已经跑通的浏览器 SSO、cookies、SAML 和自定义 session。WebMCP 的问题意识正是从这里长出来的：能否把 MCP 的工具概念放进浏览器，而不是要求全世界后端先改造认证。

## Alex Nahas & The Amazon Origin Story (Early 2025)

原站文章强调：WebMCP 的关键灵感来自 Amazon 工程师 [Alex Nahas](https://www.linkedin.com/in/alex-nahas)，而不是 Google 最早独立提出。

Nahas 在 Amazon 遇到的问题很具体：内部 MCP server 可以把大量工具放进一个上下文窗口，但 Amazon 内部服务并不统一支持 MCP 要求的 OAuth 2.1。不同服务使用 session cookies、SAML token 或自定义 headers。要让成千上万内部服务改造到 OAuth 2.1，需要跨几十个团队投入很长时间。

他的突破是反过来想：浏览器已经是统一认证层。Amazon 内部的服务在浏览器里通过 cookies 和 SSO 正常工作，为什么不把 MCP 的执行环境搬进浏览器？

于是 MCP-B 的思路出现了：

- 在浏览器 tab 里运行 MCP client。
- 用 postMessage 连接页面和 Chrome extension。
- 使用浏览器现有 session/auth 机制替代 OAuth 2.1 retrofit。
- 让 tool execution 从 server round trip 变成本地浏览器执行，延迟从约 50-200ms 降到约 1-10ms。

Nahas 后续把实验实现成 [MCP-B](https://docs.mcp-b.ai/) 和 [@mcp-b/global](https://www.npmjs.com/package/@mcp-b/global) polyfill，让开发者在浏览器原生支持之前先试用。Arcade.dev 的 [访谈](https://www.arcade.dev/blog/web-mcp-alex-nahas-interview/) 是理解这段起源的重要资料。

这一步证明了 WebMCP 的核心原则：MCP 的“工具 schema + agent invocation”概念可以进入浏览器，但 transport、execution 和 authentication 都要换成 browser-native 形态。这和 [ChatGPT Atlas 直接读取网站](/blogs/generative-engine-optimization/chatgpt-atlas-direct-website-reading-geo) 的趋势是一条线：agent 不再只绕道搜索引擎，而是更直接地进入网页环境。

Nahas 的突破在于把认证问题倒过来看。原始 MCP 要求服务支持 OAuth 2.1，但 Amazon 内部成千上万服务已经能在浏览器里工作。与其让每个服务改造 OAuth，不如让 agent 工具调用发生在已经登录的浏览器上下文里。这样，浏览器天然拥有 session cookie、localStorage、企业 SSO 和当前用户权限，agent 调用工具时不需要重新发明身份层。

技术上，MCP-B 由三个部分支撑：浏览器 tab 里的 JavaScript MCP client、页面与 Chrome extension 之间的 postMessage 通道、以及浏览器原生 session/auth 替代 OAuth 2.1。这个实现还带来延迟收益：server round trip 常见在 50-200ms，本地浏览器执行可能在 1-10ms 量级。对于 agent 操作网页来说，这不是小优化，因为一个任务可能需要几十个工具调用；每步少一两百毫秒，会显著改变交互感。

原站还提到 Nahas 在 2025 年 9-10 月投入约两个月全职推进标准化、文档和 polyfill，把内部实验变成可讨论的 web standard 方向。这段工作常被媒体叙事跳过，但它是 Google/Microsoft 后续能够合流的重要中间层：有了可运行 polyfill 和清晰概念，浏览器团队才更容易讨论 native API。

## Bright Data's "The Web MCP" — A Parallel Effort (August 2025)

2025 年 8 月 12 日，[Bright Data](https://brightdata.com/) 推出名为 “The Web MCP” 的服务。名字相似，但它和 W3C/Chrome 的 WebMCP 不是同一个东西。

| Bright Data Web MCP | Google/W3C WebMCP |
| --- | --- |
| server-side proxy infrastructure | browser-native protocol |
| 解决 CAPTCHA、geo-block、实时网页访问 | 解决网页如何把功能暴露给 agent |
| 商业基础设施服务 | 开放 web standard |
| 面向 agent-driven scraping / browsing | 面向 agent-website interaction |

[SiliconANGLE](https://siliconangle.com/2025/08/12/bright-data-debuts-free-tier-web-mcp-support-real-time-ai-interaction-web/) 对 Bright Data 的报道强调的是代理基础设施、实时网页交互和规模化访问。Google/W3C WebMCP 关注的则是浏览器内的标准 API，让网站自己声明 agent 可以调用什么功能。

这个命名重叠会让开发者搜索时混淆。一个是“帮 agent 访问网页的代理服务”，另一个是“网页在浏览器中暴露给 agent 的标准接口”。二者都属于 agentic web，但解决的是不同层的问题。

Bright Data 的 “The Web MCP” 更接近 agent browsing infrastructure。它强调实时网页访问、绕过 CAPTCHA、处理 geo restrictions、为 agent 提供可访问网页数据，并在发布时声称已经处理大规模日常 agent interactions。这是一个商业代理/数据访问层，目标是让 AI 系统能访问更复杂的开放网页。

Google/W3C WebMCP 则是协议和浏览器 API 层。它不是帮 agent 绕过网站限制，而是让网站主动暴露可调用能力。例如电商站可以暴露 searchProducts、addToCart、checkout；SaaS 可以暴露 createReport、filterDashboard、exportCsv；内容站可以暴露 searchArchive、summarizeArticle、getAuthorBio。一个解决“agent 怎样进网页”，一个解决“网页怎样把功能说给 agent 听”。

名称冲突会影响采用。开发者搜索 Web MCP 时可能找到 Bright Data 的服务，以为那就是 Chrome 标准；也可能看到 WebMCP spec，以为它解决 scraping 和 proxy 问题。原站把这段单独列出，是为了避免后续内容团队和工程团队在讨论 agentic web 时混用概念。

## Google & Microsoft Join Forces (Late 2025 – Early 2026)

2025 年里，Google Chrome 团队和 Microsoft Edge 团队都在探索 agent 与网页交互的结构化方案。Google 方向包括 script tools，Microsoft 方向则关注通过浏览器 API 暴露 agent-website workflow。风险是出现两个不兼容实现：Chrome-only 一套，Edge-only 一套。

MCP-B 的工作出现后，双方看到了标准化机会，于是通过 [W3C Web Machine Learning Community Group](https://github.com/webmachinelearning/webmcp) 合流。原站根据 WebMCP repository 列出的作者统计，规范贡献者有 7 位：

| Company | Contributors | Count |
| --- | --- | ---: |
| Google | David Bokan, Khushal Sagar, Hannah Van Opstal | 3 |
| Microsoft | Brandon Walderman, Leo Lee, Andrew Nolan | 4 |
| Total | Google + Microsoft | 7 |

WebMCP 与 Anthropic MCP 的关系可以这样理解：它继承 tool schema 思想，但在另外三个核心组件上分叉。

| Component | MCP | WebMCP | 是否变化 |
| --- | --- | --- | --- |
| Transport | JSON-RPC 2.0 | browser-native JavaScript APIs | yes |
| Execution | server-side | client-side, browser context | yes |
| Authentication | OAuth 2.1 | browser auth, cookies, localStorage, SSO | yes |
| Tool schemas | structured definitions | structured definitions | no |

这种合作的市场意义很大。Chrome 约 65.4% 份额，Edge 约 13.2%，两者同意走一个 W3C standard，意味着 WebMCP 有机会覆盖约 78.6% 浏览器使用场景。浏览器历史上经常出现实现分裂，这次如果能保持统一，会显著降低网站侧采用成本。

Google 和 Microsoft 独立探索的方向本来可能分裂。Chrome 团队原型里有 script tools，Edge 团队也在研究结构化 agent-website interaction。如果两个团队各自发布 API，网站开发者就要写两套实现，agent framework 也要判断不同浏览器能力。MCP-B 出现后，双方有了共同抽象：不是让 agent 看屏幕猜 UI，而是让页面注册工具 schema，让浏览器负责暴露给模型或 agent runtime。

WebMCP 与 Anthropic MCP 的关系也需要精确表达：它不是把 MCP 原封不动搬进浏览器，而是只保留 tool schema 这一层思想。Transport 从 JSON-RPC 变成 browser-native JS API；execution 从 server-side tool server 变成 client-side browser context；auth 从 OAuth 2.1 变成浏览器已有身份状态；tool schemas 则继续描述工具名称、参数、返回值和能力边界。这个分叉解释了为什么叫 WebMCP 合理，同时也解释了为什么它不是 MCP server 的简单网页版本。

W3C 路径让这件事更像 web platform feature，而不是某个浏览器扩展。规范作者名单里有 Google 和 Microsoft 工程师，说明两家都在试图把 agent-website interaction 做成跨浏览器基础能力。对站点运营者来说，这比单一平台 API 更重要：如果只有 Chrome 支持，采用意愿会受限；如果 Chrome + Edge 都走同一规范，早期投入就更像对未来 web 的基础建设。

## Google Ships WebMCP Early Preview (February 10, 2026)

2026 年 2 月 10 日，Google 的 André Bandarra 在 [Chrome Developers Blog](https://developer.chrome.com/blog/webmcp-epp) 发布 WebMCP Early Preview Program。时间上距离 Anthropic MCP 发布约 15 个月又 16 天。

早期发布路径大致是：

- Chrome 146 Canary：2026 年 2 月 10 日可试。
- Chrome 146 Stable：预计 2026 年 3 月进入稳定版本。

W3C 规范当前更明确的是 Imperative API，也就是用 JavaScript 显式注册 tool。一个简化示例是：

```js
if ("modelContext" in navigator) {
  navigator.modelContext.registerTool({
    name: "add-item",
    description: "Add an item to the current collection",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        notes: { type: "string" }
      },
      required: ["name"]
    },
    execute(input) {
      addItemToPage(input.name, input.notes);
      return `Added ${input.name}`;
    }
  });
}
```

这个 API 的意义是：agent 不必截图、识别 UI、猜按钮、模拟点击，而是可以发现 schema 并直接调用页面暴露的工具。Forbes 的报道提到，Google 内部测试里，相比视觉 agent-browser interaction，WebMCP 可降低约 67% computational demands。原因很直观：vision model inference 和 UI layout interpretation 很贵，而 tool schema discovery + direct invocation 要轻得多。

Search Engine Land 的分析把早期目标行业分成三类：

- E-commerce：agent 进行商品搜索、比较、加入购物车和 checkout。
- SaaS：agent 调用复杂 workflow，而不是在 UI 里盲点。
- Content platforms：agent 获取结构化内容、导航和数据。

这也解释了 WebMCP 对 GEO 的影响。未来网站不只要“被 AI 引用”，还要“能被 AI 使用”。内容站需要清楚的结构，工具站和电商站还需要把功能暴露成 agent 可调用接口。相关背景可以读 [llms.txt for SPA hydration gaps](/blogs/generative-engine-optimization/llms-txt-spa-hydration-gaps)、[Crawlability in 2026](/blogs/generative-engine-optimization/crawlability-seo-geo-two-meanings)、[robots.txt for AI Bots](/blogs/generative-engine-optimization/robots-txt-ai-bots)、[JSON-LD for Google](/blogs/generative-engine-optimization/why-json-ld-is-important-google) 和 [AEO vs GEO](/blogs/generative-engine-optimization/aeo-vs-geo-microsoft)。

Early Preview Program 的关键日期是 2026 年 2 月 10 日，Chrome 146 Canary 先开放测试，Chrome 146 Stable 预计在 2026 年 3 月进入稳定版。原站用这个节奏强调：WebMCP 不是纯论文或远期设想，而是已经进入浏览器发布管线的早期平台能力。Canary 到 Stable 的窗口约一个月，给开发者测试 API、反馈规范、验证用例。

W3C 当前更成熟的是 Imperative API：页面通过 `navigator.modelContext.registerTool()` 注册 JavaScript tool。Chrome blog 曾提到 Declarative API 可能让 HTML forms 以声明方式暴露给 agent，但规范细节仍处在待完善状态。也就是说，今天更可靠的实现路径是工程师主动写 JS 注册工具，而不是指望浏览器自动理解所有表单。

性能收益来自去掉视觉代理的昂贵中间步骤。传统 browsing agent 需要截图、运行 vision model、理解 UI layout、决定点击位置，再模拟鼠标键盘。WebMCP 让 agent 直接发现 schema 并调用工具，UI understanding 阶段从数百到数千毫秒的视觉推理，变成几十毫秒级别的能力发现和函数调用。Forbes 报道中提到的 67% computational demands reduction，正是这个替代关系的结果。

行业落点也很清楚。电商希望 agent 能搜索商品、比较参数、加入购物车和结账；SaaS 希望 agent 能操作复杂 dashboard 和 workflow；内容平台希望 agent 能结构化导航、提取资料、进入 archive。对 GEO 团队来说，这意味着未来优化对象不只是文本和 schema markup，还包括网站能否提供 agent-readable actions。一个页面如果只对人类漂亮，却无法被 agent 调用，可能会在下一代浏览器体验里落后。

## Timeline Summary

| Date | Event | Source |
| --- | --- | --- |
| 25 Nov 2024 | Anthropic open-sources MCP | [Anthropic MCP Announcement](https://www.anthropic.com/news/model-context-protocol) |
| Early 2025 | Alex Nahas 在 Amazon 遇到 OAuth / browser auth 问题，开始 MCP-B | [Arcade.dev Interview](https://www.arcade.dev/blog/web-mcp-alex-nahas-interview/) |
| 12 Aug 2025 | Bright Data 发布 “The Web MCP”，但这是 server-side proxy product | [SiliconANGLE Coverage](https://siliconangle.com/2025/08/12/bright-data-debuts-free-tier-web-mcp-support-real-time-ai-interaction-web/) |
| Sept-Oct 2025 | Nahas 全职推进标准化和 polyfill 文档 | [MCP-B Documentation](https://docs.mcp-b.ai/) |
| Late 2025 | Google Chrome 与 Microsoft Edge 团队通过 W3C 合流 | [W3C WebMCP Spec](https://github.com/webmachinelearning/webmcp) |
| 10 Feb 2026 | Google 在 Chrome 146 Canary 发布 WebMCP Early Preview | [Chrome Developers Blog](https://developer.chrome.com/blog/webmcp-epp) |
| Mar 2026 expected | Chrome 146 Stable 预计支持 WebMCP | [Forbes Coverage](https://www.forbes.com/sites/joetoscano1/2026/02/19/google-ships-webmcp-the-browser-based-backbone-for-the-agentic-web/) |

这条时间线也说明了为什么“谁创建了 WebMCP”不能只回答一个公司名。Anthropic 提供了 MCP 的协议语言和工具 schema 心智模型；Alex Nahas 证明浏览器内 MCP-like execution 可行，并把认证问题从 OAuth retrofit 转向 browser auth；Bright Data 的同名产品显示 agentic web 的市场需求已经很强，但它走的是代理基础设施路线；Google 和 Microsoft 则把这些方向收敛到 W3C 浏览器标准。每一步都解决了不同层的问题。

如果只写“Google 发布 WebMCP”，会漏掉两个重要判断：第一，WebMCP 的核心洞察不是浏览器厂商凭空发明，而是 MCP 生态和企业内部工具痛点共同推动；第二，它的未来价值取决于标准化协作，而不是单个浏览器是否先跑出来。原站用 15 个月、7 位工程师、3 家公司这个框架，正是为了把这个生态级演化讲完整。

## Why WebMCP matters for website owners

WebMCP 把网站从“被 agent 看见”推进到“被 agent 调用”。传统浏览代理需要截图、理解 DOM、猜测按钮含义、模拟点击，然后等待页面反馈。这个流程昂贵、慢，而且容易在弹窗、动态表单、无障碍标签缺失和复杂仪表盘里失败。WebMCP 的目标是让页面主动声明可调用工具：这个页面能搜索什么、过滤什么、创建什么、导出什么、提交什么。

对内容站来说，最早的用例可能不是 checkout，而是结构化内容发现。比如文章库可以暴露 `searchArticles`、`getArticleSummary`、`getAuthorProfile`、`listRelatedResources`。资源库可以暴露 `filterGlossaryTerms`、`compareBenchmarks`、`downloadGuide`。这些动作让 agent 不必在导航菜单里盲走，也让网站能控制哪些功能适合自动化调用。

对 SaaS 和电商来说，影响更直接。用户可能会让浏览器里的 AI agent “帮我找一款支持团队权限的方案并加入对比表”，或者“导出上周的 organic traffic 报告”。如果网站只靠视觉 UI，agent 要做大量脆弱操作；如果网站暴露清晰 tool schema，agent 可以在用户授权下更可靠地完成任务。

所以 WebMCP 对 GEO 的含义很明确：AI visibility 不再只等于文本引用。未来还包括 action visibility，也就是 AI 能否发现你的站点能力、理解参数、在正确权限下执行任务，并把结果返回给用户。

## What a WebMCP-ready site should prepare

第一步不是立刻写复杂工具，而是梳理网站的 action inventory。列出用户在站点里常做的高价值动作：搜索、筛选、保存、比较、加入购物车、预约、提交表单、导出报告、打开文档、生成摘要。每个动作都应该有明确输入、输出、权限和失败状态。

第二步是改善语义结构。即使 WebMCP 工具存在，页面仍需要清楚的标题、按钮文本、表单标签、ARIA label、错误消息和状态反馈。agentic browsing 的基础仍然是 accessibility 和 machine-readable structure。Lighthouse 的 agentic browsing 审计之所以关注 accessibility tree，就是因为工具调用和视觉推理都会受页面语义质量影响。

第三步是设计权限边界。不是所有动作都适合 agent 自动执行。搜索、筛选、摘要、加入草稿列表可以较低风险；付款、删除、发送邮件、修改权限、提交法律文件必须有更强确认。WebMCP 的价值不是让 agent 随便操作，而是让网站用明确 schema 和权限模型控制可操作范围。

第四步是记录 telemetry。站点应该能区分普通用户点击、agent-assisted action、失败的 tool invocation 和用户取消确认。没有日志，团队无法知道 agent 到底卡在哪里，也无法判断 WebMCP 是否提升了完成率。

## Security, consent, and failure modes

WebMCP 进入浏览器身份上下文，优势是能复用用户已经登录的 session，风险也是它拥有用户当前权限。因此安全模型必须假设：agent 可能理解错误、用户 prompt 可能含糊、页面内容可能包含 prompt injection，第三方脚本可能试图诱导工具调用。

网站侧至少要区分 read actions 和 write actions。Read actions 可以返回搜索结果、摘要、账户状态或公开信息；write actions 会改变系统状态，如创建订单、提交表单、删除记录或发起付款。后者需要更严格的确认、幂等设计、撤销能力和审计日志。

Prompt injection 是另一个核心问题。页面文本不应该能够直接命令 agent 调用高风险工具。工具 schema 的 description 应该清楚说明用途和限制，返回值不应混入指令式文本。对高风险动作，浏览器或站点应要求用户确认真实意图，而不是只根据页面内容自动执行。

失败状态也要标准化。工具调用失败时，不应该只返回一个模糊错误。更好的返回结构包括 error code、human-readable message、是否可重试、需要用户补充什么信息、是否需要重新认证。agent 如果拿到可解释错误，就能更好地恢复任务。

## WebMCP versus llms.txt, schema, and APIs

WebMCP 不是 llms.txt 的替代品。llms.txt 更像 AI 读取内容的地图，告诉模型或爬虫哪里有重要文档、指南和资源；WebMCP 则像浏览器里的 action layer，让 agent 能调用页面功能。一个解决“读什么”，一个解决“做什么”。

它也不是 JSON-LD schema 的替代品。schema 帮助搜索和 AI 系统理解页面实体、文章、产品、FAQ、组织和面包屑；WebMCP 描述可执行工具。未来最佳实践很可能是三者共同存在：HTML/SSR 保证可读，schema 保证实体语义，llms.txt 保证文档发现，WebMCP 保证交互能力。

WebMCP 也不等同于传统后端 API。后端 API 面向开发者和服务集成，需要认证、文档和服务器调用。WebMCP 面向浏览器中的 agent，利用当前页面和用户 session，动作更贴近用户正在看的界面。它可能调用后端 API，但对 agent 暴露的是更高层、更受控的网页动作。

## GEO implications of browser-native tools

GEO 团队过去主要问三个问题：AI 能不能抓到页面？AI 能不能理解页面？AI 愿不愿意引用页面？WebMCP 出现后，第四个问题变成：AI 能不能使用页面？

这会改变内容和产品的边界。一个计算器工具不只需要解释公式，还要暴露可调用计算动作；一个课程目录不只需要文章介绍，还要暴露筛选和推荐动作；一个 benchmark 页面不只需要表格，还要允许 agent 查询特定模型、指标和时间范围。

内容团队也要和产品工程更紧密合作。传统博客可以靠 Markdown 和内部链接维护，但 agent-ready experience 需要工具命名、参数设计、权限、错误状态和日志。GEO 负责人需要理解这些工程约束，否则会只优化文本，而错过 agentic web 的功能层。

早期不必为所有页面都做 WebMCP。优先级应该给三类页面：高频任务页面，例如搜索、筛选、报告和工具；高商业价值页面，例如电商商品、试用、demo、定价和 checkout；高信息密度页面，例如资料库、benchmark、术语表和研究档案。这些页面最可能从 agent 调用中获得用户价值。

## A practical adoption checklist

先做 discovery：用站点地图和 analytics 找出用户最常执行的任务，再对这些任务写自然语言 prompt，例如“帮我找最近关于 WebMCP 的文章”“把 FKGL 计算器应用到这段文本”“比较两个 GEO benchmark”。这些 prompt 可以帮助团队判断哪些网页动作值得注册成 tool。

再做 interface design：每个工具只做一件事，名称短而明确，参数使用具体类型，返回结构稳定。不要把 `doEverything` 这类大而模糊的工具暴露给 agent。工具越清晰，agent 越容易可靠使用，安全审查也更简单。

然后做 fallback：在不支持 WebMCP 的浏览器里，页面仍应通过 HTML、表单、链接和 API 正常工作。WebMCP 应该增强体验，而不是成为唯一入口。这样即使规范调整或浏览器支持延迟，站点也不会失去基本可访问性。

最后做 measurement：记录 agent 调用次数、成功率、失败原因、用户确认率、取消率、任务完成时间和后续转化。WebMCP 的商业价值要通过任务完成质量来证明，而不是只看是否实现了一个新标准。

## WebMCP implementation planning worksheet

网站团队可以先不用实现完整 WebMCP，只做 planning worksheet。它会把“我们应该给 agent 暴露什么能力”变成可讨论列表。

| Field | Example |
| --- | --- |
| User task | 搜索文章、比较课程、计算可读性、提交社区想法 |
| Current UI path | 首页导航 -> 资源页 -> 工具页 -> 表单 |
| Proposed tool name | `searchArticles`、`compareResources`、`calculateFlesch`、`submitIdeaDraft` |
| Inputs | query、category、text、email、notes |
| Output | result list、score、summary、draft id |
| Risk level | read、draft write、account write、payment/action |
| Required confirmation | none、preview、explicit user confirm |
| Fallback UI | 普通搜索框、工具页、表单 |
| Telemetry | success、error code、cancel、retry、time to complete |

这张表的价值是让内容、产品、工程和安全团队在写代码前对齐。很多 agent-ready 失败不是 API 难，而是团队没有决定哪些动作适合自动化、哪些动作必须人类确认。

## WebMCP action taxonomy

可以把网页动作按风险分成五类。

第一类是 discovery actions，例如 search、filter、list、getSummary。这类通常低风险，最适合早期 WebMCP，因为它们帮助 agent 理解网站内容。

第二类是 calculation actions，例如 readability calculator、ROI calculator、benchmark lookup、schema validator。这类风险取决于输出是否会影响高风险决策。工具需要解释输入、公式和限制。

第三类是 draft actions，例如 createDraft、saveComparison、prepareReport。这类会写入状态，但通常可以不立即对外发布。它们适合要求用户确认后保存。

第四类是 account actions，例如 updateProfile、changeSettings、exportData。这类需要身份确认、审计日志和可撤销设计。

第五类是 irreversible or high-risk actions，例如 payment、delete、submitLegalDocument、sendEmail、changePermissions。这类不应直接自动化，至少需要明确用户确认、多步校验和回滚机制。

这个 taxonomy 对 GEO 团队也有帮助。未来 AI visibility 不只是“这篇文章被引用了吗”，还包括“agent 能否安全完成用户任务”。页面内容、工具 schema、权限和反馈状态都会成为可见性的一部分。

## How WebMCP changes site architecture

如果 WebMCP 成为浏览器能力，网站架构会多一层 action metadata。过去内容站通常有 three layers：HTML content、structured data、navigation。未来可能有第四层：agent tools。

HTML content 负责让人和爬虫读懂页面。Structured data 负责声明文章、组织、产品、FAQ、面包屑等实体。Navigation 负责人类和 crawler 在站内移动。Agent tools 则负责告诉浏览器里的 AI：这个页面能执行哪些动作，参数是什么，返回什么，失败时如何恢复。

这四层应互相一致。比如一个 Flesch calculator 页面，正文解释公式，schema 说明工具类型，导航把它放在 Tools 下，WebMCP tool 暴露 `calculateFlesch(text)`。如果正文说工具支持中文，但 tool 只适合英文，agent 会产生错误。内容和工具接口不一致，会成为新的 GEO 风险。

## Migration plan for content sites

内容站可以按四阶段迁移。

第一阶段是 semantic readiness。修标题、链接、表格、表单 label、alt、FAQ、schema、sitemap 和 llms.txt。即使没有 WebMCP，这些也能改善 AI readability。

第二阶段是 action inventory。列出站点里哪些动作可以被 agent 帮助：搜索文章、筛选资源、读取术语、运行计算器、导出学习路径、准备社区提交。给每个动作标注风险和业务价值。

第三阶段是 prototype。选一个低风险工具，比如 searchArticles 或 glossary lookup，用 polyfill 或内部实验验证 agent 是否更容易完成任务。记录失败原因。

第四阶段是 governance。建立命名规范、权限模型、确认流程、日志、错误码、版本管理和安全审查。WebMCP 如果进入稳定浏览器，站点就能更快扩展，而不是临时拼接。

对于这个中文复刻站，最自然的早期候选工具是：搜索文章、筛选资源、计算 Flesch/FKGL/Gunning Fog/SMOG、查 GEO glossary、列出学习路径、提交 community ideas。它们风险低，且与站点内容价值直接相关。

## Standards watchlist

WebMCP 仍处在早期阶段，后续维护这篇文章时应跟踪几个位置。

- [W3C WebMCP repository](https://github.com/webmachinelearning/webmcp)：规范讨论、issue 和 API 变化。
- [WebMCP specification draft](https://webmachinelearning.github.io/webmcp/)：接口和术语的最新定义。
- [Chrome Developers Blog](https://developer.chrome.com/blog/webmcp-epp)：Chrome 预览、Canary、Stable 节奏。
- [MCP-B documentation](https://docs.mcp-b.ai/)：polyfill 和开发者实验。
- [Model Context Protocol](https://modelcontextprotocol.io/)：MCP 本体演化，影响 WebMCP 的概念语言。
- [Search Engine Land](https://searchengineland.com/) 和 [Forbes](https://www.forbes.com/) 等行业报道：采用场景和市场理解。

每次规范更新，都要问四个问题：API 名称是否变化；Declarative API 是否成熟；Chrome/Edge 支持状态是否变化；安全模型是否新增要求。然后更新本文的时间线、代码示例和站点建议。

## Why the attribution history matters for GEO

原文强调 15 个月、7 位工程师、3 家公司，不只是为了纠正历史。对 GEO 来说，归因历史会影响内容可信度。AI answers 很容易把复杂演化压缩成“Google created WebMCP”。如果本地站要成为可靠资源，就应该保留更细的事实链：Anthropic 提供 MCP 基础，Alex Nahas 证明 browser-native MCP-like execution，Bright Data 提供同名但不同架构产品，Google 和 Microsoft 通过 W3C 推向浏览器标准。

这种写法本身就是 GEO 内容示范。它没有只给一句结论，而是列出时间、人物、公司、标准、产品和来源。AI 如果引用这篇文章，就能更准确回答“谁创建了 WebMCP”“WebMCP 和 MCP-B 什么关系”“Bright Data 的 Web MCP 是否同一个东西”。

后续更新任何技术历史类文章，都应该保持这种模式：不要只写发布新闻；要写前置协议、关键人物、平行产品、标准化路径、市场影响和 GEO 含义。这样站点会更像知识库，而不是新闻聚合。

## Key Resources

- [WebMCP GitHub repository](https://github.com/webmachinelearning/webmcp)
- [W3C specification](https://webmachinelearning.github.io/webmcp/)
- [Chrome Developers Blog: WebMCP EPP](https://developer.chrome.com/blog/webmcp-epp)
- [MCP-B Documentation](https://docs.mcp-b.ai/)
- [@mcp-b/global polyfill](https://www.npmjs.com/package/@mcp-b/global)
- [Anthropic: Introducing MCP](https://www.anthropic.com/news/model-context-protocol)
- [Model Context Protocol roadmap](https://modelcontextprotocol.io/development/roadmap)
- [Search Engine Land analysis](https://searchengineland.com/google-releases-preview-of-webmcp-how-ai-agents-interact-with-websites-469024)

## Related reading

- [From Listicles to Landing Pages: Why ChatGPT Atlas Reads Your Site Directly](/blogs/generative-engine-optimization/chatgpt-atlas-direct-website-reading-geo)
- [BrowseComp Benchmark: Why Browsing Agents Change What GEO Teams Must Optimize](/blogs/generative-engine-optimization/browsecomp-benchmark-browsing-agents-geo)
- [4 Reasons GPT-5.4's Web Benchmarks Should Scare or Excite GEO Pros](/blogs/generative-engine-optimization/gpt-5-4-web-benchmarks-geo-professionals)
- [7 Questions About GPT-5.4's Benchmarks and Why They Matter for GEO](/blogs/generative-engine-optimization/gpt-5-4-benchmarks-geo-implications)
- [5 Benchmark Wins for GPT-5.4 — But How Do They Affect Your Brand Mentions?](/blogs/generative-engine-optimization/gpt-5-4-benchmark-wins-brand-mentions)

## About the author

[Rohit Singh](https://www.linkedin.com/in/rohitsingh017) is the creator of [GeoZ AI](https://www.geoz.ai/) and The GEO Community. Follow the [learning path](/start) or connect on [LinkedIn](https://www.linkedin.com/in/rohitsingh017).
