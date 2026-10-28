import { statSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { requireThat } from "./security.js";
export function verifyPersistentMount(
  config,
  inspect = statSync,
  platform = process.platform,
) {
  if (config.environment !== "production") return;
  requireThat(
    platform !== "win32",
    "Production runs in the prepared Linux container, not the development PC",
  );
  const mounted = inspect(config.dataDirectory),
    root = inspect("/");
  requireThat(
    mounted.isDirectory() && mounted.dev !== root.dev,
    "Production data directory must be a mounted persistent volume, not the ephemeral container filesystem",
  );
}
export function prepareStorage(config) {
  verifyPersistentMount(config);
  mkdirSync(dirname(config.databasePath), { recursive: true, mode: 0o700 });
  if (config.environment === "production")
    chmodSync(dirname(config.databasePath), 0o700);
}
