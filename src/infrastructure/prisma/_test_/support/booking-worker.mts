import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BookingInput } from "../../../../modules/bookings/server/bookings.ts";
import type { QuoteUpdate } from "../../../../modules/bookings/server/booking-store.ts";
import type { PaymentSession } from "../../../../modules/payments/types.ts";

// Same native-Node resolution boundary as plan1-worker; application modules stay real.
const root = fileURLToPath(new URL("../../../../", import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return nextResolve(pathToFileURL(`${root}_test_/support/server-only-stub.ts`).href, context);
    if (["next/server", "next/headers"].includes(specifier)) return nextResolve(`${specifier}.js`, context);
    if (specifier.startsWith("@/")) specifier = pathToFileURL(root + specifier.slice(2)).href;
    if (specifier.startsWith(".") || specifier.startsWith("file:")) {
      const url = new URL(specifier, context.parentURL);
      if (existsSync(fileURLToPath(url) + ".ts")) return nextResolve(url.href + ".ts", context);
      if (existsSync(fileURLToPath(url) + "/index.ts")) return nextResolve(url.href + "/index.ts", context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    // Next accepts JSON imports without attributes; native Node requires the attribute.
    return nextLoad(url, url.endsWith(".json") ? { ...context, importAttributes: { type: "json" } } : context);
  },
});

const { db } = await import("../../db.ts");
const store = await import("../../../../modules/bookings/server/booking-store.ts");
const bookings = await import("../../../../modules/bookings/server/bookings.ts");
const { getCheckoutData } = await import("../../../../modules/checkout/server/checkout.ts");
const { recordReferralForBooking } = await import("../../../../modules/referrals/referral-store.ts");
const { syncReferralStatusForBooking } = await import("../../../../modules/referrals/referral-lifecycle.ts");
const { btcMockProvider } = await import("../../../../modules/payments/btc-mock.ts");
const routes = {
  bookings: await import("../../../../app/api/bookings/route.ts"),
  quote: await import("../../../../app/api/checkout/quote/route.ts"),
  status: await import("../../../../app/api/checkout/status/route.ts"),
  btc: await import("../../../../app/api/checkout/btc/route.ts"),
};

type Message =
  | { action: "create"; input: BookingInput; referral?: string }
  | { action: "get"; id: number }
  | { action: "dto"; sessionId: string }
  | { action: "request"; route: keyof typeof routes; method: "GET" | "POST"; sessionId?: string; body?: Record<string, unknown>; production?: boolean }
  | { action: "quote"; id: number; version: number; quote: QuoteUpdate }
  | { action: "associate"; input: Parameters<typeof store.associatePaymentReference>[0] }
  | { action: "paid"; evidence: Parameters<typeof store.markPaid>[0] }
  | { action: "cancel"; id: number; version: number }
  | { action: "referral"; id: number; code: string }
  | { action: "sync"; id: number; reported?: "confirmed" | "cancelled" }
  | { action: "evidence"; payment: Record<string, unknown> | null }
  | { action: "hold"; listingId: number };

const [connection] = await db.runtime().query(db.raw.sql`SELECT pg_backend_pid()::int AS pid`.returnsRow({ pid: "pg/int4@1" }).build());
process.send!({ ready: { pid: process.pid, backend: connection.pid } });
process.on("message", async (message: Message | { resume: true }) => {
  if ("resume" in message) return;
  try {
    let result: unknown;
    switch (message.action) {
      case "create": {
        const response = await routes.bookings.POST(new Request("https://booking.example.test/api/bookings", {
          method: "POST", body: JSON.stringify({ ...message.input, referral_code: message.referral }),
        }));
        const body = await response.json();
        if (response.status !== 200) throw new Error(`Booking rejected: ${JSON.stringify(body)}`);
        const session = new URL(body.data.url, "https://booking.example.test").searchParams.get("session_id")!;
        result = await store.getBookingBySessionId(session);
        break;
      }
      case "get": result = await store.getBookingById(message.id); break;
      case "dto": result = { checkout: await getCheckoutData(message.sessionId), receipt: await bookings.getBookingConfirmationData(message.sessionId) }; break;
      case "quote": result = await store.saveBookingQuote(message.id, message.version, message.quote); break;
      case "associate": result = await store.associatePaymentReference(message.input); break;
      case "paid": result = await store.markPaid(message.evidence); break;
      case "cancel": result = await store.cancelBooking(message.id, message.version, "Guest requested cancellation", "synthetic-operator"); break;
      case "referral": result = await recordReferralForBooking(message.id, message.code); break;
      case "sync": result = await syncReferralStatusForBooking(message.id, message.reported); break;
      case "evidence":
        // Only the provider boundary is controlled: routes, evidence validation and DB transitions are real.
        btcMockProvider.getPayment = async () => message.payment as PaymentSession | null;
        result = true;
        break;
      case "request": {
        const route = routes[message.route] as { GET?: (request: Request) => Promise<Response>; POST?: (request: Request) => Promise<Response> };
        const handler = route[message.method];
        if (!handler) throw new Error("Unsupported test request");
        const url = new URL(`https://booking.example.test/api/checkout/${message.route}`);
        if (message.sessionId !== undefined) url.searchParams.set("session_id", message.sessionId);
        const previous = process.env.NODE_ENV;
        try {
          if (message.production) Object.assign(process.env, { NODE_ENV: "production" });
          const response = await handler(new Request(url, { method: message.method, ...(message.method === "POST" ? { body: JSON.stringify(message.body) } : {}) }));
          result = { status: response.status, headers: Object.fromEntries(response.headers), body: await response.json() };
        } finally { Object.assign(process.env, { NODE_ENV: previous }); }
        break;
      }
      case "hold":
        await db.transaction(async tx => {
          await tx.query(db.raw.sql`SELECT id FROM "Listing" WHERE id = ${message.listingId} FOR NO KEY UPDATE`.returnsRow({ id: "pg/int4@1" }).build());
          process.send!({ result: true });
          await new Promise<void>(resolve => process.once("message", () => resolve()));
        });
        process.send!({ result: "released" });
        return;
    }
    process.send!({ result });
  } catch (error) {
    process.send!({ failure: (error as Error).stack });
  }
});
process.on("disconnect", async () => { await db.close(); process.exit(); });
