# Domain Manager

网站管理工作区，用于管理自营网站与企业客户网站的域名、托管、代码、任务、监控、收入与投入。基于 Vue 3、Element Plus、Cloudflare Pages、D1 和监控 Worker。

默认网站总表为十二列，保留 AdSense 账号／开通状态显示，服务器 IP 在部署资料中查看。技术栈、电脑和阶段可直接选择；数量及日点击可在单元格旁编辑，并记录统计日期。所有技术栈独立记录总页面数、计算器和文章数量；电脑归网站。账号关系与实际托管、仓库资源分别管理。网站详情按七个任务分区打开，编辑内容受到离开保护。

“网站管理”单独记录四类工作次数、最近时间和 GSC 账号归属；每次登记可查看历史、撤销，原按日操作记录保留。JSON 与 Excel 包含新记录与账号关联。规格和发布步骤见 [网站管理](docs/specs/website-management.md)。

## 项目文档

- [完整网站结构](docs/website-structure.md)
- [数据库结构与字段](docs/database-structure.md)
- [体验修正与删除证据](docs/experience-cleanup.md)
- [升级、归档和回滚](docs/cleanup-release.md)
- [网站监控](docs/website-monitoring.md)
- [提示词库与 Cloudflare 发布](docs/prompt-library-release.md)
- [AI 手动同步提示词](AI-SYNC-PROMPT.md)
- [现行设计规范](DESIGN.md)

## 本地开发与验证

```sh
npm ci
npm run dev
npm run build
npm run lint:cleanup
npx tsc --noEmit -p functions/tsconfig.json
npm run typecheck:monitor
node --test tests/*.test.mjs
```

浏览器回归使用现有 Python Playwright，运行 tests/portfolio-ui.py、batch-ui.py、resources-ui.py、finance-ui.py；监控回归通过 MONITOR_UI_URL 指定本地 Vite 地址。完整本地 Pages+D1 验收为 tests/portfolio-local-ui.py，仅允许写入 127.0.0.1。

## 配置与部署

Pages 项目为 domain-manager，构建 npm run build，产物 dist。D1 绑定名称 DB。登录需要 USER、PASS，AI 手动回写使用 API_TOKEN，凭据加密使用 CREDENTIAL_ENCRYPTION_KEY。这些值仅配置在服务端环境中。

监控配置为 wrangler.monitor.jsonc，生产环境显式使用 --env production。已有库不得重新运行 schema.sql；v1.24 库应在维护窗口备份、归档和演练后依次运行 v1.25.0、v1.26.0，再发布配套 Pages 和 Worker。新库才使用 schema.sql。

网站管理使用增量迁移 v1.27.0。上线前核对 `new_site_override`；仅缺失时补执行 v1.16.0。完整备份及副本演练要求见上述规格。

## 数据入口

GET /api/backups 导出 format_version=1 的网站管理数据；POST /api/backups 导入，同一路径 dry_run=1 只预校验。数据管理页提供 JSON 备份与多表 Excel。普通备份不含完整 Token、加密凭据、图标缓存、监控租约和巡检器运行状态。完整数据库备份另行保护保存。

旧数组备份和旧字段不再被运行接口接受；升级前完成一次转换与核验。历史 SQL、测试夹具、ADR 和 docs/archive 保留历史证据。

“网站管理”记录四类工作次数、最近时间和 GSC 账号归属，每次登记可查看历史和撤销；原按日操作记录保留。JSON 与 Excel 包含工作记录及账号关联。规格、迁移和验收边界见 [网站管理](docs/specs/website-management.md)。

网站管理使用增量迁移 v1.27.0。上线前核对 `new_site_override`；仅缺失时补执行 v1.16.0。完整备份及副本演练要求见上述规格。

批量网站设置与批次历史修正使用 v1.28.0 增量迁移；已有 v1.27 库先备份并演练，再运行 `db:migrate:v1.28.0`，随后发布配套应用。批量操作范围与验证记录见 [批量网站设置](docs/specs/website-bulk-settings.md)。

## 提示词库

侧栏「运营管理 → 提示词库」提供单条粘贴识别、分类、收藏、全文搜索与快捷复制。标题行可写 `【提示词标题】运营.重复任务自动化`，第一个英文点号分隔分类和标题；其后全部内容作为正文原样保存。正文中的反斜杠、转义、空行和缩进不做自动清理。可手动新增、修改和删除，分类删除只移动条目到未分类，遇到同名冲突时阻止操作。

网站总表头部「刷新」之后也可直接「新增提示词」，与提示词库共用收集弹窗；首页保存成功后保持当前页面、搜索与排序。弹窗支持分类新增和标题、分类、正文分别编辑，重名和保存失败会保留输入。

提示词与网站无关联，包含在统一 JSON 备份中（含分类、收藏与时间）；恢复预览显示同分类同标题的覆盖数量。未包含提示词数据的旧版本 1 备份不会删除现有提示词。设计决策见 [工作区提示词库](docs/adr/0016-workspace-prompt-library.md)。

已有 v1.30.0 数据库先备份并在副本演练，再运行 `npm run db:migrate:v1.31.0`，随后发布配套 Pages。迁移只新增两张表及索引，可重复运行。部署前不要将新版应用连接到尚未迁移的生产库。

验证：`npm run test:prompts`、`node --test tests/*.test.mjs`、`npm run build`、`npm run lint:cleanup`、`npx tsc --noEmit -p functions/tsconfig.json`。本地 Pages + 隔离 D1 启动后，使用 `PROMPTS_TEST_URL=http://127.0.0.1:8797 python3 tests/prompts-local-ui.py` 验收；仅允许本地地址，测试登录为 preview / preview-local-only，勿连接生产数据。
