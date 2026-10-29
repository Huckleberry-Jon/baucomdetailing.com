import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p) =>
  fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const app = "apps/docdetailing_owner/";
const project = read(app + "ios/Runner.xcodeproj/project.pbxproj");
const ids = [...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map(
  (m) => m[1],
);
assert.equal(ids.length, 6);
assert(
  ids.every((id) =>
    [
      "com.docincorporated.docdetailing",
      "com.docincorporated.docdetailing.RunnerTests",
    ].includes(id),
  ),
);
assert.equal(
  [...project.matchAll(/DEVELOPMENT_TEAM = UDDPKPR3CJ;/g)].length,
  6,
);
assert.match(read(app + "pubspec.yaml"), /^version: 1\.0\.0\+1$/m);
assert.match(
  read(app + "ios/Runner/Info.plist"),
  /<key>CFBundleDisplayName<\/key>\s*<string>DocDetailing<\/string>/,
);
assert.deepEqual(JSON.parse(read(app + "config/staging.json")), {
  DEMO_MODE: false,
  API_ORIGIN:
    "https://docdetailing-site-staging.huckleberryservices.workers.dev",
});
const yaml = read("codemagic.yaml");
assert.equal(yaml, read(app + "codemagic.yaml"));
assert(!/^\s*(publishing|triggering):/m.test(yaml));
assert(yaml.includes("- docfamily_distribution_master_2026_09"));
assert(yaml.includes("- docdetailing_appstore_2026"));
assert(
  !/distribution_type:|bundle_identifier:|fetch-signing-files|certificates create|profiles create|--create|revoke/.test(
    yaml,
  ),
);
assert(yaml.includes("node scripts/verify-ios-archive.mjs"));

for (const flag of [
  "IOS_BUILD_APPROVED",
  "SHARED_BACKEND_ACCEPTED",
  "IOS_SIGNING_APPROVED",
])
  assert(yaml.includes('test "$' + flag + '" = true'));
assert(yaml.includes("--dart-define-from-file=config/staging.json"));
console.log(
  "iOS source preflight passed: registered identity, team, isolated staging origin and manual artifact-only workflow. Signing/Xcode/device verification still required.",
);
