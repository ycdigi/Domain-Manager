[English](./README.en.md)

<p align = "center">    
<img  src="https://github.com/user-attachments/assets/d7509dd3-5254-4af0-ad68-f8cbfdd0bcd9" width="600" height="600" />
</p>


<div align="center">

# Domains-Manager

</div>



一个基于 Cloudflare Pages/EdgeOne Pages  的域名管理系统，帮助您轻松管理和监控多个域名的状态、到期时间等信息。

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
npm run db:verify:remote
```

如果某个迁移提示列或表已存在，先停止，不要重复执行同一迁移；先用 `npm run db:inspect:remote` 和 Cloudflare D1 控制台确认当前结构。迁移完成后重新部署 Pages，使生产函数使用新表。

> `DB` 必须是 D1 database binding，不是 Variables and secrets 里的 Text 变量。绑定名称必须精确为 `DB`，修改绑定或表结构后需要重新部署 Pages 项目。

`CREDENTIAL_ENCRYPTION_KEY` 是 GitHub Token 的加密密钥。请另行备份；丢失或更换后，已有密文无法解密，需要重新录入 Token。

资源账号、资源和网站关联通过 `/api/resources/*` 管理；完整 Token 只在明确点击显示时返回，不包含在域名导出文件或 Excel 快照中。网站详情可以维护技术栈、WordPress 计算器页数、文章数、统计日期和操作日期历史。

状态写入会按日期去重；SEO 和点击修改使用浏览器本地队列，最多保留 200 项，每批最多 25 项。重复字段变更会合并，断网或 D1 临时失败会保留待同步任务。资源状态由 D1 关联触发器维护。AdSense 月收入按账号和月份保存，不分摊到单个网站。首页“导出”会生成包含域名、操作、AdSense、收入、资源关联和 AI 记录的多工作表 Excel，不包含密码、API Token、Provider Token、凭据密文或加密密钥。

后端登录令牌现在由 `USER` 和 `PASS` 签名。首次部署此版本后，旧浏览器会话需要重新登录一次；之后仍会在同一浏览器长期保留，直到登出、清除站点数据或轮换 `PASS`。

7. 部署
   - 点击 "Save and Deploy"
   - 等待部署完成

部署完成后，您可以通过 Cloudflare Pages 提供的域名访问系统。

## API 文档

### 1. 域名检查 API

**端点**: `/api/check`
**方法**: GET 或 POST
**认证**: 需要 `Authorization: Bearer your_api_token` Header。不要把 Token 放在 URL 中，URL 可能被记录在代理、分析和请求日志中。

`/api/addrec` 同样使用 Bearer Token Header。旧的 `?token=` 方式已停用，定时任务需要改为发送 `Authorization` 请求头。

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

### 2. 域名列表 API

**端点**: `/api/addrec`
**方法**: POST
**认证**: 需要 Bearer Token

响应：
```json
{
    "status": 200,
    "message": "获取成功",
    "data": [
        {
            "id": 1,
            "domain": "example.com",
            "registrar": "Cloudflare",
            "registrar_link": "https://cloudflare.com",
            "registrar_date": "2023-01-01",
            "expiry_date": "2024-01-01",
            "service_type": "网站",
            "status": "在线",
            "memo": "主站"
        }
    ]
}
```

操作日期使用 `/api/domains/:id/operations` 管理，类型固定为 `SEO`、`内容`、`技术`、`其他`，同一网站同一天同一类型只保留一条。`/api/export/snapshot` 返回不含凭据的完整导出数据，首页会据此生成多工作表 Excel。

### 3. AI 同步 API

给外部 AI 或自动化脚本使用的接口是：

```text
POST /api/ai/sync
Authorization: Bearer ${API_TOKEN}
Content-Type: application/json
```

它只更新已经存在的域名，不会因为域名拼写错误自动创建网站。支持同步状态、SEO 日期、日点击、技术栈、WordPress 数量、AdSense 网站状态、操作日期和 AI 提示词/想法。

示例：

```json
{
  "domain": "example.com",
  "fields": {
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
