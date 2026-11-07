import "server-only";

import { db } from "@/infrastructure/prisma/db";
import { randomUUID } from "node:crypto";
import { BTCPAY_TEST_AMOUNT_CENTS } from "@/modules/payments/types";

export type PaymentAttempt = NonNullable<Awaited<ReturnType<typeof db.orm.public.PaymentAttempt.first>>>;

export async function getPaymentAttempt(id: string) {
  return db.orm.public.PaymentAttempt.where({ id }).first();
}

export async function getPaymentAttemptForBooking(bookingId: number) {
  return db.orm.public.PaymentAttempt.where({ bookingId }).first();
}

/** One immutable attempt per booking. Reservation and booking lock are committed before network I/O. */
export async function reservePaymentAttempt(input: {
  bookingId: number; listingId: number; expectedVersion: number; realTotalCents: number;
  provider: string; storeId: string;
}): Promise<{ attempt: PaymentAttempt; created: boolean } | null> {
  const prior = await db.orm.public.PaymentAttempt.where({ bookingId: input.bookingId }).first();
  if (prior) return { attempt: prior as PaymentAttempt, created: false };

  const id = randomUUID();
  try {
    const reserved = await db.transaction(async (tx) => {
    const locked = await tx.query(db.raw.sql`SELECT id FROM "Listing" WHERE id = ${input.listingId} FOR NO KEY UPDATE`
      .returnsRow({ id: "pg/int4@1" }).build());
    if (!locked.length) return null;
    const booking = await tx.orm.public.Booking.where({ id: input.bookingId }).forUpdate().first();
    if (!booking || booking.listingId !== input.listingId || booking.version !== input.expectedVersion ||
      booking.status !== "pending_payment" || booking.paymentReference !== null || booking.pricingReviewRequired ||
      booking.totalAmountCents !== BigInt(input.realTotalCents) || String(booking.checkIn) < new Date().toISOString().slice(0, 10)) return null;
    const attempt = await tx.orm.public.PaymentAttempt.create({
      id, bookingId: input.bookingId, provider: input.provider, storeId: input.storeId, network: "testnet",
      realTotalCents: BigInt(input.realTotalCents), testAmountCents: BTCPAY_TEST_AMOUNT_CENTS, status: "creating",
    });
    const saved = await tx.orm.public.Booking.where({ id: input.bookingId, version: input.expectedVersion,
      status: "pending_payment", paymentReference: null }).update({ paymentReference: id, version: input.expectedVersion + 1 });
    if (!saved) throw new Error("Payment attempt reservation lost its booking lock.");
      return { attempt: attempt as PaymentAttempt, created: true };
    });
    if (reserved) return reserved;
  } catch (error) {
    const concurrent = await db.orm.public.PaymentAttempt.where({ bookingId: input.bookingId }).first();
    if (concurrent) return { attempt: concurrent, created: false };
    throw error;
  }
  return null;
}

export async function saveInvoice(attemptId: string, invoice: {
  invoiceId: string; checkoutLink: string; destination: string; amount: string;
}) {
  return db.orm.public.PaymentAttempt.where({ id: attemptId, invoiceId: null, status: "creating" }).update({
    invoiceId: invoice.invoiceId, checkoutLink: invoice.checkoutLink,
    btcDestination: invoice.destination, btcAmount: invoice.amount, status: "pending",
  });
}

export async function saveInvoiceDetails(attemptId: string, invoice: {
  invoiceId: string; checkoutLink: string; destination: string; amount: string;
}) {
  return db.orm.public.PaymentAttempt.where({ id: attemptId, invoiceId: invoice.invoiceId }).update({
    checkoutLink: invoice.checkoutLink, btcDestination: invoice.destination, btcAmount: invoice.amount,
  });
}

export async function setAttemptStatus(id: string, status: string, reviewReason: string | null = null) {
  return db.transaction(async (tx) => {
    const attempt = await tx.orm.public.PaymentAttempt.where({ id }).forUpdate().first();
    if (!attempt || attempt.status === "paid") return attempt;
    const booking = await tx.orm.public.Booking.where({ id: attempt.bookingId }).forUpdate().first();
    if (attempt.status === "review" || booking?.status === "confirmed") return attempt;
    const saved = await tx.orm.public.PaymentAttempt.where({ id }).update({ status, reviewReason });
    if (status === "review" && booking && !booking.paymentReviewRequired) {
      await tx.orm.public.Booking.where({ id: booking.id, version: booking.version }).update({
        paymentReviewRequired: true, version: booking.version + 1,
      });
    }
    return saved;
  });
}

export async function getAttemptByInvoice(invoiceId: string) {
  return db.orm.public.PaymentAttempt.where({ invoiceId }).first();
}

export async function recordSettledAttempt(id: string) {
  return db.transaction(async (tx) => {
    const attempt = await tx.orm.public.PaymentAttempt.where({ id }).forUpdate().first();
    if (!attempt) return null;
    if (attempt.status === "paid" || attempt.status === "review") return attempt;
    return tx.orm.public.PaymentAttempt.where({ id }).update({ status: "paid", reviewReason: null });
  });
}
