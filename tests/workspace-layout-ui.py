"""Shared heading and toolbar layout across every workspace at desktop/tablet/mobile widths."""
import base64,json
from playwright.sync_api import sync_playwright,expect
routes={'home':'网站总表','domains':'域名资产','resources':'部署与账号','adsense':'AdSense','finance':'收入与投入','work':'待处理','batches':'网站批次','batches/1':'布局验收批次','monitor':'网站监控','data':'数据管理'}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 token=base64.b64encode(json.dumps({'token':'fixture'}).encode()).decode();page.add_init_script(f"localStorage.setItem('auth_token',{json.dumps(token)})")
 def handle(route):
  path=route.request.url.split('?')[0].split('/api/')[-1]
  data=[]
  if path=='monitor':data=dict(monitors=[],incidents=[],unread_count=0,runner=None)
  elif path=='work-queue':data=dict(counts=dict(monitor=0,next_action=0,task=0,batch=0,total=0),items=[])
  elif path=='finance':data=dict(websites=[],website_income=[],website_effort=[])
  elif path=='batches/1':data=dict(id=1,name='布局验收批次',status='进行中',members=[],reviews=[],member_count=0,content_totals={},stage_counts={},review_requested=0)
  route.fulfill(json=dict(status=200,message='成功',data=data))
 page.route('http://127.0.0.1:5173/api/**',handle)
 for width in [390,768,1024,1280,1600]:
  page.set_viewport_size(dict(width=width,height=1000))
  for route,title in routes.items():
   page.goto('http://127.0.0.1:5173/'+route);page.wait_for_load_state('networkidle')
   expect(page.get_by_role('heading',name=title,exact=True)).to_be_visible()
   heading=page.locator('.workspace-heading')
   assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'),(route,width,'page overflow')
   # Inspect actual child boxes too: root overflow clipping must not conceal controls.
   for control in heading.locator('button,input,[role="combobox"]').all():
    if control.is_visible():
     box=control.bounding_box();assert box['x']>=0 and box['x']+box['width']<=width+1,(route,width,box)
   if route=='monitor' and width==390:
    status=heading.locator('[aria-label="监控状态"]')
    refresh=heading.get_by_role('button',name='刷新',exact=True)
    assert abs(status.bounding_box()['y']-refresh.bounding_box()['y'])<12,'monitor status and refresh must share a row'
   if route=='home':
    assert heading.bounding_box()['height']<=(66 if width>=768 else 140),(route,width,heading.bounding_box())
    page.get_by_role('textbox',name='搜索网站或域名',exact=True).fill('no result')
    expect(page.get_by_role('button',name='清除全部条件',exact=True)).to_be_visible()
    page.get_by_role('button',name='清除全部条件',exact=True).click()
   if width==390:
    page.screenshot(path='/tmp/domain-layout-'+route.replace('/','-')+'-mobile.png',full_page=True)
 assert not errors,errors
 browser.close()
print('All 10 workspace routes passed at 5 viewport widths')
