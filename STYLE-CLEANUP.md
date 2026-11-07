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

## 2026-11-05 Dashboard 呈现层优化

| 旧规则/入口 | 新规则/入口 | 引用与证据 | 删除/保留 | 检查 |
| --- | --- | --- | --- | --- |
| shared/base 手机端 label 的 inline width / margin-left `!important` 覆盖 | 既有 el-form 设置 label-position=top | 所有现有组件表单；script sections 无变化 | 删除旧覆盖 | 表单错误和 320/390px 检查 |
| Home 独立 `.el-table` 颜色、cell 内边距、表头等公共配方 | shared/base 统一账户、资源和域名表 | Home + Ads/Resource 表使用 Element Plus | Home 仅留密度与状态特例 | build / 数据回归 |
| Home `.registrar-link`、expiry/status 旧展示类、`.not-applicable` | 当前 tab 表格没有这些模板节点 | 检查所有 Home 动态 class，API 只返回数据不生成这些类 | 删除 Home 确认无引用规则；其业务字段仍在详情/导出 | lint:cleanup + 源码引用核对 |
| `.el-table__fixed-body-wrapper` 旧版本结构选择器 | 当前 `.el-table__body tr`，包含 fixed td | 已安装 Element Plus 使用 sticky 单元格，没有旧容器 | 删除旧容器配方 | 浏览器行色/固定列 |
| 首部历史 Hallmark 注释与已撤销品牌头、footer 的描述 | 当前 stamp 和根 DESIGN.md | 当前 Home 无 header/footer 树 | 替换失效说明，不删功能节点 | 差异检查 |
| 资源 `.resource-manager-dialog .credential-* / .field-full` | scoped `.credential-* / .field-full` | append-to-body 的嵌套弹窗不在父 dialog DOM 内 | 替换失效祖先前缀 | Token/账号子弹窗 |
| `resources.css` 手机端 width `!important` | shared overlay max-width | 所有 el-dialog 统一屏幕安全边距 | 删除重复覆盖 | 320/390/768px |
| Home 重复框架样式/尾部断点叠加 | 一份有序 home.css | 只由 Home.vue 导入 | 原位替换，不追加新覆盖文件 | lint:cleanup / diff |
| base 现有 reduced-motion 强制缩短动画 | 原 reduced-motion 规则 | Element Plus 动画依赖 | 保留；不是为覆盖视觉冲突追加 | 减少动态偏好 |
| Element Plus `.el-*`、`:deep()`、动态 SEO/行色类 | 保持实际运行来源 | 组件库生成/teleport/scoped 内部节点 | 保留，无法按静态模板名删 | UI 回归 |

设计参考读取结果、选择范围与不适用部分见根 DESIGN.md；两份来源都是营销系统，不声明有未经验证的后台导航/筛选设计。此次除 Home 新增固定列的响应式呈现监听外，Vue 业务 script 内容与基线一致，后端/路由/HTML/SEO/数据结构不在差异中。

## 2026-11-05 用户指定蓝色主色

- 旧绿色 accent → `brand: rgb(0,112,249)` 与派生 accent：共享主按钮、登录、保存、链接、焦点和 Element Plus 状态复用唯一 token，未增加组件覆盖。
- 中性选中标签 → 浅蓝选中态：仅替换原 `.platform-tabs button.active` 规则，无重复选择器。
- success / warning / error 与近期操作浅绿行保留，避免将业务状态误当品牌色。
- 精确主色搭配白字对比度约 4.48:1，填充色混合 2% 黑色后约 4.64:1；链接使用更深的派生蓝。

## 2026-11-05 左侧工作区导航

- 顶部重复管理入口 → `WorkspaceNavigation.vue` 的网站/管理分组：继续调用原有平台筛选、资源、AdSense、通知、JSON 备份和登出处理；删除 Home 工具栏中的重复入口。
- 原平台标签 → 桌面左栏与移动抽屉：复用 `platformTab`、`platformTabs`、`platformTabCounts`，不新增筛选逻辑。
- 原概览收起状态 → 保持独立：左侧导航的收起记忆使用单独 localStorage key，概览的 `sidebarCollapsed` 和数据逻辑不混用。
- 新增 `src/styles/home/navigation.css`：仅负责导航外观和响应式，不覆盖弹窗、表格或业务状态样式。
- 验证：六种视口、三类管理弹窗、技术栈切换、搜索/排序保持、空/错状态、键盘 Escape 和焦点回归。

