"""Browser acceptance for the website portfolio. Run with Vite at port 5173."""
import base64
import json
from playwright.sync_api import sync_playwright, expect

sites = [
    dict(id=1, name="Build one", stage="验证", lifecycle="active", ownership="自营网站", platform="Astro",
         industry="资讯站", potential="先验证搜索需求", priority_order=0, next_action="发布首篇内容",
         next_action_due_date="2026-11-14", next_action_status="待做", adsense_connected="未知", gsc_connected="已开通",
         current_income=[dict(source="AdSense", currency="USD", amount=120)], income_totals=[dict(currency="USD", amount=120)],
         daily_clicks=12, domains=[dict(id=1, website_id=1, domain="build-one.test", domain_role="主域名", is_primary=1, expiry_date="2027-01-01", computer_name="Mac Mini Luokun")],
         resource_ids=[], resource_names=None,
         open_task_count=1, review_count=0),
    dict(id=2, name="Stopped project", stage="维护", lifecycle="stopped", ownership="自营网站", platform="WordPress",
         domains=[dict(id=2, website_id=2, domain="stopped.test", domain_role="主域名", is_primary=1, expiry_date="2027-01-01")],
         open_task_count=0, review_count=0),
    dict(id=3, name="Assess one", stage="待评估", lifecycle="active", ownership="未分类", platform="其他",
         industry="其他", potential="验证需求", priority_order=0, adsense_connected="未知", gsc_connected="未知",
         current_income=[], latest_income=dict(month="2026-10", items=[dict(source="AdSense", currency="USD", amount=574, origin="website"), dict(source="AdSense", currency="CNY", amount=3440, origin="adsense_account")]), income_totals=[dict(currency="USD", amount=574)],
         domains=[dict(id=3, website_id=3, domain="assess.test", domain_role="主域名", is_primary=1, registrar_date="2026-10-01", expiry_date="2027-02-01")],
         open_task_count=0, review_count=0),
    dict(id=4, name="Grow one", stage="增长", lifecycle="active", ownership="自营网站", platform="WordPress",
         industry="计算器", potential="拓展内容", priority_order=0, adsense_connected="已开通", gsc_connected="已开通",
         daily_clicks=80, current_income=[], latest_income=dict(month="2026-10", items=[dict(source="AdSense", currency="USD", amount=20, origin="website")]), income_totals=[dict(currency="USD", amount=20)],
         latest_effort=dict(week_start="2026-11-02", hours=4.5), domains=[dict(id=4, website_id=4, domain="grow.test", domain_role="主域名", is_primary=1, expiry_date="2027-03-01")],
         open_task_count=2, review_count=1),
    dict(id=5, name="Maintain one", stage="维护", lifecycle="active", ownership="自营网站", platform="Astro",
         industry="资讯站", potential="", priority_order=0, adsense_connected="未知", gsc_connected="已开通",
         domains=[dict(id=5, website_id=5, domain="maintain.test", domain_role="主域名", is_primary=1, expiry_date="2027-04-01", status="在线", last_status_check_at="2026-11-06")],
         open_task_count=1, review_count=1),
    dict(id=6, name="Alpha build", stage="验证", lifecycle="active", ownership="自营网站", platform="Astro",
         industry="资讯站", priority_order=1, next_action="提交初版", next_action_status="待做", adsense_connected="未知", gsc_connected="未知",
         domains=[dict(id=6, website_id=6, domain="alpha-build.test", domain_role="主域名", is_primary=1, expiry_date="2027-05-01", computer_name="Windows PC")],
         resource_ids=[], resource_names=None, open_task_count=0, review_count=0),
    dict(id=7, name="Pause one", stage="暂停", lifecycle="active", ownership="自营网站", platform="其他",
         platform_other="Custom CMS", industry="其他", priority_order=0, potential="等待预算", adsense_connected="未知", gsc_connected="未知",
         domains=[dict(id=7, website_id=7, domain="pause.test", domain_role="主域名", is_primary=1, expiry_date="2027-06-01")],
         resource_ids=[], resource_names=None, open_task_count=0, review_count=0),
]
resources = [dict(id=1, provider="cloudflare", name="Build Site", status="正常"), dict(id=2, provider="github", name="Source Repo", status="正常")]
resource_links = [dict(id=1, website_id=6, resource_id=2, role="代码仓库", is_primary=0)]
resource_deletions = []
fail_resource_add = {"value": True}
pending_action_writes = []
errors = []
mode = {"value": "ready", "resource_refresh": False, "hold_next_action": False}
pending_reads = []

