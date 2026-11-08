import { AMENITY_KEYS } from "@/modules/listings/listing-admin-fields";

// These are guest-facing names of the real public amenity fields. The key list
// remains the source of truth; aliases only bridge common Spanish/English wording.
const AMENITY_TERMS: Record<(typeof AMENITY_KEYS)[number], string[]> = {
  beachaccess: ["beach access", "acceso a la playa", "acceso playa"],
  elevator: ["elevator", "lift", "ascensor"],
  oceanview: ["ocean view", "oceanfront view", "vista al mar", "vista oceano", "vista al océano"],
  hammocks: ["hammock area", "hammocks", "hamacas", "area de hamacas", "área de hamacas"],
  gym: ["gym", "fitness center", "fitness centre", "gimnasio"],
  firepit: ["fire pit", "fireplace", "fogata", "fogatero"],
  swimmingpool: ["swimming pool", "pool", "piscina", "alberca"],
  wifi: ["wi-fi", "wifi", "internet", "wireless internet"],
  tv: ["tv", "television", "televisión"],
  hotwater: ["hot water", "agua caliente"],
  airconditioning: ["air conditioning", "air conditioner", "a/c", "aire acondicionado"],
};

export type CatalogAmenityGuard = { required: string[]; excluded: string[]; ambiguous: boolean };

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function escaped(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Catch catalog amenity requirements the model omitted. Exclusions aren't
 * representable by the current search contract, so callers must not search
 * loosely and should ask the guest to rephrase instead.
 */
export function guardCatalogAmenities(question: string): CatalogAmenityGuard {
  const text = normalize(question);
  const required = new Set<string>();
  const excluded = new Set<string>();
  const mentions: Array<{ key: string; start: number; end: number }> = [];
  for (const key of AMENITY_KEYS) {
    for (const rawTerm of [key, ...AMENITY_TERMS[key]]) {
      const term = normalize(rawTerm);
      const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(term)}($|[^\\p{L}\\p{N}])`, "gu");
      for (const match of text.matchAll(pattern)) {
        const start = match.index ?? 0;
        const termStart = start + match[1].length;
        mentions.push({ key, start: termStart, end: start + match[0].length - match[2].length });
        const before = text.slice(Math.max(0, termStart - 36), termStart);
        const after = text.slice(start + match[0].length, start + match[0].length + 40);
        // A stated exclusion cannot safely be converted to the positive-only
        // amenity filter. "I don't need wifi" is absence of a requirement, not
        // a request for a property without wifi.
        const noNeed = /(?:no\s+necesito|no\s+requiere|not\s+(?:need|require)|don't\s+need|do\s+not\s+need|no\s+es\s+necesari[oa])\s+(?:tener\s+)?$/u.test(before);
        const noNeedAfter = /^\s*(?:(?:is|are)\s+)?(?:not\s+(?:needed|required|necessary|essential)|isn't\s+(?:needed|required|necessary|essential)|no\s+es\s+necesari[oa]|no\s+hace\s+falta)/u.test(after);
        if (noNeed || noNeedAfter) continue;
        if (/(?:\bsin|\bwithout|\bno|\bnot|\bni)\s+(?:(?:tener|with|con)\s+)?(?:the\s+|a\s+|an\s+|el\s+|la\s+|un\s+|una\s+)?$/u.test(before)) excluded.add(key);
        else required.add(key);
      }
    }
  }
  for (const key of excluded) required.delete(key);
  const uncertain = /\b(?:maybe|perhaps|possibly|quizas|tal vez|no estoy seguro|no se si|not sure whether|not sure if)\b/u.test(text);
  const alternatives = mentions.some((left, index) => mentions.slice(index + 1).some((right) =>
    /^(?:\s|,)*\b(?:or|o|either|ya sea)\b(?:\s|,)*$/u.test(text.slice(left.end, right.start))));
  const ambiguous = uncertain || alternatives;
  if (ambiguous) for (const { key } of mentions) required.delete(key);
  return { required: [...required], excluded: [...excluded], ambiguous };
}
