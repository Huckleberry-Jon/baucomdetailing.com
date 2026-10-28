import { execFileSync } from "node:child_process";
import { chmodSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
export function protectDeviceDirectory() {
  const directory = resolve("data/device-test");
  if (process.platform === "win32") {
    const identity = execFileSync("whoami", ["/user", "/fo", "csv", "/nh"], {
      encoding: "utf8",
    }).match(/S-1-\d+(?:-\d+)+/);
    if (!identity)
      throw Error("Could not determine current user for device-secret ACL");
    execFileSync(
      "icacls",
      [directory, "/inheritance:r", "/grant:r", `*${identity[0]}:(OI)(CI)F`],
      { stdio: "pipe" },
    );
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile())
        execFileSync(
          "icacls",
          [
            join(directory, entry.name),
            "/inheritance:r",
            "/grant:r",
            `*${identity[0]}:F`,
          ],
          { stdio: "pipe" },
        );
    }
  } else {
    chmodSync(directory, 0o700);
    for (const entry of readdirSync(directory, { withFileTypes: true }))
      if (entry.isFile()) chmodSync(join(directory, entry.name), 0o600);
  }
}
