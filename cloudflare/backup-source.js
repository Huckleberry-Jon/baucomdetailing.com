import {timingSafeEqual} from 'node:crypto';import {hash,requireThat} from '../src/security.js';import {TABLES} from './recovery-tables.js';
export async function readBackupSnapshot(s,bearer,env){
 requireThat(env.BACKUP_SOURCE_TOKEN?.length>=43,'Read-only backup source not configured',503);
 requireThat(typeof bearer==='string'&&timingSafeEqual(Buffer.from(hash(bearer)),Buffer.from(hash(env.BACKUP_SOURCE_TOKEN))),'Backup source authentication required',401);
 requireThat(s.tenant===env.BACKUP_BUSINESS_ID,'Backup business mismatch',403);
 const rows=await s.db.batch(TABLES.map(t=>t==='rate_limits'?s.db.prepare('SELECT * FROM rate_limits WHERE 0'):t==='review_moderation'?s.statement('SELECT m.* FROM review_moderation m JOIN reviews r ON r.id=m.review_id WHERE r.business_id=?',s.tenant):s.statement('SELECT * FROM "'+t+'" WHERE '+(t==='businesses'?'id':'business_id')+'=?',s.tenant)));
 const tables=Object.fromEntries(TABLES.map((t,i)=>[t,rows[i].results]));
 return {format:'docdetailing-readonly-snapshot',version:1,businessId:s.tenant,namespace:env.DATA_NAMESPACE,createdAt:Date.now(),tables};
}
