"""Browser acceptance for batch and work queue navigation. Run with Vite at port 5173."""
import base64
import json
import re
from playwright.sync_api import sync_playwright, expect

sites = [
    dict(id=1, name='Astro batch site', stage='验证', lifecycle='active', ownership='自营网站', platform='Astro', operating_scenario='Astro 内容站', page_count=12, calculator_count=0, article_count=2, content_stats_updated_date='2026-11-17', domains=[dict(id=1, website_id=1, domain='astro-batch.test', is_primary=1, domain_role='主域名', status='在线')], open_task_count=0, review_count=0),
    dict(id=2, name='WordPress batch site', stage='增长', lifecycle='active', ownership='自营网站', platform='WordPress', operating_scenario='WordPress 资讯站', article_count=42, content_stats_updated_date='2026-11-17', domains=[dict(id=2, website_id=2, domain='wp-batch.test', is_primary=1, domain_role='主域名', status='在线')], open_task_count=0, review_count=0),
]
batch = dict(id=1, name='November sites', status='进行中', source='域名导入', goal='验证批次经验', hypothesis='不同场景需要不同指标', member_count=2, review_count=0)
detail = dict(**batch, members=[dict(membership_id=1, batch_id=1, website_id=1, joined_at='2026-11-17', member_note='初始成员', membership_status='active', name='Astro batch site', stage='验证', lifecycle='active', platform='Astro', operating_scenario='Astro 内容站', page_count=12, calculator_count=0, article_count=2, content_stats_updated_date='2026-11-17'), dict(membership_id=2, batch_id=1, website_id=2, joined_at='2026-11-17', member_note=None, membership_status='active', name='WordPress batch site', stage='增长', lifecycle='active', platform='WordPress', operating_scenario='WordPress 资讯站', article_count=42, content_stats_updated_date='2026-11-17')], latest_review=None, review_changed=False)
queue = dict(counts=dict(monitor=1, next_action=0, task=0, batch=0, total=1), items=[dict(type='monitor', website_id=1, title='Astro batch site', detail='请求超时')])

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    for site in sites:
        site.update(priority_order=0, next_action_status='待做', adsense_connected='未知', gsc_connected='未知', computer_name='Mac Mini YC', calculator_count=site.get('calculator_count',0), article_count=site.get('article_count',0))
    token = base64.b64encode(json.dumps({'token': 'browser-test'}).encode()).decode()
    page.add_init_script(f"localStorage.setItem('auth_token', {json.dumps(token)})")

    def route_api(route):
        request = route.request
        url = request.url.split('?')[0]
        if url.endswith('/api/websites'):
            route.fulfill(json={'status': 200, 'message': '成功', 'data': sites})
        elif url.endswith('/api/monitor'):
            monitors = [dict(website_id=site['id'], website_name=site['name'], domain=site['domains'][0]['domain'], domain_id=site['domains'][0]['id'], enabled=True, effective_enabled=True, status='failure' if site['id'] == 1 else 'healthy', reason='timeout' if site['id'] == 1 else 'healthy', http_status=None, response_ms=None, final_url=None, title=None, checked_at=None, next_check_at=None, allowed_redirect_hosts=[], consecutive_failures=1) for site in sites]
            route.fulfill(json={'status': 200, 'message': '成功', 'data': dict(monitors=monitors, incidents=[], runner=None, unread_count=0)})
        elif url.endswith('/api/batches') and request.method == 'GET':
            route.fulfill(json={'status': 200, 'message': '成功', 'data': [batch]})
        elif url.endswith('/api/batches/1') and request.method == 'GET':
            route.fulfill(json={'status': 200, 'message': '成功', 'data': detail})
        elif url.endswith('/api/batches/1/members'):
            route.fulfill(json={'status': 200, 'message': '成功', 'data': detail['members']})
        elif url.endswith('/api/work-queue'):
            route.fulfill(json={'status': 200, 'message': '成功', 'data': queue})
        elif url.endswith('/api/dashboard/summary'):
            route.fulfill(json={'status': 200, 'message': '成功', 'data': {}})
        elif '/api/websites/' in url:
            route.fulfill(json={'status': 200, 'message': '成功', 'data': []})
        else:
            route.fulfill(json={'status': 200, 'message': '成功', 'data': []})

    page.route('http://127.0.0.1:5173/api/**', route_api)
    page.goto('http://127.0.0.1:5173/batches')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading', name='网站批次', exact=True)).to_be_visible()
    page.get_by_role('button', name='November sites', exact=True).click()
    expect(page).to_have_url(re.compile(r'/batches/1$'))
    expect(page.get_by_role('heading', name='November sites', exact=True)).to_be_visible()
    expect(page.get_by_text('Astro batch site', exact=True)).to_be_visible()
    expect(page.get_by_text('页面 12', exact=False)).to_be_visible()
    expect(page.get_by_text('可混合不同技术栈和经营场景；网站仍保留自己的阶段与场景。', exact=True)).not_to_be_visible()
    expect(page.get_by_role('button', name='批次编辑', exact=True)).to_be_visible()
    expect(page.get_by_role('heading', name='批次成员', exact=True)).not_to_be_visible()
    expect(page.locator('thead th').filter(has_text='网站 / 主域名')).to_be_visible()
    expect(page.locator('thead th').filter(has_text='内容规模')).to_be_visible()
    page.get_by_role('button', name='批次编辑', exact=True).click()
    expect(page.get_by_role('dialog', name='编辑批次信息', exact=True)).to_be_visible()
    page.get_by_role('button', name='取消', exact=True).click()
    page.get_by_role('button', name='查看', exact=True).first.click()
    expect(page).to_have_url(re.compile(r'/batches/1\?site=1&section=basic$'))
    expect(page.locator('.website-detail-drawer')).to_be_visible()
    page.locator('.website-detail-drawer .el-drawer__close-btn').click()
    if not page.locator('details.workspace-nav-group').evaluate('e=>e.open'):
        page.locator('.workspace-nav-group > summary').click()
    page.get_by_role('button', name='待处理', exact=True).click()
    expect(page.get_by_role('heading', name='待处理', exact=True)).to_be_visible()
    expect(page.get_by_text('请求超时', exact=True)).to_be_visible()
    page.get_by_role('button', name='网站总表', exact=True).click()
    expect(page.get_by_role('heading', name='网站总表', exact=True)).to_be_visible()
    expect(page.locator('.site-table thead th')).to_have_count(11)
    expect(page.locator('.site-table thead th').filter(has_text='服务器 IP')).to_have_count(0)
    page.get_by_role('button', name='Astro batch site', exact=True).click()
    drawer=page.locator('.website-detail-drawer')
    expect(drawer).to_be_visible()
    drawer.get_by_role('tab',name='内容与点击',exact=True).click()
    expect(drawer.get_by_text('计算器数量', exact=True)).to_be_visible()
    expect(drawer.get_by_text('文章数量', exact=True)).to_be_visible()
    expect(drawer.get_by_text('经营场景', exact=True)).to_have_count(0)
    drawer.get_by_role('tab',name='基本资料',exact=True).click()
    expect(drawer.get_by_text('主要管理电脑', exact=True)).to_be_visible()
    page.locator('.website-detail-drawer .el-drawer__close-btn').click()
    page.set_viewport_size({'width':390,'height':844})
    expect(page.locator('.site-table')).to_be_visible()
    browser.close()
print('Batch UI passed')
