import { requireThat } from "../src/security.js";
export async function verifyB2Access({
  keyId,
  applicationKey,
  bucket,
  purpose,
  fetchImpl = fetch,
  verifyImmutableRetention,
}) {
  requireThat(
    ["writer", "reader"].includes(purpose),
    "Invalid recovery credential purpose",
  );
  const response = await fetchImpl(
    "https://api.backblazeb2.com/b2api/v4/b2_authorize_account",
    {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(keyId + ":" + applicationKey).toString("base64"),
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  requireThat(response.ok, "Recovery credential validation failed");
  const data = await response.json(),
    allowed = data.apiInfo?.storageApi?.allowed;
  requireThat(
    allowed?.buckets?.length === 1 && allowed.buckets[0].name === bucket,
    "Recovery credential must be restricted to the exact backup bucket",
  );
  const caps = allowed.capabilities;
  requireThat(Array.isArray(caps), "Recovery credential capabilities missing");
  if (purpose === "writer") {
    const permitted = [
      "listBuckets",
      "listFiles",
      "readFiles",
      "writeFiles",
      "readBuckets",
      "readBucketEncryption",
    ];
    if (verifyImmutableRetention) {
      const proof = await verifyImmutableRetention();
      requireThat(proof?.mode === 'COMPLIANCE' && proof.days === 30, 'Verified immutable retention required');
      // Governance bypass cannot override COMPLIANCE retention, verified before and after every upload.
      permitted.push('bypassGovernance','deleteFiles','writeBucketEncryption','writeBucketLifecycleRules','writeBucketLogging','writeBucketNotifications','writeBucketReplications','readBucketRetentions','writeBucketRetentions','readFileRetentions','writeFileRetentions','readFileLegalHolds','writeFileLegalHolds');
    }
    requireThat(
      caps.includes("writeFiles") && caps.every((c) => permitted.includes(c)),
      "Unattended recovery writer must not delete versions, administer buckets or manage keys",
    );
  } else {
    requireThat(
      caps.includes("readFiles") &&
        caps.every((c) => !/^(write|delete|bypass)/.test(c)),
      "Recovery reader must be read-only",
    );
  }
  return { bucket, purpose, capabilities: caps };
}
