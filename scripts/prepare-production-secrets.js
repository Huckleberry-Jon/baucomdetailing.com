import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import webpush from "web-push";
import { passwordHash } from "../src/security.js";
import { protectPrivateDirectory } from "../src/private-files.js";
const directory = "data/production-preparation";
mkdirSync(directory, { recursive: true });
protectPrivateDirectory(directory);
const file = directory + "/prepared-secrets.json";
if (existsSync(file)) {
  console.log(
    "Offline production-preparation secrets already exist; nothing rotated.",
  );
} else {
  const code = randomBytes(24).toString("base64url"),
    keys = webpush.generateVAPIDKeys();
  writeFileSync(
    file,
    JSON.stringify(
      {
        purpose:
          "Offline production-preparation candidates; no deployment or live messaging authorized",
        PROD_PREVIEW_PASSWORD_HASH: passwordHash(code),
        PROD_PREVIEW_SIGNING_KEY: randomBytes(32).toString("base64url"),
        PROD_VAPID_PUBLIC_KEY: keys.publicKey,
        PROD_VAPID_PRIVATE_KEY: keys.privateKey,
        BACKUP_PASSPHRASE: randomBytes(32).toString("base64url"),
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  writeFileSync(directory + "/preview-code.txt", code + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  protectPrivateDirectory(directory);
  console.log(
    "Separate offline preview/VAPID/backup keys prepared in owner-only ignored files. No values printed, provider configured or account provisioned.",
  );
}
