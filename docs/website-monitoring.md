# 网站监控部署与使用

网站界面和 API 继续部署在 Cloudflare Pages；巡检运行在独立 Worker，两者绑定同一个 D1。无需 Telegram、邮件服务或单独服务器。

## 检查规则

每个启用的网站约每 12 小时检查一次 HTTPS 主域名首页。为优先使用免费额度，Worker 每分钟处理一个到期网站，不并发抓取；一百个首次检查目标约需一百分钟。暂停、停止经营和没有主域名的网站不自动检查，手动检查仍可使用。

只有最终 2xx 表示可访问。HTTPS 失败不会回退 HTTP；最多跟随三次跳转。主域名和 www 默认互认，跨域跳转需在网站详情中配置允许的主机名。HTTP 降级、未认可的跳转、HTTP 错误先标记待确认，五分钟后复查；连续两次失败记录异常事件，后续成功自动记录恢复。同一事件持续期间不重复提醒，标为已读不代表故障已恢复。

检查在每一跳发送 GET 请求，每个响应最多读取前 64 KiB HTML；遇到真正的 `</title>`、`</head>` 或 `<body>` 即停止读取并取消剩余响应体，不做全文检查。标题按响应字符集解码（默认 UTF-8），解码 HTML 实体、折叠空白后最多保留 1000 个字符。单次检查总超时十秒，覆盖跳转及标题读取。配置仅包含自动监控开关和允许跳转的主机名，不提供关键词、标题基线或标题变化确认。页面标题可辅助人工识别停放或到期页面，系统不自动猜测停放状态，也不判断网站内容是否被篡改；最终 2xx 仅显示“响应正常”，不能证明网站安全或未被攻击。

复用已有 `title` 字段保存页面标题，无需数据库迁移。未获取到标题时仅返回 `title: null`，界面显示“未获取到标题”；标题读取错误或响应体过慢不改变已有 HTTP 结果，也不产生“内容检查未完成”状态。旧版正文规则、标题基线和内容完整性字段仍保存在后端及备份中以保持兼容，但不再参与检查；`content_complete` 继续为 false。新检查仅返回正常或失败。历史记录保留原值，旧 `review` / `incomplete` 结果显示“旧检查/待重新检查”，旧内容原因显示“旧版内容检查”；当前状态不重复显示旧内容原因，等待新 HTTP 检查更新。

网站监控列表在网站信息后单列展示页面标题，详情展示最新页面标题，最近一百条检查历史也包含页面标题；标题均以纯文本完整换行显示，不执行标题中的 HTML。页面还展示上海时间、HTTP、耗时、异常原因、下次检查及事件。检查历史保留三十天，故障事件随网站保留，删除网站时一起删除。监控配置通过数据库触发器随主域名变更更新，页面轮询只读取数据；到期的失败复查优先于首次检查。导航标记未读事件；巡检器超过十分钟没有完成记录时提示检查部署。

## 生产部署

1. 确认目标账号、数据库、Pages 项目，并备份旧库：

   ```sh
   npx wrangler whoami
   npx wrangler d1 list
   npx wrangler pages project list
   npm run db:backup:remote
   ```

2. 对已有数据库执行增量迁移；新库只需初始化完整 `schema.sql`：

   ```sh
   npm run db:migrate:v1.22.0
   ```

   此迁移仅增加监控表及索引，可重复执行。不要用初始化 schema 替换现有数据库。

3. 确认 `wrangler.monitor.jsonc` 的 `production` 数据库 ID 与 Pages 的 `DB` 绑定相同。仓库中生产配置指向本项目的 `domains-db`；Fork 部署必须替换为自己的数据库 ID。

4. 验证并部署 Pages：

   ```sh
   npm run test:monitor
   npm run build
   npm run deploy:pages
   ```

   现有 Pages 的 `USER`、`PASS`、`API_TOKEN`、`CREDENTIAL_ENCRYPTION_KEY` 和 `DB` 配置沿用。

5. 检查 Worker 打包和绑定，然后部署定时巡检：

   ```sh
   npx wrangler deploy --config wrangler.monitor.jsonc --env production --dry-run
   npm run deploy:monitor
   ```

   Worker 无公开 HTTP 入口，无需 API Token；直接通过 D1 绑定写入。Cloudflare Cron 使用 UTC，每分钟触发。Cron 配置传播可能需要一段时间，首次部署后确认平台中的触发器及日志。

6. 登录“网站监控”：确认巡检器完成时间更新、主域名逐批获得检查记录。可对单站使用“立即检查”。通过以下只读查询排查：

   ```sh
   npx wrangler d1 execute domains-db --remote --command "SELECT last_started_at,last_completed_at,last_error FROM monitor_runner;"
   npx wrangler tail --config wrangler.monitor.jsonc --env production
   ```

旧 GitHub workflow 已移除定时触发，只保留手动运行；旧 `/api/monitor/status` 接口继续兼容，但不能写入新的监控判断和故障事件。不要同时启用两套定时巡检。

## 预览、开发和停用

预览必须创建独立数据库 `domains-db-preview`，初始化 `schema.sql`，替换 `preview` 环境中的数据库 ID。Pages Preview 的 `DB` 也绑定预览库。默认配置和 preview 均没有 Cron，`MONITOR_ENABLED=false`，部署不会启动自动巡检。

```sh
npx wrangler d1 create domains-db-preview
npx wrangler deploy --config wrangler.monitor.jsonc --env preview
```

本地验证定时处理器可以使用独立预览配置：

```sh
npx wrangler d1 execute domains-db-preview --local --config wrangler.monitor.jsonc --env preview --file schema.sql
npx wrangler dev --config wrangler.monitor.jsonc --env preview --test-scheduled --var MONITOR_ENABLED:true
```

然后访问 Wrangler 提示的本地端口 `/__scheduled`。这只是本地测试入口，不会创建生产 HTTP 接口。Worker 源码包含在 `tsconfig.monitor.json` 中，使用 `npm run typecheck:monitor` 检查。

停用生产巡检：将 production 的 `MONITOR_ENABLED` 设为 `false` 并移除 production 的 Cron，然后重新部署 Worker。Pages 仍可查看历史及手动检查。

## 配额与恢复

按每站每天两次检查设计，每分钟单站批次限制 CPU、外部请求及 D1 查询数量，到期故障复查优先。GET 仅读取每个响应前 64 KiB，遇到标题结束、head 结束或 body 开始提前停止，限制标题提取的开销。实际 CPU、请求和 D1 配额以 Cloudflare 控制台为准。本次选择不升级套餐，部署后可在 Cloudflare 日志核对 CPU 与执行结果。

JSON 备份包含监控配置、检查历史及事件；文件导入上限为 20 MiB，历史通过分块批量写入恢复。恢复时映射网站与域名，清除运行租约，不导入旧巡检器心跳，重新安排检查。这样恢复后的站点不会因为旧锁永久跳过检查，也不会把旧部署的运行时间当成新部署心跳。

## 历史验证（旧版正文检查）

以下测量来自已停用的正文扫描实现，不作为当前 GET 前缀标题提取的验收或性能数据。

2026-11-12 在独立临时 D1 和 Worker 中验证了真实 Cron 触发、HTTP 请求、D1 检查记录及心跳写入。免费优先版本每分钟单站、合并两次 D1 调用后，正常页面及复杂页面的完整巡检抽样 CPU 分别为 7 ms 和 9 ms，结果均成功；这是样本测量，不是所有页面和冷启动的 CPU 上限承诺。复杂样本返回内容检查未完成，没有误报关键词缺失。生产数据库及生产部署未在此次验证中修改，临时资源验证后删除。
