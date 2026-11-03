import { expect, it, vi } from "vitest";
import { GET } from "@/app/api/blog/media/[id]/route";

const { first } = vi.hoisted(() => ({ first: vi.fn() }));
vi.mock("@/infrastructure/prisma/db", () => ({
  db: { orm: { public: { MediaAsset: { where: () => ({ first }) } } } },
}));

it("does not allow caching a missing media response", async () => {
  first.mockResolvedValue(null);
  for (const id of ["0", "1"]) {
    const response = await GET(new Request(`https://example.test/api/blog/media/${id}`), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
});

it("returns a non-cacheable error when media lookup fails", async () => {
  first.mockRejectedValueOnce(new Error("database unavailable"));
  const response = await GET(new Request("https://example.test/api/blog/media/1"), { params: Promise.resolve({ id: "1" }) });
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
