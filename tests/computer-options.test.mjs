import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
const bundle = await build({ entryPoints:['src/utils/computer-options.ts'], bundle:true, write:false, format:'esm', platform:'node' })
const { computerIdentity } = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
test('computer abbreviations keep standalone models and custom names intact',()=>{
 for(const [name,expected] of [
  ['Mac Mini Luokun',{label:'Luokun',prefix:'Mac Mini',laptop:false}],
  ['Mac Mini YC',{label:'YC',prefix:'Mac Mini',laptop:false}],
  ['Macbook Pro',{label:'Macbook Pro',prefix:'',laptop:true}],
  ['Macbook Air',{label:'Macbook Air',prefix:'',laptop:true}],
  ['Macbook Pro YC',{label:'YC',prefix:'Macbook Pro',laptop:true}],
  ['Mac Mini',{label:'Mac Mini',prefix:'',laptop:false}],
  ['Office PC',{label:'Office PC',prefix:'',laptop:false}]
 ]) assert.deepEqual(computerIdentity(name),expected,name)
})
