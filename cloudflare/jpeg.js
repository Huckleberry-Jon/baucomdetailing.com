import { requireThat } from "../src/security.js";
// Strip APP/COM segments, including between progressive scans; preserve encoded pixels.
export function stripJpegMetadata(input) {
  const b = Buffer.from(input),
    out = [b.subarray(0, 2)];
  requireThat(
    b.length >= 4 && b[0] === 255 && b[1] === 216,
    "Invalid JPEG output",
  );
  let at = 2;
  while (at < b.length) {
    requireThat(b[at] === 255, "Invalid JPEG marker");
    let p = at + 1;
    while (b[p] === 255) p++;
    requireThat(p < b.length, "Truncated JPEG marker");
    const marker = b[p];
    if (marker === 217) {
      out.push(b.subarray(at, p + 1));
      return Buffer.concat(out);
    }
    requireThat(marker !== 0 && marker !== 216, "Invalid JPEG segment");
    if (marker === 1 || (marker >= 208 && marker <= 215)) {
      out.push(b.subarray(at, p + 1));
      at = p + 1;
      continue;
    }
    requireThat(p + 2 < b.length, "Truncated JPEG length");
    const length = b.readUInt16BE(p + 1),
      end = p + 1 + length;
    requireThat(length >= 2 && end <= b.length, "Invalid JPEG segment length");
    if (!(marker >= 224 && marker <= 239) && marker !== 254)
      out.push(b.subarray(at, end));
    at = end;
    if (marker === 218) {
      let scan = at;
      while (scan < b.length) {
        if (b[scan] !== 255) {
          scan++;
          continue;
        }
        const next = b[scan + 1];
        if (next === 0 || (next >= 208 && next <= 215)) {
          scan += 2;
          continue;
        }
        if (next === 255) {
          scan++;
          continue;
        }
        break;
      }
      out.push(b.subarray(at, scan));
      at = scan;
    }
  }
  requireThat(false, "JPEG end marker missing");
}
