import { runtimeConfig } from "../src/runtime-config.js";
import { openDatabase } from "../src/db.js";
import { BookingService } from "../src/bookings.js";
import { hostedBackupSettings } from "../src/hosted-backups.js";
import { verifyPersistentMount } from "../src/production-storage.js";
try {
  const config = runtimeConfig();
  if (config.environment !== "production")
    throw Error("Use the production environment in the hosted container");
  verifyPersistentMount(config);
  const db = openDatabase(config.databasePath);
  try {
    const service = new BookingService(db),
      settings = service.settings(),
      owner = db.prepare("SELECT count(*) n FROM owners").get().n > 0,
      latest =
        db
          .prepare(
            "SELECT status,finished_at FROM backup_runs ORDER BY started_at DESC LIMIT 1",
          )
          .get() ?? null,
      backup = hostedBackupSettings(process.env, config);
    console.log(
      JSON.stringify(
        {
          environment: config.environment,
          origin: config.origin,
          publicSiteOpen: config.siteOpen,
          previewGate: !!config.accessGate,
          ownerProvisioned: owner,
          databaseIntegrity:
            db.prepare("PRAGMA integrity_check").get().integrity_check === "ok",
          scheduleConfirmed: settings.scheduleConfirmed,
          serviceAreaConfirmed: settings.serviceAreaConfirmed,
          communicationsMode: config.communicationsMode,
          pushEnabled: config.deliveryPolicy.pushEnabled,
          emailEnabled: config.deliveryPolicy.emailEnabled,
          backupSchedulerEnabled: backup.enabled,
          latestBackup: latest,
          hostedAndDeviceAcceptance: "PENDING ACTUAL HOSTED/PHYSICAL TESTS",
          deploymentStartedByCheck: false,
        },
        null,
        2,
      ),
    );
  } finally {
    db.close();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
