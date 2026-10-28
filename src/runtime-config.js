import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireThat } from "./security.js";
export function runtimeConfig(
  env = process.env,
  read = (path) => JSON.parse(readFileSync(path, "utf8")),
) {
  const mode = env.APP_ENV ?? "local";
  requireThat(
    ["local", "device-test"].includes(mode),
    "Unsupported APP_ENV. Production is not configured by this development task.",
  );
  if (mode === "local")
    return {
      environment: mode,
      origin: env.APP_ORIGIN ?? "http://localhost:4317",
      port: Number(env.PORT ?? 4317),
      databasePath: env.DATABASE_PATH ?? "data/docdetailing.sqlite",
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
      vapidPrivateKey: env.VAPID_PRIVATE_KEY,
      vapidSubject: env.VAPID_SUBJECT,
      emailApiKey: env.RESEND_API_KEY,
      emailFrom: env.EMAIL_FROM,
      ownerEmail: env.OWNER_NOTIFICATION_EMAIL,
      emailWebhookSecret: env.RESEND_WEBHOOK_SECRET,
      deliveryPolicy: {
        pushEnabled: env.ALLOW_PUSH_SEND === "true",
        emailEnabled: env.ALLOW_EMAIL_SEND === "true",
        emailRecipients: (env.TEST_EMAIL_RECIPIENTS ?? "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      },
    };
  const connectionMode = env.DEV_CONNECTION_MODE ?? "https-tunnel";
  requireThat(
    ["local-only", "https-tunnel"].includes(connectionMode),
    "Invalid DEV_CONNECTION_MODE",
  );
  const u = new URL(
    env.DEV_ORIGIN ??
      (connectionMode === "local-only"
        ? "http://localhost:4324"
        : "https://replace-with-assigned-dev-domain.invalid"),
  );
  if (connectionMode === "local-only") {
    requireThat(
      u.origin === "http://localhost:4324" &&
        u.pathname === "/" &&
        !u.search &&
        !u.hash &&
        !u.username &&
        !u.password,
      "Local-only device tests must use http://localhost:4324",
    );
    requireThat(
      env.DEV_ALLOW_PUSH_SEND !== "true" && env.DEV_ALLOW_EMAIL_SEND !== "true",
      "Local-only device tests cannot enable outbound push or email",
    );
  } else {
    requireThat(
      u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.port &&
        u.pathname === "/" &&
        !u.search &&
        !u.hash &&
        !u.hostname.endsWith(".invalid") &&
        u.hostname !== "baucomdetailing.com" &&
        !u.hostname.endsWith(".baucomdetailing.com") &&
        !u.hostname.endsWith(".netlify.app"),
      "DEV_ORIGIN must be a separate HTTPS development origin, not the business domain or Netlify website",
    );
  }
  const file = resolve("data/device-test/secrets.json");
  requireThat(
    !env.DEV_SECRETS_FILE || resolve(env.DEV_SECRETS_FILE) === file,
    "Device secrets must be isolated in data/device-test/secrets.json",
  );
  const secrets = read(file);
  requireThat(
    typeof secrets.accessPasswordHash === "string" &&
      typeof secrets.gateSigningKey === "string" &&
      secrets.gateSigningKey.length >= 43,
    "Run device:prepare before starting device tests",
  );
  const allowed = (env.DEV_TEST_EMAIL_RECIPIENTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  requireThat(
    allowed.every((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)),
    "Invalid development email allowlist",
  );
  return {
    environment: mode,
    connectionMode,
    origin: u.origin,
    port: 4324,
    databasePath: resolve("data/device-test/docdetailing.sqlite"),
    accessGate: {
      passwordHash: secrets.accessPasswordHash,
      signingKey: secrets.gateSigningKey,
    },
    vapidPublicKey: secrets.vapidPublicKey,
    vapidPrivateKey: secrets.vapidPrivateKey,
    vapidSubject: env.DEV_VAPID_SUBJECT,
    emailApiKey: env.DEV_RESEND_API_KEY,
    emailFrom: env.DEV_EMAIL_FROM,
    ownerEmail: env.DEV_OWNER_NOTIFICATION_EMAIL,
    emailWebhookSecret: env.DEV_RESEND_WEBHOOK_SECRET,
    deliveryPolicy: {
      pushEnabled: env.DEV_ALLOW_PUSH_SEND === "true",
      emailEnabled: env.DEV_ALLOW_EMAIL_SEND === "true",
      emailRecipients: allowed,
    },
  };
}
export function deliveryBlockReason(config, push, recipient) {
  const p = config.deliveryPolicy;
  if (!p) return null;
  if (push)
    return p.pushEnabled ? null : "Push sending disabled by environment policy";
  if (!p.emailEnabled) return "Email sending disabled by environment policy";
  if (
    !p.emailRecipients.includes(
      String(recipient ?? "")
        .trim()
        .toLowerCase(),
    )
  )
    return "Email recipient is not on the test allowlist";
  return null;
}
