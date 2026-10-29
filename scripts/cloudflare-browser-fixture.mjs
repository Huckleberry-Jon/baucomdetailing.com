// Synthetic loopback browser QA only. Never used by production configuration.
import {
  runtime,
  seed,
  call,
  input,
  password,
} from "../test-cloudflare/helpers.mjs";
import { passwordHash } from "../src/security.js";
const host = "http://localhost:4335";
const { mf, db } = await runtime(
  {
    SITE_OPEN: "false",
    LOCAL_RESPONSIVE_QA: "true",
    PREVIEW_PASSWORD_HASH: passwordHash("Synthetic-browser-access-only"),
    PREVIEW_SIGNING_KEY:
      "synthetic-browser-gate-signing-key-at-least-43-characters",
  },
  { port: 4335 },
);
await seed(db, "baucom", "localhost:4335");
console.log(
  "Synthetic Cloudflare QA: " +
    host +
    "; no real customers/providers; gate: Synthetic-browser-access-only; owner@example.invalid / " +
    password,
);
process.on("SIGINT", () => void mf.dispose().then(() => process.exit(0)));
