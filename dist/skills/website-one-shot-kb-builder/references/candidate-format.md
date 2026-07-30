# Candidate v1 格式

候选包只提供文字和可选 Logo。服务端负责最终目录、完整度、manifest、
状态、哈希和前台 schema。

## 目录

```text
candidate/
├── 00_brand_facts.md
├── 01_customer_draft.md
├── 02_run.json
└── assets/
    └── logo.png
```

`02_run.json` 和 `assets/` 可省略。不得加入其他文本、脚本、归档或图片。

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

不得在正文中嵌入 HTTP(S) 图片。

## 02_run.json

该文件仅提供可选来源和 Logo 元数据：

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
`brand_identity`。没有可靠 Logo 时省略 `assets`。

不要写最终计数、哈希、置信度、状态、manifest 或 canonical 引用。
