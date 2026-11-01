import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export function launchReadiness(config, env = {}) {
  const blockers = [],
    pending = (test, message) => {
      if (!test) blockers.push(message);
    };
  pending(
    config.name === "docdetailing-site-production",
    "Isolated production Worker configuration",
  );
  pending(config.vars?.DATA_NAMESPACE === "production", "Production namespace");
  pending(
    /^[a-f0-9-]{36}$/.test(config.d1_databases?.[0]?.database_id ?? "") &&
      config.d1_databases[0].database_id !==
        "fa3a26b3-d685-444b-bb0b-106c61b21840",
    "New production D1 database (not staging)",
  );
  pending(
    config.r2_buckets?.[0]?.bucket_name === "docdetailing-production-private",
    "Private production media bucket",
  );
  const missing = (names) => names.filter((name) => !env[name]?.trim());
  const credentials = {
    email: missing(["RESEND_API_KEY", "EMAIL_FROM", "RESEND_WEBHOOK_SECRET"]),
    nativePush: missing(["APNS_PRIVATE_KEY", "APNS_KEY_ID"]),
    backups: missing([
      "BACKUP_PASSPHRASE",
      "CF_D1_EXPORT_TOKEN",
      "R2_READ_ACCESS_KEY_ID",
      "R2_READ_SECRET_ACCESS_KEY",
      "RECOVERY_ENDPOINT",
      "RECOVERY_BUCKET",
      "RECOVERY_ACCESS_KEY_ID",
      "RECOVERY_SECRET_ACCESS_KEY",
    ]),
  };
  for (const [channel, names] of Object.entries(credentials))
    pending(
      !names.length,
      channel + " credentials missing: " + names.join(", "),
    );
  return {
    localConfigurationReady: blockers.length === 0,
    blockers,
    requiredAcceptance: [
      "Verified email sender and signed delivery/bounce webhook",
      "Allowlisted owner/customer phone test: request, confirmation, proposal, cancellation",
      "Physical iPhone APNs foreground/background/cold-start and correct booking navigation",
      "Off-provider backup verified.json marker from a successful downloaded full restore",
      "Escrow backup encryption key independently; activate hosted schedule and failure alerts",
      "Reviewed production branding, hours, service durations, data transfer and owner access",
      "Authenticated DNS inventory, active Cloudflare zone and approved exact domain cutover",
    ],
    valuesRedacted: true,
    networkCalls: false,
    publicationPerformed: false,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const config = JSON.parse(
    await readFile(
      process.argv[2] ?? "deployment/wrangler.production.example.json",
      "utf8",
    ),
  );
  const result = launchReadiness(config, process.env);
  console.log(JSON.stringify(result, null, 2));
  if (!result.localConfigurationReady) process.exitCode = 1;
}
