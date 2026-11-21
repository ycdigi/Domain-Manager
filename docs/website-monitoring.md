# 网站监控

生产监控 Worker 每分钟选择一个到期网站；每站默认十二小时检查，连续两次失败（间隔五分钟）形成异常事件，检查历史保留三十天。配置仅为自动监控开关和允许跳转主机名。

GET 检查限制整个过程十秒、重定向次数和公网主机，最多读取前 64 KiB HTML 解析页面标题，遇到标题结束或正文开始即取消剩余响应体。标题纯文本展示，缺失或读取失败不会改变已经获得的 HTTP 结果。HTTP 正常只表示可访问。

状态为 unchecked、healthy、pending、failure，disabled 由开关、网站状态和主域名派生。旧正文规则、标题基线和内容完整性不属于当前 schema；升级前完整归档旧结果，不能伪造为正常或故障。

只使用 workers/monitor.ts 和 wrangler.monitor.jsonc。生产部署显式指定 --env production；预览监控关闭。部署和恢复步骤见 cleanup-release.md。检查通过租约和配置版本防止并发，主域名或配置变化后拒绝迟到结果。
