import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
const server = await createServer({ configFile:false, optimizeDeps:{noDiscovery:true,include:[]}, server:{middlewareMode:true,hmr:false}, appType:'custom' })
after(() => server.close())
test('profile patches keep zero, clear a previous click mode and include the measurement date', async () => {
 const { websiteEditPatch } = await server.ssrLoadModule('/shared/website-edits.ts')
 assert.deepEqual(websiteEditPatch({daily_clicks:0,daily_clicks_range:null,clicks_updated_date:'2026-11-01'}, {daily_clicks:null,daily_clicks_range:'under10',clicks_updated_date:'2026-10-01'}), {daily_clicks:0,daily_clicks_range:null,clicks_updated_date:'2026-11-01'})
})
test('editing one content count does not overwrite unrelated counts or profile fields', async () => {
 const { websiteEditPatch } = await server.ssrLoadModule('/shared/website-edits.ts')
 assert.deepEqual(websiteEditPatch({article_count:0,content_stats_updated_date:'2026-11-01'}, {article_count:2,page_count:30,calculator_count:5,name:'Site',content_stats_updated_date:'2026-10-01'}), {article_count:0,content_stats_updated_date:'2026-11-01'})
})
test('switching to a known technology stack clears the old custom name', async () => {
 const { websiteEditPatch } = await server.ssrLoadModule('/shared/website-edits.ts')
 assert.deepEqual(websiteEditPatch({platform:'Astro'}, {platform:'其他',platform_other:'Custom'}), {platform:'Astro',platform_other:null})
})
test('clearing a populated numeric draft writes null rather than silently omitting the edit', async () => {
 const { websiteEditPatch } = await server.ssrLoadModule('/shared/website-edits.ts')
 assert.deepEqual(websiteEditPatch({article_count:undefined,content_stats_updated_date:'2026-11-01'}, {article_count:9,content_stats_updated_date:'2026-11-01'}), {article_count:null,content_stats_updated_date:'2026-11-01'})
})
test('an explicit content measurement includes its value even when zero is unchanged', async () => {
 const {websiteMetricEdit} = await server.ssrLoadModule('/shared/website-edits.ts')
 assert.equal(typeof websiteMetricEdit,'function')
 assert.deepEqual(websiteMetricEdit('calculator_count',0,'2026-11-20'),{calculator_count:0,content_stats_updated_date:'2026-11-20'})
})
test('clearing content counts preserves an explicitly cleared statistics date', async () => {
 const {websiteEditPatch} = await server.ssrLoadModule('/shared/website-edits.ts')
 assert.deepEqual(websiteEditPatch({page_count:null,content_stats_updated_date:null},{page_count:10,content_stats_updated_date:'2026-10-01'}),{page_count:null,content_stats_updated_date:null})
})
test('live count edits cannot reuse an explicitly cleared measurement date',async()=>{
 const {validateWebsiteFields}=await server.ssrLoadModule('/functions/domain/website-validation.ts')
 assert.match(validateWebsiteFields({page_count:20,content_stats_updated_date:null},{page_count:10,content_stats_updated_date:'2026-10-01'}),/统计日期/)
 assert.equal(validateWebsiteFields({page_count:20,content_stats_updated_date:null},{},{snapshot:true}),null)
})
