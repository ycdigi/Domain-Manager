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
  for width in [390,768,1024,1280,1600]:
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
   detail.get_by_role('button',name='编辑标题与分类',exact=True).click();editor=page.get_by_role('dialog',name='编辑提示词',exact=True)
   expect(editor.locator('[id$="-title"]')).to_be_focused()
   cancel=editor.get_by_role('button',name='取消',exact=True).bounding_box();save=editor.get_by_role('button',name='保存提示词',exact=True).bounding_box()
   assert save['x']-cancel['x']-cancel['width']>=7,(width,'drawer footer actions touch')
   editor.get_by_role('button',name='取消',exact=True).click();expect(editor).not_to_be_visible()
   detail.get_by_role('button',name='编辑正文',exact=True).click();expect(editor.locator('[id$="-content"]')).to_be_focused()
   editor.get_by_role('button',name='取消',exact=True).click();expect(editor).not_to_be_visible()
  assert not errors,errors
  browser.close()
 print('Prompt layout passed: five widths, title/category alignment, long text, focus, footer action gaps')
finally:
 for id in ids:call('/api/prompts/'+str(id),method='DELETE')
 for id in groups:call('/api/prompt-categories/'+str(id),method='DELETE')
