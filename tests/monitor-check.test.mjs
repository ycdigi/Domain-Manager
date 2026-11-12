import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(() => server.close())
const check = async (overrides = {}, fetcher) => {
  const { checkWebsite } = await server.ssrLoadModule('/shared/site-monitor.ts')
  return checkWebsite({ domain: 'example.com', allowed_redirect_hosts: [], ...overrides }, fetcher)
}
test('HEAD 200 is normal without reading, decoding, or parsing a response body', async () => {
  let read = false;let canceled = false
  const response = {status:200,headers:new Headers({'Content-Type':'text/html','Content-Length':'10000000'}),body:{cancel:async()=>{canceled=true},getReader(){read=true;throw new Error('body must not be read')}},text(){read=true;throw new Error('body must not be read')}}
  const result = await check({required_text:['not present'],forbidden_text:['present'],baseline_title:'old title'},async(url,options)=>{
    assert.equal(String(url),'https://example.com/');assert.equal(options.method,'HEAD');assert.equal(options.redirect,'manual');return response
  })
  assert.equal(result.outcome,'healthy');assert.equal(result.http_status,200);assert.equal(result.available,true)
  assert.equal(result.title,null);assert.equal(result.content_complete,false);assert.equal(read,false);assert.equal(canceled,true)
})
for(const status of [403,404,429,500])test(`HTTP ${status} reports a response error`,async()=>{
  const result=await check({},async()=>new Response(null,{status}));assert.equal(result.outcome,'failure');assert.equal(result.available,false);assert.equal(result.http_status,status)
})
for(const status of [405,501])test(`HEAD ${status} retries GET headers and cancels the body`,async()=>{
  const methods=[];let canceled=false
  const result=await check({},async(_url,options)=>{
    methods.push(options.method)
    if(options.method==='HEAD')return new Response(null,{status})
    assert.equal(new Headers(options.headers).get('Range'),'bytes=0-0')
    return {status:200,headers:new Headers(),body:{cancel:async()=>{canceled=true}}}
  })
  assert.deepEqual(methods,['HEAD','GET']);assert.equal(result.outcome,'healthy');assert.equal(canceled,true)
})
test('a blocked HEAD response does not retry GET or downgrade to HTTP',async()=>{
  const calls=[];const result=await check({},async(url,options)=>{calls.push([String(url),options.method]);return new Response(null,{status:403})})
  assert.equal(result.outcome,'failure');assert.deepEqual(calls,[['https://example.com/','HEAD']])
})
test('follows at most three redirects and recognizes the main/www host pair',async()=>{
  const calls=[]
  const result=await check({},async(url)=>{calls.push(String(url));return calls.length<=3?new Response(null,{status:301,headers:{Location:calls.length===1?'https://www.example.com/one':`/hop${calls.length}`}}):new Response(null,{status:200})})
  assert.equal(calls.length,4);assert.equal(result.outcome,'healthy');assert.equal(result.final_url,'https://www.example.com/hop3')
  const limited=await check({},async url=>new Response(null,{status:302,headers:{Location:String(url)+'next'}}));assert.equal(limited.reason,'redirect_limit')
})
for(const [location,reason] of [['https://other.com/','cross_domain_redirect'],['http://example.com/','https_downgrade'],['https://127.0.0.1/','unsafe_redirect_host_or_url']])test(`rejects ${reason} before fetching the target`,async()=>{
  let calls=0;const result=await check({},async()=>{calls++;return new Response(null,{status:302,headers:{Location:location}})})
  assert.equal(result.outcome,'failure');assert.equal(result.reason,reason);assert.equal(calls,1)
})
test('an explicitly allowed redirect host may respond normally',async()=>{
  const result=await check({allowed_redirect_hosts:['other.com']},async url=>String(url).includes('other.com')?new Response(null,{status:204}):new Response(null,{status:302,headers:{Location:'https://other.com/'}}))
  assert.equal(result.outcome,'healthy');assert.equal(result.final_url,'https://other.com/')
})
test('redirect loops are detected',async()=>{
  const result=await check({},async()=>new Response(null,{status:302,headers:{Location:'https://example.com/'}}));assert.equal(result.reason,'redirect_loop')
})
test('private, local and credentialed URLs are rejected before a fetch',async()=>{
  for(const domain of ['127.0.0.1','localhost','10.0.0.1','https://user:pass@example.com','https://[::1]/','https://example.com:8443/']){
    let called=false;const result=await check({domain},async()=>{called=true;return new Response(null)})
    assert.equal(called,false);assert.equal(result.outcome,'failure')
  }
})
test('connection failures do not cause an HTTP fallback',async()=>{
  let calls=0;const result=await check({},async()=>{calls++;throw new Error('network')});assert.equal(result.reason,'network_error');assert.equal(calls,1)
})
test('the header request has one ten-second deadline across retries and redirects',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  let signal;const running=check({},async(_url,options)=>{signal=options.signal;return new Promise(()=>{})})
  while(!signal)await new Promise(resolve=>setImmediate(resolve))
  t.mock.timers.tick(10000)
  const result=await running;assert.equal(signal.aborted,true);assert.equal(result.reason,'timeout');assert.equal(result.outcome,'failure')
})
