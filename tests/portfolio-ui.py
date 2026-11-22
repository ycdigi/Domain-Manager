"""Website table/browser acceptance. Run with Vite at port 5173; API fixtures contain no real credentials."""
import base64
import json
from playwright.sync_api import sync_playwright, expect

sites=[dict(id=1,name='Astro site',batch_ids=[7,8],stage='验证',lifecycle='active',ownership='自营网站',platform='Astro',priority_order=0,page_count=25,calculator_count=0,article_count=12,computer_name='Mac Mini YC',daily_clicks=8,content_stats_updated_date='2026-11-21',clicks_updated_date='2026-11-21',next_action_status='待做',adsense_connected='未知',gsc_connected='未知',domains=[dict(id=1,website_id=1,domain='example.test',is_primary=1)],hosting=None,provider_accounts=[dict(id=3,provider='cloudflare',provider_name=None,name='Suscoding@Gmail.Com'),dict(id=4,provider='github',provider_name=None,name='Code account')],repository=dict(id=1,name='org/repo',resource_url='https://github.com/org/repo',account_id=1,status='正常')),dict(id=2,name='WordPress site',batch_ids=[],stage='增长',lifecycle='active',ownership='自营网站',platform='WordPress',priority_order=1,page_count=40,calculator_count=3,article_count=20,computer_name='Macbook Pro',daily_clicks=20,next_action_status='待做',adsense_connected='未知',gsc_connected='未知',domains=[dict(id=2,website_id=2,domain='wordpress.test',is_primary=1)],hosting=dict(id=3,provider='vhost',provider_name='SiteGround',name='host',ip_address='203.0.113.10',status='正常'))]
state=dict(fail=False,copy_fail=False,empty=False,copies=0)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':1600,'height':1000},permissions=['clipboard-read','clipboard-write'])
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 token=base64.b64encode(json.dumps({'token':'browser-test'}).encode()).decode()
 page.add_init_script(f"localStorage.setItem('auth_token',{json.dumps(token)})")
 def handle(route):
  path=route.request.url.split('?')[0].split('/api/')[-1];code=200;data=[];message='成功'
  if path=='websites':
   code=503 if state['fail'] else 200;message='模拟读取失败' if state['fail'] else '成功';data=[] if state['empty'] else sites
  elif path=='batches':data=[dict(id=7,name='第一批',status='进行中'),dict(id=8,name='历史批次',status='已归档')]
  elif path=='monitor':data=dict(monitors=[],incidents=[],unread_count=0,runner=None)
  elif path.startswith('websites/') and path.endswith('/monitor'):
   site=next(s for s in sites if s['id']==int(path.split('/')[1]));data=dict(monitor=dict(website_id=site['id'],enabled=True,effective_enabled=True,status='unchecked',allowed_redirect_hosts=[],title=None),history=[],incidents=[])
  elif path=='work-queue':data=dict(counts=dict(monitor=0,next_action=0,task=0,batch=0,total=0),items=[])
  elif path=='websites/1/copy':
   state['copies']+=1;code=400 if state['copy_fail'] else 200;message='请设置有效且未到期的默认 Token' if state['copy_fail'] else '成功';data=dict(text='域名：example.test\n\nGithub地址：https://github.com/org/repo\nGithub Email：user@example.test\nGithub Token：fixture-token')
  elif path.endswith('/favicon'):route.fulfill(status=404,body='');return
  route.fulfill(status=code,json=dict(status=code,message=message,data=data))
 page.route('http://127.0.0.1:5173/api/**',handle)
 page.goto('http://127.0.0.1:5173/home?resource=999');page.wait_for_load_state('networkidle')
 expect(page.get_by_text('资源：999',exact=True)).to_be_visible()
 page.get_by_role('button',name='清除全部条件',exact=True).click()
 expect(page.locator('.site-table tbody tr')).to_have_count(2)
 page.goto('http://127.0.0.1:5173/home');page.wait_for_load_state('networkidle')
 table=page.locator('.site-table');expect(table.locator('thead th')).to_have_count(12)
 # Primary controls share the header; result metadata uses spare filter-row space.
 tabs=page.get_by_role('navigation',name='网站状态',exact=True)
 heading=page.locator('.workspace-heading')
 assert abs(tabs.bounding_box()['y']-heading.get_by_role('button',name='刷新',exact=True).bounding_box()['y'])<12
 filters=page.locator('.site-filters');results=page.locator('.site-results')
 assert abs(results.bounding_box()['y']-filters.bounding_box()['y'])<12
 assert table.bounding_box()['y']<190

 expect(table.locator('thead th')).to_have_text(['网站 / 主域名','技术栈','总页面数','计算器数量','文章数量','日点击','服务商','GitHub','服务器 IP','电脑','阶段','操作'])
 # The /home batch filter starts empty, survives reload and combines with other filters.
 batch_filter=filters.locator('.el-select').filter(has=page.get_by_role('combobox',name='网站批次筛选',exact=True))
 expect(batch_filter).to_contain_text('全部批次')
 def choose_filter(name,label):
  filters.locator('.el-select').filter(has=page.get_by_role('combobox',name=name,exact=True)).locator('.el-select__wrapper').click()
  page.get_by_role('option',name=label,exact=True).click()
 choose_filter('网站批次筛选','第一批');expect(table.locator('tbody tr')).to_have_count(1)
 expect(table.locator('tbody tr')).to_contain_text('Astro site');expect(results.get_by_text('批次：第一批',exact=True)).to_be_visible()
 expect(page).to_have_url(__import__('re').compile('batch=7'))
 page.reload();page.wait_for_load_state('networkidle');expect(table.locator('tbody tr')).to_have_count(1)
 expect(batch_filter).to_contain_text('第一批')
 choose_filter('阶段筛选','增长');expect(table.locator('tbody tr')).to_have_count(0)
 page.get_by_role('button',name='清除全部条件',exact=True).click();expect(table.locator('tbody tr')).to_have_count(2)
 choose_filter('网站批次筛选','历史批次');expect(table.locator('tbody tr')).to_have_count(1)
 batch_filter.hover();batch_filter.locator('.el-select__clear').click();expect(table.locator('tbody tr')).to_have_count(2)
 expect(page).not_to_have_url(__import__('re').compile('batch='))
 table.locator('thead .el-checkbox').click()
 expect(page.get_by_role('checkbox',name='选择当前结果中的全部网站',exact=True)).to_be_checked()
 expect(page.locator('.portfolio-bulk-toolbar')).to_contain_text('已选 2 个网站')
 choose_filter('网站批次筛选','第一批');expect(page.locator('.portfolio-bulk-toolbar')).to_contain_text('已选 1 个网站')
 page.get_by_role('button',name='取消选择',exact=True).click()
 results.locator('.el-tag').filter(has_text='批次：第一批').locator('.el-tag__close').click()
 expect(table.locator('tbody tr')).to_have_count(2);expect(batch_filter).to_contain_text('全部批次')
 row=table.locator('tbody tr').filter(has=page.get_by_role('button',name='Astro site',exact=True))
 expect(row.locator('td').nth(3)).to_have_text('0');expect(row.locator('td').nth(6).locator('.provider-identity')).to_have_count(1);expect(row.get_by_role('link',name='org/repo')).to_have_attribute('href','https://github.com/org/repo')
 provider_cell=row.locator('td').nth(6)
 expect(provider_cell.get_by_role('button')).to_have_accessible_name('Cloudflare · Suscoding')
 expect(provider_cell.locator('.provider-identity')).to_have_attribute('title','Cloudflare · Suscoding@Gmail.Com')
 expect(provider_cell.locator('img')).to_be_visible()
 assert provider_cell.locator('img').evaluate('e=>e.complete && e.naturalWidth>0')
 expect(provider_cell).to_contain_text('Suscoding');expect(provider_cell).not_to_contain_text('@Gmail.Com')
 expect(table.locator('tbody tr').filter(has_text='WordPress site').locator('td').nth(6)).to_contain_text('SiteGround')
 choose_filter('服务商筛选','Cloudflare');expect(table.locator('tbody tr')).to_have_count(1);expect(row).to_be_visible()
 page.get_by_role('button',name='清除全部条件',exact=True).click();expect(table.locator('tbody tr')).to_have_count(2)
 page.get_by_role('button',name='总页面数',exact=True).click();expect(table.locator('tbody tr').first).to_contain_text('Astro site')
 page.get_by_role('button',name='总页面数',exact=True).click();expect(table.locator('tbody tr').first).to_contain_text('WordPress site')
 expect(table.locator('th[aria-sort]')).to_have_count(1)
 row.get_by_role('button',name='复制资料').click();expect(page.get_by_text('开发资料已复制',exact=True)).to_be_visible()
 assert page.evaluate('navigator.clipboard.readText()').endswith('Github Token：fixture-token')
 wp=table.locator('tbody tr').filter(has=page.get_by_role('button',name='WordPress site',exact=True))
 expect(wp.get_by_role('button',name='复制资料')).to_be_disabled();wp.get_by_role('button',name='203.0.113.10',exact=True).click()
 assert page.evaluate('navigator.clipboard.readText()')=='203.0.113.10'
 state['copy_fail']=True;row.get_by_role('button',name='复制资料').click();expect(page.get_by_text('请设置有效且未到期的默认 Token',exact=True)).to_be_visible()
 page.get_by_role('textbox',name='搜索网站或域名',exact=True).fill('wordpress');expect(table.locator('tbody tr')).to_have_count(1)
 expect(page).to_have_url(__import__('re').compile('q=wordpress'))
 page.reload();page.wait_for_load_state('networkidle');expect(page.get_by_role('textbox',name='搜索网站或域名',exact=True)).to_have_value('wordpress')
 page.get_by_role('textbox',name='搜索网站或域名',exact=True).fill('')
 # The same headers remain after a stage filter.
 page.locator('.el-select').filter(has=page.get_by_role('combobox',name='阶段筛选')).locator('.el-select__wrapper').click();page.get_by_role('option',name='验证',exact=True).click();expect(table.locator('tbody tr')).to_have_count(1);expect(table.locator('thead th')).to_have_count(12)
 page.locator('.el-select').filter(has=page.get_by_role('combobox',name='阶段筛选')).locator('.el-select__wrapper').click();page.get_by_role('option',name='增长',exact=True).click();expect(table.locator('tbody tr')).to_have_count(1)
 page.get_by_role('button',name='WordPress site',exact=True).click();drawer=page.locator('.website-detail-drawer');expect(drawer).to_be_visible();expect(drawer.get_by_text('主要管理电脑',exact=True)).to_be_visible();expect(drawer.get_by_text('经营场景',exact=True)).to_have_count(0)
 expect(drawer.get_by_role('tab')).to_have_count(7)
 drawer.get_by_role('tab',name='任务与记录',exact=True).click()
 drawer.get_by_placeholder('任务标题').fill('保留的任务草稿')
 page.locator('.website-detail-drawer .el-drawer__close-btn').click()
 confirm=page.get_by_role('dialog',name='离开编辑')
 expect(confirm).to_be_visible();confirm.get_by_role('button',name='继续编辑',exact=True).click()
 expect(drawer.get_by_placeholder('任务标题')).to_have_value('保留的任务草稿')
 page.locator('.website-detail-drawer .el-drawer__close-btn').click()
 confirm.get_by_role('button',name='放弃修改',exact=True).click()
 expect(drawer).not_to_be_visible()

 page.goto('http://127.0.0.1:5173/home');page.wait_for_load_state('networkidle')
 state['fail']=True;page.get_by_role('button',name='刷新',exact=True).click();expect(page.locator('.page-error')).to_contain_text('模拟读取失败')
 state['fail']=False;state['empty']=True;page.get_by_role('button',name='重试',exact=True).click();expect(page.get_by_text('还没有网站，点击新增网站开始管理。')).to_be_visible()
 state['empty']=False;page.get_by_role('button',name='刷新',exact=True).click();expect(table.locator('tbody tr')).to_have_count(2)
 page.screenshot(path='/tmp/domain-manager-structure-desktop.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});expect(table).to_be_visible()
 wrap=page.locator('.portfolio-table-wrap');assert wrap.evaluate('e=>e.scrollWidth>e.clientWidth')
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
 page.screenshot(path='/tmp/domain-manager-structure-mobile.png',full_page=True)
 assert not errors,errors
 browser.close()
print('Portfolio UI passed')
