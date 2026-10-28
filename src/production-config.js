import { isAbsolute, resolve, sep } from "node:path";
import { requireThat } from "./security.js";
export function productionConfig(env) {
  const url = new URL(env.PROD_ORIGIN ?? "https://replace-host.onrender.com");
  requireThat(
    env.PROD_ORIGIN &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.hostname.endsWith(".invalid") &&
      !url.hostname.includes("replace-"),
    "Set an explicit HTTPS PROD_ORIGIN",
  );
  const directory = env.PROD_DATA_DIR;
  requireThat(
    directory &&
      isAbsolute(directory) &&
      !(
        resolve(directory) === resolve("data") ||
        resolve(directory).startsWith(resolve("data") + sep)
      ) &&
      !resolve(directory).includes("device-test"),
    "Production requires a separate absolute persistent data directory",
  );
  requireThat(
    env.PROD_SITE_OPEN === "true" || env.PROD_SITE_OPEN === "false",
    "Set PROD_SITE_OPEN explicitly; default preparation must be false",
  );
  const open = env.PROD_SITE_OPEN === "true",
    mode = env.PROD_COMMUNICATIONS_MODE ?? "disabled";
  requireThat(
    ["disabled", "test-only", "live"].includes(mode),
    "Invalid production communications mode",
  );
  requireThat(
    mode !== "live" || open,
    "Live customer messaging requires the approved public site",
  );
  const push = env.PROD_ALLOW_PUSH_SEND === "true",
    email = env.PROD_ALLOW_EMAIL_SEND === "true";
  requireThat(
    mode !== "disabled" || (!push && !email),
    "Disabled communication mode cannot enable a channel",
  );
  if (!open)
    requireThat(
      /^[A-Za-z0-9_-]{43}:[a-f0-9]{128}$/.test(
        env.PROD_PREVIEW_PASSWORD_HASH ?? "",
      ) && env.PROD_PREVIEW_SIGNING_KEY?.length >= 43,
      "Closed prelaunch hosting requires separate preview access secrets",
    );
  const recipients = (env.PROD_TEST_EMAIL_RECIPIENTS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  requireThat(
    recipients.every((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)),
    "Invalid production test recipient allowlist",
  );
  if (email && mode === "test-only")
    requireThat(recipients.length > 0, "Approved test recipients are required");
  const aliases = (env.PROD_HOST_ALIASES ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  requireThat(
    aliases.every((host) => /^[a-z0-9.-]+$/.test(host) && !host.includes("..")),
    "Invalid canonical hostname alias",
  );
  const port = Number(env.PORT ?? 10000);
  requireThat(
    Number.isInteger(port) && port > 0 && port < 65536,
    "Invalid service port",
  );
  return {
    environment: "production",
    origin: url.origin,
    port,
    bindHost: "0.0.0.0",
    dataDirectory: directory,
    databasePath: resolve(directory, "production.sqlite"),
    hostAliases: aliases,
    siteOpen: open,
    communicationsMode: mode,
    accessGate: open
      ? null
      : {
          passwordHash: env.PROD_PREVIEW_PASSWORD_HASH,
          signingKey: env.PROD_PREVIEW_SIGNING_KEY,
        },
    vapidPublicKey: env.PROD_VAPID_PUBLIC_KEY,
    vapidPrivateKey: env.PROD_VAPID_PRIVATE_KEY,
    vapidSubject: env.PROD_VAPID_SUBJECT,
    emailApiKey: env.PROD_RESEND_API_KEY,
    emailFrom: env.PROD_EMAIL_FROM,
    ownerEmail: env.PROD_OWNER_NOTIFICATION_EMAIL,
    emailWebhookSecret: env.PROD_RESEND_WEBHOOK_SECRET,
    deliveryPolicy: {
      pushEnabled: push,
      emailEnabled: email,
      emailRecipients: recipients,
      emailScope: mode === "live" ? "live" : "test-only",
    },
  };
}
