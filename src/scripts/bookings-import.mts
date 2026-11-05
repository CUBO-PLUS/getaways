import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import nextEnv from "@next/env";
import { Temporal } from "temporal-polyfill/full";
import { isCanonicalCheckoutSessionId, parsePricingSnapshot, type BookingStatus, type PricingSnapshotV1 } from "../modules/bookings/booking-persistence.ts";

type SourceBooking = {
  id: number; listing_id: number; check_in: string; check_out: string; nights: number;
  guest_name: string; guest_email: string; guest_phone: string | null; guest_notes: string | null;
  guests: number | null; currency: "USD"; price_per_night_cents: number; cleaning_fee_cents: number;
  pet_fee_cents: number; extra_guest_fee_cents: number; discount_cents: number; tax_cents: number;
  total_amount_cents: number; coupon_code: string | null; status: BookingStatus;
  checkout_session_id: string | null; payment_reference: string | null; admin_notes: string | null;
  created_at: string; updated_at: string; pricing_snapshot?: unknown; agreed_listing_title?: string;
  cancelled_at?: string | null; cancellation_reason?: string | null; cancelled_by?: string | null;
  payment_review_required?: boolean;
};
type SourceFile = { nextId: number; bookings: SourceBooking[] };
const safeInt = (value: unknown) => Number.isSafeInteger(value);
const MAX_POSTGRES_INT4 = 2_147_483_647;
const SOURCE_BOOKING_REQUIRED = ["id", "listing_id", "check_in", "check_out", "nights", "guest_name", "guest_email", "guest_phone", "guest_notes", "guests", "currency", "price_per_night_cents", "cleaning_fee_cents", "pet_fee_cents", "extra_guest_fee_cents", "discount_cents", "tax_cents", "total_amount_cents", "coupon_code", "status", "checkout_session_id", "payment_reference", "admin_notes", "created_at", "updated_at"];
const SOURCE_BOOKING_OPTIONAL = ["pricing_snapshot", "agreed_listing_title", "cancelled_at", "cancellation_reason", "cancelled_by", "payment_review_required"];
const dateOnly = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const timestamp = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
const nullableString = (value: unknown) => value === null || typeof value === "string";
class ImportError extends Error {}

function assertExactKeys(value: Record<string, unknown>, allowed: string[], required: string[]) {
  if (Object.keys(value).some(name => !allowed.includes(name)) || required.some(name => !Object.hasOwn(value, name))) {
    throw new ImportError("unsupported or incomplete booking source schema");
  }
}

