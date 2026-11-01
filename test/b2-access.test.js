import test from "node:test";
import assert from "node:assert/strict";
import { verifyB2Access } from "../scripts/b2-access.mjs";
test("unattended B2 backup refuses console writer delete/admin scope and any cross-bucket or writable reader key", async () => {
  const input = {
    keyId: "fixture-id",
    applicationKey: "fixture-secret",
    bucket: "isolated-backup",
    purpose: "writer",
  };
  const fake =
    (caps, buckets = [{ name: input.bucket }]) =>
    async (url, options) => {
      assert.equal(
        url,
        "https://api.backblazeb2.com/b2api/v4/b2_authorize_account",
      );
      assert.equal(options.redirect, "error");
      return {
        ok: true,
        json: async () => ({
          authorizationToken: "must-not-return",
          apiInfo: { storageApi: { allowed: { buckets, capabilities: caps } } },
        }),
      };
    };
  const minimal = await verifyB2Access({
    ...input,
    fetchImpl: fake(["listBuckets", "writeFiles"]),
  });
  assert.deepEqual(minimal.capabilities, ["listBuckets", "writeFiles"]);
  assert.ok(!JSON.stringify(minimal).includes("must-not-return"));
  for (const denied of [
    "deleteFiles",
    "writeBucketLifecycleRules",
    "writeKeys",
    "writeBucketEncryption",
    "bypassGovernance",
  ])
    await assert.rejects(
      verifyB2Access({ ...input, fetchImpl: fake(["writeFiles", denied]) }),
      /must not delete/,
    );
  await assert.rejects(
    verifyB2Access({ ...input, fetchImpl: fake(["writeFiles"], null) }),
    /exact backup bucket/,
  );
  await assert.rejects(
    verifyB2Access({
      ...input,
      purpose: "reader",
      fetchImpl: fake(["readFiles", "writeFiles"]),
    }),
    /read-only/,
  );
  assert.equal(
    (
      await verifyB2Access({
        ...input,
        purpose: "reader",
        fetchImpl: fake(["readFiles", "listFiles"]),
      })
    ).purpose,
    "reader",
  );
});
