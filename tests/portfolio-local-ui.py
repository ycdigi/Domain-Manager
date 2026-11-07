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
    for label in ['A', 'B']:
        created = call('/api/websites', {'name': f'验收网站 {label} {stamp}', 'stage': '验证', 'domain': {
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
    call('/api/domains/import?dry_run=1', backup, 'POST')
    call('/api/domains/import', backup, 'POST')
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
        expect(page.get_by_role('button', name=f'查看网站：验收网站 A {stamp}')).to_be_visible()
        page.get_by_role('button', name=f'提高优先级：验收网站 B {stamp}').click()
        expect(page.locator('.portfolio-stage[aria-label="验证"] .portfolio-site-name').first).to_have_text(f'验收网站 B {stamp}')
        page.get_by_role('button', name=f'查看网站：验收网站 A {stamp}').click()
        expect(page.get_by_text('标题与内链已调整', exact=True)).to_be_visible()
        expect(page.get_by_text(f'{month} · 验收收入 · USD', exact=True)).to_be_visible()
        expect(page.get_by_text(f'{month} · 验收收入 · EUR', exact=True)).to_be_visible()
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
