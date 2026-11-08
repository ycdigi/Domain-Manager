# 海外外链来源库与候选导入

来源漏斗现在管理来源、模板、轮询结果和网站外链候选。轮询只打开来源页面并记录可访问性，不提交表单、不登录、不检查 Google，也不把访问标记为已获得外链。

## 四批次审计矩阵

| 批次 | 交付范围 | 当前证据 | 边界 |
| --- | --- | --- | --- |
| 第一批 | `links.txt` 离线审查、来源导入、规范化模板、来源/候选/尝试 D1 模型与 API | `scripts/audit-link-sources.mjs`、`tests/link-sources.test.mjs`、v1.17/v1.18 迁移 | 不搜索、不请求第三方、不提交 |
| 第二批 | 来源人工审核、网站候选、提交地址预览、复制地址、人工尝试和证据 | `src/views/LinkSources.vue`、`src/components/WebsiteDetailDrawer.vue`、浏览器验收 | 只生成地址，不把地址生成当成成功 |
| 第三批 | AI 只读外链上下文，以及基于稳定候选 ID 的标题/描述/锚文本/备注回写 | `AI-SYNC-PROMPT.md`、`functions/api/ai/sync/index.ts`、AI API 测试 | AI 不改状态、不创建候选、不写尝试 |
| 第四批 | 跨入口状态不变量、尝试结果回写、来源失效联动、快照导入校验、生产迁移和全量验证 | `schema-migration-v1.19.0.sql`、导入校验、外链测试、全量测试 | 仍不启动 Cron、代理、自动请求或自动提交 |
| 来源轮询 | Mac Mini 本地浏览器执行网站 × 来源队列、断点续跑、结果汇总和漏斗筛选 | `scripts/link-source-review-worker.mjs`、`schema-migration-v1.20.0.sql`、来源页“导入轮询结果” | 只访问来源 URL，不提交、不登录、不声称获得外链 |

第四批的关键不变量是：候选状态不是普通文本字段。`待审核`、`待处理`、`已生成提交地址`、`已暂停`可以由候选管理入口维护；请求完成、提交待审核、被拒绝、来源失效、请求失败和需要人工处理必须由人工尝试记录产生。请求执行状态保留为“已完成/失败/需要人工”，目录结果单独保存为“已提交待审核/被拒绝/来源失效”。

## 来源状态

- 新来源默认是“待审核”“仅观察”“未启用”。
- 只有“已批准”且启用的来源，候选才能进入“待处理”。
- 来源模板使用 `{{target_url}}` 占位符；旧 `***` 模板导入时会转换。
- 占位符不能位于主机名中。
- 来源审查是离线解析，不请求来源页面。
- 来源轮询由 Mac Mini 本地浏览器执行，页面每次打开后停留 10–15 秒；每个活动网站与每个来源形成一个组合，当前 101 × 142 = 14,342 个组合。
- 组合进度保存在 Mac Mini 的本地状态文件中，D1 只保存一条最新运行汇总和每个来源的最终漏斗结果，不保存网站 × 来源明细。
- 轮询完成后，来源状态分为“建议保留”或“待删除”。“可访问”和“重定向”进入建议保留；404、受阻、超时和错误进入待删除。该结果不会自动批准或启用来源。

## 接口

- `GET/POST /api/link-sources`
- `PATCH/DELETE /api/link-sources/:id`
- `POST /api/link-sources/import`
- `GET/POST /api/link-sources/review`
- `GET/POST /api/websites/:id/link-opportunities`
- `PATCH /api/websites/:id/link-opportunities/:opportunity_id`
- `GET/POST /api/websites/:id/link-opportunities/:opportunity_id/attempts`
- `GET /api/ai/sync?website_id={id}` 返回该网站的外链候选上下文

来源、候选和尝试接口使用登录会话；轮询汇总接口也使用登录会话；AI 同步使用 API Token。没有外链提交接口。

AI 同步接口读取当前网站的候选、来源审核状态、处理模式、提交地址、人工尝试和证据；只允许更新已有候选的标题、描述、锚文本和备注，不会创建或删除来源、候选和尝试，不会改变外链工作流，也不会访问第三方站点。外链文案变化通过 `link_updates` 提交，并由 `applied.link_opportunities` 返回已保存的候选 ID。

第二批增加来源审核页和网站详情中的候选、提交地址预览、人工尝试与证据记录。提交地址只由已审核模板在浏览器中生成，所有参数会编码；页面不会加载、执行或代理第三方响应。

- 候选进入“待处理”前必须来源已批准且启用。
- 来源暂停、拒绝、失效或停用时，排队中的候选会转为“已暂停”；重新批准后需要人工重新设置状态。
- 只有“已完成”且带证据 URL 的人工尝试才能标记“已确认公开链接”。
- 结果为“来源失效”时，当前来源会停用，其他排队中的候选会暂停；不会自动恢复。
- 公开链接确认、提交结果和失败结果不会通过候选状态下拉直接写入。

## 离线审查

```bash
npm run links:audit -- --input ./links.txt --output ./link-sources-audit.json --csv-output ./link-sources-audit.csv
```

审查脚本会去重、检查协议、识别占位符、标记旧 HTTP、HTML 编码、异常标点和来源类型。输出结果不会自动批准或启用。

## 数据管理

外链来源、来源漏斗、网站候选和尝试记录包含在 JSON 快照和 Excel 导出中。生产 D1 已执行 v1.17.0、v1.18.0、v1.19.0、v1.19.1 和 v1.20.0。v1.19.0 为人工尝试增加目录结果字段，并回补旧候选的结果历史；v1.19.1 加固公开链接确认约束；v1.20.0 增加来源漏斗和最新轮询汇总。每次生产迁移前先备份，并按版本只执行一次。

## Mac Mini 轮询

Mac Mini 已配置本地后台执行器并随登录自动启动。日常操作只需要打开台账的“外链来源”页面，点击“开始轮询”；页面关闭后任务仍会继续。按钮会显示“停止轮询”，页面会定期显示执行状态。

本地执行器由 `scripts/link-source-review-agent.mjs` 提供，浏览器访问由 `scripts/link-source-review-worker.mjs` 完成。首次在其他 Mac Mini 安装时，使用下面的 LaunchAgent 文件安装后台服务：

```bash
cp scripts/com.ycdigi.domain-manager-link-review.plist "$HOME/Library/LaunchAgents/"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.ycdigi.domain-manager-link-review.plist"
```

按钮点击时会把当前台账登录会话安全地交给本机执行器使用，不需要手动填写 URL、Token 或 Node 命令。运行结束后，来源页的漏斗会显示“建议保留”和“待删除”；你可以继续用页面的删除按钮清理来源。
