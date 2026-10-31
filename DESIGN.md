# Design: Domain Manager

已锁定的设计系统，依据 2026-10-31 确认的 `/home` 实际实现提取。后续 Hallmark 工作先读本文件，不重新抽取主题或自行更换配色。

**来源边界**：当前可核验的样板是域名管理页，仓库中没有计算器样板。单位选择、计算结果卡片与公式展示尚未定义；本文件不把它们描述为已实现。用户已授权按“共用组件 → 登录页 → 其余模板”分批推广。现已按该顺序接入两种页面模板（Login、Home）与三种业务弹窗；根文档通过 `dm-ui` 显式启用公共层，Home 的数据台账布局继续单独持有。

## System
- Genre：modern-minimal；页面类型：app screen；用途：自用后台域名管理。
- Theme：现有项目设计；调性：technical、utilitarian、专业、克制、清晰；浅色背景／系统无衬线／绿色主操作，Restrained posture。
- GitHub 仅作为工具界面层级参考；使用项目自己的 DM 标识，不声称复制 GitHub 品牌配色。
- 页面由统计摘要、域名台账、右侧管理概览和工作区操作组成；不设置产品品牌头、页面宣传标题、页脚链接、营销 Hero、背景摄影或装饰动画。
- 实装来源：[`Home.vue`](src/views/Home.vue)、[`Login.vue`](src/views/Login.vue)、[`shared/tokens.css`](src/styles/shared/tokens.css)、[`shared/base.css`](src/styles/shared/base.css)、[`shared/layout.css`](src/styles/shared/layout.css)、[`home.css`](src/styles/home/home.css)、[`login.css`](src/styles/login/login.css)、[`import.css`](src/styles/dialogs/import.css)。规则冲突时先核对这些源码，不能靠主题印象补值。

## Tokens
`src/styles/shared/tokens.css` 是值的单一来源，令牌值沿用已确认样板；Element Plus 映射也保留在同一文件。以下为锁定时的实际声明快照，不是另一套推荐值：

```css
:root:is(.dm-ui, .dm-home-route) {
  --color-paper: oklch(100% 0 0);
  --color-paper-2: oklch(97.5% 0.003 250);
  --color-paper-3: oklch(94% 0.005 250);
  --color-ink: oklch(27% 0.014 255);
  --color-ink-2: oklch(43% 0.016 255);
  --color-muted: oklch(48% 0.014 255);
  --color-rule: oklch(84% 0.008 255);
  --color-field-edge: oklch(59% 0.014 255);
  --color-accent: oklch(43% 0.11 150);
  --color-accent-hover: oklch(37% 0.1 150);
  --color-accent-ink: oklch(100% 0 0);
  --color-link: oklch(44% 0.17 255);
  --color-focus: oklch(44% 0.17 255);
  --color-success: oklch(39% 0.1 150);
  --color-success-paper: oklch(96% 0.025 150);
  --color-warning: oklch(40% 0.09 75);
  --color-warning-paper: oklch(97% 0.035 90);
  --color-error: oklch(44% 0.17 26);
  --color-error-paper: oklch(97% 0.015 26);
  --color-clear: transparent;
  --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
  --font-display: var(--font-body);
  --space-3xs: 2px;
  --space-2xs: 4px;
  --space-xs: 8px;
  --space-sm: 12px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 40px;
  --text-xs: 12px;
  --text-sm: 13px;
  --text-md: 14px;
  --text-lg: 16px;
  --text-title: 24px;
  --radius-control: 6px;
  --radius-panel: 8px;
  --container: 1440px;
  --gutter: clamp(16px, 3vw, 40px);
}
```

