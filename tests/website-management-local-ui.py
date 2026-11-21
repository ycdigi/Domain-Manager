"""Website management acceptance against an isolated local Pages + D1 copy."""
import base64
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('PORTFOLIO_TEST_URL', 'http://127.0.0.1:8795')
assert BASE.startswith('http://127.0.0.1:'), 'Only an isolated local preview is supported.'
session = ''


def call(path, body=None, method='GET', status=200):
    headers = {'Content-Type': 'application/json'}
    if session:
        headers['Authorization'] = 'Bearer ' + session
    request = urllib.request.Request(BASE + path, method=method, headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
    try:
        response = urllib.request.urlopen(request)
    except urllib.error.HTTPError as error:
        response = error
    payload = json.loads(response.read())
    assert response.status == status, (path, response.status, payload)
    return payload.get('data')


session = call('/api/login', {'username': 'preview', 'password': 'preview-local-only'}, 'POST')['token']
stamp = str(time.time_ns())
site_id = account_id = batch_id = None
errors = []
try:
    created = call('/api/websites', {'name': '管理验收 ' + stamp, 'domain': {
        'domain': 'management-' + stamp + '.test', 'registrar': '本地验收',
        'registrar_date': '2026-01-01', 'expiry_date': '2027-12-31', 'service_type': '网站'}}, 'POST', 201)
    site_id = created['website']['id']
    prefix = '/api/websites/' + str(site_id)
    domain = created['domains'][0]['domain']
    call(prefix + '/operations', {'operation_date': '2026-11-21', 'operation_kind': 'SEO'}, 'POST', 201)
    account = call('/api/gsc/accounts', {'name': '验收 GSC ' + stamp, 'email': stamp + '@example.test'}, 'POST', 201)
    account_id = account['id']
    batch = call('/api/batches', {'name': '验收批次 ' + stamp}, 'POST', 201)
    batch_id = batch['id']
    members_path = '/api/batches/' + str(batch_id) + '/members'
    call(members_path, {'website_ids': [site_id]}, 'POST')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        page.on('pageerror', lambda error: errors.append(str(error)))
        token = base64.b64encode(json.dumps({'token': session}).encode()).decode()
        page.add_init_script(f"localStorage.setItem('auth_token', {json.dumps(token)})")
        page.goto(BASE + '/website-management?q=' + domain)
        page.wait_for_load_state('networkidle')
        row = page.locator('.management-table tbody tr')
        expect(row).to_have_count(1)
        filters = page.locator('.management-filters')
        expect(filters).not_to_contain_text('Select')
        filters.locator('.el-select').filter(has=page.get_by_role('combobox', name='网站批次筛选', exact=True)).locator('.el-select__wrapper').click()
        page.get_by_role('option', name=batch['name'], exact=True).click()
        expect(row).to_have_count(1)
        page.reload(); page.wait_for_load_state('networkidle')
        expect(filters.get_by_text(batch['name'], exact=True)).to_be_visible()
        call(members_path, {'website_ids': [site_id]}, 'DELETE')
        page.get_by_role('button', name='刷新', exact=True).click(); expect(row).to_have_count(0)
        call(members_path, {'website_ids': [site_id]}, 'POST')
        page.get_by_role('button', name='刷新', exact=True).click(); expect(row).to_have_count(1)
        count = row.get_by_role('button', name='查看TDK调整记录：' + domain, exact=True)
        button = row.get_by_role('button', name='登记TDK调整：' + domain, exact=True)
        expect(count).to_have_text('0')
        button.click(); expect(count).to_have_text('1')
        button.click(); expect(count).to_have_text('2')
        page.get_by_role('button', name='刷新', exact=True).click()
        expect(page.get_by_role('button', name='刷新', exact=True)).to_be_enabled()
        page.get_by_role('button', name='撤销本次', exact=True).click(); expect(count).to_have_text('1')
        row.locator('.el-select__wrapper').click()
        page.get_by_role('option', name=account['name'], exact=True).click()
        expect(row).to_contain_text(account['name'])
        page.reload(); page.wait_for_load_state('networkidle')
        expect(count).to_have_text('1'); expect(row).to_contain_text(account['name'])
        row.get_by_role('link', name=domain, exact=True).click()
        detail = page.locator('.website-detail-drawer')
        expect(detail.get_by_role('heading', name='工作登记', exact=True)).to_be_visible()
        expect(detail.locator('.work-history li')).to_have_count(1)
        expect(detail.get_by_text('2026-11-21 · SEO', exact=True)).to_be_visible()
        detail.locator('.work-history').get_by_role('button', name='撤销记录', exact=True).click()
        expect(detail.locator('.work-history li')).to_have_count(0)
        detail.get_by_role('tab', name='基本资料', exact=True).click()
        detail.get_by_role('textbox', name='网站名称', exact=True).fill('更新名称 ' + stamp)
        detail.get_by_role('button', name='保存', exact=True).click()
        expect(detail.get_by_role('button', name='保存', exact=True)).to_be_disabled()
        detail.get_by_role('button', name='Close this dialog', exact=True).click()
        page.get_by_role('button', name='网站管理', exact=True).click()
        expect(row).to_have_count(1)
        row.get_by_role('link', name=domain, exact=True).hover()
        expect(page.get_by_role('tooltip').filter(has_text='更新名称 ' + stamp)).to_be_visible()
        expect(count).to_have_text('0')
        row.get_by_role('link', name=domain, exact=True).click()
        detail.get_by_role('tab', name='基本资料', exact=True).click()
        detail.get_by_role('textbox', name='网站名称', exact=True).fill('再次更新 ' + stamp)
        detail.get_by_role('button', name='保存', exact=True).click()
        expect(detail.get_by_role('button', name='保存', exact=True)).to_be_disabled()
        detail.get_by_role('button', name='Close this dialog', exact=True).click()
        page.get_by_role('button', name='网站管理', exact=True).click()
        row.get_by_role('link', name=domain, exact=True).hover()
        expect(page.get_by_role('tooltip').filter(has_text='再次更新 ' + stamp)).to_be_visible()
        row.get_by_role('button', name='登记文章开发：' + domain, exact=True).click()
        expect(row.get_by_role('button', name='查看文章开发记录：' + domain, exact=True)).to_have_text('1')
        snapshot = call('/api/backups')
        saved = [r for r in snapshot['website_work_records'] if r['website_id'] == site_id]
        assert len(saved) == 3 and sum(r['voided_at'] is None for r in saved) == 1
        call('/api/gsc/accounts/' + str(account_id), {'name': account['name'], 'email': 'edited-' + stamp + '@example.test'}, 'PATCH')
        call('/api/backups?dry_run=1', snapshot, 'POST')
        call('/api/backups', snapshot, 'POST')
        restored = next(r for r in call('/api/website-management') if r['id'] == site_id)
        assert restored['stats']['文章开发']['count'] == 1
        assert restored['gsc_account']['email'] == account['email']
        page.goto(BASE + '/data'); page.wait_for_load_state('networkidle')
        with page.expect_download() as download:
            page.get_by_role('button', name='导出网站组合 JSON', exact=True).click()
        exported = json.loads(Path(download.value.path()).read_text())
        assert len([r for r in exported['website_work_records'] if r['website_id'] == site_id]) == 3
        with page.expect_download() as download:
            page.get_by_role('button', name='导出完整 Excel', exact=True).click()
        result = subprocess.check_output(['node', '--input-type=module', '-e',
            "import XLSX from 'xlsx';const w=XLSX.readFile(process.argv[1]);console.log(JSON.stringify({names:w.SheetNames,rows:XLSX.utils.sheet_to_json(w.Sheets['网站管理'])}));",
            str(download.value.path())], text=True)
        workbook = json.loads(result)
        assert {'工作登记历史', 'GSC账号', 'GSC网站归属', '网站管理'}.issubset(workbook['names'])
        summary = next(r for r in workbook['rows'] if r['网站域名'] == domain)
        assert summary['TDK调整次数'] == 0 and summary['文章开发次数'] == 1
        assert summary['GSC邮箱'] == account['email']
        page.goto(BASE + '/website-management?q=' + domain); page.wait_for_load_state('networkidle')
        row.locator('.el-select').hover()
        row.locator('.el-select__clear').click()
        expect(row).not_to_contain_text(account['name'])
        page.get_by_role('button', name='管理 GSC 账号', exact=True).click()
        dialog = page.get_by_role('dialog', name='管理 GSC 账号', exact=True)
        expect(dialog.get_by_role('button', name='删除账号：' + account['name'], exact=True)).to_be_enabled()
        assert not errors, errors
        browser.close()
finally:
    if site_id is not None:
        call('/api/websites/' + str(site_id), method='DELETE')
    if batch_id is not None:
        call('/api/batches/' + str(batch_id), method='DELETE')
    if account_id is not None:
        call('/api/gsc/accounts/' + str(account_id), method='DELETE')

print('Website management local Pages + D1 acceptance passed')
