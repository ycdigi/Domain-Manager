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

- `html.dm-home-route` 下的 Home 台账规则保留；这些规则只服务真实 Home 字段、动态到期类和表格操作。
- `expiryClass()` 生成的 `expiry-warning`、`expiry-expired`，以及模板生成的 `status-online`、`status-offline` 保留；它们是运行时状态类，不是失效选择器。
- Element Plus 的 `.el-*` 选择器保留；这些类由组件库运行时输出，模板中不能只按源码静态字符串判断。
- `:deep()` 规则保留；它们用于 scoped 外部样式穿透 Element Plus teleport/组件 DOM。
- `html.dm-ui`、`html.dm-home-route` 保留；前者由根 HTML 启用，后者由 Home 挂载生命周期管理。
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
