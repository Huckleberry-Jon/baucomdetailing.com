import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { BUSINESS, settings, packages, addons } from "./catalog.js";
export function openDatabase(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)",
  );
  for (const name of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (!db.prepare("SELECT 1 FROM migrations WHERE name=?").get(name))
      transaction(db, () => {
        if (db.prepare("SELECT 1 FROM migrations WHERE name=?").get(name))
          return;
        db.exec(
          readFileSync(
            new URL("../migrations/" + name, import.meta.url),
            "utf8",
          ),
        );
        db.prepare("INSERT INTO migrations VALUES(?,?)").run(name, Date.now());
      });
  }
  transaction(db, () => {
    db.prepare("INSERT OR IGNORE INTO businesses VALUES(?,?)").run(
      BUSINESS,
      JSON.stringify(settings),
    );
    for (const s of [...packages, ...addons])
      db.prepare(
        "INSERT OR IGNORE INTO services(id,business_id,data) VALUES(?,?,?)",
      ).run(s.id, BUSINESS, JSON.stringify(s));
  });
  return db;
}
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
