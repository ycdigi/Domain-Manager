import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { database } from './helpers/database.mjs'
const server = await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'})
const store = database()
let session
beforeEach(async () => {
 store.init()
 session = await (await server.ssrLoadModule('/functions/utils/auth.ts')).issueSessionToken('test','secret')
 store.sql("INSERT INTO websites(id,name) VALUES(1,'Site'); INSERT INTO provider_accounts(id,provider,name,status) VALUES(1,'cloudflare','Old','正常'),(2,'vhost','New','正常'),(3,'github','Code','正常'),(4,'github','Disabled','停用'),(5,'vps','Other service','正常'); INSERT INTO website_accounts(website_id,account_id,memo) VALUES(1,1,'old'),(1,3,'keep'),(1,5,'other'); INSERT INTO provider_resources(id,provider,account_id,name) VALUES(1,'cloudflare',1,'Host'); INSERT INTO website_resources(website_id,resource_id,role,is_primary) VALUES(1,1,'托管',1)")
})
after(async()=>{store.close();await server.close()})
const call = async (body,status=200) => {
 const {onRequestPut} = await server.ssrLoadModule('/functions/api/resources/account-links/index.ts')
 assert.equal(typeof onRequestPut,'function','single account replacement endpoint is available')
 const response = await onRequestPut({env:{DB:store.db,USER:'test',PASS:'secret'},request:new Request('https://test.local/api/resources/account-links',{method:'PUT',headers:{Authorization:`Bearer ${session}`,'Content-Type':'application/json'},body:JSON.stringify(body)})})
 assert.equal(response.status,status,await response.text())
}
test('single selection replaces only the requested account category and leaves deployment intact',async()=>{
 await call({website_id:1,kind:'service',account_id:2})
 await call({website_id:1,kind:'service',account_id:2})
 assert.deepEqual(store.sql('SELECT account_id FROM website_accounts ORDER BY account_id'),[{account_id:2},{account_id:3}])
 assert.equal(store.sql('SELECT memo FROM website_accounts WHERE account_id=3')[0].memo,'keep')
 assert.equal(store.sql('SELECT account_id FROM provider_resources')[0].account_id,1)
 assert.equal(store.sql('SELECT COUNT(*) n FROM website_resources')[0].n,1)
 await call({website_id:1,kind:'github',account_id:null})
 assert.deepEqual(store.sql('SELECT account_id FROM website_accounts'),[{account_id:2}])
 const {onRequestGet}=await server.ssrLoadModule('/functions/api/websites/index.ts')
 const response=await onRequestGet({env:{DB:store.db,USER:'test',PASS:'secret'},request:new Request('https://test.local/api/websites',{headers:{Authorization:`Bearer ${session}`}})})
 const {data}=await response.json()
 assert.deepEqual(data[0].direct_account_ids,[2])
 assert.deepEqual(data[0].provider_account_ids.sort(),[1,2])
})
test('invalid, disabled, cross-category and unauthorized selections preserve all links',async()=>{
 for(const body of [null,{},[],{website_id:1,kind:'service'},{website_id:1,kind:'bad',account_id:2},{website_id:1,kind:'service',account_id:3},{website_id:1,kind:'github',account_id:2},{website_id:1,kind:'github',account_id:4},{website_id:1,kind:'service',account_id:999},{website_id:1,kind:'service',account_id:'2'},{website_id:999,kind:'service',account_id:2}]) await call(body,400)
 session='invalid';await call({website_id:1,kind:'service',account_id:2},401)
 assert.deepEqual(store.sql('SELECT account_id FROM website_accounts ORDER BY account_id'),[{account_id:1},{account_id:3},{account_id:5}])
})
test('a failed replacement rolls back the removed account',async()=>{
 store.script("CREATE TRIGGER reject_account BEFORE INSERT ON website_accounts WHEN NEW.account_id=2 BEGIN SELECT RAISE(ABORT,'injected'); END;")
 await call({website_id:1,kind:'service',account_id:2},500)
 assert.deepEqual(store.sql('SELECT account_id FROM website_accounts ORDER BY account_id'),[{account_id:1},{account_id:3},{account_id:5}])
})
