import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { verifyExportedIPA } from "./verify-ios-ipa.mjs";
import { lookupAppleApp } from "./apple-upload-preflight.mjs";
const approval = process.env.APPROVED_BUILD_UPLOAD;
if (!approval) { console.log("Archive only: Apple upload disabled."); process.exit(0); }
let stage = "approval validation";
try {
  assert.equal(process.env.CM_BRANCH,"main");
  assert.equal(approval,"upload-build-5");
  assert.equal(process.env.APP_BUILD_NUMBER,"5");
  stage = "fresh IPA signing verification";
  const file = "apps/docdetailing_owner/build/ios/ipa/docdetailing_owner.ipa";
  const signing = verifyExportedIPA(file);
  stage = "Apple app authentication";
  const app = await lookupAppleApp({keyId:process.env.APP_STORE_CONNECT_KEY_IDENTIFIER,issuerId:process.env.APP_STORE_CONNECT_ISSUER_ID,privateKey:process.env.APP_STORE_CONNECT_PRIVATE_KEY});
  fs.writeFileSync("artifacts/pre-upload-verification.json",JSON.stringify({signing,app},null,2));
  const auth = ["APP_STORE_CONNECT_KEY_IDENTIFIER","APP_STORE_CONNECT_ISSUER_ID","APP_STORE_CONNECT_PRIVATE_KEY"];
  const env = Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith("APP_STORE_CONNECT_") || auth.includes(k)));
  stage = "Apple package validation and upload";
  execFileSync("app-store-connect",["publish","--path",file,"--enable-package-validation","--altool-retries","1"],{env,stdio:"inherit"});
  fs.writeFileSync("artifacts/upload-result.json",JSON.stringify({version:"1.0.0",build:"5",sha256:signing.sha256,uploadCommandSucceeded:true,reviewSubmitted:false,testersInvited:false,publicRelease:false},null,2));
} catch {
  console.error("Controlled upload stopped at "+stage+". No credential values are printed by this script.");
  process.exitCode=1;
}
