import { youtubeVideoId } from "@/shared/media/video-embed";

/*
 * The write boundary of the listing admin: what each endpoint accepts, as an
 * allowlist with strict conversion. The descriptive editor (ADMIN and EDITOR)
 * and the commercial form (ADMIN) send separate bodies, and a body that carries
 * a field of the other kind is refused whole -- nothing in it is saved -- so a
 * hidden form field cannot slip a price or capacity change through the editor.
 *
 * Pure functions only: the server module applies them inside its transaction,
 * and the tests exercise them without a database.
 */

/** Amenity checkboxes stored in `attributes` as "1"; absence means "no". See amenities.ts. */
export const AMENITY_KEYS = [
  "beachaccess", "elevator", "oceanview", "hammocks", "gym", "firepit",
  "swimmingpool", "wifi", "tv", "hotwater", "airconditioning",
] as const;
export type AmenityKey = typeof AMENITY_KEYS[number];

export const LISTING_CATEGORY_TAXONOMY = "hp_listing_category";

const MAX_INT4 = 2_147_483_647;

/*
 * Fields only ADMIN may change, under every name a client might try: the
 * column names, the legacy attribute names the public pages still read, and
 * the lifecycle flags. Sending any of them to the descriptive endpoint is a
 * 403, even from ADMIN, because that endpoint never writes them.
 */
const RESTRICTED_KEYS = new Set([
  "price", "pricePerNightCents", "cleaning_fee", "cleaningFeeCents", "extra_guest_fee", "extraGuestFeeCents",
  "pet_fee", "petFeeCents", "iva", "ivaBasisPoints", "tourism_tax", "tourismBasisPoints",
  "guests", "maxGuests", "base_guests", "baseGuests", "pets_allowed", "petsAllowed",
  "booking_min_length", "minStayNights", "check_in", "checkInSeconds", "check_out", "checkOutSeconds",
  "active", "archivedAt", "archived", "status", "slug",
]);

const CONTENT_KEYS = new Set([
  "version", "title", "description", "location", "building", "bedrooms", "bathrooms", "parking",
  "videoUrl", "amenities", "categoryIds", "coverMediaId", "gallery",
]);

export const COMMERCIAL_FIELDS = [
  "pricePerNightCents", "cleaningFeeCents", "extraGuestFeeCents", "petFeeCents", "ivaBasisPoints",
  "tourismBasisPoints", "maxGuests", "baseGuests", "petsAllowed", "minStayNights", "checkInSeconds", "checkOutSeconds",
] as const;
export type CommercialField = typeof COMMERCIAL_FIELDS[number];

export type GalleryItemInput = { mediaId: number; alt: string; decorative: boolean; roomGroup: string | null };

export type ContentPatch = {
  version: number;
  title?: string;
  description?: string;
  location?: string | null;
  building?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  parking?: number | null;
  videoUrl?: string | null;
  amenities?: AmenityKey[];
  categoryIds?: number[];
  coverMediaId?: number | null;
  gallery?: GalleryItemInput[];
};

export type CommercialValues = {
  pricePerNightCents: number | null;
  cleaningFeeCents: number | null;
  extraGuestFeeCents: number | null;
  petFeeCents: number | null;
  ivaBasisPoints: number | null;
  tourismBasisPoints: number | null;
  maxGuests: number | null;
  baseGuests: number | null;
  petsAllowed: boolean | null;
  minStayNights: number | null;
  checkInSeconds: number | null;
  checkOutSeconds: number | null;
};
export type CommercialPatch = { version: number } & Partial<CommercialValues>;

export type StatusAction = "activate" | "deactivate" | "archive" | "restore";
export type StatusChange = { version: number; action: StatusAction };

export type FieldResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 403; error: string };

class FieldError extends Error {
  readonly status: 400 | 403;
  constructor(status: 400 | 403, message: string) { super(message); this.status = status; }
}

const fail = (message: string): never => { throw new FieldError(400, message); };

