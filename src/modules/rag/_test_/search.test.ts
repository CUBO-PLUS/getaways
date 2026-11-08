import { describe, expect, it } from "vitest";
import { validateRagSearchInput } from "@/modules/rag/search";

describe("RAG search input", () => {
  it("accepts combined public listing attributes and normalizes absent filters", () => {
    expect(validateRagSearchInput({ query: "  wifi by the sea  ", filters: { amenities: ["wifi", "hammocks"], categories: ["villas"], guestsMin: 4 }, page: 2, pageSize: 5 }))
      .toEqual({ query: "wifi by the sea", page: 2, pageSize: 5, amenities: ["wifi", "hammocks"], categories: ["villas"], guestsMin: 4, bedroomsMin: null, bathroomsMin: null, parkingMin: null, location: null, building: null, petsAllowed: null, minStayNightsMax: null, checkInBySeconds: null, checkOutFromSeconds: null });
    expect(validateRagSearchInput({ query: "stay", filters: { location: "Old Town", bedroomsMin: 2, petsAllowed: true } }).location).toBe("Old Town");
    expect(validateRagSearchInput({ query: "stay", filters: { guestsMin: null, location: null, petsAllowed: null } })).toMatchObject({ guestsMin: null, location: null, petsAllowed: null });
  });

  it("rejects unknown filters and malformed or duplicate amenity values", () => {
    expect(() => validateRagSearchInput({ query: "stay", filters: { amenities: ["pool" as never] } })).toThrow();
    expect(() => validateRagSearchInput({ query: "stay", filters: { amenities: ["wifi", "wifi"] } })).toThrow();
    expect(() => validateRagSearchInput({ query: "stay", filters: { categories: ["../private"] } })).toThrow();
    expect(() => validateRagSearchInput({ query: "stay", filters: { guestsMin: 0 } })).toThrow();
    expect(() => validateRagSearchInput({ query: "stay", filters: { location: "x".repeat(121) } })).toThrow();
    expect(() => validateRagSearchInput({ query: "stay", filters: { checkInBySeconds: 86400 } })).toThrow();
  });
});
