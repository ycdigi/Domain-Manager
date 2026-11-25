"""Account quick edits, safe per-site export and AdSense ordering; Vite on 5173."""
import base64
import json
from playwright.sync_api import sync_playwright, expect

accounts=[dict(id=1,provider='cloudflare',name='Old',status='正常'),dict(id=2,provider='vhost',provider_name='Hostinger',name='New',status='正常'),dict(id=3,provider='github',name='Coder',status='正常'),dict(id=4,provider='github',name='Next coder',status='正常'),dict(id=5,provider='github',name='Disabled',status='停用')]
accounts += [dict(id=6,provider='cloudflare',name='Suscoding@Gmail.Com',status='正常'),dict(id=7,provider='github',name='GitUser@Example.Com',status='正常')]
sites=[dict(id=i,name=name,stage='验证',lifecycle='active',ownership='自营网站',platform='Astro',priority_order=i,adsense_connected=status,adsense_account_name=account,gsc_connected='未知',next_action_status='待做',domains=[],direct_account_ids=[1,3],provider_accounts=[accounts[0],accounts[2]]) for i,name,status,account in [(1,'Zulu site','已开通','Zulu'),(2,'Alpha site','已开通','Alpha'),(3,'Unknown site','未知','Hidden account'),(4,'Closed site','未开通','Another hidden account'),(5,'Enabled site','已开通',None),(6,'No income site','已开通','Missing')]]
sites[0]['income_totals']=[dict(currency='USD',amount=9),dict(currency='EUR',amount=9999)]
sites[1]['income_totals']=[dict(currency='USD',amount=1000.5)]
sites[2]['income_totals']=[dict(currency='USD',amount=99999)]
sites[4]['income_totals']=[dict(currency='USD',amount=0)]
sites[1]['direct_account_ids']=[3,4]
sites[1]['provider_accounts']=[accounts[2],accounts[3]]
state=dict(fail=False,accounts_fail=False,requests=[])
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport=dict(width=1600,height=1000),permissions=['clipboard-read','clipboard-write'])
 page=context.new_page()
 page.add_init_script('localStorage.setItem("auth_token",'+json.dumps(base64.b64encode(json.dumps(dict(token='test')).encode()).decode())+')')
 def handle(route):
  path=route.request.url.split('?')[0].split('/api/')[-1];data=[];status=200
  if path=='websites':data=sites
  elif path=='resources/accounts':
   data=accounts;status=503 if state['accounts_fail'] else 200
  elif path=='resources/account-links' and route.request.method=='PUT':
   body=route.request.post_data_json;state['requests'].append(body)
   if state['fail']:status=503
   else:
    site=next(s for s in sites if s['id']==body['website_id'])
    ids=[id for id in site['direct_account_ids'] if (next(a for a in accounts if a['id']==id)['provider']=='github') != (body['kind']=='github')]
    if body['account_id']:ids.append(body['account_id'])
    site['direct_account_ids']=ids;site['provider_accounts']=[a for a in accounts if a['id'] in ids]
  elif path=='monitor':data=dict(monitors=[],incidents=[],unread_count=0,runner=None)
  elif path=='work-queue':data=dict(counts=dict(total=0),items=[])
  route.fulfill(status=status,json=dict(status=status,data=data,message='模拟账号保存失败' if status!=200 else '成功'))
 page.route('http://127.0.0.1:5173/api/**',handle)
 page.goto('http://127.0.0.1:5173/home');page.wait_for_load_state('networkidle')
 row=page.locator('tbody tr').filter(has=page.get_by_role('button',name='Zulu site',exact=True))
 select=row.get_by_role('combobox',name='服务商：Zulu site',exact=True)
 expect(select).to_be_visible()
 expect(row.locator('.site-adsense-total')).to_have_text('$9.00')
 expect(page.locator('tbody tr').filter(has=page.get_by_role('button',name='Enabled site',exact=True)).locator('.site-adsense-total')).to_have_text('$0.00')
 expect(page.locator('tbody tr').filter(has=page.get_by_role('button',name='No income site',exact=True)).locator('.site-adsense-total')).to_have_text('—')
 expect(page.locator('tbody tr').filter(has=page.get_by_role('button',name='Unknown site',exact=True)).locator('.site-adsense-total')).to_have_count(0)
 expect(page.locator('tbody tr').filter(has=page.get_by_role('button',name='Alpha site',exact=True)).locator('td').nth(7)).to_contain_text('多个账号（2）')
 assert not state['requests']
 # Visible options share the compact selected label; complete accounts remain in tooltips.
 for index,short,full in [(6,'Suscoding','Cloudflare · Suscoding@Gmail.Com'),(7,'GitUser','GitHub · GitUser@Example.Com')]:
  row.locator('td').nth(index).locator('.el-select__wrapper').click()
  identity=page.get_by_role('option').filter(has_text=short).locator('.provider-identity')
  assert identity.locator(':scope > span').evaluate("el => [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim()")==short
  assert identity.locator('.provider-identity-brand').evaluate('el => el.getBoundingClientRect().width <= 1')
  expect(identity.locator('img')).to_have_count(1)
  expect(identity).to_have_attribute('title',full)
  page.screenshot(path=f'/tmp/domain-manager-compact-options-{index}.png',animations='disabled')
  page.keyboard.press('Escape')
 row.locator('td').nth(7).locator('.el-select__wrapper').click()
 expect(page.get_by_role('option',name='GitHub · Disabled',exact=True)).to_have_count(0)
 page.keyboard.press('Escape')
 def choose(label,option):
  row.locator('.el-select').filter(has=page.get_by_role('combobox',name=label,exact=True)).locator('.el-select__wrapper').click()
  page.get_by_role('option',name=option,exact=True).click()
  expect(row.get_by_role('combobox',name=label,exact=True)).to_be_enabled()
 choose('服务商：Zulu site','Hostinger · New')
 assert state['requests'][-1]==dict(website_id=1,kind='service',account_id=2)
 expect(row.locator('td').nth(6)).to_contain_text('New')
 choose('GitHub：Zulu site','GitHub · Next coder')
 assert state['requests'][-1]==dict(website_id=1,kind='github',account_id=4)
 page.reload();page.wait_for_load_state('networkidle');expect(row.locator('td').nth(7)).to_contain_text('Next coder')
 state['fail']=True;choose('服务商：Zulu site','Cloudflare · Old')
 expect(page.get_by_text('模拟账号保存失败',exact=True)).to_be_visible()
 expect(row.locator('td').nth(6)).to_contain_text('New')
 state['fail']=False
 choose('服务商：Zulu site','不关联账号');expect(row.locator('td').nth(6)).to_contain_text('不关联账号')
 github=row.get_by_role('combobox',name='GitHub：Zulu site',exact=True)
 github.focus();github.press('Enter');github.press('ArrowUp');github.press('Enter')
 expect(row.locator('td').nth(7)).to_contain_text('Coder')
 row.get_by_role('button',name='复制网站分析资料：Zulu site',exact=True).click()
 expect(page.get_by_text('已复制 1 个网站的 Markdown',exact=True)).to_be_visible()
 md=page.evaluate('navigator.clipboard.readText()')
 assert 'Zulu site' in md and 'Alpha site' not in md and 'Token' not in md
 row.locator('.el-checkbox').click()
 page.get_by_role('button',name='复制 Markdown',exact=True).click()
 assert page.evaluate('navigator.clipboard.readText()')==md
 page.get_by_role('button',name='AdSense',exact=True).click()
 names=lambda:page.locator('tbody tr .site-name').all_text_contents()
 assert names()==['Unknown site','Closed site','No income site','Enabled site','Zulu site','Alpha site'],names()
 page.get_by_role('button',name='AdSense',exact=True).click()
 assert names()==['Alpha site','Zulu site','Enabled site','No income site','Unknown site','Closed site'],names()
 page.reload();page.wait_for_load_state('networkidle')
 assert names()==['Alpha site','Zulu site','Enabled site','No income site','Unknown site','Closed site'],names()
 state['accounts_fail']=True;page.get_by_role('button',name='刷新',exact=True).click()
 expect(page.locator('.page-error')).to_contain_text('服务账号读取失败，请重试')
 expect(select).to_be_disabled()
 state['accounts_fail']=False;page.get_by_role('button',name='重试',exact=True).click();expect(select).to_be_enabled()
 page.screenshot(path='/tmp/domain-manager-account-select.png',full_page=True)
 browser.close()
print('Account selection, keyboard edit, failure recovery, single/bulk clipboard and AdSense ordering passed')
