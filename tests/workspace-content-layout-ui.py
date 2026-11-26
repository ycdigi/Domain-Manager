"""Shared long-content list and overlay footer contracts on actual workspace views."""
import base64,json
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:5173'
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 token=base64.b64encode(json.dumps({'token':'fixture'}).encode()).decode();page.add_init_script(f"localStorage.setItem('auth_token',{json.dumps(token)})")
 def handle(route):
  path=route.request.url.split('?')[0].split('/api/')[-1];data=[]
  if path=='monitor':data=dict(monitors=[],incidents=[],unread_count=0,runner=None)
  elif path=='work-queue':data=dict(counts=dict(monitor=0,next_action=1,task=0,batch=0,total=1),items=[dict(type='next_action',website_id=1,title='项目运营优化'*35,detail='https://example.test/'+'x'*300)])
  elif path=='adsense/accounts':data=[dict(id=1,name='账户',owner='owner',currency='USD',status='正常',linked_websites=1)]
  elif path=='websites':data=[dict(id=1,name='网站名称'*35,adsense_account_id=1,adsense_connected='已开通',domains=[dict(domain='very-long-domain-name.'*10+'test',is_primary=1)])]
  elif path=='batches':data=[dict(id=1,name='长期内容建设复盘'*25,status='进行中',member_count=3,source='内容项目',goal='持续验证用户需求')]
  route.fulfill(json=dict(status=200,message='成功',data=data))
 page.route(BASE+'/api/**',handle)
 for width in [390,768,1024,1600]:
  page.set_viewport_size(dict(width=width,height=1000))
  for route in ['work','batches']:
   page.goto(BASE+'/'+route);page.wait_for_load_state('networkidle')
   row=page.locator('.page-list li').first;text=row.locator(':scope > div').first.bounding_box();action=row.locator(':scope > .el-button').bounding_box()
   assert abs(text['y']-action['y'])<text['height'],(route,width,'action forced below long content',text,action)
   assert action['x']>=text['x']+text['width']-1,(route,width,'text overlaps action')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(route,width,'overflow')
  page.get_by_role('button',name='新建批次',exact=True).click();dialog=page.get_by_role('dialog',name='新建批次',exact=True)
  a=dialog.get_by_role('button',name='取消',exact=True).bounding_box();b=dialog.get_by_role('button',name='创建批次',exact=True).bounding_box()
  assert 7<=b['x']-a['x']-a['width']<=9,(width,'footer gap inconsistent',a,b)
  dialog.get_by_role('button',name='取消',exact=True).click()
  page.goto(BASE+'/adsense?account=1');page.wait_for_load_state('networkidle')
  related=page.locator('.page-list li').last
  assert related.locator(':scope > .page-muted').bounding_box()['width'] < width/2,(width,'unbounded metadata squeezes primary text')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,'AdSense related-site overflow')
 assert not errors,errors
 browser.close()
print('Shared content layout passed: work/batches long content and dialog footer at four widths')
