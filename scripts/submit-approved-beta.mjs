import assert from "node:assert/strict";
import fs from "node:fs";
import {appleAPIToken,lookupAppleApp} from "./apple-upload-preflight.mjs";
assert.equal(process.env.CM_BRANCH,"main");
assert.equal(process.env.BETA_REVIEW_APPROVAL,"submit-build-5");
const credentials={keyId:process.env.APP_STORE_CONNECT_KEY_IDENTIFIER,issuerId:process.env.APP_STORE_CONNECT_ISSUER_ID,privateKey:process.env.APP_STORE_CONNECT_PRIVATE_KEY};
try {
 const app=await lookupAppleApp(credentials),jwt=appleAPIToken(credentials);
 async function request(path,body,allow404=false){const r=await fetch("https://api.appstoreconnect.apple.com/v1/"+path,{method:body?"POST":"GET",redirect:"error",signal:AbortSignal.timeout(20000),headers:{Authorization:"Bearer "+jwt,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});if(allow404&&r.status===404)return null;const data=await r.json();if(!r.ok){console.error("Apple beta request HTTP "+r.status+" codes "+(data.errors??[]).map(e=>e.code).join(","));throw Error("Apple beta request failed");}return data;}
 const found=await request("builds?"+new URLSearchParams({"filter[app]":app.appId,"filter[version]":"5",include:"preReleaseVersion"}));
 assert.equal(found.data.length,1);const build=found.data[0];assert.equal(build.attributes.version,"5");assert.equal(build.attributes.expired,false);assert.equal(build.attributes.processingState,"VALID");assert(found.included.some(x=>x.type==="preReleaseVersions"&&x.attributes.version==="1.0.0"));
 const details=await request("apps/"+app.appId+"/betaAppReviewDetail");const d=details.data.attributes;assert(d.demoAccountRequired&&d.demoAccountName&&d.demoAccountPassword&&d.notes,"Reviewer access details required");
 const existing=await request("builds/"+build.id+"/betaAppReviewSubmission",undefined,true);
 let submitted=existing?.data;
 if(!["WAITING_FOR_REVIEW","IN_REVIEW","APPROVED"].includes(submitted?.attributes?.betaReviewState)) submitted=(await request("betaAppReviewSubmissions",{data:{type:"betaAppReviewSubmissions",relationships:{build:{data:{type:"builds",id:build.id}}}}})).data;
 fs.mkdirSync("artifacts",{recursive:true});const result={app:"DocDetailing",version:"1.0.0",build:"5",state:submitted.attributes.betaReviewState,submissionId:submitted.id,submittedDate:submitted.attributes.submittedDate,publicRelease:false,reviewCredentialsPresent:true};fs.writeFileSync("artifacts/beta-submission-result.json",JSON.stringify(result,null,2));console.log(JSON.stringify({build:"5",state:result.state,publicRelease:false}));
} catch {console.error("Controlled beta submission stopped; no credentials or review notes are logged.");process.exitCode=1;}
