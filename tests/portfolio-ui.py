"""Browser acceptance for the website portfolio. Run with Vite at port 5173."""
import base64
import json
from playwright.sync_api import sync_playwright, expect

sites = [
    dict(id=1, name="Build one", stage="验证", lifecycle="active", ownership="自营网站", platform="Astro",
         industry="资讯站", potential="先验证搜索需求", priority_order=0, next_action="发布首篇内容",
         next_action_due_date="2026-11-14", next_action_status="待做", adsense_connected="未知", gsc_connected="已开通",
         daily_clicks=12, domains=[dict(id=1, website_id=1, domain="build-one.test", domain_role="主域名", is_primary=1, expiry_date="2027-01-01")],
         open_task_count=1, review_count=0),
    dict(id=2, name="Stopped project", stage="维护", lifecycle="stopped", ownership="自营网站", platform="WordPress",
         domains=[dict(id=2, website_id=2, domain="stopped.test", domain_role="主域名", is_primary=1, expiry_date="2027-01-01")],
         open_task_count=0, review_count=0),
    dict(id=3, name="Assess one", stage="待评估", lifecycle="active", ownership="未分类", platform="其他",
         industry="其他", potential="验证需求", priority_order=0, adsense_connected="未知", gsc_connected="未知",
         domains=[dict(id=3, website_id=3, domain="assess.test", domain_role="主域名", is_primary=1, expiry_date="2027-02-01")],
         open_task_count=0, review_count=0),
    dict(id=4, name="Grow one", stage="增长", lifecycle="active", ownership="自营网站", platform="WordPress",
         industry="计算器", potential="拓展内容", priority_order=0, adsense_connected="已开通", gsc_connected="已开通",
         daily_clicks=80, current_income=[dict(source="AdSense", currency="USD", amount=120)],
         latest_effort=dict(week_start="2026-11-02", hours=4.5), domains=[dict(id=4, website_id=4, domain="grow.test", domain_role="主域名", is_primary=1, expiry_date="2027-03-01")],
         open_task_count=2, review_count=1),
    dict(id=5, name="Maintain one", stage="维护", lifecycle="active", ownership="自营网站", platform="Astro",
         industry="资讯站", potential="", priority_order=0, adsense_connected="未知", gsc_connected="已开通",
         domains=[dict(id=5, website_id=5, domain="maintain.test", domain_role="主域名", is_primary=1, expiry_date="2027-04-01", status="在线", last_status_check_at="2026-11-06")],
         open_task_count=1, review_count=1),
]
errors = []
mode = {"value": "ready"}
pending_reads = []

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
                route.fulfill(json={"status": 200, "message": "成功", "data": [] if mode["value"] == "empty" else sites})
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
        elif url.endswith("/api/dashboard/summary"):
            route.fulfill(json={"status": 200, "message": "成功", "data": {}})
        elif "/api/websites/1/tasks" in url:
            route.fulfill(json={"status": 200, "message": "成功", "data": []})
        elif "/api/websites/1/income" in url or "/api/websites/1/effort" in url:
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
    expect(page.locator(".portfolio-table thead").first).to_contain_text("网站归属")
    expect(page.locator(".portfolio-table thead").first).to_contain_text("服务商 / 资源")
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
    tabs.locator('[data-filter="待评估"]').click()
    expect(page.locator(".portfolio-table thead")).to_contain_text("潜力说明")
    expect(page.locator(".portfolio-table thead")).not_to_contain_text("本月收入")
    tabs.locator('[data-filter="验证"]').click()
    expect(page.locator(".portfolio-table thead")).to_contain_text("验证下一步")
    expect(page.locator(".portfolio-table thead")).to_contain_text("任务 / 复查")
    tabs.locator('[data-filter="增长"]').click()
    expect(page.locator(".portfolio-table thead")).to_contain_text("最近每周投入")
    tabs.locator('[data-filter="维护"]').click()
    expect(page.locator(".portfolio-table thead")).to_contain_text("域名状态 / 检测时间")
    tabs.locator('[data-filter="all"]').click()
    tabs.locator('[data-filter="stopped"]').click()
    expect(page.get_by_text("Stopped project", exact=True)).to_be_visible()
    expect(page.get_by_text("Build one", exact=True)).not_to_be_visible()
    tabs.locator('[data-filter="all"]').click()
    page.get_by_role("button", name="查看网站：Build one").click()
    expect(page.get_by_role("heading", name="Build one", exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name="网站任务", exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name="收入与投入", exact=True)).to_be_visible()
    expect(page.locator(".portfolio-table thead").first).to_contain_text("排序 / 详情")
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
