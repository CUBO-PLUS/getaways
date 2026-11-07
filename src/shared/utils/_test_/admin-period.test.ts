import { describe, expect, it } from "vitest";
import { adminStatisticsRange, parseAdminStatisticsPeriod } from "../admin-period";

describe("admin statistics period", () => {
  it("accepts supported periods and defaults invalid values to 30 days", () => {
    expect(["7", "30", "90"].map(parseAdminStatisticsPeriod)).toEqual([7, 30, 90]);
    expect([undefined, "14", "7days", 0].map(parseAdminStatisticsPeriod)).toEqual([30, 30, 30, 30]);
  });

  it("uses inclusive El Salvador calendar dates across UTC midnight and rounds the end to a minute", () => {
    const range = adminStatisticsRange(7, new Date("2026-11-08T05:59:47.321Z"));
    expect(range).toEqual({
      startDate: "2026-11-01", endDate: "2026-11-07",
      startAt: new Date("2026-11-01T06:00:00.000Z"), endAt: new Date("2026-11-08T05:59:00.000Z"),
    });
  });
});