function validateSource(input: unknown): SourceFile {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ImportError("invalid booking source");
  const source = input as Partial<SourceFile>;
  assertExactKeys(source as Record<string, unknown>, ["nextId", "bookings"], ["nextId", "bookings"]);
  if (!safeInt(source.nextId) || source.nextId! < 1 || source.nextId! > MAX_POSTGRES_INT4 || !Array.isArray(source.bookings)) throw new ImportError("invalid booking source structure");
  const ids = new Set<number>();
  const sessions = new Set<string>();
  const payments = new Set<string>();
  for (const row of source.bookings) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new ImportError("invalid booking row");
    assertExactKeys(row as unknown as Record<string, unknown>, [...SOURCE_BOOKING_REQUIRED, ...SOURCE_BOOKING_OPTIONAL], SOURCE_BOOKING_REQUIRED);
    if (!safeInt(row.id) || row.id < 1 || row.id > MAX_POSTGRES_INT4 || ids.has(row.id)) throw new ImportError("invalid or duplicate booking ID");
    ids.add(row.id);
    if (!safeInt(row.listing_id) || row.listing_id < 1 || !dateOnly(row.check_in) || !dateOnly(row.check_out) || row.check_in >= row.check_out || !safeInt(row.nights) || row.nights < 1) throw new ImportError("invalid booking dates or listing reference");
    if (Math.round((Date.parse(`${row.check_out}T00:00:00Z`) - Date.parse(`${row.check_in}T00:00:00Z`)) / 86400000) !== row.nights) throw new ImportError("invalid booking stay length");
    if (typeof row.guest_name !== "string" || !row.guest_name.trim() || typeof row.guest_email !== "string" || !row.guest_email.trim() || !nullableString(row.guest_phone) || !nullableString(row.guest_notes) || !nullableString(row.coupon_code) || !nullableString(row.admin_notes)) throw new ImportError("invalid booking fields");
    if (row.guests !== null && (!safeInt(row.guests) || row.guests < 1)) throw new ImportError("invalid booking guest count");
    if (row.currency !== "USD" || ![row.price_per_night_cents, row.cleaning_fee_cents, row.pet_fee_cents, row.extra_guest_fee_cents, row.discount_cents, row.tax_cents, row.total_amount_cents].every(value => safeInt(value) && value >= 0)) throw new ImportError("invalid booking amounts");
    if (!["pending_payment", "confirmed", "cancelled"].includes(row.status) || !timestamp(row.created_at) || !timestamp(row.updated_at)) throw new ImportError("invalid booking status or timestamps");
    for (const [kind, value, seen] of [["checkout session", row.checkout_session_id, sessions], ["payment reference", row.payment_reference, payments]] as const) {
      if (!nullableString(value)) throw new ImportError("invalid booking capability");
      if (kind === "checkout session" && value !== null && !isCanonicalCheckoutSessionId(value, row.id)) throw new ImportError("invalid checkout session");
      if (value !== null && seen.has(value)) throw new ImportError(`duplicate ${kind}`);
      if (value !== null) seen.add(value);
    }
    if (row.pricing_snapshot != null && !parsePricingSnapshot(row.pricing_snapshot)) throw new ImportError("invalid pricing snapshot");
    if (row.agreed_listing_title !== undefined && (typeof row.agreed_listing_title !== "string" || !row.agreed_listing_title.trim())) throw new ImportError("invalid agreed listing title");
    if (row.cancelled_at != null && !timestamp(row.cancelled_at)) throw new ImportError("invalid cancellation timestamp");
    if (!nullableString(row.cancellation_reason ?? null) || !nullableString(row.cancelled_by ?? null) || (row.payment_review_required !== undefined && typeof row.payment_review_required !== "boolean")) throw new ImportError("invalid booking review metadata");
  }
  let maxId = 0;
  for (const id of ids) if (id > maxId) maxId = id;
  if (source.nextId! <= maxId) throw new ImportError("booking source nextId is not above its IDs");
  return source as SourceFile;
}

function mapBooking(row: SourceBooking) {
  const pricingSnapshot = row.pricing_snapshot == null ? null : parsePricingSnapshot(row.pricing_snapshot) as PricingSnapshotV1;
  return {
    id: row.id, listingId: row.listing_id, checkIn: row.check_in, checkOut: row.check_out, nights: row.nights,
    guestName: row.guest_name, guestEmail: row.guest_email, guestPhone: row.guest_phone, guestNotes: row.guest_notes,
    guests: row.guests, currency: row.currency, pricePerNightCents: BigInt(row.price_per_night_cents),
    cleaningFeeCents: BigInt(row.cleaning_fee_cents), petFeeCents: BigInt(row.pet_fee_cents),
    extraGuestFeeCents: BigInt(row.extra_guest_fee_cents), discountCents: BigInt(row.discount_cents),
    taxCents: BigInt(row.tax_cents), totalAmountCents: BigInt(row.total_amount_cents), couponCode: row.coupon_code,
    status: row.status, checkoutSessionId: row.checkout_session_id, paymentReference: row.payment_reference,
    adminNotes: row.admin_notes, pricingSnapshot, pricingReviewRequired: pricingSnapshot === null,
    agreedListingTitle: row.agreed_listing_title?.trim() || `Historical listing #${row.listing_id}`,
    version: 1, cancellationReason: row.cancellation_reason ?? null,
    cancelledBy: row.cancelled_by ?? null, paymentReviewRequired: row.payment_review_required ?? row.status === "cancelled",
    createdAt: Temporal.Instant.from(row.created_at), updatedAt: Temporal.Instant.from(row.updated_at),
    cancelledAt: row.cancelled_at ? Temporal.Instant.from(row.cancelled_at) : null,
  };
}

