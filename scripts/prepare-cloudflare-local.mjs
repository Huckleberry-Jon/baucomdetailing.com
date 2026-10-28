import { existsSync } from "node:fs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { passwordHash, token } from "../src/security.js";
import { settings, packages, addons } from "../src/catalog.js";
import { protectPrivateDirectory } from "../src/private-files.js";
const root = resolve("data/cloudflare-local");
mkdirSync(root, { recursive: true });
protectPrivateDirectory(root);
const secretPath = resolve(root, "owner.json");
let secrets;
if (existsSync(secretPath))
  secrets = JSON.parse(readFileSync(secretPath, "utf8"));
else {
  secrets = {
    ownerId: randomUUID(),
    email: "joseph@cloud-test.invalid",
    password: token(),
    gateCode: token(),
    signingKey: token() + token(),
    linkKey: token(),
  };
  writeFileSync(secretPath, JSON.stringify(secrets), { mode: 0o600 });
}
const config = JSON.parse(
  readFileSync("deployment/wrangler.local.json", "utf8"),
);
config.main = resolve("data/cloudflare-build/worker.mjs");
config.assets.directory = resolve("public");
config.d1_databases[0].migrations_dir = resolve("cloudflare/migrations");
writeFileSync(resolve(root, "wrangler.json"), JSON.stringify(config, null, 2));
writeFileSync(
  resolve(root, ".dev.vars"),
  "PREVIEW_PASSWORD_HASH=" +
    passwordHash(secrets.gateCode) +
    "\nPREVIEW_SIGNING_KEY=" +
    secrets.signingKey +
    "\n",
  { mode: 0o600 },
);
const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const sql = [
  "INSERT OR IGNORE INTO businesses VALUES(" +
    [
      quote("baucom"),
      quote(JSON.stringify(settings)),
      0,
      0,
      quote(secrets.linkKey),
    ].join(",") +
    ");",
  "INSERT OR IGNORE INTO tenant_domains VALUES('localhost:4334','baucom','http://localhost:4334');",
  "INSERT OR IGNORE INTO tenant_domains VALUES('127.0.0.1:4334','baucom','http://localhost:4334');",
  "INSERT OR IGNORE INTO owners VALUES(" +
    [secrets.ownerId, "baucom", secrets.email, passwordHash(secrets.password)]
      .map(quote)
      .join(",") +
    ");",
  ...[...packages, ...addons].map(
    (p) =>
      "INSERT OR IGNORE INTO services VALUES(" +
      [quote(p.id), quote("baucom"), 1, quote(JSON.stringify(p))].join(",") +
      ");",
  ),
];
writeFileSync(resolve(root, "seed.sql"), sql.join("\n"), { mode: 0o600 });
console.log(
  "Private local-only config/seed prepared at data/cloudflare-local. Credentials are not printed; no provider, tunnel, migration or deployment activated.",
);
