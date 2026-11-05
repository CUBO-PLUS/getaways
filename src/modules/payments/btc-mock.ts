import "server-only";

import type { PaymentProvider, PaymentSession } from "@/modules/payments/types";

/*
 * STARTER STUB. This is the file students build out.
 *
 * What it does now: it hands back a fake pending payment with a placeholder
 * address. It makes no network calls and it never marks anything paid. That
 * means the checkout page works end to end out of the box, but nothing real
 * happens until you implement the TODOs below.
 *
 * What to build (see TASK.md for the full list):
 *   1. Get a USD -> BTC rate from a public price API (or hard-code one for the
 *      demo) and convert amountCents into satoshis (1 BTC = 100,000,000 sats).
 *   2. Generate a real address or a Lightning invoice. Testnet is fine.
 *   3. Give the payment an expiry time, and set status to "expired" after it.
 *   4. Watch for the payment. When it is paid in full, call
 *      markPaid(session.id) from modules/bookings/server/booking-store.ts. Handle underpaid and
 *      late payments too.
 *
 * Only these two methods are called from the app:
 *   - createPayment: when the guest chooses Bitcoin on the checkout page.
 *   - getPayment: every few seconds while the guest waits on the page.
 */

/* Placeholder rate for the stub only. Students replace this with a real price. */
const MOCK_USD_PER_BTC = 100_000;

const PLACEHOLDER_ADDRESS = "bc1qstudentmockaddressreplaceme000000000";

/* Survives dev reloads, so getPayment can find what createPayment made. */
const globalForMock = globalThis as typeof globalThis & { __btcMockSessions?: Map<string, PaymentSession> };
// ponytail: process-local mock only; restart or another instance loses provider evidence, so this is never production-ready.
const sessions = globalForMock.__btcMockSessions ?? new Map<string, PaymentSession>();
globalForMock.__btcMockSessions = sessions;

export const btcMockProvider: PaymentProvider = {
  key: "btc-mock",
  label: "Bitcoin (student mock)",

  async createPayment({ bookingId, amountCents }) {
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new RangeError("Invalid payment amount.");
    const id = `btc_mock_${bookingId}`;
    const existing = sessions.get(id);
    if (existing) {
      if (existing.amountCents !== amountCents) throw new Error("Mock payment amount changed for this booking.");
      return existing;
    }
    // TODO(student): fetch a live USD/BTC price here instead of the constant below.
    const centsPerBtc = BigInt(MOCK_USD_PER_BTC) * 100n;
    const sats = (BigInt(amountCents) * 100_000_000n + centsPerBtc / 2n) / centsPerBtc;
    if (sats <= 0n || sats > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Payment cannot be represented in satoshis.");
    const amountSats = Number(sats);

    // TODO(student): generate a real address or Lightning invoice here.
    // TODO(student): set expiresAt to a real expiry time, e.g. 15 minutes from now.
    const session: PaymentSession = {
      id,
      bookingId,
      amountCents,
      currency: "USD",
      btc: {
        address: PLACEHOLDER_ADDRESS,
        amountSats,
      },
      status: "pending",
    };
    sessions.set(session.id, session);
    return session;
  },

  async getPayment(id) {
    // TODO(student): ask your payment source (blockchain API, node, invoice service)
    // whether the address or invoice has been paid, and update status here.
    // When the payment is complete, call markPaid(id) from modules/bookings/server/booking-store.ts.
    return sessions.get(id) ?? null;
  },
};