- 表面：`paper` 为内容底色，`paper-2` 为顶栏和工具条，`paper-3` 为轻强调及交互底色；`ink`／`ink-2`／`muted` 区分主要、次要和辅助文字。
- 边界：`rule` 用于结构分隔；`field-edge` 用于表单边界。两者不能因“更淡”而合并。
- 行动：绿色 `accent`／`accent-hover`／`accent-ink` 专用于填充主按钮；蓝色 `link` 与 `focus` 分别承载链接和可见焦点。
- 状态：`success` 配 `success-paper`，`warning` 配 `warning-paper`，`error` 配 `error-paper`；状态同时写明文字，不只靠颜色。离线标记当前采用中性 `muted`＋`paper-3`，不是红底标签。
- Element Plus：`--el-color-primary` 实际映射到 `--color-link`；主按钮通过 `--el-button-*` 单独映射绿色。文本、边框、背景和状态变量沿用 tokens.css 中的语义映射，不把组件库 primary 统一改绿。

## Typography
- 正文和标题共用上述系统字体链，不新增展示字体、字体下载或等宽标签体系。页面主体的实装字重使用 400、500、600。
- 页面标题 24px／600／行高 1.35；760px 及以下改为 20px。正文与表格数据 14px，正文行高 1.5；表格单元内容行高 1.6。
- 工具按钮与计数 13px；表头、状态标签、滚动提示 12px；表头 500。
- 标题可换行、`min-width: 0`、`overflow-wrap: break-word`、`text-wrap: balance`；可比较的日期、剩余天数和记录数使用 tabular numerals。

## Layout And Responsive
- 工作区为 100% 宽、居中、最大宽度 1440px，内部水平留白 `clamp(16px, 3vw, 40px)`；1440px 容器的可用内容宽度为 1360px，不在大屏无限扩张。
- 间距使用实际 2／4／8／12／16／24／32／40px token。桌面工作区上下 32px，标题区与台账相隔 24px；工具条内边距为上下 12px、左右 16px。
- 容器／台账圆角 8px，控件圆角 6px，结构分隔为 1px；页面面板不叠加阴影。没有另设阴影、动效时长或 z-index token。

| 实际断点 | 已实现行为 |
| --- | --- |
| `max-width: 760px` | 工作区上下留白 24px；工具条操作换行，显示表格滚动提示；表格行操作至少 44px 高 |
| `max-width: 600px` | Element Plus 按钮至少 44px 高；弹窗内边距 16px；表单标签改为上置，移除表单内容的左侧占位；弹窗关闭按钮至少 44×44px |
| `max-width: 380px` | 主操作独占一行并占满可用宽度；工具条操作排成两列 |

## Navigation And Footer
- 不渲染产品品牌头或页脚；登出放在域名工作区的“更多”菜单中，不占用独立导航空间。

## Buttons And Forms
- Home 页面唯一填充主操作是“新增域名”：绿色底、反白文字、6px 圆角，桌面至少 36px 高；hover 变为 `accent-hover`。弹窗单独保留一个提交主操作；Login 使用同款绿色“登录”按钮。
- 刷新、导入、导出、通知配置使用中性描边按钮；行内修改为文字按钮，删除为 `error` 色文字按钮；不再套用一整排蓝色主按钮。
- 非禁用控件按下允许 1px 位移；键盘焦点为即时 2px `focus` 轮廓，常规 offset 3px，文字行操作 offset 2px。禁用保留原生 disabled／组件禁用语义、0.55 透明度和 not-allowed 光标。
- 表单复用现有 Element Plus 输入、日期、选择、数字输入和开关，不新增表单高度 token。输入／选择框的 focus wrapper 使用 2px 内描边，内部输入焦点 offset 为 -2px；日期控件在弹窗中占满可用宽度。
- 保留每个现有字段的名称、校验、必填标记和提交 wiring。桌面标签宽度沿用 DomainDialog 的 100px、AlertConfigDialog 的 120px；600px 及以下标签上置，标签下留 8px。
- 弹窗原宽度分别为 600px、500px、500px，统一以 `calc(100% - 32px)` 限制最大宽度，垂直 margin 为 5dvh，内容区最大高度 70dvh 并可滚动；底部取消与提交右对齐，间隔 8px。

