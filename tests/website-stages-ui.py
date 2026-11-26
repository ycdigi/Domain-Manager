"""Stage choices across editing/filtering/bulk/batches and independent new-site classification."""
import base64,json,re
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:5173'
sites=[dict(id=i,name=name,stage=stage,new_site_override=1 if new else 0,is_new_site=new,lifecycle='active',ownership='自营网站',platform='WordPress',priority_order=i,adsense_connected='未知',gsc_connected='未知',next_action_status='待做',domains=[dict(id=i,website_id=i,domain=f'stage-{i}.test',is_primary=1,registrar_date='2026-01-01')],batch_ids=[1]) for i,name,stage,new in [(1,'New Growing','增长',True),(2,'Stable','平稳',False),(3,'New Declining','下降',True)]]
stages=['待评估','验证','增长','平稳','下降','维护','暂停']
writes=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);context=browser.new_context(viewport={'width':1600,'height':1000},permissions=['clipboard-read','clipboard-write']);page=context.new_page()
 page.add_init_script('localStorage.setItem("auth_token",'+json.dumps(base64.b64encode(json.dumps(dict(token='test')).encode()).decode())+')')
 def handle(route):
  req=route.request;path=req.url.split('/api/')[-1].split('?')[0];data=[]
  if req.method in ['PATCH','POST']:writes.append((path,req.post_data_json))
  if path=='websites':data=sites
  elif path=='batches':data=[dict(id=1,name='Stage batch',status='进行中',member_count=3)]
  elif path=='batches/1':data=dict(id=1,name='Stage batch',status='进行中',members=[dict(membership_id=s['id'],website_id=s['id'],membership_status='active',**{k:s[k] for k in ['name','stage','platform']}) for s in sites])
  elif path.startswith('websites/') and req.method=='PATCH' and path!='websites/batch':
   data=next(s for s in sites if s['id']==int(path.split('/')[1]));data.update(req.post_data_json)
  elif path=='websites/batch':
   body=req.post_data_json
   for s in sites:
    if s['id'] in body['website_ids']:s.update(body['fields'])
   data=dict(accepted=len(body['website_ids']))
  elif path=='monitor':data=dict(monitors=[],incidents=[],unread_count=0,runner=None)
  elif path=='work-queue':data=dict(counts=dict(total=0),items=[])
  route.fulfill(json=dict(status=200,message='成功',data=data))
 page.route(BASE+'/api/**',handle)
 def go(path='/home'):
  page.goto(BASE+path);page.wait_for_load_state('networkidle')
 def select(label,value):
  control=page.get_by_role('combobox',name=label,exact=True).last
  control.locator('xpath=ancestor::div[contains(@class,"el-select__wrapper")]').click()
  page.locator('#'+control.get_attribute('aria-controls')).get_by_role('option',name=value,exact=True).click()
 go()
 row=page.locator('.site-table tbody tr').filter(has=page.get_by_role('button',name='New Growing',exact=True))
 expect(row).to_contain_text('新站')
 select('新站分类筛选','新站');expect(page.locator('.site-table tbody tr')).to_have_count(2)
 expect(page).to_have_url(re.compile('new=1'))
 page.reload();page.wait_for_load_state('networkidle');expect(page.locator('.site-table tbody tr')).to_have_count(2)
 select('阶段筛选','下降');expect(page.locator('.site-table tbody tr')).to_have_count(1);expect(page.locator('.site-table tbody tr')).to_contain_text('New Declining')
 page.get_by_role('button',name='清除全部条件',exact=True).click()
 select('新站分类筛选','普通站');expect(page.locator('.site-table tbody tr')).to_have_count(1);expect(page.locator('.site-table tbody tr')).to_contain_text('Stable')
 page.get_by_role('button',name='清除全部条件',exact=True).click()
 row.get_by_role('button',name='阶段：New Growing',exact=True).click()
 expect(page.get_by_role('option')).to_have_text(stages)
 page.get_by_role('option',name='下降',exact=True).click();expect(row).to_contain_text('下降');expect(row).to_contain_text('新站')
 page.reload();page.wait_for_load_state('networkidle');expect(row).to_contain_text('下降')
 page.get_by_role('button',name='阶段',exact=True).click()
 assert page.locator('.site-table .site-name').all_text_contents()==['Stable','New Growing','New Declining']
 row.get_by_role('button',name='复制网站分析资料：New Growing',exact=True).click()
 text=page.evaluate('navigator.clipboard.readText()');assert '阶段：下降' in text and '新站分类：新站' in text
 row.get_by_role('button',name='New Growing',exact=True).click()
 stage=page.get_by_role('dialog').get_by_label('阶段',exact=True)
 stage.locator('xpath=ancestor::div[contains(@class,"el-select__wrapper")]').click()
 expect(page.get_by_role('option')).to_have_text(stages);page.get_by_role('option',name='平稳',exact=True).click()
 page.get_by_role('dialog').get_by_role('button',name='保存',exact=True).click()
 expect(row).to_contain_text('平稳');expect(row).to_contain_text('新站')
 page.get_by_role('button',name='Close this dialog',exact=True).click()
 page.locator('.site-table thead .el-checkbox').click()
 page.get_by_role('button',name='批量设置',exact=True).click();select('批量设置阶段','下降')
 page.get_by_role('button',name='保存批量设置',exact=True).click()
 expect(page.locator('.site-table tbody tr').first).to_contain_text('下降')
 assert any(path=='websites/batch' and body.get('fields')=={'stage':'下降'} for path,body in writes)
 go('/batches/1');select('按阶段筛选','下降');expect(page.locator('.batch-members-table tbody tr')).to_have_count(3)
 page.get_by_role('button',name='批量加入网站',exact=True).click();select('按阶段筛选','平稳')
 page.get_by_role('checkbox',name='统一设置阶段',exact=True).locator('xpath=ancestor::label').click();select('统一设置阶段','下降')
 expect(page.get_by_role('dialog')).to_be_visible()
 page.screenshot(path='/tmp/domain-manager-stage-batch-options.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});go('/home?new=1&stage=下降')
 expect(page.locator('.site-table tbody tr')).to_have_count(2)
 expect(page.locator('.site-table tbody tr').first).to_contain_text('新站')
 trigger=page.locator('.site-stage-cell .site-choice-trigger').first
 trigger.scroll_into_view_if_needed();assert trigger.bounding_box()['height']>=44
 trigger.click();expect(page.get_by_role('option')).to_have_text(stages)
 page.keyboard.press('Escape');expect(trigger).to_be_focused()
 page.screenshot(path='/tmp/domain-manager-stages-mobile.png',full_page=True)
 browser.close()
 print('PASS: stages in quick edit, profile, bulk, batch filters/assignment; independent new-site filter, refresh, sort and Markdown')
