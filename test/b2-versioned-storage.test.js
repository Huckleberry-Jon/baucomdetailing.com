import test from "node:test";
import assert from "node:assert/strict";
import { b2VersionedStorage } from "../scripts/b2-versioned-storage.mjs";
const key = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/manifest.enc";
test("B2 recovery pins exact immutable versions and detects duplicates, missing receipts and tampering", async () => {
  const calls = [],
    versions = {},
    saved = [];
  let data = Buffer.from("encrypted fixture");
  const storage = b2VersionedStorage(
    {
      send: async (c) => {
        calls.push(c);
        return { VersionId: "immutable-v1" };
      },
    },
    {
      send: async (c) => {
        calls.push(c);
        return { Body: { transformToByteArray: async () => data } };
      },
    },
    "private-bucket",
    { versions, onVersion: async (v, k) => saved.push(k) },
  );
  await storage.put(key, data);
  assert.equal(calls[0].input.IfNoneMatch, undefined);
  assert.equal(saved[0], key);
  assert.equal((await storage.get(key)).toString(), "encrypted fixture");
  assert.equal(calls[1].input.VersionId, "immutable-v1");
  await assert.rejects(storage.put(key, data), /already recorded/);
  await assert.rejects(
    storage.get("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/index.json"),
    /receipt required/,
  );
  data = Buffer.from("tampered");
  await assert.rejects(storage.get(key), /checksum mismatch/);
  const readOnly = b2VersionedStorage(
    null,
    {
      send: async (c) => {
        assert.equal(c.input.VersionId, "immutable-v1");
        return {
          Body: {
            transformToByteArray: async () => Buffer.from("encrypted fixture"),
          },
        };
      },
    },
    "private-bucket",
    { versions: JSON.parse(JSON.stringify(versions)) },
  );
  assert.equal((await readOnly.get(key)).toString(), "encrypted fixture");
});
test("B2 recovery fails closed if the provider omits a version ID", async () => {
  const storage = b2VersionedStorage(
    { send: async () => ({}) },
    null,
    "private-bucket",
  );
  await assert.rejects(
    storage.put(key, Buffer.from("ciphertext")),
    /version missing/,
  );
  await assert.rejects(
    storage.put("../escape", Buffer.from("ciphertext")),
    /Invalid recovery/,
  );
});