## Unit Selection And Results
- **单位选择：未定义。** `/home` 没有数值单位、换算或单位联动；服务类型与在线状态的 select 不是单位选择器。当前只确认通用 Element Plus select 的视觉，不锁定数值／单位拼接布局或换算行为。
- **计算结果区：未定义。** 当前结果呈现是从既有 API 加载的域名台账，不存在计算值大卡、公式、精度、单位输出、复制结果按钮或推导过程。不得把新增的计算器组件伪称为本样板已有设计；取得实际计算器样板后再显式补充这一节。

## Tables
- 台账使用一个 1px 边界、8px 圆角的容器，顶部为浅灰工具条；表格数据左对齐，中性正文色，只有域名链接、风险值和行内操作使用语义强调。hover 为 `paper-2`，不使用彩虹标题、玻璃底或满表蓝字。
- 列顺序与宽度：域名 min 200px（固定首列）、剩余时间 min 128px、状态 min 88px、过期时间 min 128px、域名商 min 136px、注册时间 min 128px、服务类型 min 112px、备注 min 160px、操作固定 136px。默认按过期时间升序，保留已有列排序。
- 数据单元上下 padding 12px，左右 16px；表头上下 padding 8px。备注保留溢出 tooltip，域名允许断行，域名商链接不换行；所有既有数据字段保留。
- 手机上保留固定域名首列和横向滚动，显示“左右滑动查看全部字段和操作。”，不能直接删掉隐藏在右侧的数据或操作。

## Feedback And Data States
- Loading：台账 `aria-busy`、实际加载遮罩及“正在加载域名…”；计数显示“正在加载…”，不显示虚构数量。
- Empty：只有加载成功且数组为空时，显示“还没有域名”、说明与新增入口；记录数来自实际数组。
- Error：持久错误说明与“重试”；计数显示“加载失败”，已有数据不因请求失败被清空。未知数量不能写成 0。
- Full：展示实际 API 记录及字段；剩余天数区分“已过期 N 天”“今日到期”“N 天”，临近阈值使用配置的 alertDays，不硬编码另一套业务规则。
- 同一表格可见变化不重复弹成功 toast；导出及通知配置等不可直接看见结果的动作保留原反馈，错误保留明确说明。删除保留现有确认流程。
- 通用弹窗当前仍是发出 submit 后立即关闭；服务端保存失败时保留输入尚未实现。这是既有逻辑缺口，不是被本规范认可的理想错误处理，也不能写成已支持。

## Motion And Scope
- 页面不使用入场动画或装饰性持续动画；按钮无渐变过渡，仅保留必要按下反馈。减少动态效果时禁用 transition，动画周期缩为 0.01ms／一次，滚动恢复 auto，行内按下位移取消。
- 根文档语言设为 `zh-CN`，使中文标签按正确语言朗读；系统字体可按语言选择对应字形，控件宽度仍按实际文字自适应，不另设字体。
- 根 `index.html` 通过 `html.dm-ui` 显式启用共享 token、页面基础、控件与 teleport 到 body 的弹窗。保留 `dm-home-route` 兼容作用域；Home 挂载／退出时增删该标记，只管理台账局部布局。
- 已从根 HTML 移除旧宠物、爱心、花瓣、星星脚本、装饰容器与外部展示字体；不再加载后再隐藏，也不再在路由切换中覆盖 `window.onresize`。全站只保留系统字体与现有 DM 资源。

## Existing Exceptions
- ImportDialog 原有硬编码配色及暗色分支已移除；上传区、选中文件、结果摘要及错误明细使用公共语义 token。没有待迁移的页面或业务弹窗配色例外。
- 通用编辑弹窗发出 submit 后立即关闭的既有行为仍保留；本次设计推广不改变后端保存与事件契约。

