import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { verifyExportedIPA } from "./verify-ios-ipa.mjs";
import { lookupAppleApp } from "./apple-upload-preflight.mjs";

const expectedSHA = "d866aa41453bc070dacd3feb71951e7c193cc1bb1b6e953dda6906bfde0c477c";
let stage = "approval validation";
try {
  assert.equal(process.env.CM_BRANCH, "main");
  assert.equal(process.env.APPROVED_BUILD_UPLOAD, "upload-build-4");
  const url = new URL(process.env.APPROVED_IPA_URL);
  assert.equal(url.origin, "https://api.codemagic.io");
  assert(/^\/artifacts\/[a-f0-9-]+\/[a-f0-9-]+\/docdetailing_owner\.ipa$/.test(url.pathname));
  assert(!url.username && !url.password && !url.search && !url.hash);
  fs.mkdirSync("artifacts", {recursive:true});
  stage = "approved artifact download";
  let target = url, response;
  for (let hop = 0; hop < 5; hop++) {
    assert(target.protocol === "https:" && !target.username && !target.password);
    assert(["codemagic.io", "amazonaws.com", "googleapis.com"].some(host => target.hostname === host || target.hostname.endsWith("."+host)));
    response = await fetch(target, {redirect:"manual",signal:AbortSignal.timeout(120000)});
    if (![301,302,303,307,308].includes(response.status)) break;
    target = new URL(response.headers.get("location"),target);
  }
  assert(response.ok, "Approved artifact download failed");
  stage = "approved artifact checksum";
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, 22505215, "Unexpected approved IPA size");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedSHA, "Approved IPA checksum mismatch");
  const file = "artifacts/approved-build-4.ipa";
  fs.writeFileSync(file,bytes);
  process.env.APP_BUILD_NUMBER = "4";
  stage = "exported IPA signing verification";
  const signing = verifyExportedIPA(file);
  stage = "Apple app authentication";
  const app = await lookupAppleApp({keyId:process.env.APP_STORE_CONNECT_KEY_IDENTIFIER,issuerId:process.env.APP_STORE_CONNECT_ISSUER_ID,privateKey:process.env.APP_STORE_CONNECT_PRIVATE_KEY});
  fs.writeFileSync("artifacts/pre-upload-verification.json",JSON.stringify({signing,app},null,2));
  // Discard inherited publishing options; upload only. No review/group/release flags.
  const authNames = ["APP_STORE_CONNECT_KEY_IDENTIFIER","APP_STORE_CONNECT_ISSUER_ID","APP_STORE_CONNECT_PRIVATE_KEY"];
  const env = Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith("APP_STORE_CONNECT_") || authNames.includes(k)));
  stage = "Apple package validation and upload";
  execFileSync("app-store-connect", ["publish", "--path", file, "--enable-package-validation", "--altool-retries", "1"], {env,stdio:"inherit"});
  fs.writeFileSync("artifacts/upload-result.json", JSON.stringify({version:"1.0.0",build:"4",sha256:expectedSHA,uploadCommandSucceeded:true,reviewSubmitted:false,testersInvited:false,publicRelease:false},null,2));
} catch {
  console.error("Controlled upload stopped at " + stage + ". Credentials and artifact URLs are not printed by this script.");
  process.exitCode=1;
}
