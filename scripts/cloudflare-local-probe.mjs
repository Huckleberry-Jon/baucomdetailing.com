import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
// Local-only feasibility probe; no download, deployment, remote bindings or real data.
const modulePath = process.argv[2];
if (!modulePath) throw Error("Pass an installed Miniflare module path.");
const { Miniflare, convertV4MiniflareOptions } = await import(pathToFileURL(resolve(modulePath)).href);
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  compatibilityDate: "2026-08-01",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"],
  r2Buckets: ["MEDIA"],
  script: "import { scryptSync, timingSafeEqual } from 'node:crypto'; export default { async fetch() { const a=scryptSync('synthetic-probe-only','synthetic-salt',64), b=scryptSync('synthetic-probe-only','synthetic-salt',64); return Response.json({scryptCompatible:timingSafeEqual(a,b)}); }};",
}));
try {
  const checks = [];
  const response = await mf.dispatchFetch("http://localhost/crypto");
  assert.equal((await response.json()).scryptCompatible, true);
  checks.push("Existing scrypt/constant-time verification executes inside local workerd");
  const db = await mf.getD1Database("DB");
  await db.exec("CREATE TABLE probe_bookings(id TEXT PRIMARY KEY,tenant TEXT,status TEXT,start_ms INTEGER,end_ms INTEGER,version INTEGER); CREATE TABLE probe_history(id TEXT PRIMARY KEY,booking TEXT REFERENCES probe_bookings(id)); CREATE TABLE probe_outbox(id TEXT PRIMARY KEY,booking TEXT REFERENCES probe_bookings(id));");
  await db.batch(["a","b"].map(id => db.prepare("INSERT INTO probe_bookings VALUES(?,'test','pending',100,200,1)").bind(id)));
  async function confirm(id) {
    return db.batch([
      db.prepare("UPDATE probe_bookings SET status='confirmed',version=2 WHERE id=? AND tenant='test' AND version=1 AND NOT EXISTS(SELECT 1 FROM probe_bookings b WHERE b.tenant='test' AND b.id!=? AND b.status='confirmed' AND b.start_ms<200 AND b.end_ms>100)").bind(id,id),
      db.prepare("INSERT INTO probe_history SELECT id,id FROM probe_bookings WHERE id=? AND tenant='test' AND version=2").bind(id),
      db.prepare("INSERT INTO probe_outbox SELECT id,id FROM probe_bookings WHERE id=? AND tenant='test' AND version=2").bind(id),
    ]);
  }
  const results = await Promise.all([confirm("a"),confirm("b")]);
  assert.equal(results.reduce((sum,r)=>sum+r[0].meta.changes,0),1);
  assert.equal((await db.prepare("SELECT count(*) n FROM probe_bookings WHERE status='confirmed'").first()).n,1);
  assert.equal((await db.prepare("SELECT count(*) n FROM probe_outbox").first()).n,1);
  checks.push("Concurrent guarded D1 batches commit one conflicting appointment and its history/outbox");
  await assert.rejects(db.batch([
    db.prepare("INSERT INTO probe_bookings VALUES('rollback','test','pending',300,400,1)"),
    db.prepare("INSERT INTO probe_history VALUES('invalid','missing-parent')"),
  ]));
  assert.equal(await db.prepare("SELECT id FROM probe_bookings WHERE id='rollback'").first(),null);
  checks.push("D1 batch failure rolls back related records");
  const bucket = await mf.getR2Bucket("MEDIA");
  const bytes = new Uint8Array([0,1,2,255]);
  await bucket.put("synthetic/tenant-one/original",bytes);
  assert.deepEqual(new Uint8Array(await (await bucket.get("synthetic/tenant-one/original")).arrayBuffer()),bytes);
  checks.push("Private R2 binding preserves exact original bytes");
  console.log(JSON.stringify({passed:true,runtime:"local workerd/Miniflare",checks,remoteCalls:false,limits:"Primitive feasibility only; full scheduling rules, provider images, delivery and recovery not verified"},null,2));
} finally { await mf.dispose(); }
