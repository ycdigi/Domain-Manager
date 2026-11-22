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
stamp=str(time.time_ns());site_ids=[];provider_ids=[];gsc_id=None;resource_ids=[];batch_ids=[];adsense_id=None
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
   github_cell=row.locator('td').nth(7)
   expect(github_cell.locator('.provider-identity')).to_have_count(1)
   expect(github_cell).to_contain_text('Bulk github '+stamp)
   expect(github_cell.locator('img')).to_be_visible()
  saved=[site for site in call('/api/websites') if site['id'] in site_ids]
  assert len(saved)==2 and all(site['computer_name']=='Macbook Pro' and set(provider_ids).issubset(site['provider_account_ids']) for site in saved)
  managed=[site for site in call('/api/website-management') if site['id'] in site_ids]
  assert all(site['gsc_account']['id']==gsc_id for site in managed)
  # Navigation consumes fresh association and account counts after the bulk write.
  page.get_by_role('button',name='网站管理',exact=True).click()
  managed_row=page.locator('.management-table tbody tr').filter(has_text=f'bulk-{stamp}-1.test')
  expect(managed_row).to_contain_text(gsc['name'])
  page.get_by_role('button',name='网站总表',exact=True).click();expect(rows).to_have_count(2)
  # Preserve account relations and clear only the explicitly chosen computer and GSC fields.
  page.locator('.site-table thead .el-checkbox').click();page.get_by_role('button',name='批量设置',exact=True).click()
  choose('批量设置电脑','清空电脑');choose('批量设置GSC账号','解除 GSC 账号关联')
  dialog.get_by_role('button',name='保存批量设置',exact=True).click();expect(dialog).not_to_be_visible()
  saved=[site for site in call('/api/websites') if site['id'] in site_ids]
  assert all(site['computer_name'] is None and set(provider_ids).issubset(site['provider_account_ids']) for site in saved)
  assert all(site['gsc_account'] is None for site in call('/api/website-management') if site['id'] in site_ids)
  snapshot=call('/api/backups');assert sum(link['website_id'] in site_ids and link['account_id'] in provider_ids for link in snapshot['website_accounts'])==4
  host=call('/api/resources',{'provider':'vps','name':'Shared local host '+stamp,'ip_address':'203.0.113.22'},'POST',201);resource_ids.append(host['id'])
  repo=call('/api/resources',{'provider':'github','account_id':provider_ids[1],'name':'Shared local repo '+stamp,'resource_url':'https://github.com/example/local-'+stamp},'POST',201);resource_ids.append(repo['id'])
  batch=call('/api/batches',{'name':'Local batch '+stamp},'POST',201);batch_ids.append(batch['id'])
  adsense=call('/api/adsense/accounts',{'name':'Local Adsense '+stamp,'owner':'local@example.test','currency':'USD'},'POST',201);adsense_id=adsense['id']
  page.locator('.site-table thead .el-checkbox').click();page.get_by_role('button',name='批量设置',exact=True).click()
  choose('批量设置托管资源',host['name']+' · 203.0.113.22')
  choose('批量设置代码仓库资源',f'Bulk github {stamp} · '+repo['name']+' · '+repo['resource_url'])
  choose('批量加入已有批次',batch['name']);page.keyboard.press('Escape')
  choose('批量设置AdSense账号',adsense['name']);choose('批量设置阶段','增长');choose('批量设置新站分类','普通站')
  dialog.get_by_role('button',name='保存批量设置',exact=True).click();expect(dialog).not_to_be_visible()
  saved=[site for site in call('/api/websites') if site['id'] in site_ids]
  assert all(site['hosting']['id']==host['id'] and site['hosting']['account_id'] is None and site['hosting']['ip_address']=='203.0.113.22' and site['repository']['id']==repo['id'] and site['stage']=='增长' and site['adsense_account_id']==adsense_id and batch['id'] in site['batch_ids'] for site in saved)
  # Real D1 history remains intact across both entry points and ordinary backup restore.
  for round in range(2):
   call('/api/batches/'+str(batch['id'])+'/members',{'website_ids':site_ids,'reason':'Local round '+str(round)},'DELETE')
   call('/api/batches/assign',{'batch_id':batch['id'],'website_ids':site_ids,'member_note':'Join '+str(round)},'POST')
  detail=call('/api/batches/'+str(batch['id']));assert len(detail['members'])==6
  call('/api/batches/'+str(batch['id'])+'/members',{'website_ids':site_ids,'note':'Updated locally'},'POST')
  assert all(member['member_note']=='Updated locally' for member in call('/api/batches/'+str(batch['id']))['members'] if member['membership_status']=='active')
  snapshot=call('/api/backups');call('/api/backups',snapshot,'POST')
  assert len(call('/api/batches/'+str(batch['id']))['members'])==6
  page.reload();page.wait_for_load_state('networkidle')
  for row in page.locator('.site-table tbody tr').all():expect(row).to_contain_text('203.0.113.22')
  # New-batch assignment uses D1's actual transaction implementation.
  created=call('/api/batches/assign',{'batch':{'name':'Atomic local '+stamp},'website_ids':site_ids},'POST',201);batch_ids.append(created['batch_id'])
  assert created['accepted']==2 and len(created['batch']['members'])==2
  # The import UI passes the new name to the single restore transaction.
  page.get_by_role('button',name='数据管理',exact=True).click()
  import_panel=page.locator('.page-panel').filter(has=page.get_by_role('heading',name='导入网站组合备份',exact=True))
  import_panel.locator('input[type=file]').set_input_files({'name':'local-backup.json','mimeType':'application/json','buffer':json.dumps(snapshot).encode()})
  import_panel.get_by_role('button',name='选择批次',exact=True).click()
  picker=page.get_by_role('dialog',name='选择导入批次',exact=True)
  picker.get_by_text('创建并加入新批次',exact=True).click()
  import_name='UI import '+stamp
  picker.get_by_role('textbox',name='批次名称',exact=True).fill(import_name)
  expect(picker.get_by_text('统一设置阶段',exact=True)).to_have_count(0)
  picker.get_by_role('button',name='创建导入批次',exact=True).click()
  import_panel.get_by_role('button',name='预览文件',exact=True).click()
  expect(import_panel.get_by_text('仅预览，尚未写入数据',exact=True)).to_be_visible()
  assert not any(item['name']==import_name for item in call('/api/batches'))
  import_panel.get_by_role('button',name='确认导入',exact=True).click()
  confirm=page.get_by_role('dialog',name='导入预览',exact=True)
  confirm.get_by_role('button',name='确认导入',exact=True).click()
  expect(import_panel.get_by_text('导入已完成',exact=True)).to_be_visible()
  imported=next(item for item in call('/api/batches') if item['name']==import_name);batch_ids.append(imported['id'])
  assert set(member['website_id'] for member in call('/api/batches/'+str(imported['id']))['members'])==set(site['id'] for site in snapshot['websites'])
  assert not errors,errors;browser.close()
finally:
 for site_id in site_ids:call('/api/websites/'+str(site_id),method='DELETE')
 if gsc_id:call('/api/gsc/accounts/'+str(gsc_id),method='DELETE')
 for resource_id in resource_ids:call('/api/resources/resources/'+str(resource_id),method='POST')
 for batch_id in batch_ids:call('/api/batches/'+str(batch_id),{'status':'已归档'},'PATCH')
 if adsense_id:call('/api/adsense/accounts/'+str(adsense_id),method='POST')
 for provider_id in provider_ids:call('/api/resources/accounts/'+str(provider_id),method='POST')
print('Website bulk settings local Pages + D1 passed')
