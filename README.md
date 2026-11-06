[English](./README.en.md)

<p align = "center">    
<img  src="https://github.com/user-attachments/assets/d7509dd3-5254-4af0-ad68-f8cbfdd0bcd9" width="600" height="600" />
</p>


<div align="center">

# Domains-Manager

</div>



一个基于 Cloudflare Pages/EdgeOne Pages  的域名管理系统，帮助您轻松管理和监控多个域名的状态、到期时间等信息。

AI 同步接口的可直接复制提示词见 [`AI-SYNC-PROMPT.md`](./AI-SYNC-PROMPT.md)。提示词按“首次补全、后续只发送变化字段”设计，不会重复覆盖域名注册商导入的数据。

## 功能特点

- 域名管理：添加、编辑、删除、导入、导出域名信息
- 状态监控：自动检查域名在线状态
- 到期提醒：设置域名到期提醒时间
- 多注册商支持：支持多个域名注册商的信息记录
- Telegram 通知：支持通过 Telegram 发送到期提醒
- 响应式设计：支持移动端和桌面端访问
- 安全认证：基于用户名密码的访问控制

## 批量导入说明

系统支持通过JSON文件批量导入域名数据。导入格式如下：

```json
[
  {
    "domain": "example.com",
    "registrar": "Cloudflare",
    "registrar_link": "https://dash.cloudflare.com",
    "registrar_date": "2023-01-01",
    "expiry_date": "2024-01-01",
    "service_type": "网站",
    "memo": "主站"
  },
  {
    "domain": "example.org",
    "registrar": "Namecheap",
    "registrar_link": "https://www.namecheap.com",
    "registrar_date": "2023-02-15",
    "expiry_date": "2024-02-15",
    "service_type": "API服务",
    "memo": "API文档站点"
  }
]
```

### 导入字段说明

- `domain`：域名（必填）
- `registrar`：注册商名称
- `registrar_link`：注册商管理链接
- `registrar_date`：注册日期，格式为YYYY-MM-DD
- `expiry_date`：到期日期，格式为YYYY-MM-DD
- `service_type`：服务类型
- `memo`：备注信息

导入时，系统会自动验证数据格式，并给出成功和失败的详细信息。

域名 JSON 还可以包含 `ai_notes` 数组，每条记录使用 `kind`（`AI提示词` 或 `想法说明`）和 `content` 字段；这些内容会在对应网站的“提示”详情抽屉中管理。

## 快速开始

### 前置要求

- GitHub 账号
- Cloudflare 账号/EdgeOne 账号

### 安装步骤

1. Fork 本仓库到您的 GitHub 账号

2. 在 Cloudflare Pages/EdgeOne Pages  中创建新项目
   - 登录 Cloudflare Dashboard/EdgeOne Pages 
   - 进入 Pages 页面
   - 点击 "Create a project"
   - 选择 "Connect to Git"
   - 选择您 fork 的仓库

3. 配置构建设置
   - 构建命令：`npm run build`
   - 构建输出目录：`dist`
   - 环境变量：
     ```
     USER=your_username
     PASS=your_password
     API_TOKEN=your_api_token
     ```
   - 生产环境必须在 Pages 的 Production 环境配置变量；Preview 环境变量不会自动用于正式域名。

4. 创建 D1 数据库
   - 在 Cloudflare Dashboard 中进入 D1 页面
   - 创建新数据库，命名为 `domains-db`
   - 复制数据库 ID

5. 配置数据库
   - 在 Cloudflare Pages 项目设置中添加 D1 数据库绑定
   - 绑定名称：`DB`
   - 数据库 ID：粘贴之前复制的 ID

