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
    const settings = new BookingService(db).settings();
    console.log(
      JSON.stringify(
        {
          environment: config.environment,
          origin: config.origin,
          localBind: "127.0.0.1:" + config.port,
          accessGateConfigured: !!config.accessGate,
          ownerProvisioned:
            db.prepare("SELECT count(*) n FROM owners").get().n > 0,
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
          exposure: "NOT STARTED BY THIS CHECK",
        },
        null,
        2,
      ),
    );
  } finally {
    db.close();
  }
} catch (error) {
  console.log(
    JSON.stringify(
      { ready: false, blocker: error.message, exposure: "NOT STARTED" },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
