import { execFileSync } from "node:child_process";
import { chmodSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
export function protectDeviceDirectory() {
  return protectPrivateDirectory("data/device-test");
}
export function protectPrivateDirectory(target) {
  const directory = resolve(target);
  if (dirname(directory) !== resolve("data"))
    throw Error("Private directory must be a named child of project data");
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
