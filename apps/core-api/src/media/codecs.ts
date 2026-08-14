import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * The only place that knows jSquash exists (ADR 0011).
 *
 * jSquash is built for browsers, and two things do not hold in Node:
 *
 * 1. its Emscripten glue fetches the `.wasm` next to itself, and `fetch` does
 *    not speak `file:` — so the binary is read from disk and handed to the
 *    `init(module)` entry point jSquash exposes for exactly this case;
 * 2. `ImageData` is a browser global that the codecs construct, and Node has
 *    none — so a minimal one is defined, only when it is missing.
 *
 * Everything is instantiated on first use: an instance where nobody posts a
 * photo never pays for any of it.
 */

export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Node has WebAssembly, but TypeScript declares it only in `lib.dom`, which a
 * server has no reason to pull in. Declared here as narrowly as it is used.
 */
interface CompiledWasm {
  readonly exports?: unknown;
}

declare const WebAssembly: {
  Module: new (bytes: Uint8Array) => CompiledWasm;
  validate: (bytes: Uint8Array) => boolean;
};

/**
 * A module using `v128` instructions: it validates only where SIMD is
 * available. `@jsquash/webp` picks its glue the same way, so the `.wasm` we
 * hand it has to match the variant it chose.
 */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
]);

/** Exported so the test fixtures, which encode with the same libraries, share it. */
export function installImageData(): void {
  if ("ImageData" in globalThis) {
    return;
  }

  Object.defineProperty(globalThis, "ImageData", {
    configurable: true,
    value: class ImageData {
      public readonly colorSpace = "srgb";

      public constructor(
        public readonly data: Uint8ClampedArray,
        public readonly width: number,
        public readonly height: number,
      ) {}
    },
    writable: true,
  });
}

/** Whether this runtime has SIMD, which decides the WebP encoder variant. */
export function supportsSimd(): boolean {
  return WebAssembly.validate(SIMD_PROBE);
}

export async function compile(specifier: string): Promise<CompiledWasm> {
  return new WebAssembly.Module(await readFile(fileURLToPath(import.meta.resolve(specifier))));
}

type Decoder = (bytes: ArrayBuffer) => Promise<RgbaImage>;
type Encoder = (image: RgbaImage) => Promise<ArrayBuffer>;
type Resizer = (
  image: RgbaImage,
  width: number,
  height: number,
  opaque: boolean,
) => Promise<RgbaImage>;

let jpegDecoder: Promise<Decoder> | undefined;
let pngDecoder: Promise<Decoder> | undefined;
let webpDecoder: Promise<Decoder> | undefined;
let webpEncoder: Promise<Encoder> | undefined;
let resizer: Promise<Resizer> | undefined;

async function loadJpegDecoder(): Promise<Decoder> {
  installImageData();

  const module = await import("@jsquash/jpeg/decode.js");
  await module.init(await compile("@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm"));

  return async (bytes) => module.default(bytes);
}

async function loadPngDecoder(): Promise<Decoder> {
  installImageData();

  const module = await import("@jsquash/png/decode.js");
  await module.init(await compile("@jsquash/png/codec/pkg/squoosh_png_bg.wasm"));

  return async (bytes) => module.default(bytes);
}

async function loadWebpDecoder(): Promise<Decoder> {
  installImageData();

  const module = await import("@jsquash/webp/decode.js");
  await module.init(await compile("@jsquash/webp/codec/dec/webp_dec.wasm"));

  return async (bytes) => module.default(bytes);
}

async function loadWebpEncoder(): Promise<Encoder> {
  installImageData();

  const module = await import("@jsquash/webp/encode.js");
  const variant = supportsSimd()
    ? "@jsquash/webp/codec/enc/webp_enc_simd.wasm"
    : "@jsquash/webp/codec/enc/webp_enc.wasm";

  await module.init(await compile(variant));

  return async (image) => module.default(image, { quality: THUMBNAIL_QUALITY });
}

async function loadResizer(): Promise<Resizer> {
  installImageData();

  const module = await import("@jsquash/resize");
  await module.initResize(await compile("@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm"));

  return async (image, width, height, opaque) =>
    module.default(image, {
      height,
      // `premultiply` and `linearRGB` are per-pixel passes in JavaScript, not
      // in Wasm, and cost three quarters of the processing time (ADR 0011).
      // Premultiplying is only meaningful where there is transparency to bleed.
      linearRGB: false,
      method: "lanczos3",
      premultiply: !opaque,
      width,
    });
}

/** Quality of the generated thumbnail. 75 is where WebP stops paying visibly. */
const THUMBNAIL_QUALITY = 75;

export async function decodeJpeg(bytes: ArrayBuffer): Promise<RgbaImage> {
  jpegDecoder ??= loadJpegDecoder();

  return (await jpegDecoder)(bytes);
}

export async function decodePng(bytes: ArrayBuffer): Promise<RgbaImage> {
  pngDecoder ??= loadPngDecoder();

  return (await pngDecoder)(bytes);
}

export async function decodeWebp(bytes: ArrayBuffer): Promise<RgbaImage> {
  webpDecoder ??= loadWebpDecoder();

  return (await webpDecoder)(bytes);
}

export async function encodeWebp(image: RgbaImage): Promise<ArrayBuffer> {
  webpEncoder ??= loadWebpEncoder();

  return (await webpEncoder)(image);
}

export async function resizeImage(
  image: RgbaImage,
  width: number,
  height: number,
  opaque: boolean,
): Promise<RgbaImage> {
  resizer ??= loadResizer();

  return (await resizer)(image, width, height, opaque);
}
