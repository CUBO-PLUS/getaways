import "server-only";

import { db } from "@/infrastructure/prisma/db";
import { getGuestSession } from "./auth";

export type GuestReservation = {
  id: number; listingTitle: string; checkIn: string; checkOut: string; nights: number;
  status: "pending_payment" | "confirmed" | "cancelled"; totalAmountCents: number; currency: "USD";
  payment: { reference: string; status: "pending" | "paid" | "review"; amountCents: number } | null;
  checkoutUrl: string | null;
};

/** Stored payment evidence only: reading history never contacts or reconciles a provider. */
export async function getGuestReservations(request?: Request): Promise<GuestReservation[] | null> {
  const guest = await getGuestSession(request);
  if (!guest) return null;
  const rows = await db.orm.public.Booking.where({ guestAccountId: guest.id })
    .select("id", "agreedListingTitle", "checkIn", "checkOut", "nights", "status", "totalAmountCents", "paymentReference", "paymentReviewRequired", "checkoutSessionId")
    .orderBy((row) => row.id.desc()).all();
  return rows.map((row) => {
    const amount = Number(row.totalAmountCents);
    if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError("Stored booking amount cannot be displayed safely.");
    return {
      id: row.id, listingTitle: row.agreedListingTitle, checkIn: String(row.checkIn), checkOut: String(row.checkOut),
      nights: row.nights, status: row.status as GuestReservation["status"], totalAmountCents: amount, currency: "USD",
      payment: row.paymentReference ? {
        reference: row.paymentReference, amountCents: amount,
        status: row.paymentReviewRequired || row.status === "cancelled" ? "review" : row.status === "confirmed" ? "paid" : "pending",
      } : null,
      checkoutUrl: row.checkoutSessionId ? `/checkout?session_id=${encodeURIComponent(row.checkoutSessionId)}` : null,
    };
  });
}
