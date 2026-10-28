import { readFile } from "node:fs/promises";
const path = process.argv[2] ?? "deployment/wrangler.production.example.json",
  config = JSON.parse(await readFile(path, "utf8")),
  blockers = [];
if (!/^[a-f0-9]{32}$/.test(config.account_id ?? ""))
  blockers.push("Approved account ID missing");
if (!/^[a-f0-9-]{36}$/.test(config.d1_databases?.[0]?.database_id ?? ""))
  blockers.push("New isolated production D1 ID missing");
if (
  config.vars?.SITE_OPEN !== "false" ||
  config.vars?.COMMUNICATIONS_MODE !== "disabled" ||
  config.vars?.ALLOW_EMAIL_SEND !== "false" ||
  config.vars?.ALLOW_PUSH_SEND !== "false"
)
  blockers.push(
    "Preparation must stay private with both communication channels disabled",
  );
if (!config.assets?.run_worker_first || config.assets?.html_handling !== "none")
  blockers.push("All assets must pass the Worker security gate");
if (config.workers_dev !== false || config.preview_urls !== false)
  blockers.push("Disable unapproved public preview routes");
if (
  config.vars?.DATA_NAMESPACE !== "production" ||
  config.vars?.CLOUDFLARE_ENV !== "production"
)
  blockers.push("Production namespace isolation missing");
const bundle = await readFile("data/cloudflare-build/worker.mjs", "utf8").catch(
  () => "",
);
if (!bundle || bundle.includes("/__fixture/"))
  blockers.push(
    "Reviewed production-only Worker bundle missing or contains test endpoints",
  );
console.log(
  JSON.stringify(
    {
      configuration: path,
      staticChecksPassed: blockers.length === 0,
      blockers,
      requiresExternalVerification: [
        "Account/resource ownership and quotas",
        "Domain zone/routing authorization without disturbing mail or Netlify",
        "Preview secrets and separate owner provisioning",
        "Private R2 and actual HEIC/EXIF acceptance",
        "Real iPhone push and approved email sender/receipts",
        "Independent encrypted backup upload and restore drill",
      ],
      deploymentAuthorized: false,
      networkCalls: false,
    },
    null,
    2,
  ),
);
if (blockers.length) process.exitCode = 1;
