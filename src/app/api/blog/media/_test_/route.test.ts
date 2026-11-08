import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { send, create, transaction, sameOrigin, recheck, access } = vi.hoisted(() => ({
  send: vi.fn(), create: vi.fn(), transaction: vi.fn(), sameOrigin: vi.fn(), recheck: vi.fn(), access: vi.fn(),
}));
vi.mock("@/infrastructure/storage/s3", () => ({ getS3Client: () => ({ send }), getBlogMediaBucket: () => "blog-media" }));
vi.mock("@/infrastructure/prisma/db", () => ({ db: { transaction } }));
vi.mock("@/modules/auth/server/auth", () => ({ assertSameOrigin: sameOrigin }));
vi.mock("@/modules/content/server/blog-auth", () => ({
  requireBlogAccess: access, recheckBlogAccess: recheck, blogAccessResponse: () => null,
}));
import { POST } from "@/app/api/blog/media/route";

beforeEach(() => {
  vi.clearAllMocks();
  sameOrigin.mockReturnValue(true);
  access.mockResolvedValue({ userId: "editor" });
  transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback({ orm: { public: { MediaAsset: { create } } } }));
});

async function uploadRequest(image: Buffer) {
  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from(image)], { type: "image/png" }), "upload.png");
  const encoded = new Request("https://example.test/api/blog/media", { method: "POST", body: form });
  const body = Buffer.from(await encoded.arrayBuffer());
  return new Request(encoded.url, { method: "POST", headers: { "content-type": encoded.headers.get("content-type")!, "content-length": String(body.length) }, body });
}

describe("POST /api/blog/media", () => {
  it("stores actual WebP bytes and persists matching MIME, byte size, and dimensions", async () => {
    const input = await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.4 } } }).png().toBuffer();
    create.mockResolvedValue({ id: 17 });
    let stored: Buffer | undefined;
    send.mockImplementation(async command => {
      if (command.constructor.name === "PutObjectCommand") stored = Buffer.from(command.input.Body);
      return {};
    });

    const response = await POST(await uploadRequest(input));
    const metadata = await sharp(stored!).metadata();
    expect(response.status).toBe(201);
    expect(metadata).toMatchObject({ format: "webp", width: 40, height: 20, hasAlpha: true });
    expect(send.mock.calls[0][0].input).toMatchObject({ ContentType: "image/webp" });
    expect(create.mock.calls[0][0]).toMatchObject({ mimeType: "image/webp", sizeBytes: BigInt(stored!.length), width: metadata.width, height: metadata.height });
  });

  it("deletes the uploaded object if the asset row cannot be created", async () => {
    const input = await sharp({ create: { width: 8, height: 6, channels: 3, background: "red" } }).png().toBuffer();
    create.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(await uploadRequest(input));
    expect(response.status).toBe(503);
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(["PutObjectCommand", "DeleteObjectCommand"]);
  });
});
