import { describe, expect, it } from "vitest";

import {
  makeThumbnail,
  readDimensions,
  sniffFormat,
  stripMetadata,
  thumbnailSize,
} from "./image.js";
import {
  encodeJpegForTests,
  encodePngForTests,
  encodeWebpForTests,
  samplePixels,
} from "./fixtures.js";

describe("reading the type from the content", () => {
  it("recognises what it accepts", async () => {
    expect(sniffFormat(await encodeJpegForTests(samplePixels(64, 48)))).toBe("jpeg");
    expect(sniffFormat(await encodePngForTests(samplePixels(64, 48)))).toBe("png");
    expect(sniffFormat(await encodeWebpForTests(samplePixels(64, 48)))).toBe("webp");
  });

  it("refuses a file that only claims to be an image", () => {
    // The name and the declared type say JPEG; the bytes say otherwise, and the
    // bytes are what counts (ADR 0011, punto 1).
    expect(sniffFormat(Buffer.from("GIF89a and then whatever", "utf8"))).toBeUndefined();
    expect(sniffFormat(Buffer.from("<?php echo 'ciao'; ?>", "utf8"))).toBeUndefined();
    expect(sniffFormat(new Uint8Array(0))).toBeUndefined();
  });
});

describe("reading the size before decoding", () => {
  it("agrees with the encoders, on every accepted format", async () => {
    const pixels = samplePixels(321, 123);

    for (const [format, bytes] of [
      ["jpeg", await encodeJpegForTests(pixels)],
      ["png", await encodePngForTests(pixels)],
      ["webp", await encodeWebpForTests(pixels)],
    ] as const) {
      expect({ format, ...readDimensions(bytes, format) }).toEqual({
        format,
        height: 123,
        width: 321,
      });
    }
  });

  it("gives up on a truncated header instead of guessing", async () => {
    const jpeg = await encodeJpegForTests(samplePixels(64, 48));

    expect(readDimensions(jpeg.subarray(0, 10), "jpeg")).toBeUndefined();
    expect(readDimensions(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "png")).toBeUndefined();
  });

  /**
   * The reason the size is read from the header at all: this file is a few
   * hundred bytes and claims a picture of about a hundred million pixels, which
   * would be some four hundred megabytes of memory if anything decoded it.
   */
  it("sees a decompression bomb without decoding it", async () => {
    const bomb = await encodePngForTests(samplePixels(8, 8));
    const header = new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength);

    header.setUint32(16, 10_000);
    header.setUint32(20, 10_000);

    const claimed = readDimensions(bomb, "png")!;

    expect(claimed.width * claimed.height).toBe(100_000_000);
    expect(bomb.byteLength).toBeLessThan(1000);
  });
});

describe("stripping what is not needed to draw the image", () => {
  /** An Exif block with a recognisable payload, in the segment a phone uses for GPS. */
  function withExif(jpeg: Uint8Array, payload: string): Uint8Array {
    const body = Buffer.from(`Exif\0\0${payload}`, "utf8");
    const segment = Buffer.alloc(4 + body.byteLength);

    segment[0] = 0xff;
    segment[1] = 0xe1;
    segment.writeUInt16BE(body.byteLength + 2, 2);
    body.copy(segment, 4);

    return Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]);
  }

  it("removes Exif from a JPEG and leaves an image that still decodes", async () => {
    const original = await encodeJpegForTests(samplePixels(120, 90));
    const tagged = withExif(original, "GPS 45.4642 N, 9.1900 E");

    expect(Buffer.from(tagged).includes("45.4642")).toBe(true);

    const stripped = stripMetadata(tagged, "jpeg");

    expect(Buffer.from(stripped).includes("45.4642")).toBe(false);
    expect(Buffer.from(stripped).includes("Exif")).toBe(false);
    // The pixels are untouched: it is the container that was rewritten.
    expect(readDimensions(stripped, "jpeg")).toEqual({ height: 90, width: 120 });
    expect((await makeThumbnail(stripped, "jpeg", 64)).width).toBe(64);
  });

  it("removes a PNG text chunk and keeps the image readable", async () => {
    const original = await encodePngForTests(samplePixels(100, 100));
    const chunk = Buffer.alloc(12 + 20);

    chunk.writeUInt32BE(20, 0);
    chunk.write("tEXt", 4, "latin1");
    chunk.write("Comment\0scattata a casa", 8, "latin1");

    // Right after the signature and IHDR, where a writer would put it.
    const tagged = Buffer.concat([original.subarray(0, 33), chunk, original.subarray(33)]);
    const stripped = stripMetadata(tagged, "png");

    expect(Buffer.from(tagged).includes("scattata a casa")).toBe(true);
    expect(Buffer.from(stripped).includes("scattata a casa")).toBe(false);
    expect(readDimensions(stripped, "png")).toEqual({ height: 100, width: 100 });
    expect((await makeThumbnail(stripped, "png", 50)).width).toBe(50);
  });

  it("leaves a WebP it did not change intact", async () => {
    const original = await encodeWebpForTests(samplePixels(80, 60));
    const stripped = stripMetadata(original, "webp");

    expect(readDimensions(stripped, "webp")).toEqual({ height: 60, width: 80 });
    expect((await makeThumbnail(stripped, "webp", 40)).height).toBe(30);
  });

  it("hands back untouched bytes rather than mangling something it cannot parse", () => {
    const nonsense = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03]);

    expect(stripMetadata(nonsense, "jpeg")).toEqual(nonsense);
  });
});

describe("thumbnails", () => {
  it("fits the long side and keeps the proportions", () => {
    expect(thumbnailSize({ height: 1200, width: 1600 }, 640)).toEqual({ height: 480, width: 640 });
    expect(thumbnailSize({ height: 1600, width: 1200 }, 640)).toEqual({ height: 640, width: 480 });
  });

  it("never enlarges a small image", () => {
    expect(thumbnailSize({ height: 100, width: 120 }, 640)).toEqual({ height: 100, width: 120 });
  });

  it("is a WebP whatever went in", async () => {
    for (const [format, bytes] of [
      ["jpeg", await encodeJpegForTests(samplePixels(800, 600))],
      ["png", await encodePngForTests(samplePixels(800, 600))],
      ["webp", await encodeWebpForTests(samplePixels(800, 600))],
    ] as const) {
      const thumbnail = await makeThumbnail(bytes, format, 320);

      expect({ format, sniffed: sniffFormat(thumbnail.bytes) }).toEqual({
        format,
        sniffed: "webp",
      });
      expect(thumbnail).toMatchObject({ height: 240, width: 320 });
      // Half the size of the same thumbnail in JPEG, which is why it is WebP.
      expect(thumbnail.bytes.byteLength).toBeLessThan(bytes.byteLength);
    }
  });

  it("refuses bytes that pass the signature but do not decode", async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 0x41)]);

    await expect(makeThumbnail(broken, "jpeg", 320)).rejects.toThrow();
  });
});
