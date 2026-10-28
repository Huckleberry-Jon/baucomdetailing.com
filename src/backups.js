import { backup, DatabaseSync } from "node:sqlite";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  unlink,
  rename,
  access,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  createHash,
} from "node:crypto";
import { requireThat } from "./security.js";
const derive = (pass, salt) => {
  requireThat(
    typeof pass === "string" && pass.length >= 20,
    "Backup passphrase must contain at least 20 characters",
  );
  return scryptSync(pass, salt, 32, {
    N: 65536,
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024,
  });
};
async function checksum(path) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest("hex");
}
function verifyDatabase(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    requireThat(
      db.prepare("PRAGMA integrity_check").get().integrity_check === "ok",
      "Backup database integrity check failed",
    );
    requireThat(
      db.prepare("PRAGMA foreign_key_check").all().length === 0,
      "Backup foreign key check failed",
    );
    requireThat(
      db
        .prepare(
          "SELECT count(*) n FROM sqlite_master WHERE type='table' AND name IN ('bookings','customers','businesses','media','migrations')",
        )
        .get().n === 5,
      "Backup missing required application tables",
    );
    return db
      .prepare("SELECT name FROM migrations ORDER BY name")
      .all()
      .map((r) => r.name);
  } finally {
    db.close();
  }
}
export async function createBackup(db, directory, passphrase) {
  const salt = randomBytes(16),
    iv = randomBytes(12),
    key = derive(passphrase, salt),
    out = resolve(directory);
  await mkdir(out);
  const snapshot = join(out, ".snapshot.sqlite"),
    encrypted = join(out, "database.enc");
  try {
    await backup(db, snapshot);
    const migrations = verifyDatabase(snapshot),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    await pipeline(
      createReadStream(snapshot),
      cipher,
      createWriteStream(encrypted, { flags: "wx", mode: 0o600 }),
    );
    const manifest = {
      format: "docdetailing-backup-v1",
      createdAt: new Date().toISOString(),
      algorithm: "aes-256-gcm",
      kdf: "scrypt-N65536-r8-p1",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      sha256: await checksum(encrypted),
      migrations,
    };
    await writeFile(
      join(out, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    return manifest;
  } finally {
    key.fill(0);
    await unlink(snapshot).catch(() => {});
  }
}
export async function restoreBackup(directory, targetDirectory, passphrase) {
  const input = resolve(directory),
    target = resolve(targetDirectory);
  requireThat(input !== target, "Restore into a new separate directory");
  const manifest = JSON.parse(
    await readFile(join(input, "manifest.json"), "utf8"),
  );
  requireThat(
    manifest.format === "docdetailing-backup-v1" &&
      manifest.algorithm === "aes-256-gcm" &&
      manifest.kdf === "scrypt-N65536-r8-p1",
    "Unsupported backup format",
  );
  for (const [name, len] of [
    ["salt", 16],
    ["iv", 12],
    ["tag", 16],
  ])
    requireThat(
      typeof manifest[name] === "string" &&
        Buffer.from(manifest[name], "base64").length === len,
      "Invalid backup metadata",
    );
  const encrypted = join(input, "database.enc");
  requireThat(
    (await checksum(encrypted)) === manifest.sha256,
    "Backup checksum mismatch",
  );
  const key = derive(passphrase, Buffer.from(manifest.salt, "base64"));
  await mkdir(target);
  const staging = join(target, ".restore-incomplete.sqlite"),
    final = join(target, "docdetailing.sqlite");
  let restored = false;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(manifest.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(manifest.tag, "base64"));
    await pipeline(
      createReadStream(encrypted),
      decipher,
      createWriteStream(staging, { flags: "wx", mode: 0o600 }),
    );
    verifyDatabase(staging);
    const db = new DatabaseSync(staging);
    try {
      db.exec(
        "PRAGMA foreign_keys=ON; BEGIN IMMEDIATE; DELETE FROM sessions; UPDATE subscriptions SET active=0;",
      );
      db.prepare(
        "UPDATE deliveries SET status='recovery_hold',claimed_until=0,last_error='Review after restoration before retrying' WHERE status IN ('queued','retry','blocked','sending')",
      ).run();
      db.prepare(
        "INSERT OR REPLACE INTO private_keys VALUES('delivery-recovery-hold','1')",
      ).run();
      db.prepare(
        "INSERT OR REPLACE INTO private_keys VALUES('delivery-recovery-cutoff',?)",
      ).run(String(Date.now()));
      db.exec("COMMIT;");
    } finally {
      db.close();
    }
    await rename(staging, final);
    restored = true;
    return {
      databasePath: final,
      deliveryPaused: true,
      migrations: manifest.migrations,
    };
  } finally {
    key.fill(0);
    if (!restored) await unlink(staging).catch(() => {});
  }
}
