"""Local Pages + D1 acceptance. Requires an isolated preview on 127.0.0.1:8788."""
import base64
import datetime
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('PORTFOLIO_TEST_URL', 'http://127.0.0.1:8788')
assert BASE.startswith('http://127.0.0.1:'), 'This test only writes to an isolated local preview.'
SESSION = ''
SYNC_TOKEN = os.environ.get('PORTFOLIO_TEST_API_TOKEN', 'preview-sync-local-only')


def call(path, body=None, method='GET', status=200, ai=False, raw=False):
    headers = {'Content-Type': 'application/json'}
    if SESSION or ai:
        headers['Authorization'] = f'Bearer {SYNC_TOKEN if ai else SESSION}'
    request = urllib.request.Request(BASE + path, method=method, headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
    try:
        response = urllib.request.urlopen(request)
    except urllib.error.HTTPError as error:
        response = error
    payload = json.loads(response.read())
    assert response.status == status, (path, response.status, payload)
    return payload if raw else payload.get('data')


SESSION = call('/api/login', {'username': os.environ.get('PORTFOLIO_TEST_USER', 'preview'),
                              'password': os.environ.get('PORTFOLIO_TEST_PASS', 'preview-local-only')}, 'POST')['token']
stamp = str(time.time_ns())
today = datetime.datetime.now(ZoneInfo('Asia/Shanghai')).date()
month = today.strftime('%Y-%m')
monday = (today - datetime.timedelta(days=today.weekday())).isoformat()
site_ids = []
errors = []
try:
    for label, stage in [('A', '验证'), ('B', '验证'), ('C', '增长'), ('D', '待评估'), ('E', '维护')]:
        created = call('/api/websites', {'name': f'验收网站 {label} {stamp}', 'stage': stage, 'domain': {
            'domain': f'accept-{label.lower()}-{stamp}.test', 'registrar': '本地验收',
            'registrar_date': '2024-01-01', 'expiry_date': '2027-12-31', 'service_type': '网站'}}, 'POST', 201)
        site_ids.append(created['website']['id'])
        assert len(created['domains']) == 1
    site_id = site_ids[0]
    prefix = f'/api/websites/{site_id}'
    primary = call('/api/domains?website_id=' + str(site_id))[0]
    call('/api/domains/' + str(primary['id']), method='DELETE', status=409)
    seo = call(prefix + '/tasks', {'title': '本地 SEO 改动', 'task_type': 'SEO'}, 'POST', 201)
    call('/api/ai/sync', {'website_id': site_id, 'fields': {'gsc_connected': '已开通', 'adsense_connected': '已开通'},
         'task_updates': [{'task_id': seo['id'], 'status': '已完成', 'completion_summary': '标题与内链已调整',
         'baseline': {'period_start': (today - datetime.timedelta(days=28)).isoformat(),
                      'period_end': (today - datetime.timedelta(days=1)).isoformat(), 'clicks': 100}}]}, 'POST', ai=True)
    review = next(item for item in call(prefix + '/tasks') if item['review_of_task_id'] == seo['id'])
    assert review['due_at'] == (today + datetime.timedelta(days=28)).isoformat()
    assert review['snapshots'][0]['clicks'] == 100
    call('/api/ai/sync', {'website_id': site_id, 'task_updates': [{'task_id': review['id'], 'review': {
        'conclusion': '提升', 'basis': '提前判断会被拒绝'}}]}, 'POST', status=409, ai=True)
    call(prefix + '/tasks/' + str(review['id']), {'due_at': '2000-01-01'}, 'PUT', status=400)
    for currency, amount in [('USD', 12.5), ('EUR', 8.5)]:
        call(prefix + '/income', {'income_month': month, 'source': '验收收入', 'currency': currency, 'amount': amount}, 'POST', 201)
    call(prefix + '/effort', {'week_start': monday, 'hours': 3.5}, 'POST', 201)
    call(prefix + '/operations', {'operation_date': today.isoformat(), 'operation_kind': 'SEO'}, 'POST', 201)
    note = call(prefix + '/ai-notes', {'kind': 'AI提示词', 'content': '保留迁移后的提示词记录'}, 'POST', 201)
    call(prefix + '/ai-notes/' + str(note['id']), {'kind': 'AI提示词', 'content': '提示词第二版'}, 'PUT')
    assert len(call(prefix + '/ai-notes/' + str(note['id']))) == 2
    backup = call('/api/domains/export', raw=True)
    assert any(item['id'] == site_id for item in backup['websites'])
    next(site for site in backup['websites'] if site['id'] == site_id)['industry'] = '电气/工程'
    call('/api/domains/import?dry_run=1', backup, 'POST')
    call('/api/domains/import', backup, 'POST')
    assert next(site for site in call('/api/websites') if site['id'] == site_id)['industry'] == '其他'
    summary = call('/api/dashboard/summary')
    assert summary['totals']['total_websites'] >= 2

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        page.on('pageerror', lambda error: errors.append(str(error)))
        token = base64.b64encode(json.dumps({'token': SESSION}).encode()).decode()
        page.add_init_script(f"localStorage.setItem('auth_token', {json.dumps(token)})")
        page.goto(BASE + '/home')
        page.wait_for_load_state('networkidle')
        expect(page.locator('.portfolio-table thead').first).to_contain_text('网站归属')
        expect(page.locator('.portfolio-table thead').first).to_contain_text('服务商 / 资源')
        sidebar = page.locator('.workspace-navigation')
        expect(sidebar.get_by_text('网站归属', exact=True)).to_be_visible()
        expect(sidebar.get_by_text('技术栈', exact=True)).to_be_visible()
        page.locator('.portfolio-stage-tabs [data-filter="待评估"]').click()
        expect(page.locator('.portfolio-table thead')).to_contain_text('潜力说明')
        page.locator('.portfolio-stage-tabs [data-filter="验证"]').click()
        expect(page.locator('.portfolio-table thead')).to_contain_text('验证下一步')
        expect(page.locator('.portfolio-table thead')).to_contain_text('任务 / 复查')
        page.locator('.portfolio-stage-tabs [data-filter="增长"]').click()
        expect(page.locator('.portfolio-table thead')).to_contain_text('最近每周投入')
        page.locator('.portfolio-stage-tabs [data-filter="all"]').click()
        page.get_by_role('button', name=f'查看网站：验收网站 A {stamp}').click()
        profile_section = page.locator('.portfolio-detail-section').filter(has=page.get_by_role('heading', name='经营信息', exact=True))
        new_site_select = profile_section.locator('.el-form-item').filter(has_text='新站分类').locator('.el-select__wrapper')
        new_site_select.click()
        page.get_by_role('option', name='手动标记为新站', exact=True).click()
        with page.expect_response(lambda response: response.url.endswith(prefix) and response.request.method == 'PATCH') as new_site_response:
            profile_section.get_by_role('button', name='保存', exact=True).click()
        assert new_site_response.value.ok, new_site_response.value.text()
        assert json.loads(new_site_response.value.request.post_data) == {'new_site_override': 1}
        page.wait_for_timeout(300)
        page.locator('.website-detail-drawer .el-drawer__close-btn').click()
        expect(page.get_by_role('button', name=f'查看网站：验收网站 A {stamp}')).to_be_visible()
        expect(page.get_by_role('button', name=f'查看详情：验收网站 B {stamp}')).to_be_visible()
        site_row = page.locator('.portfolio-stage[aria-label="验证"] .portfolio-row').filter(has=page.get_by_role('button', name=f'查看网站：验收网站 A {stamp}'))
        with page.expect_response(lambda response: response.url.endswith(prefix) and response.request.method == 'PATCH') as platform_response:
            site_row.locator('.el-select:has(input[aria-label="技术栈：验收网站 A ' + stamp + '"]) .el-select__wrapper').click()
            page.get_by_role('option', name='Astro', exact=True).last.click()
        assert json.loads(platform_response.value.request.post_data) == {'platform': 'Astro', 'platform_other': None}
        available_resources = [resource for resource in call('/api/resources') if resource['status'] != '停用']
        selected_resource_id = None
        if available_resources:
            resource = available_resources[0]
            selected_resource_id = resource['id']
            provider_label = {'github': 'GitHub', 'cloudflare': 'Cloudflare', 'vhost': '虚拟主机', 'vps': 'VPS'}[resource['provider']]
            with page.expect_response(lambda response: response.url.endswith('/api/resources') and response.request.method == 'GET'):
                site_row.locator('.el-select:has(input[aria-label="服务商 / 资源：验收网站 A ' + stamp + '"]) .el-select__wrapper').click()
            with page.expect_response(lambda response: response.url.endswith('/api/resources/links') and response.request.method == 'POST') as resource_response:
                page.get_by_role('option', name=f"{provider_label} · {resource['name']}", exact=True).click()
            assert json.loads(resource_response.value.request.post_data) == {'website_id': site_id, 'resource_id': resource['id'], 'role': {'github': '代码仓库', 'cloudflare': '部署平台', 'vhost': '虚拟主机', 'vps': 'VPS'}[resource['provider']], 'is_primary': False}
        local_sites = call('/api/websites')
        machines = {domain.get('computer_name') for site in local_sites for domain in site['domains'] if domain.get('computer_name')}
        current_machine = next(domain.get('computer_name') for site in local_sites if site['id'] == site_id for domain in site['domains'] if domain['is_primary'])
        target_machine = next((name for name in sorted(machines) if name != current_machine), f'验收电脑 {stamp}')
        computer_combo = site_row.locator('.el-select:has(input[aria-label="电脑：验收网站 A ' + stamp + '"]) .el-select__wrapper')
        with page.expect_response(lambda response: response.url.endswith('/api/domains/' + str(primary['id'])) and response.request.method == 'PATCH') as computer_response:
            computer_combo.click()
            if target_machine in machines:
                page.get_by_role('option', name=target_machine, exact=True).click()
            else:
                input_box = site_row.get_by_role('combobox', name=f'电脑：验收网站 A {stamp}')
                input_box.fill(target_machine)
                input_box.press('Enter')
        assert json.loads(computer_response.value.request.post_data) == {'computer_name': target_machine}
        site_row.get_by_role('button', name=f'编辑下一步：验收网站 A {stamp}').click()
        page.get_by_role('textbox', name='下一步行动').fill('本地表格快速更新')
        call(prefix, {'next_action_status': '已完成'}, 'PATCH')
        page.locator('.portfolio-next-editor:visible .el-date-editor input').fill('2026-12-01')
        with page.expect_response(lambda response: response.url.endswith(prefix) and response.request.method == 'PATCH') as action_response:
            page.get_by_role('button', name='保存下一步').click()
        assert json.loads(action_response.value.request.post_data) == {'next_action': '本地表格快速更新', 'next_action_due_date': '2026-12-01'}
        with page.expect_response(lambda response: response.url.endswith(prefix) and response.request.method == 'PATCH') as stage_response:
            site_row.locator('.el-select:has(input[aria-label="网站阶段：验收网站 A ' + stamp + '"]) .el-select__wrapper').click()
            page.get_by_role('option', name='增长', exact=True).last.click()
        assert json.loads(stage_response.value.request.post_data) == {'stage': '增长'}
        saved_site = next(site for site in call('/api/websites') if site['id'] == site_id)
        assert saved_site['platform'] == 'Astro'
        assert selected_resource_id is None or selected_resource_id in saved_site['resource_ids']
        assert next(domain for domain in saved_site['domains'] if domain['is_primary'])['computer_name'] == target_machine
        assert (saved_site['next_action'], saved_site['next_action_status'], saved_site['next_action_due_date']) == ('本地表格快速更新', '已完成', '2026-12-01')
        assert saved_site['stage'] == '增长'
        page.get_by_role('button', name=f'查看网站：验收网站 A {stamp}').click()
        expect(page.get_by_text('标题与内链已调整', exact=True)).to_be_visible()
        expect(page.get_by_text(f'{month} · 验收收入 · USD', exact=True)).to_be_visible()
        expect(page.get_by_text(f'{month} · 验收收入 · EUR', exact=True)).to_be_visible()
        profile_section = page.locator('.portfolio-detail-section').filter(has=page.get_by_role('heading', name='经营信息', exact=True))
        call(prefix, {'gsc_connected': '已开通'}, 'PATCH')
        with page.expect_response(lambda response: response.url.endswith('/api/websites') and response.request.method == 'GET'):
            page.get_by_role('button', name='刷新网站', exact=True).evaluate('button => button.click()')
        profile_section.get_by_role('textbox', name='网站名称', exact=True).fill(f'验收网站 A {stamp} 修改')
        profile_section.locator('.el-form-item').filter(has_text='阶段').locator('.el-select__wrapper').click()
        page.get_by_role('option', name='维护', exact=True).click()
        with page.expect_response(lambda response: response.url.endswith(prefix) and response.request.method == 'PATCH') as profile_response:
            profile_section.get_by_role('button', name='保存', exact=True).click()
        assert profile_response.value.ok, (profile_response.value.request.post_data, profile_response.value.text())
        profile_patch = json.loads(profile_response.value.request.post_data)
        assert profile_patch == {'name': f'验收网站 A {stamp} 修改', 'stage': '维护'}, profile_patch
        latest_site = next(site for site in call('/api/websites') if site['id'] == site_id)
        assert latest_site['gsc_connected'] == '已开通'
        assert latest_site['stage'] == '维护'
        exported_site = next(site for site in call('/api/domains/export', raw=True)['websites'] if site['id'] == site_id)
        assert exported_site['industry'] == '电气/工程'
        page.get_by_role('textbox', name='任务标题', exact=True).fill('浏览器新增任务')
        page.get_by_role('button', name='添加任务', exact=True).click()
        expect(page.get_by_text('浏览器新增任务', exact=True)).to_be_visible()
        page.locator('.portfolio-task-row').filter(has_text='浏览器新增任务').locator('.el-select__wrapper').click()
        page.get_by_role('option', name='已完成', exact=True).last.click()
        expect(page.locator('.portfolio-task-row').filter(has_text='浏览器新增任务').get_by_text('已完成', exact=True)).to_be_visible()
        page.get_by_role('button', name='编辑任务 浏览器新增任务', exact=True).click()
        task_dialog = page.get_by_role('dialog', name='编辑网站任务', exact=True)
        task_dialog.locator('textarea').nth(1).fill('浏览器中补充完成说明')
        task_dialog.get_by_role('button', name='保存任务', exact=True).click()
        expect(page.get_by_text('浏览器中补充完成说明', exact=True)).to_be_visible()
        income_form = page.locator('.portfolio-income-form')
        income_form.locator('.el-date-editor input').fill(month)
        income_form.locator('.el-date-editor input').press('Tab')
        income_form.get_by_role('textbox', name='收入来源', exact=True).fill('浏览器手工')
        income_form.locator('.el-input-number input').fill('6.25')
        income_form.locator('.el-input-number input').press('Tab')
        assert income_form.evaluate('e => e.checkValidity()'), 'Decimal income must pass native form validation'
        with page.expect_response(lambda response: response.url.endswith(prefix + '/income') and response.request.method == 'POST') as income_response:
            income_form.get_by_role('button', name='记录', exact=True).click()
        assert income_response.value.ok, (income_response.value.request.post_data, income_response.value.text())
        expect(page.get_by_text(f'{month} · 浏览器手工 · USD', exact=True)).to_be_visible()
        effort_form = page.locator('.portfolio-effort-form')
        effort_form.locator('.el-date-editor input').fill(monday)
        effort_form.locator('.el-date-editor input').press('Tab')
        effort_form.locator('.el-input-number input').fill('2.5')
        effort_form.locator('.el-input-number input').press('Tab')
        assert effort_form.evaluate('e => e.checkValidity()'), 'Fractional effort hours must pass native form validation'
        effort_form.get_by_role('button', name='记录', exact=True).click()
        expect(page.get_by_text('2.5 小时', exact=True)).to_be_visible()
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_timeout(350)
        assert page.locator('.website-detail-drawer').evaluate('e => e.getBoundingClientRect().width') <= 390
        overflow = page.locator('.website-detail-drawer .el-drawer__body').evaluate("""e => ({client:e.clientWidth,scroll:e.scrollWidth,items:[...e.querySelectorAll('*')].filter(n=>n.getClientRects().length && n.getBoundingClientRect().right>e.getBoundingClientRect().right+1).slice(0,20).map(n=>({tag:n.tagName,cls:n.className,width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right}))})""")
        assert overflow['scroll'] <= overflow['client'] + 1, overflow
        page.screenshot(path='/tmp/domain-manager-local-mobile.png')
        page.goto(BASE + '/domains')
        page.wait_for_load_state('networkidle')
        expect(page.get_by_role('heading', name='域名资产', exact=True)).to_be_visible()
        call(f'/api/websites/{site_ids[1]}', {'lifecycle': 'stopped'}, 'PATCH')
        page.goto(BASE + '/home?view=stopped')
        expect(page.get_by_role('button', name=f'查看网站：验收网站 B {stamp}')).to_be_visible()
        page.goto(BASE + '/data')
        with page.expect_download() as download:
            page.get_by_role('button', name='导出网站组合 JSON', exact=True).click()
        exported = json.loads(Path(download.value.path()).read_text())
        assert 'website_tasks' in exported and 'website_income' in exported
        assert not errors, errors
        browser.close()
    print('Local Pages + D1 API and browser acceptance passed')
finally:
    for site_id in site_ids:
        call(f'/api/websites/{site_id}', method='DELETE')
