# FrontMind Agent + Website 生产发布清单

本文是两仓联动发布的唯一顺序清单。生产顺序必须是：

```text
把当前新版 Dashboard 工作树推送到新的私有仓库 frontmind-dashboard
→ 停止旧 Agent，移除 agent.frontmind.net、旧服务器目录和旧数据库
→ 保留旧 GitHub frontmind-agent 仓库，但不再向其推送
→ 释放并由新 Dashboard 接管 3001
→ 新建空的 frontmind_dashboard 数据库和三个持久目录
→ 构建并验证 Dashboard 不可变产物
→ 在空库执行 0000–0034 共 35 个版本化迁移
→ 初始化系统管理员并启动 Dashboard
→ 验证凭据、3 个 Pro Skill 与内部接口
→ 构建并启动 Website
→ 验证 5 个 Base Skill、支付、监控和账号交付
```

## A. 两个本地仓库尚未 commit 时先这样做

先在 GitHub 创建一个完全空的 Private 仓库 `frontmind-dashboard`，不要勾选 README、
`.gitignore` 或 License。随后在当前本地 `frontmind-agent` 目录执行：

```bash
cd /Users/fanzengxia/Documents/GitHub/frontmind-agent
git remote rename origin legacy-agent
git remote set-url --push legacy-agent DISABLED
git remote add origin https://github.com/xiafanzeng/frontmind-dashboard.git
git branch --unset-upstream || true
git remote -v
```

预期 `origin` 指向新仓库，`legacy-agent` 的 push URL 为 `DISABLED`。这样 GitHub
Desktop 的 `Push origin` 只会写入新仓库，旧 Agent 仓库不会发生任何变化。

完成远端调整后暂时保留当前本地文件夹名，先从 `frontmind-agent` 路径执行下方备份、
发布门、提交和首次 push。确认新 GitHub 仓库已经收到提交后，再关闭 GitHub Desktop
和 Codex，把本地文件夹改名为 `frontmind-dashboard` 并重新添加；不需要重新初始化 Git。

不要先清理、stash 或重置当前工作区。先在仓库外做一次本地保护副本；副本目录不得同步
到网盘或公开仓库：

```bash
mkdir -p /Users/fanzengxia/Documents/FrontMind-release-backups/dashboard-20260728-r1
chmod 700 /Users/fanzengxia/Documents/FrontMind-release-backups/dashboard-20260728-r1

git -C /Users/fanzengxia/Documents/GitHub/frontmind-agent diff --binary \
  > /Users/fanzengxia/Documents/FrontMind-release-backups/dashboard-20260728-r1/agent-tracked.patch
git -C /Users/fanzengxia/Documents/GitHub/frontmind-website diff --binary \
  > /Users/fanzengxia/Documents/FrontMind-release-backups/dashboard-20260728-r1/website-tracked.patch

rsync -a \
  --exclude='.git/' --exclude='node_modules/' --include='.env.example' --exclude='.env' \
  --exclude='.env.*' --exclude='*.log' --exclude='logs/' \
  --exclude='.secrets/' --exclude='*.pem' --exclude='*.key' \
  --exclude='*.p12' --exclude='*.pfx' --exclude='*.har' \
  --exclude='screenshots/' --exclude='api-responses/' \
  --exclude='test-results/' --exclude='playwright-report/' \
  --exclude='coverage/' --exclude='.workflow-uploads/' \
  --exclude='.frontmind-prepared-files/' \
  --exclude='tmp/pdfs/geo_report_review/' \
  /Users/fanzengxia/Documents/GitHub/frontmind-agent/ \
  /Users/fanzengxia/Documents/FrontMind-release-backups/dashboard-20260728-r1/agent-worktree/

rsync -a \
  --exclude='.git/' --exclude='node_modules/' --include='.env.example' --exclude='.env' \
  --exclude='.env.*' --exclude='*.log' --exclude='logs/' \
  --exclude='.secrets/' --exclude='*.pem' --exclude='*.key' \
  --exclude='*.p12' --exclude='*.pfx' --exclude='*.har' \
  --exclude='screenshots/' --exclude='api-responses/' \
  --exclude='test-results/' --exclude='playwright-report/' \
  --exclude='coverage/' --exclude='.frontmind-visitor-stats.json' \
  --exclude='.frontmind-visitor-stats.json.tmp' \
  /Users/fanzengxia/Documents/GitHub/frontmind-website/ \
  /Users/fanzengxia/Documents/FrontMind-release-backups/dashboard-20260728-r1/website-worktree/
```

