import { passwordHash } from "../src/security.js";
import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { runtimeConfig, deliveryBlockReason } from "../src/runtime-config.js";
import { createApplication } from "../src/server.js";
import { fixture } from "./helpers.js";
import {
  HostedBackupRunner,
  hostedBackupSettings,
} from "../src/hosted-backups.js";
const base = {
  APP_ENV: "production",
  PROD_ORIGIN: "https://approved-preview.onrender.com",
  PROD_DATA_DIR: join(tmpdir(), "docdetailing-hosted-volume"),
  PROD_SITE_OPEN: "false",
  PROD_PREVIEW_PASSWORD_HASH: passwordHash("synthetic hosted preview only"),
  PROD_PREVIEW_SIGNING_KEY: "a".repeat(43),
  VAPID_PRIVATE_KEY: "do-not-inherit",
  DEV_RESEND_API_KEY: "do-not-inherit",
};
test("production defaults to a closed preview and never inherits local/device credentials", () => {
  const config = runtimeConfig(base);
  assert.equal(config.bindHost, "0.0.0.0");
  assert.equal(config.siteOpen, false);
  assert.ok(config.accessGate);
  assert.equal(config.emailApiKey, undefined);
  assert.equal(config.vapidPrivateKey, undefined);
  assert.equal(config.deliveryPolicy.emailEnabled, false);
  assert.match(config.databasePath, /production.sqlite$/);
  assert.throws(
    () => runtimeConfig({ ...base, PROD_DATA_DIR: "data" }),
    /absolute/,
  );
  assert.throws(
    () => runtimeConfig({ ...base, PROD_PREVIEW_SIGNING_KEY: "" }),
    /preview/,
  );
  assert.throws(
    () => runtimeConfig({ ...base, PROD_ALLOW_EMAIL_SEND: "true" }),
    /Disabled/,
  );
  assert.throws(
    () => runtimeConfig({ ...base, PROD_COMMUNICATIONS_MODE: "live" }),
    /public/,
  );
  const testOnly = runtimeConfig({
    ...base,
    PROD_COMMUNICATIONS_MODE: "test-only",
    PROD_ALLOW_EMAIL_SEND: "true",
    PROD_TEST_EMAIL_RECIPIENTS: "approved@example.invalid",
  });
  assert.ok(deliveryBlockReason(testOnly, false, "other@example.invalid"));
  assert.equal(
    deliveryBlockReason(testOnly, false, "approved@example.invalid"),
    null,
  );
});
test("hosted health is minimal and alias GET redirects without exposing private data", async (t) => {
  const { db } = fixture(),
    config = {
      ...runtimeConfig(base),
      hostAliases: ["www.baucomdetailing.com"],
    },
    app = createApplication(db, config);
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    db.close();
  });
  const request = (path, host) =>
    new Promise((resolve, reject) => {
      http
        .get(
          {
            host: "127.0.0.1",
            port: app.server.address().port,
            path,
            headers: { Host: host },
          },
          (res) => {
            let body = "";
            res.on("data", (b) => (body += b));
            res.on("end", () =>
              resolve({ status: res.statusCode, body, headers: res.headers }),
            );
          },
        )
        .on("error", reject);
    });
  const health = await request("/healthz", "internal-health");
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), { status: "ok" });
  const gated = await request("/api/catalog", "approved-preview.onrender.com");
  assert.equal(gated.status, 401);
  const alias = await request("/packages?x=1", "www.baucomdetailing.com");
  assert.equal(alias.status, 308);
  assert.equal(
    alias.headers.location,
    "https://approved-preview.onrender.com/packages?x=1",
  );
});
test("hosted backups are off by default and failed uploads retain state without losing bookings", async () => {
  const { db, s } = fixture();
  assert.equal(hostedBackupSettings({}, runtimeConfig(base)).enabled, false);
  assert.throws(
    () =>
      hostedBackupSettings(
        { PROD_BACKUPS_ENABLED: "true" },
        runtimeConfig(base),
      ),
    /Approve/,
  );
  let snapshots = 0;
  const runner = new HostedBackupRunner(
    db,
    {
      enabled: true,
      root: join(tmpdir(), "docdetailing-hosted-backup-test"),
      passphrase: "synthetic test only",
      remote: {},
    },
    {
      create: async () => {
        snapshots++;
      },
      client: () => ({ destroy() {} }),
      upload: async () => {
        throw Error("synthetic failure");
      },
    },
  );
  await runner.tick();
  assert.equal(
    db.prepare("SELECT status FROM backup_runs").get().status,
    "failed",
  );
  await runner.tick();
  assert.equal(snapshots, 1);
  assert.equal(s.catalog().length, 10);
  db.close();
});

test("production refuses an ephemeral data directory and accepts only a distinct mounted device", async () => {
  const { verifyPersistentMount } = await import(
      "../src/production-storage.js"
    ),
    config = runtimeConfig(base);
  assert.throws(
    () =>
      verifyPersistentMount(
        config,
        () => ({ isDirectory: () => true, dev: 1 }),
        "linux",
      ),
    /persistent volume/,
  );
  assert.doesNotThrow(() =>
    verifyPersistentMount(
      config,
      (path) => ({ isDirectory: () => true, dev: path === "/" ? 1 : 2 }),
      "linux",
    ),
  );
});
