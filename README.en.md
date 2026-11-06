[中文 (Chinese)](./README.md)

---
<p align = "center">    
<img  src="https://github.com/user-attachments/assets/d7509dd3-5254-4af0-ad68-f8cbfdd0bcd9" width="600" height="600" />
</p>
  
# Domains-Manager

</div>


A domain management system built on Cloudflare Pages/EdgeOne Pages, designed to help you easily manage and monitor the status, expiration dates, and other information for your domains.
## Features
- Domain Management: Add, edit, delete, import, and export domain information.
- Status Monitoring: Automatically checks the online status of domains.
- Expiration Reminders: Set reminder periods for domain expiration.
- Multi-Registrar Support: Supports recording information for multiple domain registrars.
- Telegram Notifications: Supports sending expiration reminders via Telegram.
- Responsive Design: Accessible on both mobile and desktop devices.
- Secure Authentication: Access control based on username and password.
## Batch Import Instructions
The system supports batch importing of domain data via a JSON file. The import format is as follows:
```json
[
  {
    "domain": "example.com",
    "registrar": "Cloudflare",
    "registrar_link": "https://dash.cloudflare.com",
    "registrar_date": "2023-01-01",
    "expiry_date": "2024-01-01",
    "service_type": "Website",
    "memo": "Main site"
  },
  {
    "domain": "example.org",
    "registrar": "Namecheap",
    "registrar_link": "https://www.namecheap.com",
    "registrar_date": "2023-02-15",
    "expiry_date": "2024-02-15",
    "service_type": "API Service",
    "memo": "API documentation site"
  }
]
```
### Import Field Descriptions

- `domain`: The domain name (required)
- `registrar`: The name of the registrar
- `registrar_link`: The management link for the registrar
- `registrar_date`: Registration date, format YYYY-MM-DD
- `expiry_date`: Expiration date, format YYYY-MM-DD
- `service_type`: The type of service
- `memo`: Additional notes or memo
During import, the system will automatically validate the data format and provide detailed information on successful and failed entries.

Domain JSON may also include an `ai_notes` array with `kind` (`AI提示词` or `想法说明`) and `content`; these records are managed from the domain's prompt detail drawer.
## Quick Start
### Prerequisites
- A GitHub account
- A Cloudflare account/EdgeOne
### Installation Steps

1.Fork this repository to your GitHub account.

2.Create a new project in Cloudflare Pages/EdgeOne Pages
- Log in to the Cloudflare Dashboard.
- Go to the Pages section.
- Click "Create a project".
- Select "Connect to Git".
- Choose the repository you forked.
- 
3.Configure build settings
- Build command: `npm run build`
- Build output directory:`dist`
- Environment variables:
     ```
     USER=your_username
     PASS=your_password
     API_TOKEN=your_api_token
     ```

4.Create a D1 Database
- In the Cloudflare Dashboard, go to the D1 section.
- Create a new database, and name it`domains-db`
- Copy the Database ID.

5.Configure the Database
- In your Cloudflare Pages project settings, add a D1 database binding.
- Binding name:`DB`
- Database ID: Paste the ID you copied earlier.

6.Initialize the Database
- In the Cloudflare Dashboard, go to the D1 section.
- Select your database.
- For a new database, execute the root `schema.sql`. For an existing database, apply versioned migrations in order; do not use the initial schema as an upgrade script.
- If an older `domains` table does not have the `st_tgsend` column, run `schema-migration-v1.0.2.sql` once.
- To add the AdSense and SEO fields to an existing database, run `schema-migration-v1.1.0.sql` once. Do not run that migration twice.
- To add infrastructure accounts, resource links, encrypted credentials, and click fields, run `schema-migration-v1.2.0.sql` once. Do not run that migration twice.
- Before v1.3.0, check `SELECT lower(rtrim(domain, '.')), COUNT(*) FROM domains GROUP BY lower(rtrim(domain, '.')) HAVING COUNT(*) > 1;`. Resolve any duplicate domain rows manually, then run `schema-migration-v1.3.0.sql` once for status-alert tracking, resource-status triggers, and revised indexes.
- Add a Pages Secret named `CREDENTIAL_ENCRYPTION_KEY` with at least 32 random characters (for example, generate locally with `openssl rand -hex 32`) to encrypt GitHub tokens. Do not add it as a public text variable.
- For existing databases, run `schema-migration-v1.4.0.sql` once to add per-domain AI prompts and idea notes.
- For existing databases, run `schema-migration-v1.5.0.sql` once to add Publisher IDs, platform/content snapshots, and operation-date history, then run `schema-migration-v1.6.0.sql` once for site names and industries.

For website ownership, back up the existing database and apply `schema-migration-v1.11.0.sql` once before deploying this feature. Existing websites become self-operated; fresh databases already include the field. The `ownership` values are `未分类`, `自营网站`, and `企业客户网站`. Ownership and stack filters intersect; website metrics follow both filters, while account income and infrastructure totals remain explicitly global. JSON/Excel exports retain ownership; legacy imports and AI sync requests preserve existing ownership when omitted, and new imported sites default to self-operated.

> `DB` must be a D1 database binding, not a Text variable under Variables and secrets. The binding name must be exactly `DB`; redeploy the Pages project after changing bindings or table structure.

`CREDENTIAL_ENCRYPTION_KEY` encrypts stored GitHub tokens. Keep an independent backup. If it is lost or replaced, existing ciphertext cannot be decrypted and those tokens must be entered again.

The home-page export creates one multi-sheet Excel workbook for domains, operations, AdSense accounts and income, infrastructure, resource links, and AI notes. It excludes passwords, API tokens, provider credentials, ciphertext, and encryption keys.

Server login tokens are now signed with `USER` and `PASS`. Sign in once after deploying this version to replace any older unsigned browser session. The new session remains valid in that browser until logout, site data is cleared, or `PASS` is rotated.

7.Deploy
- Click "Save and Deploy".
- Wait for the deployment to complete.
After deployment is complete, you can access the system via the domain provided by Cloudflare Pages.
## API Documentation
### 1. Domain Check API
**Endpoint**:`/api/check`
**Method**: GET or POST
**Authentication**: Requires `Authorization: Bearer your_api_token`. Do not put the token in the URL because request URLs can be recorded in proxy, analytics, and access logs.
Response:
```json
{
    "status": 200,
    "message": "Check complete",
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
## Configuration
### Environment Variables
- `USER`: Administrator username
- `PASS`: Administrator password
- `API_TOKEN`: API access token
## Contributing
Contributions are welcome! Please feel free to submit Issues and Pull Requests.
## Stargazers
![alt text](https://starchart.cc/wff0325/Domain-Manager.svg?variant=adaptive)

"CDN acceleration and security protection for this project are sponsored by Tencent EdgeOne: EdgeOne offers a long-term free plan with unlimited traffic and requests, covering Mainland China nodes, with no overage charges. Interested friends can click the link below to claim it"

[Best Asian CDN, Edge, and Secure Solutions - Tencent EdgeOne](https://edgeone.ai/zh?from=github)

<p align = "left">    
<img  src="https://edgeone.ai/media/34fe3a45-492d-4ea4-ae5d-ea1087ca7b4b.png" width="400" height="500" />
</p>

[![Use EdgeOne Pages to deploy](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?repository-url=https://console.tencentcloud.com/edgeone/pages/project/pages-3tg9qzxkm2i4/index?name=domain-manager)

## License
This project is open-source under the MIT License - see the LICENSE file for more details.
