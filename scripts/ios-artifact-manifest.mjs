import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const files = [];
function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(p);
    else if (entry.isFile() && !p.endsWith("artifact-manifest.json"))
      files.push({
        path: p.replaceAll("\\", "/"),
        bytes: fs.statSync(p).size,
        sha256: createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
      });
  }
}
collect("artifacts");
if (fs.existsSync("apps/docdetailing_owner/build/ios/ipa"))
  collect("apps/docdetailing_owner/build/ios/ipa");
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  version: "1.0.0",
  build: process.env.APP_BUILD_NUMBER,
  appleUpload: false,
  files,
};
fs.writeFileSync(
  "artifacts/artifact-manifest.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    source: report.source,
    artifactCount: files.length,
    appleUpload: false,
  }),
);
