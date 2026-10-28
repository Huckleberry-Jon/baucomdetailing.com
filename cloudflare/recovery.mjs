/* Node-side recovery coordinator. Never bundled into the request Worker. */
import {
  randomUUID,
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import { requireThat } from "../src/security.js";
export const TABLES = [
  "businesses",
  "tenant_domains",
  "services",
  "customers",
  "vehicles",
  "bookings",
  "history",
  "notifications",
  "owners",
  "sessions",
  "subscriptions",
  "deliveries",
  "delivery_attempts",
  "webhook_receipts",
  "worker_errors",
  "rate_limits",
  "schedule_blocks",
  "jobs",
  "media",
  "website_photos",
  "reviews",
  "review_moderation",
  "audit_events",
  "backup_runs",
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function key(pass, salt) {
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
}
function encrypt(bytes, k, aad) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", k, iv);
  c.setAAD(Buffer.from(aad));
  const data = Buffer.concat([c.update(bytes), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]);
}
function decrypt(bytes, k, aad) {
  const b = Buffer.from(bytes);
  requireThat(b.length >= 28, "Invalid encrypted backup");
  const d = createDecipheriv("aes-256-gcm", k, b.subarray(0, 12));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]);
}
export async function snapshot(db) {
  const results = await db.batch(
    TABLES.map((t) => db.prepare('SELECT * FROM "' + t + '"')),
  );
  return Object.fromEntries(TABLES.map((t, i) => [t, results[i].results]));
}
export async function createCloudBackup({
  db,
  media,
  destination,
  passphrase,
  namespace,
}) {
  requireThat(
    ["local", "staging", "production"].includes(namespace),
    "Explicit source namespace required",
  );
  const id = randomUUID(),
    salt = randomBytes(16),
    k = key(passphrase, salt),
    rows = await snapshot(db),
    files = [],
    keys = new Map();
  for (const table of ["media", "website_photos"])
    for (const row of rows[table])
      for (const field of ["original_key", "preview_key"]) {
        const objectKey = row[field];
        requireThat(
          objectKey.startsWith(namespace + "/" + row.business_id + "/"),
          "Backup media tenant mismatch",
        );
        keys.set(objectKey, field === "original_key" ? row.sha256 : null);
      }
  for (const [objectKey, expected] of keys) {
    const object = await media.get(objectKey);
    requireThat(object, "Backup referenced media is missing");
    const bytes = Buffer.from(await object.arrayBuffer()),
      sha = digest(bytes);
    requireThat(
      !expected || sha === expected,
      "Original media checksum mismatch",
    );
    const name = "media-" + files.length + ".enc";
    const sealed = encrypt(bytes, k, id + "/" + name);
    await destination.put(id + "/" + name, sealed);
    requireThat(
      digest(await destination.get(id + "/" + name)) === digest(sealed),
      "Encrypted media read-back failed",
    );
    files.push({ key: objectKey, name, sha, bytes: bytes.length });
  }
  const manifest = {
    format: "docdetailing-cloud-backup",
    version: 1,
    id,
    createdAt: Date.now(),
    namespace,
    rows,
    files,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const sealedManifest = encrypt(manifestBytes, k, id + "/manifest.enc");
  await destination.put(id + "/manifest.enc", sealedManifest);
  requireThat(
    digest(await destination.get(id + "/manifest.enc")) ===
      digest(sealedManifest),
    "Encrypted manifest read-back failed",
  );
  // Completion marker written last; never contains customer data or credentials.
  await destination.put(
    id + "/index.json",
    Buffer.from(
      JSON.stringify({
        format: "docdetailing-cloud-backup",
        version: 1,
        id,
        salt: salt.toString("base64"),
      }),
    ),
  );
  return { id, objects: files.length, records: rows.bookings.length };
}
export async function restoreCloudBackup({
  db,
  media,
  source,
  id,
  passphrase,
  namespace,
}) {
  requireThat(/^[a-f0-9-]{36}$/.test(id), "Invalid backup ID");
  requireThat(
    ["local", "staging"].includes(namespace),
    "Restore to isolated local/staging only",
  );
  const index = JSON.parse(
    Buffer.from(await source.get(id + "/index.json")).toString(),
  );
  requireThat(
    index.id === id &&
      index.version === 1 &&
      index.format === "docdetailing-cloud-backup",
    "Invalid backup format",
  );
  const k = key(passphrase, Buffer.from(index.salt, "base64")),
    m = JSON.parse(
      decrypt(
        await source.get(id + "/manifest.enc"),
        k,
        id + "/manifest.enc",
      ).toString(),
    );
  requireThat(
    m.id === id &&
      m.version === 1 &&
      TABLES.every((t) => Array.isArray(m.rows[t])),
    "Invalid recovery manifest",
  );
  // Authenticate every byte BEFORE touching target storage/database.
  for (const f of m.files) {
    requireThat(
      /^media-\d+\.enc$/.test(f.name) && f.key.startsWith(m.namespace + "/"),
      "Invalid media manifest",
    );
    const bytes = decrypt(
      await source.get(id + "/" + f.name),
      k,
      id + "/" + f.name,
    );
    requireThat(
      bytes.length === f.bytes && digest(bytes) === f.sha,
      "Backup media checksum mismatch",
    );
  }
  for (const table of TABLES)
    requireThat(
      (await db.prepare('SELECT count(*) n FROM "' + table + '"').first()).n ===
        0,
      "Restore requires a new empty target database",
    );
  requireThat(
    (await media.list({ limit: 1 })).objects.length === 0,
    "Restore requires a new empty target media bucket",
  );
  const mapKey = (value) => namespace + value.slice(m.namespace.length);
  for (const f of m.files) {
    const bytes = decrypt(
      await source.get(id + "/" + f.name),
      k,
      id + "/" + f.name,
    );
    await media.put(mapKey(f.key), bytes);
  }
  const statements = [];
  for (const table of TABLES) {
    if (["sessions", "rate_limits"].includes(table)) continue;
    for (const original of m.rows[table]) {
      const row = { ...original };
      if (table === "businesses") {
        row.delivery_hold = 1;
        row.revision += 1;
      }
      if (table === "subscriptions") row.active = 0;
      if (table === "notifications") row.enqueued_at = Date.now();
      if (table === "deliveries") {
        row.status = "recovery_hold";
        row.claimed_until = 0;
        row.claim_token = null;
      }
      if (table === "tenant_domains") continue; // Never activate production hostnames in recovery.
      if (["media", "website_photos"].includes(table)) {
        row.original_key = mapKey(row.original_key);
        row.preview_key = mapKey(row.preview_key);
      }
      const columns = Object.keys(row);
      requireThat(
        columns.every((c) => /^[a-z_][a-z0-9_]*$/.test(c)),
        "Invalid recovery column",
      );
      statements.push(
        db
          .prepare(
            'INSERT INTO "' +
              table +
              '" (' +
              columns.map((c) => '"' + c + '"').join(",") +
              ") VALUES (" +
              columns.map(() => "?").join(",") +
              ")",
          )
          .bind(...columns.map((c) => row[c])),
      );
    }
  }
  // One transaction keeps small initial restores atomic; large restores need reviewed chunking.
  requireThat(
    statements.length <= 10000,
    "Recovery exceeds reviewed single-batch size; use isolated bulk recovery procedure",
  );
  await db.batch(statements);
  requireThat(
    (await db.prepare("PRAGMA foreign_key_check").all()).results.length === 0,
    "Restored foreign key check failed",
  );
  return {
    id,
    bookings: m.rows.bookings.length,
    mediaObjects: m.files.length,
    deliveryHold: true,
    sessionsRevoked: true,
    domainsDetached: true,
  };
}
