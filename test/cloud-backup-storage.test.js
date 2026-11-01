import test from "node:test";
import assert from "node:assert/strict";
import {
  s3Storage,
  recoveryReaderCredentials,
} from "../scripts/cloud-backup.mjs";
test("backup uploader and read-back verifier use independent bucket credentials without deletion calls", async () => {
  const writes = [],
    reads = [];
  const store = s3Storage(
    {
      send: async (c) => {
        writes.push(c);
        return {};
      },
    },
    "isolated-bucket",
    {
      send: async (c) => {
        reads.push(c);
        return {
          Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
        };
      },
    },
  );
  await store.put("archive/manifest.enc", Buffer.from([1, 2, 3]));
  assert.deepEqual(
    await store.get("archive/manifest.enc"),
    Buffer.from([1, 2, 3]),
  );
  assert.equal(writes.length, 1);
  assert.equal(reads.length, 1);
  assert.equal(writes[0].constructor.name, "PutObjectCommand");
  assert.equal(reads[0].constructor.name, "GetObjectCommand");
  assert.equal(writes[0].input.IfNoneMatch, "*");
  assert.equal(reads[0].input.Bucket, "isolated-bucket");
  assert.throws(() =>
    recoveryReaderCredentials({ RECOVERY_READ_ACCESS_KEY_ID: "incomplete" }),
  );
  assert.throws(() =>
    recoveryReaderCredentials({
      RECOVERY_READ_SECRET_ACCESS_KEY: "incomplete",
    }),
  );
  assert.equal(recoveryReaderCredentials({}), null);
  assert.deepEqual(
    recoveryReaderCredentials({
      RECOVERY_READ_ACCESS_KEY_ID: "read-id",
      RECOVERY_READ_SECRET_ACCESS_KEY: "read-secret",
    }),
    { accessKeyId: "read-id", secretAccessKey: "read-secret" },
  );
});
