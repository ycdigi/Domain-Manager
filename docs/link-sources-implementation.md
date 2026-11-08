# 海外外链来源库与候选导入

第一批只管理来源、模板和网站外链候选，不执行实时搜索、第三方请求或自动提交。

## 四批次审计矩阵

| 批次 | 交付范围 | 当前证据 | 边界 |
| --- | --- | --- | --- |
| 第一批 | `links.txt` 离线审查、来源导入、规范化模板、来源/候选/尝试 D1 模型与 API | `scripts/audit-link-sources.mjs`、`tests/link-sources.test.mjs`、v1.17/v1.18 迁移 | 不搜索、不请求第三方、不提交 |
| 第二批 | 来源人工审核、网站候选、提交地址预览、复制地址、人工尝试和证据 | `src/views/LinkSources.vue`、`src/components/WebsiteDetailDrawer.vue`、浏览器验收 | 只生成地址，不把地址生成当成成功 |
| 第三批 | AI 只读外链上下文，以及基于稳定候选 ID 的标题/描述/锚文本/备注回写 | `AI-SYNC-PROMPT.md`、`functions/api/ai/sync/index.ts`、AI API 测试 | AI 不改状态、不创建候选、不写尝试 |
| 第四批 | 跨入口状态不变量、尝试结果回写、来源失效联动、快照导入校验、生产迁移和全量验证 | `schema-migration-v1.19.0.sql`、导入校验、外链测试、全量测试 | 仍不启动 Cron、代理、自动请求或自动提交 |

第四批的关键不变量是：候选状态不是普通文本字段。`待审核`、`待处理`、`已生成提交地址`、`已暂停`可以由候选管理入口维护；请求完成、提交待审核、被拒绝、来源失效、请求失败和需要人工处理必须由人工尝试记录产生。请求执行状态保留为“已完成/失败/需要人工”，目录结果单独保存为“已提交待审核/被拒绝/来源失效”。

## 来源状态

- 新来源默认是“待审核”“仅观察”“未启用”。
- 只有“已批准”且启用的来源，候选才能进入“待处理”。
- 来源模板使用 `{{target_url}}` 占位符；旧 `***` 模板导入时会转换。
- 占位符不能位于主机名中。
- 来源审查是离线解析，不请求来源页面。

## 接口

- `GET/POST /api/link-sources`
- `PATCH/DELETE /api/link-sources/:id`
- `POST /api/link-sources/import`
- `GET/POST /api/websites/:id/link-opportunities`
- `PATCH /api/websites/:id/link-opportunities/:opportunity_id`
- `GET/POST /api/websites/:id/link-opportunities/:opportunity_id/attempts`
- `GET /api/ai/sync?website_id={id}` 返回该网站的外链候选上下文

来源、候选和尝试接口使用登录会话；AI 同步使用 API Token。没有外链尝试执行接口，也没有 Cron Worker。

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

外链来源、网站候选和尝试记录包含在 JSON 快照和 Excel 导出中。生产 D1 已执行 v1.17.0、v1.18.0、v1.19.0 和 v1.19.1。v1.19.0 为人工尝试增加目录结果字段，并回补旧候选的结果历史；v1.19.1 加固公开链接确认约束。生产执行 v1.19.0 前先备份，并确认远程尚未有 `result_status`；该迁移只执行一次。后续迁移均按版本脚本执行。