`.gitignore` 已负责排除 `.env*`、日志、截图、API 响应、测试报告和
`tmp/pdfs/geo_report_review/`。先验证规则，不能再靠每次手写负 pathspec：

```bash
git -C /Users/fanzengxia/Documents/GitHub/frontmind-agent check-ignore -v \
  .env .env.production logs/release.log screenshots/home.png \
  api-responses/task.json task.api-response.json local-signing.key \
  test-results/result.json \
  tmp/pdfs/geo_report_review/page-1.png

git -C /Users/fanzengxia/Documents/GitHub/frontmind-website check-ignore -v \
  .env .env.production logs/release.log screenshots/home.png \
  api-responses/task.json task.api-response.json local-signing.key \
  test-results/result.json
```

每个路径都应显示命中的 `.gitignore` 规则。随后分别审核：

```bash
git -C /Users/fanzengxia/Documents/GitHub/frontmind-agent status --short --branch
git -C /Users/fanzengxia/Documents/GitHub/frontmind-agent diff --name-status
git -C /Users/fanzengxia/Documents/GitHub/frontmind-agent ls-files --others --exclude-standard

git -C /Users/fanzengxia/Documents/GitHub/frontmind-website status --short --branch
git -C /Users/fanzengxia/Documents/GitHub/frontmind-website diff --name-status
git -C /Users/fanzengxia/Documents/GitHub/frontmind-website ls-files --others --exclude-standard
```

确认大量删除、新迁移、新 Skill、测试与构建文件全部符合本次发布后，才允许暂存。
此时先不要 commit：继续完成下方“0. 发布前安全门”和本地检查、测试。Website 的
服务器 bundle 会内嵌当前 `git rev-parse HEAD`，所以预提交工作区产生的 `dist/` 只用于
本地验证，禁止作为最终发布产物提交；最终产物必须在 push 后从远端提交的干净克隆构建。

最终 `git add -A` 依赖已经验证的 `.gitignore`，不再手动排除临时目录：

```bash
cd /Users/fanzengxia/Documents/GitHub/frontmind-agent
git add -A
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git status --short

cd /Users/fanzengxia/Documents/GitHub/frontmind-website
git add -A -- . ':!dist'
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git status --short
```

暂存清单中不得出现真实 Key、`.env`、日志、截图、API 响应、测试输出、客户资料、数据库
备份或 ICP 材料。Dashboard 当前已有本地提交 `3176ea4 update login`，它会进入新的
`frontmind-dashboard` 仓库，但不会推送到旧 Agent 仓库。

先提交 Dashboard，并首次发布到新的空仓库：

```bash
cd /Users/fanzengxia/Documents/GitHub/frontmind-agent
git commit -m "feat: launch FrontMind Dashboard service portal"
git remote get-url origin
git push -u origin main
git rev-parse HEAD
```

确认新仓库的 `main` 等于上面的本地 SHA 后，关闭 GitHub Desktop 与 Codex，才把目录
`frontmind-agent` 改名为 `frontmind-dashboard`，并在 GitHub Desktop 重新添加新路径。

再提交 Website：

```bash
cd /Users/fanzengxia/Documents/GitHub/frontmind-website
git commit -m "feat: launch GEO assessment and Dashboard handoff"
git pull --rebase origin main
git push origin main
git rev-parse HEAD
```

