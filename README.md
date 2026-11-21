# Domain Manager

网站管理工作区，用于管理自营网站与企业客户网站的域名、托管、代码、任务、监控、收入与投入。基于 Vue 3、Element Plus、Cloudflare Pages、D1 和监控 Worker。

默认网站总表固定十二列。所有技术栈独立记录总页面数、计算器和文章数量；电脑归网站。账号关系与实际托管、仓库资源分别管理。网站详情按七个任务分区打开，编辑内容受到离开保护。

## 项目文档

- [完整网站结构](docs/website-structure.md)
- [数据库结构与字段](docs/database-structure.md)
- [体验修正与删除证据](docs/experience-cleanup.md)
- [升级、归档和回滚](docs/cleanup-release.md)
- [网站监控](docs/website-monitoring.md)
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

## 数据入口

GET /api/backups 导出 format_version=1 的网站管理数据；POST /api/backups 导入，同一路径 dry_run=1 只预校验。数据管理页提供 JSON 备份与多表 Excel。普通备份不含完整 Token、加密凭据、图标缓存、监控租约和巡检器运行状态。完整数据库备份另行保护保存。

旧数组备份和旧字段不再被运行接口接受；升级前完成一次转换与核验。历史 SQL、测试夹具、ADR 和 docs/archive 保留历史证据。
