# Candidate v1 格式

候选包是服务端 Finalizer 的内容输入，不是最终客户归档。只需确保
两份 Markdown 完整、来源标记清楚。

## 目录

```text
candidate/
├── 00_brand_facts.md
├── 01_customer_draft.md
├── 02_run.json
└── assets/
```

`02_run.json` 与 `assets/` 可省略。允许 ZIP 只有一个外层企业目录。

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

标题下可使用段落、列表或表格。事实粒度尽量清楚，每个事实单元保留
来源标记。缺失维度写一条中性缺口，不得补写行业常识。

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

不要在正文中嵌入 HTTP(S) 图片。包内图片可使用相对路径。

## 02_run.json

该文件为辅助元数据；保持结构简单：

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
      "title": "页面标题",
      "kind": "official_web",
      "status": "read",
      "url": "https://example.com/page"
    },
    {
      "title": "上传文件",
      "kind": "user_upload",
      "status": "read",
      "attachmentName": "company.pdf"
    }
  ],
  "queries": ["搜索词"],
  "assets": [
    {
      "path": "assets/logo.png",
      "type": "brand_identity",
      "sourceKind": "official_web",
      "sourcePageUrl": "https://example.com",
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

不要写计数、哈希、置信度、最终状态、manifest 或 canonical 引用。
