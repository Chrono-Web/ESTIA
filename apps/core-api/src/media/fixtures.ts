import { compile, installImageData, supportsSimd, type RgbaImage } from "./codecs.js";

/**
 * Real images for the tests, encoded with the same libraries the instance
 * decodes with. Kept out of the build — the instance only ever decodes and
 * writes WebP thumbnails, and has no reason to carry a JPEG or PNG encoder.
 *
 * Generating them beats committing binary fixtures: the repository stays text,
 * and the test exercises an actual codec instead of a file someone once made.
 */

/** A gradient with fine detail, so that resizing and quality have something to work on. */
export function samplePixels(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;

      data[index] = Math.round((x * 255) / width);
      data[index + 1] = Math.round((y * 255) / height);
      data[index + 2] = (x ^ y) & 0xff;
      data[index + 3] = 255;
    }
  }

  return { data, height, width };
}

export async function encodeJpegForTests(image: RgbaImage, quality = 85): Promise<Uint8Array> {
  installImageData();

  const module = await import("@jsquash/jpeg/encode.js");

  await module.init(await compile("@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm"));

  return new Uint8Array(await module.default(image, { quality }));
}

export async function encodePngForTests(image: RgbaImage): Promise<Uint8Array> {
  installImageData();

  const module = await import("@jsquash/png/encode.js");

  await module.init(await compile("@jsquash/png/codec/pkg/squoosh_png_bg.wasm"));

  return new Uint8Array(await module.default(image));
}

export async function encodeWebpForTests(image: RgbaImage, quality = 85): Promise<Uint8Array> {
  installImageData();

  const module = await import("@jsquash/webp/encode.js");

  // Same variant selection the instance makes: the glue picks by SIMD support,
  // so the binary handed to it has to match.
  await module.init(
    await compile(
      supportsSimd()
        ? "@jsquash/webp/codec/enc/webp_enc_simd.wasm"
        : "@jsquash/webp/codec/enc/webp_enc.wasm",
    ),
  );

  return new Uint8Array(await module.default(image, { quality }));
}
