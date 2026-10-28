import { protectDeviceDirectory } from "../src/private-files.js";
import { mkdir, writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import webpush from "web-push";
import { passwordHash } from "../src/security.js";
import { openDatabase } from "../src/db.js";
const dir = "data/device-test";
await mkdir(dir, { recursive: true });
protectDeviceDirectory();
let exists = false;
try {
  await access(dir + "/secrets.json");
  exists = true;
} catch {}
if (exists) {
  console.log(
    "Device secrets already exist; no keys or access codes were rotated.",
  );
} else {
  const code = randomBytes(24).toString("base64url"),
    keys = webpush.generateVAPIDKeys();
  await writeFile(
    dir + "/secrets.json",
    JSON.stringify(
      {
        accessPasswordHash: passwordHash(code),
        gateSigningKey: randomBytes(32).toString("base64url"),
        vapidPublicKey: keys.publicKey,
        vapidPrivateKey: keys.privateKey,
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(dir + "/access-code.txt", code + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    "Development-only keys prepared. Access code: data/device-test/access-code.txt (not printed).",
  );
}
const db = openDatabase(dir + "/docdetailing.sqlite");
db.close();
console.log(
  "Isolated database prepared. No owner seeded, tunnel started or communications enabled.",
);
