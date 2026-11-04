/** Closed legacy-catalogue attribute contract used by the one-shot importer. */
export type NormalizedListing = {
  id: number; sourceOrdinal: number; wpId: bigint | null; slug: string; title: string; contentHtml: string;
  attributes: Record<string, string>; pricePerNightCents: number; cleaningFeeCents: number | null;
  extraGuestFeeCents: number | null; petFeeCents: number | null; ivaBasisPoints: number | null;
  tourismBasisPoints: number | null; maxGuests: number; baseGuests: number | null;
  petsAllowed: boolean | null; minStayNights: number | null; checkInSeconds: number | null;
  checkOutSeconds: number | null; featuredMediaId: number | null; galleryMediaIds: number[];
  galleryGroups: Record<number, string>;
};

export type NormalizedListingMedia = { legacyMediaId: number; position: number; alt: string | null; roomGroup: string | null };

const descriptive = new Set(["airconditioning", "bathrooms", "beachaccess", "bedrooms", "building", "elevator", "firepit", "gym", "hammocks", "hotwater", "location", "oceanview", "parking", "swimmingpool", "tv", "wifi", "gallery_groups"]);
const financial = new Set(["price", "cleaning_fee", "extra_guest_fee", "pet_fee", "iva", "tourism_tax", "guests", "booking_min_length", "check_in", "check_out"]);
const money = (raw: unknown, field: string): number => {
  if (typeof raw !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error(`invalid ${field}`);
  const [whole, fraction = ""] = raw.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > 2_147_483_647n) throw new Error(`${field} exceeds int4 cents`);
  return Number(cents);
};
const integer = (raw: unknown, field: string): number => {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) throw new Error(`invalid ${field}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${field} exceeds safe integer`);
  return value;
};
const optionalMoney = (attrs: Record<string, unknown>, key: string) => attrs[key] == null ? null : money(attrs[key], key);
const optionalInt = (attrs: Record<string, unknown>, key: string) => attrs[key] == null ? null : integer(attrs[key], key);
const basisPoints = (attrs: Record<string, unknown>, key: string): number | null => {
  const percent = optionalInt(attrs, key);
  if (percent === null) return null;
  if (percent > 100) throw new Error(`${key} exceeds 100 percent`);
  return percent * 100;
};
const legacyWpId = (raw: unknown): bigint | null => {
  if (raw == null) return null;
  if (typeof raw !== "string" || !/^-?\d+$/.test(raw)) throw new Error("invalid listing wp_id");
  const value = BigInt(raw);
  if (value < -9_223_372_036_854_775_808n || value > 9_223_372_036_854_775_807n) throw new Error("listing wp_id exceeds int8");
  return value;
};

export function normalizeLegacyListing(raw: unknown, sourceOrdinal: number): NormalizedListing {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("listing must be an object");
  const row = raw as Record<string, unknown>;
  if (typeof row.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) ||
    typeof row.title !== "string" || !row.title.trim() || typeof row.content_html !== "string") throw new Error("invalid listing content");
  const a = row.attributes;
  if (!a || typeof a !== "object" || Array.isArray(a)) throw new Error(`listing ${String(row.id)} attributes must be an object`);
  const attrs = a as Record<string, unknown>;
  if (!Number.isSafeInteger(sourceOrdinal) || sourceOrdinal < 0) throw new Error("invalid source ordinal");
  for (const [key, value] of Object.entries(attrs)) {
    if (!descriptive.has(key) && !financial.has(key)) throw new Error(`unknown listing attribute ${key} on ${String(row.id)}`);
    if (descriptive.has(key) && typeof value !== "string") throw new Error(`descriptive attribute ${key} must be a string`);
    if (financial.has(key) && (value !== null && typeof value !== "string")) throw new Error(`commercial attribute ${key} must be a flat string`);
  }
  for (const key of ["price", "guests"]) if (attrs[key] == null) throw new Error(`missing required ${key} on ${String(row.id)}`);
  const id = integer(String(row.id), "listing id");
  const list = Array.isArray(row.gallery_media_ids) ? row.gallery_media_ids.map(v => integer(String(v), "gallery media id")) : [];
  if (new Set(list).size !== list.length) throw new Error(`duplicate gallery media id on ${id}`);
  const cover = row.featured_media_id == null ? null : integer(String(row.featured_media_id), "featured media id");
  const maxGuests = integer(attrs.guests, "guests");
  const checkInSeconds = optionalInt(attrs, "check_in");
  const checkOutSeconds = optionalInt(attrs, "check_out");
  if (maxGuests <= 0) throw new Error(`invalid guests on ${id}`);
  if ((checkInSeconds !== null && checkInSeconds > 86_399) || (checkOutSeconds !== null && checkOutSeconds > 86_399)) throw new Error(`invalid check time on ${id}`);
  const attributes: Record<string, string> = {};
  for (const key of descriptive) if (key !== "gallery_groups" && attrs[key] !== undefined) attributes[key] = attrs[key] as string;
  const groups = attrs.gallery_groups;
  let galleryGroups: Record<number, string> = {};
  if (groups !== undefined) {
    let decoded: unknown;
    try { decoded = JSON.parse(groups as string); } catch { throw new Error(`invalid gallery_groups on ${String(row.id)}`); }
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) || Object.entries(decoded).some(([key, value]) => !/^\d+$/.test(key) || !list.includes(Number(key)) || typeof value !== "string" || !value.trim())) throw new Error(`invalid gallery_groups on ${String(row.id)}`);
    galleryGroups = Object.fromEntries(Object.entries(decoded).map(([key, value]) => [Number(key), (value as string).trim()]));
  }
  const wpId = legacyWpId(row.wp_id);
  return {
    id, sourceOrdinal, wpId, slug: String(row.slug), title: String(row.title), contentHtml: String(row.content_html),
    attributes, pricePerNightCents: money(attrs.price, "price"), cleaningFeeCents: optionalMoney(attrs, "cleaning_fee"),
    extraGuestFeeCents: optionalMoney(attrs, "extra_guest_fee"), petFeeCents: optionalMoney(attrs, "pet_fee"),
    ivaBasisPoints: basisPoints(attrs, "iva"), tourismBasisPoints: basisPoints(attrs, "tourism_tax"),
    maxGuests, baseGuests: null, petsAllowed: null,
    minStayNights: optionalInt(attrs, "booking_min_length"), checkInSeconds, checkOutSeconds,
    featuredMediaId: cover, galleryMediaIds: list, galleryGroups,
  };
}