6. 初始化数据库
   - 在 Cloudflare Dashboard 中进入 D1 页面
   - 选择您的数据库
   - 新数据库执行仓库根目录的 `schema.sql`；已有数据库必须按版本顺序执行迁移文件，不要用初始 schema 覆盖旧结构
   - 如果数据库是旧版本且 `domains` 表还没有 `st_tgsend` 列，再单独执行一次 `schema-migration-v1.0.2.sql`
   - 升级到 AdSense/SEO 字段时，对已有数据库再执行一次 `schema-migration-v1.1.0.sql`；该迁移文件不要重复执行
   - 升级到基础设施账号、资源关联、Token 凭据和点击字段时，对已有数据库再执行一次 `schema-migration-v1.2.0.sql`；该迁移文件不要重复执行
   - 先检查 `SELECT lower(rtrim(domain, '.')), COUNT(*) FROM domains GROUP BY lower(rtrim(domain, '.')) HAVING COUNT(*) > 1;`。若有结果，先人工合并重复域名；之后执行 `schema-migration-v1.3.0.sql`，此迁移只执行一次
   - 在 Pages 项目中新增 Secret `CREDENTIAL_ENCRYPTION_KEY`，用于加密保存 GitHub Token；值需至少 32 个随机字符，例如本地运行 `openssl rand -hex 32` 生成；不要把它放进普通 Text 变量
   - 已有数据库升级到 AI 提示词和想法记录时，再执行一次 `schema-migration-v1.4.0.sql`
   - 已有数据库升级到 Publisher ID、网站技术栈、WordPress 内容统计和操作日期时，再执行一次 `schema-migration-v1.5.0.sql`
   - 已有数据库升级到网站名称和行业字段时，再执行一次 `schema-migration-v1.6.0.sql`
   - 已有数据库升级到日点击区间选择时，再执行一次 `schema-migration-v1.7.0.sql`
   - 已有数据库升级到电脑字段时，再执行一次 `schema-migration-v1.8.0.sql`
   - 已有数据库升级到 AdSense 月度美元/人民币金额、转账日期和可选网站美元明细时，再执行一次 `schema-migration-v1.9.0.sql`
   - 添加网站归属关系时，先备份已有数据库，再执行一次 `schema-migration-v1.11.0.sql`；旧网站统一设为自营网站，新数据库已包含该字段，不要重复迁移
   - 收拢网站资源绑定规则时，先检查是否存在重复主资源或重复账号归属资源，再执行一次 `schema-migration-v1.12.0.sql`；停用对象的历史关联会保留，不要重复迁移

### D1 命令行管理

仓库脚本默认使用数据库名 `domains-db`。`--local` 只操作本地开发数据库，生产库必须显式使用 `--remote`。

```bash
# 先确认远程数据库和表，不会写入数据
npx wrangler d1 list
npm run db:inspect:remote

# 生产操作前导出备份
npm run db:backup:remote
```

新建空数据库时：

```bash
npx wrangler d1 create domains-db
npm run db:init:remote
npm run db:verify:remote
```

已有数据库时，不要重新执行 `schema.sql` 覆盖旧结构。按实际缺失的版本顺序执行：

```bash
# 仅当 domains 缺少 st_tgsend 时执行
npm run db:migrate:v1.0.2

# 仅当缺少 AdSense/SEO 字段时执行
npm run db:migrate:v1.1.0

# 当前出现 “no such table: domain_resources” 时，通常需要执行这一批
npm run db:migrate:v1.2.0

# v1.3.0 会创建规范化域名唯一索引；执行前先确认没有重复域名
npx wrangler d1 execute domains-db --remote --command "SELECT lower(rtrim(domain, '.')) AS domain_key, COUNT(*) AS count FROM domains GROUP BY lower(rtrim(domain, '.')) HAVING COUNT(*) > 1;"
npm run db:migrate:v1.3.0
npm run db:migrate:v1.4.0
npm run db:migrate:v1.5.0
npm run db:migrate:v1.6.0
npm run db:migrate:v1.7.0
npm run db:migrate:v1.8.0
npm run db:migrate:v1.9.0
npm run db:migrate:v1.10.0
npm run db:migrate:v1.11.0
npm run db:verify:remote
```

如果某个迁移提示列或表已存在，先停止，不要重复执行同一迁移；先用 `npm run db:inspect:remote` 和 Cloudflare D1 控制台确认当前结构。迁移完成后重新部署 Pages，使生产函数使用新表。

如果页面出现 `D1_ERROR: no such table: adsense_accounts`，说明生产 D1 仍停留在旧结构，当前前端和接口已经进入 AdSense 数据模型。先备份并检查现有表，再按缺失版本从旧到新执行迁移；不要只执行某一个后续迁移：

