import assert from "node:assert/strict";
import { sign, createPrivateKey } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
export const appBundle = "com.docincorporated.docdetailing";
export function resolveIntegrationKey(value, env = process.env) {
  assert(typeof value === "string" && value.trim(), "Apple integration private key environment variable is missing or empty");
  let key = value.trim();
  // Match Codemagic CLI's documented @file:/@env: secret references.
  for (let depth = 0; depth < 3; depth++) {
    if (key.startsWith("@env:")) {
      key = env[key.slice(5)]?.trim() ?? "";
    } else if (key.startsWith("@file:")) {
      try {
        const file = key.slice(6);
        const stat = fs.statSync(file);
        assert(stat.isFile() && stat.size <= 16384);
        key = fs.readFileSync(file, "utf8").trim();
      } catch { assert.fail("Apple integration key file reference is unavailable"); }
    } else break;
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(key)) {
    const decoded = Buffer.from(key, "base64").toString("utf8");
    if (decoded.startsWith("-----BEGIN ")) key = decoded;
  }
  if (key.startsWith("-----BEGIN ")) key = key.replaceAll("\\n", "\n");
  return key;
}
export function appleAPIToken(
  { keyId, issuerId, privateKey },
  now = Date.now(),
) {
  assert(
    /^[A-Z0-9]{10}$/.test(keyId ?? ""),
    "Apple integration Key ID is missing or invalid",
  );
  assert(
    /^[a-f0-9-]{36}$/i.test(issuerId ?? ""),
    "Apple integration Issuer ID is missing or invalid",
  );
  assert(
    typeof privateKey === "string" && privateKey.trim().length > 0,
    "Apple integration private key environment variable is missing or empty",
  );
  // Codemagic can serialize EC keys as SEC1 (EC PRIVATE KEY), not only PKCS8.
  // Parse in memory; never print the supplied value or parser errors.
  const keyMaterial = resolveIntegrationKey(privateKey);
  let signingKey;
  try {
    signingKey = createPrivateKey(keyMaterial);
  } catch {
    assert.fail("Apple integration private key could not be parsed securely");
  }
  assert(
    signingKey.asymmetricKeyType === "ec" &&
      signingKey.asymmetricKeyDetails?.namedCurve === "prime256v1",
    "Apple integration requires an ES256 P-256 private key",
  );
  const encode = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const header = encode({ alg: "ES256", kid: keyId, typ: "JWT" });
  const claims = encode({
    iss: issuerId,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 300,
    aud: "appstoreconnect-v1",
  });
  const data = header + "." + claims;
  return (
    data +
    "." +
    sign("sha256", Buffer.from(data), {
      key: signingKey,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url")
  );
}
export async function lookupAppleApp(credentials, fetcher = fetch) {
  const jwt = appleAPIToken(credentials);
  const query = new URLSearchParams({
    "filter[bundleId]": appBundle,
    "fields[apps]": "name,bundleId,sku,primaryLocale",
  });
  const response = await fetcher(
    "https://api.appstoreconnect.apple.com/v1/apps?" + query,
    {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: "Bearer " + jwt, Accept: "application/json" },
    },
  );
  assert(
    response.ok,
    "Read-only Apple app lookup failed (HTTP " + response.status + ")",
  );
  const result = await response.json();
  assert(
    Array.isArray(result.data) && result.data.length === 1,
    "Exactly one authorized DocDetailing app record is required",
  );
  const app = result.data[0];
  assert.equal(
    app.attributes?.bundleId,
    appBundle,
    "Unexpected Apple application",
  );
  assert.equal(
    app.attributes?.name,
    "DocDetailing",
    "Unexpected Apple app name",
  );
  return {
    checkedAt: new Date().toISOString(),
    appId: app.id,
    bundleId: app.attributes.bundleId,
    appName: app.attributes.name,
    primaryLocale: app.attributes.primaryLocale,
    skuMatchesOwnerSelection: app.attributes.sku === "DOCDETAILING-IOS-001",
    appRecordAccessible: true,
    requests: "GET /v1/apps filtered to the registered bundle",
    uploadsPerformed: 0,
    note: "Read access is verified. Upload permission and Apple processing are not exercised by this check.",
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const result = await lookupAppleApp({
      keyId: process.env.APP_STORE_CONNECT_KEY_IDENTIFIER,
      issuerId: process.env.APP_STORE_CONNECT_ISSUER_ID,
      privateKey: process.env.APP_STORE_CONNECT_PRIVATE_KEY,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      "Apple preflight failed: " +
        (error instanceof assert.AssertionError
          ? error.message
          : "Secure API authentication or connection could not be completed"),
    );
    process.exitCode = 1;
  }
}
