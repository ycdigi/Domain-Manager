# Dashboard 呈现层验证记录

日期：2026-11-05。基线：`32cbb0d`。现有搜索、技术栈标签和电脑字段来自 `5566862`，本次保留其全部业务实现。

## 适配与参考核实

代码实际为 Vue 3 / Vite 6 / Element Plus，默认登录后页面 `/home`。保留台账和管理入口，调整工具、摘要、搜索标签、数据表的呈现顺序，未迁移框架。

通过 GitHub contents API 枚举并读取 `VoltAgent/awesome-design-md` 下 `design-md/linear.app`、`design-md/airtable` 实际存在的 DESIGN.md 和 README.md。两份均主要描述营销站；只借鉴已记载的控件密度、白底/深色正文、细分隔与层级。不将未经记载的应用内导航或筛选规范当作依据，保持本站浅色与全宽。随后按用户新指定的 `rgb(0, 112, 249)` 统一蓝色主操作，语义状态色保留。

## 实际改动

1. 共用基础：单一 token、按钮/输入/焦点/错误/表格/覆盖层框架；表单统一上置标签，移除相应手机 `!important` 补丁。独立复核发现输入轮廓偏淡，已将 field-edge 从 74% 降至 65% lightness。
2. 首页：工具优先、摘要收紧、搜索和技术栈标签整合；保留全部列和既有操作。长名称可完整查看，图标标签包含域名。手机解除固定列，避免挡住右侧操作；概览保留默认隐藏，手机关闭入口明确。
3. 管理界面：域名桌面双列/手机单列；资源子弹窗适配 teleport；资源操作列不截断；账号/月收入、通知、导入、详情及 AI 编辑共享控件风格。已删除被替代规则，明细见 STYLE-CLEANUP.md。

## 已执行的检查

| 检查 | 结果 |
| --- | --- |
| npm run build | 通过（保留原有大 bundle 警告） |
| npm run test:auth | 14/14 通过 |
| TMPDIR=/tmp npm run test:data | 29/29 通过 |
| npm run lint:cleanup | 通过，69 个源文件、10 个 CSS 文件 |
| git diff --check | 通过 |
| Hallmark sloplint 静态样式检查 | 0 FAIL，0 WARN；1 个误报已注明，7 个密集控件微间距提示保留 |
| 原业务脚本与事件比对 | 所有组件业务脚本一致，保留既有事件表达式；Home 仅增手机列呈现 watcher 和概览关闭按钮 |
| 后端/数据/路由/SEO 文件差异 | functions、schema、router、index.html、package.json 均未改动 |

浏览器使用本地拦截 fixture，覆盖 320、390、768、1440、2560px。检查有数据/加载/空/错误状态，搜索、四类标签、排序、局部编辑、WordPress 数量、电脑选择入口、AdSense 配套表单、删除取消/域名提示、域名表单校验、资源管理及嵌套凭据、AdSense 编辑与月收入、通知、导入、详情/AI 文本编辑、概览关闭、登录错误和键盘标签切换。全流程未出现页面运行时错误。

另外执行 AI 记录本地模拟提交、WordPress 数量 PATCH、真实浏览器 Excel 下载和剪贴板复制。所有写请求均被 fixture 拦截，未写生产 D1。截图和比对页位于本地 `.hallmark/dashboard-2026-11-05/`，不随提交上传。

## 边界与未验证

- 未对生产账号、收入、Token、通知或域名执行写入，也未重跑生产迁移；本次不变更 schema。
- 浏览器 fixture 验证呈现与请求路径，不等同于生产端到端写入验证；真实剪贴板权限和操作系统差异仍取决于用户环境。
- Hallmark 的自动 render tier 未成功执行；实际截图和交互由 Playwright 完成，不能将静态 linter 表述为自动渲染通过。
- 未新增分页（项目现有无分页）；未安装新 Skill、字体、组件库或广告 Slot。
- 既有未提交 `tsconfig.tsbuildinfo`、`.hallmark/` 和 `backups/` 保留，不混入本次提交。
