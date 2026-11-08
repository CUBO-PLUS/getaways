import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { InvalidImageError, optimizeImage } from "@/infrastructure/images/optimize";

describe("optimizeImage", () => {
  it("keeps clean WebP bytes unchanged on repeat optimization", async () => {
    const original = await sharp({ create: { width: 120, height: 80, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } }).webp().toBuffer();
    const once = await optimizeImage(original, { declaredMime: "image/webp" });
    const twice = await optimizeImage(once.bytes, { declaredMime: "image/webp" });
    expect(once.bytes).toEqual(original);
    expect(twice.bytes).toEqual(original);
    expect(await sharp(twice.bytes).metadata()).toMatchObject({ format: "webp", width: 120, height: 80, hasAlpha: true });
  });

  it("applies EXIF orientation and caps the longest output edge", async () => {
    const input = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "red" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect(await sharp(input).metadata()).toMatchObject({ orientation: 6, width: 3000, height: 1000 });
    const result = await optimizeImage(input, { declaredMime: "image/jpeg" });
    expect(result).toMatchObject({ mimeType: "image/webp", width: 853, height: 2560 });
    const output = await sharp(result.bytes).metadata();
    expect(output).toMatchObject({ format: "webp", width: 853, height: 2560 });
    expect(output.orientation).toBeUndefined();
  });

  it("rejects content/type mismatches and images beyond the pixel limit", async () => {
    const png = await sharp({ create: { width: 20, height: 10, channels: 3, background: "blue" } }).png().toBuffer();
    await expect(optimizeImage(png, { declaredMime: "image/jpeg" })).rejects.toBeInstanceOf(InvalidImageError);
    await expect(optimizeImage(png, { limitInputPixels: 199 })).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("recognizes AVIF reported by Sharp as HEIF with AV1 compression", async () => {
    const avif = await sharp({ create: { width: 16, height: 12, channels: 3, background: "purple" } }).avif().toBuffer();
    expect(await sharp(avif).metadata()).toMatchObject({ format: "heif", compression: "av1" });
    const result = await optimizeImage(avif, { declaredMime: "image/avif" });
    expect(await sharp(result.bytes).metadata()).toMatchObject({ format: "webp", width: 16, height: 12 });
  });
});
