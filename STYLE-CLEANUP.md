# Style Cleanup Record

本轮只记录已确认的样式迁移与清理，不重新设计视觉，不调用 Hallmark 重新设计。

| 旧规则 | 新规则 | 使用模板/组件 | 是否删除 |
| --- | --- | --- | --- |
| Home 私有 token 文件及其导入 | `src/styles/shared/tokens.css` 作为唯一 token 源，由 `shared/base.css` 导入 | Login、Home、三个业务弹窗 | 是，旧文件已不存在 |
| Home `base.css` 中的页面基础、焦点、按钮、弹窗通用规则 | `src/styles/shared/base.css`；Home 只保留台账布局 | Login、Home、DomainDialog、AlertConfigDialog、ImportDialog | 是，旧 `home/base.css` 已删除 |
| Home 的产品栏、容器、页脚规则 | `src/styles/shared/layout.css` 与 `AppHeader.vue`、`AppFooter.vue` | Login、Home | 是，Home 中重复规则已移出 |
| DomainDialog 与 AlertConfigDialog 各自的 `.dialog-footer` | `shared/base.css` 的 `.dialog-footer` | 两个编辑弹窗 | 是，组件内重复 style 已删除 |
| ImportDialog 模板内 style、硬编码浅色/暗色分支 | `src/styles/dialogs/import.css` 的语义 token | ImportDialog | 是，模板内 style 已删除 |
| Login 内联按钮宽度与旧卡片样式 | `src/styles/login/login.css` | Login | 是，模板内 style/inline style 已删除 |
| Home 移动端两个重复 `.table-action` 规则 | 一个合并规则，同时保留 `min-height` 和 `min-width` | Home | 是，重复选择器已合并 |
| ImportDialog `.upload-area` 与 Element Plus 同节点的重复宽度目标 | 只保留实际运行时的 `.el-upload`、`.el-upload-dragger`、`.el-upload-list` | ImportDialog | 是，重复目标已删除 |
| ImportDialog `h3`/`h4` 先设字号后覆盖字号 | `h3`、`h4` 分开声明字号 | ImportDialog | 是，覆盖规则已拆开 |
| Home 登出按钮和工具按钮各自重复 hover 色值 | 共用 hover 声明，保留各自背景、边框差异 | Home | 是，重复 token 映射已合并 |

## 保留项

- `.home-container` 下的 Home 台账规则保留；这些规则只服务真实 Home 字段、动态到期类和表格操作。
- `expiryClass()` 生成的 `expiry-warning`、`expiry-expired`，以及模板生成的 `status-online`、`status-offline` 保留；它们是运行时状态类，不是失效选择器。
- Element Plus 的 `.el-*` 选择器保留；这些类由组件库运行时输出，模板中不能只按源码静态字符串判断。
- `:deep()` 规则保留；它们用于 scoped 外部样式穿透 Element Plus teleport/组件 DOM。
- `html.dm-ui` 由根 HTML 启用，Home 使用 `.home-container` 作为页面边界。
- PHP、WordPress 输出类和其他页面模板：仓库没有 `.php` 文件、WordPress 模板或额外页面引用，因此没有猜测删除。
- `el-dialog__footer` 的通用框架选择器保留在共享层，避免对未从源码确认的 Element Plus footer DOM 做删除假设；业务 footer 的间距由 `.dialog-footer` 提供。

## Checks

- `rg` 扫描模板内 `<style>`、`style=`、`:style=`、动态 `:class`、`classList` 和所有 `.php`/WordPress 文件。
- PostCSS 扫描 6 个 CSS 文件：没有未定义 `var()`，39 个语义 token 各只有一份定义。
- 检查 Element Plus CSS 只在 `src/main.ts` 加载一次。
- `npm run build` 通过。
- 29 项 Home/业务回归、两个编辑弹窗移动端验证、7 项认证单元测试通过。
- `git diff --check` 通过；生产样式与代表页面回归无变化。

## Unverified

- 未连接真实 Cloudflare Pages/D1，无法从本地验证生产绑定指向的具体数据库。
- 500 的数据库错误正文依赖 Cloudflare Network/Functions 日志；本地 Wrangler 未登录，因此未读取远程 D1 元数据。
- 前端和 API 的用户 token 仍是现有 Bearer 设计；本轮只修复 D1 初始化说明和错误可见性，没有改认证协议。

## v2.1.0 全仓库清理

| 旧规则/旧代码 | 新规则/新入口 | 使用模板/组件/API | 静态引用证据 | 是否删除 | 验证方式 |
| --- | --- | --- | --- | --- | --- |
| `functions/api/addrec/index.ts` 旧写入接口 | `/api/domains`、`/api/ai/sync`、`/api/domains/batch` | 外部脚本、AI 同步 | 仓库无调用，仅旧 README 和鉴权分支 | 是 | `npm run lint:cleanup`、构建、认证测试 |
| `functions/[[path]].ts` 的 `/api/addrec` 鉴权分支 | `/api/check` 与 `/api/ai/*` 使用 API_TOKEN | 外部检查、AI 同步 | 路由列表和源码引用扫描 | 是 | middleware 认证测试 |
| Home、Import、AdSense、Resource、Detail 各自 `fetch`/401 解析 | `src/utils/request.ts` 的统一 JSON、上传、下载 API | 全部前端请求组件 | `rg fetch` 只保留公共请求层 | 是 | 构建、页面回归 |
| Axios 客户端与原生 fetch 并存 | 原生 fetch 公共客户端 | `src/api/domains.ts` 与所有组件 | `package.json` 不再包含 axios | 是 | `npm install --package-lock-only`、构建 |
| `dm-home-route` 根作用域和 Home 生命周期切换 | `html.dm-ui` + `.home-container` | Home、共享样式 | `rg dm-home-route` 无结果 | 是 | `npm run lint:cleanup`、多尺寸页面回归 |
| Home `.logout-button` 无引用规则 | 仅保留实际工具栏 hover 规则 | Home | 模板无 `logout-button` | 是 | CSS 类来源审计 |
| DomainDialog 模板内 `.form-hint` | `src/styles/dialogs/domain.css` | DomainDialog | 模板改为外置样式 | 是 | 构建、移动弹窗回归 |
| ResourceManager 多个 `style="width:100%"` | `.field-full` 组件样式 | ResourceManagerDialog | 模板无宽度内联样式 | 是 | 静态审计、弹窗回归 |
| 队列只允许三个域名字段 | 队列与 `/api/domains/batch` 同步支持状态、点击、SEO、操作日期 | Home、Detail、writeQueue、batch API | 字段白名单逐项匹配 | 是 | `test:data`、队列回归 |

### 保留项与原因

- `/api/check` 保留：仓库无法确认外部定时任务调用，属于公开自动化入口。
- `/api/domains/export` 保留：当前“更多 → 导出 JSON 备份”仍在使用。
- `/api/domains/batch` 保留：浏览器离线队列和 D1 批量写入依赖它。
- Element Plus `.el-*`、`:deep()`、动态状态类和运行时生成类保留：源码静态扫描无法替代组件运行时 DOM 验证。
- 凭据、资源、AdSense、AI 记录接口未删除：仍有页面入口和生产数据依赖。

### 自动审计

```bash
npm run lint:cleanup
```

审计内容包括：旧路由引用、唯一文档作用域、模板内联样式、CSS 类来源、共享 token 重复定义、队列与批量 API 字段一致性。
