// Offline preparation only. No Cloudflare API, DNS, deployment or credential upload.
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { passwordHash, token, requireThat } from "../src/security.js";
import { settings, packages, addons } from "../src/catalog.js";
import { protectPrivateDirectory } from "../src/private-files.js";
export function candidate(env) {
  const stage = env.DOCDETAILING_TARGET;
  requireThat(
    ["staging", "production"].includes(stage),
    "Choose staging or production",
  );
  requireThat(
    /^[a-f0-9]{32}$/.test(env.DOCDETAILING_ACCOUNT_ID ?? ""),
    "Approved account ID required",
  );
  requireThat(
    /^[a-f0-9-]{36}$/.test(env.DOCDETAILING_D1_ID ?? ""),
    "Isolated D1 ID required",
  );
  requireThat(
    env.DOCDETAILING_OWNER_EMAIL_VERIFIED === "true" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.DOCDETAILING_OWNER_EMAIL ?? ""),
    "Verified owner email required",
  );
  const origin = new URL(env.DOCDETAILING_ORIGIN);
  requireThat(
    origin.protocol === "https:" &&
      !origin.username &&
      !origin.password &&
      !origin.port &&
      origin.pathname === "/" &&
      !origin.search &&
      !origin.hash,
    "Canonical HTTPS origin required",
  );
  requireThat(
    stage !== "production" || origin.origin === "https://baucomdetailing.com",
    "Production origin must be baucomdetailing.com",
  );
  requireThat(
    stage !== "staging" ||
      !["baucomdetailing.com", "www.baucomdetailing.com"].includes(
        origin.hostname,
      ),
    "Staging cannot claim production hostnames",
  );
  const config = JSON.parse(
    readFileSync("deployment/wrangler.production.example.json", "utf8"),
  );
  config.name = "docdetailing-site-" + stage;
  config.account_id = env.DOCDETAILING_ACCOUNT_ID;
  config.main = resolve("data/cloudflare-build/worker.mjs");
  config.assets.directory = resolve("public");
  config.vars.CLOUDFLARE_ENV = stage;
  config.vars.DATA_NAMESPACE = stage;
  config.d1_databases[0] = {
    binding: "DB",
    database_name: "docdetailing-" + stage,
    database_id: env.DOCDETAILING_D1_ID,
    migrations_dir: resolve("cloudflare/migrations"),
  };
  config.r2_buckets[0].bucket_name = "docdetailing-" + stage + "-private";
  // Staging workers.dev origin requires separate explicit deployment approval; preparation never makes it public.
  config.routes = stage === "production" ? config.routes : [];
  config.workers_dev =
    stage === "staging" && origin.hostname.endsWith(".workers.dev");
  requireThat(
    stage !== "staging" || config.workers_dev,
    "Initial preview requires its explicitly approved workers.dev hostname",
  );
  const secrets = {
    ownerId: randomUUID(),
    email: env.DOCDETAILING_OWNER_EMAIL,
    password: token(),
    gateCode: token(),
    signingKey: token() + token(),
    linkKey: token(),
  };
  const q = (v) => "'" + String(v).replaceAll("'", "''") + "'";
  const sql = [
    "INSERT INTO businesses VALUES(" +
      [q("baucom"), q(JSON.stringify(settings)), 0, 0, q(secrets.linkKey)].join(
        ",",
      ) +
      ");",
    "INSERT INTO owners VALUES(" +
      [secrets.ownerId, "baucom", secrets.email, passwordHash(secrets.password)]
        .map(q)
        .join(",") +
      ");",
    "INSERT INTO tenant_entitlements VALUES('baucom','complimentary_test','active'," +
      Date.now() +
      ");",
    ...[
      origin.hostname,
      ...(stage === "production" ? ["www.baucomdetailing.com"] : []),
    ].map(
      (h) =>
        "INSERT INTO tenant_domains VALUES(" +
        [h, "baucom", origin.origin].map(q).join(",") +
        ");",
    ),
    ...[...packages, ...addons].map(
      (p) =>
        "INSERT INTO services VALUES(" +
        [q(p.id), q("baucom"), 1, q(JSON.stringify(p))].join(",") +
        ");",
    ),
  ].join("\n");
  return {
    config,
    secrets,
    sql,
    secretUpload: {
      PREVIEW_PASSWORD_HASH: passwordHash(secrets.gateCode),
      PREVIEW_SIGNING_KEY: secrets.signingKey,
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const value = candidate(process.env),
    root = resolve(
      "data/cloudflare-" + process.env.DOCDETAILING_TARGET + "-candidate",
    );
  requireThat(
    !existsSync(root),
    "Candidate exists; preserve it and review before preparing another",
  );
  mkdirSync(root, { recursive: true });
  protectPrivateDirectory(root);
  for (const [name, data] of Object.entries({
    "wrangler.json": JSON.stringify(value.config, null, 2),
    "owner.json": JSON.stringify(value.secrets),
    "seed.sql": value.sql,
    "preview-secrets.json": JSON.stringify(value.secretUpload),
  }))
    writeFileSync(resolve(root, name), data, { mode: 0o600 });
  console.log(
    "Prepared private offline candidate at " +
      root +
      ". No network calls. Do not import into an existing database. No deployment, DNS or communications authorized.",
  );
}
