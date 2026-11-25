import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundle = await build({ entryPoints: ['src/utils/website-markdown.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const { websitesMarkdown } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const site = { id: 1, name: 'Example', stage: '增长', lifecycle: 'active', ownership: '自营网站', platform: 'Astro', domains: [{domain:'example.test',is_primary:1}], batch_ids:[7], page_count:0, daily_clicks:0, adsense_connected:'未知', gsc_connected:'未开通', next_action_status:'待做' }
test('analysis export preserves provided order and zero values without inventing missing metrics', () => {
 const md=websitesMarkdown([site,{...site,name:'Second',domains:[],page_count:null,daily_clicks:null}], [{id:7,name:'Launch'}], '2026-11-23')
 assert.ok(md.indexOf('## 1. Example')<md.indexOf('## 2. Second'))
 assert.ok(md.includes('总页面 0；计算器 －；文章 －'))
 assert.ok(md.includes('- 日点击：0；更新日期：－'))
 assert.ok(md.includes('- 日点击：－；更新日期：－'))
 assert.ok(md.includes('- AdSense：－；GSC：未开通'))
 assert.ok(md.includes('- 批次：Launch'))
 assert.ok(!md.includes('undefined') && !md.includes('null') && !md.includes('未知'))
})
test('range-only clicks remain a range and unread batch names keep their identifiers', () => {
 const md=websitesMarkdown([{...site,daily_clicks:null,daily_clicks_range:'10to29',batch_ids:[99]}],[], '2026-11-23')
 assert.ok(md.includes('- 日点击：10–29（档位）；'))
 assert.ok(md.includes('批次 \\#99'))
})
test('deployment and account ownership remain distinct and credentials are never serialized', () => {
 const md=websitesMarkdown([{...site,provider_accounts:[{provider:'cloudflare',name:'Suscoding',token:'SECRET'}],hosting:null,repository:{name:'org/repo',resource_url:'https://github.com/org/repo'},password:'SECRET'}],[], '2026-11-23')
 assert.ok(md.includes('- 服务账号归属：Cloudflare · Suscoding'))
 assert.ok(md.includes('- 实际托管：－；服务器 IP：－'))
 assert.ok(md.includes('https://github.com/org/repo'))
 assert.ok(!md.includes('SECRET'))
})
test('income retains currency and period and excludes account totals; effort retains its week', () => {
 const md=websitesMarkdown([{...site,latest_income:{month:'2026-10',items:[{origin:'website',source:'销售',currency:'CNY',amount:0},{origin:'website',source:'AdSense',currency:'USD',amount:5},{origin:'adsense_account',source:'AdSense',currency:'USD',amount:9999}]},latest_effort:{week_start:'2026-11-16',hours:0}}],[], '2026-11-23')
 assert.ok(md.includes('2026-10：销售 CNY 0；AdSense USD 5'))
 assert.ok(!md.includes('9999'))
 assert.ok(md.includes('2026-11-16 起，0 小时'))
})
test('multiline names and Markdown characters cannot create additional headings or HTML', () => {
 const md=websitesMarkdown([{...site,name:'Name\n## injected <script> [x] *bold*',next_action:'one\ntwo'}],[], '2026-11-23')
 assert.equal(md.split('\n').filter(line=>line.startsWith('## ')).length,1)
 assert.ok(md.includes('\\[x\\]') && md.includes('\\*bold\\*') && !md.includes('<script>'))
 assert.ok(md.includes('- 下一步：one two'))
})
