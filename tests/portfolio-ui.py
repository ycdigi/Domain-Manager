"""Website table/browser acceptance. Run with Vite at port 5173; API fixtures contain no real credentials."""
import base64
import json
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect

sites=[dict(id=1,name='Astro site',batch_ids=[7,8],stage='验证',lifecycle='active',ownership='自营网站',platform='Astro',priority_order=0,page_count=25,calculator_count=0,article_count=12,computer_name='Mac Mini YC',daily_clicks=8,content_stats_updated_date='2026-11-21',clicks_updated_date='2026-11-21',next_action_status='待做',adsense_connected='已开通',adsense_account_id=10,adsense_account_name='Google main',gsc_connected='未知',domains=[dict(id=1,website_id=1,domain='example.test',is_primary=1)],hosting=None,provider_accounts=[dict(id=3,provider='cloudflare',provider_name=None,name='Suscoding@Gmail.Com'),dict(id=4,provider='github',provider_name=None,name='Coder@Example.Com')],repository=dict(id=1,name='org/repo',resource_url='https://github.com/org/repo',account_id=4,status='正常')),dict(id=2,name='WordPress site',batch_ids=[],stage='增长',lifecycle='active',ownership='自营网站',platform='WordPress',priority_order=1,page_count=40,calculator_count=3,article_count=20,computer_name='Macbook Pro',daily_clicks=None,next_action_status='待做',adsense_account_id=99,adsense_account_name='Not enabled account',adsense_connected='未知',gsc_connected='未知',domains=[dict(id=2,website_id=2,domain='wordpress.test',is_primary=1)],provider_accounts=[dict(id=5,provider='github',provider_name=None,name='Unhosted@Example.Com'),dict(id=6,provider='github',provider_name=None,name='Second account')],hosting=dict(id=3,provider='vhost',provider_name='SiteGround',name='host',ip_address='203.0.113.10',status='正常'))]
state=dict(fail=False,copy_fail=False,empty=False,copies=0,stage_fail=False,stage_hold=False,stage_route=None,stage_requests=[])
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
  elif path in ('websites/1','websites/2') and route.request.method=='PATCH':
   fields=route.request.post_data_json;state['stage_requests'].append(fields)
   if state['stage_hold']:
    state['stage_route']=route;return
   code=503 if state['stage_fail'] else 200;message='模拟保存失败，请重试' if state['stage_fail'] else '成功'
   site=next(s for s in sites if s['id']==int(path.split('/')[1]))
   if code==200:site.update(fields)
   data=site
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

 expect(table.locator('thead th')).to_have_text(['网站 / 主域名','技术栈','总页面数','计算器数量','文章数量','日点击','服务商','GitHub','电脑','AdSense','阶段','操作'])
 row=table.locator('tbody tr').filter(has=page.get_by_role('button',name='Astro site',exact=True))
 # Numeric and icon columns keep their compact widths even on wide screens.
 assert page.locator('.portfolio-table-wrap').evaluate('e => e.scrollWidth <= e.clientWidth + 1'),'all twelve columns should fit at 1600px'
 for width in [1600,1920]:
  page.set_viewport_size(dict(width=width,height=1000))
  cells=row.locator('td')
  assert cells.nth(1).bounding_box()['width']<=80,'stack icon column wastes horizontal space'
  for index in [2,3,4,5]:
   assert cells.nth(index).bounding_box()['width']<=96,'numeric column expands into spare space'
  for index in [1,2,3,4,5]:
   header=table.locator('th').nth(index)
   assert header.evaluate('e => e.scrollWidth <= e.clientWidth + 1'),'header is clipped'
  assert cells.nth(1).locator('svg').count()>0
 page.set_viewport_size(dict(width=1600,height=1000))
 # Remote additions coexist with metric editing: AdSense, batch filters and safe Markdown copy.
 ads=page.get_by_role('checkbox',name='只显示已开通 AdSense 的网站',exact=True)
 expect(row.locator('.site-adsense-account')).to_have_text('Google main')
 expect(table.locator('tbody tr').nth(1).locator('.site-adsense-status')).to_have_attribute('aria-label','AdSense：未知')
 page.locator('.site-results .el-checkbox').click();expect(table.locator('tbody tr')).to_have_count(1);page.reload();page.wait_for_load_state('networkidle')
 expect(ads).to_be_checked();page.locator('.site-results .el-checkbox').click();expect(table.locator('tbody tr')).to_have_count(2)
 batch_filter=page.locator('.site-filters .el-select').filter(has=page.get_by_role('combobox',name='网站批次筛选',exact=True))
 batch_filter.locator('.el-select__wrapper').click();page.get_by_role('option',name='第一批',exact=True).click()
 expect(table.locator('tbody tr')).to_have_count(1)
 table.locator('thead .el-checkbox').click();page.get_by_role('button',name='复制 Markdown',exact=True).click()
 expect(page.get_by_text('已复制 1 个网站的 Markdown',exact=True)).to_be_visible()
 markdown=page.evaluate('navigator.clipboard.readText()')
 assert 'example.test' in markdown and 'AdSense：已开通' in markdown and 'fixture-token' not in markdown,markdown
 table.locator('thead .el-checkbox').click()
 page.get_by_role('button',name='清除全部条件',exact=True).click();expect(table.locator('tbody tr')).to_have_count(2)
 # Stack and computer are editable without opening the full detail drawer.
 def choose(label,option):
  row.locator('.el-select').filter(has=page.get_by_role('combobox',name=label,exact=True)).locator('.el-select__wrapper').click()
  page.get_by_role('option',name=option,exact=True).click()
  expect(row.get_by_role('combobox',name=label,exact=True)).to_be_enabled()
 choose('技术栈：Astro site','Next.js')
 assert state['stage_requests'][-1]=={'platform':'Next.js','platform_other':None}
 stack=row.get_by_role('combobox',name='技术栈：Astro site',exact=True)
 stack.fill('Hugo');page.get_by_role('option',name='Hugo',exact=True).click();expect(stack).to_be_enabled()
 assert state['stage_requests'][-1]=={'platform':'其他','platform_other':'Hugo'}
 page.reload();page.wait_for_load_state('networkidle');expect(row.locator('.el-select').filter(has=page.get_by_role('combobox',name='技术栈：Astro site',exact=True))).to_contain_text('Hugo')
 choose('技术栈：Astro site','其他')
 assert state['stage_requests'][-1]=={'platform':'其他','platform_other':None}
 choose('技术栈：Astro site','Astro')
 choose('电脑：Astro site','Macbook Pro')
 assert state['stage_requests'][-1]=={'computer_name':'Macbook Pro'}
 computer=row.get_by_role('combobox',name='电脑：Astro site',exact=True)
 computer.fill('Office PC');page.get_by_role('option',name='Office PC',exact=True).click();expect(computer).to_be_enabled()
 assert state['stage_requests'][-1]=={'computer_name':'Office PC'}
 row.locator('.el-select').filter(has=page.get_by_role('combobox',name='电脑：Astro site',exact=True)).hover()
 row.locator('.el-select__clear').click();expect(computer).to_be_enabled()
 assert state['stage_requests'][-1]=={'computer_name':None}
 choose('电脑：Astro site','Mac Mini YC')
 # Each metric sends only its own value and the explicitly entered statistics date.
 for label,key,value in [('总页面数','page_count','26'),('计算器数量','calculator_count','0'),('文章数量','article_count','13')]:
  row.get_by_role('button',name=f'编辑{label}：Astro site',exact=True).click()
  editor=page.get_by_role('dialog',name=f'编辑{label}',exact=True)
  expect(editor.get_by_role('spinbutton',name=label,exact=True)).to_be_focused()
  editor.get_by_role('spinbutton',name=label,exact=True).fill(value)
  editor.get_by_label('统计日期',exact=True).fill('2026-11-20')
  editor.get_by_role('button',name='保存',exact=True).click()
  expect(editor).not_to_be_visible()
  assert state['stage_requests'][-1]=={key:int(value),'content_stats_updated_date':'2026-11-20'}
 # Validation blocks missing dates; a rejected save retains the entered draft.
 row.get_by_role('button',name='编辑日点击：Astro site',exact=True).click()
 editor=page.get_by_role('dialog',name='编辑日点击',exact=True)
 editor.get_by_role('spinbutton',name='日点击',exact=True).fill('0')
 editor.get_by_label('统计日期',exact=True).fill('')
 before=len(state['stage_requests']);editor.get_by_role('button',name='保存',exact=True).click()
 assert len(state['stage_requests'])==before
 state['stage_fail']=True
 editor.get_by_label('统计日期',exact=True).fill('2026-11-19')
 editor.get_by_role('button',name='保存',exact=True).click()
 expect(page.get_by_text('模拟保存失败，请重试',exact=True)).to_be_visible()
 expect(editor.get_by_role('spinbutton',name='日点击',exact=True)).to_have_value('0')
 state['stage_fail']=False;editor.get_by_role('button',name='保存',exact=True).click()
 expect(editor).not_to_be_visible()
 assert state['stage_requests'][-1]=={'daily_clicks':0,'daily_clicks_range':None,'clicks_updated_date':'2026-11-19'}
 row.get_by_role('button',name='编辑日点击：Astro site',exact=True).click()
 editor.locator('.el-select__wrapper').click()
 page.get_by_role('option',name='30–49 次',exact=True).click()
 editor.get_by_role('button',name='保存',exact=True).click();expect(editor).not_to_be_visible()
 assert state['stage_requests'][-1]=={'daily_clicks':None,'daily_clicks_range':'30to49','clicks_updated_date':'2026-11-19'}
 expect(row.get_by_role('button',name='编辑日点击：Astro site',exact=True)).to_contain_text('30–49')
 # Cancellation writes nothing; route navigation protects unsaved values.
 row.get_by_role('button',name='编辑总页面数：Astro site',exact=True).click()
 counts_editor=page.get_by_role('dialog',name='编辑总页面数',exact=True)
 counts_editor.get_by_role('spinbutton',name='总页面数',exact=True).fill('99')
 page.get_by_role('textbox',name='搜索网站或域名',exact=True).fill('wordpress')
 confirm=page.get_by_role('dialog',name='离开编辑',exact=True)
 expect(confirm).to_be_visible();confirm.get_by_role('button',name='继续编辑',exact=True).click()
 expect(counts_editor.get_by_role('spinbutton',name='总页面数',exact=True)).to_have_value('99')
 before=len(state['stage_requests']);counts_editor.get_by_role('button',name='取消',exact=True).click()
 expect(counts_editor).not_to_be_visible();assert len(state['stage_requests'])==before
 # Clearing a measurement preserves the difference between unknown and zero.
 row.get_by_role('button',name='编辑文章数量：Astro site',exact=True).click()
 article_editor=page.get_by_role('dialog',name='编辑文章数量',exact=True)
 article_editor.get_by_role('spinbutton',name='文章数量',exact=True).fill('')
 article_editor.get_by_role('button',name='保存',exact=True).click();expect(article_editor).not_to_be_visible()
 assert state['stage_requests'][-1]=={'article_count':None,'content_stats_updated_date':'2026-11-20'}
 expect(row.get_by_role('button',name='编辑文章数量：Astro site',exact=True)).to_have_text('—')
 page.goto('http://127.0.0.1:5173/home?sort=ip&direction=desc');page.wait_for_load_state('networkidle')
 expect(table.locator('thead th[aria-sort]')).to_have_count(0)
 expect(page.get_by_role('button',name='恢复默认排序',exact=True)).to_have_count(0)
 expect(table.locator('tbody tr').first).to_contain_text('Astro site')
 expect(page.locator('.website-detail-drawer')).not_to_be_visible()
 state['stage_requests']=[]
 # Inline stage saves only the changed field; pending writes cannot be repeated.
 stage=row.get_by_role('combobox',name='阶段：Astro site',exact=True)
 stage_select=row.locator('.site-stage-select')
 expect(stage_select).to_contain_text('验证')
 state['stage_hold']=True
 stage_select.locator('.el-select__wrapper').click()
 expect(page.get_by_role('option')).to_have_text(['待评估','验证','增长','维护','暂停'])
 page.get_by_role('option',name='维护',exact=True).click()
 expect(stage).to_be_disabled()
 expect(table.get_by_role('combobox',name='阶段：WordPress site',exact=True)).to_be_disabled()
 expect(page.locator('.website-detail-drawer')).not_to_be_visible()
 assert state['stage_requests']==[{'stage':'维护'}]
 sites[0]['stage']='维护';state['stage_hold']=False
 state['stage_route'].fulfill(json=dict(status=200,message='成功',data=sites[0]))
 expect(stage).to_be_enabled();expect(stage_select).to_contain_text('维护')
 page.reload();page.wait_for_load_state('networkidle');expect(stage_select).to_contain_text('维护')
 stage_select.locator('.el-select__wrapper').click();page.get_by_role('option',name='验证',exact=True).click()
 expect(stage_select).to_contain_text('验证');expect(stage).to_be_enabled()
 # A rejected save keeps the original selection and allows retry.
 state['stage_fail']=True
 stage_select.locator('.el-select__wrapper').click();page.get_by_role('option',name='暂停',exact=True).click()
 expect(page.get_by_text('模拟保存失败，请重试',exact=True)).to_be_visible()
 expect(stage_select).to_contain_text('验证');expect(stage).to_be_enabled()
 state['stage_fail']=False
 # A stage-filtered row leaves the result only after its new stage is saved.
 page.goto('http://127.0.0.1:5173/home?stage=验证');page.wait_for_load_state('networkidle')
 stage_select.locator('.el-select__wrapper').click();page.get_by_role('option',name='维护',exact=True).click()
 expect(table.locator('tbody tr')).to_have_count(0)
 expect(page.locator('.site-results').get_by_role('status')).to_contain_text('0 / 2 个网站')
 page.get_by_role('button',name='清除全部条件',exact=True).click()
 expect(stage_select).to_contain_text('维护')
 # Keyboard operation restores the previous stage without opening details.
 stage.focus();stage.press('Enter');stage.press('ArrowUp');stage.press('ArrowUp');stage.press('Enter')
 expect(stage_select).to_contain_text('验证');expect(stage).to_be_enabled()
 expect(page.locator('.website-detail-drawer')).not_to_be_visible()
 # Stage sorting reacts to a saved stage while the other website stays intact.
 page.get_by_role('button',name='阶段',exact=True).click()
 expect(table.locator('tbody tr').first).to_contain_text('Astro site')
 stage_select.locator('.el-select__wrapper').click();page.get_by_role('option',name='维护',exact=True).click()
 expect(table.locator('tbody tr').first).to_contain_text('WordPress site')
 stage_select.locator('.el-select__wrapper').click();page.get_by_role('option',name='验证',exact=True).click()
 expect(table.locator('tbody tr').first).to_contain_text('Astro site')
 expect(row.locator('td').nth(3)).to_have_text('0');expect(row).to_contain_text('Cloudflare');expect(row.get_by_role('link',name='Coder')).to_have_attribute('href','https://github.com/org/repo')
 page.get_by_role('button',name='总页面数',exact=True).click();expect(table.locator('tbody tr').first).to_contain_text('Astro site')
 page.get_by_role('button',name='总页面数',exact=True).click();expect(table.locator('tbody tr').first).to_contain_text('WordPress site')
 expect(table.locator('th[aria-sort]')).to_have_count(1)
 row.get_by_role('button',name='复制资料').click();expect(page.get_by_text('开发资料已复制',exact=True)).to_be_visible()
 assert page.evaluate('navigator.clipboard.readText()').endswith('Github Token：fixture-token')
 wp=table.locator('tbody tr').filter(has=page.get_by_role('button',name='WordPress site',exact=True))
 expect(wp.get_by_role('button',name='复制资料')).to_be_disabled()
 expect(table.get_by_role('button',name='203.0.113.10',exact=True)).to_have_count(0)
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
 page.set_viewport_size({'width':952,'height':876})
 filter_boxes=[item.bounding_box() for item in filters.locator(':scope > *').all()]
 assert max(box['y'] for box in filter_boxes)-min(box['y'] for box in filter_boxes)<2,filter_boxes
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
 ads=page.get_by_role('checkbox',name='只显示已开通 AdSense 的网站',exact=True)
 ads_toggle=page.locator('.site-results .el-checkbox')
 expect(ads).not_to_be_checked()
 assert ads_toggle.bounding_box()['x']<results.locator('[role="status"]').bounding_box()['x']
 table.locator('tbody tr').first.locator('td').nth(10).scroll_into_view_if_needed()
 page.screenshot(path='/tmp/domain-manager-adsense-952.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});expect(table).to_be_visible()
 wrap=page.locator('.portfolio-table-wrap');assert wrap.evaluate('e=>e.scrollWidth>e.clientWidth')
 for label in ['总页面数','计算器数量','文章数量','日点击']:
  box=row.get_by_role('button',name=f'编辑{label}：Astro site',exact=True).bounding_box()
  assert box['width']>=44 and box['height']>=44,(label,box)
 expect(row.locator('.site-stack-select .el-select__wrapper')).to_have_css('min-height','44px')
 assert row.locator('.site-stack-select .el-select__wrapper').bounding_box()['height']>=44
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
 stage.scroll_into_view_if_needed();stage_select.locator('.el-select__wrapper').click()
 page.get_by_role('option',name='维护',exact=True).click()
 expect(stage_select).to_contain_text('维护');expect(stage).to_be_enabled()
 expect(page.locator('.website-detail-drawer')).not_to_be_visible()
 row.get_by_role('button',name='编辑日点击：Astro site',exact=True).click()
 mobile_editor=page.get_by_role('dialog',name='编辑日点击',exact=True)
 box=mobile_editor.bounding_box();assert box['x']>=0 and box['x']+box['width']<=390,box
 expect(mobile_editor.locator('..')).to_have_css('opacity','1')
 page.screenshot(path='/tmp/domain-manager-metric-mobile.png',full_page=True)
 mobile_editor.get_by_role('button',name='取消',exact=True).click()
 page.screenshot(path='/tmp/domain-manager-stage-mobile.png',full_page=True)
 page.screenshot(path='/tmp/domain-manager-structure-mobile.png',full_page=True)
 assert not errors,errors
 browser.close()
print('Portfolio UI passed')
