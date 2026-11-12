"""Monitor browser contract tests; run with Vite on MONITOR_UI_URL (default :5174)."""
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
state = dict(lease=True, fail=False, empty=False, overview_reads=0, sample_complete=True, sample_present=True)
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
            history = [dict(id=1, website_id=1, domain='previous.example.test', checked_at='2026-11-11T01:00:00Z', outcome='failure', reason='http_error', http_status=429, response_ms=120, final_url='https://example.test/', title='Latest title', content_complete=True)]
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
    expect(row).to_contain_text('待复核')
    expect(row).to_contain_text('标题发生变化')
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
    page.get_by_role('option', name='正常', exact=True).click()
    expect(row).to_have_count(0)
    page.locator('.monitor-filters .el-select').click()
    page.get_by_role('option', name='全部状态', exact=True).click()
    row.get_by_role('button', name='立即检查').click()
    expect(row).to_contain_text('正在检查，请稍后重试')
    row.get_by_role('button', name='立即检查').click()
    expect(row.get_by_role('button', name='立即检查')).to_be_enabled()
    page.get_by_role('button', name='标为已读').click()
    expect(page.locator('.monitor-unread')).to_have_count(0)
    row.get_by_role('button', name='详情').click()
    panel = page.locator('.website-monitor-panel')
    expect(panel.locator('dd').filter(has_text='Latest title')).to_be_visible()
    expect(panel).to_contain_text('2026/11/12 09:00:00')
    expect(panel).to_contain_text('访问受限（HTTP 429）')
    expect(panel).to_contain_text('previous.example.test')
    expect(panel).to_contain_text('不执行 JavaScript')
    expect(panel).to_contain_text('标题发生变化')
    panel.get_by_label('必须包含的文本').fill(' first \n\nsecond ')
    panel.get_by_role('button', name='保存监控配置').click()
    expect(panel.get_by_role('button', name='保存监控配置')).to_be_disabled()
    assert patches[-1]['required_text'] == ['first', 'second']
    panel.get_by_role('button', name='保存最新标题为基线').click()
    expect(panel).to_contain_text('标题基线：Latest title')
    assert patches[-1] == dict(baseline_title='Latest title')
    # A complete title_changed sample with no title can acknowledge its removal.
    confirm_title = panel.get_by_role('button', name='保存最新标题为基线')
    def refresh_monitor():
        panel.get_by_role('button', name='刷新监控').click()
        expect(panel.get_by_role('button', name='刷新监控')).to_be_enabled()
    expect(confirm_title).to_be_disabled()
    monitor.update(title=None, baseline_title='Old title', status='review', reason='title_changed')
    refresh_monitor()
    expect(confirm_title).to_be_enabled()
    confirm_title.click()
    expect(panel).to_contain_text('标题基线：无标题（已确认）')
    assert patches[-1] == dict(baseline_title='')
    expect(confirm_title).to_be_disabled()
    monitor['baseline_title'] = None
    refresh_monitor()
    expect(panel).to_contain_text('标题基线：未设置')
    expect(confirm_title).to_be_enabled()
    monitor.update(title='New title', baseline_title='Old title')
    for status in ['incomplete', 'unchecked', 'failure', 'pending', 'disabled']:
        monitor['status'] = status
        refresh_monitor()
        expect(confirm_title).to_be_disabled()
    state['sample_complete'] = False
    for reason in ['content_extraction_limit', 'html_extraction_limit']:
        monitor.update(status='incomplete', reason=reason)
        refresh_monitor()
        expect(panel).to_contain_text('页面内容过于复杂，内容检查未完成')
        expect(panel).not_to_contain_text(reason)
    monitor.update(status='review', reason='title_changed')
    state['sample_complete'] = False
    refresh_monitor()
    expect(confirm_title).to_be_disabled()
    state['sample_complete'] = True
    state['sample_present'] = False
    refresh_monitor()
    expect(confirm_title).to_be_disabled()
    state['sample_present'] = True
    state['sample_title'] = None  # A title unknown in history cannot confirm the monitor's title.
    refresh_monitor()
    expect(confirm_title).to_be_disabled()
    del state['sample_title']
    monitor.update(status='healthy', reason='healthy', title=None, baseline_title='')
    refresh_monitor()
    expect(panel).to_contain_text('标题基线：无标题（已确认）')
    expect(confirm_title).to_be_disabled()
    monitor.update(title='New title', baseline_title='Old title')
    refresh_monitor()
    expect(confirm_title).to_be_enabled()
    panel.get_by_label('禁止包含的文本').fill('unsaved')
    page.get_by_role('button', name='Close this dialog').click()
    expect(page.get_by_text('尚有未保存的修改，是否放弃？')).to_be_visible()
    page.get_by_role('button', name='继续编辑', exact=True).click()
    expect(page.locator('.el-message-box')).to_have_count(0)
    expect(panel.get_by_label('禁止包含的文本')).to_have_value('unsaved')
    page.go_back()
    expect(page.get_by_text('尚有未保存的修改，是否放弃？')).to_be_visible()
    page.get_by_role('button', name='继续编辑', exact=True).click()
    expect(page.locator('.el-message-box')).to_have_count(0)
    panel.get_by_role('button', name='保存监控配置').click()
    expect(panel.get_by_role('button', name='保存监控配置')).to_be_disabled()
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
