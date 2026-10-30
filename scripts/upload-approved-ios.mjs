import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { verifyExportedIPA } from "./verify-ios-ipa.mjs";
import { lookupAppleApp } from "./apple-upload-preflight.mjs";

const expectedSHA = "d866aa41453bc070dacd3feb71951e7c193cc1bb1b6e953dda6906bfde0c477c";
try {
  assert.equal(process.env.CM_BRANCH, "main");
  assert.equal(process.env.APPROVED_BUILD_UPLOAD, "upload-build-4");
  const url = new URL(process.env.APPROVED_IPA_URL);
  assert.equal(url.origin, "https://api.codemagic.io");
  assert(/^\/artifacts\/[a-f0-9-]+\/[a-f0-9-]+\/docdetailing_owner\.ipa$/.test(url.pathname));
  assert(!url.username && !url.password && !url.search && !url.hash);
  fs.mkdirSync("artifacts", {recursive:true});
  const response = await fetch(url, {redirect:"error",signal:AbortSignal.timeout(120000)});
  assert(response.ok, "Approved artifact download failed");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, 22505215, "Unexpected approved IPA size");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedSHA, "Approved IPA checksum mismatch");
  const file = "artifacts/approved-build-4.ipa";
  fs.writeFileSync(file,bytes);
  process.env.APP_BUILD_NUMBER = "4";
  const signing = verifyExportedIPA(file);
  const app = await lookupAppleApp({keyId:process.env.APP_STORE_CONNECT_KEY_IDENTIFIER,issuerId:process.env.APP_STORE_CONNECT_ISSUER_ID,privateKey:process.env.APP_STORE_CONNECT_PRIVATE_KEY});
  fs.writeFileSync("artifacts/pre-upload-verification.json",JSON.stringify({signing,app},null,2));
  // Discard inherited publishing options; upload only. No review/group/release flags.
  const authNames = ["APP_STORE_CONNECT_KEY_IDENTIFIER","APP_STORE_CONNECT_ISSUER_ID","APP_STORE_CONNECT_PRIVATE_KEY"];
  const env = Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith("APP_STORE_CONNECT_") || authNames.includes(k)));
  execFileSync("app-store-connect", ["publish", "--path", file, "--enable-package-validation", "--altool-retries", "1"], {env,stdio:"inherit"});
  fs.writeFileSync("artifacts/upload-result.json", JSON.stringify({version:"1.0.0",build:"4",sha256:expectedSHA,uploadCommandSucceeded:true,reviewSubmitted:false,testersInvited:false,publicRelease:false},null,2));
} catch {
  console.error("Controlled upload stopped. Inspect the verification/provider step; credentials and artifact URLs are not printed by this script.");
  process.exitCode=1;
}