## Shared Implementation
- CSS 入口只在 `src/main.ts`：依次加载 Element Plus、`shared/base.css`、`shared/layout.css`；base 导入唯一共享 token 源。`App.vue` 只提供 router-view，不再重复导入组件库 CSS 或维护另一套字体。
- Home 和 Login 直接使用工作区，不渲染产品品牌头、页脚和外部作者链接。
- DomainDialog 和 AlertConfigDialog 删除重复 footer CSS，复用公共控件与响应式表单规则；字段、校验、props、事件和提交逻辑不变。
- ImportDialog 的页面专用样式在 `styles/dialogs/import.css`，结果值来自既有 API，loading 使用 aria-busy，结果通过 status 公布，不重复弹成功 toast。桌面和移动端保留全部错误明细，长文件名／域名可换行。
- Home 只加载 `styles/home/home.css` 的局部台账规则；原 `home/base.css` 已被公共页面基础替代，旧 `home/tokens.css` 已在第 1 批移动至 shared。
- 本次数据扩展不改变视觉 token：Home 继续使用同一台账和横向滚动容器；AdSense 管理、筛选和 SEO 日期控件复用既有按钮、表单、表格与弹窗规则。
- Home 现采用全屏工作台：域名台账作为主区，右侧为收入、SEO、点击分布和基础设施概览；移动端将右侧概览折叠为可滚动区，不新增营销式卡片或暗色主题。
- 基础设施资源管理复用现有浅色弹窗、表格、按钮和状态语义；账号网站数使用去重统计，凭据完整值只在明确操作后显示。

## Login Variant
- 使用相同字体、语义色、控件、断点与容器。主内容区弹性占据可用高度，表单面板居中、宽 100%／最大 400px、1px rule 边框、8px 圆角、24px 内边距；600px 及以下内边距 16px。
- 标题“登录”沿用 24px／600／1.35（760px 及以下 20px），说明为既有“域名管理系统”；用户名与密码使用可见标签、现有图标、username／current-password autocomplete。
- 空字段使用 Element Plus 必填校验；仅请求进行时禁用提交并保留“登录”文字和 spinner。API 错误持久显示于表单内，保留输入供重试；键盘 Enter 通过原生表单统一提交。
- 成功继续调用 `/api/login`，在当前浏览器 localStorage 长期保留 token 并进入 Home；不保存密码、不重复弹成功 toast。已登录时访问 `/` 或 `/login` 会直接进入 Home；主动登出、清除站点数据或使用另一浏览器／配置文件后需重新登录。兼容旧格式中的 expiresAt 字段，取消原先六小时的客户端期限；后端 API 与数据库不变。

## Rollout Record
- 第 1 批公共基础控件：共享 token／base 与单一 CSS 入口。
- 第 2 批普通编辑表单：DomainDialog、AlertConfigDialog；验证见 `.hallmark/batch-2/verification.json`。
- 第 3 批文件导入弹窗：ImportDialog；验证见 `.hallmark/batch-3/verification.json`。
- 第 4 批 Login 接入；验证见 `.hallmark/batch-4/verification.json`。
- 第 5 批 Home 集成及全站收口：移除已替代的局部基础规则和装饰处理，保留已确认台账；最终验收见 `.hallmark/site-rollout/`。

## Exports
- 可执行导出是 [`src/styles/shared/tokens.css`](src/styles/shared/tokens.css)；通用按钮、焦点、表单、弹窗和减少动态效果规则在 [`src/styles/shared/base.css`](src/styles/shared/base.css)。共用容器在 shared/layout.css；Home、Login 和导入结果只持有各自局部布局，不复制另一套 token。
- 当前没有 Tailwind、DTCG、shadcn 导出，不为锁定系统引入新依赖或第二份 token 源。修改设计时同步更新本文件及实际 CSS，不能只改文档快照。
- 本地验收产物不随源代码推送。参考验收：`.hallmark/home-after-lint.json`、`.hallmark/home-redesign/verification.json`、`.hallmark/home-redesign/handoff.md`。预览的 `.example` 记录是本地测试夹具，未写入应用或数据库，不能作为真实业务素材复用。
