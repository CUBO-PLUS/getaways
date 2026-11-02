import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, isBlogAdmin, assertSameOrigin, publishBlogDraft, unpublishBlogDraft, revalidatePath, revalidateTag } = vi.hoisted(() => ({
  db: { orm: { public: {
    BlogPost: { where: vi.fn() },
    BlogPublicationCategory: { where: vi.fn() },
  } } },
  isBlogAdmin: vi.fn(), assertSameOrigin: vi.fn(),
  publishBlogDraft: vi.fn(), unpublishBlogDraft: vi.fn(),
  revalidatePath: vi.fn(), revalidateTag: vi.fn(),
}));

vi.mock("@/infrastructure/prisma/db", () => ({ db }));
vi.mock("@/modules/content/server/blog-auth", () => ({ isBlogAdmin, assertSameOrigin }));
vi.mock("@/modules/content/server/blog-operations", () => ({ publishBlogDraft, unpublishBlogDraft, BlogConflict: class BlogConflict extends Error {} }));
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));

import { GET } from "@/app/api/blog/admin/posts/[id]/route";
import { POST as publish } from "@/app/api/blog/admin/posts/[id]/publish/route";
import { POST as unpublish } from "@/app/api/blog/admin/posts/[id]/unpublish/route";

const publishedAt = new Date("2024-03-05T00:00:00.000Z");
const doc = { type: "doc", content: [{ type: "paragraph" }] };
const publication = {
  title: "Title", excerpt: "Excerpt", document: doc, documentSchemaVersion: 1,
  coverMediaId: null, coverAlt: null, seoTitle: null, seoDescription: null,
};
const draft = { id: 12, ...publication, categories: [{ categoryId: 2 }, { categoryId: 1 }], publication };

beforeEach(() => {
  vi.clearAllMocks();
  isBlogAdmin.mockResolvedValue(true);
  assertSameOrigin.mockReturnValue(true);
  db.orm.public.BlogPost.where.mockReturnValue({ include: () => ({ include: () => ({ first: async () => draft }) }) });
  db.orm.public.BlogPublicationCategory.where.mockReturnValue({ all: async () => [{ categoryId: 1 }, { categoryId: 2 }] });
});

describe("blog publication routes", () => {
  it("reports no unpublished changes when publication fields and category membership match", async () => {
    const response = await GET(new Request("https://example.test"), { params: Promise.resolve({ id: "12" }) });
    expect((await response.json()).hasUnpublishedChanges).toBe(false);
  });

  it("detects category changes even when all publication fields match", async () => {
    db.orm.public.BlogPublicationCategory.where.mockReturnValue({ all: async () => [{ categoryId: 1 }] });
    const response = await GET(new Request("https://example.test"), { params: Promise.resolve({ id: "12" }) });
    expect((await response.json()).hasUnpublishedChanges).toBe(true);
  });

  it("invalidates the canonical publication URL using its published date on publish and unpublish", async () => {
    publishBlogDraft.mockResolvedValue({ id: 12, slug: "my-post", publishedAt, firstPublishedAt: publishedAt, publication, hasUnpublishedChanges: false });
    unpublishBlogDraft.mockResolvedValue({ id: 12, slug: "my-post", publishedAt, firstPublishedAt: publishedAt, publication: null, hasUnpublishedChanges: false });
    const request = () => new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: 3 }) });
    const context = { params: Promise.resolve({ id: "12" }) };

    expect((await publish(request(), context)).status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith("/2024/03/05/my-post");
    revalidatePath.mockClear();
    expect((await unpublish(request(), context)).status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith("/2024/03/05/my-post");
  });
});
