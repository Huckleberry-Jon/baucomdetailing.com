import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify, createPrivateKey } from "node:crypto";
import {
  appleAPIToken,
  lookupAppleApp,
  appBundle,
} from "../scripts/apple-upload-preflight.mjs";
const keys = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const credentials = {
  keyId: "ABCDEFGHIJ",
  issuerId: "11111111-2222-3333-4444-555555555555",
  privateKey: keys.privateKey,
};
test("Apple upload preflight creates short-lived ES256 authentication without logging key material", () => {
  const jwt = appleAPIToken(credentials, 1000000),
    [h, p, s] = jwt.split(".");
  assert.equal(JSON.parse(Buffer.from(h, "base64url")).alg, "ES256");
  const claims = JSON.parse(Buffer.from(p, "base64url"));
  assert.equal(claims.exp - claims.iat, 300);
  assert.equal(claims.aud, "appstoreconnect-v1");
  assert(
    verify(
      "sha256",
      Buffer.from(h + "." + p),
      { key: keys.publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(s, "base64url"),
    ),
  );
  assert.throws(() => appleAPIToken({ ...credentials, keyId: "bad" }));
});
test("Apple upload preflight is restricted to read-only lookup of the expected app", async () => {
  const calls = [];
  const result = await lookupAppleApp(credentials, async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      data: [
        {
          id: "12345",
          attributes: {
            bundleId: appBundle,
            name: "DocDetailing",
            sku: "DOCDETAILING-IOS-001",
            primaryLocale: "en-US",
          },
        },
      ],
    });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(new URL(calls[0].url).hostname, "api.appstoreconnect.apple.com");
  assert.equal(
    new URL(calls[0].url).searchParams.get("filter[bundleId]"),
    appBundle,
  );
  assert.equal(result.uploadsPerformed, 0);
  assert.equal(result.skuMatchesOwnerSelection, true);
  await assert.rejects(
    lookupAppleApp(credentials, async () => Response.json({ data: [] })),
    /Exactly one/,
  );
  await assert.rejects(
    lookupAppleApp(
      credentials,
      async () => new Response(null, { status: 401 }),
    ),
    /HTTP 401/,
  );
});


test("Codemagic SEC1 EC keys and PKCS8 keys both sign valid ES256 tokens", () => {
  const sec1 = createPrivateKey(keys.privateKey).export({type: "sec1", format: "pem"});
  assert(sec1.includes("BEGIN EC PRIVATE KEY"));
  for (const privateKey of [sec1, keys.privateKey]) {
    const [h, p, s] = appleAPIToken({...credentials, privateKey}).split(".");
    assert(verify("sha256", Buffer.from(h + "." + p),
      {key: keys.publicKey, dsaEncoding: "ieee-p1363"}, Buffer.from(s, "base64url")));
  }
  assert.throws(() => appleAPIToken({...credentials, privateKey: undefined}), /missing or empty/);
  const secret = "sensitive-invalid-key-never-echo";
  assert.throws(() => appleAPIToken({...credentials, privateKey: secret}), error =>
    error.message.includes("could not be parsed securely") && !error.message.includes(secret));
  const wrong = generateKeyPairSync("ec", {namedCurve: "secp384r1"}).privateKey.export({type:"pkcs8",format:"pem"});
  assert.throws(() => appleAPIToken({...credentials, privateKey: wrong}), /P-256/);
});
