"""Finance uses its own read model; native AdSense inputs keep zero and missing distinct."""
import base64,json
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':1440,'height':1000})
 token=base64.b64encode(json.dumps({'token':'fixture'}).encode()).decode();page.add_init_script(f"localStorage.setItem('auth_token',{json.dumps(token)})")
 state=dict(fail=False,read_fail=False,posts=[],snapshots=0)
 incomes=[dict(id=1,adsense_account_id=1,income_month='2026-10',amount_usd=0,amount_cny=None,memo='')]
 def handle(route):
  path=route.request.url.split('?')[0].split('/api/')[-1];status=200;data=[];message='成功'
  if path=='finance':data=dict(websites=[dict(id=1,name='Finance site')],website_income=[dict(website_id=1,income_month='2026-10',source='AdSense',currency='USD',amount=0,origin='adsense_account')],website_effort=[])
  elif path=='export/snapshot':state['snapshots']+=1
  elif path=='adsense/accounts':data=[dict(id=1,name='account',owner='owner',currency='USD',status='正常',income_usd_total=0,linked_websites=0)]
  elif path=='adsense/income':
   if route.request.method=='POST':
    state['posts'].append(route.request.post_data_json);status=500 if state['fail'] else 200;message='模拟保存失败' if state['fail'] else '成功'
    if not state['fail']:incomes[:]=[dict(id=1,**route.request.post_data_json)]
   else:status=503 if state['read_fail'] else 200;message='模拟读取失败' if state['read_fail'] else '成功';data=incomes
  elif path=='monitor':data=dict(monitors=[],incidents=[],unread_count=0,runner=None)
  elif path=='work-queue':data=dict(counts=dict(total=0),items=[])
  route.fulfill(status=status,json=dict(status=status,message=message,data=data))
 page.route('http://127.0.0.1:5173/api/**',handle)
 page.goto('http://127.0.0.1:5173/finance');page.wait_for_load_state('networkidle')
 expect(page.get_by_role('cell',name='AdSense · 账号收入',exact=True)).to_be_visible();assert state['snapshots']==0
 page.goto('http://127.0.0.1:5173/adsense?account=1&month=2026-10');page.wait_for_load_state('networkidle')
 usd=page.get_by_role('spinbutton',name='美元金额（USD）',exact=True);cny=page.get_by_role('spinbutton',name='人民币金额（CNY，可空）',exact=True)
 expect(usd).to_have_value('0');expect(cny).to_have_value('');expect(usd).to_be_enabled()
 state['fail']=True;usd.fill('12.75');cny.fill('0');page.get_by_role('button',name='保存 2026-10 收入',exact=True).click()
 expect(page.get_by_text('模拟保存失败',exact=True)).to_be_visible();expect(usd).to_have_value('12.75');expect(cny).to_have_value('0')
 state['fail']=False;page.get_by_role('button',name='保存 2026-10 收入',exact=True).click();expect(page.get_by_text('收入已保存',exact=True)).to_be_visible()
 assert state['posts'][-1]['amount_usd']==12.75 and state['posts'][-1]['amount_cny']==0
 state['read_fail']=True;page.get_by_role('button',name='刷新',exact=True).click();expect(page.locator('.page-error')).to_contain_text('模拟读取失败');expect(usd).to_be_disabled()
 state['read_fail']=False;page.get_by_role('button',name='重试',exact=True).click();expect(usd).to_be_enabled();expect(usd).to_have_value('12.75')
 browser.close()
print('Finance UI passed')