function guard<T>(parse: () => T): FieldResult<T> {
  try {
    return { ok: true, value: parse() };
  } catch (error) {
    if (error instanceof FieldError) return { ok: false, status: error.status, error: error.message };
    throw error;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) >= MAX_INT4) fail("A current version is required.");
  return value as number;
}

/** Trimmed text; an empty optional value means "clear it". */
function text(value: unknown, field: string, max: number, required: true): string;
function text(value: unknown, field: string, max: number, required?: false): string | null;
function text(value: unknown, field: string, max: number, required = false): string | null {
  if (value === null && !required) return null;
  if (typeof value !== "string") return fail(`${field} must be text.`);
  const clean = value.trim();
  if (clean.length > max) fail(`${field} is too long (at most ${max} characters).`);
  if (!clean) return required ? fail(`${field} cannot be empty.`) : null;
  return clean;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) fail(`${field} must be a whole number from ${min} to ${max}.`);
  return value as number;
}

const optionalInteger = (value: unknown, field: string, min: number, max: number) =>
  value === null ? null : integer(value, field, min, max);

function id(value: unknown, field: string): number {
  return integer(value, field, 1, MAX_INT4);
}

function uniqueIds(value: unknown, field: string, max: number): number[] {
  if (!Array.isArray(value) || value.length > max) fail(`${field} must be a list of at most ${max} items.`);
  const ids = (value as unknown[]).map((item) => id(item, field));
  if (new Set(ids).size !== ids.length) fail(`${field} contains duplicates.`);
  return ids;
}

function galleryItem(value: unknown, index: number): GalleryItemInput {
  const label = `Gallery image ${index + 1}`;
  if (!isRecord(value)) return fail(`${label} is not valid.`);
  for (const key of Object.keys(value)) {
    if (!["mediaId", "alt", "decorative", "roomGroup"].includes(key)) fail(`${label} has an unknown field.`);
  }
  const mediaId = id(value.mediaId, `${label} id`);
  if (value.decorative !== undefined && typeof value.decorative !== "boolean") fail(`${label}: decorative must be true or false.`);
  const decorative = value.decorative === true;
  const alt = value.alt === undefined ? null : text(value.alt, `${label} alt text`, 500);
  // Informative alt text, or an explicit choice that the image is decorative.
  if (decorative && alt) fail(`${label} is marked decorative, so it cannot also have alt text.`);
  if (!decorative && !alt) fail(`${label} needs alt text, or mark it as decorative.`);
  const roomGroup = value.roomGroup === undefined ? null : text(value.roomGroup, `${label} room`, 80);
  return { mediaId, alt: alt ?? "", decorative, roomGroup };
}

