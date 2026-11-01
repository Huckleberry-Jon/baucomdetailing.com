import test from "node:test";
import assert from "node:assert/strict";
import { launchReadiness } from "../scripts/launch-readiness.mjs";
test("launch readiness rejects staging reuse and never exposes credentials or implies external acceptance", () => {
  const sentinel = "private-synthetic-secret-not-for-output";
  const env = Object.fromEntries(
    [
      "RESEND_API_KEY",
      "EMAIL_FROM",
      "RESEND_WEBHOOK_SECRET",
      "APNS_PRIVATE_KEY",
      "APNS_KEY_ID",
      "BACKUP_PASSPHRASE",
      "CF_D1_EXPORT_TOKEN",
      "R2_READ_ACCESS_KEY_ID",
      "R2_READ_SECRET_ACCESS_KEY",
      "RECOVERY_ENDPOINT",
      "RECOVERY_BUCKET",
      "RECOVERY_ACCESS_KEY_ID",
      "RECOVERY_SECRET_ACCESS_KEY",
    ].map((k) => [k, sentinel]),
  );
  const c = {
    name: "docdetailing-site-production",
    vars: { DATA_NAMESPACE: "production" },
    d1_databases: [{ database_id: "fa3a26b3-d685-444b-bb0b-106c61b21840" }],
    r2_buckets: [{ bucket_name: "docdetailing-production-private" }],
  };
  assert.equal(launchReadiness(c, env).localConfigurationReady, false);
  c.d1_databases[0].database_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const ready = launchReadiness(c, env);
  assert.equal(ready.localConfigurationReady, true);
  assert.ok(ready.requiredAcceptance.length > 0);
  assert.equal(ready.publicationPerformed, false);
  assert.ok(!JSON.stringify(ready).includes(sentinel));
  assert.match(launchReadiness(c, {}).blockers.join(" "), /RESEND_API_KEY/);
});
