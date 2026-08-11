# Candidate v1 格式

候选包固定命名为 `website-lead-candidate-v1.zip`，只提供文字和一个
必须主动尝试获取的 Logo。服务端负责最终目录、完整度、manifest、状态、
哈希和前台 schema。

## 目录

```text
candidate/
├── 00_brand_facts.md
├── 01_customer_draft.md
├── 02_run.json
└── assets/
    └── logo.png
```

`02_run.json` 必须提供。`assets/` 只有在按下述规则确认 Logo 不可获得时
才可省略。不得加入其他文本、脚本、归档或图片。
必须使用 Skill 内 `scripts/build_candidate.py` 打包；不得手工压缩目录。

## 00_brand_facts.md

使用以下完整二级标题：

```markdown
## D01 企业基础

## D02 团队

## D03 产品服务

## D04 技术能力

## D05 客户案例

## D06 资质认证

## D07 财务融资

## D08 竞争信息

## D09 市场信息

## D10 品牌资产

## D11 渠道

## D12 公开意图

## D13 公共情报
```

每个维度至少写一个有来源的事实段落或一个 `[待核验]` 缺口。产品族
使用三级标题分开，避免把多个产品压缩成一段概述。

## 01_customer_draft.md

使用以下完整二级标题：

```markdown
## 企业与品牌

## 团队与组织

## 产品与服务

## 技术与交付

## 客户与行业

## 服务与合作

## 可信优势
```

可自由使用三级和四级标题。每个事实段落保留 `[来源](URL)`、
`[企业主张](URL)`、`[权威来源](URL)`、`[第三方来源](URL)` 或
`[上传文件：filename]`。缺口使用 `[待核验]`。

### 跨文件证据闭包

URL 去除片段和默认端口；上传文件名按 NFKC 规范化后必须满足：

```text
evidence_refs(01_customer_draft.md) ⊆ evidence_refs(00_brand_facts.md)
```

客户稿来源必须先在事实稿 D01–D13 的事实段落引用；仅列入
`02_run.json.sources` 无效。

不得在正文中嵌入 HTTP(S) 图片。

### 实际呈现字数底线

打包器仅计算最终可见的中文、字母和数字；Markdown 标记、URL、证据
标签、空白和标点不计。以下底线基于用户提供的硅基流动候选包各版块
实际呈现字数测量后设定：

| 版块       | 当前基线 | 最低呈现字数 |
| ---------- | -------: | -----------: |
| 企业与品牌 |      210 |          500 |
| 团队与组织 |      190 |          500 |
| 产品与服务 |     1205 |         2500 |
| 技术与交付 |      403 |         1000 |
| 客户与行业 |      290 |          600 |
| 服务与合作 |      311 |          600 |
| 可信优势   |      345 |          600 |
| 合计       |     2954 |         6300 |

有资料可抓取时必须达到对应底线，并把内容分配到真实的产品、服务或事实
条目中。不得通过重复、空泛套话、来源页导航文本或无证据扩写凑字数。

只有某版块确实不适用，或在尝试至少三个相关公开来源后仍无法取得更多
事实时，才可在 `contentFloorExceptions` 中声明例外。例外版块仍应保留
已证实内容和 `[待核验]`，不得因为当前正文较短就声明例外。

## 02_run.json

该文件提供必需的来源、内容底线例外和 Logo 获取记录：

```json
{
  "schemaVersion": 1,
  "company": {
    "name": "企业名称",
    "officialWebsite": "https://example.com",
    "industryCluster": "C3"
  },
  "sources": [
    {
      "title": "企业官网",
      "kind": "official_web",
      "status": "read",
      "url": "https://example.com"
    }
  ],
  "queries": ["企业名称 产品"],
  "contentFloorExceptions": [],
  "logoAcquisition": {
    "status": "retained",
    "attemptedPageUrls": ["https://example.com"]
  },
  "assets": [
    {
      "path": "assets/logo.png",
      "type": "brand_identity",
      "sourceKind": "official_web",
      "sourcePageUrl": "https://example.com",
      "sourceAssetUrl": "https://example.com/logo.png",
      "caption": "企业 Logo"
    }
  ]
}
```

某版块低于底线时，按以下结构记录；`attemptedSourceUrls` 至少三项，且
每项都必须同时出现在 `sources`：

```json
{
  "contentFloorExceptions": [
    {
      "section": "团队与组织",
      "reason": "官网与公开权威页面均未披露团队成员或组织信息。",
      "attemptedSourceUrls": [
        "https://example.com/",
        "https://example.com/about",
        "https://example.com/news"
      ]
    }
  ]
}
```

未能取得可靠 Logo 时必须省略 `assets`，并明确记录：

```json
{
  "logoAcquisition": {
    "status": "unavailable",
    "attemptedPageUrls": ["https://example.com/", "https://example.com/about"],
    "reason": "两个第一方页面均未提供可解码的官方 Logo 原始资源。"
  }
}
```

允许的 `kind`：

- `official_web`
- `official_document`
- `user_upload`
- `authoritative`
- `reputable_media`
- `other`

允许的 `status`：`read`、`partial`、`failed`。

允许的 `industryCluster`：`C1`、`C2`、`C3`、`C4`、`C5`、`C6`。

`assets` 最多一项，且必须是 `assets/logo.<extension>` 与
`brand_identity`。取得 Logo 时 `logoAcquisition.status` 必须为
`retained`；没有可靠 Logo 时必须按上述规则声明 `unavailable`，不能
静默省略。

不要写最终计数、哈希、置信度、状态、manifest 或 canonical 引用。
