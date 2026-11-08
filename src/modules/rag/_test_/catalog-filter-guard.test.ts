import { describe, expect, it } from "vitest";
import { guardCatalogAmenities } from "@/modules/rag/catalog-filter-guard";

describe("catalog amenity filter guard", () => {
  it("recognizes public catalog amenities across common Spanish and English names", () => {
    expect(guardCatalogAmenities("Con ascensor, gimnasio, piscina y vista al mar"))
      .toEqual({ required: ["elevator", "oceanview", "gym", "swimmingpool"], excluded: [], ambiguous: false });
    expect(guardCatalogAmenities("Stay with beach access, hot water and air conditioning"))
      .toEqual({ required: ["beachaccess", "hotwater", "airconditioning"], excluded: [], ambiguous: false });
  });

  it("never turns negative or non-required mentions into positive requirements", () => {
    expect(guardCatalogAmenities("alojamiento sin piscina"))
      .toEqual({ required: [], excluded: ["swimmingpool"], ambiguous: false });
    expect(guardCatalogAmenities("No necesito wifi; piscina no es necesaria; wifi isn't essential"))
      .toEqual({ required: [], excluded: [], ambiguous: false });
    expect(guardCatalogAmenities("no necesito una piscina; I don't need a pool"))
      .toEqual({ required: [], excluded: [], ambiguous: false });
    expect(guardCatalogAmenities("I don't require a pool; no need for a pool"))
      .toEqual({ required: [], excluded: [], ambiguous: false });
    expect(guardCatalogAmenities("Maybe a pool or beach access"))
      .toEqual({ required: [], excluded: [], ambiguous: true });
  });
});
