import { timingSafeEqual } from 'node:crypto';
import { hash, requireThat } from '../src/security.js';
export async function recordVerifiedBackup(s, body, bearer, env, now=Date.now()) {
  requireThat(env.BACKUP_HEALTH_TOKEN?.length>=43, 'Backup health is not configured',503);
  requireThat(typeof bearer==='string' && timingSafeEqual(Buffer.from(hash(bearer)),Buffer.from(hash(env.BACKUP_HEALTH_TOKEN))), 'Backup health authentication required',401);
  requireThat(s.tenant===env.BACKUP_BUSINESS_ID,'Backup business mismatch',403);
  const finished=Date.parse(body.verifiedAt);
  requireThat(body.restoreVerified===true && /^[a-f0-9-]{36}$/.test(body.id??'') && Number.isSafeInteger(body.runId) && body.runId>0 && Number.isSafeInteger(body.artifactId) && body.artifactId>0 && Number.isFinite(finished) && finished<=now+60000 && finished>=now-600000,'Fresh verified restore and independent receipt required');
  await s.statement("INSERT OR IGNORE INTO backup_runs(id,business_id,started_at,finished_at,status,directory,error) VALUES(?,?,?,?,'uploaded',?,NULL)",body.id,s.tenant,finished,finished,'https://github.com/Huckleberry-Jon/baucomdetailing.com/actions/runs/'+body.runId+'/artifacts/'+body.artifactId).run();
  return {ok:true};
}
export async function checkBackupHealth(s,env,now=Date.now(),fetchImpl=fetch){
  if(env.BACKUP_MONITOR_ENABLED!=='true'||s.tenant!==env.BACKUP_BUSINESS_ID)return;
  const latest=await s.first("SELECT max(finished_at) finished FROM backup_runs WHERE business_id=? AND status='uploaded'",s.tenant);
  if(latest?.finished && now-latest.finished<=36*3600000)return;
  requireThat(env.RESEND_API_KEY && env.EMAIL_FROM && env.BACKUP_ALERT_EMAIL,'Backup alert transport missing',503);
  const owner=await s.first('SELECT id FROM owners WHERE business_id=? AND lower(email)=?',s.tenant,env.BACKUP_ALERT_EMAIL.toLowerCase());
  requireThat(owner,'Backup alert must target an existing business owner',403);
  const id='backup-overdue:'+s.tenant+':'+Math.floor(now/86400000);
  if(await s.first('SELECT id FROM worker_errors WHERE id=? AND business_id=?',id,s.tenant))return;
  const r=await fetchImpl('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:env.EMAIL_FROM,to:[env.BACKUP_ALERT_EMAIL],subject:'DocDetailing backup requires attention',text:'No independently stored, restore-verified backup has reported success within 36 hours. Check the DocDetailing GitHub backup workflow and recovery receipts. Existing bookings remain stored; investigate backup protection now.'})});
  requireThat(r.ok,'Backup alert provider failed',503);
  await s.statement('INSERT OR IGNORE INTO worker_errors VALUES(?,?,?,?)',id,s.tenant,'Backup overdue alert accepted by email provider',now).run();
}
