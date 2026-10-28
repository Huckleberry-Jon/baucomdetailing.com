import { runtimeConfig } from "../src/runtime-config.js";
import { openDatabase } from "../src/db.js";
import { BookingService } from "../src/bookings.js";
try {
  if (process.env.APP_ENV !== "device-test")
    throw Error(
      "Run with --env-file=.env.device-test; APP_ENV must be device-test",
    );
  const config = runtimeConfig(),
    db = openDatabase(config.databasePath);
  try {
    const settings = new BookingService(db).settings(),
      owner = db.prepare("SELECT count(*) n FROM owners").get().n > 0,
      integrity =
        db.prepare("PRAGMA integrity_check").get().integrity_check === "ok";
    const remoteBlockers = [];
    if (config.connectionMode === "local-only")
      remoteBlockers.push(
        "Approve the ngrok account, stable HTTPS URL, authorized testers and test window before switching to https-tunnel mode",
      );
    remoteBlockers.push(
      "Public tunnel activation has not been performed by this check",
    );
    console.log(
      JSON.stringify(
        {
          environment: config.environment,
          connectionMode: config.connectionMode,
          origin: config.origin,
          localBind: "127.0.0.1:" + config.port,
          localReady: !!config.accessGate && owner && integrity,
          iphoneReady: false,
          accessGateConfigured: !!config.accessGate,
          ownerProvisioned: owner,
          databaseIntegrity: integrity,
          scheduleConfirmed: settings.scheduleConfirmed,
          serviceAreaConfirmed: settings.serviceAreaConfirmed,
          pushConfigured: !!(
            config.vapidPublicKey &&
            config.vapidPrivateKey &&
            config.vapidSubject
          ),
          customerEmailConfigured: !!(config.emailApiKey && config.emailFrom),
          webhookConfigured: !!config.emailWebhookSecret,
          communications: {
            pushEnabled: config.deliveryPolicy.pushEnabled,
            emailEnabled: config.deliveryPolicy.emailEnabled,
            allowlistedRecipients: config.deliveryPolicy.emailRecipients.length,
          },
          remainingConnectionSteps: remoteBlockers,
          exposure: "NOT STARTED BY THIS CHECK",
        },
        null,
        2,
      ),
    );
    if (!owner || !integrity) process.exitCode = 1;
  } finally {
    db.close();
  }
} catch (error) {
  console.log(
    JSON.stringify(
      {
        localReady: false,
        iphoneReady: false,
        blocker: error.message,
        exposure: "NOT STARTED",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
