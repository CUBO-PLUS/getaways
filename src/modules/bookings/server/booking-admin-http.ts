import "server-only";
import { assertSameOrigin, getSession, type Session } from "@/modules/auth/server/auth";

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export const bookingReply = (status: number, body: object) => Response.json(body, { status, headers });

export async function staff(request: Request, mutation = false): Promise<Session | Response> {
  if (mutation && !assertSameOrigin(request)) return bookingReply(403, { error: "Origin not allowed" });
  const actor = await getSession(request);
  if (!actor) return bookingReply(401, { error: "Session invalid" });
  if (actor.role !== "ADMIN" && actor.role !== "BOOKING_MANAGER") return bookingReply(403, { error: "Access denied" });
  return actor;
}

export async function body(request: Request): Promise<Record<string, unknown> | Response> {
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    return bookingReply(415, { error: "JSON required" });
  }
  const reader = request.body?.getReader();
  if (!reader) return bookingReply(400, { error: "Invalid request" });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 32_768) {
      await reader.cancel();
      return bookingReply(413, { error: "Request too large" });
    }
    chunks.push(part.value);
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid JSON object");
    return value as Record<string, unknown>;
  } catch {
    return bookingReply(400, { error: "Invalid request" });
  }
}

export function fail(error: unknown) {
  const invalid = error instanceof RangeError;
  return bookingReply(invalid ? 400 : 503, { error: invalid ? "Invalid booking data" : "Service unavailable" });
}

export function idParam(raw: string) {
  const id = Number(raw);
  return /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}

export type BookingListFilters = {
  page: number;
  listingId?: number;
  status?: "pending_payment" | "confirmed" | "cancelled";
  from?: string;
  to?: string;
};

function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function parseBookingListFilters(input: Record<string, unknown>): BookingListFilters | null {
  const pageRaw = input.page ?? "1";
  const listingRaw = input.listingId;
  const status = input.status;
  const from = input.from;
  const to = input.to;

  if (typeof pageRaw !== "string" || !/^[1-9]\d*$/.test(pageRaw)) return null;
  const page = Number(pageRaw);
  if (!Number.isSafeInteger(page) || page > 10_000) return null;

  let listingId: number | undefined;
  if (listingRaw !== undefined && listingRaw !== "") {
    if (typeof listingRaw !== "string" || !/^[1-9]\d*$/.test(listingRaw)) return null;
    listingId = Number(listingRaw);
    if (!Number.isSafeInteger(listingId) || listingId > 2_147_483_647) return null;
  }
  if (status !== undefined && status !== "" && status !== "pending_payment" && status !== "confirmed" && status !== "cancelled") return null;
  if (from !== undefined && from !== "" && !isDay(from)) return null;
  if (to !== undefined && to !== "" && !isDay(to)) return null;

  const start = typeof from === "string" && from !== "" ? from : undefined;
  const end = typeof to === "string" && to !== "" ? to : undefined;
  if (start && end && start > end) return null;
  return {
    page,
    listingId,
    status: status === "" ? undefined : status as BookingListFilters["status"],
    from: start,
    to: end,
  };
}