如果 Website 的 `pull --rebase` 出现冲突，不要继续 push；解决后必须从本节发布门重新
检查、测试和构建。记录两个最终 SHA，服务器只部署这两个已验证 SHA。

## 0. 发布前安全门

- 已经出现在聊天、终端、截图或日志中的 API Key 必须先撤销并轮换；只把新值写入 1Panel 服务端环境变量或 Agent 加密凭据库。
- 售前 API Key 只保存在 Agent 数据库中；浏览器与 Website 环境变量不得出现该 Key。
- `FRONTMIND_PRESALES_SERVICE_TOKEN` 与
  `FRONTMIND_PROVISIONING_SERVICE_TOKEN` 至少 32 字符、彼此不同，并在两个应用中逐字一致。
- 不执行 `git reset --hard` 清理服务器修改；发现服务器工作树不干净时停止发布并先确认来源。
- 不在审核前盲目执行 `git add -A`。完成上节清单与 `.gitignore` 验证后，可统一暂存
  本次完整发布，避免遗漏未跟踪迁移或 Skill。

两个仓库都先执行：

```bash
git status --short --branch
git diff --check
git ls-files --others --exclude-standard
```

Agent 提交清单必须包含三个运行时 Skill：

```text
private-workflows/socratic-kb-builder.skill
private-workflows/brand-question-portfolio.skill/
private-workflows/response-logic-builder.skill/
```

Website 提交清单必须包含 `server/skills/` 下五个运行时 Skill和
`scripts/copy-server-skills.mjs`。任何一个漏提交都会让干净服务器构建失败。

## 1. 本地双仓发布门

Dashboard（首次 push 前本地目录仍使用旧文件夹名）：

```bash
cd /Users/fanzengxia/Documents/GitHub/frontmind-agent
pnpm install --prod=false --frozen-lockfile
pnpm check
pnpm test
pnpm build # 构建标识自动生成；无需在 1Panel 配置 FRONTMIND_BUILD_VERSION

test -f dist/private-workflows/socratic-kb-builder.skill
test -f dist/private-workflows/brand-question-portfolio.skill/SKILL.md
test -f dist/private-workflows/response-logic-builder.skill/SKILL.md
node scripts/audit-production-bundle.mjs
```

Website：

```bash
cd /Users/fanzengxia/Documents/GitHub/frontmind-website
pnpm install --prod=false --frozen-lockfile
pnpm check
pnpm test
VITE_CLIENT_PORTAL_URL=https://dashboard.frontmind.net/login \
VITE_SITE_URL=https://www.frontmind.net \
SITE_URL=https://www.frontmind.net \
BUILD_DATE=2026-07-28 \
pnpm build

test "$(find dist/skills -type f | wc -l | tr -d ' ')" = "21"
node scripts/audit-production-bundle.mjs
```

Website 的上述本地构建只验证源码可构建，不作为最终 release 产物。发布必须使用
push 后干净克隆里生成的 `dist/`，这样内嵌 `buildSha` 才等于发布提交。不要在构建完成后
再提交 `dist/`，否则新提交会再次让内嵌 SHA 落后一个版本。服务器只允许部署记录的
远端提交；不要在服务器上临时修改源码或 Skill。

### 1.1 推送后必须做干净克隆复验

脏工作区通过不代表提交完整。完成上方 A 节的两次 push 后，用远端 `main` 建立全新目录：

```bash
mkdir -p /private/tmp/frontmind-release-dashboard-20260728-r1
cd /private/tmp/frontmind-release-dashboard-20260728-r1

git clone \
  "$(git -C /Users/fanzengxia/Documents/GitHub/frontmind-dashboard remote get-url origin)" \
  frontmind-dashboard
git clone \
  "$(git -C /Users/fanzengxia/Documents/GitHub/frontmind-website remote get-url origin)" \
  frontmind-website
```

