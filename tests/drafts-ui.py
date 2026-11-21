"""All detail drafts survive cancel/failure; sections load independently and reject late reads."""
import base64,json,re
from playwright.sync_api import sync_playwright,expect
site=lambda id,name:dict(id=id,name=name,stage='验证',lifecycle='active',ownership='自营网站',platform='Astro',industry='资讯站',computer_name=None,priority_order=id,adsense_connected='未知',gsc_connected='未知',next_action_status='待做',domains=[dict(id=id,website_id=id,domain=f'site{id}.test',is_primary=1,domain_role='主域名')])
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':1440,'height':1000})
 token=base64.b64encode(json.dumps({'token':'fixture'}).encode()).decode();page.add_init_script(f"localStorage.setItem('auth_token',{json.dumps(token)})")
 state=dict(fail_tasks=False,reads=[]);pending=[]
 def handle(route):
  path=route.request.url.split('?')[0].split('/api/')[-1];state['reads'].append(path);code=200;data=[];message='成功'
  if path=='websites/1/tasks' and state.get('delay_tasks') and route.request.method=='GET':pending.append(route);return
  if path=='websites':data=[site(1,'First'),site(2,'Second')]
  elif path=='monitor':data=dict(monitors=[],incidents=[],unread_count=0,runner=None)
  elif path=='work-queue':data=dict(counts=dict(total=0),items=[])
  elif path=='websites/1/tasks':
   if state['fail_tasks'] or route.request.method=='POST':code=503;message='任务读取或保存失败'
   else:data=[dict(id=1,website_id=1,title='Existing task',task_type='内容',status='待做',description='',review_delay_days=28,review_window_days=28)]
  elif path=='websites/1/ai-notes':data=[dict(id=1,kind='想法说明',content='Independent note')]
  elif path.endswith('/monitor'):data=dict(monitor=dict(enabled=True,effective_enabled=True,status='unchecked',allowed_redirect_hosts=[],title=None),history=[],incidents=[])
  elif path=='domains':data=[dict(id=1,domain='site1.test',is_primary=1,domain_role='主域名')]
  elif path=='resources':data=[dict(id=1,name='repo',provider='github',status='正常')]
  elif path=='resources/accounts':data=[dict(id=1,name='account',provider='github',status='正常')]
  elif path.endswith('/favicon'):route.fulfill(status=404,body='');return
  elif route.request.method in ['PATCH','POST','PUT']:code=503;message='模拟保存失败'
  route.fulfill(status=code,json=dict(status=code,message=message,data=data))
 page.route('http://127.0.0.1:5173/api/**',handle)
 page.goto('http://127.0.0.1:5173/home?site=1&section=basic');page.wait_for_load_state('networkidle')
 drawer=page.locator('.website-detail-drawer');expect(drawer).to_be_visible()
 assert 'websites/1/tasks' not in state['reads'] and 'websites/1/income' not in state['reads']
 def tab(name):drawer.get_by_role('tab',name=name,exact=True).click()
 def close():drawer.locator('.el-drawer__close-btn').click()
 def cancel():
  box=page.get_by_role('dialog',name='离开编辑');expect(box).to_be_visible();expect(page.locator('.el-message-box')).to_have_count(1);box.get_by_role('button',name='继续编辑',exact=True).click()
 def discard():
  page.get_by_role('dialog',name='离开编辑').get_by_role('button',name='放弃修改',exact=True).click();expect(drawer).not_to_be_visible()
 def reopen():page.get_by_role('button',name='First',exact=True).click();expect(drawer).to_be_visible()
 cases=[('域名',lambda:drawer.get_by_role('textbox',name='新增域名',exact=True),'draft.test'),('任务与记录',lambda:drawer.get_by_role('textbox',name='任务标题',exact=True),'Task draft'),('收入与投入',lambda:drawer.get_by_role('textbox',name='收入来源',exact=True),'Income draft'),('收入与投入',lambda:drawer.get_by_role('spinbutton',name='投入小时数',exact=True),'3.5'),('任务与记录',lambda:drawer.locator('.portfolio-operation-form input').first,'2026-11-21'),('监控',lambda:drawer.get_by_role('textbox',name='允许跳转的主机名',exact=True),'cdn.example.com')]
 for section,control,value in cases:
  tab(section);field=control();field.fill(value);field.press('Tab');close();cancel();expect(field).to_have_value(value);close();discard();reopen()
 # A failed task read leaves independently fetched notes and basic profile usable.
 state['fail_tasks']=True;tab('任务与记录');expect(drawer.locator('.page-error')).to_contain_text('任务读取或保存失败');expect(drawer.get_by_text('Independent note',exact=True)).to_be_visible()
 state['fail_tasks']=False;drawer.get_by_role('button',name='重试',exact=True).click();expect(drawer.get_by_text('Existing task',exact=True)).to_be_visible()
 title=drawer.get_by_role('textbox',name='任务标题',exact=True);title.fill('Failed save draft');drawer.get_by_role('button',name='添加任务',exact=True).click();expect(page.get_by_text('任务读取或保存失败',exact=True)).to_be_visible();expect(title).to_have_value('Failed save draft')
 # Saving basic data cannot mark the task draft clean, even when its own save fails.
 tab('基本资料');name=drawer.get_by_role('textbox',name='网站名称',exact=True);name.fill('Edited name');drawer.get_by_role('button',name='保存',exact=True).click();expect(page.get_by_text('模拟保存失败',exact=True)).to_be_visible();expect(name).to_have_value('Edited name')
 # Leaving to another website via URL is guarded once and cancellation retains the first website.
 page.get_by_role('button',name='Second',exact=True).evaluate('button => button.click()')
 cancel();expect(drawer.get_by_role('textbox',name='网站名称',exact=True)).to_have_value('Edited name')
 close();discard();reopen();tab('任务与记录')
 drawer.get_by_role('button',name='编辑任务 Existing task',exact=True).click();task=page.get_by_role('dialog',name='编辑网站任务',exact=True);task.get_by_role('textbox',name='标题',exact=True).fill('Edit draft');task.get_by_role('button',name='取消',exact=True).click();cancel();expect(task.get_by_role('textbox',name='标题',exact=True)).to_have_value('Edit draft');task.get_by_role('button',name='取消',exact=True).click();page.get_by_role('dialog',name='离开编辑').get_by_role('button',name='放弃修改',exact=True).click()
 drawer.get_by_role('button',name='新增记录',exact=True).click();note=page.get_by_role('dialog',name='新增记录',exact=True);note.get_by_role('textbox',name='内容',exact=True).fill('Note draft');note.get_by_role('button',name='取消',exact=True).click();cancel();expect(note.get_by_role('textbox',name='内容',exact=True)).to_have_value('Note draft');note.get_by_role('button',name='取消',exact=True).click();page.get_by_role('dialog',name='离开编辑').get_by_role('button',name='放弃修改',exact=True).click()
 expect(note).not_to_be_visible()
 page.screenshot(path='/tmp/domain-manager-detail-work.png',full_page=True)
 # Complete the first site's delayed response after switching to the second site.
 close();expect(drawer).not_to_be_visible();reopen();state['delay_tasks']=True;tab('任务与记录')
 expect(drawer.get_by_role('tab',name='任务与记录',exact=True)).to_have_attribute('aria-selected','true')
 assert len(pending)==1
 page.get_by_role('button',name='Second',exact=True).evaluate('button => button.click()')
 expect(drawer.get_by_role('textbox',name='网站名称',exact=True)).to_have_value('Second')
 pending.pop().fulfill(status=200,json=dict(status=200,data=[dict(id=99,website_id=1,title='Stale first task',task_type='内容',status='待做')]))
 tab('任务与记录');expect(drawer.get_by_text('Stale first task',exact=True)).to_have_count(0)
 expect(drawer.locator('.page-error')).to_have_count(0)
 browser.close()
print('Draft UI passed')
