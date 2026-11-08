import { createHash } from "node:crypto";
import sharp from "sharp";

export const ACCEPTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/tiff",
]);

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_OUTPUT_EDGE = 2560;
const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "gif", "tiff"]);

export function optimizedImageKey(sourceKey: string, sha256: string): string {
  return `images/optimized/${createHash("sha256").update(sourceKey).digest("hex")}/${sha256}.webp`;
}

export class InvalidImageError extends Error {
  constructor(message = "Unsupported or invalid image") {
    super(message);
    this.name = "InvalidImageError";
  }
}

export async function optimizeImage(
  input: Buffer,
  options: { declaredMime?: string; limitInputPixels?: number; maxInputBytes?: number } = {},
): Promise<{ bytes: Buffer; mimeType: "image/webp"; extension: "webp"; width: number; height: number; sha256: string }> {
  const maxInputBytes = options.maxInputBytes ?? MAX_INPUT_BYTES;
  const limitInputPixels = options.limitInputPixels ?? MAX_INPUT_PIXELS;
  if (input.length === 0 || input.length > maxInputBytes) throw new InvalidImageError("Image size is outside the allowed range");

  const image = sharp(input, { animated: true, limitInputPixels, failOn: "error" });
  let metadata: Awaited<ReturnType<typeof image.metadata>>;
  let format: string;
  try {
    metadata = await image.metadata();
    format = metadata.format === "heif" && metadata.compression === "av1" ? "avif" : metadata.format ?? "";
    if (!SUPPORTED_FORMATS.has(format) || !metadata.width || !metadata.height) {
      throw new InvalidImageError();
    }
    if (metadata.pages && metadata.pages > 1) throw new InvalidImageError("Animated images are not supported");
    if (metadata.width * metadata.height > limitInputPixels) throw new InvalidImageError("Image dimensions exceed the allowed limit");
    const actualMime = `image/${format}`;
    if (!ACCEPTED_IMAGE_MIME_TYPES.has(actualMime) || (options.declaredMime && options.declaredMime !== actualMime)) {
      throw new InvalidImageError("Image content does not match its declared type");
    }
  } catch (error) {
    if (error instanceof InvalidImageError) throw error;
    throw new InvalidImageError();
  }

  const cleanWebp = format === "webp"
    && metadata.width <= MAX_OUTPUT_EDGE
    && metadata.height <= MAX_OUTPUT_EDGE
    && !metadata.orientation
    && !metadata.exif
    && !metadata.icc
    && !metadata.iptc
    && !metadata.xmp;
  let result: { data: Buffer; info: { width: number; height: number } };
  try {
    result = await image
      .autoOrient()
      .resize({ width: MAX_OUTPUT_EDGE, height: MAX_OUTPUT_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new InvalidImageError();
  }
  const bytes = cleanWebp ? input : result.data;
  const width = cleanWebp ? metadata.width : result.info.width;
  const height = cleanWebp ? metadata.height : result.info.height;
  return {
    bytes,
    mimeType: "image/webp",
    extension: "webp",
    width,
    height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
