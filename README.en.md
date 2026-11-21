# Domain Manager

Manage websites, domains, deployment accounts, repositories, tasks, monitoring, income and effort using Vue, Cloudflare Pages and D1.

The current installation, verification, database upgrade and deployment instructions are maintained in [README.md](README.md). See [website structure](docs/website-structure.md), [database structure](docs/database-structure.md) and [release procedure](docs/cleanup-release.md).

Backups use format_version=1 through the single /api/backups endpoint. Credentials and favicon cache are excluded. Existing databases require a verified backup and the v1.25.0/v1.26.0 migrations before publishing the matching application and monitoring Worker.
