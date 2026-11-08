# 海外外链来源库与候选导入

第一批只管理来源、模板和网站外链候选，不执行实时搜索、第三方请求或自动提交。

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

所有接口使用登录会话。第一批没有外链尝试执行接口，也没有 Cron Worker。

第二批增加来源审核页和网站详情中的候选、提交地址预览、人工尝试与证据记录。提交地址只由已审核模板在浏览器中生成，所有参数会编码；页面不会加载、执行或代理第三方响应。

- 候选进入“待处理”前必须来源已批准且启用。
- 来源暂停、拒绝、失效或停用时，排队中的候选会转为“已暂停”；重新批准后需要人工重新设置状态。
- 只有“已完成”且带证据 URL 的尝试才能标记“已确认公开链接”。

## 离线审查

```bash
npm run links:audit -- --input ./links.txt --output ./link-sources-audit.json --csv-output ./link-sources-audit.csv
```

审查脚本会去重、检查协议、识别占位符、标记旧 HTTP、HTML 编码、异常标点和来源类型。输出结果不会自动批准或启用。

## 数据管理

外链来源、网站候选和尝试记录包含在 JSON 快照和 Excel 导出中。生产 D1 已执行 v1.17.0；v1.18.0 增加来源 URL 与空模板的表达式唯一索引。后续环境升级前先备份，再执行 `npm run db:migrate:v1.18.0`。
