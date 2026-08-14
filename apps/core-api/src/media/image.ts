import { decodeJpeg, decodePng, decodeWebp, encodeWebp, resizeImage } from "./codecs.js";

/**
 * What the instance accepts. Everything else is refused, whatever the upload
 * claims to be: the type is read from the bytes, never from the extension or
 * the declared header (ADR 0011).
 */
export type ImageFormat = "jpeg" | "png" | "webp";

export const IMAGE_MEDIA_TYPES: Readonly<Record<ImageFormat, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export interface Dimensions {
  width: number;
  height: number;
}

export interface Thumbnail extends Dimensions {
  bytes: Uint8Array;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** Reads the type from the content itself, which is the only thing that can be trusted. */
export function sniffFormat(bytes: Uint8Array): ImageFormat | undefined {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "jpeg";
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }

  // RIFF....WEBP
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }

  return undefined;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readPngDimensions(bytes: Uint8Array): Dimensions | undefined {
  // IHDR is mandated to be the first chunk: length, type, then width and height.
  if (bytes.byteLength < 24 || !startsWith(bytes, [0x49, 0x48, 0x44, 0x52], 12)) {
    return undefined;
  }

  const data = view(bytes);

  return { height: data.getUint32(20), width: data.getUint32(16) };
}

/** Markers that carry no length field, so the walk must not try to skip past one. */
const JPEG_STANDALONE = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9]);

/** Frame headers. `c4`, `c8` and `cc` share the range but are tables, not frames. */
function isJpegFrameHeader(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function readJpegDimensions(bytes: Uint8Array): Dimensions | undefined {
  const data = view(bytes);
  let offset = 2;

  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      return undefined;
    }

    const marker = bytes[offset + 1]!;

    if (marker === 0xff) {
      // Fill byte before the real marker.
      offset += 1;
      continue;
    }

    if (JPEG_STANDALONE.has(marker)) {
      offset += 2;
      continue;
    }

    const length = data.getUint16(offset + 2);

    if (length < 2 || offset + 2 + length > bytes.byteLength) {
      return undefined;
    }

    if (isJpegFrameHeader(marker)) {
      // precision, height, width — in that order, right after the length.
      return { height: data.getUint16(offset + 5), width: data.getUint16(offset + 7) };
    }

    if (marker === 0xda) {
      // Start of scan: the frame header should have come first.
      return undefined;
    }

    offset += 2 + length;
  }

  return undefined;
}

function readWebpDimensions(bytes: Uint8Array): Dimensions | undefined {
  if (bytes.byteLength < 30) {
    return undefined;
  }

  const data = view(bytes);
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));

  if (chunk === "VP8X") {
    // Canvas size, as two 24-bit little-endian values minus one.
    const width = (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)) + 1;
    const height = (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)) + 1;

    return { height, width };
  }

  if (chunk === "VP8 ") {
    // Lossy: a three byte frame tag, the sync code, then the two sizes.
    if (!startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) {
      return undefined;
    }

    return {
      height: data.getUint16(28, true) & 0x3fff,
      width: data.getUint16(26, true) & 0x3fff,
    };
  }

  if (chunk === "VP8L") {
    // Lossless: a signature byte, then two 14-bit sizes minus one, packed.
    if (bytes[20] !== 0x2f) {
      return undefined;
    }

    const packed = data.getUint32(21, true);

    return { height: ((packed >> 14) & 0x3fff) + 1, width: (packed & 0x3fff) + 1 };
  }

  return undefined;
}

/**
 * Reads the pixel size **from the header, without decoding**.
 *
 * That order is the whole point: a few hundred kilobytes can expand into
 * gigabytes of memory, so the size has to be known before anything allocates
 * for it (ADR 0011, punto 2).
 */
export function readDimensions(bytes: Uint8Array, format: ImageFormat): Dimensions | undefined {
  const dimensions =
    format === "jpeg"
      ? readJpegDimensions(bytes)
      : format === "png"
        ? readPngDimensions(bytes)
        : readWebpDimensions(bytes);

  if (dimensions === undefined || dimensions.width <= 0 || dimensions.height <= 0) {
    return undefined;
  }

  return dimensions;
}

/** JPEG segments kept: everything except the application slots and comments. */
function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const data = view(bytes);
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;

  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      return bytes;
    }

    const marker = bytes[offset + 1]!;

    if (marker === 0xff) {
      offset += 1;
      continue;
    }

    if (JPEG_STANDALONE.has(marker)) {
      kept.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    const length = data.getUint16(offset + 2);

    if (length < 2 || offset + 2 + length > bytes.byteLength) {
      return bytes;
    }

    if (marker === 0xda) {
      // From the start of scan onwards it is entropy-coded data with no
      // segment structure: it goes through untouched, to the last byte.
      kept.push(bytes.subarray(offset));

      return concat(kept);
    }

    // APP1..APP15 hold Exif — the GPS coordinates of whoever took the photo —
    // along with XMP, thumbnails and anything else a device felt like adding.
    // APP0 is the JFIF header and stays. Colour profiles travel in APP2 and go
    // with the rest: what the instance stores is sRGB, like the browser
    // produces (ADR 0011).
    const isApplicationSegment = marker >= 0xe1 && marker <= 0xef;

    if (!isApplicationSegment && marker !== 0xfe) {
      kept.push(bytes.subarray(offset, offset + 2 + length));
    }

    offset += 2 + length;
  }

  // The walk ran out before the scan: the structure was not what it claimed,
  // so nothing is rewritten.
  return bytes;
}

