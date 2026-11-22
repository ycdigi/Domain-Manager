"""Website table/browser acceptance. Run with Vite at port 5173; API fixtures contain no real credentials."""
import base64
import json
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect

sites=[dict(id=1,name='Astro site',batch_ids=[7,8],stage='验证',lifecycle='active',ownership='自营网站',platform='Astro',priority_order=0,page_count=25,calculator_count=0,article_count=12,computer_name='Mac Mini YC',daily_clicks=8,content_stats_updated_date='2026-11-21',clicks_updated_date='2026-11-21',next_action_status='待做',adsense_connected='已开通',gsc_connected='未知',domains=[dict(id=1,website_id=1,domain='example.test',is_primary=1)],hosting=None,provider_accounts=[dict(id=3,provider='cloudflare',provider_name=None,name='Suscoding@Gmail.Com'),dict(id=4,provider='github',provider_name=None,name='Coder@Example.Com')],repository=dict(id=1,name='org/repo',resource_url='https://github.com/org/repo',account_id=4,status='正常')),dict(id=2,name='WordPress site',batch_ids=[],stage='增长',lifecycle='active',ownership='自营网站',platform='WordPress',priority_order=1,page_count=40,calculator_count=3,article_count=20,computer_name='Macbook Pro',daily_clicks=None,next_action_status='待做',adsense_account_id=99,adsense_connected='未知',gsc_connected='未知',domains=[dict(id=2,website_id=2,domain='wordpress.test',is_primary=1)],provider_accounts=[dict(id=5,provider='github',provider_name=None,name='Unhosted@Example.Com'),dict(id=6,provider='github',provider_name=None,name='Second account')],hosting=dict(id=3,provider='vhost',provider_name='SiteGround',name='host',ip_address='203.0.113.10',status='正常'))]
state=dict(fail=False,copy_fail=False,empty=False,copies=0,stage_fail=False,stage_writes=[],clicks_fail=False,clicks_writes=[])
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
  elif path.startswith('websites/') and len(path.split('/'))==2 and route.request.method=='PATCH':
   fields=route.request.post_data_json
   if 'stage' in fields:
    assert set(fields)=={'stage'},fields;state['stage_writes'].append((path,fields))
    failed=state['stage_fail'];message='模拟阶段保存失败' if failed else '成功'
   else:
    assert set(fields)=={'daily_clicks','daily_clicks_range','clicks_updated_date'},fields
    assert fields['daily_clicks_range'] is None,fields
    assert fields['clicks_updated_date']==datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d'),fields
    state['clicks_writes'].append((path,fields));failed=state['clicks_fail'];message='模拟点击保存失败' if failed else '成功'
   if failed:code=503
   else:
    site=next(s for s in sites if s['id']==int(path.split('/')[1]));site.update(fields);data=site
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
 table=page.locator('.site-table');expect(table.locator('thead th')).to_have_count(13)
 index_link=table.locator('tbody tr').first.get_by_role('link',name='Google 收录查询：example.test（新标签页打开）',exact=True)
 expect(index_link).to_have_attribute('href','https://www.google.com/search?q=site%3Aexample.test')
 expect(index_link).to_have_attribute('target','_blank');expect(index_link).to_have_text('')
 # Primary controls share the header; result metadata uses spare filter-row space.
 tabs=page.get_by_role('navigation',name='网站状态',exact=True)
 heading=page.locator('.workspace-heading')
 assert abs(tabs.bounding_box()['y']-heading.get_by_role('button',name='刷新',exact=True).bounding_box()['y'])<12
 filters=page.locator('.site-filters');results=page.locator('.site-results')
 assert abs(results.bounding_box()['y']-filters.bounding_box()['y'])<12
 assert table.bounding_box()['y']<190

 expect(table.locator('thead th')).to_have_text(['网站 / 主域名','技术栈','总页面数','计算器数量','文章数量','日点击','服务商','GitHub','服务器 IP','电脑','AdSense','阶段','操作'])
 # AdSense status uses explicit activation, independently of account association.
 ads=page.get_by_role('checkbox',name='只显示已开通 AdSense 的网站',exact=True)
 ads_toggle=page.locator('.site-results > .el-checkbox')
 expect(ads).not_to_be_checked()
 expect(table.locator('tbody tr').first.get_by_role('img',name='AdSense：已开通',exact=True)).to_be_visible()
 expect(table.locator('tbody tr').nth(1).get_by_role('img',name='AdSense：未知',exact=True)).to_be_visible()
 table.locator('thead .el-checkbox').click()
 ads_toggle.click();expect(table.locator('tbody tr')).to_have_count(1)
 expect(page.get_by_text('已选 1 个网站',exact=True)).to_be_visible()
 expect(page.locator('.site-results [role="status"]')).to_have_text('1 / 2 个网站')
 expect(page).to_have_url(__import__('re').compile('ads=1'))
 page.reload();expect(ads).to_be_checked();expect(table.locator('tbody tr')).to_have_count(1)
 page.get_by_role('textbox',name='搜索网站或域名',exact=True).fill('wordpress')
 expect(page.get_by_text('没有符合条件的网站。',exact=False)).to_be_visible()
 page.get_by_role('button',name='清除全部条件',exact=True).click()
 expect(ads).not_to_be_checked();expect(table.locator('tbody tr')).to_have_count(2)
 ads_toggle.click();expect(table.locator('tbody tr')).to_have_count(1)
 ads_toggle.click();expect(table.locator('tbody tr')).to_have_count(2)
 expect(page).not_to_have_url(__import__('re').compile('ads='))
 sites[1]['adsense_connected']='未开通';page.get_by_role('button',name='刷新',exact=True).click()
 expect(table.locator('tbody tr').nth(1).get_by_role('img',name='AdSense：未开通',exact=True)).to_be_visible()
 sites[1]['adsense_connected']='未知';page.get_by_role('button',name='刷新',exact=True).click()
 expect(table.locator('tbody tr').nth(1).get_by_role('img',name='AdSense：未知',exact=True)).to_be_visible()
 page.get_by_role('button',name='AdSense',exact=True).click()
 expect(table.locator('tbody tr').first).to_contain_text('WordPress site')
 page.get_by_role('button',name='AdSense',exact=True).click()
 expect(table.locator('tbody tr').first).to_contain_text('Astro site')
 page.get_by_role('button',name='恢复默认排序',exact=True).click()
 for select in filters.locator('.el-select').all():assert select.bounding_box()['width']<=124
 # Exact daily clicks are entered in the row and classified at every existing bucket boundary.
 clicks_cell=table.locator('tbody tr').filter(has=page.get_by_role('button',name='WordPress site',exact=True)).locator('td').nth(5)
 clicks_input=clicks_cell.get_by_role('spinbutton',name='日点击：WordPress site',exact=True)
 expect(clicks_input).to_be_visible()
 for invalid in ['', '-1', '1.5']:
  clicks_input.fill(invalid);clicks_input.press('Enter')
  expect(page.get_by_text('请输入非负整数',exact=True).last).to_be_visible()
 assert state['clicks_writes']==[],state['clicks_writes']
 clicks_input.fill('18')
 clicks_input.evaluate("e=>e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,isComposing:true,bubbles:true,cancelable:true}))")
 clicks_input.evaluate("e=>e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:false,bubbles:true,cancelable:true}))")
 assert state['clicks_writes']==[],state['clicks_writes']
 for number,label in [(0,'＜10（0）'),(9,'＜10（9）'),(10,'10–29（10）'),(29,'10–29（29）'),(30,'30–49（30）'),(49,'30–49（49）'),(50,'50–99（50）'),(99,'50–99（99）'),(100,'≥100（100）'),(120,'≥100（120）')]:
  if number:clicks_cell.get_by_role('button').click();expect(clicks_input).to_be_focused()
  clicks_input.fill(str(number))
  if number==120:clicks_cell.get_by_role('button',name='保存日点击：WordPress site',exact=True).click()
  else:clicks_input.press('Enter')
  expect(clicks_cell.get_by_role('button',name=label,exact=True)).to_be_visible()
 expect(page.locator('.website-detail-drawer')).not_to_be_visible()
 assert sites[1]['daily_clicks']==120 and sites[1]['daily_clicks_range'] is None
 clicks_cell.get_by_role('button').click();clicks_input.fill('57');state['clicks_fail']=True;clicks_input.press('Enter')
 expect(page.get_by_text('模拟点击保存失败',exact=True)).to_be_visible();expect(clicks_input).to_have_value('57')
 assert sites[1]['daily_clicks']==120 and len(state['clicks_writes'])==11
 clicks_input.press('Escape');expect(clicks_cell.get_by_role('button',name='≥100（120）',exact=True)).to_be_visible()
 state['clicks_fail']=False
 page.reload();page.wait_for_load_state('networkidle');expect(clicks_cell).to_contain_text('≥100（120）')
 page.get_by_role('button',name='日点击',exact=True).click();expect(table.locator('tbody tr').first).to_contain_text('Astro site')
 page.get_by_role('button',name='日点击',exact=True).click();expect(table.locator('tbody tr').first).to_contain_text('WordPress site')
 # Stage editing stays in the row, persists only the stage, and preserves the old value on failure.
 stage_row=table.locator('tbody tr').filter(has=page.get_by_role('button',name='Astro site',exact=True))
 stage_select=stage_row.locator('.site-stage-select')
 def choose_stage(value):
  stage_select.locator('.el-select__wrapper').click();page.get_by_role('option',name=value,exact=True).click()
 choose_stage('维护');expect(stage_select).to_contain_text('维护')
 expect(page.locator('.website-detail-drawer')).not_to_be_visible()
 assert state['stage_writes']==[('websites/1',{'stage':'维护'})],state['stage_writes']
 page.reload();page.wait_for_load_state('networkidle');expect(stage_select).to_contain_text('维护')
 state['stage_fail']=True;choose_stage('暂停')
 expect(page.get_by_text('模拟阶段保存失败',exact=True)).to_be_visible();expect(stage_select).to_contain_text('维护')
 state['stage_fail']=False;choose_stage('验证');expect(stage_select).to_contain_text('验证')
 # Changing a filtered row updates the result list after the save.
 page.goto('http://127.0.0.1:5173/home?stage=验证');page.wait_for_load_state('networkidle')
 choose_stage('维护');expect(table.locator('tbody tr')).to_have_count(0)
 page.get_by_role('button',name='清除全部条件',exact=True).click();choose_stage('验证');expect(stage_select).to_contain_text('验证')
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
 expect(row.locator('td').nth(3)).to_have_text('0');expect(row.locator('td').nth(6).locator('.provider-identity')).to_have_count(1);expect(row.get_by_role('link',name='GitHub · Coder',exact=True)).to_have_attribute('href','https://github.com/org/repo')
 github_cell=row.locator('td').nth(7)
 expect(github_cell.locator('.provider-identity')).to_have_attribute('title','GitHub · Coder@Example.Com')
 expect(github_cell.locator('img')).to_be_visible()
 assert github_cell.locator('img').evaluate('e=>e.complete && e.naturalWidth>0')
 expect(github_cell).not_to_contain_text('@Example.Com')
 direct_github=table.locator('tbody tr').filter(has_text='WordPress site').locator('td').nth(7)
 expect(direct_github.locator('.provider-identity')).to_have_count(2)
 expect(direct_github.get_by_role('button',name='GitHub · Unhosted',exact=True)).to_be_visible()
 expect(direct_github.get_by_role('button',name='GitHub · Second account',exact=True)).to_be_visible()
 direct_github.get_by_role('button',name='GitHub · Unhosted',exact=True).click()
 account_drawer=page.locator('.website-detail-drawer');expect(account_drawer).to_be_visible()
 expect(account_drawer.get_by_role('tab',name='部署与账号',exact=True)).to_have_attribute('aria-selected','true')
 account_drawer.locator('.el-drawer__close-btn').click();expect(account_drawer).not_to_be_visible()
 page.get_by_role('button',name='GitHub',exact=True).click();expect(table.locator('tbody tr').first).to_contain_text('Astro site')
 page.get_by_role('button',name='GitHub',exact=True).click();expect(table.locator('tbody tr').first).to_contain_text('WordPress site')
 # A repository without a known account keeps its real repository link.
 github_account=sites[0]['provider_accounts'].pop()
 page.get_by_role('button',name='刷新',exact=True).click()
 expect(github_cell.get_by_role('link',name='GitHub · org/repo',exact=True)).to_have_attribute('href','https://github.com/org/repo')
 sites[0]['provider_accounts'].append(github_account)
 page.get_by_role('button',name='刷新',exact=True).click()
 expect(github_cell.get_by_role('link',name='GitHub · Coder',exact=True)).to_be_visible()
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
 page.locator('.el-select').filter(has=page.get_by_role('combobox',name='阶段筛选')).locator('.el-select__wrapper').click();page.get_by_role('option',name='验证',exact=True).click();expect(table.locator('tbody tr')).to_have_count(1);expect(table.locator('thead th')).to_have_count(13)
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
 page.set_viewport_size({'width':952,'height':876})
 filter_boxes=[item.bounding_box() for item in filters.locator(':scope > *').all()]
 assert max(box['y'] for box in filter_boxes)-min(box['y'] for box in filter_boxes)<2,filter_boxes
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
 expect(ads).not_to_be_checked()
 assert ads_toggle.bounding_box()['x']<results.locator('[role="status"]').bounding_box()['x']
 table.locator('tbody tr').first.locator('td').nth(10).scroll_into_view_if_needed()
 page.screenshot(path='/tmp/domain-manager-adsense-952.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});expect(table).to_be_visible()
 wrap=page.locator('.portfolio-table-wrap');assert wrap.evaluate('e=>e.scrollWidth>e.clientWidth')
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
 page.screenshot(path='/tmp/domain-manager-structure-mobile.png',full_page=True)
 assert not errors,errors
 browser.close()
print('Portfolio UI passed')
