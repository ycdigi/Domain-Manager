"""Bulk website settings through the real UI with isolated API fixtures."""
import base64,json,re
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:5173'
sites=[dict(id=i,name='Bulk '+str(i),stage='验证',lifecycle='active',ownership='自营网站',platform='Astro',priority_order=i,computer_name='Old computer',gsc_connected='未知',adsense_connected='未知',next_action_status='待做',domains=[dict(id=i,website_id=i,domain=f'bulk-{i}.test',is_primary=1)]) for i in [1,2]]
accounts=[dict(id=1,provider='cloudflare',name='Cloudflare main',login_email='cloud@example.test',status='正常'),dict(id=2,provider='github',name='GitHub main',login_email='git@example.test',status='正常'),dict(id=3,provider='github',name='Disabled account',status='停用')]
state=dict(fail=True,requests=[],option_fail=False)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 page=browser.new_page(viewport=dict(width=1440,height=1000));errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 token=base64.b64encode(json.dumps(dict(token='fixture')).encode()).decode();page.add_init_script(f"localStorage.setItem('auth_token',{json.dumps(token)})")
 def handle(route):
  path=route.request.url.split('?')[0].split('/api/')[-1];data=[];status=200;message='成功'
  if path=='websites':data=sites
  elif path=='resources/accounts':data=accounts
  elif path=='resources':
   data=[dict(id=10,provider='vps',account_id=None,name='Shared host',ip_address='203.0.113.10',status='正常'),dict(id=11,provider='github',account_id=2,name='Shared repo',resource_url='https://github.com/org/repo',status='正常'),dict(id=12,provider='github',account_id=3,name='Disabled repo',status='正常')]
   if state['option_fail']:status=503;message='模拟资源读取失败'
  elif path=='batches':data=[dict(id=7,name='第一批',status='进行中'),dict(id=8,name='归档批次',status='已归档')]
  elif path=='adsense/accounts':data=[dict(id=20,name='Adsense main',status='正常')]
  elif path=='gsc/accounts':data=[dict(id=1,name='Google main',email='google@example.test')]
  elif path=='websites/batch':
   body=route.request.post_data_json;state['requests'].append(body)
   if state['fail']:status=503;message='模拟批量保存失败'
   else:
    for site in sites:
     if site['id'] in body['website_ids']:site.update(body.get('fields',{}))
    data=dict(accepted=len(body['website_ids']),website_ids=body['website_ids'])
  elif path=='monitor':data=dict(monitors=[],incidents=[],unread_count=0,runner=None)
  elif path=='work-queue':data=dict(counts=dict(monitor=0,next_action=0,task=0,batch=0,total=0),items=[])
  elif path.endswith('/favicon'):route.fulfill(status=404,body='');return
  route.fulfill(status=status,json=dict(status=status,message=message,data=data))
 page.route(BASE+'/api/**',handle);page.goto(BASE+'/home');page.wait_for_load_state('networkidle')
 expect(page.locator('.site-table tbody tr')).to_have_count(2)
 page.locator('.site-table thead .el-checkbox').click()
 expect(page.get_by_role('button',name='批量设置',exact=True)).to_be_visible()
 page.get_by_role('button',name='批量设置',exact=True).click();dialog=page.get_by_role('dialog',name='批量设置网站',exact=True)
 expect(dialog).to_be_visible();expect(dialog).to_contain_text('2 个网站')
 save=dialog.get_by_role('button',name='保存批量设置',exact=True);expect(save).to_be_disabled()
 def choose(name,label):
  dialog.locator('.el-select').filter(has=page.get_by_role('combobox',name=name,exact=True)).locator('.el-select__wrapper').click()
  page.get_by_role('option',name=label,exact=True).click()
 choose('批量关联服务账号','Cloudflare · Cloudflare main · cloud@example.test')
 expect(page.get_by_role('option',name=re.compile('Disabled account'))).to_have_count(0)
 page.get_by_role('option',name='GitHub · GitHub main · git@example.test',exact=True).click();page.keyboard.press('Escape')
 # Closing a draft prompts before discarding the chosen account settings.
 dialog.get_by_role('button',name='取消',exact=True).click()
 confirm=page.get_by_role('dialog',name='离开编辑',exact=True)
 expect(confirm).to_be_visible();confirm.get_by_role('button',name='继续编辑',exact=True).click()
 expect(dialog).to_be_visible()
 choose('批量设置电脑','Mac Mini YC');choose('批量设置GSC账号','Google main · google@example.test')
 # Clearing a pending selection means leave unchanged, not clear the saved value.
 for name in ['批量设置电脑','批量设置GSC账号']:
  control=dialog.locator('.el-select').filter(has=page.get_by_role('combobox',name=name,exact=True))
  control.hover();control.locator('.el-select__clear').click()
 choose('批量设置电脑','Mac Mini YC');choose('批量设置GSC账号','Google main · google@example.test')
 save.click();expect(dialog.get_by_role('alert')).to_contain_text('模拟批量保存失败');expect(dialog).to_be_visible()
 expect(page.locator('.portfolio-bulk-toolbar')).to_contain_text('已选 2 个网站')
 expected=dict(website_ids=[1,2],fields=dict(computer_name='Mac Mini YC'),account_ids=[1,2],gsc_account_id=1)
 assert state['requests'][-1]==expected,state['requests'][-1]
 state['fail']=False;save.click();expect(dialog).not_to_be_visible()
 assert state['requests'][-1]==expected
 expect(page.locator('.portfolio-bulk-toolbar')).not_to_be_visible()
 for site in sites:assert site['computer_name']=='Mac Mini YC'
 page.locator('.site-table thead .el-checkbox').click();page.get_by_role('button',name='批量设置',exact=True).click()
 expect(save).to_be_disabled()
 choose('批量设置电脑','清空电脑');choose('批量设置GSC账号','解除 GSC 账号关联')
 page.screenshot(path='/tmp/domain-bulk-settings-desktop.png',full_page=True)
 expect(page.locator('.el-select__popper:visible')).to_have_count(0)
 page.set_viewport_size(dict(width=390,height=844));assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 page.screenshot(path='/tmp/domain-bulk-settings-mobile.png',full_page=True)
 save.click();expect(dialog).not_to_be_visible()
 assert state['requests'][-1]==dict(website_ids=[1,2],fields=dict(computer_name=None),gsc_account_id=None),state['requests'][-1]
 # Resource reads fail closed; retry restores controls without silently applying defaults.
 page.set_viewport_size(dict(width=1440,height=1000))
 state['option_fail']=True
 page.locator('.site-table thead .el-checkbox').click();page.get_by_role('button',name='批量设置',exact=True).click()
 expect(dialog.get_by_role('alert')).to_contain_text('模拟资源读取失败');expect(save).to_be_disabled()
 state['option_fail']=False;dialog.get_by_role('button',name='重试读取账号',exact=True).click()
 expect(dialog.get_by_role('alert')).not_to_be_visible();expect(save).to_be_disabled()
 choose('批量设置托管资源','Shared host · 203.0.113.10')
 choose('批量设置代码仓库资源','Shared repo · https://github.com/org/repo')
 expect(page.get_by_role('option',name=re.compile('Disabled repo'))).to_have_count(0)
 choose('批量加入已有批次','第一批');expect(page.get_by_role('option',name='归档批次',exact=True)).to_have_count(0);page.keyboard.press('Escape')
 choose('批量设置AdSense账号','Adsense main');choose('批量设置新站分类','新站')
 choose('批量设置阶段','维护');choose('批量设置技术栈','其他')
 dialog.get_by_role('textbox',name='批量自定义技术栈',exact=True).fill('SvelteKit')
 choose('批量设置GSC 开通状态','已开通')
 page.screenshot(path='/tmp/domain-bulk-settings-complete.png',full_page=True)
 save.click();expect(dialog).not_to_be_visible()
 assert state['requests'][-1]==dict(website_ids=[1,2],fields=dict(stage='维护',platform='其他',platform_other='SvelteKit',gsc_connected='已开通',adsense_account_id=20,new_site_override=1),resource_assignments=[dict(role='托管',resource_id=10),dict(role='代码仓库',resource_id=11)],batch_ids=[7]),state['requests'][-1]
 # Cancelled resource picks preserve existing data; explicit zero unlinks only that role.
 page.locator('.site-table thead .el-checkbox').click();page.get_by_role('button',name='批量设置',exact=True).click()
 choose('批量设置托管资源','Shared host · 203.0.113.10')
 control=dialog.locator('.el-select').filter(has=page.get_by_role('combobox',name='批量设置托管资源',exact=True))
 control.hover();control.locator('.el-select__clear').click();expect(save).to_be_disabled()
 choose('批量关联服务账号','GitHub · GitHub main · git@example.test');page.keyboard.press('Escape')
 dialog.locator('.el-radio').filter(has=page.get_by_role('radio',name='解除所选账号关联',exact=True)).click();expect(save).to_be_disabled()
 choose('批量关联服务账号','GitHub · Disabled account');page.keyboard.press('Escape')
 choose('批量设置托管资源','解除全部托管资源关联');save.click();expect(dialog).not_to_be_visible()
 assert state['requests'][-1]==dict(website_ids=[1,2],fields={},remove_account_ids=[3],resource_assignments=[dict(role='托管',resource_id=None)]),state['requests'][-1]
 assert not errors,errors
 browser.close()
print('Website bulk settings UI passed')
