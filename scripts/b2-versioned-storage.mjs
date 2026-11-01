import { verifyObjectRetention } from "./b2-retention.mjs";
import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireThat } from "../src/security.js";
const sha = (b) => createHash("sha256").update(b).digest("hex");
// B2 does not implement S3 conditional PUT. Preserve exact immutable versions instead.
// Keep this receipt outside the storage provider, and never delete retained versions.
export function b2VersionedStorage(
  writer,
  reader,
  bucket,
  { versions = {}, onVersion = async () => {}, immutableDays = 0 } = {},
) {
  const inFlight = new Set();
  const validate = (key) =>
    requireThat(
      /^[a-f0-9-]{36}\/(?:media-\d+\.enc|manifest\.enc|index\.json|verified\.json)$/.test(
        key,
      ),
      "Invalid recovery object name",
    );
  return {
    versions,
    async put(key, bytes) {
      validate(key);
      requireThat(
        !Object.hasOwn(versions, key) && !inFlight.has(key),
        "Recovery object already recorded; use a new backup ID",
      );
      inFlight.add(key);
      try {
        const result = await writer.send(
          new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes,
            ...(immutableDays ? {ObjectLockMode:'COMPLIANCE',ObjectLockRetainUntilDate:new Date(Date.now()+immutableDays*86400000),ContentMD5:createHash('md5').update(bytes).digest('base64')} : {})
          }),
        );
        requireThat(
          typeof result.VersionId === "string" &&
            result.VersionId.length > 0 &&
            result.VersionId.length < 1024,
          "B2 object version missing; recovery not verified",
        );
        const retention = immutableDays ? await verifyObjectRetention(reader, bucket, key, result.VersionId, immutableDays) : null;
        versions[key] = {
          versionId: result.VersionId,
          sha256: sha(bytes),
          bytes: bytes.length,
          ...(retention ? {retention} : {}),
        };
        await onVersion(versions, key);
      } finally {
        inFlight.delete(key);
      }
    },
    async get(key) {
      validate(key);
      const v = Object.hasOwn(versions, key) ? versions[key] : null;
      requireThat(
        v &&
          typeof v.versionId === "string" &&
          v.versionId.length > 0 &&
          /^[a-f0-9]{64}$/.test(v.sha256) &&
          Number.isSafeInteger(v.bytes) &&
          v.bytes >= 0,
        "Pinned recovery version receipt required",
      );
      const result = await reader.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          VersionId: v.versionId,
        }),
      );
      const bytes = Buffer.from(await result.Body.transformToByteArray());
      requireThat(
        bytes.length === v.bytes && sha(bytes) === v.sha256,
        "Pinned recovery object checksum mismatch",
      );
      return bytes;
    },
  };
}
