import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runtimeConfig } from "../src/runtime-config.js";
import { protectDeviceDirectory } from "../src/private-files.js";
import { openDatabase } from "../src/db.js";
import { passwordHash, verifyPassword, requireThat } from "../src/security.js";
import { BUSINESS } from "../src/catalog.js";
requireThat(
  process.env.APP_ENV === "device-test",
  "This command only provisions the isolated device-test profile",
);
const config = runtimeConfig();
requireThat(
  config.deliveryPolicy.pushEnabled === false &&
    config.deliveryPolicy.emailEnabled === false,
  "Disable outbound communications before owner preparation",
);
protectDeviceDirectory();
const db = openDatabase(config.databasePath),
  file = resolve("data/device-test/joseph-test-owner.json");
try {
  if (existsSync(file)) {
    const credentials = JSON.parse(readFileSync(file, "utf8")),
      owner = db
        .prepare("SELECT * FROM owners WHERE id=? AND business_id=?")
        .get(credentials.ownerId, BUSINESS);
    requireThat(
      owner &&
        owner.email === credentials.login &&
        verifyPassword(credentials.password, owner.password_hash),
      "Existing credentials do not match the isolated owner; no account was changed",
    );
    console.log(
      "Existing isolated Joseph test owner verified; credentials unchanged.",
    );
  } else {
    requireThat(
      !db.prepare("SELECT 1 FROM owners").get(),
      "An owner already exists; no account was replaced",
    );
    const id = randomUUID(),
      password = randomBytes(32).toString("base64url"),
      login = "joseph@device-test.invalid";
    writeFileSync(
      file,
      JSON.stringify(
        {
          purpose:
            "Joseph Baucom isolated device-test account; login alias is not an email destination",
          ownerId: id,
          login,
          password,
        },
        null,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    );
    db.prepare("INSERT INTO owners VALUES(?,?,?,?)").run(
      id,
      BUSINESS,
      login,
      passwordHash(password),
    );
    protectDeviceDirectory();
    console.log(
      "Joseph test owner provisioned. Login alias: " +
        login +
        ". Private credentials: data/device-test/joseph-test-owner.json (not printed).",
    );
  }
} finally {
  db.close();
}
