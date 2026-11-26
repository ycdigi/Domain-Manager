import assert from 'node:assert/strict'
import {beforeEach,after,test} from 'node:test'
import {createServer} from 'vite'
import {database} from './helpers/database.mjs'
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'})
const store=database(), key='local-test-encryption-key-at-least-32-characters'
const token='github_pat_'+ 'test'.repeat(20)
let session
beforeEach(async()=>{
 store.init();session=await (await server.ssrLoadModule('/functions/utils/auth.ts')).issueSessionToken('test','secret')
 store.sql("INSERT INTO websites(id,name,platform) VALUES(1,'Code','Astro'),(2,'WP','WordPress'); INSERT INTO domains(website_id,domain,registrar,registrar_date,expiry_date,service_type) VALUES(1,'code.test','r','2026-01-01','2027-01-01','网站'),(2,'wp.test','r','2026-01-01','2027-01-01','网站'); INSERT INTO provider_accounts(id,provider,name,login_email) VALUES(1,'github','selected','selected@example.test'),(2,'github','repo owner','owner@example.test'); INSERT INTO website_accounts(website_id,account_id) VALUES(1,1)")
})
after(async()=>{store.close();await server.close()})
const call=async(file,handler,body,status=200,id='1',overrides={})=>{
 const api=await server.ssrLoadModule(file)
 const response=await api[handler]({env:{DB:store.db,USER:'test',PASS:'secret',CREDENTIAL_ENCRYPTION_KEY:key,...overrides},params:{id},request:new Request('https://test.local/api/test',{method:handler==='onRequestGet'?'GET':'POST',headers:{Authorization:`Bearer ${session}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})})
 const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result.data
}
const accounts='/functions/api/resources/accounts/index.ts', editAccount='/functions/api/resources/accounts/[id]/index.ts', copy='/functions/api/websites/[id]/copy/index.ts'
const defaultToken=async(accountId,value=token)=>{
 const {encryptCredential}=await server.ssrLoadModule('/functions/utils/credentials.ts')
 store.sql("INSERT INTO provider_credentials(account_id,label,ciphertext,token_last4,is_default) VALUES(?,'Default',?,?,1)",[accountId,await encryptCredential(value,key),value.slice(-4)])
}
test('account editor saves a default encrypted Token atomically and never returns it',async()=>{
 const row=await call(accounts,'onRequestPost',{provider:'github',name:'new',login_email:'new@example.test',memo:'normal note',token},201)
 const saved=store.sql('SELECT * FROM provider_credentials WHERE account_id=?',[row.id])[0]
 assert.ok(saved,'Token from account editor must be saved as a credential')
 assert.equal(saved.is_default,1);assert.notEqual(saved.ciphertext,token)
 const {decryptCredential}=await server.ssrLoadModule('/functions/utils/credentials.ts');assert.equal(await decryptCredential(saved.ciphertext,key),token)
 assert.ok(!JSON.stringify(row).includes(token))
 const before=saved.ciphertext
 await call(editAccount,'onRequestPut',{name:'new',login_email:'changed@example.test',memo:'normal note',token:''},200,String(row.id))
 assert.equal(store.sql('SELECT ciphertext FROM provider_credentials WHERE account_id=?',[row.id])[0].ciphertext,before)
})
test('direct website account plus push address copies the exact requested format',async()=>{
 await defaultToken(1)
 await call('/functions/api/websites/[id].ts','onRequestPatch',{github_push_url:'https://github.com/org/repo.git'},200)
 const data=await call(copy,'onRequestPost',{})
 assert.equal(data.text,`地址：https://github.com/org/repo.git\nToken：${token}\nEmail：selected@example.test\n最后将整站所有的修正Github推送,包含但不限于当前对话;`)
})
test('selected account overrides repository owner, with existing repository address as fallback',async()=>{
 await defaultToken(1);await defaultToken(2,'ghp_'+'owner'.repeat(10))
 store.sql("INSERT INTO provider_resources(id,provider,account_id,name,resource_url) VALUES(1,'github',2,'Repo','https://github.com/org/repo'); INSERT INTO website_resources(website_id,resource_id,role,is_primary) VALUES(1,1,'代码仓库',1)")
 const data=await call(copy,'onRequestPost',{});assert.ok(data.text.includes('Email：selected@example.test'));assert.ok(data.text.includes('Token：'+token));assert.ok(data.text.startsWith('地址：https://github.com/org/repo.git\n'))
})
test('legacy memo Token migrates on copy, is cleared, and never appears in normal listings or backup',async()=>{
 store.sql('UPDATE provider_accounts SET memo=? WHERE id=1',[token])
 const listed=await call(accounts,'onRequestGet');assert.ok(!JSON.stringify(listed).includes(token))
 const {exportBackup}=await server.ssrLoadModule('/functions/domain/backup-restore.ts');assert.ok(!JSON.stringify(await exportBackup(store.db)).includes(token))
 await call('/functions/api/websites/[id].ts','onRequestPatch',{github_push_url:'https://github.com/org/repo'},200)
 const copied=await call(copy,'onRequestPost',{});assert.ok(copied.text.includes(token))
 assert.equal(store.sql('SELECT memo FROM provider_accounts WHERE id=1')[0].memo,'')
 assert.equal(store.sql('SELECT count(*) n FROM provider_credentials WHERE account_id=1')[0].n,1)
 await call(copy,'onRequestPost',{});assert.equal(store.sql('SELECT count(*) n FROM provider_credentials WHERE account_id=1')[0].n,1)
})
test('legacy migration preserves a conflicting default and reports the conflict without exposing tokens',async()=>{
 await defaultToken(1);const other='ghp_'+'other'.repeat(10);store.sql('UPDATE provider_accounts SET memo=? WHERE id=1',[other])
 const data=await call('/functions/api/resources/credentials/migrate/index.ts','onRequestPost',{})
 assert.equal(data.conflicts.length,1);assert.equal(data.conflicts[0].account_id,1);assert.ok(!JSON.stringify(data).includes(other))
 assert.equal(store.sql('SELECT memo FROM provider_accounts WHERE id=1')[0].memo,other)
 const {decryptCredential}=await server.ssrLoadModule('/functions/utils/credentials.ts');assert.equal(await decryptCredential(store.sql('SELECT ciphertext FROM provider_credentials WHERE account_id=1')[0].ciphertext,key),token)
})
test('missing encryption key leaves the account and credential unchanged',async()=>{
 await call(editAccount,'onRequestPut',{name:'Changed',token},400,'1',{CREDENTIAL_ENCRYPTION_KEY:''})
 assert.equal(store.sql('SELECT name FROM provider_accounts WHERE id=1')[0].name,'selected');assert.equal(store.sql('SELECT count(*) n FROM provider_credentials')[0].n,0)
})
test('copy identifies missing address, email, expired or disabled Token and rejects unauthorized access',async()=>{
 await call(copy,'onRequestPost',{},400)
 await call('/functions/api/websites/[id].ts','onRequestPatch',{github_push_url:'https://github.com/org/repo'},200)
 await call(copy,'onRequestPost',{},400)
 await defaultToken(1);store.sql("UPDATE provider_credentials SET expires_at='2020-01-01'");await call(copy,'onRequestPost',{},400)
 store.sql("UPDATE provider_credentials SET expires_at=NULL,status='停用'");await call(copy,'onRequestPost',{},400)
 store.sql("UPDATE provider_credentials SET status='有效';UPDATE provider_accounts SET login_email=NULL WHERE id=1");await call(copy,'onRequestPost',{},400)
 session='invalid';await call(copy,'onRequestPost',{},401)
})
test('website maintenance URLs validate, persist, clear, and survive portable backup restore',async()=>{
 for(const fields of [{github_push_url:'https://evil.test/org/repo'},{github_push_url:'https://github.com/org/repo/tree/main'},{wp_login_url:'javascript:alert(1)'},{wp_login_url:'https://user:pass@wp.test/safelogin'}])await call('/functions/api/websites/[id].ts','onRequestPatch',fields,400)
 await call('/functions/api/websites/[id].ts','onRequestPatch',{wp_login_url:'https://admin.wp.test/custom-login?from=manager'},200,'2')
 assert.equal(store.sql('SELECT wp_login_url FROM websites WHERE id=2')[0].wp_login_url,'https://admin.wp.test/custom-login?from=manager')
 const {exportBackup,restoreBackup}=await server.ssrLoadModule('/functions/domain/backup-restore.ts');const backup=await exportBackup(store.db)
 assert.equal((await restoreBackup(store.db,backup)).status,200)
 assert.equal(store.sql('SELECT wp_login_url FROM websites WHERE id=2')[0].wp_login_url,'https://admin.wp.test/custom-login?from=manager')
 await call('/functions/api/websites/[id].ts','onRequestPatch',{wp_login_url:''},200,'2');assert.equal(store.sql('SELECT wp_login_url FROM websites WHERE id=2')[0].wp_login_url,null)
})
test('WordPress maintenance uses custom login or /safelogin, with GitHub taking precedence',async()=>{
 const {websiteMaintenance}=await server.ssrLoadModule('/shared/website-maintenance.ts')
 const wp={platform:'WordPress',domains:[{domain:'wp.test',is_primary:1}]}
 assert.deepEqual(websiteMaintenance(wp),{kind:'login',label:'登录后台',url:'https://wp.test/safelogin'})
 assert.equal(websiteMaintenance({...wp,wp_login_url:'https://admin.test/custom'}).url,'https://admin.test/custom')
 assert.equal(websiteMaintenance({...wp,provider_accounts:[{id:1,provider:'github'}]}).kind,'github')
 assert.equal(websiteMaintenance({...wp,repository:{id:1}}).kind,'github')
 assert.equal(websiteMaintenance({...wp,platform:'Astro'}).kind,'configure')
})

test('concurrent legacy migration never overwrites a different default inserted during migration',async()=>{
 store.sql('UPDATE provider_accounts SET memo=? WHERE id=1',[token])
 const competing='ghp_'+'competing'.repeat(8)
 const {encryptCredential,decryptCredential}=await server.ssrLoadModule('/functions/utils/credentials.ts')
 const ciphertext=await encryptCredential(competing,key)
 const {migrateGithubTokens}=await server.ssrLoadModule('/functions/domain/github-credentials.ts')
 let injected=false
 const db={...store.db,batch:async statements=>{if(!injected){injected=true;store.sql("INSERT INTO provider_credentials(account_id,label,ciphertext,token_last4,is_default) VALUES(1,'Concurrent',?,?,1)",[ciphertext,competing.slice(-4)])}return store.db.batch(statements)}}
 const result=await migrateGithubTokens(db,key,1)
 assert.equal(result.migrated,0);assert.equal(result.conflicts.length,1)
 assert.equal(store.sql('SELECT memo FROM provider_accounts WHERE id=1')[0].memo,token)
 assert.equal(await decryptCredential(store.sql('SELECT ciphertext FROM provider_credentials WHERE account_id=1')[0].ciphertext,key),competing)
})
test('credential write failure rolls back account edits',async()=>{
 store.script("CREATE TRIGGER reject_credential BEFORE INSERT ON provider_credentials BEGIN SELECT RAISE(ABORT,'injected'); END;")
 await call(editAccount,'onRequestPut',{name:'Changed',token},409,'1')
 assert.equal(store.sql('SELECT name FROM provider_accounts WHERE id=1')[0].name,'selected')
 await call(accounts,'onRequestPost',{provider:'github',name:'New failed',token},409)
 assert.equal(store.sql('SELECT count(*) n FROM provider_accounts')[0].n,2)
})
test('copy rejects ambiguous direct GitHub accounts instead of choosing one silently',async()=>{
 await defaultToken(1);await defaultToken(2)
 store.sql('INSERT INTO website_accounts(website_id,account_id) VALUES(1,2)')
 await call('/functions/api/websites/[id].ts','onRequestPatch',{github_push_url:'https://github.com/org/repo'},200)
 await call(copy,'onRequestPost',{},400)
})
test('editing a normal note preserves an unmigrated legacy Token',async()=>{
 store.sql('UPDATE provider_accounts SET memo=? WHERE id=1',[token])
 await call(editAccount,'onRequestPut',{name:'selected',login_email:'selected@example.test',memo:'new normal note',token:''})
 const saved=store.sql('SELECT ciphertext FROM provider_credentials WHERE account_id=1')[0]
 assert.ok(saved,'legacy credential must survive a note edit')
 const {decryptCredential}=await server.ssrLoadModule('/functions/utils/credentials.ts')
 assert.equal(await decryptCredential(saved.ciphertext,key),token)
 assert.equal(store.sql('SELECT memo FROM provider_accounts WHERE id=1')[0].memo,'new normal note')
})
test('editing notes after legacy migration preserves an existing Token expiry and disabled state',async()=>{
 await defaultToken(1)
 store.sql("UPDATE provider_credentials SET status='停用',expires_at='2020-01-01'")
 store.sql('UPDATE provider_accounts SET memo=? WHERE id=1',[token])
 const before=store.sql('SELECT * FROM provider_credentials')[0]
 await call(editAccount,'onRequestPut',{name:'selected',memo:'note',token:''})
 assert.deepEqual(store.sql('SELECT * FROM provider_credentials')[0],before)
 assert.equal(store.sql('SELECT memo FROM provider_accounts WHERE id=1')[0].memo,'note')
})