确认两个克隆的 `HEAD` 分别等于记录的 release SHA，然后在这两个干净目录完整重跑
“1. 本地双仓发布门”。任何缺文件、测试失败或构建差异都要回原仓修复、重新提交、
重新 push，再删除该临时验证目录并从头克隆；不能把临时目录中的修补直接带上服务器。
Website 最终交给 1Panel 的必须是这个干净克隆或由同一提交构建的镜像，不得使用原开发
工作区中预提交生成的 `dist/`。

Website 干净克隆中的最终构建必须改用：

```bash
pnpm build:release
```

该命令会先确认 Git 工作区完全干净，再生成内嵌当前提交 SHA 的生产产物。

## 2. 先发布 Dashboard

### 2.1 删除旧运行环境，并创建全新的 Dashboard 数据库

旧 GitHub `frontmind-agent` 仓库保留为只读历史，但旧生产 Agent 不再保留。确认旧库没有
需要迁移的数据后，在 1Panel 依次停止旧 Agent、删除 `agent.frontmind.net` 网站绑定、
删除旧运行环境、旧服务器代码目录、旧持久目录和旧数据库。不要把任何旧目录挂载给新
Dashboard，也不要复用旧数据库账号、加密密钥、service token 或容器 DNS。

删除目标前先在 1Panel 再次核对精确名称，不能对不明确的路径执行递归删除。完成后确认
原端口已经释放：

```bash
ss -lntp | grep ':3001 ' || true
```

必须没有输出，才能创建新 Dashboard。

在 1Panel 新建：

```text
数据库：frontmind_dashboard
数据库用户：frontmind_dashboard
字符集：utf8mb4
```

数据库只加入私有 Docker 网络，不开放公网 `3306`。同时创建全新的
`prepared-files`、`dashboard-assets` 持久目录；不挂载旧 Agent 目录。

### 2.2 运行依赖

生产镜像必须永久安装 Poppler 与 Ghostscript，而不是临时安装到即将被重建的容器：

```bash
docker exec FrontMind-Dashboard sh -lc \
'command -v pdfinfo &&
 command -v pdftotext &&
 command -v pdfseparate &&
 command -v pdfunite &&
 command -v gs'
```

Node 使用项目支持的 Node 20.19+ 或 22.12+，pnpm 使用仓库声明版本。安装依赖时必须
包含构建所需 devDependencies，因此使用 `pnpm install --prod=false --frozen-lockfile`。

### 2.3 Agent 环境变量

