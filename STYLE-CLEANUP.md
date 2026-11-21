# 当前清理约定

运行样式必须有模板、绑定、明确动态前缀或组件库生成来源。状态类不按名称前缀豁免。scripts/css-sources.mjs 解析来源，scripts/lint-cleanup.mjs 列出 Element Plus 生成类并检查已移除入口。

删除前搜索 src、functions、shared、脚本、测试、配置、工作流和文档。动态来源不明时先记录并解决，不能通过新增别名或覆盖样式绕过。替换调用方后删除旧实现。历史 SQL、夹具、ADR 和 docs/archive 与运行代码隔离。

本轮删除清单、每批验证和回滚见 docs/experience-cleanup.md。历史记录位于 docs/archive/2026-11-21-STYLE-CLEANUP.md。
