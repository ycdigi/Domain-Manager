# 提示词库与 Cloudflare 发布记录

日期：2026-11-27（Asia/Shanghai）。

## 本次范围

发布当前仓库全部待提交的提示词收集、分类、收藏、复制、共享弹窗，以及列表/页脚/焦点修正。此前其他对话的网站阶段、维护入口、账号选择、批量设置等提交已在 `origin/main`，不重新移植或覆盖。

## D1 与 Cloudflare

- 生产库：`domains-db` / `92f8fb6b-9bde-4c9c-a3df-446834e00d8e`。保留 APAC 区域和已有数据；生产的登录、API Token、凭据加密密钥不改变。
- 迁移前完整 SQL 与 Time Travel bookmark 保存在被 Git 忽略的 `backups/prompt-library-release-20261127/`；目录 0700，备份/配置/预览密钥文件 0600。
- `scripts/rehearse-prompt-library.py` 在完整生产副本执行两次 v1.31，并验证原值、表结构、外键、完整性及完整 SQL 恢复。生产只执行增量迁移 v1.31，不重跑 schema.sql。
- 新建空预览库 `domains-db-preview` / `b00f4ca0-eb41-48d2-9a30-275ae134dd64`。预览原来的普通文本 `DB` 改为实际 D1 绑定，独立初始化 29 张业务表；未复制生产业务数据。
- 预览使用独立随机 PASS、API_TOKEN、CREDENTIAL_ENCRYPTION_KEY，密钥只保存在 Cloudflare Secrets 和忽略的本地保护文件中。生产与预览的 `fail_open` 均关闭。
- Pages 项目 `domain-manager` 保持 GitHub `ycdigi/Domain-Manager` / `main` 自动发布，构建 `npm run build`、输出 `dist`、兼容日期 `2026-10-30`。Pages 运行配置仍由 Cloudflare 项目管理，没有新增第二套 Pages Wrangler 配置覆盖远端密钥。
- `wrangler.monitor.jsonc` 补齐真实预览库 ID。预览巡检继续关闭且无 Cron；本次没有改动或重发生产巡检 Worker。

## 后续操作入口

```sh
npm run db:backup:remote
python3 scripts/rehearse-prompt-library.py --input backups/完整备份.sql --output backups/新的演练目录
npm run db:migrate:v1.31.0
npm run db:verify:remote
npm run db:verify:preview
npm run deploy:preview
npm run deploy:pages
```

备份文件自动带时间，权限 0600，常规输出不打印 Wrangler 的临时签名下载链接。验库命令检查当前全部业务表、关键字段、提示词唯一索引和外键；出错返回非零状态。手动发布先验生产库，`deploy`、`deploy:full` 统一走该入口，避免旧 `deploy:full` 调用远程建库脚本。`db:init:remote` 仅供明确的新库初始化。

Cloudflare Git 集成的构建命令仍为 `npm run build`，推送含迁移的版本前须先完成备份、迁移和验库；不把远程管理员令牌注入构建流程。

## 验证与边界

全量 263 项 Node/SQLite 测试、应用构建、清理检查、Functions/Monitor 类型检查与 Pages Functions 编译通过。真实本地 Pages+D1 提示词三组验收、12 路由 × 5 宽度、共享长内容与页脚回归通过，详见 `qa/2026-11-27-workspace-layout.md`。

生产迁移后验库通过：144 个网站、144 个域名、7 条加密凭据；提示词与分类表存在，初始均为空，外键无错。迁移后已再次完整导出并核对。除两个网站的 stage 值在发布期间变化外，其余旧业务字段逐值一致，数量不变；v1.31 SQL 只建表和索引，不触及 websites，未用旧备份回滚这两处值。完整性 ok、外键无错，监控运行表和图标缓存另记正常运行变化。报告保存在保护备份目录。首次迁移后导出遇到暂时失败，核对后重试成功。生产部署、预览真实 API 与线上静态资源验证结果在发布后补充。

未把本地/fixture 回归等同于已登录生产业务写入验收；Safari、Firefox 与多客户端并发压力未验证。GitHub Issues 当前关闭，需求及发布证据保留在仓库文档。
