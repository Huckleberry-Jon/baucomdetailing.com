import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
export async function bundleWorker(entry = "cloudflare/worker.js") {
  const options = {
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2022",
    write: false,
    external: ["node:*"],
  };
  const first = await build(options),
    names = [
      ...new Set(
        [...first.outputFiles[0].text.matchAll(/__require\("([^"]+)"\)/g)].map(
          (m) => m[1],
        ),
      ),
    ];
  if (
    names.some(
      (n) =>
        ![
          "tty",
          "crypto",
          "https",
          "http",
          "url",
          "util",
          "buffer",
          "events",
          "net",
          "tls",
          "stream",
          "assert",
          "zlib",
          "fs",
          "path",
          "os",
          "node:crypto",
        ].includes(n),
    )
  )
    throw Error("Unreviewed Node dependency: " + names.join(","));
  const imports = names
    .map(
      (n, i) =>
        "import * as builtin" +
        i +
        ' from "' +
        (n.startsWith("node:") ? n : "node:" + n) +
        '";',
    )
    .join("\n");
  const map = names.map((n, i) => JSON.stringify(n) + ":builtin" + i).join(",");
  const result = await build({
    ...options,
    banner: {
      js:
        imports +
        "\nconst require=(name)=>{const m=({" +
        map +
        "})[name];if(!m)throw Error('Unsupported builtin');return m.default??m;};",
    },
  });
  return result.outputFiles[0].text;
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/build-cloudflare.mjs")) {
  await mkdir("data/cloudflare-build", { recursive: true });
  await writeFile("data/cloudflare-build/worker.mjs", await bundleWorker());
  console.log("Local Worker bundle written; no upload or deployment");
}
