import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runtime,seed,login,call,input} from './helpers.mjs';
async function fixture(){
 const f=await runtime();await seed(f.db);const cookie=await login(f.mf);
 const post=(path,body,key=randomUUID())=>call(f.mf,path,{cookie,method:'POST',body,key});
 const booking=(await post('/api/bookings',input())).data;
 assert.equal((await post('/api/owner/transition',{id:booking.id,version:1,action:'confirm',durationMinutes:90})).status,200);
 assert.equal((await post('/api/owner/transition',{id:booking.id,version:2,action:'start'})).status,200);
 const context=()=>call(f.mf,'/api/owner/job-completion?booking='+booking.id,{cookie});
 const ctx=(await context()).data;
 const body={bookingId:booking.id,bookingVersion:ctx.job.booking_version,jobVersion:ctx.job.version,invoiceVersion:null,unpaid:false,amountCents:10000,tipCents:1500,method:'cash',occurredAt:new Date().toISOString(),servicePriceCents:10000,taxBps:0,discountCents:0};
 return {...f,cookie,post,booking,context,body};
}
test('actual D1 completion issues invoice and records payment plus separate tip exactly once',async()=>{
 const f=await fixture();try{
 const key=randomUUID();const result=await f.post('/api/owner/job-completion',f.body,key);assert.equal(result.status,200,JSON.stringify(result.data));
 assert.equal(result.data.balanceCents,0);
 assert.equal((await f.post('/api/owner/job-completion',f.body,key)).data.duplicate,true);
 assert.equal((await f.post('/api/owner/job-completion',{...f.body,tipCents:1600},key)).status,409);
 assert.equal((await f.context()).data.job.status,'completed');
 const report=await call(f.mf,'/api/owner/finance/report?from='+new Date(Date.now()-86400000).toISOString()+'&to='+new Date(Date.now()+86400000).toISOString(),{cookie:f.cookie});
 assert.equal(report.data.receiptsCents,10000);assert.equal(report.data.tipsCents,1500);assert.equal(report.data.outstandingCents,0);
 assert.equal((await f.db.prepare('SELECT count(*) n FROM financial_documents').first()).n,1);
 assert.equal((await f.db.prepare('SELECT count(*) n FROM financial_events').first()).n,1);
 await seed(f.db,'second','localhost:4336');const other=await login(f.mf,'http://localhost:4336');
 assert.equal((await call(f.mf,'/api/owner/job-completion?booking='+f.booking.id,{cookie:other,host:'http://localhost:4336'})).status,404);
 }finally{await f.mf.dispose();}
});
test('actual D1 unpaid completion creates an outstanding invoice with no invented payment',async()=>{
 const f=await fixture();try{const result=await f.post('/api/owner/job-completion',{...f.body,unpaid:true,amountCents:0,tipCents:0,method:null});assert.equal(result.status,200);assert.equal(result.data.paymentId,null);assert.equal(result.data.balanceCents,10000);assert.equal((await f.db.prepare('SELECT count(*) n FROM financial_events').first()).n,0);}finally{await f.mf.dispose();}
});
test('actual D1 overpayment, stale checkout and partial batch failures cannot complete or charge a job',async()=>{
 const f=await fixture();try{
 assert.equal((await f.post('/api/owner/job-completion',{...f.body,amountCents:10001})).status,409);
 assert.equal((await f.post('/api/owner/job-completion',{...f.body,jobVersion:900})).status,409);
 assert.equal((await f.db.prepare('SELECT count(*) n FROM financial_documents').first()).n,0);
 await f.db.exec("CREATE TRIGGER fail_checkout BEFORE INSERT ON history WHEN NEW.event='job.checkout' BEGIN SELECT RAISE(ABORT,'checkout_test_failure'); END;");
 assert.equal((await f.post('/api/owner/job-completion',f.body)).status,500);
 assert.equal((await f.context()).data.job.status,'in_progress');assert.equal((await f.db.prepare('SELECT count(*) n FROM financial_events').first()).n,0);assert.equal((await f.db.prepare('SELECT count(*) n FROM financial_documents').first()).n,0);
 }finally{await f.mf.dispose();}
});
test('actual D1 concurrent completions keep one invoice/payment; completed legacy jobs can record real payment',async()=>{
 const f=await fixture();try{
 await f.post('/api/owner/transition',{id:f.booking.id,version:3,action:'complete'});f.body.bookingVersion=4;
 const outcomes=await Promise.all([f.post('/api/owner/job-completion',f.body),f.post('/api/owner/job-completion',f.body)]);
 assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
 assert.equal((await f.db.prepare('SELECT count(*) n FROM financial_events').first()).n,1);
 assert.equal((await f.db.prepare('SELECT count(*) n FROM financial_documents').first()).n,1);
 }finally{await f.mf.dispose();}
});

test('actual D1 completion respects an existing issued invoice, deposits, tax and saved charges',async()=>{
 const f=await fixture();try{
 const invoice=await f.post('/api/owner/documents',{kind:'invoice',customerId:(await f.context()).data.job.customer_id,bookingId:f.booking.id,lines:[{description:'Approved detailing',unit:'service',quantityMillis:1000,unitPriceCents:10000,unitCostCents:2000,taxable:true}],discountCents:1000,taxBps:825});
 assert.equal(invoice.status,201);
 const issued=await f.post('/api/owner/documents/issue',{id:invoice.data.id,version:1});assert.equal(issued.status,200);
 assert.equal((await f.post('/api/owner/finance/events',{kind:'payment',documentId:invoice.data.id,amountCents:3000,tipCents:0,method:'cash',occurredAt:new Date().toISOString()})).status,201);
 const ctx=(await f.context()).data;assert.equal(ctx.invoice.data.totalCents,9743);assert.equal(ctx.invoice.paid_cents,3000);
 const result=await f.post('/api/owner/job-completion',{...f.body,invoiceVersion:2,amountCents:6743,tipCents:1000,servicePriceCents:99999});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.documentId,invoice.data.id);assert.equal(result.data.balanceCents,0);
 const total=await f.db.prepare('SELECT sum(amount_cents) paid,sum(tip_cents) tip,sum(tax_cents) tax FROM financial_events').first();assert.deepEqual({...total},{paid:9743,tip:1000,tax:743});
 assert.equal((await f.db.prepare('SELECT count(*) n FROM financial_documents').first()).n,1);
 }finally{await f.mf.dispose();}
});
