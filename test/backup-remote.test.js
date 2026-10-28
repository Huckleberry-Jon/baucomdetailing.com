import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { fixture, requestInput } from "./helpers.js";
import { createBackup } from "../src/backups.js";
import {
  uploadBackup,
  downloadAndRestore,
  remoteBackupConfig,
} from "../src/backup-remote.js";
import { openDatabase } from "../src/db.js";
test("remote adapter defaults to no upload, sends ciphertext only, and read-back restores from retrieved bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "docdetailing-remote-")),
    objects = new Map(),
    config = {
      bucket: "synthetic-test-bucket",
      prefix: "docdetailing/device-test/",
      allowUpload: false,
    },
    pass = "Synthetic remote recovery passphrase";
  const { db, s } = fixture();
  let restored;
  try {
    const booking = s.create(requestInput(), "remote");
    const local = join(root, "encrypted");
    await createBackup(db, local, pass);
    let calls = 0;
    const client = {
      send: async (command) => {
        calls++;
        const input = command.input;
        if (command.constructor.name === "PutObjectCommand") {
          assert.equal(input.IfNoneMatch, "*");
          assert.equal(input.ServerSideEncryption, "AES256");
          assert.ok(
            input.Key.endsWith("/database.enc") ||
              input.Key.endsWith("/manifest.json"),
          );
          const chunks = [];
          for await (const chunk of input.Body instanceof Uint8Array
            ? [input.Body]
            : input.Body)
            chunks.push(Buffer.from(chunk));
          objects.set(input.Key, Buffer.concat(chunks));
          return {};
        }
        return { Body: Readable.from([objects.get(input.Key)]) };
      },
    };
    await assert.rejects(
      uploadBackup(client, config, local, "backup-test"),
      /disabled/,
    );
    assert.equal(calls, 0);
    config.allowUpload = true;
    await uploadBackup(client, config, local, "backup-test");
    assert.equal(objects.size, 2);
    assert.deepEqual(
      objects.get(config.prefix + "backup-test/database.enc"),
      await readFile(join(local, "database.enc")),
    );
    const result = await downloadAndRestore(
      client,
      config,
      "backup-test",
      join(root, "downloaded"),
      join(root, "restored"),
      pass,
    );
    restored = openDatabase(result.databasePath);
    assert.equal(
      restored.prepare("SELECT status FROM bookings WHERE id=?").get(booking.id)
        .status,
      "pending",
    );
    assert.equal(result.deliveryPaused, true);
    assert.throws(
      () =>
        remoteBackupConfig({
          DEV_BACKUP_BUCKET: "test-bucket",
          DEV_BACKUP_REGION: "us-east-1",
          AWS_ACCESS_KEY_ID: "production",
          AWS_SECRET_ACCESS_KEY: "production",
        }),
      /separate/,
    );
  } finally {
    restored?.close();
    db.close();
    assert.ok(
      resolve(root).startsWith(
        resolve(tmpdir()) + sep + "docdetailing-remote-",
      ),
    );
    await rm(root, { recursive: true, maxRetries: 5, retryDelay: 100 });
  }
});
