"""Management counters, history, GSC ownership and responsive behavior (local fixtures only)."""
import base64,json,re
from playwright.sync_api import sync_playwright,expect
kinds=['TDK调整','计算器开发','文章开发','样式调整']
rows=[dict(id=1,name='Example',domain='example.test',lifecycle='active',batch_ids=[7,8],gsc_account=None,stats={k:dict(count=0,last_at=None) for k in kinds}),dict(id=2,name='Other',domain='other.test',lifecycle='stopped',batch_ids=[],gsc_account=None,stats={k:dict(count=0,last_at=None) for k in kinds})]
records=[];accounts=[];attempts=[];state=dict(fail=False,read_fail=False)
def stats():
 for row in rows:
  for k in kinds:
   times=[r['created_at'] for r in records if r['website_id']==row['id'] and r['kind']==k and not r.get('voided_at')]
   row['stats'][k]=dict(count=len(times),last_at=max(times) if times else None)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 page=browser.new_page(viewport=dict(width=1600,height=1000));errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 token=base64.b64encode(json.dumps({'token':'fixture'}).encode()).decode();page.add_init_script(f"localStorage.setItem('auth_token',{json.dumps(token)})")
 def handle(route):
  path=route.request.url.split('?')[0].split('/api/')[-1];method=route.request.method;data=[];code=200;message='成功'
  if path=='website-management':data=rows;code=503 if state['read_fail'] else 200;message='模拟读取失败'
  elif path=='batches':data=[dict(id=7,name='第一批',status='进行中'),dict(id=8,name='历史批次',status='已归档')]
  elif path=='gsc/accounts':
   if method=='POST':
    body=route.request.post_data_json;data=dict(id=len(accounts)+1,**body,created_at='2026-11-21T00:00:00.000Z',linked_websites=0);accounts.append(data)
   else:data=accounts
  elif re.fullmatch(r'gsc/accounts/\d+',path):
   account=next(a for a in accounts if a['id']==int(path.split('/')[-1]));account.update(route.request.post_data_json);data=account
   for row in rows:
    if row['gsc_account'] and row['gsc_account']['id']==account['id']:row['gsc_account']=account
  elif path.endswith('/gsc-account'):
   body=route.request.post_data_json;row=next(r for r in rows if r['id']==int(path.split('/')[1]));row['gsc_account']=next((a for a in accounts if a['id']==body['account_id']),None);data=row['gsc_account']
  elif re.fullmatch(r'websites/\d+/work-records',path):
   site_id=int(path.split('/')[1])
   if method=='POST':
    body=route.request.post_data_json;attempts.append(body)
    if state['fail']:code=503;message='模拟保存失败'
    else:
     data=next((r for r in records if r['request_id']==body['request_id']),None)
     if not data:data=dict(id=len(records)+1,website_id=site_id,**body,created_at=f'2026-11-21T07:32:{len(records):02d}.000Z',voided_at=None);records.append(data)
     stats();data=dict(record=data,stats=rows[site_id-1]['stats'])
   else:
    from urllib.parse import urlparse,parse_qs
    query=parse_qs(urlparse(route.request.url).query);data=[r for r in records if r['website_id']==site_id and not r['voided_at'] and (not query.get('kind') or r['kind']==query['kind'][0])][::-1]
  elif re.fullmatch(r'websites/\d+/work-records/\d+',path):
   record=next(r for r in records if r['id']==int(path.split('/')[-1]));record['voided_at']='2026-11-21T08:00:00.000Z';stats();data=dict(record=record,stats=rows[record['website_id']-1]['stats'])
  elif path=='monitor':data=dict(monitors=[],incidents=[],unread_count=0,runner=None)
  elif path=='work-queue':data=dict(counts=dict(monitor=0,next_action=0,task=0,batch=0,total=0),items=[])
  route.fulfill(status=code,json=dict(status=code,message=message,data=data))
 page.route('http://127.0.0.1:5173/api/**',handle)
 page.goto('http://127.0.0.1:5173/website-management');page.wait_for_load_state('networkidle')
 expect(page.get_by_role('heading',name='网站管理',exact=True)).to_be_visible()
 expect(page.locator('.management-table tbody tr')).to_have_count(2)
 # Filters start unrestricted, with Chinese prompts, and persist explicit choices.
 filters=page.locator('.management-filters')
 expect(filters).not_to_contain_text('Select')
 for prompt in ['全部网站','全部批次','全部 GSC 账号','默认顺序']+[k+' · 全部' for k in kinds]:
  expect(filters.get_by_text(prompt,exact=True)).to_be_visible()
 assert filters.locator('.el-select__selected-item.is-transparent').evaluate_all('items=>items.every(e=>e.scrollWidth<=e.clientWidth+1)')
 def choose_filter(name,label):
  filters.locator('.el-select').filter(has=page.get_by_role('combobox',name=name,exact=True)).locator('.el-select__wrapper').click()
  page.get_by_role('option',name=label,exact=True).click()
 choose_filter('网站批次筛选','第一批')
 expect(page.locator('.management-table tbody tr')).to_have_count(1);expect(page).to_have_url(re.compile('batch=7'))
 page.reload();page.wait_for_load_state('networkidle');expect(page.locator('.management-table tbody tr')).to_have_count(1)
 expect(filters.get_by_text('第一批',exact=True)).to_be_visible()
 choose_filter('网站状态筛选','停止经营')
 expect(page.locator('.management-table tbody tr')).to_have_count(0)
 page.get_by_role('button',name='清除全部条件',exact=True).click();expect(page.locator('.management-table tbody tr')).to_have_count(2)
 choose_filter('网站批次筛选','历史批次');expect(page.locator('.management-table tbody tr')).to_have_count(1)
 filters.locator('.el-select').nth(1).hover()
 filters.locator('.el-select').nth(1).locator('.el-select__clear').click()
 expect(page.locator('.management-table tbody tr')).to_have_count(2);expect(page).not_to_have_url(re.compile('batch='))
 for name in ['TDK调整筛选','GSC 账号筛选']:
  choose_filter(name,'TDK调整 · 否' if name.startswith('TDK') else '未关联')
 choose_filter('记录排序','最近登记优先')
 expect(page.locator('.management-table tbody tr')).to_have_count(2)
 gsc_filter=filters.locator('.el-select').filter(has=page.get_by_role('combobox',name='GSC 账号筛选',exact=True))
 gsc_filter.hover();gsc_filter.locator('.el-select__clear').click()
 expect(page).not_to_have_url(re.compile('gsc='));expect(filters.get_by_text('全部 GSC 账号',exact=True)).to_be_visible()
 page.get_by_role('button',name='清除全部条件',exact=True).click()
 # Wide screens keep the domain column compact and each row on a single line.
 page.set_viewport_size(dict(width=2560,height=1000))
 first=page.locator('.management-table tbody tr').first
 assert page.locator('.management-table-wrap').evaluate('e=>{const p=e.parentElement,s=getComputedStyle(p);return Math.abs(e.getBoundingClientRect().width-(p.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)))<2}')
 assert page.locator('.management-table').evaluate('e=>Math.abs(e.getBoundingClientRect().width-e.parentElement.clientWidth)<2')
 assert first.locator('th').bounding_box()['width']<=260
 expect(first).not_to_contain_text('否 · 尚无记录')
 expect(first.locator('th')).to_have_text('example.test')
 header_size=page.locator('.management-table thead th').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')
 button_size=first.locator('.work-capsule').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')
 assert header_size>button_size,(header_size,button_size)
 assert first.bounding_box()['height']<=56
 page.set_viewport_size(dict(width=1600,height=1000))
 assert page.locator('.management-table').evaluate('e=>Math.abs(e.getBoundingClientRect().width-e.parentElement.clientWidth)<2')
 row=page.locator('.management-table tbody tr').filter(has=page.get_by_text('example.test',exact=True))
 count=row.get_by_role('button',name='查看TDK调整记录：example.test',exact=True)
 expect(count).to_have_text('0');count.hover();expect(page.get_by_role('tooltip').filter(has_text='尚无记录')).to_be_visible()
 button=row.get_by_role('button',name='登记TDK调整：example.test',exact=True)
 button.click();expect(count).to_have_text('1');count.hover();expect(page.get_by_role('tooltip').filter(has_text='2026-11-21 15:32:00')).to_be_visible()
 button.click();expect(count).to_have_text('2')
 count.click();history=page.get_by_role('dialog',name='TDK调整记录',exact=True)
 expect(history.get_by_text('2026-11-21 15:32:01',exact=True)).to_be_visible()
 history.get_by_role('button',name='撤销记录',exact=True).first.click();expect(count).to_have_text('1')
 history.get_by_role('button',name='Close this dialog').click();expect(history).not_to_be_visible()
 # Failures keep counts and retry the same request identity.
 state['fail']=True;button.click();expect(page.get_by_text('模拟保存失败',exact=True)).to_be_visible();expect(count).to_have_text('1')
 state['fail']=False;button.click();expect(count).to_have_text('2');assert attempts[-1]['request_id']==attempts[-2]['request_id']
 page.get_by_role('button',name='刷新',exact=True).click();expect(page.get_by_role('button',name='刷新',exact=True)).not_to_have_class(re.compile('is-loading'))
 page.get_by_role('button',name='撤销本次',exact=True).click();expect(count).to_have_text('1')
 page.get_by_role('button',name='管理 GSC 账号',exact=True).click();dialog=page.get_by_role('dialog',name='管理 GSC 账号',exact=True)
 dialog.get_by_role('textbox',name='账号名称',exact=True).fill('Google main');dialog.get_by_role('textbox',name='账号邮箱',exact=True).fill('owner@example.test');dialog.get_by_role('button',name='保存账号',exact=True).click()
 expect(dialog.get_by_text('Google main',exact=True)).to_be_visible();dialog.get_by_role('button',name='关闭账号管理',exact=True).click()
 row.locator('.el-select__wrapper').click();page.get_by_role('option',name='Google main',exact=True).click();expect(row).to_contain_text('Google main')
 page.reload();page.wait_for_load_state('networkidle');expect(count).to_have_text('1');expect(row).to_contain_text('Google main')
 page.get_by_role('textbox',name='搜索网站或域名',exact=True).fill('other');expect(page.locator('.management-table tbody tr')).to_have_count(1);expect(page).to_have_url(re.compile('q=other'))
 page.get_by_role('button',name='清除全部条件',exact=True).click();expect(page.locator('.management-table tbody tr')).to_have_count(2)
 rows[1]['domain']='a-very-long-domain-name-that-must-stay-on-one-line.example.test'
 page.get_by_role('button',name='刷新',exact=True).click()
 long_link=page.get_by_role('link',name=rows[1]['domain'],exact=True)
 expect(long_link).to_be_visible()
 assert long_link.evaluate('e=>getComputedStyle(e).whiteSpace')=='nowrap'
 assert long_link.evaluate('e=>e.scrollWidth>e.clientWidth')
 long_link.hover();expect(page.get_by_role('tooltip').filter(has_text=rows[1]['domain'])).to_be_visible()
 page.get_by_role('heading',name='网站管理',exact=True).hover()
 expect(page.get_by_role('tooltip').filter(has_text=rows[1]['domain'])).not_to_be_visible()
 page.screenshot(path='/tmp/domain-management-desktop.png',full_page=True)
 for width in [1280,1024,768,390,320]:
  page.set_viewport_size(dict(width=width,height=900));assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
 page.screenshot(path='/tmp/domain-management-mobile.png',full_page=True)
 count.click();expect(history.get_by_text('2026-11-21 15:32:00',exact=True)).to_be_visible()
 assert not errors,errors
 browser.close()
print('Website management UI passed')
