# 工作区列表与编辑布局复查（2026-11-27）

## 依赖与根因

渲染链：Vue 路由 → WorkspaceLayout / WorkspaceHeading → 视图模板 → shared/base.css 与 workspace/workspace.css → 视图样式。提示词内容另经 Pages API / D1 读取，不在展示层裁剪存储文本。

| 问题与根因 | 修复位置 | 影响范围与验证 |
|---|---|---|
| 标题、分类、摘要是纵向容器的三个直接子节点，导致标题分类强制换行 | Prompts 的信息分组和 prompts.css | 标题分类同排两端对齐；超长文本仅视觉省略，DOM 与详情保留全文；390/768/1024/1280/1600 宽度验证 |
| 分类标签和详情分类缺少收缩/换行边界 | prompts.css | 50 字分类、175 字标题、长 URL；不重叠、不产生页面横向滚动 |
| page-list 允许内容按固有宽度扩张后换行，把动作推到下一行 | workspace/workspace.css | 遍历全部引用：待处理、批次、AdSense、资源关联、部署关联、GSC 账号、工作历史；正文可收缩，动作保留宽度，末尾辅助文本可换行；待处理/批次长内容与 AdSense 长域名专项回归 |
| 全局按钮 margin 清零后，只有部分 dialog 页脚恢复间距，drawer 遗漏 | shared/base.css | dialog/drawer 使用统一 flex gap，去除旧 margin 间距；直接按钮与 dialog-footer 包装均覆盖；批次对话框、提示词弹窗、详情抽屉、多种详情/批量设置回归 |
| 两个编辑入口没有区分目标；抽屉自动焦点会覆盖提前 focus；手机详情关闭回调清掉选择 | PromptDetail / Prompts | 元数据入口定位标题，正文入口定位正文；使用编辑弹窗焦点生命周期；手机详情转编辑时保留选择；新增粘贴入口定位粘贴框 |
| 收集表单原本内嵌提示词页，无法从首页复用；路由/样式/保存后跳转耦合在页面 | PromptEditorDialog / create-prompt-category / Home / Prompts | 新增与编辑仅保留一套表单、分类创建和保存逻辑；首页按钮在刷新后；公共样式独立加载；首页保存不导航，列表页自行刷新；分类新增事件刷新父页面；每实例表单 ID 避免 KeepAlive 重复引用 |
| 原工作区全站布局回归没有提示词路由 | workspace-layout-ui.py | 补提示词 API 夹具与路由，12 个工作区在 5 个宽度回归 |

## 验证入口

- `node --test tests/*.test.mjs`：263 项通过。
- `npm run build`、`npm run lint:cleanup`、Functions TypeScript 检查：通过；构建仍有既有主包体积提示。
- 本地真实 Pages / 隔离 D1：`tests/prompts-home-ui.py`、`tests/prompts-local-ui.py`、`tests/prompts-layout-ui.py`，验证存取复制、同名处理与原地编辑、分类读取失败重试、分类新增、备份、手机编辑、长文本与焦点；首页冷启动收集、筛选排序保持、失败草稿、Esc/取消/前进后退保护、KeepAlive 返回不残留弹窗、既有新增网站入口。
- 本地 Vite + API 夹具：`tests/workspace-layout-ui.py`（12 路由 × 5 宽度）；`tests/workspace-content-layout-ui.py`（4 宽度长内容与页脚）；resources、finance、batch、drafts、website-account-select、website-bulk-settings、website-management、portfolio 的现有 UI 测试。
- 样式检测和 Git whitespace 检查通过；全文检索复扫全部 page-list 与 overlay footer 的消费位置。

## 验证边界

浏览器验证使用 Chromium；页面级跨站回归通过 API 夹具隔离，不能等同于生产数据端到端验证。未运行 Safari、Firefox、生产环境回归，未提交、推送或部署。真实 D1 写入仅限隔离本地测试库。未声称整站全部业务行为均完成穷举验证；此次覆盖的是列表、标题栏、页脚及其关联编辑路径。


## 提示词详情精修与引用复扫（2026-11-27）

本轮从截图沿 `Prompts → PromptDetail → prompts.css` 与 `PromptEditorDialog` 引用追查：复制/删除独立放在标题后的兄弟容器，导致无法在标题行两端对齐；两个编辑入口各自传入焦点字段；正文 `max-width:75ch` 在宽屏形成固定空白。

- 在唯一详情组件内合并标题信息与右侧动作区；编辑紧跟标题，文案为“编辑”，同一弹窗编辑分类、标题和正文。桌面与手机抽屉均复用该组件；窄屏动作换行后保持右对齐。
- 删除旧“编辑标题与分类”“编辑正文”入口、旧样式及失去消费者的 `initialFocus`/`editFocus` 参数和正文 ref。首页新增、重名后编辑已有条目继续使用公共弹窗，统一定位标题；新增粘贴仍定位粘贴框。
- 正文使用标签头、下划线和浅色边框构成 Tab 样式，当前只有一个内容分区，语义采用有名 section 与 heading，避免创建没有切换功能的 tab 控件。正文宽度填满区域，保留内边距；换行、转义、缩进和复制文本不变。
- 复扫所有 PromptDetail 消费点、旧编辑名称/参数/选择器及正文限宽；限宽根因仅出现在提示词正文，其他页面的 tabs 与全局样式未改动。收入/资源既有 Tab 流程回归通过。

验证：布局测试 390/768/900/901/1024/1280/1600/1920/2560px；标题与按钮位置、右侧动作对齐、正文实际宽度、长标题/分类/URL、键盘焦点、手机抽屉与统一编辑真实 D1 保存通过。真实本地提示词存取/收藏/分类/备份/剪贴板与首页收集回归通过；12 路由 × 5 宽度、共享长内容/页脚、收入与资源回归通过。263 项 Node/SQLite、构建、清理和 Functions 类型检查通过，样式检测无发现，Git whitespace 检查通过。构建保留既有主包体积警告。

本轮未修改数据库结构。Safari、Firefox、生产业务写入及全站业务穷举未验证；本地 D1 验收和 fixture 跨页回归分别记录，不互相替代。
