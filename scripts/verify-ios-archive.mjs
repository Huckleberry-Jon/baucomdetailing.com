import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const bundle = "com.docincorporated.docdetailing";
const team = "UDDPKPR3CJ";
export function validateArchiveMetadata({
  info,
  profile,
  entitlements,
  signerDer,
  now = new Date(),
  requirePush = true,
}) {
  assert.equal(info.CFBundleIdentifier, bundle, "Wrong application bundle");
  assert.equal(
    info.CFBundleShortVersionString,
    "1.0",
    "Wrong marketing version",
  );
  assert.match(
    String(info.CFBundleVersion),
    /^[1-9][0-9]*$/,
    "Positive build number required",
  );
  assert.deepEqual(profile.TeamIdentifier, [team], "Wrong profile team");
  assert(profile.UUID && profile.Name, "Profile identity is missing");
  assert(new Date(profile.ExpirationDate) > now, "Profile expired");
  assert(new Date(profile.CreationDate) <= now, "Profile is not yet valid");
  assert(
    !profile.ProvisionedDevices && !profile.ProvisionsAllDevices,
    "App Store profile required",
  );
  for (const e of [profile.Entitlements, entitlements]) {
    assert.equal(
      e["application-identifier"],
      team + "." + bundle,
      "Explicit app ID mismatch",
    );
    assert.equal(
      e["com.apple.developer.team-identifier"],
      team,
      "Entitlement team mismatch",
    );
    assert.equal(e["get-task-allow"], false, "Debug entitlement forbidden");
    if (requirePush)
      assert.equal(
        e["aps-environment"],
        "production",
        "Production APNs entitlement missing",
      );
  }
  assert(
    profile.DeveloperCertificates.some((cert) =>
      Buffer.from(cert, "base64").equals(signerDer),
    ),
    "Archive signer is absent from profile",
  );
  return {
    bundle,
    team,
    version: info.CFBundleShortVersionString,
    build: info.CFBundleVersion,
    profileName: profile.Name,
    profileUUID: profile.UUID,
    expires: profile.ExpirationDate,
    push: entitlements["aps-environment"] ?? "missing",
  };
}

function verify(archive) {
  assert.equal(
    process.platform,
    "darwin",
    "Signed archive inspection requires macOS security/codesign",
  );
  const apps = path.join(path.resolve(archive), "Products/Applications");
  const names = fs.readdirSync(apps).filter((n) => n.endsWith(".app"));
  assert.equal(names.length, 1, "Exactly one application required");
  const app = path.join(apps, names[0]);
  const run = (cmd, args) =>
    execFileSync(cmd, args, { maxBuffer: 8 * 1024 * 1024 });
  const plist = (bytes) =>
    JSON.parse(
      execFileSync(
        "python3",
        [fileURLToPath(new URL("./decode-apple-plist.py", import.meta.url))],
        { input: bytes },
      ),
    );
  run("codesign", ["--verify", "--deep", "--strict", app]);
  const info = plist(fs.readFileSync(path.join(app, "Info.plist")));
  const profile = plist(
    run("security", [
      "cms",
      "-D",
      "-i",
      path.join(app, "embedded.mobileprovision"),
    ]),
  );
  const entitlements = plist(
    run("codesign", ["-d", "--entitlements", ":-", app]),
  );
  // Certificate extraction is confined to a temporary directory; no key is exported.
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "docdetailing-signature-"),
  );
  const prefix = path.join(temp, "signer");
  try {
    run("codesign", ["-d", "--extract-certificates", prefix, app]);
    const signerDer = fs.readFileSync(prefix + "0"),
      cert = new X509Certificate(signerDer);
    assert(
      new Date(cert.validFrom) <= new Date() &&
        new Date(cert.validTo) > new Date(),
      "Signing certificate expired or not yet valid",
    );
    assert.equal(
      cert.fingerprint256,
      "D3:28:70:B5:2C:DE:BF:F1:B6:87:74:5E:9D:57:63:F0:04:B8:0D:35:7D:0B:62:7B:41:83:63:0D:F4:2F:79:1A",
      "Unexpected certificate; do not replace signing assets",
    );
    assert.equal(
      profile.UUID,
      "389636fe-c1d0-46f9-a477-dcb2f464d855",
      "Unexpected profile",
    );
    const report = validateArchiveMetadata({
      info,
      profile,
      entitlements,
      signerDer,
      requirePush: !process.argv.includes("--signing-only"),
    });
    console.log(
      JSON.stringify(
        {
          ...report,
          certificateSerial: cert.serialNumber,
          certificateSHA256: cert.fingerprint256,
          certificateSubject: cert.subject,
          certificateExpires: cert.validTo,
        },
        null,
        2,
      ),
    );
  } finally {
    for (const name of fs.readdirSync(temp))
      fs.unlinkSync(path.join(temp, name));
    fs.rmdirSync(temp);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    assert(
      process.argv[2],
      "Usage: node scripts/verify-ios-archive.mjs <Runner.xcarchive>",
    );
    verify(process.argv[2]);
  } catch (error) {
    console.error("Archive verification failed: " + error.message);
    process.exitCode = 1;
  }
}