## 2026-11-05 管理工作区页面化

| 旧实现 | 新实现 | 删除依据与保留边界 |
| --- | --- | --- |
| ResourceManagerDialog 及 resources.css | Resources 路由页 + workspace 公共样式 | 原维护字段、API、确认保留；移除外层与嵌套管理弹窗及重复布局 |
| AdsenseManagerDialog 及 adsense.css | Adsense 路由页 | 账号与收入 API 复用，页内编辑；加载后回填月份金额 |
| AlertConfigDialog | Notifications 路由页 | 原字段与校验迁移，保存失败保留输入 |
| ImportDialog | ImportPanel + 数据管理页 | 保留上传/预览/确认接口，明确分步预览，去除弹窗外壳 |
| Home 持有侧栏与管理弹窗开关 | WorkspaceLayout + 嵌套路由 | 保留平台筛选、排序、域名抽屉与短编辑；管理开关及旧导航样式已删除 |
| Home 重复 Excel/JSON 生成逻辑 | downloads 共享入口 | 首页、数据页及侧栏备份使用同一下载函数 |
| 管理保存整体 reloadAll | 会话读缓存 + 关联失效 | 按原 GET 接口缓存与去重；变更仅标记受影响数据，凭据不缓存 |

已确认源代码无旧组件导入；动态 Element Plus 类、域名短表单与详情样式继续保留。测试引用随迁移指向页面实现，新增缓存行为与路由去重实现检查。

## 2026-11-06 操作反馈与表格动作清理

| 旧规则/入口 | 新规则/新入口 | 使用模板/组件 | 删除/保留 | 验证方式 |
| --- | --- | --- | --- | --- |
| Home 独立 SEO 表头与单独 SEO 列 | SEO 状态按钮/锁定图标放入域名单元格，复制按钮紧随其后 | `src/views/Home.vue`, `home.css` | 删除独立列，保留 15 天状态逻辑 | 结构检查、Playwright SEO/复制交互 |
| 刷新按钮隐式触发状态检测 | 刷新只读数据；独立“检测网站状态（N）”固定当前结果并限并发 4 | `Home.vue`, `/api/domains/check` | 保留既有单域检查路由，拆分用户意图 | fixture 请求断言、失败继续检查 |
| 队列调用方无成功/待同步区分 | `FlushResult`、全局同步状态、失败重试和待同步视图覆盖 | `writeQueue.ts`, `WorkspaceLayout.vue` | 替换提示逻辑，不新增第二套队列 | 数据测试、离线/失败/重试浏览器测试 |
| 重新加载直接覆盖本机未同步值 | 读取后应用 `applyPendingDomains()` | `writeQueue.ts`, `Home.vue` | 保留本地队列格式，增加视图叠加 | 队列单测与刷新 fixture |
| 无变化仍刷新点击/内容统计日期 | 日期由 `dataFreshness.ts` 按实际值变化计算 | `DomainDialog.vue`, `Home.vue` | 删除重复的“每次提交即今天”规则 | 34 项数据测试 |
| 收入、凭据、详情迟到响应可回填旧上下文 | 保存状态、原生禁用/ARIA、版本与上下文校验 | `Adsense.vue`, `StableNumberInput.vue`, `Resources.vue`, `DomainDetailDrawer.vue` | 保留接口，丢弃过期响应 | 延迟响应浏览器测试 |

## 2026-11-06 到期状态、类型字段与账号表单

