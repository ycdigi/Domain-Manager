"""Maintenance controls use fixture data and intercept every API write."""
import base64,json,os
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('MAINTENANCE_TEST_URL','http://127.0.0.1:5173')
assert BASE.startswith('http://127.0.0.1:')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);context=browser.new_context(viewport={'width':1440,'height':1000},permissions=['clipboard-read','clipboard-write']);page=context.new_page()
 page.add_init_script("localStorage.setItem('auth_token',"+json.dumps(base64.b64encode(json.dumps({'token':'fixture'}).encode()).decode())+")")
 sites=[dict(id=i,name=name,platform=platform,stage='待评估',lifecycle='active',ownership='未分类',priority_order=0,adsense_connected='未知',gsc_connected='未知',domains=[dict(id=i,domain=domain,is_primary=1)],provider_accounts=accounts,direct_account_ids=[a['id'] for a in accounts]) for i,name,platform,domain,accounts in [(1,'Code','Astro','code.test',[dict(id=1,provider='github',provider_name='GitHub',name='main')]),(2,'WP','WordPress','wp.test',[]),(3,'Custom WP','WordPress','custom.test',[]),(4,'Unconfigured','Astro','other.test',[])]]
 sites[2]['wp_login_url']='https://admin.test/custom-entry'
 accounts=[dict(id=1,provider='github',provider_name='GitHub',name='main',login_email='owner@example.test',status='正常',default_token_last4='test')]
 copied='地址：https://github.com/org/repo.git\nToken：fixture-only\nEmail：owner@example.test\n最后将整站所有的修正Github推送,包含但不限于当前对话;'
 writes=[];deny_copy=False
 def handle(route):
  req=route.request;path=req.url.split('/api/')[-1].split('?')[0]
  if path=='websites/1/copy' and deny_copy:
   route.fulfill(status=400,json=dict(status=400,message='请补充 GitHub 账号邮箱',data=None));return
  if req.method in ['POST','PUT','PATCH']:writes.append((path,req.post_data_json))
  data=sites if path=='websites' else accounts if path=='resources/accounts' else dict(migrated=0,conflicts=[]) if path=='resources/credentials/migrate' else dict(text=copied) if path=='websites/1/copy' else dict(counts=dict(total=0),items=[]) if path=='work-queue' else dict(monitors=[],incidents=[],unread_count=0,runner=None) if path=='monitor' else []
  if req.method=='PATCH' and path.startswith('websites/'):
   site=next(s for s in sites if s['id']==int(path.split('/')[1]));site.update(req.post_data_json);data=site
  route.fulfill(json=dict(status=200,message='成功',data=data))
 page.route(BASE+'/api/**',handle)
 page.goto(BASE+'/home');page.wait_for_load_state('networkidle')
 code=page.get_by_role('row').filter(has=page.get_by_role('button',name='Code',exact=True))
 button=code.get_by_role('button',name='复制 GitHub 推送资料：Code',exact=True);expect(button).to_be_enabled();button.click();expect(page.get_by_text('GitHub 推送资料已复制',exact=True)).to_be_visible()
 assert page.evaluate('navigator.clipboard.readText()')==copied
 deny_copy=True;button.click();expect(page.get_by_role('status').filter(has_text='请补充 GitHub 账号邮箱')).to_be_visible();expect(page.get_by_role('link',name='设置 GitHub 账号 Token 和邮箱',exact=True)).to_be_visible()
 deny_copy=False;page.goto(BASE+'/home');page.wait_for_load_state('networkidle')
 wp=page.get_by_role('row').filter(has=page.get_by_role('button',name='WP',exact=True));expect(wp.get_by_role('link',name='登录后台：WP',exact=True)).to_have_attribute('href','https://wp.test/safelogin')
 custom=page.get_by_role('row').filter(has=page.get_by_role('button',name='Custom WP',exact=True));expect(custom.get_by_role('link',name='登录后台：Custom WP',exact=True)).to_have_attribute('href','https://admin.test/custom-entry')
 page.get_by_role('button',name='配置维护入口：Unconfigured',exact=True).click()
 expect(page.get_by_role('textbox',name='GitHub 推送地址',exact=True)).to_be_visible()
 page.get_by_role('textbox',name='GitHub 推送地址',exact=True).fill('https://github.com/org/new.git')
 page.get_by_role('button',name='保存维护入口',exact=True).click();expect(page.get_by_text('维护入口已保存',exact=True)).to_be_visible()
 assert ('websites/4',{'github_push_url':'https://github.com/org/new.git'}) in writes
 page.goto(BASE+'/home?site=2&section=deployment');page.wait_for_load_state('networkidle')
 page.get_by_role('textbox',name='WordPress 后台登录地址',exact=True).fill('https://wp.test/another-login')
 page.get_by_role('button',name='保存维护入口',exact=True).click();expect(page.get_by_text('维护入口已保存',exact=True)).to_be_visible()
 page.screenshot(path='/tmp/domain-manager-maintenance-wp.png',full_page=True)
 assert ('websites/2',{'wp_login_url':'https://wp.test/another-login'}) in writes
 page.goto(BASE+'/resources?provider=github&account=1');page.wait_for_load_state('networkidle')
 page.get_by_role('button',name='编辑账号',exact=True).click()
 token=page.get_by_role('textbox',name='默认 GitHub Token',exact=True);expect(token).to_have_attribute('type','password');token.fill('fixture-new-token')
 page.screenshot(path='/tmp/domain-manager-maintenance-account-form.png',full_page=True)
 page.get_by_role('button',name='保存账号',exact=True).click();expect(page.get_by_text('账号已保存',exact=True)).to_be_visible()
 assert any(path=='resources/accounts/1' and body.get('token')=='fixture-new-token' for path,body in writes)
 page.screenshot(path='/tmp/domain-manager-maintenance-account.png',full_page=True)
 browser.close()
 print('PASS: GitHub clipboard, WordPress login links, saved destinations, account Token input')