function assertNoConfirmedOverlaps(bookings: Iterable<{ listingId: number; status: string; checkIn: string; checkOut: string }>) {
  const byListing = new Map<number, Array<{ checkIn: string; checkOut: string }>>();
  for (const booking of bookings) {
    if (booking.status !== "confirmed") continue;
    const intervals = byListing.get(booking.listingId) ?? [];
    intervals.push({ checkIn: booking.checkIn, checkOut: booking.checkOut });
    byListing.set(booking.listingId, intervals);
  }
  for (const intervals of byListing.values()) {
    intervals.sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.checkOut.localeCompare(b.checkOut));
    let furthestCheckOut = "";
    for (const interval of intervals) {
      if (interval.checkIn < furthestCheckOut) throw new ImportError("confirmed bookings overlap");
      if (interval.checkOut > furthestCheckOut) furthestCheckOut = interval.checkOut;
    }
  }
}

function requiredNextBookingId(sourceNextId: number, rows: Iterable<{ id: number }>) {
  let required = sourceNextId;
  for (const row of rows) required = Math.max(required, row.id + 1);
  if (!safeInt(required) || required > MAX_POSTGRES_INT4) throw new ImportError("Booking IDs or nextId exceed PostgreSQL serial capacity");
  return required;
}

function assertCapabilitiesUnique(rows: Iterable<{ id: number; checkoutSessionId: string | null; paymentReference: string | null }>) {
  const sessions = new Map<string, number>();
  const payments = new Map<string, number>();
  for (const row of rows) {
    for (const [value, map, label] of [[row.checkoutSessionId, sessions, "checkout session"], [row.paymentReference, payments, "payment reference"]] as const) {
      if (value === null) continue;
      const previous = map.get(value);
      if (previous !== undefined && previous !== row.id) throw new ImportError(`duplicate ${label} in source and destination`);
      map.set(value, row.id);
    }
  }
}

function equivalent(existing: Record<string, unknown>, expected: ReturnType<typeof mapBooking>) {
  const temporalFields = ["createdAt", "updatedAt", "cancelledAt"];
  const scalarFields = Object.keys(expected).filter(field => !temporalFields.includes(field));
  const actual = Object.fromEntries(scalarFields.map(field => [field, existing[field]]));
  const wanted = Object.fromEntries(scalarFields.map(field => [field, expected[field as keyof typeof expected]]));
  const instant = (value: unknown): bigint | null => {
    try {
      if (value && typeof value === "object" && "epochNanoseconds" in value) return (value as { epochNanoseconds: bigint }).epochNanoseconds;
      if (value instanceof Date) return Temporal.Instant.fromEpochMilliseconds(value.getTime()).epochNanoseconds;
      if (typeof value === "string") return Temporal.Instant.from(value).epochNanoseconds;
    } catch { /* Invalid stored instants compare as unequal. */ }
    return null;
  };
  return isDeepStrictEqual(actual, wanted) && temporalFields.every(field =>
    instant(existing[field]) === instant(expected[field as keyof typeof expected]));
}

function safeDbCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Z][A-Z0-9_.-]{0,80}$/.test(code) ? ` (${code})` : "";
}

export function databaseTargetIdentity(connectionString: string): string | null {
  try {
    const url = new URL(connectionString);
    if (!(["postgres:", "postgresql:"].includes(url.protocol)) || !url.hostname || !url.pathname || url.pathname === "/") return null;
    const rawHostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const hostname = rawHostname.includes(":") ? `[${rawHostname}]` : rawHostname;
    return `${hostname}:${url.port || "5432"}/${decodeURIComponent(url.pathname.slice(1))}`;
  } catch {
    return null;
  }
}

