"""Deployment accounts have one resource table and provider-specific fields."""
import base64,json
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':1440,'height':1000})
 token=base64.b64encode(json.dumps({'token':'fixture'}).encode()).decode();page.add_init_script(f"localStorage.setItem('auth_token',{json.dumps(token)})")
 accounts=[dict(id=1,provider='github',provider_name='GitHub',name='main',login_email='owner@example.test',status='正常',resource_count=1,linked_website_count=1)]
 resources=[dict(id=1,provider='github',account_id=1,account_name='main',name='org/repo',resource_url='https://github.com/org/repo',status='正常',linked_website_count=1)]
 def handle(route):
  path=route.request.url.split('?')[0].split('/api/')[-1]
  data=accounts if path=='resources/accounts' else resources if path=='resources' else dict(counts=dict(total=0),items=[]) if path=='work-queue' else dict(monitors=[],incidents=[],unread_count=0,runner=None) if path=='monitor' else []
  route.fulfill(json=dict(status=200,message='成功',data=data))
 page.route('http://127.0.0.1:5173/api/**',handle)
 page.goto('http://127.0.0.1:5173/resources?provider=github&account=1');page.wait_for_load_state('networkidle')
 expect(page.get_by_role('heading',name='GitHub 资源',exact=True)).to_have_count(1)
 expect(page.get_by_role('heading',name='GitHub 账号',exact=True)).to_have_count(1)
 expect(page.get_by_text('账号关系仅表示归属，不表示已配置托管或仓库。具体资源在资源表中管理。')).to_be_visible()
 page.get_by_role('button',name='新增资源',exact=True).last.click()
 editor=page.locator('.resource-editor');expect(editor.get_by_text('仓库地址',exact=True)).to_be_visible()
 expect(editor.get_by_text('IP 地址',exact=True)).to_have_count(0);expect(editor.get_by_text('端口',exact=True)).to_have_count(0)
 page.goto('http://127.0.0.1:5173/resources?provider=vps');page.wait_for_load_state('networkidle')
 page.get_by_role('button',name='新增 VPS',exact=True).click()
 expect(editor.get_by_text('IP 地址',exact=True)).to_be_visible();expect(editor.get_by_text('端口',exact=True)).to_be_visible()
 page.screenshot(path='/tmp/domain-manager-resources.png',full_page=True)
 browser.close()
print('Resources UI passed')