| 旧规则/入口 | 新规则/新入口 | 使用模板/组件 | 删除/保留 | 验证方式 |
| --- | --- | --- | --- | --- |
| Home 以 `registrar_date` 显示“注册时间” | 以 `expiry_date` 显示“到期日期”，注册日期留在详情与导出 | `Home.vue`, `home.css` | 替换主表展示，不删除数据字段 | 到期字段测试与浏览器回归 |
| SEO/近期操作背景可能覆盖到期风险 | `row-expired` / `row-expiring` 优先，分别使用强/弱浅红整行背景 | `Home.vue`, `home.css` | 保留原状态计算，调整优先级 | 过期、30 天内、普通行检查 |
| 行业可动态扩展旧值 | 类型固定为计算器、资讯站、其他；旧值展示归入其他 | `Home.vue`, `DomainDialog.vue`, `domain-validation.ts`, import/AI API | 删除动态选项和自定义写入口；保留底层 `industry` 列兼容 | 35 项数据测试、API 校验 |
| 资源账号表单把服务商作为普通字段并与备注并排 | 服务商上下文徽标、说明、双列核心字段、整行备注和独立操作区 | `Resources.vue`, `workspace.css` | 删除旧错位布局 | 桌面/移动工作区回归 |
| 桌面沿用 13/14px 密集文本 | 1024px 以上提升正文、表格和控件字号；移动端不放大 | shared/base, home, workspace styles | 增加单一响应式字号规则，不追加组件覆盖 | build、Playwright 多尺寸 |

## 2026-11-06 AdSense 收入字段扩展

| 旧规则/入口 | 新规则/新入口 | 使用模板/组件/API | 删除/保留 | 验证方式 |
| --- | --- | --- | --- | --- |
| 月收入只有旧 `amount` 和备注 | `amount_usd` 为主金额，增加可空 `amount_cny`、`transfer_date`；旧 `amount` 继续同步兼容 | `Adsense.vue`, `/api/adsense/income`, `adsense_income` | 保留旧列兼容，新增 v1.9.0 字段 | 迁移测试、构建、数据回归 |
| 收入只能按账号查看（截至 v1.14） | `adsense_income_domains` 保存可选的网站美元明细 | AdSense 月收入表单、收入 GET/POST、Excel 快照 | v1.15 将历史逐站金额迁入 `website_income`，保留账号总额并移除重复拆分入口 | 迁移与备份恢复测试 |
| 账号 `currency` 直接作为收入汇总单位 | 汇总明确显示 USD；`currency` 只作为账号元数据 | `Adsense.vue`, dashboard summary | 删除误导性标签，不删除账号字段 | 页面静态检查、API SQL 检查 |

## 2026-11-07 网站组合与旧入口清理

| 被替代实现 | 当前入口 | 删除依据 |
| --- | --- | --- |
| DomainDialog、DomainDetailDrawer、QuickFieldDialog、AdsenseQuickDialog | 网站组合详情和域名资产页 | 已核对 Vue 导入、路由与按钮事件；注册数据、状态检查、操作、提示词及历史都有当前入口 |
| domain.css、domain-detail.css、旧 Home 表格样式 | home.css、website-detail.css、domain-assets.css | 旧组件移除后无模板使用；保留 shared token、控件与覆盖层样式 |
| 导航 overview/metrics CSS | 经营阶段导航 | 新导航不再渲染旧概览节点，已删除全部无引用规则 |
| AdSense 网站分摊表单及 income-site-* CSS | 网站月收入历史 | 已将旧网站美元明细迁入通用收入；账号账目保留，旧分摊表/入口/样式移除 |
| 域名 Todo、操作及 AI 记录路由 | `/api/websites/:id/tasks`、`operations`、`ai-notes` | 网站/域名拆分后以稳定网站 ID 关联；旧路由和旧 domain_* 表移除 |
| domains API 中的网站经营字段、旧网站编辑辅助模块及 dataFreshness | 网站 API、网站字段验证与显式数据日期 | 运行代码和新域名 schema 中已无旧网站字段；抓取脚本改为更新 websites |
| 旧资源/操作批量队列 | 域名状态检查队列 | 仍使用同一浏览器队列保存状态与检查时间，移除被替代的队列写入格式 |

`lint:cleanup` 的 CSS 检查现在从 Vue、脚本和 HTML 根节点取类名来源，不再把 CSS 自身算作来源；同时检查旧表名、旧组件/路由、网站新表、域名表字段边界与队列字段。Element Plus 运行时类和共享设计 token 保留。

网站详情收入输入改为 0.01 步长，投入为 0.1 步长；AdSense 金额输入沿用同一小数规则，已由原生表单有效性和真实本地 API 提交验证。
