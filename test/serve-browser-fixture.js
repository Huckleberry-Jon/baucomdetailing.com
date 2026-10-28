// Isolated browser-QA server. Never used by npm start or production.
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { fixture, requestInput, future } from "./helpers.js";
import { createApplication } from "../src/server.js";
import { BUSINESS } from "../src/catalog.js";
import { passwordHash } from "../src/security.js";
mkdirSync("data/browser-qa", { recursive: true });
const { db, s } = fixture("data/browser-qa/docdetailing.sqlite");
if (!db.prepare("SELECT 1 FROM owners").get())
  db.prepare("INSERT INTO owners VALUES(?,?,?,?)").run(
    randomUUID(),
    BUSINESS,
    "qa@example.invalid",
    passwordHash("Synthetic-browser-QA-only-2026!"),
  );
for (const p of s.catalog())
  if (!p.durationMinutes)
    db.prepare("UPDATE services SET data=? WHERE id=?").run(
      JSON.stringify({ ...p, durationMinutes: p.kind === "package" ? 90 : 30 }),
      p.id,
    );
if (!db.prepare("SELECT 1 FROM bookings").get())
  s.create(requestInput(), "browser-initial");
await writeFile(
  "data/browser-qa/synthetic.png",
  await sharp({
    create: { width: 800, height: 500, channels: 3, background: "#638768" },
  })
    .png()
    .toBuffer(),
);
const { server, worker } = createApplication(db, {
  origin: "http://localhost:4321",
});
server.listen(4321, "127.0.0.1", () =>
  console.log(
    "Synthetic QA: http://localhost:4321 · no live providers configured",
  ),
);
setInterval(() => void worker.tick(), 15000).unref();
