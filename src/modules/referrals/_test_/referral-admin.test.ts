import { beforeEach, expect, it, vi } from "vitest";

const { report, referralFirst, query } = vi.hoisted(() => ({
  report: vi.fn(),
  referralFirst: vi.fn(),
  query: vi.fn(),
}));

vi.mock("../referral-management", () => ({ getReferralReport: report }));
vi.mock("@/infrastructure/prisma/db", () => ({
  db: {
    orm: { public: { ReferralCode: { where: () => ({ first: referralFirst }) } } },
    runtime: () => ({ query }),
    raw: { sql: (strings: TemplateStringsArray) => ({
      returnsRow: () => ({ build: () => strings.join("?") }),
    }) },
  },
}));

import { getAdminReferralDetail, listAdminReferralCodes } from "../referral-admin";

const actor = (role: "ADMIN" | "EDITOR" | "BOOKING_MANAGER") => ({ id: 1, role, authVersion: 1 });

beforeEach(() => vi.clearAllMocks());

it.each(["EDITOR", "BOOKING_MANAGER"] as const)("denies %s before reading referral data", async (role) => {
  await expect(listAdminReferralCodes(actor(role))).rejects.toThrow("forbidden");
  await expect(getAdminReferralDetail(actor(role), "ABCD")).rejects.toThrow("forbidden");
  expect(report).not.toHaveBeenCalled();
  expect(referralFirst).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
});

it("preserves historical attribution states and returns inactive referral details", async () => {
  const rows = [
    { bookingId: 1, status: "pending", createdAt: new Date("2025-01-03Z"), bookingExists: true },
    { bookingId: 2, status: "confirmed", createdAt: new Date("2025-01-02Z"), bookingExists: true },
    { bookingId: 3, status: "cancelled", createdAt: new Date("2025-01-01Z"), bookingExists: false },
  ];
  referralFirst.mockResolvedValue({ code: "ABCD", active: false });
  query.mockResolvedValue(rows);

  await expect(getAdminReferralDetail(actor("ADMIN"), "abcd")).resolves.toEqual({
    code: "ABCD",
    active: false,
    attributions: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  });
});
