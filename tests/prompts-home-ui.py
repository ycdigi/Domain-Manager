"""Home quick collection and shared editor regression on isolated local Pages + D1."""
import base64, json, time, urllib.request, urllib.error, urllib.parse
from playwright.sync_api import sync_playwright, expect
BASE='http://127.0.0.1:8797'
token=''
def call(path, body=None, method='GET'):
 headers={'Content-Type':'application/json','Authorization':'Bearer '+token}
 request=urllib.request.Request(BASE+path,headers=headers,method=method,data=None if body is None else json.dumps(body).encode())
 with urllib.request.urlopen(request) as response:return json.loads(response.read())['data']
token=call('/api/login',{'username':'preview','password':'preview-local-only'},'POST')['token']
stamp=str(time.time_ns());title='首页收集 '+stamp;category='快捷分类 '+stamp;ids=[];groups=[]
body='逐项检查，保留原文。\n\\- 示例\nC:\\tools\\run'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  encoded=base64.b64encode(json.dumps({'token':token}).encode()).decode();page.add_init_script(f"localStorage.setItem('auth_token',{json.dumps(encoded)})")
  page.goto(BASE+'/home?sort=identity&direction=desc&q=keep-filter');page.wait_for_load_state('networkidle');url=page.url
  heading=page.locator('.workspace-heading');refresh=heading.get_by_role('button',name='刷新',exact=True);add=heading.get_by_role('button',name='新增提示词',exact=True);website=heading.get_by_role('button',name='新增网站',exact=True)
  expect(add).to_be_visible();assert refresh.bounding_box()['x']<add.bounding_box()['x']<website.bounding_box()['x']
  page.screenshot(path='/tmp/domain-home-prompt-entry.png',full_page=True)
  add.click();editor=page.get_by_role('dialog',name='新增提示词',exact=True);expect(editor.locator('[id$="-paste"]')).to_be_focused()
  page.screenshot(path='/tmp/domain-home-prompt-dialog.png',full_page=True)
  # Cold Home load must include the editor's own styling and scrollable body.
  assert editor.locator('.prompt-paste').evaluate('(el)=>parseFloat(getComputedStyle(el).paddingLeft)')>=12
  editor.locator('[id$="-paste"]').fill('【提示词标题】运营.'+title+'\n'+body);editor.get_by_role('button',name='识别',exact=True).click()
  expect(editor.locator('[id$="-title"]')).to_have_value(title);expect(editor.locator('[id$="-content"]')).to_have_value(body)
  editor.get_by_role('button',name='新增分类',exact=True).click();dialog=page.get_by_role('dialog',name='新增分类',exact=True);dialog.locator('input').fill(category);dialog.get_by_role('button',name='新增分类',exact=True).click()
  expect(editor.locator('.el-select__selected-item').filter(has_text=category)).to_be_visible()
  groups.append(next(c['id'] for c in call('/api/prompt-categories')['items'] if c['name']==category))
  editor.get_by_role('button',name='保存提示词',exact=True).click();expect(editor).not_to_be_visible();expect(page.get_by_text('添加成功',exact=True)).to_be_visible();assert page.url==url
  expect(page.get_by_role('textbox',name='搜索网站或域名',exact=True)).to_have_value('keep-filter')
  row=call('/api/prompts?q='+urllib.parse.quote(stamp))['items'][0];ids.append(row['id']);assert call('/api/prompts/'+str(row['id']))['content']==body
  page.route('**/api/prompt-categories',lambda r:r.fulfill(status=500,json={'status':500,'message':'分类读取失败','data':None}))
  add.click();expect(editor.get_by_role('alert')).to_contain_text('分类读取失败');page.unroute('**/api/prompt-categories');editor.get_by_role('button',name='重试分类',exact=True).click();expect(editor.get_by_role('button',name='重试分类',exact=True)).not_to_be_visible()
  expect(editor.locator('[id$="-paste"]')).to_have_value('');expect(editor.locator('[id$="-title"]')).to_have_value('')
  editor.locator('[id$="-paste"]').fill(category+'.'+title+'\n'+body);editor.get_by_role('button',name='识别',exact=True).click();editor.get_by_role('button',name='保存提示词',exact=True).click();expect(editor.get_by_role('button',name='查看已有提示词',exact=True)).to_be_visible()
  editor.get_by_role('button',name='查看已有提示词',exact=True).click();expect(editor.locator('.prompt-conflict pre')).to_have_text(body);assert page.url==url
  editor.get_by_role('button',name='取消',exact=True).click();page.get_by_role('button',name='继续编辑',exact=True).click();expect(page.get_by_role('button',name='继续编辑',exact=True)).not_to_be_visible();expect(editor).to_be_visible()
  editor.locator('[id$="-title"]').fill(title+' retry')
  page.route('**/api/prompts',lambda r:r.fulfill(status=500,json={'status':500,'message':'模拟保存失败','data':None}) if r.request.method=='POST' else r.continue_())
  editor.get_by_role('button',name='保存提示词',exact=True).click();expect(editor.get_by_text('模拟保存失败',exact=True)).to_be_visible();expect(editor.locator('[id$="-title"]')).to_have_value(title+' retry');assert page.url==url
  page.unroute('**/api/prompts');editor.get_by_role('button',name='取消',exact=True).click();page.get_by_role('button',name='放弃修改',exact=True).click();expect(editor).not_to_be_visible();expect(add).to_be_focused()
  # The duplicate-edit path also stays on Home and uses the shared metadata focus.
  add.click();editor.locator('[id$="-paste"]').fill(category+'.'+title+'\n'+body);editor.get_by_role('button',name='识别',exact=True).click();editor.get_by_role('button',name='保存提示词',exact=True).click();editor.get_by_role('button',name='查看已有提示词',exact=True).click();editor.get_by_role('button',name='编辑已有条目',exact=True).click();page.get_by_role('button',name='放弃修改',exact=True).click()
  existing=page.get_by_role('dialog',name='编辑提示词',exact=True);expect(existing.locator('[id$="-title"]')).to_be_focused();existing.locator('[id$="-title"]').fill(title+' edited');existing.get_by_role('button',name='保存提示词',exact=True).click();expect(existing).not_to_be_visible();assert page.url==url;assert call('/api/prompts/'+str(row['id']))['title']==title+' edited'
  # Back/forward must protect drafts and not resurrect the Home dialog from KeepAlive.
  page.locator('.workspace-navigation summary').filter(has_text='运营管理').click();page.get_by_role('button',name='提示词库',exact=True).click();expect(page.get_by_role('heading',name='提示词库',exact=True)).to_be_visible();page.go_back();expect(page.get_by_role('heading',name='网站总表',exact=True)).to_be_visible();expect(editor).not_to_be_visible()
  add.click();editor.locator('[id$="-title"]').fill('待放弃草稿');page.go_forward(wait_until='commit');page.get_by_role('button',name='继续编辑',exact=True).click();expect(page.get_by_role('button',name='继续编辑',exact=True)).not_to_be_visible();assert page.url==url;expect(editor.locator('[id$="-title"]')).to_have_value('待放弃草稿')
  page.go_forward(wait_until='commit');page.get_by_role('button',name='放弃修改',exact=True).click();expect(page.get_by_role('heading',name='提示词库',exact=True)).to_be_visible();page.go_back();expect(editor).not_to_be_visible()
  page.set_viewport_size({'width':390,'height':844});add.click();expect(editor.locator('[id$="-paste"]')).to_be_focused();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');box=editor.bounding_box();assert box['x']>=0 and box['x']+box['width']<=391
  cancel=editor.get_by_role('button',name='取消',exact=True);expect(cancel).to_be_in_viewport();editor.locator('[id$="-title"]').fill('手机草稿');page.keyboard.press('Escape');page.get_by_role('button',name='继续编辑',exact=True).click();expect(page.get_by_role('button',name='继续编辑',exact=True)).not_to_be_visible();cancel.click();page.get_by_role('button',name='放弃修改',exact=True).click();expect(editor).not_to_be_visible()
  heading.get_by_role('button',name='新增网站',exact=True).click();site=page.get_by_role('dialog',name='新增网站',exact=True);expect(site).to_be_visible();site.get_by_role('button',name='Close this dialog',exact=True).click()
  page.screenshot(path='/tmp/domain-home-prompt-mobile.png',full_page=True)
  assert not errors,errors;browser.close()
 print('Home prompt passed: button order, shared cold-load modal, exact body, category, no navigation/filter loss, duplicate, failure, discard, focus, KeepAlive and mobile')
finally:
 for id in ids:call('/api/prompts/'+str(id),method='DELETE')
 for id in groups:call('/api/prompt-categories/'+str(id),method='DELETE')
