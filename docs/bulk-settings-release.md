# 批量网站设置发布记录

日期：2026-11-22。

## 发布前验证

- 全量 Node / SQLite 测试 181 项通过；构建、Functions 与监控类型检查、清理检查、Pages Functions 编译通过。
- 本轮重跑总表、批量设置和批次浏览器回归通过。其他页面及本地 Pages + D1 实际写入验收见 `specs/website-bulk-settings.md`。
- GitHub Issues 当前关闭，规格与验收记录保存在仓库文档中。

## 生产 D1

- Pages 自动构建暂时关闭，维护部署 `0e54e62d` 的 HTTP 503 已核实。原生产 Pages 为 `7bce6c40-0474-4507-9318-aeaf453cbd84`，对应提交 `01057f49a0787a9e35f96339172b7461a0bf61c0`。
- 最终完整备份：`backups/bulk-settings-release-20261122/final-before.sql`，SHA-256 为 `7d2cb31d5e2a8509a704bb721d84852215b108a0de9ac89e785d46d74b34bf82`。备份与报告只保存在受保护的本地目录，不提交 GitHub。
- 使用最终备份演练 v1.28 迁移及完整 SQL 恢复，原始值与成员序列保留，完整性 ok、外键无错。
- 线上仅执行 `schema-migration-v1.28.0.sql`，未重新初始化数据库。迁移后再次完整导出，与演练库逐表逐值核对所有业务数据通过；持续变化的四张监控运行表单独排除。
- 网站 122、域名 122、批次 1、成员历史 13、网站账号关系 32、旧操作记录 21、工作登记 2 全部保留。部分唯一索引生效、临时迁移表不存在，完整性 ok、外键无错。
- 具体演练与生产比对报告分别为本地 `final-rehearsal.json` 和 `production-data-report.json`。本次迁移不改变监控 Worker 结构和代码。

## Pages 验收

配套应用通过 GitHub main 和 Pages 生产部署发布；发布后核对提交标记、生产页面与入口静态资源一致、登录保护及可用浏览器会话。最终部署标识与实测结果在发布完成后补充。

生产业务写入交互、Safari / Firefox 与多客户端并发压力不作为本次已验证项目；本地真实 Pages + D1 写入已覆盖批量设置与导入。
