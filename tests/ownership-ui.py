"""Browser acceptance checks. Run with Vite on http://127.0.0.1:5173.

Uses in-memory API responses; real handler/SQLite contracts are tested separately
in ownership.test.mjs. Requires Python Playwright and its Chromium browser.
"""
import base64
import json
import zipfile
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect


def website(id, ownership, platform):
    return dict(id=id, domain=f"site{id}.test", site_name=f"网站{id}", ownership=ownership,
                platform=platform, industry="计算器", registrar="test", registrar_link="",
                registrar_date="2026-01-01", expiry_date="2027-01-01", service_type="正常网站",
                status="在线", memo="", adsense_account_id=None,
                adsense_connected="未知", adsense_opened_date=None, seo_last_date=None,
                daily_clicks=None, daily_clicks_range=None, clicks_updated_date=None,
                platform_other=None, wp_article_count=None, wp_calculator_count=None,
                content_stats_updated_date=None, last_status_check_at=None, resource_status="未关联")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport=dict(width=1440, height=1000))
    rows = [website(1, "自营网站", "WordPress"), website(2, "自营网站", "Astro"),
            website(3, "企业客户网站", "WordPress"), website(4, "企业客户网站", "Next.js"),
            website(5, "未分类", "WordPress")]
    requests = []
    errors = []
    fail_patch = [False]
    hold_patch = [False]
    held_patch = []
    held_summary = []
    hold_ownership = [None]
    page.on("pageerror", lambda error: errors.append(str(error)))

    def api(route):
        req = route.request
        url = urlparse(req.url)
        query = {key: value[0] for key, value in parse_qs(url.query).items()}
        requests.append((req.method, url.path, query))
        data = []
        if url.path == "/api/domains":
            if req.method == "POST":
                row = dict(req.post_data_json, id=len(rows) + 1)
                rows.append(row)
                data = row
            else:
                data = rows
        elif url.path.startswith("/api/domains/") and req.method in ("PATCH", "PUT"):
            if hold_patch[0]:
                held_patch.append(route)
                return
            if fail_patch[0]:
                route.fulfill(status=500, json=dict(status=500, message="测试保存失败", data=None))
                return
            row = next(row for row in rows if row["id"] == int(url.path.split("/")[-1]))
            row.update(req.post_data_json)
            data = row
        elif url.path == "/api/export/snapshot":
            data = dict(domains=rows)
        elif url.path == "/api/dashboard/summary":
            selected = [row for row in rows if all(query.get(key, "all") in ("all", row[key]) for key in ("ownership", "platform"))]
            data = dict(totals=dict(total_domains=len(selected), expiring_domains=1, excellent_wordpress=2,
                                    excellent_astro=3, excellent_nextjs=4), seo=[], clicks={}, providers=[],
                        owner_income=[], platforms=[], quality={})
            if query.get("ownership") == hold_ownership[0]:
                held_summary.append((route, data))
                return
        route.fulfill(json=dict(status=200, message="成功", data=data))

    page.route("http://127.0.0.1:5173/api/**", api)
    token = base64.b64encode(json.dumps(dict(token="browser-test")).encode()).decode()
    page.add_init_script(f"localStorage.setItem('auth_token', {json.dumps(token)})")
    page.goto("http://127.0.0.1:5173/home")
    page.wait_for_load_state("networkidle")
    nav = page.locator(".workspace-navigation")
    expect(nav.get_by_role("button", name="全部归属", exact=True)).to_be_visible()
    hold_patch[0] = True
    first_ownership = page.get_by_role("combobox", name="site1.test 网站归属", exact=True)
    first_ownership.locator('xpath=ancestor::div[contains(@class, "el-select__wrapper")]').click()
    page.get_by_role("option", name="企业客户网站", exact=True).click()
    expect(first_ownership).to_be_disabled()
    assert held_patch
    held_patch[0].fulfill(status=500, json=dict(status=500, message="延迟保存失败", data=None))
    hold_patch[0] = False
    expect(first_ownership).to_be_enabled()
    expect(first_ownership.locator('xpath=ancestor::div[contains(@class, "el-select__wrapper")]')).to_contain_text("自营网站")
    nav.get_by_role("button", name="企业客户网站", exact=True).click()
    expect(page.locator(".el-table__body-wrapper tbody tr")).to_have_count(2)
    expect(nav.get_by_role("button", name="WordPress", exact=True)).to_have_attribute("title", "WordPress · 1 个网站")
    nav.get_by_role("button", name="WordPress", exact=True).click()
    expect(page.locator(".el-table__body-wrapper tbody tr")).to_have_count(1)
    expect(page.get_by_role("heading", level=1)).to_contain_text("企业客户网站")
    expect(nav.get_by_role("button", name="自营网站", exact=True)).to_have_attribute("title", "自营网站 · 1 个网站")
    expect(nav.get_by_text("临期域名", exact=True)).to_be_visible()
    expect(nav.locator(".workspace-nav-metrics strong").nth(0)).to_have_text("1")
    expect(nav.locator(".workspace-nav-metrics strong")).to_have_count(4)
    search = page.get_by_placeholder("搜索域名、网站名称、类型、备注")
    search.fill("nomatch")
    expect(page.get_by_text("没有匹配的网站", exact=True)).to_be_visible()
    expect(nav.locator(".workspace-nav-metrics strong").nth(0)).to_have_text("1")
    search.fill("")
    page.go_back()
    expect(page.locator(".el-table__body-wrapper tbody tr")).to_have_count(2)
    page.go_forward()
    expect(page.locator(".el-table__body-wrapper tbody tr")).to_have_count(1)
    page.reload()
    expect(page.locator(".el-table__body-wrapper tbody tr")).to_have_count(1)
    page.get_by_role("button", name="详情：site3.test", exact=True).click()
    expect(page.locator(".domain-detail-drawer").get_by_text("企业客户网站", exact=True)).to_be_visible()
    page.go_back()
    expect(page.locator(".domain-detail-drawer")).not_to_be_visible()
    # Failed saves must leave the original row and selected class intact.
    fail_patch[0] = True
    page.get_by_role("combobox", name="site3.test 网站归属", exact=True).locator('xpath=ancestor::div[contains(@class, "el-select__wrapper")]').click()
    page.get_by_role("option", name="自营网站", exact=True).click()
    expect(page.get_by_text("测试保存失败", exact=True)).to_be_visible()
    expect(page.locator(".el-table__body-wrapper tbody tr")).to_have_count(1)
    fail_patch[0] = False
    page.get_by_role("combobox", name="site3.test 网站归属", exact=True).locator('xpath=ancestor::div[contains(@class, "el-select__wrapper")]').click()
    page.get_by_role("option", name="自营网站", exact=True).click()
    expect(page.get_by_text("已保存，该网站不在当前筛选范围内", exact=True)).to_be_visible()
    expect(page.get_by_text("没有匹配的网站", exact=True)).to_be_visible()
    page.get_by_role("button", name="新增域名", exact=True).first.click()
    expect(page.locator("#ownership-input").locator('xpath=ancestor::div[contains(@class, "el-select__wrapper")]')).to_contain_text("自营网站")
    page.locator("#domain-input").fill("created.test")
    page.locator("#registrar-input").fill("test")
    page.locator("#registrar-date-input").fill("2026-01-01")
    page.locator("#expiry-date-input").fill("2027-01-01")
    page.locator("#domain-input").click()
    page.get_by_role("button", name="确定", exact=True).click()
    expect(page.locator(".el-dialog")).not_to_be_visible()
    expect(page.get_by_text("已保存，该网站不在当前筛选范围内", exact=True).last).to_be_visible()
    assert rows[-1]["domain"] == "created.test" and rows[-1]["ownership"] == "自营网站"
    assert "ownership=" in page.url and "platform=WordPress" in page.url
    expect(page.get_by_role("button", name="导出全部", exact=True)).to_be_visible()
    with page.expect_download() as download:
        page.get_by_role("button", name="导出全部", exact=True).click()
    workbook_path = download.value.path()
    with zipfile.ZipFile(workbook_path) as workbook:
        sheet = workbook.read("xl/worksheets/sheet1.xml").decode()
        assert all(value in sheet for value in ("ownership", "自营网站", "企业客户网站", "未分类", "created.test"))
    # A delayed earlier filter response must not overwrite the latest overview.
    hold_ownership[0] = "自营网站"
    nav.get_by_role("button", name="自营网站", exact=True).click()
    page.wait_for_function("document.querySelector('h1').textContent.includes('自营网站')")
    page.wait_for_timeout(100)
    nav.get_by_role("button", name="未分类", exact=True).click()
    expect(nav.locator(".workspace-nav-metrics strong").nth(0)).to_have_text("1")
    assert held_summary, "the earlier filter request must be in flight"
    for route, data in held_summary:
        route.fulfill(json=dict(status=200, message="成功", data=data))
    page.wait_for_load_state("networkidle")
    expect(nav.locator(".workspace-nav-metrics strong").nth(0)).to_have_text("1")
    held_summary.clear()
    page.reload()
    expect(nav.locator(".workspace-nav-metrics strong").nth(0)).to_have_text("1")
    nav.get_by_role("button", name="自营网站", exact=True).click()
    page.wait_for_function("document.querySelector('h1').textContent.includes('自营网站')")
    page.wait_for_timeout(100)
    nav.get_by_role("button", name="未分类", exact=True).click()
    expect(nav.locator(".workspace-nav-metrics strong").nth(0)).to_have_text("1")
    assert held_summary
    for route, _ in held_summary:
        route.fulfill(status=500, json=dict(status=500, message="旧筛选请求失败", data=None))
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("概览数据未能完整加载，列表数据仍可继续使用。", exact=True)).not_to_be_visible()
    assert any(query.get("ownership") == "企业客户网站" and query.get("platform") == "WordPress" for _, path, query in requests if path == "/api/dashboard/summary")
    assert not errors, errors
    page.wait_for_timeout(400)
    page.screenshot(path="/tmp/domain-manager-ownership-desktop.png", full_page=True)
    print("Desktop ownership acceptance passed")
    page.set_viewport_size(dict(width=390, height=844))
    page.get_by_role("button", name="打开导航", exact=True).click()
    mobile_nav = page.locator(".workspace-navigation-drawer")
    mobile_nav.get_by_role("button", name="企业客户网站", exact=True).click()
    expect(mobile_nav).not_to_be_visible()
    expect(page.get_by_text("没有匹配的网站", exact=True)).to_be_visible()
    page.get_by_role("button", name="打开导航", exact=True).click()
    mobile_nav.get_by_role("button", name="全部技术栈", exact=True).click()
    expect(page.locator(".el-table__body-wrapper tbody tr")).to_have_count(1)
    expect(page.get_by_role("heading", level=1)).to_contain_text("企业客户网站")
    page.reload()
    expect(page.locator(".el-table__body-wrapper tbody tr")).to_have_count(1)
    page.get_by_role("button", name="修改：site4.test", exact=True).click()
    ownership_control = page.locator("#ownership-input").locator('xpath=ancestor::div[contains(@class, "el-select__wrapper")]')
    expect(ownership_control).to_contain_text("企业客户网站")
    ownership_control.click()
    page.get_by_role("option", name="未分类", exact=True).click()
    page.get_by_role("button", name="确定", exact=True).click()
    expect(page.locator(".el-dialog")).not_to_be_visible()
    expect(page.get_by_text("没有匹配的网站", exact=True)).to_be_visible()
    assert next(row for row in rows if row["id"] == 4)["ownership"] == "未分类"
    page.get_by_role("button", name="显示概览", exact=True).click()
    expect(page.get_by_role("heading", name="AdSense 累计收入 · 全局", exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name="基础设施 · 全局", exact=True)).to_be_visible()
    page.screenshot(path="/tmp/domain-manager-ownership-mobile.png", full_page=True)
    assert not errors, errors
    print("Mobile ownership acceptance passed")
    browser.close()
