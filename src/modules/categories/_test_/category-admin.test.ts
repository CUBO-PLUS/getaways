import { expect, it, vi } from "vitest";

const { db, enqueueRagSource } = vi.hoisted(() => ({ db: { transaction: vi.fn(), raw: { sql: () => ({ returnsRow: () => ({ build: () => ({}) }) }) } }, enqueueRagSource: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/infrastructure/prisma/db", () => ({ db }));
vi.mock("@/infrastructure/prisma/rag-source-queue", () => ({ enqueueRagSource }));

import { deleteCategory, updateCategory } from "../server/category-admin";

for (const kind of ["blog", "listings"] as const) {
  it(`${kind} category can be renamed back to its own reserved former slug`, async () => {
    const original = { id: 7, name: "Renamed", slug: "new-slug" };
    const aliases: { slug: string; categoryId: number }[] = [{ slug: "old-slug", categoryId: 7 }];
    const outgoingAliases: { slug: string; categoryId: number }[] = [];
    const category = {
      where: vi.fn(() => ({
        forUpdate: () => ({ first: async () => original }),
        first: async () => null,
        update: async (values: typeof original) => ({ ...original, ...values }),
      })),
      create: vi.fn(async (alias: { slug: string; categoryId: number }) => { aliases.push(alias); return alias; }),
    };
    const aliasTable = { where: vi.fn((criteria: { slug?: string }) => ({ first: async () => aliases.find((alias) => alias.slug === criteria.slug) ?? null, delete: async () => { const index = aliases.findIndex((alias) => alias.slug === criteria.slug); if (index >= 0) aliases.splice(index, 1); } })), create: vi.fn(async (alias: { slug: string; categoryId: number }) => { outgoingAliases.push(alias); return alias; }) };
    const tx = { orm: { public: { AdminUser: { where: () => ({ forUpdate: () => ({ first: async () => ({ active: true, authVersion: 1, role: "ADMIN" }) }) }) }, BlogCategory: category, ListingTerm: category, BlogCategorySlugAlias: aliasTable, ListingCategorySlugAlias: aliasTable } }, query: vi.fn(async () => []) };
    db.transaction.mockImplementation((transaction: (context: typeof tx) => unknown) => transaction(tx));

    await expect(updateCategory({ id: 1, role: "ADMIN", authVersion: 1 }, kind, 7, { name: "Old again", slug: "old-slug" })).resolves.toMatchObject({ slug: "old-slug" });
    expect(aliases).toEqual([]);
    expect(outgoingAliases).toEqual([{ slug: "new-slug", categoryId: 7 }]);
  });
}

it("does not delete a blog category referenced by a published association", async () => {
  const remove = vi.fn();
  const tx = {
    orm: { public: {
      AdminUser: { where: () => ({ forUpdate: () => ({ first: async () => ({ active: true, authVersion: 1, role: "ADMIN" }) }) }) },
      BlogCategory: { where: () => ({ forUpdate: () => ({ first: async () => ({ id: 7, slug: "used" }) }), delete: remove }) },
      ListingTerm: { where: () => ({ forUpdate: () => ({ first: async () => null }) }) },
    } },
    query: vi.fn(async () => [{ total: 1 }]),
  };
  db.transaction.mockImplementation((transaction: (context: typeof tx) => unknown) => transaction(tx));
  await expect(deleteCategory({ id: 1, role: "ADMIN", authVersion: 1 }, "blog", 7)).rejects.toMatchObject({ status: 409 });
  expect(remove).not.toHaveBeenCalled();
});

it("does not find a listing term in a different taxonomy", async () => {
  const where = vi.fn(() => ({ forUpdate: () => ({ first: async () => null }) }));
  const tx = {
    orm: { public: {
      AdminUser: { where: () => ({ forUpdate: () => ({ first: async () => ({ active: true, authVersion: 1, role: "ADMIN" }) }) }) },
      ListingTerm: { where },
    } }, query: vi.fn(),
  };
  db.transaction.mockImplementation((transaction: (context: typeof tx) => unknown) => transaction(tx));
  await expect(deleteCategory({ id: 1, role: "ADMIN", authVersion: 1 }, "listings", 7)).rejects.toMatchObject({ status: 404 });
  expect(where).toHaveBeenCalledWith({ id: 7, taxonomy: "hp_listing_category" });
});

it("queues every blog post affected by an indexed category name change in the update transaction", async () => {
  const category = {
    where: () => ({ forUpdate: () => ({ first: async () => ({ id: 7, name: "Old name", slug: "same" }) }), update: async (values: { name: string; slug: string }) => values }),
  };
  const tx = {
    orm: { public: {
      AdminUser: { where: () => ({ forUpdate: () => ({ first: async () => ({ active: true, authVersion: 1, role: "ADMIN" }) }) }) },
      BlogCategory: category,
    } },
    query: vi.fn(async () => [{ id: 11 }, { id: 12 }]),
  };
  db.transaction.mockImplementation((transaction: (context: typeof tx) => unknown) => transaction(tx));

  await updateCategory({ id: 1, role: "ADMIN", authVersion: 1 }, "blog", 7, { name: "New name", slug: "same" });

  expect(enqueueRagSource).toHaveBeenCalledTimes(2);
  expect(enqueueRagSource).toHaveBeenNthCalledWith(1, tx, "blog", 11);
  expect(enqueueRagSource).toHaveBeenNthCalledWith(2, tx, "blog", 12);
});
