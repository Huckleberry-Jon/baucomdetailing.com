import { Worker } from "node:worker_threads";
import { Problem } from "./security.js";
let busy = false;
export function isHeic(bytes) {
  return (
    bytes.length >= 16 &&
    bytes.toString("ascii", 4, 8) === "ftyp" &&
    ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(
      bytes.toString("ascii", 8, 12),
    )
  );
}
export async function heicPreview(bytes) {
  if (busy)
    throw new Problem(
      503,
      "Another iPhone photograph is being processed; retry shortly.",
    );
  busy = true;
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./heic-worker.js", import.meta.url), {
        workerData: Uint8Array.from(bytes),
        resourceLimits: { maxOldGenerationSizeMb: 256 },
        stdout: true,
        stderr: true,
      });
      let done = false;
      const finish = (error, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker
          .terminate()
          .finally(() => (error ? reject(error) : resolve(value)));
      };
      const timer = setTimeout(
        () =>
          finish(
            new Problem(400, "HEIC conversion exceeded the 15-second limit"),
          ),
        15000,
      );
      worker.once("message", (m) =>
        m.error
          ? finish(new Problem(400, m.error))
          : finish(null, Buffer.from(m.preview)),
      );
      worker.once("error", () =>
        finish(new Problem(400, "HEIC conversion failed")),
      );
      worker.once("exit", () => {
        if (!done)
          finish(new Problem(400, "HEIC conversion stopped before completion"));
      });
    });
  } finally {
    busy = false;
  }
}
