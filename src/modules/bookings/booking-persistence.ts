export type BookingStatus = "pending_payment" | "confirmed" | "cancelled";

export type PricingSnapshotV1 = {
  version: 1;
  currency: "USD";
  pricePerNightCents: number;
  cleaningFeeCents: number;
  petFeeCents: number;
  extraGuestFeeCents: number;
  ivaBasisPoints: number;
  tourismBasisPoints: number;
  baseGuests: number;
  maxGuests: number;
  petsAllowed: boolean;
};

const own = (value: Record<string, unknown>, key: string) => Object.hasOwn(value, key);
const nonnegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const MAX_POSTGRES_INT4 = 2_147_483_647;

export function isCanonicalCheckoutSessionId(value: unknown, bookingId?: number): value is string {
  if (typeof value !== "string") return false;
  const match = /^cko_([1-9]\d*)_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(value);
  if (!match) return false;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id <= MAX_POSTGRES_INT4 && (bookingId === undefined || id === bookingId);
}

export function parsePricingSnapshot(value: unknown): PricingSnapshotV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = ["version", "currency", "pricePerNightCents", "cleaningFeeCents", "petFeeCents", "extraGuestFeeCents", "ivaBasisPoints", "tourismBasisPoints", "baseGuests", "maxGuests", "petsAllowed"];
  if (Object.keys(row).length !== keys.length || keys.some(key => !own(row, key))) return null;
  if (row.version !== 1 || row.currency !== "USD" || typeof row.petsAllowed !== "boolean") return null;
  if (![row.pricePerNightCents, row.cleaningFeeCents, row.petFeeCents, row.extraGuestFeeCents, row.ivaBasisPoints, row.tourismBasisPoints, row.baseGuests, row.maxGuests].every(nonnegativeInteger)) return null;
  if (Number(row.ivaBasisPoints) > 10000 || Number(row.tourismBasisPoints) > 10000 || Number(row.maxGuests) < 1 || Number(row.baseGuests) < 1 || Number(row.baseGuests) > Number(row.maxGuests)) return null;
  return row as PricingSnapshotV1;
}
