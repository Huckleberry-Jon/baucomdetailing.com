import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://baucomdetailing.com';
try {
 const names=(await readdir('data/backup-receipts')).filter(n=>n.endsWith('.json'));
 assert.equal(names.length,1,'Exactly one current-run receipt required');
 const r=JSON.parse(await readFile('data/backup-receipts/'+names[0],'utf8'));
 assert.equal(r.restoreVerified,true);assert(r.verifiedAt && r.backupId);
 const body={id:r.backupId,verifiedAt:r.verifiedAt,restoreVerified:true,runId:Number(process.env.GITHUB_RUN_ID),artifactId:Number(process.env.RECEIPT_ARTIFACT_ID)};
 const response=await fetch(origin+'/api/recovery/verified',{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+process.env.BACKUP_HEALTH_TOKEN},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,'Backup health receipt rejected');
 console.log('Restore-verified backup and independent receipt recorded successfully');
} catch {console.error('Backup health reporting failed; inspect the run and protected recovery receipts. No secret values logged.');process.exitCode=1;}
