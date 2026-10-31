import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime, seed, login, call} from './helpers.mjs';
test('customer company and optional make/model save atomically as tenant-scoped linked records', async () => {
  const {mf, db} = await runtime();
  try {
    await seed(db); const cookie=await login(mf);
    const data={firstName:'Test',lastName:'Owner',company:'Fleet company',email:'test@example.invalid',phone:'8065550100',address:'Amarillo',notes:''};
    const before=(await call(mf,'/api/owner/customers',{cookie})).data.records.length;
    const invalid=await call(mf,'/api/owner/customers',{cookie,method:'POST',body:{data,vehicle:{make:'Chevrolet',model:''}}});
    assert.equal(invalid.status,400);
    assert.equal((await call(mf,'/api/owner/customers',{cookie})).data.records.length,before);
    const created=await call(mf,'/api/owner/customers',{cookie,method:'POST',body:{data,vehicle:{make:'Chevrolet',model:'Express'}}});
    assert.equal(created.status,201);
    const detail=await call(mf,'/api/owner/customer?id='+created.data.id,{cookie});
    assert.equal(detail.data.data.company,'Fleet company');
    assert.equal(detail.data.vehicles.length,1);
    const vehicle=JSON.parse(detail.data.vehicles[0].data);
    assert.equal(vehicle.make,'Chevrolet'); assert.equal(vehicle.model,'Express'); assert.equal(vehicle.year,null);
    const updated=await call(mf,'/api/owner/customers',{cookie,method:'PUT',body:{id:detail.data.id,version:detail.data.version,data:{...detail.data.data,company:'Updated fleet'}}});
    assert.equal(updated.status,200);
    assert.equal((await call(mf,'/api/owner/customers?q=Updated%20fleet',{cookie})).data.records.length,1);
    const personal=await call(mf,'/api/owner/customers',{cookie,method:'POST',body:{data:{...data,company:''}}});
    assert.equal(personal.status,201);
    assert.equal((await call(mf,'/api/owner/customer?id='+personal.data.id,{cookie})).data.vehicles.length,0);
    await seed(db,'second','localhost:4336'); const other=await login(mf,'http://localhost:4336');
    assert.equal((await call(mf,'/api/owner/customer?id='+detail.data.id,{cookie:other,host:'http://localhost:4336'})).status,404);
  } finally {await mf.dispose();}
});
