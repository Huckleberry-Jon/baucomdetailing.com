import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

test('customer cancel dismisses safely and sends only after explicit confirmation',async()=>{
 const elements=Object.fromEntries(['#booking','#accept','#cancel','#refresh','#status'].map(k=>[k,{replaceChildren(){},append(){}}]));
 const writes=[]; let accept=false;
 vm.runInNewContext(fs.readFileSync('public/customer.js','utf8'),{
  location:{hash:'#test-id:test-secret'},window:{confirm:()=>accept},
  document:{querySelector:s=>elements[s],createElement:()=>({})},
  fetch:async(path,options)=>{if(options.method==='POST')writes.push(JSON.parse(options.body));return{ok:true,json:async()=>({version:7,status:'confirmed',requestedAt:new Date().toISOString(),snapshot:{package:{name:'Test'}}})}},
 });
 await new Promise(setImmediate);
 await elements['#cancel'].onclick(); assert.equal(writes.length,0);
 accept=true;await elements['#cancel'].onclick();assert.deepEqual(writes.map(w=>({...w})),[{id:'test-id',action:'cancel',version:7}]);
});
test('owner cancel and complete require explicit confirmation before transition',async()=>{
 const source=fs.readFileSync('public/owner.js','utf8');const start=source.indexOf('    const send = async (action) => {');const end=source.indexOf('    if (b.status === "pending")',start);assert(start>0&&end>start);
 let accepted=false;const writes=[];
 const send=vm.runInNewContext('(()=>{'+source.slice(start,end)+'return send;})()',{
  window:{confirm:()=>accepted},b:{id:'booking',version:3},duration:{value:'90'},when:{},price:{},
  api:async(...args)=>writes.push(args),refresh:async()=>{},
 });
 await send('cancel');await send('complete');assert.equal(writes.length,0);
 accepted=true;await send('cancel');await send('complete');assert.deepEqual(writes.map(w=>w[2].action),['cancel','complete']);
});
