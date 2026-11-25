import {ref} from 'vue'
// Save baselines must describe submitted data, including when typing continues.
import assert from 'node:assert/strict'
import {after,test} from 'node:test'
import {createServer} from 'vite'
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'})
after(()=>server.close())
test('edits made while the post-save callback awaits remain dirty',async()=>{
 const {createWebsiteSession}=await server.ssrLoadModule('/src/composables/websiteSession.ts')
 const s=createWebsiteSession(),draft=ref('old');s.draft('profile',()=>draft.value);s.begin(1)
 draft.value='submitted';let finish,started
 const applying=new Promise(resolve=>{started=resolve})
 const pending=s.save('profile',async()=>42,async()=>{started();await new Promise(resolve=>{finish=resolve})})
 await applying;draft.value='newer';finish();await pending
 assert.equal(s.dirty.value,true)
 draft.value='submitted';assert.equal(s.dirty.value,false)
})
test('late reads from a previous website cannot assign values or errors to the current session',async()=>{
 const {createWebsiteSession}=await server.ssrLoadModule('/src/composables/websiteSession.ts')
 const session=createWebsiteSession();let resolve;let value='B'
 session.begin(1)
 const read=session.load('work',[{read:()=>new Promise(r=>resolve=r),assign:v=>{value=v}}])
 session.begin(2);resolve('A');await read
 assert.equal(value,'B');assert.deepEqual({...session.errors},{})
})
test('independent reads keep successful values when another read fails and allow retry',async()=>{
 const {createWebsiteSession}=await server.ssrLoadModule('/src/composables/websiteSession.ts')
 const s=createWebsiteSession();s.begin(1);let value
 await s.load('work',[{read:async()=>{throw Error('tasks failed')},assign:()=>{}},{read:async()=>42,assign:v=>{value=v}}])
 assert.equal(value,42);assert.equal(s.errors.work,'tasks failed');assert.equal(s.loading.work,false)
 await s.load('work',[{read:async()=>43,assign:v=>{value=v}}]);assert.equal(value,43);assert.equal(s.errors.work,'')
})
test('saving one draft keeps another dirty and busy sessions cannot be discarded',async()=>{
 const {createWebsiteSession}=await server.ssrLoadModule('/src/composables/websiteSession.ts')
 const s=createWebsiteSession();const a=ref('a'),b=ref('b'),busy=ref(false)
 s.draft('profile',()=>a.value);s.draft('task',()=>b.value);s.activity(()=>busy.value);s.begin(1)
 a.value='changed';b.value='changed';s.clean('profile');assert.equal(s.dirty.value,true)
 busy.value=true;let prompts=0;assert.equal(await s.leave(async()=>{prompts++;return true}),false);assert.equal(prompts,0)
 busy.value=false;assert.equal(await s.leave(async()=>false),false);assert.equal(s.dirty.value,true)
 assert.equal(await s.leave(async()=>true),true);assert.equal(s.dirty.value,false)
 s.begin(2);assert.equal(s.dirty.value,false)
})
test('a session read cannot open a history dialog after the website changes',async()=>{
 const {createWebsiteSession}=await server.ssrLoadModule('/src/composables/websiteSession.ts')
 const s=createWebsiteSession();s.begin(1);let resolve,opened=false
 const read=s.load('note-history',[{read:()=>new Promise(r=>resolve=r),assign:()=>{opened=true}}],true)
 s.begin(2);resolve([{content:'A history'}]);await read
 assert.equal(opened,false)
})
test('session saves block leaving, retain failed drafts and clean only the saved draft on success',async()=>{
 const {createWebsiteSession}=await server.ssrLoadModule('/src/composables/websiteSession.ts')
 const s=createWebsiteSession(),a=ref('old'),b=ref('old');s.draft('profile',()=>a.value);s.draft('task',()=>b.value);s.begin(1)
 a.value='new';b.value='new'
 assert.equal(typeof s.save,'function')
 let reject
 const failed=s.save('profile',()=>new Promise((_,r)=>reject=r),()=>{})
 assert.equal(s.busy.value,true);assert.equal(await s.leave(async()=>true),false)
 reject(Error('save failed'));await assert.rejects(failed,/save failed/)
 assert.equal(s.busy.value,false);assert.equal(s.dirty.value,true)
 await s.save('profile',async()=>42,()=>{})
 assert.equal(s.dirty.value,true);s.clean('task');assert.equal(s.dirty.value,false)
})
test('a successful save keeps edits entered after submission dirty',async()=>{
 const {createWebsiteSession}=await server.ssrLoadModule('/src/composables/websiteSession.ts')
 const s=createWebsiteSession(),draft=ref('old');s.draft('profile',()=>draft.value);s.begin(1)
 draft.value='submitted';let resolve,unchanged
 const pending=s.save('profile',()=>new Promise(r=>resolve=r),(_value,same)=>{unchanged=same})
 draft.value='newer';resolve(42);await pending
 assert.equal(unchanged,false);assert.equal(s.dirty.value,true)
 draft.value='submitted';assert.equal(s.dirty.value,false)
})
test('a save from an old session cannot apply or clear the current saving state',async()=>{
 const {createWebsiteSession}=await server.ssrLoadModule('/src/composables/websiteSession.ts')
 const s=createWebsiteSession();s.begin(1);let resolve,applied=false
 const pending=s.save('profile',()=>new Promise(r=>resolve=r),()=>{applied=true})
 s.begin(2);let finish;const current=s.save('profile',()=>new Promise(r=>finish=r))
 resolve(1);await pending;assert.equal(applied,false);assert.equal(s.busy.value,true)
 finish(2);await current;assert.equal(s.busy.value,false)
})
