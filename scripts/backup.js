import { DatabaseSync } from "node:sqlite";
import { access } from "node:fs/promises";
import { createBackup, restoreBackup } from "../src/backups.js";
const [command, source, target] = process.argv.slice(2),
  passphrase = process.env.BACKUP_PASSPHRASE;
try {
  if (command === "create") {
    if (!source || !target)
      throw Error(
        "Usage: npm run backup -- create <existing-database> <new-backup-directory>",
      );
    await access(source);
    const db = new DatabaseSync(source, { readOnly: true });
    try {
      const result = await createBackup(db, target, passphrase);
      console.log(
        "Encrypted backup verified: " + target + " (" + result.createdAt + ")",
      );
    } finally {
      db.close();
    }
  } else if (command === "restore") {
    if (!source || !target)
      throw Error(
        "Usage: npm run backup -- restore <backup-directory> <new-restore-directory>",
      );
    const result = await restoreBackup(source, target, passphrase);
    console.log(
      "Restored and integrity checked: " +
        result.databasePath +
        "; owner sessions revoked and outbound delivery paused.",
    );
  } else
    throw Error(
      "Choose create or restore. Set BACKUP_PASSPHRASE privately in your terminal (at least 20 characters).",
    );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
