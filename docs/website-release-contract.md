# Website 镜像发布契约

Dashboard 仓库的 `docs/operations/RELEASE.md` 是唯一权威发布手册。本文只定义 Website
仓库与共享生产部署控制器之间的机器接口，避免 Website 发布误触 Dashboard、数据库或 PDF
基础镜像。

## CI 行为

- Pull Request 仅运行 `check`、Server tests、Client tests 和 release-flow，不推送镜像、不签名、不部署。
- `main` 的 push 在全部验证通过后构建 `ghcr.io/xiafanzeng/frontmind-website`，只部署
  `image@sha256:digest`，禁止使用 tag 作为发布身份。
- 镜像由 `.github/workflows/ci-release.yml` 通过 GitHub OIDC 和 Cosign 无密钥签名。
- Website 公钥在 `authorized_keys` 中固定到 Website controller，原始 SSH 命令只接受两个 token：

  ```text
  ghcr.io/xiafanzeng/frontmind-website@sha256:<64 lowercase hex> <40 lowercase Git SHA>
  ```

## GitHub 配置

仓库只需要一个 Actions Secret：

- `WEBSITE_DEPLOY_SSH_PRIVATE_KEY`：专用 deploy key；对应公钥必须在服务器
  `authorized_keys` 上绑定 Website forced-command，不能获得任意 Shell。

生产主机 `149.88.85.148`、端口 `22`、用户 `frontmind-deploy` 和已人工核验的 ED25519
host key 都是公开的发布策略，不是秘密；它们固定在 workflow 与
`.github/deploy/production_known_hosts` 中，随代码评审。workflow 禁止运行时 `ssh-keyscan`
或关闭 host-key 校验，也不再依赖容易漂移的 Repository variables。

任何进入 `main` 的提交在 CI 全绿后自动构建、签名并调用服务器 controller；普通发布不再有
`WEBSITE_AUTO_DEPLOY_ENABLED` 开关或额外人工审批。若 `state.json` 尚不存在，controller
只允许从一个 source SHA/digest 与本机/公网 readiness 自洽的健康运行态完成一次首次签名
镜像接管。当前 SHA 可以不同于候选，但候选必须是本次 `main` workflow 签名且 OCI revision
精确匹配；错误签名或 readiness 不一致都失败关闭。

GHCR 发布使用 GitHub 自动提供的 `GITHUB_TOKEN`，workflow 权限限制为 `packages: write` 和
签名所需的 `id-token: write`，不配置长期 GHCR 写入或读取令牌。部署 step 通过 SSH stdin
只发送两行 `github.actor + GITHUB_TOKEN`；token 不进入 SSH 原始命令、参数或日志。

## 服务器控制器约束

共享控制器安装在 `/usr/local/sbin`，Compose 项目放在
`/opt/frontmind-deploy`。Website 处理器必须在任何 pull 或 Compose 变更前：

1. Website 公钥只能绑定 `forced-command website`，与 Dashboard 使用不同密钥；严格解析两个
   token，镜像仓库只能为 `ghcr.io/xiafanzeng/frontmind-website`，引用必须为 SHA-256 digest。
2. 使用 `flock /run/lock/frontmind-website-deploy.lock` 串行化发布；无法立即取得锁时失败，
   不能排队覆盖较新的发布。
3. 执行 Cosign 验签，issuer 固定为 `https://token.actions.githubusercontent.com`，证书 identity
   固定为
   `https://github.com/xiafanzeng/frontmind-website/.github/workflows/ci-release.yml@refs/heads/main`。
   普通 forced-command 发布必须先从 stdin 严格读取 actor 和 job-scoped token 两行，在
   root-only 的 `/run` 临时 `DOCKER_CONFIG` 中登录 GHCR；验签和 pull 完成后立即删除该目录，
   不读取或回退到 `/root/.docker/config.json`。缺失、畸形、多余或未关闭的输入必须在验签前
   阻断。受限 forced-command 的首次签名接管、root-only 兼容 bootstrap 和维护入口
   彼此保持独立。
