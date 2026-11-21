#!/usr/bin/env node
import fs from 'node:fs/promises'
import { detectStack } from './lib/stack-detection.mjs'
const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Usage: node scripts/audit-website-stacks.mjs input.json report.json')
const sites = JSON.parse(await fs.readFile(input, 'utf8'))
const readPage = async url => {
 const response = await fetch(url, {signal:AbortSignal.timeout(12000), headers:{'User-Agent':'Mozilla/5.0 (compatible; DomainManagerStackAudit/1.0)'},redirect:'follow'})
 const reader = response.body.getReader(); const chunks=[]; let size=0
 try { while(size<1024*1024) { const {done,value}=await reader.read();if(done)break;chunks.push(value.subarray(0,1024*1024-size));size+=value.length } } finally { await reader.cancel() }
 return {html:Buffer.concat(chunks).toString('utf8'),url:response.url,status:response.status}
}
const scan = async site => {
 const attempts=[]
 for(const prefix of ['https://','http://']) {
  try {
   const page=await readPage(prefix+site.domain+'/');const final=new URL(page.url)
   if(final.hostname.replace(/^www\./,'')!==site.domain.replace(/^www\./,'')) {attempts.push({url:page.url,reason:'external_redirect',status:page.status});continue}
   const result=detectStack(page.html,{status:page.status});attempts.push({url:page.url,status:page.status,...result})
   if(result.platform)return {...site,...result,attempts}
   if(['error_challenge_or_parking','parking_page'].includes(result.reason))continue
   // A static homepage may omit framework assets; sample one same-host content page.
   const urls=[...page.html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)].flatMap(m=>{try {const u=new URL(m[1],page.url);return u.hostname===final.hostname && u.pathname!=='/' && !/\.(pdf|png|jpg|zip)$/i.test(u.pathname)?[u.href]:[]}catch{return []}})
   if(urls[0]) { const child=await readPage(urls[0]);if(new URL(child.url).hostname===final.hostname){const found=detectStack(child.html,{status:child.status});attempts.push({url:child.url,status:child.status,...found});if(found.platform)return {...site,...found,attempts}} }
   break
  } catch(error) {attempts.push({url:prefix+site.domain,error:String(error),cause:error.cause?.code})}
 }
 return {...site,platform_detected:null,evidence:[],reason:'unconfirmed',attempts}
}
const results=[];let cursor=0
await Promise.all(Array.from({length:10},async()=>{while(cursor<sites.length){const index=cursor++;const site=sites[index];const row=site.domain?await scan(site):{...site,reason:'no_primary_domain',attempts:[]};results[index]={...row,previous_platform:site.platform,platform_detected:row.reason==='confirmed_signature'?row.platform:null,platform:site.platform};process.stderr.write(`\rScanned ${results.filter(Boolean).length}/${sites.length}`)}}))
await fs.writeFile(output,JSON.stringify({checked_at:new Date().toISOString(),results},null,2))
console.log('\n'+JSON.stringify(results.reduce((s,r)=>(s[r.platform_detected||'unconfirmed']=(s[r.platform_detected||'unconfirmed']||0)+1,s),{})))
