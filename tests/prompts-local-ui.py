"""Prompt library acceptance on isolated local Pages + D1, with real writes and clipboard."""
import base64, json, os, time, urllib.request, urllib.error, urllib.parse
from playwright.sync_api import sync_playwright, expect
BASE=os.environ.get('PROMPTS_TEST_URL','http://127.0.0.1:8797')
assert BASE.startswith('http://127.0.0.1:'), 'Isolated local database only'
session=''
def call(path,body=None,method='GET',status=200):
 headers={'Content-Type':'application/json'}
 if session:headers['Authorization']='Bearer '+session
 req=urllib.request.Request(BASE+path,method=method,headers=headers,data=None if body is None else json.dumps(body).encode())
 try:res=urllib.request.urlopen(req)
 except urllib.error.HTTPError as err:res=err
 payload=json.loads(res.read());assert res.status==status,(path,res.status,payload)
 return payload['data']
session=call('/api/login',{'username':'preview','password':'preview-local-only'},'POST')['token']
stamp=str(time.time_ns());title='重复任务自动化 '+stamp
body=r'''
1\. 读取当前项目的说明、配置、测试和已有记录，自行定位流程与文件，不要求用户填写路径或清单。按每日执行频率列出重复动作：少于 3 次暂缓，20 次及以上优先，3–19 次标为待判定。验收：候选表注明频率依据；缺少证据时写[待补充:具体缺少的文件或频率记录]，不猜测。\
\
2\. 只选一个规则清楚、出错代价低的候选，输出「岗位｜输入｜动作｜输出｜人工复核」表，并把不超过 3 条可判对错的规则存成可检索清单。验收：输出可检查，每条规则可判通过或失败；表格不全不自动化，高风险动作只出建议或交人工复核。\
\
3\. 在当前项目实现「发现→预警→调整→复核」流程；调整仅限已明确允许的动作，其余只生成建议。用可用样本运行首轮，建立两周试跑记录。验收：每次运行可追溯到输入、命中规则、处理结果和复核状态。缺少试跑通过标准时写[待补充:两周试跑的通过标准]；未满两周或未达标，不拆第二个岗位。\
\
补充细节\
\- 首轮先做只读干跑：验证规则与输出，不触碰生产状态。\
\- 加入一个已知应拦截的样本：确认流程不只会通过正常输入，也能挡住错误。\
\- 记录净节省时间（原人工耗时减去新增复核和维护耗时）：避免把工作转移误算成收益。
<script>window.promptInjected=true</script>
  C:\tools\run
'''
raw='【提示词标题】运营.'+title+'\\\n'+body
ids=[];category_ids=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  context=browser.new_context(viewport={'width':1440,'height':1000},permissions=['clipboard-read','clipboard-write'])
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  encoded=base64.b64encode(json.dumps({'token':session}).encode()).decode();page.add_init_script(f"localStorage.setItem('auth_token',{json.dumps(encoded)})")
  def clipboard_matches(expected):
   page.wait_for_function('(expected)=>navigator.clipboard.readText().then(value=>value===expected)',arg=expected)
  page.goto(BASE+'/prompts');page.wait_for_load_state('networkidle')
  # Category creation is visible on arrival; no hidden manager needed.
  page.get_by_role('button',name='新增分类',exact=True).click()
  create_category=page.get_by_role('dialog',name='新增分类',exact=True)
  create_category.locator('input').fill('验收分类 '+stamp);create_category.get_by_role('button',name='新增分类',exact=True).click()
  expect(page.get_by_role('button',name='验收分类 '+stamp+' 0',exact=True)).to_be_visible()
  new_group=next(c for c in call('/api/prompt-categories')['items'] if c['name']=='验收分类 '+stamp);category_ids.append(new_group['id'])
  page.get_by_role('button',name='新增提示词',exact=True).click()
  editor=page.get_by_role('dialog',name='新增提示词',exact=True)
  expect(editor.locator('[id$="-paste"]')).to_be_focused()
  editor.locator('[id$="-paste"]').fill(raw);editor.get_by_role('button',name='识别',exact=True).click()
  expect(editor.locator('[id$="-title"]')).to_have_value(title);expect(editor.locator('[id$="-content"]')).to_have_value(body)
  expect(editor.locator('.prompt-identification')).to_contain_text('运营')
  expect(editor.locator('.prompt-identification')).to_contain_text(title)
  editor.get_by_role('button',name='保存提示词',exact=True).click();expect(editor).not_to_be_visible()
  detail=page.get_by_role('region',name='提示词详情')
  expect(detail.get_by_role('heading',name=title,exact=True)).to_be_visible()
  rows=call('/api/prompts?q='+urllib.parse.quote(stamp))['items'];assert len(rows)==1
  item=rows[0];ids.append(item['id']);category_ids.append(item['category_id'])
  assert call('/api/prompts/'+str(item['id']))['content']==body
  assert page.locator('.prompt-body').text_content()==body
  assert page.evaluate('window.promptInjected') is None
  detail.get_by_role('button',name='复制正文',exact=True).click();clipboard_matches(body)
  detail.get_by_role('button',name='复制完整格式',exact=True).click();clipboard_matches('【提示词标题】运营.'+title+'\n'+body)
  page.get_by_role('button',name='收藏：'+title,exact=True).click();expect(page.get_by_role('button',name='取消收藏：'+title,exact=True)).to_be_visible()
  page.get_by_role('button',name='收藏 1',exact=True).click();expect(page.locator('.prompt-card')).to_have_count(1)
  page.get_by_role('textbox',name='搜索提示词',exact=True).fill(stamp);page.get_by_role('button',name='搜索',exact=True).click()
  page.reload();expect(page.get_by_role('textbox',name='搜索提示词',exact=True)).to_have_value(stamp)
  page.get_by_role('button',name='查看提示词：'+title,exact=True).click();expect(detail.get_by_role('heading',name=title,exact=True)).to_be_visible()
  detail.get_by_role('button',name='编辑',exact=True).click();editor=page.get_by_role('dialog',name='编辑提示词',exact=True)
  editor.locator('[id$="-title"]').fill(title+' v2');editor.get_by_role('button',name='取消',exact=True).click()
  page.get_by_role('button',name='继续编辑',exact=True).click();expect(editor).to_be_visible()
  editor.get_by_role('button',name='保存提示词',exact=True).click();expect(editor).not_to_be_visible();expect(detail.get_by_role('heading',name=title+' v2',exact=True)).to_be_visible()
  # Same-name collection retains draft and offers the existing body, never overwriting.
  page.get_by_role('button',name='新增提示词',exact=True).click();editor=page.get_by_role('dialog',name='新增提示词',exact=True)
  editor.locator('[id$="-paste"]').fill(raw.replace(title,title+' v2'));editor.get_by_role('button',name='识别',exact=True).click();editor.get_by_role('button',name='保存提示词',exact=True).click()
  expect(editor.get_by_role('button',name='查看已有提示词',exact=True)).to_be_visible();editor.get_by_role('button',name='查看已有提示词',exact=True).click();expect(editor.locator('.prompt-conflict .prompt-editor-preview')).to_have_text(body)
  editor.get_by_role('button',name='取消',exact=True).click();page.get_by_role('button',name='放弃修改',exact=True).click();expect(editor).not_to_be_visible()
  # List copy works without opening a detail. Failure reports an error, never success.
  page.locator('.prompt-card').get_by_role('button',name='复制正文',exact=True).click();clipboard_matches(body)
  page.evaluate("Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:()=>Promise.reject(new Error('blocked'))});document.execCommand=()=>false")
  page.locator('.prompt-card').get_by_role('button',name='复制正文',exact=True).click();expect(page.get_by_text('复制失败，请在详情中手动选中正文复制',exact=True)).to_be_visible()
  # Dirty fields remain on API failure and route changes require explicit discard.
  detail.get_by_role('button',name='编辑',exact=True).click();editor=page.get_by_role('dialog',name='编辑提示词',exact=True);editor.locator('[id$="-title"]').fill(title+' final')
  page.route('**/api/prompts/'+str(item['id']),lambda r:r.fulfill(status=500,content_type='application/json',body=json.dumps({'status':500,'message':'模拟保存失败','data':None})))
  editor.get_by_role('button',name='保存提示词',exact=True).click();expect(editor.get_by_text('模拟保存失败',exact=True)).to_be_visible();expect(editor.locator('[id$="-title"]')).to_have_value(title+' final')
  page.unroute('**/api/prompts/'+str(item['id']));editor.get_by_role('button',name='保存提示词',exact=True).click();expect(editor).not_to_be_visible()
  # Browser back while editing must close the abandoned form, not retain a stale target.
  detail.get_by_role('button',name='编辑',exact=True).click();editor=page.get_by_role('dialog',name='编辑提示词',exact=True);editor.locator('[id$="-title"]').fill('discarded')
  page.go_back(wait_until='commit');page.get_by_role('button',name='放弃修改',exact=True).click();expect(editor).not_to_be_visible()
  page.go_forward(wait_until='commit');expect(detail.get_by_role('heading',name=title+' final',exact=True)).to_be_visible()
  page.screenshot(path='/tmp/domain-prompts-desktop.png',full_page=True)
  # Mobile drawer uses the same saved body and remains within the viewport.
  page.set_viewport_size({'width':390,'height':844});page.reload();mobile=page.get_by_role('dialog',name='提示词详情',exact=True)
  expect(mobile.get_by_role('heading',name=title+' final',exact=True)).to_be_visible()
  mobile.get_by_role('button',name='复制正文',exact=True).click();clipboard_matches(body)
  page.screenshot(path='/tmp/domain-prompts-mobile.png',full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  mobile.get_by_role('button',name='Close this dialog',exact=True).click();expect(mobile).not_to_be_visible()
  page.get_by_role('button',name='查看提示词：'+title+' final',exact=True).click();expect(mobile).to_be_visible()
  mobile.get_by_role('button',name='Close this dialog',exact=True).click();expect(mobile).not_to_be_visible()
  page.set_viewport_size({'width':1440,'height':1000})
  # Category CRUD uses the same real API; deleting keeps prompt bodies intact.
  page.get_by_role('button',name='管理',exact=True).click();manager=page.get_by_role('dialog',name='管理分类',exact=True)
  manager.get_by_role('textbox',name='新分类名称',exact=True).fill('临时 '+stamp);manager.get_by_role('button',name='新增分类',exact=True).click()
  temporary=manager.locator('li').filter(has_text='临时 '+stamp);expect(temporary).to_be_visible()
  temporary.get_by_role('button',name='删除',exact=True).click();page.get_by_role('button',name='确定',exact=True).click();expect(temporary).to_have_count(0)
  original=manager.locator('li').filter(has_text='运营（1）');original.get_by_role('button',name='改名',exact=True).click()
  rename=page.get_by_role('dialog',name='分类改名',exact=True);rename.locator('input').fill('工作 '+stamp);rename.get_by_role('button',name='保存',exact=True).click()
  renamed=manager.locator('li').filter(has_text='工作 '+stamp);expect(renamed).to_be_visible()
  renamed.get_by_role('button',name='删除',exact=True).click();page.get_by_role('button',name='确定',exact=True).click();expect(renamed).to_have_count(0);category_ids.remove(item['category_id'])
  manager.get_by_role('button',name='Close this dialog',exact=True).click()
  saved=call('/api/prompts/'+str(item['id']));assert saved['category_id'] is None and saved['content']==body
  # Real D1 backup restore preflight and repeated restore preserve favorite/body.
  snapshot=call('/api/backups');preview=call('/api/backups?dry_run=1',snapshot,'POST');assert preview['prompts_overwritten']==1
  call('/api/backups',snapshot,'POST');call('/api/backups',snapshot,'POST')
  assert call('/api/prompts/'+str(item['id']))['content']==body
  page.get_by_role('button',name='查看提示词：'+title+' final',exact=True).click();expect(page.locator('.prompt-detail .prompt-body')).to_be_visible()
  call('/api/prompts/'+str(item['id']),{'title':title+' final','category_name':'','content':body+'外部更新'},'PUT')
  page.get_by_role('button',name='刷新',exact=True).click();expect(page.locator('.prompt-detail .prompt-body')).to_have_text(body+'外部更新')
  # Deleting the only item on the last page returns to page one.
  for n in range(30):
   extra=call('/api/prompts',{'title':stamp+' page '+str(n),'content':'page test'},'POST',201);ids.append(extra['id'])
  page.goto(BASE+'/prompts?q='+stamp+'&page=2');page.wait_for_load_state('networkidle');expect(page.locator('.prompt-card')).to_have_count(1)
  page.locator('.prompt-open').click();page.get_by_role('region',name='提示词详情').get_by_role('button',name='删除',exact=True).click()
  page.get_by_role('button',name='确定',exact=True).click();expect(page.locator('.prompt-card')).to_have_count(30)
  assert 'page=2' not in page.url
  ids.remove(item['id'])
  assert not errors,errors
  context.close();browser.close()
 print('Prompt UI passed: real D1 save/edit/search/favorite, duplicate preview, exact clipboard, failures, desktop and mobile')
finally:
 for id in ids:call('/api/prompts/'+str(id),method='DELETE')
 for id in set(category_ids):
  if not any(r['category_id']==id for r in call('/api/prompts')['items']):call('/api/prompt-categories/'+str(id),method='DELETE')