4. 用 root-only 临时 image env 只重建 Website Compose 服务，readiness 成功后才原子
   替换活跃 image env；不得调用数据库、Dashboard 或 PDF 镜像步骤。
5. 为整次 rollout 建立一个 120 秒总 deadline；候选镜像最多使用前 90 秒检查
   `http://127.0.0.1:8888/readyz` 和公网 `/readyz`，并核对 `buildSha` 等于命令中的 Git SHA。
   `imageDigest` 也必须精确等于本次候选（或回滚）digest，同一源码的其他重建镜像不会被误认为当前版本。
   镜像自身的 Docker healthcheck 只负责容器运行状态，不形成另一套发布门禁。
6. 成功后原子更新 `/var/lib/frontmind-deploy/website/state.json`。状态只包含
   `currentDigest`、`previousDigest`、`sourceSha`、`journalHash`、`deployedAt`、
   `lastResult`；Website 的 `journalHash` 固定为 `not-applicable`。写入使用同目录临时文件、
   `chmod 0600` 和原子 rename。
   控制器成功返回后，CI 才给同一精确 digest 添加一次性的
   `deployed-v1-<UTC>-run-<id>-attempt-<n>-sha256-<digest>` 标记，并移动
   `deployed-current` / `deployed-previous`；digest 写在标记内，因此被复制到其他 manifest
   的伪标记不会被轮转器信任。
7. 任一检查失败时立即恢复 `previousDigest`，并只使用总 deadline 的剩余时间等待；回滚也失败时
   保留事故状态和日志并返回非零，禁止把失败 digest 写成 current。回滚不会在候选超时后重新
   获得另一段 120 秒。

Compose 项目固定从 `/opt/frontmind-deploy/website` 加载，运行镜像不挂载源码或 `dist`。
服务器仅保留 current/previous 两个 Website 镜像；
`.github/workflows/registry-retention.yml` 每周按可信部署标记保留最近 10 个成功部署，也可手工
触发，但它不参与发布审批。轮转同时保护 current/previous 和可识别的 Cosign signature、
attestation / SBOM 关联版本。GitHub Packages API 不能可靠表达全部 OCI referrer 关系，也
不能区分“构建失败”和“部署成功但 marker 写入失败”，所以未知 tag、untagged artifact 与
未晋级构建保守保留。GHCR 的物理版本数可能大于 10，但这些额外版本不会占用“最近 10 个成功
部署”的名额；可信成功历史达到 10 个以前不删除旧版本，避免误删切换流程前的
current/previous。

## 运行时探针

- `GET /healthz` 只返回进程存活、服务名、构建 SHA 和镜像 digest，不访问上游或持久卷。
- `GET /readyz` 检查六个运行时 Skill、Agent/项目订单/支付回执依赖、自定义问题持久卷和访问统计
  持久卷；失败返回 503。响应同时携带 `buildSha` 和 `imageDigest`。两个持久卷都执行无损读写探针。
- 生产进程在监听端口前执行与 `/readyz` 相同的深度 preflight，因此新容器依赖不完整时不会
  被部署控制器接纳。
- 构建期 `artifact-manifest.json` 只用于镜像内容审计；运行时不执行全量文件哈希，也不接收
  approval SHA 或 artifact-root 环境变量。

## 日常调用

唯一权威教程仍是 Dashboard 仓库的 `docs/operations/RELEASE.md`。在任一 FrontMind 工作区
完成修改后，可直接让 Codex 执行：

```text
使用 $frontmind-release 把当前 FrontMind 修改验证、提交并上线；expand 自动，删表/contract 先让我审核。
```

Skill 会等待 Website 精确 SHA 的 CI 和签名 digest 自动部署，并以 Website 与 Dashboard
两个工作区都干净且同步、Website 本机/公网 readiness 精确匹配作为完成条件。
