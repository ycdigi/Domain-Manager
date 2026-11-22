"""Bulk settings against isolated local Pages and D1, using real API writes."""
import base64,json,os,time,urllib.request,urllib.error
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('PORTFOLIO_TEST_URL','http://127.0.0.1:8796')
assert BASE.startswith('http://127.0.0.1:'), 'Local database only'
session=''
def call(path,body=None,method='GET',status=200):
 headers={'Content-Type':'application/json'}
 if session:headers['Authorization']='Bearer '+session
 req=urllib.request.Request(BASE+path,method=method,headers=headers,data=None if body is None else json.dumps(body).encode())
 try:response=urllib.request.urlopen(req)
 except urllib.error.HTTPError as error:response=error
 result=json.loads(response.read());assert response.status==status,(path,response.status,result)
 return result.get('data')
session=call('/api/login',{'username':'preview','password':'preview-local-only'},'POST')['token']
stamp=str(time.time_ns());site_ids=[];provider_ids=[];gsc_id=None
try:
 for index in [1,2]:
  created=call('/api/websites',{'name':f'Bulk local {stamp} {index}','domain':{'domain':f'bulk-{stamp}-{index}.test','registrar':'Local','registrar_date':'2026-01-01','expiry_date':'2027-12-31','service_type':'网站'}},'POST',201)
  site_ids.append(created['website']['id'])
 for provider in ['cloudflare','github']:
  created=call('/api/resources/accounts',{'provider':provider,'name':f'Bulk {provider} {stamp}','login_email':provider+stamp+'@example.test'},'POST',201);provider_ids.append(created['id'])
 gsc=call('/api/gsc/accounts',{'name':'Bulk Google '+stamp,'email':stamp+'@example.test'},'POST',201);gsc_id=gsc['id']
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  token=base64.b64encode(json.dumps({'token':session}).encode()).decode();page.add_init_script(f"localStorage.setItem('auth_token',{json.dumps(token)})")
  page.goto(BASE+'/home?q=bulk-'+stamp);page.wait_for_load_state('networkidle');rows=page.locator('.site-table tbody tr');expect(rows).to_have_count(2)
  page.locator('.site-table thead .el-checkbox').click();page.get_by_role('button',name='批量设置',exact=True).click()
  dialog=page.get_by_role('dialog',name='批量设置网站',exact=True)
  def choose(name,label):
   dialog.locator('.el-select').filter(has=page.get_by_role('combobox',name=name,exact=True)).locator('.el-select__wrapper').click();page.get_by_role('option',name=label,exact=True).click()
  choose('批量关联服务账号',f'Cloudflare · Bulk cloudflare {stamp} · cloudflare{stamp}@example.test')
  page.get_by_role('option',name=f'GitHub · Bulk github {stamp} · github{stamp}@example.test',exact=True).click();page.keyboard.press('Escape')
  choose('批量设置电脑','Macbook Pro');choose('批量设置GSC账号',gsc['name']+' · '+gsc['email'])
  dialog.get_by_role('button',name='保存批量设置',exact=True).click();expect(dialog).not_to_be_visible()
  for row in rows.all():
   expect(row).to_contain_text('Macbook Pro')
   provider_cell=row.locator('td').nth(6)
   expect(provider_cell.locator('.provider-identity')).to_have_count(1)
   expect(provider_cell).to_contain_text('Bulk cloudflare '+stamp)
   expect(provider_cell.locator('img')).to_be_visible()
  saved=[site for site in call('/api/websites') if site['id'] in site_ids]
  assert len(saved)==2 and all(site['computer_name']=='Macbook Pro' and set(provider_ids).issubset(site['provider_account_ids']) for site in saved)
  managed=[site for site in call('/api/website-management') if site['id'] in site_ids]
  assert all(site['gsc_account']['id']==gsc_id for site in managed)
  # Preserve account relations and clear only the explicitly chosen computer and GSC fields.
  page.locator('.site-table thead .el-checkbox').click();page.get_by_role('button',name='批量设置',exact=True).click()
  choose('批量设置电脑','清空电脑');choose('批量设置GSC账号','解除 GSC 账号关联')
  dialog.get_by_role('button',name='保存批量设置',exact=True).click();expect(dialog).not_to_be_visible()
  saved=[site for site in call('/api/websites') if site['id'] in site_ids]
  assert all(site['computer_name'] is None and set(provider_ids).issubset(site['provider_account_ids']) for site in saved)
  assert all(site['gsc_account'] is None for site in call('/api/website-management') if site['id'] in site_ids)
  snapshot=call('/api/backups');assert sum(link['website_id'] in site_ids and link['account_id'] in provider_ids for link in snapshot['website_accounts'])==4
  assert not errors,errors;browser.close()
finally:
 for site_id in site_ids:call('/api/websites/'+str(site_id),method='DELETE')
 if gsc_id:call('/api/gsc/accounts/'+str(gsc_id),method='DELETE')
 for provider_id in provider_ids:call('/api/resources/accounts/'+str(provider_id),method='POST')
print('Website bulk settings local Pages + D1 passed')
