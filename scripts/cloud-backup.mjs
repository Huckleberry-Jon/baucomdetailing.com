import { DatabaseSync } from "node:sqlite";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, sep, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createCloudBackup,
  restoreCloudBackup,
} from "../cloudflare/recovery.mjs";
import { requireThat } from "../src/security.js";
export function sqliteAdapter(sqlite) {
  const statement = (sql, args = []) => ({
    sql,
    args,
    bind: (...values) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => ({ meta: sqlite.prepare(sql).run(...args) }),
  });
  return {
    prepare: (sql) => statement(sql),
    batch: async (commands) => {
      sqlite.exec("BEGIN");
      try {
        const rows = commands.map((c) => ({
          results: sqlite.prepare(c.sql).all(...c.args),
        }));
        sqlite.exec("COMMIT");
        return rows;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
export function fileStorage(root) {
  const path = (key) => {
    const p = resolve(root, key);
    requireThat(
      p.startsWith(resolve(root) + sep) && !key.split("/").includes(".."),
      "Storage path outside recovery directory",
    );
    return p;
  };
  return {
    async put(key, bytes) {
      const p = path(key);
      await mkdir(dirname(p), { recursive: true, mode: 0o700 });
      await writeFile(p, bytes, { flag: "wx", mode: 0o600 });
    },
    async get(key) {
      return readFile(path(key));
    },
    async list() {
      return { objects: (await readdir(root)).map((key) => ({ key })) };
    },
  };
}
export function fileMedia(root) {
  const storage = fileStorage(root);
  return {
    ...storage,
    get: async (key) => {
      try {
        const b = await storage.get(key);
        return {
          arrayBuffer: async () =>
            b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        };
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    },
  };
}
function s3Storage(client, bucket) {
  return {
    put: async (key, bytes) =>
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          IfNoneMatch: "*",
        }),
      ),
    get: async (key) =>
      Buffer.from(
        await (
          await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        ).Body.transformToByteArray(),
      ),
  };
}
async function exportSnapshot(env) {
  requireThat(
    /^[a-f0-9]{32}$/.test(env.CF_ACCOUNT_ID ?? "") &&
      /^[a-f0-9-]{36}$/.test(env.CF_D1_DATABASE_ID ?? "") &&
      env.CF_D1_EXPORT_TOKEN,
    "Scoped D1 export configuration required",
  );
  const endpoint =
    "https://api.cloudflare.com/client/v4/accounts/" +
    env.CF_ACCOUNT_ID +
    "/d1/database/" +
    env.CF_D1_DATABASE_ID +
    "/export";
  let bookmark;
  for (let attempt = 0; attempt < 120; attempt++) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.CF_D1_EXPORT_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        output_format: "polling",
        ...(bookmark ? { current_bookmark: bookmark } : {}),
      }),
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    requireThat(response.ok, "D1 snapshot export failed");
    const payload = await response.json();
    requireThat(
      payload.success && payload.result?.status !== "error",
      "D1 snapshot export failed",
    );
    const result = payload.result;
    if (result.status === "complete") {
      const url = new URL(result.result.signed_url);
      requireThat(
        url.protocol === "https:" && !url.username && !url.password,
        "Invalid snapshot download URL",
      );
      const download = await fetch(url, {
        signal: AbortSignal.timeout(60000),
        redirect: "error",
      });
      requireThat(download.ok, "D1 snapshot download failed");
      requireThat(
        Number(download.headers.get("content-length") ?? 0) <=
          150 * 1024 * 1024,
        "Snapshot exceeds reviewed recovery memory budget",
      );
      const reader = download.body.getReader(),
        parts = [];
      let size = 0;
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > 150 * 1024 * 1024) {
          await reader.cancel();
          throw Error("Snapshot exceeds reviewed recovery memory budget");
        }
        parts.push(Buffer.from(r.value));
      }
      const sqlite = new DatabaseSync(":memory:");
      sqlite.exec(Buffer.concat(parts).toString("utf8"));
      return sqlite;
    }
    bookmark = result.at_bookmark;
    requireThat(bookmark, "D1 export bookmark missing");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw Error("D1 export did not complete in the allowed window");
}
async function main() {
  const env = process.env,
    mode = process.argv[2];
  requireThat(
    ["create", "restore-local"].includes(mode),
    "Use create or restore-local ID NEW_DIRECTORY",
  );
  requireThat(
    env.BACKUP_PASSPHRASE?.length >= 20,
    "Separate backup passphrase required",
  );
  requireThat(
    env.RECOVERY_ENDPOINT &&
      new URL(env.RECOVERY_ENDPOINT).protocol === "https:" &&
      new URL(env.RECOVERY_ENDPOINT).hostname.endsWith(".backblazeb2.com"),
    "Independent approved B2 endpoint required",
  );
  requireThat(
    env.RECOVERY_BUCKET &&
      env.RECOVERY_ACCESS_KEY_ID &&
      env.RECOVERY_SECRET_ACCESS_KEY,
    "Separate recovery bucket credentials required",
  );
  const destinationClient = new S3Client({
    endpoint: env.RECOVERY_ENDPOINT,
    region: env.RECOVERY_REGION,
    credentials: {
      accessKeyId: env.RECOVERY_ACCESS_KEY_ID,
      secretAccessKey: env.RECOVERY_SECRET_ACCESS_KEY,
    },
  });
  const archive = s3Storage(destinationClient, env.RECOVERY_BUCKET);
  let sqlite, sourceClient;
  try {
    if (mode === "create") {
      requireThat(
        env.ALLOW_EXTERNAL_BACKUP_UPLOAD === "true" &&
          env.BACKUP_APPROVAL_REF?.length >= 8,
        "External upload is disabled until separately approved",
      );
      requireThat(
        env.R2_ACCOUNT_ID &&
          env.R2_BUCKET &&
          env.R2_READ_ACCESS_KEY_ID &&
          env.R2_READ_SECRET_ACCESS_KEY,
        "Separate read-only source media credentials required",
      );
      sourceClient = new S3Client({
        endpoint: "https://" + env.R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
        region: "auto",
        credentials: {
          accessKeyId: env.R2_READ_ACCESS_KEY_ID,
          secretAccessKey: env.R2_READ_SECRET_ACCESS_KEY,
        },
      });
      const source = s3Storage(sourceClient, env.R2_BUCKET),
        media = {
          get: async (key) => {
            const bytes = await source.get(key);
            return { arrayBuffer: async () => bytes };
          },
        };
      sqlite = await exportSnapshot(env);
      console.log(
        JSON.stringify(
          await createCloudBackup({
            db: sqliteAdapter(sqlite),
            media,
            destination: archive,
            passphrase: env.BACKUP_PASSPHRASE,
            namespace: env.SOURCE_NAMESPACE,
          }),
        ),
      );
    } else {
      const target = resolve(process.argv[4] ?? "");
      requireThat(
        target.startsWith(resolve("data/recovery") + sep),
        "Restore target must be a new child of data/recovery",
      );
      await mkdir(resolve("data/recovery"), { recursive: true, mode: 0o700 });
      await mkdir(target, { mode: 0o700 });
      await mkdir(resolve(target, "media"), { mode: 0o700 });
      sqlite = new DatabaseSync(resolve(target, "restored.sqlite"));
      sqlite.exec(
        "PRAGMA foreign_keys=ON;" +
          (
            await Promise.all(
              (await readdir("cloudflare/migrations"))
                .sort()
                .map((f) => readFile("cloudflare/migrations/" + f, "utf8")),
            )
          ).join("\n"),
      );
      console.log(
        JSON.stringify(
          await restoreCloudBackup({
            db: sqliteAdapter(sqlite),
            media: fileMedia(resolve(target, "media")),
            source: archive,
            id: process.argv[3],
            passphrase: env.BACKUP_PASSPHRASE,
            namespace: "local",
          }),
        ),
      );
    }
  } finally {
    sqlite?.close();
    sourceClient?.destroy();
    destinationClient.destroy();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch(() => {
    console.error(
      "Backup/recovery failed. Check scoped configuration and private diagnostics; no secrets logged.",
    );
    process.exitCode = 1;
  });
