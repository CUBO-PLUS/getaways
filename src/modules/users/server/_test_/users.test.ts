import { describe, expect, it } from "vitest";
import { normalizeUserEmail, validateUserPassword } from "../users";

describe("user input boundaries", () => {
  it("normalizes and validates email", () => {
    expect(normalizeUserEmail("  ADMIN@Example.COM ")).toBe("admin@example.com");
    expect(() => normalizeUserEmail("bad-address")).toThrow();
  });

  it("enforces both character and bcrypt UTF-8 byte limits without trimming", () => {
    expect(() => validateUserPassword("  abcdef")).not.toThrow();
    expect(() => validateUserPassword("1234567")).toThrow();
    expect(() => validateUserPassword("a".repeat(33))).toThrow();
    expect(() => validateUserPassword("😀".repeat(19))).toThrow();
    expect(() => validateUserPassword("😀".repeat(18))).not.toThrow();
  });
});