```bash
npm run db:backup:remote
npm run db:inspect:remote
npm run db:migrate:v1.1.0
npm run db:migrate:v1.2.0
npx wrangler d1 execute domains-db --remote --command "SELECT lower(rtrim(domain, '.')) AS domain_key, COUNT(*) AS count FROM domains GROUP BY lower(rtrim(domain, '.')) HAVING COUNT(*) > 1;"
npm run db:migrate:v1.3.0
npm run db:migrate:v1.4.0
npm run db:migrate:v1.5.0
npm run db:migrate:v1.6.0
npm run db:migrate:v1.7.0
npm run db:migrate:v1.8.0
npm run db:migrate:v1.9.0
npm run db:migrate:v1.10.0
npm run db:migrate:v1.11.0
npm run db:verify:remote
```

如果这是全新且没有任何业务数据的 D1，直接执行 `npm run db:init:remote`，再执行 `npm run db:verify:remote`；已有数据库不要用初始化文件代替版本迁移。

> `DB` 必须是 D1 database binding，不是 Variables and secrets 里的 Text 变量。绑定名称必须精确为 `DB`，修改绑定或表结构后需要重新部署 Pages 项目。

`CREDENTIAL_ENCRYPTION_KEY` 是 GitHub Token 的加密密钥。请另行备份；丢失或更换后，已有密文无法解密，需要重新录入 Token。

资源账号、资源和网站关联通过 `/api/resources/*` 管理；完整 Token 只在明确点击显示时返回，不包含在域名导出文件或 Excel 快照中。网站详情可以维护技术栈、WordPress 计算器页数、文章数、统计日期和操作日期历史。

网站台账支持直接选择已有 GitHub、Cloudflare、虚拟主机或 VPS 账号进行“账号归属”绑定；系统会按账号自动生成内部归属资源，不要求先手动创建占位资源。若需要区分 Cloudflare Pages、Zone、D1、Workers 或具体服务器，再在资源管理中新增实际资源并继续关联。

状态写入会按日期去重；SEO 和点击修改使用浏览器本地队列，最多保留 200 项，每批最多 25 项。重复字段变更会合并，断网或 D1 临时失败会保留待同步任务。资源状态由 D1 关联触发器维护。AdSense 月收入按账号和月份保存：美元金额是主金额，人民币金额和转账日期均可为空；一个账号关联多个网站时，可以额外填写每个网站的美元明细，不填写时不会自动分摊总额。首页“导出”会生成包含域名、操作、AdSense、收入、资源关联和 AI 记录的多工作表 Excel，不包含密码、API Token、Provider Token、凭据密文或加密密钥。

AdSense 月收入字段口径：账号和月份用于唯一定位一条月度记录；`amount_usd` 是必须填写的账号总额；`amount_cny` 和 `transfer_date` 允许为空，适用于只拿到美元总额或自有账号不发生转账的情况；`adsense_income_domains.amount_usd` 只在能确认网站分摊时填写。当前不增加汇率、网站人民币金额、付款 ID 或税费字段，避免重复记录和保存不必要的隐私。后续若需要区分“待确认、已到账、自有账户、不适用”，优先新增月度 `settlement_status`，不改变现有金额字段。

AdSense 账号列表按归属人汇总全部历史月份：显示累计 USD、累计人民币、去重站点数量和账号最早开通日期；页面顶部的月份选择只用于选中账号的月收入编辑和历史记录，不限制累计统计范围。账号开通日期为可选字段，网站级 AdSense 开通日期仍用于记录单站接入时间。

网站台账中的 AdSense 收入是站点明细累计值，不是账号总额分摊值。没有站点明细时显示“未细化”；金额输入接受非负数字并限制为最多两位小数。

前端清理审计使用 `npm run lint:cleanup`，检查旧接口引用、CSS 类来源、模板内联样式、共享 token 重复定义，以及写入队列与批量 API 的字段一致性。

网站信息抓取使用 `npm run domains:enrich --`。它只读取公开首页的标题、站点名、首个 H1、描述和少量响应特征，输出带证据的 JSON；如果指定 `--sql-output`，会生成只补全空网站名称/行业、并在技术栈仍为“其他”时补充已识别技术栈的 D1 更新语句，不覆盖已有手工值。行业只输出 `计算器`、`资讯站`、`其他` 三类：

