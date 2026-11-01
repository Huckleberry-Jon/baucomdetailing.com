import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runtime,seed,login,call,input,future} from './helpers.mjs';
test('owner appointments are authenticated, atomic, idempotent and reserve calendar capacity', async()=>{
 const {mf,db}=await runtime();try{
 await seed(db); const cookie=await login(mf);const body=input({email:'',durationMinutes:90});delete body.acceptNotice;const key=randomUUID();
 const create=(b=body,k=key,c=cookie)=>call(mf,'/api/owner/appointments',{method:'POST',body:b,key:k,cookie:c});
 assert.equal((await create(body,key,'')).status,401);
 const first=await create();assert.equal(first.status,201,JSON.stringify(first.data));assert.equal(first.data.status,'confirmed');
 const row=await db.prepare('SELECT * FROM bookings WHERE id=?').bind(first.data.id).first();assert.equal(row.end_ms-row.start_ms,90*60000);assert.equal(JSON.parse(row.data).source,'owner');assert.equal(JSON.parse(row.data).noticeAcceptedAt,null);
 const event=await db.prepare('SELECT actor,event FROM history WHERE booking_id=?').bind(row.id).first();assert.equal(event.actor,'owner');assert.equal(event.event,'booking.confirm');
 const replay=await create();assert.equal(replay.status,200);assert.equal(replay.data.id,first.data.id);
 const counts=async()=> (await db.prepare('SELECT (SELECT count(*) FROM bookings) bookings,(SELECT count(*) FROM customers) customers').first());const before=await counts();
 assert.equal((await create(body,randomUUID())).status,409);assert.deepEqual(await counts(),before);
 assert.equal((await create({...body,durationMinutes:0,requestedAt:future(180)},randomUUID())).status,400);assert.deepEqual(await counts(),before);
 const blocked=Date.parse(future(240));await db.prepare('INSERT INTO schedule_blocks(id,business_id,start_ms,end_ms,label,created_at) VALUES(?,?,?,?,?,?)').bind(randomUUID(),'baucom',blocked,blocked+3600000,'Private block',Date.now()).run();
 assert.equal((await create({...body,requestedAt:future(240)},randomUUID())).status,409);assert.deepEqual(await counts(),before);
 }finally{await mf.dispose();}
});
