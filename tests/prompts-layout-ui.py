"""Real prompt layout, long-content and edit-entry regression against isolated D1."""
import base64,json,os,urllib.request,urllib.error
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('PROMPTS_TEST_URL','http://127.0.0.1:8797')
assert BASE.startswith('http://127.0.0.1:'),'Local data only'
token=''
def call(path,body=None,method='GET'):
 headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if token else {})}
 response=urllib.request.urlopen(urllib.request.Request(BASE+path,method=method,headers=headers,data=None if body is None else json.dumps(body).encode()))
 return json.load(response)['data']
token=call('/api/login',{'username':'preview','password':'preview-local-only'},'POST')['token']
ids=[];groups=[]
try:
 for category,title in [('布局验收','重复任务自动化'),('长分类'*16,'很长的标题'*35)]:
  row=call('/api/prompts',{'title':title,'category_name':category,'content':'检查输入、规则与输出。\n\n'+('https://example.test/very-long-path/'*20)},'POST');ids.append(row['id']);groups.append(row['category_id'])
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True);page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  encoded=base64.b64encode(json.dumps({'token':token}).encode()).decode();page.add_init_script(f"localStorage.setItem('auth_token',{json.dumps(encoded)})")
  for width in [390,768,900,901,1024,1280,1600,1920,2560]:
   page.set_viewport_size({'width':width,'height':1000});page.goto(BASE+'/prompts');page.wait_for_load_state('networkidle')
   for id in ids:
    row=page.locator('.prompt-card').filter(has=page.locator(f'[aria-label="查看提示词：'+('重复任务自动化' if id==ids[0] else '很长的标题'*35)+'"]'))
    title=row.locator('strong');category=row.locator('.prompt-card-category')
    a=title.bounding_box();b=category.bounding_box();parent=row.locator('.prompt-open').bounding_box()
    assert abs(a['y']-b['y'])<8,(width,'title/category must share a row',a,b)
    assert a['x']+a['width']<=b['x']+1,(width,'title must not overlap category')
    assert b['x']+b['width']<=parent['x']+parent['width'],(width,'category overflows')
    assert category.evaluate('(el)=>getComputedStyle(el).whiteSpace')=='nowrap'
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,'root overflow')
   page.get_by_role('button',name='查看提示词：重复任务自动化',exact=True).click()
   detail=page.get_by_role('dialog',name='提示词详情',exact=True) if width<=900 else page.get_by_role('region',name='提示词详情',exact=True)
   expect(detail.get_by_role('heading',name='重复任务自动化',exact=True)).to_be_visible()
   detail.evaluate('(el)=>Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished))')
   section=detail.get_by_role('region',name='提示词正文',exact=True);expect(section).to_be_visible()
   label=section.get_by_role('heading',name='提示词正文',exact=True);expect(label).to_be_visible()
   assert section.get_attribute('aria-labelledby')==label.get_attribute('id'),(width,'section/heading label association')
   panel=section.locator('.prompt-body-panel');body=panel.locator('.prompt-body');expect(body).to_have_text(call('/api/prompts/'+str(ids[0]))['content'])
   available=panel.evaluate('(el)=>el.clientWidth-parseFloat(getComputedStyle(el).paddingLeft)-parseFloat(getComputedStyle(el).paddingRight)')
   assert abs(body.bounding_box()['width']-available)<=1,(width,'body must fill the available panel width')
   assert label.evaluate('(el)=>parseFloat(getComputedStyle(el).borderBottomWidth)')>=2,(width,'tab heading needs a visible underline')
   header=detail.locator('.prompt-detail-header');actions=header.locator('.prompt-detail-actions');expect(actions.get_by_role('button',name='复制正文',exact=True)).to_be_visible()
   titleline=header.locator('.prompt-detail-title');edit=titleline.get_by_role('button',name='编辑',exact=True);expect(edit).to_be_visible()
   expect(detail.get_by_role('button',name='编辑',exact=True)).to_have_count(1);expect(detail.get_by_role('button',name='编辑正文',exact=True)).to_have_count(0)
   a=header.bounding_box();b=actions.bounding_box();assert abs(a['x']+a['width']-b['x']-b['width'])<=1,(width,'actions must align to the right header edge')
   if width>=1600:assert abs(b['y']-titleline.bounding_box()['y'])<8,(width,'wide header actions must align with title')
   titlebox=titleline.locator('h2').bounding_box();editbox=edit.bounding_box();assert titlebox['x']+titlebox['width']<=editbox['x']+1,(width,'edit must follow title')
   actions.get_by_role('button',name='删除',exact=True).focus();page.keyboard.press('Tab');expect(body).to_be_focused()
   edit.click();editor=page.get_by_role('dialog',name='编辑提示词',exact=True)
   expect(editor.locator('[id$="-title"]')).to_be_focused();expect(editor.locator('[id$="-content"]')).to_have_value(call('/api/prompts/'+str(ids[0]))['content'])
   cancel=editor.get_by_role('button',name='取消',exact=True).bounding_box();save=editor.get_by_role('button',name='保存提示词',exact=True).bounding_box()
   assert save['x']-cancel['x']-cancel['width']>=7,(width,'editor footer actions touch')
   editor.get_by_role('button',name='取消',exact=True).click();expect(editor).not_to_be_visible()
   if width in [390,1600,2560]:page.screenshot(path=f'/tmp/domain-prompt-detail-{width}.png',full_page=True)
   if width<=900:
    detail.get_by_role('button',name='Close this dialog',exact=True).click();expect(detail).not_to_be_visible()
   # Long titles/categories use the same detail component and must not hide actions.
   page.get_by_role('button',name='查看提示词：'+'很长的标题'*35,exact=True).click()
   expect(detail.get_by_role('heading',name='很长的标题'*35,exact=True)).to_be_visible();expect(detail.get_by_role('button',name='编辑',exact=True)).to_be_visible()
   detail.evaluate('(el)=>Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished))')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,'long detail overflow')
   for button in detail.locator('.prompt-detail-header button').all():
    box=button.bounding_box();assert box['x']>=0 and box['x']+box['width']<=width+1,(width,'detail action outside viewport',box)
   if width<=900:
    detail.get_by_role('button',name='Close this dialog',exact=True).click();expect(detail).not_to_be_visible()
  # The single editor updates both metadata and body through the real API.
  page.get_by_role('button',name='查看提示词：重复任务自动化',exact=True).click();detail.get_by_role('button',name='编辑',exact=True).click()
  editor=page.get_by_role('dialog',name='编辑提示词',exact=True);editor.locator('[id$="-title"]').fill('统一编辑验证');new_body='统一入口修改正文。\n\n保留换行与 \\ 反斜杠。'
  editor.locator('[id$="-content"]').fill(new_body);editor.get_by_role('button',name='保存提示词',exact=True).click();expect(editor).not_to_be_visible()
  expect(detail.get_by_role('heading',name='统一编辑验证',exact=True)).to_be_visible();expect(detail.locator('.prompt-body')).to_have_text(new_body)
  saved=call('/api/prompts/'+str(ids[0]));assert saved['title']=='统一编辑验证' and saved['category_name']=='布局验收' and saved['content']==new_body
  assert not errors,errors
  browser.close()
 print('Prompt layout passed: nine widths, header alignment, single edit, full-width tab panel, keyboard focus, long content and real metadata/body save')
finally:
 for id in ids:call('/api/prompts/'+str(id),method='DELETE')
 for id in groups:call('/api/prompt-categories/'+str(id),method='DELETE')
