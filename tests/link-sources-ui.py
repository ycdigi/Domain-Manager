"""Browser acceptance for source review and website-level link opportunities."""
import base64
import json
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:5173'
sources = []
opportunities = []
attempts = []
errors = []

website = {
    'id': 1, 'name': 'Example calculator', 'stage': '增长', 'lifecycle': 'active',
    'ownership': '自营网站', 'industry': '计算器', 'platform': 'Astro', 'priority_order': 0,
    'next_action_status': '待做', 'adsense_connected': '未知', 'gsc_connected': '未知',
    'domains': [{'id': 1, 'website_id': 1, 'domain': 'example.com', 'domain_role': '主域名', 'is_primary': 1,
                 'registrar': 'test', 'registrar_date': '2026-01-01', 'expiry_date': '2027-01-01',
                 'service_type': '网站', 'status': '在线'}],
    'open_task_count': 0, 'review_count': 0, 'resource_ids': [], 'income_totals': []
}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    token = base64.b64encode(json.dumps({'token': 'browser-test'}).encode()).decode()
    page.add_init_script(f"localStorage.setItem('auth_token', {json.dumps(token)})")

    def handle(route):
        request = route.request
        url = request.url.split('?', 1)[0]
        method = request.method
        if url.endswith('/api/link-sources') and method == 'GET':
            data = sources
        elif url.endswith('/api/link-sources') and method == 'POST':
            body = json.loads(request.post_data)
            body.update(id=len(sources) + 1, enabled=1 if body.get('approval_status') == '已批准' else 0, opportunity_count=0)
            sources.append(body)
            route.fulfill(status=201, json={'status': 201, 'message': '已创建', 'data': body})
            return
        elif '/api/link-sources/' in url and method == 'PATCH':
            source_id = int(url.rsplit('/', 1)[-1]); body = json.loads(request.post_data)
            source = next(item for item in sources if item['id'] == source_id)
            source.update(body)
            if source['approval_status'] != '已批准': source['enabled'] = 0
            elif 'enabled' not in body and source.get('approval_status') == '已批准': source['enabled'] = 1
            route.fulfill(json={'status': 200, 'message': '已更新', 'data': source})
            return
        elif url.endswith('/api/websites') and method == 'GET':
            data = [website]
        elif url.endswith('/api/domains') and method == 'GET':
            data = website['domains']
        elif url.endswith('/api/adsense/accounts'):
            data = []
        elif url.endswith('/api/resources') or url.endswith('/api/resources/links'):
            data = []
        elif url.endswith('/api/websites/1/tasks') or url.endswith('/api/websites/1/income') or url.endswith('/api/websites/1/effort') or url.endswith('/api/websites/1/operations') or url.endswith('/api/websites/1/ai-notes'):
            data = []
        elif url.endswith('/api/websites/1/link-opportunities') and method == 'GET':
            data = opportunities
        elif url.endswith('/api/websites/1/link-opportunities') and method == 'POST':
            body = json.loads(request.post_data)
            body.update(id=len(opportunities) + 1, website_id=1, source_name=sources[body['source_id'] - 1]['name'], source_url=sources[body['source_id'] - 1]['source_url'], url_template=sources[body['source_id'] - 1].get('url_template'), source_type=sources[body['source_id'] - 1]['source_type'], approval_status=sources[body['source_id'] - 1]['approval_status'], source_enabled=sources[body['source_id'] - 1]['enabled'])
            opportunities.append(body)
            route.fulfill(status=201, json={'status': 201, 'message': '已创建', 'data': body})
            return
        elif '/attempts' in url and method == 'GET':
            data = attempts
        elif '/attempts' in url and method == 'POST':
            body = json.loads(request.post_data); body.setdefault('method', '人工'); body.update(id=len(attempts) + 1, opportunity_id=1, attempted_at='2026-11-08 12:00:00')
            attempts.append(body)
            request_status = body['request_status']
            result_status = body.get('result_status')
            status = '已确认公开链接' if body['confirmed_public_link'] else result_status or ('请求失败' if request_status == '失败' else '需要人工处理' if request_status == '需要人工' else '请求已完成')
            opportunities[0].update(status=status, last_attempt_at=body['attempted_at'], evidence_url=body.get('evidence_url'))
            route.fulfill(status=201, json={'status': 201, 'message': '已记录', 'data': body})
            return
        elif '/api/websites/1/link-opportunities/1' in url and method == 'PATCH':
            body = json.loads(request.post_data); opportunities[0].update(body)
            route.fulfill(json={'status': 200, 'message': '已更新', 'data': opportunities[0]})
            return
        else:
            data = []
        route.fulfill(json={'status': 200, 'message': '成功', 'data': data})

    page.route('http://127.0.0.1:5173/api/**', handle)
    page.goto(BASE + '/links')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading', name='外链来源', exact=True)).to_be_visible()
    page.get_by_role('button', name='新增来源', exact=True).click()
    dialog = page.get_by_role('dialog', name='新增外链来源', exact=True)
    dialog.get_by_role('textbox', name='来源名称').fill('Example directory')
    dialog.get_by_role('textbox', name='来源 URL').fill('directory.example')
    dialog.get_by_role('textbox', name='URL 模板').fill('https://directory.example/submit?url={{target_url}}')
    dialog.get_by_role('button', name='保存', exact=True).click()
    expect(page.get_by_text('Example directory', exact=True)).to_be_visible()
    assert sources[0]['approval_status'] == '待审核' and sources[0]['submission_mode'] == '仅观察' and sources[0]['enabled'] == 0
    row = page.locator('.el-table__body tr').filter(has_text='Example directory')
    row.locator('.el-select__wrapper').click()
    page.get_by_role('option', name='已批准', exact=True).click()
    page.wait_for_timeout(100)
    assert sources[0]['approval_status'] == '已批准'
    assert sources[0]['enabled'] == 1

    page.goto(BASE + '/home')
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='查看网站：Example calculator').click()
    expect(page.get_by_role('heading', name='外链候选', exact=True)).to_be_visible()
    page.get_by_role('combobox', name='外链来源').click()
    page.get_by_role('option', name='Example directory · 已批准', exact=True).click()
    target = page.get_by_role('textbox', name='外链目标 URL')
    target.fill('example.com/tools?x=1&y=two words')
    page.get_by_role('textbox', name='外链目标标题').fill('Original directory title')
    page.get_by_role('textbox', name='外链锚文本').fill('Original tool')
    page.get_by_role('textbox', name='外链候选说明').fill('Original description')
    preview = page.locator('.portfolio-link-preview a')
    expect(preview).to_contain_text('https://directory.example/submit?url=')
    page.get_by_role('button', name='添加候选', exact=True).click()
    expect(page.get_by_text('已生成提交地址', exact=True).first).to_be_visible()
    assert opportunities[0]['submission_url'].startswith('https://directory.example/submit?url=')
    assert 'example.com%2Ftools' in opportunities[0]['submission_url']
    expect(page.get_by_text('Original directory title', exact=True)).to_be_visible()
    expect(page.get_by_text('Original description', exact=True)).to_be_visible()
    page.get_by_role('button', name='编辑候选', exact=True).click()
    edit = page.get_by_role('dialog', name='编辑外链候选', exact=True)
    edit.get_by_role('textbox', name='标题').fill('Updated directory title')
    edit.get_by_role('textbox', name='描述').fill('Updated description from reviewed product facts')
    edit.get_by_role('textbox', name='锚文本').fill('Updated tool')
    edit.get_by_role('button', name='保存', exact=True).click()
    expect(page.get_by_text('Updated directory title', exact=True)).to_be_visible()
    assert opportunities[0]['title'] == 'Updated directory title'
    assert opportunities[0]['description'] == 'Updated description from reviewed product facts'
    assert opportunities[0]['anchor_text'] == 'Updated tool'
    page.get_by_role('button', name='记录人工尝试', exact=True).click()
    attempt = page.get_by_role('dialog', name='记录外链尝试 · Example directory', exact=True)
    attempt.get_by_role('textbox', name='证据 URL').fill('https://directory.example/public/example')
    attempt.locator('.el-switch').click()
    attempt.get_by_role('button', name='保存尝试', exact=True).click()
    expect(page.get_by_text('已确认公开链接', exact=True).first).to_be_visible()
    assert attempts[0]['method'] == '人工' and attempts[0]['confirmed_public_link'] is True
    page.get_by_role('button', name='记录人工尝试', exact=True).click()
    attempt = page.get_by_role('dialog', name='记录外链尝试 · Example directory', exact=True)
    attempt.locator('.el-select__wrapper').first.click()
    page.get_by_role('option', name='被拒绝', exact=True).click()
    attempt.get_by_role('button', name='保存尝试', exact=True).click()
    expect(page.get_by_text('被拒绝', exact=True).first).to_be_visible()
    assert attempts[1]['result_status'] == '被拒绝' and opportunities[0]['status'] == '被拒绝'
    assert not errors, errors
    browser.close()

print('Link source and website opportunity browser acceptance passed')