def click_select(row, label):
    row.locator(f'.el-select:has(input[aria-label="{label}"]) .el-select__wrapper').click()

def assert_sortable_columns(table):
    columns = table.locator('thead th').count()
    controls = table.locator('thead button.portfolio-sort-trigger').count()
    assert controls == columns - 1, f'expected every data column to sort, got {controls} sort controls for {columns} columns'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 2048, "height": 1000})
    page.on("pageerror", lambda error: errors.append(str(error)))
    token = base64.b64encode(json.dumps({"token": "browser-test"}).encode()).decode()
    page.add_init_script(f"localStorage.setItem('auth_token', {json.dumps(token)})")

    def route_api(route):
        request = route.request
        url = request.url.split("?")[0]
        if url.endswith("/api/websites") and request.method == "GET":
            if mode["value"] == "loading":
                pending_reads.append(route)
            elif mode["value"] == "error":
                route.fulfill(status=503, json={"status": 503, "message": "暂时无法读取网站", "data": None})
            else:
                data = [] if mode["value"] == "empty" else json.loads(json.dumps(sites))
                if mode["resource_refresh"]:
                    for site in data:
                        links = [link for link in resource_links if link["website_id"] == site["id"]]
                        ids = sorted(link["resource_id"] for link in links)
                        site["resource_ids"] = ids
                        selected = [resource for resource in resources if resource["id"] in ids]
                        site["resource_names"] = ", ".join(f"{resource['provider']}: {resource['name']}" for resource in selected) or None
                        primary = next((link for link in links if link.get("is_primary")), links[0] if links else None)
                        primary_resource = next((resource for resource in selected if resource["id"] == primary["resource_id"]), None) if primary else None
                        site["primary_resource_id"] = primary_resource["id"] if primary_resource else None
                        site["primary_resource_provider"] = primary_resource["provider"] if primary_resource else None
                        site["primary_resource_name"] = primary_resource["name"] if primary_resource else None
                route.fulfill(json={"status": 200, "message": "成功", "data": data})
        elif url.endswith("/api/domains") and request.method == "GET":
            domains = [domain for site in sites for domain in site["domains"]]
            domains.append(dict(id=3, website_id=None, domain="unassigned.test", domain_role="备用域名", is_primary=0, registrar="test registrar", expiry_date="2027-02-01", registrar_date="2026-02-01", service_type="网站", status="离线"))
            website_id = request.url.split("website_id=")[-1] if "website_id=" in request.url else None
            if website_id:
                domains = [domain for domain in domains if str(domain.get("website_id")) == website_id]
            route.fulfill(json={"status": 200, "message": "成功", "data": domains})
        elif url.endswith("/api/domains/check"):
            route.fulfill(json={"status": 200, "message": "检查完成", "data": {"status": "在线"}})
        elif url.endswith("/api/domains/batch"):
            route.fulfill(json={"status": 200, "message": "成功", "data": {"accepted": 1}})
        elif url.endswith("/api/domains/3") and request.method == "PATCH":
            route.fulfill(json={"status": 200, "message": "已更新", "data": {"id": 3, "website_id": 1, "domain": "unassigned.test", "status": "离线"}})
        elif url.startswith("http://127.0.0.1:5173/api/domains/") and request.method == "PATCH":
            domain_id = int(url.rsplit("/", 1)[-1])
            domain = next(domain for site in sites for domain in site["domains"] if domain["id"] == domain_id)
            domain.update(json.loads(request.post_data))
            route.fulfill(json={"status": 200, "message": "域名已更新", "data": domain})
        elif url.endswith("/api/resources") and request.method == "GET":
            route.fulfill(json={"status": 200, "message": "成功", "data": resources})
        elif url.endswith("/api/resources/links") and request.method == "GET":
            website_id = int(request.url.split("website_id=")[-1]) if "website_id=" in request.url else None
            route.fulfill(json={"status": 200, "message": "成功", "data": [link for link in resource_links if website_id is None or link["website_id"] == website_id]})
        elif url.endswith("/api/resources/links") and request.method == "POST":
            link = json.loads(request.post_data)
            if fail_resource_add["value"] and link["website_id"] == 6 and link["resource_id"] == 1:
                fail_resource_add["value"] = False
                mode["resource_refresh"] = True
                route.fulfill(status=400, json={"status": 400, "message": "模拟资源关联失败", "data": None})
                return
            if link.get("is_primary"):
                for existing in resource_links:
                    if existing["website_id"] == link["website_id"]:
                        existing["is_primary"] = 0
            link.update(id=len(resource_links) + 1, resource_id=int(link["resource_id"]))
            resource_links.append(link)
            site = next(site for site in sites if site["id"] == link["website_id"])
            site["resource_ids"] = sorted(set(site.get("resource_ids", []) + [link["resource_id"]]))
            selected = [resource for resource in resources if resource["id"] in site["resource_ids"]]
            site["resource_names"] = ", ".join(f"{resource['provider']}: {resource['name']}" for resource in selected) or None
            primary_resource = next((resource for resource in selected if resource["id"] == link["resource_id"]), None)
            if link.get("is_primary") and primary_resource:
                site["primary_resource_id"] = primary_resource["id"]
                site["primary_resource_provider"] = primary_resource["provider"]
                site["primary_resource_name"] = primary_resource["name"]
            route.fulfill(status=201, json={"status": 201, "message": "资源关联成功", "data": link})
        elif url.endswith("/api/resources/links") and request.method == "DELETE":
            link_id = int(request.url.split("id=")[-1])
            resource_deletions.append(link_id)
            removed = next(link for link in resource_links if link["id"] == link_id)
            resource_links.remove(removed)
            site = next(site for site in sites if site["id"] == removed["website_id"])
            site["resource_ids"] = [resource_id for resource_id in site.get("resource_ids", []) if resource_id != removed["resource_id"]]
            if site.get("primary_resource_id") == removed["resource_id"]:
                site["primary_resource_id"] = None
                site["primary_resource_provider"] = None
                site["primary_resource_name"] = None
            route.fulfill(json={"status": 200, "message": "资源关联已解除", "data": None})
        elif "/api/websites/" in url and request.method == "PATCH" and url.rsplit("/", 1)[-1].isdigit():
            website_id = int(url.rsplit("/", 1)[-1])
            site = next(site for site in sites if site["id"] == website_id)
            fields = json.loads(request.post_data)
            if mode["hold_next_action"] and "next_action" in fields:
                pending_action_writes.append((route, site, fields))
                return
            site.update(fields)
            route.fulfill(json={"status": 200, "message": "网站已更新", "data": site})
        elif url.endswith("/api/websites/batch") and request.method == "PATCH":
            body = json.loads(request.post_data)
            for site in sites:
                if site["id"] in body["website_ids"]:
                    site.update(body["fields"])
            route.fulfill(json={"status": 200, "message": "网站批量更新成功", "data": {"accepted": len(body["website_ids"]), "website_ids": body["website_ids"]}})
        elif url.endswith("/api/dashboard/summary"):
            route.fulfill(json={"status": 200, "message": "成功", "data": {}})
        elif "/api/websites/1/tasks" in url:
            route.fulfill(json={"status": 200, "message": "成功", "data": []})
        elif "/api/websites/1/income" in url:
            route.fulfill(json={"status": 200, "message": "成功", "data": [dict(id=None, income_month="2026-10", source="AdSense", currency="CNY", amount=3440, origin="adsense_account")]})
        elif "/api/websites/1/effort" in url:
            route.fulfill(json={"status": 200, "message": "成功", "data": []})
        elif "/api/resources/links" in url or url.endswith("/api/resources") or url.endswith("/api/resources/accounts"):
            route.fulfill(json={"status": 200, "message": "成功", "data": []})
        else:
            route.fulfill(json={"status": 200, "message": "成功", "data": []})

    page.route("http://127.0.0.1:5173/api/**", route_api)
    page.goto("http://127.0.0.1:5173/home")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_role("heading", name="网站组合", exact=True)).to_be_visible()
    expect(page.get_by_text("Build one", exact=True)).to_be_visible()
    page.locator('.portfolio-stage-tabs [data-filter="new"]').click()
    expect(page.get_by_role("button", name="查看网站：Assess one")).to_be_visible()
    expect(page.get_by_role("button", name="查看网站：Build one")).not_to_be_visible()
    page.locator('.portfolio-stage-tabs [data-filter="all"]').click()
    expect(page.locator(".portfolio-table thead").first).to_contain_text("网站归属")
    expect(page.locator(".portfolio-table thead").first).to_contain_text("服务商 / 资源")
    assess_row = page.locator('.portfolio-stage[aria-label="待评估"] .portfolio-row').filter(has=page.get_by_role("button", name="查看网站：Assess one"))
    expect(assess_row.locator('.portfolio-money-cell')).to_contain_text('USD 574.00')
    expect(assess_row.locator('.portfolio-money-cell')).not_to_contain_text('CNY 3440.00')
    paused_row = page.locator('.portfolio-stage[aria-label="暂停"] .portfolio-row').filter(has=page.get_by_role("button", name="查看网站：Pause one"))
    expect(paused_row.locator('.el-select:has(input[aria-label="技术栈：Pause one"])')).to_contain_text('Custom CMS')
    page.screenshot(path="/tmp/domain-manager-portfolio-table.png")
    expect(page.get_by_text("验证", exact=True).first).to_be_visible()
    tabs = page.locator(".portfolio-stage-tabs")
    expect(tabs.get_by_role("button", name="停止经营", exact=False)).to_be_visible()
    expect(page.get_by_text("Stopped project", exact=True)).not_to_be_visible()
    navigation = page.locator(".workspace-navigation")
    expect(navigation.get_by_text("网站归属", exact=True)).to_be_visible()
    expect(navigation.get_by_text("技术栈", exact=True)).to_be_visible()
    navigation.get_by_role("button", name="未分类", exact=True).click()
    expect(page.get_by_role("button", name="查看网站：Assess one")).to_be_visible()
    expect(page.get_by_role("button", name="查看网站：Build one")).not_to_be_visible()
    navigation.get_by_role("button", name="全部归属", exact=True).click()
    navigation.get_by_role("button", name="Astro", exact=True).click()
    expect(page.get_by_role("button", name="查看网站：Build one")).to_be_visible()
    expect(page.get_by_role("button", name="查看网站：Grow one")).not_to_be_visible()
    navigation.get_by_role("button", name="全部技术栈", exact=True).click()
    navigation.get_by_role("button", name="全部归属", exact=True).click()

    verify_table = page.locator('.portfolio-stage[aria-label="验证"] .portfolio-table')
    verify_table.get_by_role("button", name="按网站 / 主域名升序排序", exact=True).click()
    assert verify_table.locator("tbody .portfolio-site-name").all_text_contents() == ["Alpha build", "Build one"]
    verify_table.get_by_role("button", name="按网站 / 主域名降序排序", exact=True).click()
    assert verify_table.locator("tbody .portfolio-site-name").all_text_contents() == ["Build one", "Alpha build"]
    verify_table.get_by_role("button", name="恢复默认排序：网站 / 主域名", exact=True).click()
    assert verify_table.locator("tbody .portfolio-site-name").all_text_contents() == ["Build one", "Alpha build"]
    page.locator('.portfolio-stage[aria-label="待评估"] .portfolio-table').get_by_role("button", name="按阶段升序排序", exact=True).click()
    page.locator('.portfolio-stage[aria-label="待评估"] .portfolio-table').get_by_role("button", name="按阶段降序排序", exact=True).click()
    assert page.locator(".portfolio-stage-heading h2").all_text_contents() == ["暂停", "维护", "增长", "验证", "待评估"]
    page.locator('.portfolio-stage[aria-label="待评估"] .portfolio-table').get_by_role("button", name="恢复默认排序：阶段", exact=True).click()
    assert page.locator(".portfolio-stage-heading h2").all_text_contents() == ["待评估", "验证", "增长", "维护", "暂停"]
    tabs = page.locator(".portfolio-stage-tabs")
    tabs.locator('[data-filter="all"]').click()
    alpha_row = page.locator('.portfolio-stage[aria-label="验证"] .portfolio-row').filter(has=page.get_by_role("button", name="查看网站：Alpha build"))
    click_select(alpha_row, "服务商 / 资源：Alpha build")
    with page.expect_response(lambda response: response.url.endswith("/api/resources/links") and response.request.method == "POST") as failed_resource_add:
        page.get_by_role("option", name="Build Site", exact=True).click()
    assert failed_resource_add.value.status == 400
    assert resource_links == [dict(id=1, website_id=6, resource_id=2, role="代码仓库", is_primary=0)]
    assert resource_deletions == [], "old resources must remain until new associations succeed"
    expect(alpha_row.locator('.el-select:has(input[aria-label="服务商 / 资源：Alpha build"])')).to_contain_text("Source Repo")
    build_row = page.locator('.portfolio-stage[aria-label="验证"] .portfolio-row').filter(has=page.get_by_role("button", name="查看网站：Build one"))
    build_row.get_by_role("button", name="编辑日点击：Build one").click()
    click_editor = page.locator('.portfolio-click-editor:visible')
    click_editor.get_by_role("spinbutton", name="精确日点击").fill("24")
    click_editor.locator('input[aria-label="点击统计日期"]').fill("2026-11-08")
    with page.expect_response(lambda response: response.url.endswith("/api/websites/1") and response.request.method == "PATCH") as clicks_response:
        click_editor.get_by_role("button", name="保存", exact=True).click()
    assert json.loads(clicks_response.value.request.post_data) == {"daily_clicks": 24, "daily_clicks_range": None, "clicks_updated_date": "2026-11-08"}
    with page.expect_response(lambda response: response.url.endswith("/api/websites/1") and response.request.method == "PATCH") as platform_response:
        click_select(build_row, "技术栈：Build one")
        page.get_by_role("option", name="Next.js", exact=True).click()
    assert json.loads(platform_response.value.request.post_data) == {"platform": "Next.js", "platform_other": None}
    click_select(build_row, "服务商 / 资源：Build one")
    with page.expect_response(lambda response: response.url.endswith("/api/resources/links") and response.request.method == "POST") as resource_response:
        page.get_by_role("option", name="Build Site", exact=True).click()
    assert json.loads(resource_response.value.request.post_data) == {"website_id": 1, "resource_id": 1, "role": "部署平台", "is_primary": True}
    with page.expect_response(lambda response: response.url.endswith("/api/domains/1") and response.request.method == "PATCH") as computer_response:
        click_select(build_row, "电脑：Build one")
        page.get_by_role("option", name="Windows PC", exact=True).click()
    assert json.loads(computer_response.value.request.post_data) == {"computer_name": "Windows PC"}
    with page.expect_response(lambda response: response.url.endswith("/api/websites/1") and response.request.method == "PATCH") as stage_response:
        click_select(build_row, "网站阶段：Build one")
        page.get_by_role("option", name="增长", exact=True).last.click()
    assert json.loads(stage_response.value.request.post_data) == {"stage": "增长"}
    build_row = page.locator('.portfolio-stage[aria-label="增长"] .portfolio-row').filter(has=page.get_by_role("button", name="查看网站：Build one"))
    build_row.get_by_role("button", name="编辑下一步：Build one").click()
    next_action = page.get_by_role("textbox", name="下一步行动")
    next_action.fill("发布专题页并检查点击变化")
    page.locator(".portfolio-next-editor:visible .el-select__wrapper").click()
    page.get_by_role("option", name="处理中", exact=True).last.click()
    page.locator('.portfolio-next-editor:visible .el-date-editor input').fill('2026-12-01')
    with page.expect_response(lambda response: response.url.endswith("/api/websites/1") and response.request.method == "PATCH") as next_action_response:
        page.get_by_role("button", name="保存下一步").click()
    assert json.loads(next_action_response.value.request.post_data) == {"next_action": "发布专题页并检查点击变化", "next_action_status": "处理中", "next_action_due_date": "2026-12-01"}
    build_row.get_by_role("button", name="编辑下一步：Build one").click()
    next_action = page.get_by_role("textbox", name="下一步行动")
    next_action.fill("保存期间保持锁定")
    mode["hold_next_action"] = True
    with page.expect_request(lambda request: request.url.endswith("/api/websites/1") and request.method == "PATCH") as pending_action_request:
        page.get_by_role("button", name="保存下一步").click()
    expect(next_action).to_be_disabled()
    expect(page.get_by_role("combobox", name="下一步状态")).to_be_disabled()
    expect(page.locator('.portfolio-next-editor:visible .el-date-editor input')).to_be_disabled()
    expect(page.get_by_role("button", name="取消", exact=True)).to_be_disabled()
    expect(build_row.get_by_role("button", name="编辑下一步：Build one")).to_be_disabled()
    pending_route, pending_site, pending_fields = pending_action_writes.pop()
    assert json.loads(pending_action_request.value.post_data) == {"next_action": "保存期间保持锁定"}
    pending_site.update(pending_fields)
    pending_route.fulfill(json={"status": 200, "message": "网站已更新", "data": pending_site})
    mode["hold_next_action"] = False
    expect(page.locator(".portfolio-next-editor:visible")).to_have_count(0)
    tabs.locator('[data-filter="待评估"]').click()
    expect(page.locator(".portfolio-table thead")).to_contain_text("潜力说明")
    expect(page.locator(".portfolio-table thead")).not_to_contain_text("本月收入")
    assert_sortable_columns(page.locator('.portfolio-stage[aria-label="待评估"] .portfolio-table'))
    tabs.locator('[data-filter="验证"]').click()
    expect(page.locator(".portfolio-table thead")).to_contain_text("验证下一步")
    expect(page.locator(".portfolio-table thead")).to_contain_text("任务 / 复查")
    assert_sortable_columns(page.locator('.portfolio-stage[aria-label="验证"] .portfolio-table'))
    tabs.locator('[data-filter="增长"]').click()
    expect(page.locator(".portfolio-table thead")).to_contain_text("最近每周投入")
    growth_table = page.locator('.portfolio-stage[aria-label="增长"] .portfolio-table')
    assert_sortable_columns(growth_table)
    grow_row = growth_table.locator('.portfolio-row').filter(has=page.get_by_role("button", name="查看网站：Grow one"))
    expect(grow_row.locator('.portfolio-money-cell')).to_contain_text('USD 20.00')
    growth_table.get_by_role('button', name='按服务商 / 资源升序排序', exact=True).click()
    assert growth_table.locator('tbody .portfolio-site-name').all_text_contents() == ['Grow one', 'Build one']
    growth_table.get_by_role('button', name='按服务商 / 资源降序排序', exact=True).click()
    assert growth_table.locator('tbody .portfolio-site-name').all_text_contents() == ['Build one', 'Grow one']
    growth_table.get_by_role('button', name='按本月收入升序排序', exact=True).click()
    assert growth_table.locator('tbody .portfolio-site-name').all_text_contents() == ['Grow one', 'Build one']
    growth_table.get_by_role('button', name='按本月收入降序排序', exact=True).click()
    assert growth_table.locator('tbody .portfolio-site-name').all_text_contents() == ['Build one', 'Grow one']
    tabs.locator('[data-filter="维护"]').click()
    expect(page.locator(".portfolio-table thead")).to_contain_text("域名状态 / 检测时间")
    assert_sortable_columns(page.locator('.portfolio-stage[aria-label="维护"] .portfolio-table'))
    tabs.locator('[data-filter="暂停"]').click()
    expect(page.locator('.portfolio-stage[aria-label="暂停"] .portfolio-table thead')).to_contain_text('潜力 / 暂停原因')
    paused_table = page.locator('.portfolio-stage[aria-label="暂停"] .portfolio-table')
    assert_sortable_columns(paused_table)
    tabs.locator('[data-filter="all"]').click()
    tabs.locator('[data-filter="stopped"]').click()
    expect(page.get_by_text("Stopped project", exact=True)).to_be_visible()
    expect(page.get_by_text("Build one", exact=True)).not_to_be_visible()
    stopped_table = page.locator('.portfolio-stopped-table')
    assert_sortable_columns(stopped_table)
    expect(stopped_table.get_by_role('combobox', name='网站阶段：Stopped project')).to_be_visible()
    tabs.locator('[data-filter="all"]').click()
    expect(page.get_by_role("button", name="查看详情：Build one")).to_be_visible()
    page.get_by_role("button", name="查看详情：Build one").click()
    expect(page.get_by_role("heading", name="Build one", exact=True)).to_be_visible()
    page.locator('.website-detail-drawer .el-drawer__close-btn').click()
    page.get_by_role("button", name="查看网站：Build one").click()
    expect(page.get_by_role("heading", name="Build one", exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name="网站任务", exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name="收入与投入", exact=True)).to_be_visible()
    expect(page.get_by_text("2026-10 · AdSense · CNY · 账号收入", exact=True)).to_be_visible()
    expect(page.locator(".portfolio-table thead").first).to_contain_text("操作")
    page.locator('.website-detail-drawer .el-drawer__close-btn').click()
    assess_header_checkbox = page.locator('.portfolio-stage[aria-label="待评估"] .portfolio-header-with-selection .el-checkbox[aria-label="选择全部待评估网站"]')
    assess_header_checkbox.click()
    expect(page.get_by_role("region", name="批量操作")).to_contain_text("已选 1 个网站")
    assess_header_checkbox.click()
    expect(page.get_by_role("region", name="批量操作")).to_have_count(0)
    assess_checkbox = page.locator('.el-checkbox[aria-label="选择网站：Assess one"]')
    alpha_checkbox = page.locator('.el-checkbox[aria-label="选择网站：Alpha build"]')
    expect(assess_checkbox).to_be_visible()
    assess_checkbox.click()
    alpha_checkbox.click()
    expect(page.get_by_role("region", name="批量操作")).to_contain_text("已选 2 个网站")
    page.locator('.portfolio-bulk-toolbar .el-select__wrapper').click()
    page.get_by_role("option", name="增长", exact=True).last.click()
    with page.expect_response(lambda response: response.url.endswith("/api/websites/batch") and response.request.method == "PATCH") as bulk_response:
        page.get_by_role("button", name="设置阶段", exact=True).click()
    assert json.loads(bulk_response.value.request.post_data) == {"website_ids": [3, 6], "fields": {"stage": "增长"}}
    expect(page.get_by_role("region", name="批量操作")).to_have_count(0)
    page.get_by_role("button", name="查看网站：Build one").click()
    assert not errors, errors
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(500)
    drawer_width = page.locator(".website-detail-drawer").evaluate("element => element.getBoundingClientRect().width")
    assert 350 <= drawer_width <= 390, f"mobile drawer width: {drawer_width}"
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "mobile page overflows horizontally"
    page.screenshot(path="/tmp/domain-manager-portfolio-mobile.png")
    page.keyboard.press("Escape")
    page.get_by_role("button", name="打开导航").click()
    mobile_navigation = page.locator(".workspace-navigation-drawer")
    expect(mobile_navigation.get_by_text("网站归属", exact=True)).to_be_visible()
    expect(mobile_navigation.get_by_text("技术栈", exact=True)).to_be_visible()
    mobile_navigation.get_by_role("button", name="WordPress", exact=True).click()
    expect(page.get_by_role("button", name="查看网站：Grow one")).to_be_visible()
    expect(page.get_by_role("button", name="查看网站：Assess one")).not_to_be_visible()
    page.goto("http://127.0.0.1:5173/domains")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_role("heading", name="域名资产", exact=True)).to_be_visible()
    expect(page.get_by_text("unassigned.test", exact=True)).to_be_visible()
    expect(page.get_by_role("combobox", name="unassigned.test 所属网站")).to_be_visible()
    mode["value"] = "error"
    page.goto("http://127.0.0.1:5173/home")
    expect(page.get_by_role("alert").filter(has_text="暂时无法读取网站")).to_be_visible()
    mode["value"] = "ready"
    page.get_by_role("button", name="重试", exact=True).click()
    expect(page.get_by_role("button", name="查看网站：Build one")).to_be_visible()
    mode["value"] = "empty"
    page.reload()
    expect(page.get_by_text("还没有网站，先新增一个网站和域名。", exact=True)).to_be_visible()
    mode["value"] = "loading"
    page.reload(wait_until="domcontentloaded")
    expect(page.get_by_text("正在加载网站…", exact=True)).to_be_visible()
    mode["value"] = "ready"
    for pending in pending_reads:
        pending.fulfill(json={"status": 200, "message": "成功", "data": sites})
    expect(page.get_by_role("button", name="查看网站：Build one")).to_be_visible()
    assert not errors, errors
    browser.close()
print("Portfolio browser acceptance passed")