/** The descriptive PATCH body: only present keys change; everything else stays. */
export function parseContentPatch(body: Record<string, unknown>): FieldResult<ContentPatch> {
  return guard(() => {
    const keys = Object.keys(body);
    // Restricted names first: a mixed body is refused as a permissions problem, not a typo.
    if (keys.some((key) => RESTRICTED_KEYS.has(key))) {
      throw new FieldError(403, "Prices, capacity, booking policies and status can only be changed by an administrator in their own section.");
    }
    if (keys.some((key) => !CONTENT_KEYS.has(key))) fail("The request contains fields this form does not accept.");
    const patch: ContentPatch = { version: version(body.version) };
    if (keys.length === 1) fail("Nothing to save.");
    if ("title" in body) patch.title = text(body.title, "Title", 200, true);
    if ("description" in body) {
      if (typeof body.description !== "string" || body.description.length > 200_000) fail("The description must be text of at most 200,000 characters.");
      patch.description = (body.description as string).trim();
    }
    if ("location" in body) patch.location = text(body.location, "Location", 120);
    if ("building" in body) patch.building = text(body.building, "Building", 120);
    if ("bedrooms" in body) patch.bedrooms = optionalInteger(body.bedrooms, "Bedrooms", 0, 50);
    if ("bathrooms" in body) patch.bathrooms = optionalInteger(body.bathrooms, "Bathrooms", 0, 50);
    if ("parking" in body) patch.parking = optionalInteger(body.parking, "Parking spots", 0, 50);
    if ("videoUrl" in body) {
      const url = text(body.videoUrl, "Video link", 500);
      if (url && !youtubeVideoId(url)) fail("Use a YouTube link for the video.");
      patch.videoUrl = url;
    }
    if ("amenities" in body) {
      if (!Array.isArray(body.amenities) || body.amenities.length > AMENITY_KEYS.length ||
        !body.amenities.every((key) => typeof key === "string" && (AMENITY_KEYS as readonly string[]).includes(key)) ||
        new Set(body.amenities).size !== body.amenities.length) {
        fail("Amenities must be a list of known amenities.");
      }
      patch.amenities = body.amenities as AmenityKey[];
    }
    if ("categoryIds" in body) patch.categoryIds = uniqueIds(body.categoryIds, "Categories", 20);
    if ("coverMediaId" in body) patch.coverMediaId = body.coverMediaId === null ? null : id(body.coverMediaId, "Cover image");
    if ("gallery" in body) {
      if (!Array.isArray(body.gallery) || body.gallery.length > 200) fail("The gallery must be a list of at most 200 images.");
      const gallery = (body.gallery as unknown[]).map(galleryItem);
      if (new Set(gallery.map((item) => item.mediaId)).size !== gallery.length) fail("The gallery lists an image twice.");
      patch.gallery = gallery;
    }
    return patch;
  });
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * The attributes to save: the current bag with only the descriptive keys in
 * the patch replaced. Unknown keys (source order, reviews, legacy data) pass
 * through untouched, and no commercial key is ever written here.
 */
export function applyDescriptiveAttributes(current: unknown, patch: ContentPatch): { [key: string]: JsonValue } {
  // `current` is the stored JSONB object, so its values are JSON already.
  const next: { [key: string]: JsonValue } = isRecord(current) ? { ...(current as { [key: string]: JsonValue }) } : {};
  const put = (key: string, value: string | number | null | undefined) => {
    if (value === undefined) return;
    if (value === null) delete next[key];
    else next[key] = String(value);
  };
  put("location", patch.location);
  put("building", patch.building);
  put("bedrooms", patch.bedrooms);
  put("bathrooms", patch.bathrooms);
  put("parking", patch.parking);
  put("video_url", patch.videoUrl);
  if (patch.amenities) {
    for (const key of AMENITY_KEYS) delete next[key];
    for (const key of patch.amenities) next[key] = "1";
  }
  return next;
}

const MONEY_MAX_CENTS = 100_000_000;

/** The commercial PATCH body (ADMIN): typed columns only, strict ranges, no descriptive fields. */
export function parseCommercialPatch(body: Record<string, unknown>): FieldResult<CommercialPatch> {
  return guard(() => {
    const keys = Object.keys(body);
    if (keys.some((key) => key !== "version" && !(COMMERCIAL_FIELDS as readonly string[]).includes(key))) {
      fail("The request contains fields this form does not accept.");
    }
    const patch: CommercialPatch = { version: version(body.version) };
    if (keys.length === 1) fail("Nothing to save.");
    if ("pricePerNightCents" in body) patch.pricePerNightCents = optionalInteger(body.pricePerNightCents, "Nightly price", 1, MONEY_MAX_CENTS);
    for (const [key, label] of [["cleaningFeeCents", "Cleaning fee"], ["extraGuestFeeCents", "Extra guest fee"], ["petFeeCents", "Pet fee"]] as const) {
      if (key in body) patch[key] = optionalInteger(body[key], label, 0, MONEY_MAX_CENTS);
    }
    for (const [key, label] of [["ivaBasisPoints", "IVA"], ["tourismBasisPoints", "Tourism tax"]] as const) {
      if (key in body) patch[key] = optionalInteger(body[key], label, 0, 10_000);
    }
    if ("maxGuests" in body) patch.maxGuests = optionalInteger(body.maxGuests, "Maximum guests", 1, 100);
    if ("baseGuests" in body) patch.baseGuests = optionalInteger(body.baseGuests, "Guests included", 1, 100);
    if ("petsAllowed" in body) {
      if (body.petsAllowed !== null && typeof body.petsAllowed !== "boolean") fail("Pets allowed must be yes, no or unset.");
      patch.petsAllowed = body.petsAllowed as boolean | null;
    }
    if ("minStayNights" in body) patch.minStayNights = optionalInteger(body.minStayNights, "Minimum stay", 1, 365);
    if ("checkInSeconds" in body) patch.checkInSeconds = optionalInteger(body.checkInSeconds, "Check-in time", 0, 86_399);
    if ("checkOutSeconds" in body) patch.checkOutSeconds = optionalInteger(body.checkOutSeconds, "Check-out time", 0, 86_399);
    return patch;
  });
}

/**
 * Whether the merged values can be stored for a listing in this state. The
 * database enforces the same rules; checking first gives a readable message.
 */
export function commercialProblem(values: CommercialValues, active: boolean): string | null {
  if (values.baseGuests !== null && (values.maxGuests === null || values.baseGuests > values.maxGuests)) {
    return "Guests included cannot be more than the maximum number of guests.";
  }
  if (active && (!values.pricePerNightCents || !values.maxGuests)) {
    return "An active listing needs a nightly price and a maximum number of guests. Deactivate it before clearing them.";
  }
  return null;
}

const STATUS_ACTIONS: readonly StatusAction[] = ["activate", "deactivate", "archive", "restore"];

export function parseStatusChange(body: Record<string, unknown>): FieldResult<StatusChange> {
  return guard(() => {
    const keys = Object.keys(body).sort().join(",");
    if (keys !== "action,version" && keys !== "action,confirmed,version") fail("The request contains fields this form does not accept.");
    const action = body.action;
    if (typeof action !== "string" || !STATUS_ACTIONS.includes(action as StatusAction)) fail("Unknown status change.");
    // Archiving withdraws the listing from sale: it needs an explicit confirmation.
    if (action === "archive" && body.confirmed !== true) fail("Confirm the archive explicitly.");
    if ("confirmed" in body && typeof body.confirmed !== "boolean") fail("Confirmation must be true or false.");
    return { version: version(body.version), action: action as StatusAction };
  });
}

/** What a listing still lacks before it can be put on sale. */
export function activationProblems(listing: {
  title: string; contentHtml: string; coverMediaId: number | null; pricePerNightCents: number | null; maxGuests: number | null;
}): string[] {
  const missing: string[] = [];
  if (!listing.title.trim()) missing.push("a title");
  if (!listing.contentHtml.trim()) missing.push("a description");
  if (listing.coverMediaId === null) missing.push("a cover image");
  if (!listing.pricePerNightCents) missing.push("a nightly price");
  if (!listing.maxGuests) missing.push("a maximum number of guests");
  return missing;
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseNewListing(body: Record<string, unknown>): FieldResult<{ title: string; slug: string }> {
  return guard(() => {
    if (Object.keys(body).sort().join(",") !== "slug,title") fail("Send exactly a title and a slug.");
    const title = text(body.title, "Title", 200, true);
    const slug = text(body.slug, "Slug", 100, true);
    if (!SLUG_PATTERN.test(slug)) fail("The slug may only use lowercase letters, numbers and single hyphens.");
    return { title, slug };
  });
}

export function parseDeletion(body: Record<string, unknown>): FieldResult<{ version: number }> {
  return guard(() => {
    if (Object.keys(body).sort().join(",") !== "confirmed,version" || body.confirmed !== true) fail("Confirm the deletion explicitly.");
    return { version: version(body.version) };
  });
}

/** A URL-safe slug suggestion for the create form; the server still validates it. */
export function suggestSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
}
