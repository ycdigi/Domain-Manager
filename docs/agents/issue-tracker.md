# Issue tracker: GitHub

本项目的功能规格与事项发布到 GitHub 仓库 `ycdigi/Domain-Manager` 的 Issues，使用 `gh` CLI。所有命令显式指定 `--repo ycdigi/Domain-Manager`，避免发布到上游或其他仓库。

## 发布规格

- 发布前确认目标仓库可访问且已启用 Issues。
- 先检索现有事项，避免重复发布相同规格。
- 使用已经确认测试边界的规格正文；多行正文通过本地文件和 `--body-file` 传递。
- `to-spec` 发布时应用 `ready-for-agent` 标签。先检查标签是否存在；缺少时创建该标签，再发布规格。
- 发布后读取事项标题、正文与标签，核对完整内容，并向用户返回事项链接。
- 本次规格发布不等同于功能部署或数据库迁移。

## 常用操作

- 发布：`gh issue create --repo ycdigi/Domain-Manager --title "..." --body-file <file> --label ready-for-agent`
- 读取：`gh issue view <number> --repo ycdigi/Domain-Manager --json number,title,body,labels,url`
- 检索：`gh issue list --repo ycdigi/Domain-Manager --state all --search "..." --json number,title,url,labels`
- 标签检查：`gh label list --repo ycdigi/Domain-Manager --json name,description,color`
- 修改事项正文：`gh issue edit <number> --repo ycdigi/Domain-Manager --body-file <file>`

## Pull requests as a triage surface

**PRs as a request surface: no.**
