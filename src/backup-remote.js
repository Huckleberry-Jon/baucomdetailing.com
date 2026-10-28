import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { requireThat } from "./security.js";
import { restoreBackup } from "./backups.js";
export function remoteBackupConfig(env = process.env) {
  requireThat(
    env.DEV_BACKUP_BUCKET &&
      /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.DEV_BACKUP_BUCKET),
    "Configure a dedicated private development S3 bucket",
  );
  requireThat(
    /^[a-z]{2}-[a-z]+-\d$/.test(env.DEV_BACKUP_REGION ?? ""),
    "Configure DEV_BACKUP_REGION",
  );
  requireThat(
    env.DEV_BACKUP_ACCESS_KEY_ID && env.DEV_BACKUP_SECRET_ACCESS_KEY,
    "Use separate development backup credentials",
  );
  return {
    bucket: env.DEV_BACKUP_BUCKET,
    region: env.DEV_BACKUP_REGION,
    credentials: {
      accessKeyId: env.DEV_BACKUP_ACCESS_KEY_ID,
      secretAccessKey: env.DEV_BACKUP_SECRET_ACCESS_KEY,
      sessionToken: env.DEV_BACKUP_SESSION_TOKEN,
    },
    allowUpload: env.ALLOW_OFF_MACHINE_BACKUP_UPLOAD === "true",
    prefix: "docdetailing/device-test/",
  };
}
export function remoteClient(config) {
  return new S3Client({
    region: config.region,
    credentials: config.credentials,
    maxAttempts: 3,
  });
}
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fileHash(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
function backupKey(config, id, file) {
  requireThat(
    typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id),
    "Use a simple unique backup ID",
  );
  return config.prefix + id + "/" + file;
}
export async function uploadBackup(client, config, directory, id) {
  requireThat(
    config.allowUpload,
    "Off-machine backup uploads are disabled pending authorization",
  );
  const root = resolve(directory),
    manifestPath = join(root, "manifest.json"),
    manifestBytes = await readFile(manifestPath),
    manifest = JSON.parse(manifestBytes),
    ciphertext = join(root, "database.enc");
  requireThat(
    manifest.format === "docdetailing-backup-v1" &&
      (await fileHash(ciphertext)) === manifest.sha256,
    "Only a verified encrypted backup can be uploaded",
  );
  const data = [
    {
      file: "database.enc",
      body: createReadStream(ciphertext),
      bytes: (await stat(ciphertext)).size,
      sha: manifest.sha256,
    },
    {
      file: "manifest.json",
      body: manifestBytes,
      bytes: manifestBytes.length,
      sha: digest(manifestBytes),
    },
  ];
  for (const entry of data)
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: backupKey(config, id, entry.file),
        Body: entry.body,
        ContentLength: entry.bytes,
        ContentType:
          entry.file === "manifest.json"
            ? "application/json"
            : "application/octet-stream",
        ServerSideEncryption: "AES256",
        ChecksumSHA256: Buffer.from(entry.sha, "hex").toString("base64"),
        IfNoneMatch: "*",
      }),
    );
  return { id, objects: 2, prefix: config.prefix + id + "/" };
}
export async function downloadAndRestore(
  client,
  config,
  id,
  downloadDirectory,
  restoreDirectory,
  passphrase,
) {
  const target = resolve(downloadDirectory);
  await mkdir(target);
  for (const file of ["manifest.json", "database.enc"]) {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: backupKey(config, id, file),
        ChecksumMode: "ENABLED",
      }),
    );
    await pipeline(
      result.Body,
      createWriteStream(join(target, file), { flags: "wx", mode: 0o600 }),
    );
  }
  return restoreBackup(target, restoreDirectory, passphrase);
}
