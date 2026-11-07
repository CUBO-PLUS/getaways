import type { BookingInput } from "../../../../modules/bookings/server/bookings.ts";
import type { QuoteUpdate } from "../../../../modules/bookings/server/booking-store.ts";
import type { PaymentSession } from "../../../../modules/payments/types.ts";

// Same native-Node resolution boundary as plan1-worker; application modules stay real.
const { db } = await import("../../db.ts");
const store = await import("../../../../modules/bookings/server/booking-store.ts");
const bookings = await import("../../../../modules/bookings/server/bookings.ts");
const { getCheckoutData } = await import("../../../../modules/checkout/server/checkout.ts");
const { recordReferralForBooking } = await import("../../../../modules/referrals/referral-store.ts");
const { syncReferralStatusForBooking } = await import("../../../../modules/referrals/referral-lifecycle.ts");
const { btcpayTestnetProvider } = await import("../../../../modules/payments/btcpay-testnet.ts");
const routes = {
  bookings: await import("../../../../app/api/bookings/route.ts"),
  quote: await import("../../../../app/api/checkout/quote/route.ts"),
  status: await import("../../../../app/api/checkout/status/route.ts"),
  btc: await import("../../../../app/api/checkout/btc/route.ts"),
  webhook: await import("../../../../app/api/webhooks/btcpay/route.ts"),
};
const guestRoutes = {
  register: await import("../../../../app/api/guest/register/route.ts"),
  login: await import("../../../../app/api/guest/login/route.ts"),
  logout: await import("../../../../app/api/guest/logout/route.ts"),
};
const adminRoutes = {
  list: await import("../../../../app/api/admin/bookings/route.ts"),
  detail: await import("../../../../app/api/admin/bookings/[id]/route.ts"),
  contact: await import("../../../../app/api/admin/bookings/[id]/contact/route.ts"),
  notes: await import("../../../../app/api/admin/bookings/[id]/notes/route.ts"),
  cancel: await import("../../../../app/api/admin/bookings/[id]/cancel/route.ts"),
};
const listingRoutes = {
  list: await import("../../../../app/api/admin/listings/route.ts"),
  detail: await import("../../../../app/api/admin/listings/[id]/route.ts"),
  content: await import("../../../../app/api/admin/listings/[id]/content/route.ts"),
  commercial: await import("../../../../app/api/admin/listings/[id]/commercial/route.ts"),
  status: await import("../../../../app/api/admin/listings/[id]/status/route.ts"),
};
const { getGuestReservations } = await import("../../../../modules/guests/server/reservations.ts");
const { getGuestSession } = await import("../../../../modules/guests/server/auth.ts");
const { createSession, getSession } = await import("../../../../modules/auth/server/auth.ts");
let guestCookie = "";

type Message =
  | { action: "create"; input: BookingInput; referral?: string }
  | { action: "get"; id: number }
  | { action: "request"; route: keyof typeof routes; method: "GET" | "POST"; sessionId?: string; body?: Record<string, unknown>; rawBody?: string; signature?: string; production?: boolean; cookie?: string; origin?: string }
  | { action: "quote"; id: number; version: number; quote: QuoteUpdate }
  | { action: "associate"; input: Parameters<typeof store.associatePaymentReference>[0] }
  | { action: "paid"; evidence: Parameters<typeof store.markPaid>[0] }
  | { action: "cancel"; id: number; version: number }
  | { action: "referral"; id: number; code: string }
  | { action: "sync"; id: number; reported?: "confirmed" | "cancelled" }
  | { action: "evidence"; payment: Record<string, unknown> | null }
  | { action: "hold"; listingId: number }
  | { action: "guest"; email?: string; password?: string; name?: string; phone?: string; production?: boolean; origin?: string }
  | { action: "guestLogin"; email: string; password: string }
  | { action: "guestLogout" }
  | { action: "crossAudience" }
  | { action: "history"; cookie?: string }
  | { action: "dto"; sessionId: string; cookie?: string }
  | { action: "adminRequest"; route: keyof typeof adminRoutes; method: "GET" | "PATCH" | "POST"; id?: number; token?: string; body?: Record<string, unknown>; origin?: string; query?: string }
  | { action: "adminToken"; id: number; authVersion: number }
  | { action: "listingRequest"; route: keyof typeof listingRoutes; method: "GET" | "POST" | "PATCH" | "DELETE"; id?: number; token?: string; body?: Record<string, unknown>; origin?: string; query?: string };

