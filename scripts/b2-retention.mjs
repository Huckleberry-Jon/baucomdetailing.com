import {GetObjectLockConfigurationCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {requireThat} from '../src/security.js';
export async function verifyImmutableBucket(reader,bucket,days=30){
 requireThat(days===30,'Only the approved 30-day retention is supported');
 const r=await reader.send(new GetObjectLockConfigurationCommand({Bucket:bucket}));
 const c=r.ObjectLockConfiguration;
 requireThat(c?.ObjectLockEnabled==='Enabled' && c.Rule?.DefaultRetention?.Mode==='COMPLIANCE' && c.Rule.DefaultRetention.Days>=days,'Backup bucket must enforce 30-day COMPLIANCE retention');
 return {mode:'COMPLIANCE',days};
}
export async function verifyObjectRetention(reader,bucket,key,versionId,days=30,now=Date.now()){
 const r=await reader.send(new HeadObjectCommand({Bucket:bucket,Key:key,VersionId:versionId}));
 requireThat(r.ObjectLockMode==='COMPLIANCE' && new Date(r.ObjectLockRetainUntilDate).getTime()>=now+(days*86400000)-300000,'Uploaded backup version is not protected for the approved retention period');
 return {mode:r.ObjectLockMode,retainUntil:new Date(r.ObjectLockRetainUntilDate).toISOString()};
}
