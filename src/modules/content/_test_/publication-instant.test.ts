import { expect, it } from "vitest";
import { Temporal } from "temporal-polyfill/full";
import { publicationInstant } from "../publication-instant.mjs";

it("converts publication timestamps to Prisma's Temporal.Instant value", () => {
  const instant = publicationInstant("2025-03-01T13:00:00.123+01:00");

  expect(instant).toBeInstanceOf(Temporal.Instant);
  expect(instant.toString()).toBe("2025-03-01T12:00:00.123Z");
});

it.each(["2025-02-30T12:00:00Z", "2025-03-01T12:00:00", "2025-03-01T12:00:00.1234567Z", "2025-03-01 12:00:00Z"])(
  "rejects invalid or non-PostgreSQL publication timestamp %s", (value) => {
    expect(() => publicationInstant(value)).toThrow();
  },
);