至少配置：

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=mysql://frontmind_dashboard:<URL编码密码>@mysql:3306/frontmind_dashboard
FRONTMIND_CREDENTIAL_ENCRYPTION_KEY=base64:<新生成的32字节密钥>
FRONTMIND_PRESALES_SERVICE_TOKEN=...
FRONTMIND_PROVISIONING_SERVICE_TOKEN=...
FRONTMIND_PUBLIC_URL=https://dashboard.frontmind.net
FRONTMIND_WEBSITE_URL=https://www.frontmind.net
FRONTMIND_MONITOR_API_KEY=...
FRONTMIND_DASHBOARD_IMPORT_PREFLIGHT_SECRET=...
FRONTMIND_PREPARED_FILE_DIR=/var/lib/frontmind/prepared-files
FRONTMIND_DASHBOARD_ASSET_DIR=/var/lib/frontmind/dashboard-assets
FRONTMIND_PDF_WORKERS=1
FRONTMIND_SERVICE_ENTITLEMENT_ENFORCEMENT=auto
FRONTMIND_KB_SKILL_PATH=/app/dist/private-workflows/socratic-kb-builder.skill
FRONTMIND_BRAND_QUESTION_SKILL_PATH=/app/dist/private-workflows/brand-question-portfolio.skill
FRONTMIND_RESPONSE_LOGIC_SKILL_PATH=/app/dist/private-workflows/response-logic-builder.skill
```

三个 `/var/lib/frontmind/...` 目录必须是全新持久卷。因为新系统使用空库和新目录，
凭据加密密钥与 ICP 材料密钥也必须各自新生成、彼此不同，并在此后长期保持不变。
所有值只在 1Panel 环境变量界面配置；生产服务器不创建 `.env` 或 `.env.local`。

### 2.4 构建、迁移、切换

不要在仍对外提供静态资源的 `/app/dist` 上原地构建。应由 1Panel 镜像构建或独立
release 目录先完成安装、检查、测试和构建，通过后再切换容器。

空库迁移只执行一次：

```bash
pnpm db:migrate
```

绝不执行 `pnpm db:push` 或 `pnpm db:generate`。当前仓库包含 `0000`–`0034`
共 35 个迁移；数据库账号需要 MySQL 8 对应 DDL 与触发器权限。迁移成功后执行
`pnpm admin:init -- --username admin --display-name "FrontMind Admin"`，密码只通过隐藏
交互输入。任何一步失败都不得启动 Dashboard。

### 2.5 Agent 验收

```bash
curl -fsS http://127.0.0.1:3001/healthz
curl -fsS https://dashboard.frontmind.net/healthz
```

健康响应除 `status: "ok"` 外，还必须列出以下三个 Skill 及其版本和内容哈希：

```text
socratic-kb-builder
brand-question-portfolio
response-logic-builder
```

再验证：

```bash
curl -fsS \
  -H "x-frontmind-service-token: $FRONTMIND_PRESALES_SERVICE_TOKEN" \
  http://frontmind-dashboard:3001/api/internal/presales/status

curl -fsS \
  -H "x-frontmind-provisioning-token: $FRONTMIND_PROVISIONING_SERVICE_TOKEN" \
  http://frontmind-dashboard:3001/api/internal/provisioning/payment-receipts/ready

curl -fsS \
  -H "x-frontmind-provisioning-token: $FRONTMIND_PROVISIONING_SERVICE_TOKEN" \
  http://frontmind-dashboard:3001/api/internal/provisioning/project-orders/ready
```

最后由管理员在 Agent“售前页面”录入、验证并启用轮换后的售前 API Key。除连接测试外，
还要用无客户数据的独立 canary 真实创建并完成一个 Base 任务，再删除该任务。

## 3. Agent 完全正常后发布 Website

如果两个应用位于不同容器，`127.0.0.1` 指向各自容器，不能用于容器间调用。优先使用
同一 Docker 网络中的精确服务 DNS 名：

```env
NODE_ENV=production
FRONTMIND_GEO_INVITE_CODE=...
FRONTMIND_GEO_SESSION_SECRET=...
FRONTMIND_PRESALES_AGENT_URL=http://frontmind-dashboard:3001/api/internal/presales
FRONTMIND_PRESALES_SERVICE_TOKEN=...
FRONTMIND_AGENT_PROVISIONING_URL=http://frontmind-dashboard:3001/api/internal/provisioning
FRONTMIND_PROVISIONING_SERVICE_TOKEN=...
FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS=frontmind-dashboard
FRONTMIND_PUBLIC_BASE_URL=https://www.frontmind.net
FRONTMIND_TRUST_PROXY=loopback
FRONTMIND_GEO_SKILLS_DIR=/app/dist/skills
FRONTMIND_VISITOR_STATS_FILE=/var/lib/frontmind-website/visitor-stats.json
FRONTMIND_ZPAY_PID=...
FRONTMIND_ZPAY_KEY=...
VITE_CLIENT_PORTAL_URL=https://dashboard.frontmind.net/login
```

`FRONTMIND_VISITOR_STATS_FILE` 本次必须指向新建的空持久文件，不能沿用旧统计文件：
旧实现会把没有可信地区头的请求归入中国。新版只从实际持久化访问计算总数，缺少地区时
明确记为 `Unknown`，API 不可用时前端明确显示“暂不可用”，不会用预置数字冒充实时数据。
只有 CDN 或反向代理已验证并覆盖写入地区头时，才转发
`CF-IPCountry`、`X-Country-Code` 等地区头；不要信任公网客户端自行传入的同名请求头。

如果使用内部 HTTPS 域名，则无需 HTTP hostname allowlist。不要给 allowlist 填协议、
端口、路径、通配符或 IP。

Website 同样在独立构建环境中执行本地发布门，构建成功后由 1Panel 重建或重启唯一的
Node 运行环境；不要再手工启动第二个 `pnpm start`。

启动 Website 前必须在同一套生产环境变量下执行只读商户预检。该命令只调用 ZPAY
余额查询接口验证 PID/Key，不创建订单、不扣款，也不会输出余额或密钥：

```bash
pnpm verify:payment
```

只有返回 `status: "ok"`、`provider: "zpay"` 且 callbackOrigin 为正式官网域名时才能
继续启动。缺失、格式错误或被 ZPAY 拒绝的商户配置都会直接失败。

## 4. Website 验收

```bash
curl -fsS http://127.0.0.1:8888/healthz
curl -fsS https://www.frontmind.net/healthz
```

响应必须列出五个 `status: "ok"` 的 Base Skill：

```text
website-one-shot-kb-builder
geo-question-recommender
geo-knowledge-answer-verifier
geo-current-state-evaluator
geo-optimization-outcome-forecaster
```

其中 `website-one-shot-kb-builder.version` 必须为 `5`，`buildSha` 必须
等于本次部署提交。完成公网切流后执行自动发布验证门：

```bash
pnpm verify:production -- \
  --url https://www.frontmind.net \
  --sha "$(git rev-parse HEAD)"