```bash
npm run domains:enrich -- \
  --input /path/to/domains.csv \
  --output /tmp/domains-enriched.json \
  --sql-output /tmp/domains-enriched.sql \
  --concurrency 8
```

抓取失败或证据不足的域名会保留空值，不会自动猜测行业。执行生成的 SQL 前先导出 D1 备份并人工查看 JSON 结果。

后端登录令牌现在由 `USER` 和 `PASS` 签名。首次部署此版本后，旧浏览器会话需要重新登录一次；之后仍会在同一浏览器长期保留，直到登出、清除站点数据或轮换 `PASS`。

7. 部署
   - Git 集成部署：根目录保持 `functions/` 和 `src/`，构建命令使用 `npm run build`，输出目录使用 `dist`，然后点击 `Save and Deploy`
   - 命令行部署：必须使用 Pages 命令，不要使用 `npx wrangler deploy`

     ```bash
     npm ci
     npm run build
     npx wrangler pages deploy dist --project-name domain-manager --branch main
     ```
   - `functions/api/ai/sync/index.ts` 会随 Pages Functions 一起发布。发布后使用 POST 验证，不要在浏览器地址栏用 GET 打开接口：

     ```bash
     curl -i -X POST "https://domain-manager-4j0.pages.dev/api/ai/sync" \
       -H "Authorization: Bearer ${API_TOKEN}" \
       -H "Content-Type: application/json" \
       --data '{"domain":"example.com","fields":{}}'
     ```

     `401` 表示路由已发布但 Token 不匹配；`404` 表示路径、项目或部署方式错误；`405` 表示使用了 GET，接口必须使用 POST；“域名不存在”表示接口正常但 D1 中没有该域名。

部署完成后，您可以通过 Cloudflare Pages 提供的域名访问系统。

## API 文档

### 1. 域名检查 API

**端点**: `/api/check`
**方法**: GET 或 POST
**认证**: 需要 `Authorization: Bearer your_api_token` Header。不要把 Token 放在 URL 中，URL 可能被记录在代理、分析和请求日志中。

外部定时检查使用 Bearer Token Header。旧的 `?token=` 方式已停用，定时任务需要发送 `Authorization` 请求头。

响应：
```json
{
    "status": 200,
    "message": "检查完成",
    "data": {
        "total_domains": 10,
        "notified_domains": [
            {
                "domain": "example.com",
                "remainingDays": 15,
                "expiry_date": "2024-03-01"
            }
        ]
    }
}
```

操作日期使用 `/api/domains/:id/operations` 管理，类型固定为 `SEO`、`内容`、`技术`、`其他`，同一网站同一天同一类型只保留一条。`/api/export/snapshot` 返回不含凭据的完整导出数据，首页会据此生成多工作表 Excel。

域名的轻量行内编辑使用：

```text
PATCH /api/domains/:id
```

只允许更新 `site_name`、`industry`、`status`、`platform`、`platform_other`；复杂字段仍通过完整域名编辑或详情抽屉维护。SEO 快捷操作会同时更新最近 SEO 日期和当天的 SEO 操作记录，重复日期会自动去重。

### 3. AI 同步 API

给外部 AI 或自动化脚本使用的接口是：

```text
POST /api/ai/sync
Authorization: Bearer ${API_TOKEN}
Content-Type: application/json
```

它只更新已经存在的域名，不会因为域名拼写错误自动创建网站。支持同步网站名称、行业、状态、SEO 日期、日点击、技术栈、WordPress 数量、AdSense 网站状态、操作日期和 AI 提示词/想法。

示例：

```json
{
  "domain": "example.com",
  "fields": {
    "site_name": "电气计算器站",
    "industry": "计算器",
    "daily_clicks": 24,
    "clicks_updated_date": "2026-10-31",
    "seo_last_date": "2026-10-31",
    "platform": "WordPress",
    "wp_calculator_count": 12,
    "wp_article_count": 48,
    "content_stats_updated_date": "2026-10-31"
  },
  "operation": {
    "operation_kind": "SEO",
    "operation_date": "2026-10-31"
  },
  "ai_notes": [
    {
      "kind": "AI提示词",
      "content": "检查首页入口结构和内链，找出影响收录的主要问题。"
    }
  ]
}
```

