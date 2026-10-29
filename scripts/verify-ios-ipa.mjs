import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export function verifyExportedIPA(file) {
  assert.equal(
    process.platform,
    "darwin",
    "Exported IPA signature inspection requires macOS security/codesign",
  );
  const ipa = path.resolve(file);
  assert(fs.statSync(ipa).isFile(), "IPA file required");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "docdetailing-ipa-"));
  try {
    execFileSync("ditto", ["-x", "-k", ipa, temp], {
      maxBuffer: 8 * 1024 * 1024,
    });
    const payload = path.join(temp, "Payload");
    const apps = fs.readdirSync(payload).filter((n) => n.endsWith(".app"));
    assert.deepEqual(
      apps,
      ["Runner.app"],
      "Exactly the expected exported app is required",
    );
    const wrapper = path.join(temp, "verification.xcarchive"),
      target = path.join(wrapper, "Products", "Applications");
    fs.mkdirSync(target, { recursive: true });
    fs.renameSync(
      path.join(payload, "Runner.app"),
      path.join(target, "Runner.app"),
    );
    const raw = execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("./verify-ios-archive.mjs", import.meta.url)),
        wrapper,
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    const report = JSON.parse(raw);
    return {
      ...report,
      artifact: "exported-ipa",
      bytes: fs.statSync(ipa).size,
      sha256: createHash("sha256").update(fs.readFileSync(ipa)).digest("hex"),
    };
  } finally {
    // Only remove the fresh extraction directory created above.
    assert(
      path.dirname(temp) === os.tmpdir() &&
        path.basename(temp).startsWith("docdetailing-ipa-"),
    );
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    assert(
      process.argv[2],
      "Usage: node scripts/verify-ios-ipa.mjs <exported.ipa>",
    );
    console.log(JSON.stringify(verifyExportedIPA(process.argv[2]), null, 2));
  } catch (error) {
    console.error("IPA verification failed: " + error.message);
    process.exitCode = 1;
  }
}