const [connection] = await db.runtime().query(db.raw.sql`SELECT pg_backend_pid()::int AS pid`.returnsRow({ pid: "pg/int4@1" }).build());
process.send!({ ready: { pid: process.pid, backend: connection.pid } });
process.on("message", async (message: Message | { resume: true }) => {
  if ("resume" in message) return;
  try {
    let result: unknown;
    switch (message.action) {
      case "create": {
        const response = await routes.bookings.POST(new Request("https://booking.example.test/api/bookings", {
          method: "POST", headers: { origin: process.env.BLOG_APP_ORIGIN!, cookie: guestCookie },
          body: JSON.stringify({ ...message.input, referral_code: message.referral }),
        }));
        const body = await response.json();
        if (response.status !== 200) throw new Error(`Booking rejected: ${JSON.stringify(body)}`);
        const session = new URL(body.data.url, "https://booking.example.test").searchParams.get("session_id")!;
        result = await store.getBookingBySessionId(session);
        break;
      }
      case "get": result = await store.getBookingById(message.id); break;
      case "dto": {
        const request = new Request("https://booking.example.test", { headers: { cookie: message.cookie ?? guestCookie } });
        result = { checkout: await getCheckoutData(message.sessionId, request), receipt: await bookings.getBookingConfirmationData(message.sessionId, request) };
        break;
      }
      case "quote": result = await store.saveBookingQuote(message.id, message.version, message.quote); break;
      case "associate": result = await store.associatePaymentReference(message.input); break;
      case "paid": result = await store.markPaid(message.evidence); break;
      case "cancel": result = await store.cancelBooking(message.id, message.version, "Guest requested cancellation", { id: 1, authVersion: 1 }); break;
      case "referral": result = await recordReferralForBooking(message.id, message.code); break;
      case "sync": result = await syncReferralStatusForBooking(message.id, message.reported); break;
      case "evidence":
        // Only the provider boundary is controlled: routes, evidence validation and DB transitions are real.
        btcpayTestnetProvider.getPayment = async () => message.payment as PaymentSession | null;
        result = true;
        break;
      case "request": {
        const route = routes[message.route] as { GET?: (request: Request) => Promise<Response>; POST?: (request: Request) => Promise<Response> };
        const handler = route[message.method];
        if (!handler) throw new Error("Unsupported test request");
        const url = new URL(`https://booking.example.test/api/${message.route === "bookings" ? "bookings" : message.route === "webhook" ? "webhooks/btcpay" : `checkout/${message.route}`}`);
        if (message.sessionId !== undefined) url.searchParams.set("session_id", message.sessionId);
        const previous = process.env.NODE_ENV;
        const previousOrigin = process.env.BLOG_APP_ORIGIN;
        try {
          if (message.production) Object.assign(process.env, { NODE_ENV: "production", BLOG_APP_ORIGIN: "https://localhost:3000" });
          const response = await handler(new Request(url, { method: message.method, headers: { ...(message.origin === undefined ? { origin: process.env.BLOG_APP_ORIGIN! } : { origin: message.origin }), cookie: message.cookie ?? guestCookie, ...(message.signature ? { "BTCPay-Sig": message.signature } : {}) }, ...(message.method === "POST" ? { body: message.rawBody ?? JSON.stringify(message.body) } : {}) }));
          const text = await response.text();
          let responseBody: unknown = null;
          try { responseBody = text ? JSON.parse(text) : null; } catch { responseBody = text; }
          result = { status: response.status, headers: Object.fromEntries(response.headers), body: responseBody };
        } finally { Object.assign(process.env, { NODE_ENV: previous, BLOG_APP_ORIGIN: previousOrigin }); }
        break;
      }
      case "adminRequest": {
        const route = adminRoutes[message.route] as { GET?: (request: Request, context?: unknown) => Promise<Response>; PATCH?: (request: Request, context: unknown) => Promise<Response>; POST?: (request: Request, context: unknown) => Promise<Response> };
        const handler = route[message.method] as ((request: Request, context?: unknown) => Promise<Response>) | undefined;
        if (!handler) throw new Error("Unsupported admin request");
        const request = new Request(`https://booking.example.test/api/admin/bookings${message.id ? `/${message.id}` : ""}${message.route === "list" || message.route === "detail" ? "" : `/${message.route}`}${message.query ?? ""}`, {
          method: message.method, headers: { origin: message.origin ?? process.env.BLOG_APP_ORIGIN!, ...(message.token ? { cookie: `blog_admin_session=${message.token}` } : {}), ...(message.method !== "GET" ? { "content-type": "application/json" } : {}) },
          ...(message.method !== "GET" ? { body: JSON.stringify(message.body ?? {}) } : {}),
        });
        const response = await handler(request, message.route === "list" ? undefined : { params: Promise.resolve({ id: String(message.id) }) });
        result = { status: response.status, headers: Object.fromEntries(response.headers), body: await response.json() };
        break;
      }
      case "adminToken": result = await createSession(message.id, message.authVersion); break;
      case "listingRequest": {
        const route = listingRoutes[message.route] as Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", (request: Request, context?: unknown) => Promise<Response>>>;
        const handler = route[message.method];
        if (!handler) throw new Error("Unsupported listing request");
        const suffix = message.route === "list" ? "" : `/${message.id}${message.route === "detail" ? "" : `/${message.route}`}`;
        const request = new Request(`https://booking.example.test/api/admin/listings${suffix}${message.query ?? ""}`, {
          method: message.method, headers: { origin: message.origin ?? process.env.BLOG_APP_ORIGIN!, ...(message.token ? { cookie: `blog_admin_session=${message.token}` } : {}), ...(message.method !== "GET" ? { "content-type": "application/json" } : {}) },
          ...(message.method !== "GET" ? { body: JSON.stringify(message.body ?? {}) } : {}),
        });
        const response = await handler(request, message.route === "list" ? undefined : { params: Promise.resolve({ id: String(message.id) }) });
        result = { status: response.status, headers: Object.fromEntries(response.headers), body: await response.json() };
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
      case "guest": {
        const previous = process.env.NODE_ENV;
        if (message.production) Object.assign(process.env, { NODE_ENV: "production" });
        let response: Response;
        try { response = await guestRoutes.register.POST(new Request("https://booking.example.test/api/guest/register", {
          method: "POST", headers: message.origin === undefined ? { origin: process.env.BLOG_APP_ORIGIN! } : { origin: message.origin },
          body: JSON.stringify({ name: message.name ?? "Synthetic Guest", email: message.email ?? `guest-${process.pid}@example.test`, password: message.password ?? "synthetic-password-123", ...(message.phone === undefined ? {} : { phone: message.phone }) }),
        })); } finally { Object.assign(process.env, { NODE_ENV: previous }); }
        if (response.status === 200) guestCookie = response.headers.get("set-cookie")!.split(";", 1)[0];
        result = { status: response.status, cookie: response.headers.get("set-cookie") };
        break;
      }
      case "guestLogin": case "guestLogout": {
        const route = message.action === "guestLogin" ? guestRoutes.login : guestRoutes.logout;
        const response = await route.POST(new Request(`https://booking.example.test/api/guest/${message.action}`, {
          method: "POST", headers: { origin: process.env.BLOG_APP_ORIGIN!, cookie: guestCookie },
          ...(message.action === "guestLogin" ? { body: JSON.stringify({ email: message.email, password: message.password }) } : {}),
        }));
        if (message.action === "guestLogin" && response.status === 200) guestCookie = response.headers.get("set-cookie")!.split(";", 1)[0];
        result = { status: response.status, cookie: response.headers.get("set-cookie") };
        break;
      }
      case "history": result = await getGuestReservations(new Request("https://booking.example.test", { headers: { cookie: message.cookie ?? guestCookie } })); break;
      case "crossAudience": {
        const staffToken = await createSession(1, 1);
        result = {
          guestFromStaff: await getGuestSession(new Request("http://localhost:3000", { headers: { cookie: `guest_session=${staffToken}` } })),
          staffFromGuest: await getSession(new Request("http://localhost:3000", { headers: { cookie: guestCookie.replace(/^guest_session=/, "blog_admin_session=") } })),
        };
        break;
      }
    }
    process.send!({ result });
  } catch (error) {
    process.send!({ failure: (error as Error).stack });
  }
});
process.on("disconnect", async () => { await db.close(); process.exit(); });