重复发送相同操作日期、同类型或相同 AI 记录不会产生重复数据。`API_TOKEN` 只能放在 Authorization Header，不要放进 URL、提示词、JSON 导出或日志。

## 配置说明

### 环境变量

- `USER`: 管理员用户名
- `PASS`: 管理员密码
- `API_TOKEN`: API 访问令牌

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 星
[![Stargazers over time](https://starchart.cc/wff0325/Domain-Manager.svg?variant=adaptive)](https://starchart.cc/wff0325/Domain-Manager)

"本项目 CDN 加速及安全防护由 Tencent EdgeOne 赞助：EdgeOne 提供长期有效的免费套餐，包含不限量的流量和请求，覆盖中国大陆节点，且无任何超额收费，感兴趣的朋友可以去 EdgeOne 官网获取"

[亚洲最佳CDN、边缘和安全解决方案 - Tencent EdgeOne](https://edgeone.ai/zh?from=github)

<p align = "left">    
<img  src="https://edgeone.ai/media/34fe3a45-492d-4ea4-ae5d-ea1087ca7b4b.png" width="400" height="500" />
</p>

[![Use EdgeOne Pages to deploy](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?repository-url=https://console.tencentcloud.com/edgeone/pages/project/pages-3tg9qzxkm2i4/index?name=domain-manager)

## 许可证

本项目基于 MIT 许可证开源 - 查看 [LICENSE](LICENSE) 文件了解更多详情。

### 技术栈工作台与电脑归属

首页按“网站归属”和“技术栈”两组筛选：归属为全部归属、自营网站、企业客户网站、未分类；归属与 Astro、Next.js、WordPress 技术栈条件共同生效，导航数量按另一组条件计算。搜索只缩小列表。新增默认自营网站，列表可直接修改归属，详情也展示归属；WordPress 标签额外提供文章数量和计算器数量维护。概览每次进入默认隐藏，可手动展开。顶部指标保留为只读统计，不再产生隐藏筛选条件。

`computer_name` 为可空电脑名称，支持下拉选择、输入新名称和清除。预置 Mac Mini Luokun、Mac Mini YC、Mac MiniBook 旧，不自动推测网站在哪台电脑维护。已关联名称从 D1 记录恢复，未使用的自定义候选保存在当前浏览器。JSON 导入/导出与 Excel 快照均包含该字段。

已有库先备份，再执行一次 `npm run db:migrate:v1.8.0`，之后部署；新库的 `schema.sql` 已包含此字段。迁移不要重复执行，可通过 `PRAGMA table_info(domains);` 检查是否已有 `computer_name`。

## 工作区导航（2026-11-05）

登录后统一使用左侧导航：网站 `/home`，资源 `/resources`，AdSense `/adsense`，通知 `/settings/notifications`，数据 `/data`。页面可直接访问，沿用长期登录和同一权限守卫，本次无 D1 迁移。

URL 可保存归属 `ownership`、技术栈 `platform`、详情域名 `site`；资源页保存 `provider`、`account`、`resource`，AdSense 页保存 `account`、`month`。关联网站入口会在台账显示可移除来源标签。搜索/排序与浏览器返回保持，Token 与未保存文本不进入 URL。

管理编辑在页内完成；域名详情、短编辑和危险操作确认保留抽屉/短弹窗。数据页先预览 JSON，再明确确认写入。JSON 是域名备份与导入格式，完整数据库恢复仍需 D1 备份；Excel 不包含凭据。

网站数量、到期、SEO、优秀网站和点击概览随归属与技术栈筛选；账号累计收入及基础设施总量标注为全局。导出全部始终包含所有网站及归属。JSON 导入与 AI 同步未提供 `ownership` 时保留已有归属，新导入默认自营网站；显式值只能是 `未分类`、`自营网站`、`企业客户网站`。筛选规则及验收场景见 `docs/requirements/website-ownership.md`。
