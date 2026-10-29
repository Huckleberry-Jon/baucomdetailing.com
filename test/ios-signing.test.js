import test from "node:test";
import assert from "node:assert/strict";
import { validateArchiveMetadata } from "../scripts/verify-ios-archive.mjs";
const fixture = () => {
  const e = {
    "application-identifier": "UDDPKPR3CJ.com.docincorporated.docdetailing",
    "com.apple.developer.team-identifier": "UDDPKPR3CJ",
    "get-task-allow": false,
    "aps-environment": "production",
  };
  return {
    info: {
      CFBundleIdentifier: "com.docincorporated.docdetailing",
      CFBundleShortVersionString: "1.0.0",
      CFBundleVersion: "1",
    },
    profile: {
      TeamIdentifier: ["UDDPKPR3CJ"],
      UUID: "synthetic-profile",
      Name: "synthetic-only",
      CreationDate: "2026-01-01",
      ExpirationDate: "2027-01-01",
      Entitlements: { ...e },
      DeveloperCertificates: [
        Buffer.from("synthetic-certificate").toString("base64"),
      ],
    },
    entitlements: { ...e },
    signerDer: Buffer.from("synthetic-certificate"),
    now: new Date("2026-10-28T12:00:00Z"),
  };
};
test("archive release policy rejects wrong identity, expired/development profiles, mismatched signer and absent production APNs", () => {
  assert.equal(
    validateArchiveMetadata(fixture()).profileUUID,
    "synthetic-profile",
  );
  const changes = [
    (x) => (x.info.CFBundleShortVersionString = "1.1.0"),
    (x) => (x.info.CFBundleIdentifier = "com.docinvoices.app"),
    (x) => (x.profile.TeamIdentifier = ["OTHER"]),
    (x) => (x.profile.ExpirationDate = "2026-01-01"),
    (x) => (x.profile.ProvisionedDevices = ["device"]),
    (x) => (x.profile.ProvisionsAllDevices = true),
    (x) => (x.entitlements["get-task-allow"] = true),
    (x) => delete x.entitlements["aps-environment"],
    (x) => (x.profile.Entitlements["aps-environment"] = "development"),
    (x) => (x.signerDer = Buffer.from("different-signer")),
  ];
  for (const change of changes) {
    const x = fixture();
    change(x);
    assert.throws(() => validateArchiveMetadata(x));
  }
});
