import {
  remoteBackupConfig,
  remoteClient,
  uploadBackup,
  downloadAndRestore,
} from "../src/backup-remote.js";
const [action, source, id, target] = process.argv.slice(2);
try {
  const config = remoteBackupConfig(),
    client = remoteClient(config);
  try {
    if (action === "upload") {
      if (!source || !id)
        throw Error(
          "Usage: backup:remote -- upload <encrypted-backup-directory> <unique-id>",
        );
      console.log(
        JSON.stringify(await uploadBackup(client, config, source, id)),
      );
    } else if (action === "verify") {
      if (!source || !id || !target)
        throw Error(
          "Usage: backup:remote -- verify <backup-id> <new-download-directory> <new-restoration-directory>",
        );
      console.log(
        JSON.stringify(
          await downloadAndRestore(
            client,
            config,
            source,
            id,
            target,
            process.env.BACKUP_PASSPHRASE,
          ),
        ),
      );
    } else
      throw Error("Choose upload or verify. No remote operation performed.");
  } finally {
    client.destroy();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