export async function importBookings(sourcePaths: string[], mode: "dry-run" | "apply" | "verify", target?: string) {
  if (!sourcePaths.length) throw new ImportError("pass one or more explicit --source files (an empty source must be an explicit valid file)");
  const inputs = await Promise.all(sourcePaths.map(async sourcePath => {
    const absolute = path.resolve(sourcePath);
    let parsed: unknown;
    try { parsed = JSON.parse(await readFile(absolute, "utf8")); } catch { throw new ImportError("booking source is unreadable or invalid JSON"); }
    return { data: validateSource(parsed) };
  }));
  const sourceById = new Map<number, ReturnType<typeof mapBooking>>();
  const sourceNextId = inputs.reduce((max, { data }) => Math.max(max, data.nextId), 1);
  const sourceSessions = new Map<string, number>();
  const sourcePayments = new Map<string, number>();
  for (const { data } of inputs) for (const raw of data.bookings) {
    const mapped = mapBooking(raw);
    const duplicate = sourceById.get(mapped.id);
    if (duplicate && !isDeepStrictEqual(duplicate, mapped)) throw new ImportError("source files conflict for the same booking ID");
    if (duplicate) continue;
    for (const [capability, value, seen] of [["checkout session", raw.checkout_session_id, sourceSessions], ["payment reference", raw.payment_reference, sourcePayments]] as const) {
      if (value !== null && seen.has(value) && seen.get(value) !== mapped.id) throw new ImportError(`source files contain duplicate ${capability}`);
      if (value !== null) seen.set(value, mapped.id);
    }
    sourceById.set(mapped.id, mapped);
  }
  const wanted = [...sourceById.values()];
  assertNoConfirmedOverlaps(wanted);

  if (mode !== "dry-run") {
    if (!target || !process.env.DATABASE_URL || target !== databaseTargetIdentity(process.env.DATABASE_URL)) throw new ImportError("--target must match DATABASE_URL identity as host:port/database (credentials excluded)");
  }
  let db: typeof import("../infrastructure/prisma/db.ts").db;
  try {
    ({ db } = await import("../infrastructure/prisma/db.ts"));
  } catch (error) {
    throw new ImportError(`database initialization failed${safeDbCode(error)}; details redacted`);
  }
  try {
    const listings = await db.orm.public.Listing.all();
    const referrals = await db.orm.public.ReferralAttribution.all();
    const existing = await db.orm.public.Booking.all();
    const listingIds = new Set(listings.map(item => item.id));
    if (wanted.some(item => !listingIds.has(item.listingId))) throw new ImportError("source contains an unknown listing reference");
    const existingById = new Map(existing.map(item => [item.id, item]));
    if (existing.some(item => !safeInt(item.id) || item.id < 1 || item.id > MAX_POSTGRES_INT4)) throw new ImportError("destination booking ID is outside PostgreSQL serial range");
    const existingSessions = new Map(existing.flatMap(item => item.checkoutSessionId ? [[item.checkoutSessionId, item.id] as const] : []));
    const existingPayments = new Map(existing.flatMap(item => item.paymentReference ? [[item.paymentReference, item.id] as const] : []));
    for (const item of wanted) {
      for (const [what, value, seen] of [["checkout session", item.checkoutSessionId, existingSessions], ["payment reference", item.paymentReference, existingPayments]] as const) {
        if (value && seen.has(value) && seen.get(value) !== item.id) throw new ImportError(`destination conflicts with a source ${what}`);
      }
      const old = existingById.get(item.id);
      if (old && !equivalent(old as unknown as Record<string, unknown>, item)) throw new ImportError("destination booking differs from source");
    }
    const missingCount = wanted.reduce((count, item) => count + (existingById.has(item.id) ? 0 : 1), 0);
    const extraCount = existing.reduce((count, item) => count + (sourceById.has(item.id) ? 0 : 1), 0);
    const orphanReferralCount = referrals.filter(row => !sourceById.has(row.bookingId) && !existingById.has(row.bookingId)).length;
    if (mode === "dry-run") return { mode, sourceCount: wanted.length, alreadyPresent: wanted.length - missingCount, toImport: missingCount, destinationExtras: extraCount, orphanReferralCount };
    if (mode === "verify" && (missingCount || extraCount)) throw new ImportError(`destination reconciliation failed (missing IDs: ${missingCount}, extra IDs: ${extraCount})`);
    if (mode === "apply" && extraCount) throw new ImportError(`destination contains ${extraCount} booking IDs absent from the approved source`);
    if (mode === "verify") {
      const state = await db.transaction(async tx => {
        const [row] = await tx.query(db.raw.sql`SELECT last_value AS value, is_called AS called FROM "Booking_id_seq"`.returnsRow({ value: "pg/int8@1", called: "pg/bool@1" }).build());
        return row;
      });
      const requiredNext = requiredNextBookingId(sourceNextId, [...existing, ...wanted]);
      const nextAvailable = state ? Number(state.value) + (state.called ? 1 : 0) : Number.NaN;
      if (!state || !safeInt(nextAvailable) || nextAvailable > MAX_POSTGRES_INT4 || nextAvailable < requiredNext) throw new ImportError("Booking ID sequence cannot allocate above source IDs and nextId");
      return { mode, verified: wanted.length, destinationExtras: extraCount, nextAvailableId: nextAvailable, requiredNextId: requiredNext, orphanReferralCount };
    }

    const imported = await db.transaction(async tx => {
      const lock = db.raw.sql`WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(72190427)) SELECT 1 AS locked FROM lock`.returnsRow({ locked: "pg/int4@1" }).build();
      const [lockResult] = await tx.query(lock);
      if (lockResult?.locked !== 1) throw new ImportError("could not acquire booking import lock");
      await tx.execute(db.raw.sql`LOCK TABLE "Booking" IN SHARE ROW EXCLUSIVE MODE`.affectedCount().build());
      const rows = await tx.orm.public.Booking.all();
      const byId = new Map(rows.map(row => [row.id, row]));
      const extras = rows.reduce((count, row) => count + (sourceById.has(row.id) ? 0 : 1), 0);
      if (extras) throw new ImportError(`destination contains ${extras} booking IDs absent from the approved source`);
      for (const item of wanted) {
        const old = byId.get(item.id);
        if (old && !equivalent(old as unknown as Record<string, unknown>, item)) throw new ImportError("destination booking differs from source");
      }
      assertCapabilitiesUnique([...rows, ...wanted.filter(item => !byId.has(item.id))]);
      assertNoConfirmedOverlaps([...rows, ...wanted.filter(item => !byId.has(item.id))]);
      const requiredNext = requiredNextBookingId(sourceNextId, [...rows, ...wanted]);
      const [sequenceState] = await tx.query(db.raw.sql`SELECT last_value AS value, is_called AS called FROM "Booking_id_seq"`.returnsRow({ value: "pg/int8@1", called: "pg/bool@1" }).build());
      const nextAvailable = sequenceState ? Number(sequenceState.value) + (sequenceState.called ? 1 : 0) : Number.NaN;
      if (!sequenceState || !safeInt(nextAvailable) || nextAvailable > MAX_POSTGRES_INT4) throw new ImportError("Booking ID sequence is exhausted or outside PostgreSQL serial range");
      if (nextAvailable < requiredNext) {
        const sequenceValue = requiredNext - 1;
        const advanced = await tx.query(db.raw.sql`SELECT setval(pg_get_serial_sequence('"Booking"', 'id'), ${sequenceValue}, true) AS value`.returnsRow({ value: "pg/int8@1" }).build());
        if (!advanced[0]) throw new ImportError("could not advance Booking ID sequence");
      }
      for (const item of wanted) {
        if (!byId.has(item.id)) await tx.orm.public.Booking.create(item);
      }
      return wanted.length;
    });
    return { mode, imported, orphanReferralCount };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError(`database operation failed${safeDbCode(error)}; details redacted`);
  } finally {
    try { await db.close(); } catch { /* Database diagnostics may contain row values. */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
    const args = process.argv.slice(2).filter(arg => arg !== "--");
    const sources: string[] = [];
    let mode: "dry-run" | "apply" | "verify" = "dry-run";
    let target: string | undefined;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--source" && args[i + 1]) sources.push(args[++i]);
      else if (args[i] === "--target" && args[i + 1]) target = args[++i];
      else if (args[i] === "--apply" && mode === "dry-run") mode = "apply";
      else if (args[i] === "--verify" && mode === "dry-run") mode = "verify";
      else throw new ImportError("usage: pnpm bookings:import --source <file> [--source <file> ...] [--apply | --verify] [--target <host:port/database>]");
    }
    process.stdout.write(`${JSON.stringify(await importBookings(sources, mode, target), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`bookings import aborted: ${error instanceof ImportError ? error.message : "operation failed; details redacted"}\n`);
    process.exitCode = 1;
  }
}
