import { resolve, sep, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, statfs } from "node:fs/promises";
import { BUSINESS } from "./catalog.js";
import { requireThat } from "./security.js";
import { createBackup } from "./backups.js";
import { remoteClient, uploadBackup } from "./backup-remote.js";
export function hostedBackupSettings(env, config) {
  const enabled =
    config.environment === "production" && env.PROD_BACKUPS_ENABLED === "true";
  if (!enabled) return { enabled: false };
  requireThat(
    config.environment === "production",
    "Hosted backups require the production profile",
  );
  requireThat(
    env.PROD_ALLOW_BACKUP_UPLOAD === "true",
    "Approve encrypted off-machine backup uploads before enabling hosted backups",
  );
  requireThat(
    env.BACKUP_PASSPHRASE?.length >= 20 &&
      env.PROD_BACKUP_BUCKET &&
      env.PROD_BACKUP_REGION &&
      env.PROD_BACKUP_ACCESS_KEY_ID &&
      env.PROD_BACKUP_SECRET_ACCESS_KEY,
    "Separate production backup credentials and passphrase required",
  );
  return {
    enabled: true,
    root: resolve(config.dataDirectory, "backups"),
    passphrase: env.BACKUP_PASSPHRASE,
    remote: {
      bucket: env.PROD_BACKUP_BUCKET,
      region: env.PROD_BACKUP_REGION,
      credentials: {
        accessKeyId: env.PROD_BACKUP_ACCESS_KEY_ID,
        secretAccessKey: env.PROD_BACKUP_SECRET_ACCESS_KEY,
        sessionToken: env.PROD_BACKUP_SESSION_TOKEN,
      },
      prefix: "docdetailing/production/",
      allowUpload: true,
    },
  };
}
export class HostedBackupRunner {
  constructor(db, settings, adapters = {}) {
    this.db = db;
    this.settings = settings;
    this.running = false;
    this.create = adapters.create ?? createBackup;
    this.upload = adapters.upload ?? uploadBackup;
    this.makeClient = adapters.client ?? remoteClient;
  }
  async tick() {
    if (!this.settings.enabled || this.running) return;
    const previous = this.db
      .prepare(
        "SELECT * FROM backup_runs WHERE business_id=? ORDER BY started_at DESC LIMIT 1",
      )
      .get(BUSINESS);
    if (previous?.status === "running" || previous?.status === "failed") return;
    if (
      previous?.status === "uploaded" &&
      previous.finished_at > Date.now() - 24 * 3600000
    )
      return;
    this.running = true;
    const id = randomUUID(),
      directory = resolve(this.settings.root, id);
    requireThat(
      directory.startsWith(resolve(this.settings.root) + sep),
      "Backup directory outside private root",
    );
    let client;
    try {
      await mkdir(this.settings.root, { recursive: true, mode: 0o700 });
      this.db
        .prepare("INSERT INTO backup_runs VALUES(?,?,?,NULL,'running',?,NULL)")
        .run(id, BUSINESS, Date.now(), directory);
      const localCopies = (
        await readdir(this.settings.root, { withFileTypes: true })
      ).filter(
        (entry) => entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name),
      );
      requireThat(
        localCopies.length < 2,
        "Local backup capacity requires an approved operator retention review; no files deleted",
      );
      const space = await statfs(this.settings.root);
      requireThat(
        space.bavail * space.bsize > 100 * 1024 * 1024,
        "Backup disk headroom is too low; operator review required",
      );
      await this.create(this.db, directory, this.settings.passphrase);
      client = this.makeClient(this.settings.remote);
      await this.upload(client, this.settings.remote, directory, id);
      this.db
        .prepare(
          "UPDATE backup_runs SET status='uploaded',finished_at=? WHERE id=?",
        )
        .run(Date.now(), id);
    } catch {
      this.db
        .prepare(
          "UPDATE backup_runs SET status='failed',finished_at=?,error='Encrypted backup/upload failed; operator review required' WHERE id=?",
        )
        .run(Date.now(), id);
    } finally {
      client?.destroy?.();
      this.running = false;
    }
  }
}
