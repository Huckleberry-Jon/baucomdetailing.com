import { parentPort, workerData } from "node:worker_threads";
import decode from "heic-decode";
import sharp from "sharp";
let images;
try {
  images = await decode.all({ buffer: Buffer.from(workerData) });
  if (!images.length || images.length > 16)
    throw Error("Unsupported HEIC image collection");
  const first = images[0];
  if (
    !Number.isInteger(first.width) ||
    !Number.isInteger(first.height) ||
    first.width < 1 ||
    first.height < 1 ||
    first.width * first.height > 40000000
  )
    throw Error("HEIC exceeds 40 megapixel limit");
  const raw = await first.decode();
  const preview = await sharp(Buffer.from(raw.data), {
    raw: { width: raw.width, height: raw.height, channels: 4 },
  })
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();
  parentPort.postMessage({ preview, width: raw.width, height: raw.height });
} catch {
  parentPort.postMessage({
    error: "Could not decode HEIC/HEIF photograph or image limits exceeded.",
  });
} finally {
  images?.dispose();
}
