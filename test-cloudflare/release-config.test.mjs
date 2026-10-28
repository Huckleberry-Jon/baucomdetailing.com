import test from "node:test";
import assert from "node:assert/strict";
import { candidate } from "../scripts/prepare-cloudflare-release.mjs";
const env = {
  DOCDETAILING_TARGET: "staging",
  DOCDETAILING_ACCOUNT_ID: "a".repeat(32),
  DOCDETAILING_D1_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  DOCDETAILING_OWNER_EMAIL_VERIFIED: "true",
  DOCDETAILING_OWNER_EMAIL: "owner@example.invalid",
  DOCDETAILING_ORIGIN: "https://docdetailing-preview.synthetic.workers.dev",
};
test("offline release candidate stays gated, isolated and complimentary without enabling communications", () => {
  const a = candidate(env),
    b = candidate({
      ...env,
      DOCDETAILING_TARGET: "production",
      DOCDETAILING_ORIGIN: "https://baucomdetailing.com",
    });
  assert.equal(a.config.vars.SITE_OPEN, "false");
  assert.equal(a.config.vars.COMMUNICATIONS_MODE, "disabled");
  assert.equal(a.config.vars.ALLOW_PUSH_SEND, "false");
  assert.equal(a.config.vars.ALLOW_EMAIL_SEND, "false");
  assert.notEqual(a.secrets.password, b.secrets.password);
  assert.notEqual(a.secrets.linkKey, b.secrets.linkKey);
  assert.notEqual(
    a.config.d1_databases[0].database_name,
    b.config.d1_databases[0].database_name,
  );
  assert.notEqual(
    a.config.r2_buckets[0].bucket_name,
    b.config.r2_buckets[0].bucket_name,
  );
  assert.equal(a.config.routes.length, 0);
  assert.equal(b.config.workers_dev, false);
  assert.match(a.sql, /complimentary_test/);
  assert.ok(!a.sql.includes(a.secrets.password));
  assert.throws(() =>
    candidate({ ...env, DOCDETAILING_OWNER_EMAIL_VERIFIED: "false" }),
  );
  assert.throws(() =>
    candidate({ ...env, DOCDETAILING_ORIGIN: "https://baucomdetailing.com" }),
  );
  assert.throws(() =>
    candidate({
      ...env,
      DOCDETAILING_TARGET: "production",
      DOCDETAILING_ORIGIN: "https://other.invalid",
    }),
  );
});
