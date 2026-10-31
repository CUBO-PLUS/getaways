import { describe, it, expect } from "vitest";
import { blogPostPath, blogUtcDayRange } from "@/modules/content/paths";

describe("blogPostPath", () => {
  it("formats year/month/day/slug from an ISO published_at, matching WP's date-based permalinks", () => {
    expect(blogPostPath("2026-03-06T15:22:11Z", "el-zonte-guide")).toBe(
      "/2026/03/06/el-zonte-guide"
    );
  });

  it("zero-pads single-digit months and days", () => {
    expect(blogPostPath("2025-09-05T00:00:00Z", "hello-world")).toBe(
      "/2025/09/05/hello-world"
    );
  });
});

describe("blogUtcDayRange", () => {
  it("includes fractional timestamps in the last second and excludes the next UTC midnight", () => {
    const range = blogUtcDayRange("2026", "03", "06");
    expect(range).toEqual({
      start: "2026-03-06T00:00:00.000Z",
      endExclusive: "2026-03-07T00:00:00.000Z",
    });
    const lastMillisecond = Date.parse("2026-03-06T23:59:59.999Z");
    const nextDay = Date.parse("2026-03-07T00:00:00.000Z");
    expect(lastMillisecond >= Date.parse(range!.start) && lastMillisecond < Date.parse(range!.endExclusive)).toBe(true);
    expect(nextDay >= Date.parse(range!.start) && nextDay < Date.parse(range!.endExclusive)).toBe(false);
  });
});