/** PNG chunks needed to draw it, animation included. Everything else goes. */
const PNG_KEPT_CHUNKS = new Set([
  "IHDR",
  "PLTE",
  "tRNS",
  "IDAT",
  "IEND",
  "gAMA",
  "sRGB",
  "acTL",
  "fcTL",
  "fdAT",
]);

function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  const data = view(bytes);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;

  while (offset + 12 <= bytes.byteLength) {
    const length = data.getUint32(offset);
    const end = offset + 12 + length;

    if (end > bytes.byteLength) {
      return bytes;
    }

    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));

    if (PNG_KEPT_CHUNKS.has(type)) {
      kept.push(bytes.subarray(offset, end));
    }

    offset = end;

    if (type === "IEND") {
      return concat(kept);
    }
  }

  // No end marker: same rule as for JPEG, the bytes go back as they came.
  return bytes;
}

/** RIFF chunks needed to draw it. `EXIF`, `XMP ` and `ICCP` are not among them. */
const WEBP_KEPT_CHUNKS = new Set(["VP8X", "ALPH", "VP8 ", "VP8L", "ANIM", "ANMF"]);

function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
  const data = view(bytes);
  const kept: Uint8Array[] = [];
  let offset = 12;

  while (offset + 8 <= bytes.byteLength) {
    const length = data.getUint32(offset + 4, true);
    // Chunks are padded to an even size, and the padding byte is not counted.
    const end = offset + 8 + length + (length % 2);

    if (end > bytes.byteLength) {
      return bytes;
    }

    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));

    if (WEBP_KEPT_CHUNKS.has(type)) {
      const chunk = bytes.slice(offset, end);

      // The flags in VP8X announce chunks that are about to disappear, and a
      // file that announces what it no longer contains is a broken file.
      if (type === "VP8X" && chunk.length >= 9) {
        // The flags byte is the first of the chunk's data, after type and size.
        chunk[8] = chunk[8]! & ~0x2c; // ICC profile, Exif and XMP.
      }

      kept.push(chunk);
    }

    offset = end;
  }

  if (offset !== bytes.byteLength) {
    // Trailing bytes that are not a chunk: unrecognised structure, left alone.
    return bytes;
  }

  const body = concat(kept);
  const header = new Uint8Array(12);

  header.set(bytes.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.byteLength + 4, true);

  return concat([header, body]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }

  return out;
}

/**
 * Removes everything that is not needed to draw the image.
 *
 * Two reasons, and the first is the one that matters to a member: a photo taken
 * with a phone carries the coordinates of where it was taken, and a
 * neighbourhood feed is the last place where that should travel by accident.
 * The second is that those same slots can carry arbitrary bytes, and an
 * instance has no reason to store and serve them.
 *
 * It is a rewrite of the container, not of the pixels: nothing is re-encoded
 * and nothing loses quality. Anything unexpected leaves the bytes untouched —
 * the image has already been validated by then, and a stripper that mangles a
 * file it did not understand would be worse than one that gives up.
 */
export function stripMetadata(bytes: Uint8Array, format: ImageFormat): Uint8Array {
  if (format === "jpeg") {
    return stripJpegMetadata(bytes);
  }

  return format === "png" ? stripPngMetadata(bytes) : stripWebpMetadata(bytes);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Fits the image inside a square of `maxSide` without ever enlarging it. */
export function thumbnailSize(source: Dimensions, maxSide: number): Dimensions {
  const longest = Math.max(source.width, source.height);

  if (longest <= maxSide) {
    return { height: source.height, width: source.width };
  }

  const ratio = maxSide / longest;

  return {
    height: Math.max(1, Math.round(source.height * ratio)),
    width: Math.max(1, Math.round(source.width * ratio)),
  };
}

/**
 * Decodes, resizes and re-encodes to WebP, which the measurement in ADR 0011
 * found to be half the size of JPEG at the same time and quality.
 *
 * Decoding is also the real validation: a file that claims to be an image and
 * does not decode never gets stored.
 */
export async function makeThumbnail(
  bytes: Uint8Array,
  format: ImageFormat,
  maxSide: number,
): Promise<Thumbnail> {
  const buffer = toArrayBuffer(bytes);
  const decoded =
    format === "jpeg"
      ? await decodeJpeg(buffer)
      : format === "png"
        ? await decodePng(buffer)
        : await decodeWebp(buffer);

  const size = thumbnailSize(decoded, maxSide);
  // A JPEG is always opaque, so there is no transparency to premultiply.
  const resized =
    size.width === decoded.width && size.height === decoded.height
      ? decoded
      : await resizeImage(decoded, size.width, size.height, format === "jpeg");

  return {
    bytes: new Uint8Array(await encodeWebp(resized)),
    height: resized.height,
    width: resized.width,
  };
}