```

该命令同时核对公网构建 SHA、五个 Skill、website Skill 源码哈希、依赖
就绪状态以及首页入口 JS 的文件名和内容哈希；任一不一致都视为未部署成功。

同时必须包含以下依赖就绪结果；任一项缺失或不为 `true` 都不得继续切流：

```text
dependencies.agent.credentialConfigured
dependencies.agent.monitorCredentialConfigured
dependencies.agent.publicUrlConfigured
dependencies.projectOrderRegistry.ready
dependencies.paymentReceiptLedger.ready
```

未登录会话必须失败为 JSON，而不是反向代理回退的 HTML：

```bash
curl -sS -o /tmp/frontmind-geo \
  -w '%{http_code} %{content_type}\n' \
  http://127.0.0.1:8888/api/geo/session

head -c 300 /tmp/frontmind-geo
```

预期为 `401 application/json` 且包含 `INVITE_REQUIRED`。

最终 canary 使用独立测试企业和非敏感自有站点，依次验证：

1. Base 知识库 ZIP 与 20 题问题推荐；
2. 单平台固定 5 次监控、现状评估和四周预测；
3. 测试支付通知、签约、账号创建与知识库导入；
4. 新版简略看板在桌面和 390px 移动端正确渲染；
5. 删除 canary 项目后，任务、文件、监控和临时账号均按保留策略清理。

真实客户账号、资料和问题不得用于上线 canary。

## 5. 回滚原则

- 开放真实流量前如 Dashboard 验收失败，可删除并重新创建这套全新空库和三个新持久目录，
  然后从 `0000` 重新迁移；旧 Agent 运行环境、目录和数据库已经删除，不作为回滚目标。
- 开放真实流量后必须先冻结支付和写入并备份当前新库，再前向修复或恢复新 Dashboard
  自己的备份；不能回滚到已删除的旧数据库。
- Website 可回滚到同一 Dashboard 契约兼容的上一个已验证镜像/提交，且客户入口仍必须指向
  `https://dashboard.frontmind.net/login`。
- 任何支付结果不确定、内部接口不健康、Skill 缺失或健康检查返回 503 时，保持 Website
  新入口关闭，不继续开放流量。
