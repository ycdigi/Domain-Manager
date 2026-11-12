"""HTTP response and page title monitor browser contract tests; run with Vite on MONITOR_UI_URL (default :5174)."""
import base64
import json
import os
from playwright.sync_api import sync_playwright, expect

monitor = dict(website_id=1, website_name='Monitor site', domain='example.test', domain_id=1,
    enabled=True, effective_enabled=True, status='review', reason='title_changed', http_status=200,
    response_ms=120, final_url='https://example.test/', title='Latest title', baseline_title='Old title',
    checked_at='2026-11-12T01:00:00Z', next_check_at='2026-11-12T13:00:00Z', required_text=[], forbidden_text=[],
    allowed_redirect_hosts=[], consecutive_failures=0)
incident = dict(id=1, website_id=1, website_name='Monitor site', domain='example.test', reason='title_changed',
    opened_at='2026-11-12T01:00:00Z', last_seen_at='2026-11-12T01:00:00Z', resolved_at=None, read_at=None)
site = dict(id=1, name='Monitor site', stage='维护', lifecycle='active', ownership='自营网站', platform='Astro',
    industry='资讯站', next_action_status='待做', domains=[], adsense_connected='未知', gsc_connected='未知')
state = dict(lease=True, fail=False, empty=False, overview_reads=0, sample_complete=False, sample_present=True)
patches = []
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport=dict(width=1440, height=1000))
    page.on('pageerror', lambda error: errors.append(str(error)))
    token = base64.b64encode(json.dumps(dict(token='test')).encode()).decode()
    page.add_init_script(f"localStorage.setItem('auth_token', '{token}')")
    def handle(route):
        if '/src/' in route.request.url:
            route.continue_()
            return
        path = route.request.url.split('?')[0].split('/api/')[-1]
        method = route.request.method
        code = 200
        data = []
        if path == 'monitor':
            state['overview_reads'] += 1
            code = 503 if state['fail'] else 200
            data = dict(monitors=[] if state['empty'] else [monitor], incidents=[] if state['empty'] else [incident],
                runner=dict(last_started_at='2026-11-12T01:00:00Z', last_completed_at='2026-11-12T01:00:00Z', last_error=None),
                unread_count=0 if incident['read_at'] else 1)
        elif path == 'monitor/incidents/1/read':
            incident['read_at'] = '2026-11-12T02:00:00Z'
            data = None
        elif path.startswith('websites/1/monitor'):
            if method == 'PATCH':
                patches.append(route.request.post_data_json)
                monitor.update(route.request.post_data_json)
                monitor['effective_enabled'] = monitor['enabled']
            if method == 'POST' and state['lease']:
                state['lease'] = False
                code = 409
            elif method == 'POST':
                monitor.update(status='healthy', reason='healthy', title='Current page title')
            history = [dict(id=1, website_id=1, domain='previous.example.test', checked_at='2026-11-11T01:00:00Z', outcome='failure', reason='http_error', http_status=429, response_ms=120, final_url='https://example.test/', title='Latest title', content_complete=True),
                dict(id=3, website_id=1, domain='example.test', checked_at='2026-11-10T01:00:00Z', outcome='incomplete', reason='content_extraction_limit', http_status=200, response_ms=100, final_url='https://example.test/', title=None, content_complete=False)]
            if state['sample_present']:
                history.insert(0, dict(id=2, website_id=1, domain=monitor['domain'], checked_at=monitor['checked_at'],
                    outcome=monitor['status'], reason=monitor['reason'], http_status=monitor['http_status'],
                    response_ms=monitor['response_ms'], final_url=monitor['final_url'],
                    title=state.get('sample_title', monitor['title']), content_complete=state['sample_complete']))
            data = dict(monitor=monitor, history=history, incidents=[incident])
        elif path == 'websites':
            data = [site]
        route.fulfill(status=code, json=dict(status=code, message='模拟服务失败' if code != 200 else '成功', data=data))
    page.route('**/api/**', handle)
    page.goto(os.environ.get('MONITOR_UI_URL', 'http://127.0.0.1:5174') + '/monitor')
    expect(page.get_by_role('heading', name='网站监控', exact=True)).to_be_visible()
    expect(page.get_by_text('超过 10 分钟未完成巡检')).to_be_visible()
    row = page.locator('[data-monitor-site="1"]')
    expect(page.locator('.monitor-table thead th').nth(1)).to_have_text('页面标题')
    expect(row.locator('td').nth(1)).to_have_text('Latest title')
    expect(page.get_by_text('HTTP响应、跳转与页面标题', exact=True)).to_be_visible()
    expect(row).to_contain_text('旧检查/待重新检查')
    expect(row).not_to_contain_text('旧版内容检查')
    expect(row).not_to_contain_text('内容检查未完成')
    expect(row).to_contain_text('2026/11/12 21:00:00')
    page.get_by_placeholder('搜索网站或域名').fill('missing')
    expect(row).to_have_count(0)
    page.get_by_placeholder('搜索网站或域名').clear()
    row.locator('.el-switch').click()
    expect(row.get_by_role('switch')).not_to_be_checked()
    assert patches[-1] == dict(enabled=False)
    row.locator('.el-switch').click()
    expect(row.get_by_role('switch')).to_be_checked()
    page.locator('.monitor-filters .el-select').click()
    page.get_by_role('option', name='响应正常', exact=True).click()
    expect(row).to_have_count(0)
    page.locator('.monitor-filters .el-select').click()
    page.get_by_role('option', name='全部状态', exact=True).click()
    row.get_by_role('button', name='立即检查').click()
    expect(row).to_contain_text('正在检查，请稍后重试')
    row.get_by_role('button', name='立即检查').click()
    expect(row.get_by_role('button', name='立即检查')).to_be_enabled()
    expect(row).to_contain_text('响应正常')
    page.get_by_role('button', name='标为已读').click()
    expect(page.locator('.monitor-unread')).to_have_count(0)
    row.get_by_role('button', name='详情').click()
    panel = page.locator('.website-monitor-panel')
    expect(panel).to_contain_text('2026/11/12 09:00:00')
    expect(panel).to_contain_text('访问受限（HTTP 429）')
    expect(panel).to_contain_text('previous.example.test')
    expect(panel).to_contain_text('响应正常仅表示 HTTP 可访问')
    expect(panel).to_contain_text('旧版内容检查')
    expect(panel).not_to_contain_text('内容检查未完成')
    for label in ['必须包含的文本', '禁止包含的文本']:
        expect(panel.get_by_label(label)).to_have_count(0)
    expect(panel.get_by_role('button', name='保存最新标题为基线')).to_have_count(0)
    latest_title = panel.locator('dt').filter(has_text='最新页面标题').locator('xpath=following-sibling::dd[1]')
    history_rows = panel.locator('.el-table__body-wrapper tbody tr')
    expect(latest_title).to_have_text('Current page title')
    expect(row.locator('td').nth(1)).to_have_text('Current page title')
    expect(panel.locator('thead th').filter(has=page.get_by_text('页面标题', exact=True))).to_be_visible()
    expect(history_rows.nth(0)).to_contain_text('Current page title')
    expect(history_rows.nth(1)).to_contain_text('Latest title')
    expect(history_rows.nth(2)).to_contain_text('未获取到标题')
    expect(panel).not_to_contain_text('标题基线')
    for label in ['HTTP', '原因', '最终地址']:
        expect(panel.locator('thead th').filter(has=page.get_by_text(label, exact=True))).to_be_visible()
    expect(panel.locator('.monitor-actions').first).to_contain_text('响应正常')
    # Titles are plain text in the list, current detail and history, even when they look like HTML.
    unsafe_title = '<script>window.__monitorTitleExecuted = true</script><img src=x onerror="window.__monitorTitleExecuted = true">'
    long_title = 'Long page title ' + 'x' * 980
    for title in [unsafe_title, long_title, None]:
        monitor['title'] = title
        panel.get_by_role('button', name='刷新监控').click()
        expected_title = title if title is not None else '未获取到标题'
        expect(latest_title).to_have_text(expected_title)
        expect(history_rows.nth(0)).to_contain_text(expected_title)
        expect(panel.locator('.monitor-actions').first).to_contain_text('响应正常')
        page.get_by_role('button', name='Close this dialog').click()
        expect(panel).to_have_count(0)
        page.get_by_role('button', name='刷新', exact=True).click()
        expect(row.locator('td').nth(1)).to_have_text(expected_title)
        expect(row).to_contain_text('响应正常')
        assert page.evaluate('window.__monitorTitleExecuted === undefined')
        expect(row.locator('td').nth(1).locator('script, img')).to_have_count(0)
        row.get_by_role('button', name='详情').click()
        expect(latest_title).to_have_text(expected_title)
        expect(panel.locator('.monitor-facts script, .monitor-facts img, .el-table__body-wrapper script, .el-table__body-wrapper img')).to_have_count(0)
        assert page.evaluate('window.__monitorTitleExecuted === undefined')
    hosts = panel.get_by_label('允许跳转的主机名')
    hosts.fill(' cdn.example.test \n\nwww.example.test ')
    panel.locator('.monitor-config .el-switch').click()
    panel.get_by_role('button', name='保存监控配置').click()
    expect(panel.get_by_role('button', name='保存监控配置')).to_be_disabled()
    assert patches[-1] == dict(enabled=False, allowed_redirect_hosts=['cdn.example.test', 'www.example.test'])
    panel.locator('.monitor-config .el-switch').click()
    panel.get_by_role('button', name='保存监控配置').click()
    expect(panel.get_by_role('button', name='保存监控配置')).to_be_disabled()
    assert patches[-1] == dict(enabled=True, allowed_redirect_hosts=['cdn.example.test', 'www.example.test'])
    for legacy_status, reason in [('review', 'title_changed'), ('incomplete', 'content_extraction_limit'), ('incomplete', 'html_extraction_limit')]:
        monitor.update(status=legacy_status, reason=reason)
        with page.expect_response(lambda response: response.url.endswith('/api/websites/1/monitor') and response.request.method == 'GET'):
            panel.get_by_role('button', name='刷新监控').click()
        expect(panel.get_by_role('button', name='刷新监控')).to_be_enabled()
        expect(panel.locator('.monitor-actions').first).to_contain_text('旧检查/待重新检查')
        expect(panel.locator('.monitor-actions').first).not_to_contain_text('旧版内容检查')
        expect(panel).not_to_contain_text('内容检查未完成')
    hosts.fill('unsaved.example.test')
    page.get_by_role('button', name='Close this dialog').click()
    expect(page.get_by_text('尚有未保存的修改，是否放弃？')).to_be_visible()
    page.get_by_role('button', name='继续编辑', exact=True).click()
    expect(page.locator('.el-message-box')).to_have_count(0)
    expect(hosts).to_have_value('unsaved.example.test')
    page.go_back()
    expect(page.get_by_text('尚有未保存的修改，是否放弃？')).to_be_visible()
    page.get_by_role('button', name='继续编辑', exact=True).click()
    expect(page.locator('.el-message-box')).to_have_count(0)
    panel.get_by_role('button', name='保存监控配置').click()
    expect(panel.get_by_role('button', name='保存监控配置')).to_be_disabled()
    page.get_by_role('button', name='Close this dialog').click()
    expect(panel).to_have_count(0)
    row.get_by_role('button', name='详情').click()
    expect(hosts).to_have_value('unsaved.example.test')
    expect(panel.get_by_label('自动监控', exact=True)).to_be_checked()
    page.get_by_role('button', name='Close this dialog').click()
    expect(panel).to_have_count(0)
    page.get_by_role('button', name='全部归属', exact=True).first.click()
    page.get_by_role('button', name='查看监控：Monitor site').click()
    expect(page.locator('.website-monitor-panel')).to_have_count(1)
    expect(page.get_by_role('dialog')).to_have_count(1)
    page.get_by_role('button', name='Close this dialog').click()
    expect(panel).to_have_count(0)
    # Timer remains active on another workspace page and updates the shared badge.
    page.get_by_role('button', name='域名资产', exact=True).first.click()
    page.clock.install()
    before = state['overview_reads']
    page.clock.fast_forward(60000)
    page.wait_for_timeout(200)
    assert state['overview_reads'] > before
    page.get_by_role('button', name='网站监控', exact=True).first.click()
    expect(page.get_by_role('heading', name='网站监控', exact=True)).to_be_visible()
    monitor.update(status='unchecked', next_check_at='1970-01-01T00:00:00Z')
    page.get_by_role('button', name='刷新', exact=True).click()
    expect(row).to_contain_text('等待首次调度')
    monitor['effective_enabled'] = False
    page.get_by_role('button', name='刷新', exact=True).click()
    expect(row).not_to_contain_text('等待首次调度')
    expect(row).not_to_contain_text('1970')
    monitor.update(status='failure', reason='http_error', http_status=403)
    page.get_by_role('button', name='刷新', exact=True).click()
    expect(row).to_contain_text('访问受限（HTTP 403）')
    expect(row).to_contain_text('异常')
    state['fail'] = True
    page.get_by_role('button', name='刷新', exact=True).click()
    expect(page.locator('.page-error')).to_contain_text('模拟服务失败')
    state['fail'] = False
    state['empty'] = True
    page.get_by_role('button', name='重试', exact=True).click()
    expect(page.get_by_text('暂无网站监控')).to_be_visible()
    assert not errors, errors
    browser.close()
print('Monitor UI passed')
