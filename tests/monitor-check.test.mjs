import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(() => server.close())
const check = async (overrides = {}, fetcher) => {
  const { checkWebsite } = await server.ssrLoadModule('/shared/site-monitor.ts')
  return checkWebsite({ domain: 'example.com', allowed_redirect_hosts: [], ...overrides }, fetcher)
}
test('GET returns the page title and stops before reading the rest of a large page', async () => {
  let reads=0;let canceled=false
  const chunks=['<html><head><title> Domain &amp; &#x505c;&#x653e; </ti','tle></head>', 'unused body'.repeat(100000)]
  const response={status:200,headers:new Headers({'Content-Type':'text/html'}),body:{getReader:()=>({read:async()=>({done:reads>=chunks.length,value:new TextEncoder().encode(chunks[reads++])}),cancel:async()=>{canceled=true}})}}
  const result=await check({required_text:['ignored'],baseline_title:'ignored'},async(url,options)=>{
    assert.equal(String(url),'https://example.com/');assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(new Headers(options.headers).has('Range'),false);return response
  })
  assert.equal(result.outcome,'healthy');assert.equal(result.http_status,200);assert.equal(result.title,'Domain & 停放')
  assert.equal(reads,2);assert.equal(canceled,true);assert.equal(result.content_complete,false)
})
for(const status of [403,404,429,500])test(`HTTP ${status} reports a response error and can expose its page title`,async()=>{
  const result=await check({},async()=>new Response('<title>Expired domain</title>',{status,headers:{'Content-Type':'text/html'}}))
  assert.equal(result.outcome,'failure');assert.equal(result.available,false);assert.equal(result.http_status,status);assert.equal(result.title,'Expired domain')
})
test('a blocked GET response is not retried or downgraded to HTTP',async()=>{
  const calls=[];const result=await check({},async(url,options)=>{calls.push([String(url),options.method]);return new Response(null,{status:403})})
  assert.equal(result.outcome,'failure');assert.deepEqual(calls,[['https://example.com/','GET']])
})
test('missing or oversized title content does not turn HTTP 200 into a failure',async()=>{
  for(const body of ['<head></head><body>normal</body>','<head>'+ 'x'.repeat(65536)+'<title>Too late</title>']){
    const result=await check({},async()=>new Response(body,{headers:{'Content-Type':'text/html'}}))
    assert.equal(result.title,null);assert.equal(result.outcome,'healthy');assert.equal(result.available,true)
  }
})
test('title-looking text in comments and scripts is ignored',async()=>{
 const result=await check({},async()=>new Response('<!-- <title>Fake</title> --><head><script>var t="<title>Fake</title>"</script><TiTlE> Real &copy; </TiTlE></head>',{headers:{'Content-Type':'text/html'}}))
 assert.equal(result.title,'Real ©')
})
test('large page titles are capped to a displayable 1000 characters',async()=>{
 const result=await check({},async()=>new Response('<title>'+ 't'.repeat(2000)+'</title>',{headers:{'Content-Type':'text/html'}}));assert.equal(result.title.length,1000)
})
test('binary content is not parsed as an HTML title',async()=>{
 let read=false
 const result=await check({},async()=>({status:200,headers:new Headers({'Content-Type':'image/png'}),body:{getReader(){read=true;throw new Error('skip binary')},cancel:async()=>{}}}))
 assert.equal(result.title,null);assert.equal(result.outcome,'healthy');assert.equal(read,false)
})
test('a broken body leaves the known HTTP result intact',async()=>{
 const result=await check({},async()=>({status:200,headers:new Headers({'Content-Type':'text/html'}),body:{getReader:()=>({read:async()=>{throw new Error('body broken')},cancel:async()=>{}})}}))
 assert.equal(result.title,null);assert.equal(result.outcome,'healthy');assert.equal(result.available,true)
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
test('the request has one ten-second deadline across redirects',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  let signal;const running=check({},async(_url,options)=>{signal=options.signal;return new Promise(()=>{})})
  while(!signal)await new Promise(resolve=>setImmediate(resolve))
  t.mock.timers.tick(10000)
  const result=await running;assert.equal(signal.aborted,true);assert.equal(result.reason,'timeout');assert.equal(result.outcome,'failure')
})

test('title extraction shares the deadline but a slow body does not overwrite a received 200',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 let reading=false
 const running=check({},async()=>({status:200,headers:new Headers({'Content-Type':'text/html'}),body:{getReader:()=>({read:()=>{reading=true;return new Promise(()=>{})},cancel:async()=>{}})}}))
 for(let attempt=0;!reading && attempt<100;attempt++)await new Promise(resolve=>setImmediate(resolve))
 assert.equal(reading,true)
 t.mock.timers.tick(10000)
 const result=await running;assert.equal(result.title,null);assert.equal(result.outcome,'healthy');assert.equal(result.http_status,200)
})

test('tag-looking text in quoted attributes is not treated as page markup',async()=>{
 for(const attribute of ['<title>Fake</title>','<body>','</head>']){
   const result=await check({},async()=>new Response(`<head><meta content="${attribute}"><title>Real title</title></head>`,{headers:{'Content-Type':'text/html'}}))
   assert.equal(result.title,'Real title')
 }
})
