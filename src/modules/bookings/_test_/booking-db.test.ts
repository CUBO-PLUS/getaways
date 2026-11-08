import { execFileSync, fork, spawnSync, type ChildProcess } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Booking, MarkPaidResult, QuoteUpdate } from "../server/booking-store";
import type { CheckoutData } from "../../checkout/server/checkout";
import type { BookingConfirmationData } from "../server/bookings";
import { signBtcpayDeploymentProof, type BtcpayDeploymentProof } from "../../payments/deployment-proof";

type Api = { status: number; headers: Record<string, string>; body: { ok: boolean; data: Record<string, unknown> } };
type Worker = Awaited<ReturnType<typeof startWorker>>;
const root = fileURLToPath(new URL("../../../", import.meta.url));
const children: ChildProcess[] = [];
let temporary: string;
let env: NodeJS.ProcessEnv;
let btcpayServer: Server;
let btcpayUrl: string;
let invoices = new Map<string, Record<string, unknown>>();
let invoicePosts = 0;
let postedInvoiceAmounts: string[] = [];
let failNextPost = false;
let btcpayPaths: string[] = [];
let btcpayDestination = "mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn";
let invoicePostBarrier: { entered: Promise<void>; release: () => void; signal: () => void; proceed: Promise<void> } | undefined;
const deploymentProofKey = "ab".repeat(32);
let deploymentProofPath: string;

async function startWorker(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  const child = fork(path.join(root, "infrastructure/prisma/_test_/support/booking-worker.mts"), [], {
    cwd: temporary, env: { ...env, ...overrides }, execArgv: ["--experimental-strip-types", "--experimental-loader", path.join(root, "infrastructure/prisma/_test_/support/booking-loader.mjs")], stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  children.push(child);
  let stderr = "";
  child.stderr!.on("data", chunk => { stderr += chunk; });
  function receive<T>() {
    return new Promise<T>((resolve, reject) => {
      const onExit = (code: number | null) => { child.off("message", onMessage); child.off("error", onError); reject(new Error(`Booking worker exited (${code}): ${stderr}`)); };
      const onError = (error: Error) => { child.off("message", onMessage); child.off("exit", onExit); reject(error); };
      const onMessage = (message: { failure?: string; result?: T; ready?: T }) => {
        child.off("exit", onExit);
        child.off("message", onMessage);
        child.off("error", onError);
        if (message.failure) reject(new Error(message.failure)); else resolve((message.ready ?? message.result) as T);
      };
      child.once("exit", onExit);
      child.once("message", onMessage);
      child.once("error", onError);
    });
  }
  const identity = await receive<{ pid: number; backend: number }>();
  return {
    ...identity,
    run<T>(message: object) { const pending = receive<T>(); child.send(message); return pending; },
    close() { if (child.connected) child.disconnect(); },
  };
}

// Opt-in owns an entirely new container and an allowlisted environment. Never reads app .env/DATABASE_URL.
describe.skipIf(process.env.PRISMA_TEST_DATABASE !== "1")("B2 bookings on disposable PostgreSQL", () => {
  const container = `gateways-booking-test-${randomUUID()}`;
  let created = false;
  let a: Worker;
  let b: Worker;

  function sql(statement: string) {
    return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "booking_test"], {
      input: statement, encoding: "utf8", timeout: 30_000,
    }).trim();
  }

  async function waitForBlocked(backends: number[]) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (Number(sql(`SELECT count(*) FROM pg_stat_activity WHERE pid IN (${backends.join(",")}) AND wait_event_type = 'Lock';`)) === backends.length) return;
      await setTimeout(20);
    }
    throw new Error("Expected independent PostgreSQL connections to contend on the held listing");
  }

  function create(worker = a, referral?: string, dates = ["2099-06-10", "2099-06-12"]) {
    return worker.run<Booking>({ action: "create", referral, input: {
      listing_id: 1, check_in: dates[0], check_out: dates[1], guest_notes: "Private guest note",
    } });
  }
  const quote: QuoteUpdate = { guests: 2, price_per_night_cents: 10000, cleaning_fee_cents: 2000, extra_guest_fee_cents: 0,
    pet_fee_cents: 0, discount_cents: 0, tax_cents: 3600, total_amount_cents: 25600, coupon_code: null };
  async function payable(worker = a, referral?: string, dates?: string[]) {
    const booking = await create(worker, referral, dates);
    const priced = await worker.run<Booking>({ action: "quote", id: booking.id, version: booking.version, quote });
    const opened = await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } });
    expect(opened.status).toBe(200);
    expect(opened.body.data).toMatchObject({ payment: { bookingId: priced.id, amountCents: priced.total_amount_cents, currency: "USD", status: "pending" } });
    return worker.run<Booking>({ action: "get", id: booking.id });
  }
  const evidence = (booking: Booking) => ({ paymentId: booking.payment_reference, bookingId: booking.id, amountCents: booking.total_amount_cents, currency: "USD" });
  const request = (worker: Worker, route: string, session: string, action?: string) => worker.run<Api>({ action: "request", route,
    method: action ? "POST" : "GET", sessionId: session, body: { session_id: session, action } });
  function privateResponse(response: Api) {
    expect(response.headers["cache-control"]).toContain("private");
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  }
  function holdNextInvoicePost() {
    let signal!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { signal = resolve; });
    const proceed = new Promise<void>((resolve) => { release = resolve; });
    invoicePostBarrier = { entered, proceed, signal, release };
    return { entered, release };
  }

  function btcpayWorkerConfig() {
    return { PAYMENT_PROVIDER: "btcpay-testnet", BTCPAY_NETWORK: "testnet", BTCPAY_API_URL: btcpayUrl,
      BTCPAY_STORE_ID: "synthetic-store", BTCPAY_API_KEY: "synthetic-api-key", BTCPAY_WEBHOOK_SECRET: "synthetic-webhook-secret",
      BTCPAY_EXPECTED_WALLET_ADDRESS: "mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn",
      BTCPAY_DEPLOYMENT_PROOF_PATH: deploymentProofPath, BTCPAY_DEPLOYMENT_PROOF_KEY: deploymentProofKey };
  }
  async function testnetWorker(network: "testnet" | "mainnet" = "testnet") {
    const worker = await startWorker({ ...btcpayWorkerConfig(), BTCPAY_NETWORK: network });
    const login = await worker.run<{ status: number }>({ action: "guestLogin", email: "shared-worker@example.test", password: "synthetic-password-123" });
    expect(login.status).toBe(200);
    return worker;
  }
  function markStubInvoiceSettled(invoice: Record<string, unknown>) {
    const method = (invoice.paymentMethods as Array<Record<string, unknown>>)[0]!;
    method.due = "0"; method.paymentMethodPaid = method.amount;
    method.payments = [{ status: "Settled", destination: method.destination, value: method.amount }];
    invoice.status = "Settled"; invoice.paidAmount = invoice.amount;
  }

  beforeAll(async () => {
    temporary = mkdtempSync("/tmp/opencode/booking-postgres-");
    env = { PATH: process.env.PATH, HOME: temporary, TMPDIR: temporary, NODE_ENV: "development",
      BLOG_APP_ORIGIN: "http://localhost:3000", BLOG_SESSION_SECRET: "synthetic-test-secret-with-at-least-32-bytes" };
    symlinkSync(path.join(root, "node_modules"), path.join(temporary, "node_modules"), "dir");
    writeFileSync(path.join(temporary, "prisma.config.ts"), `import { definePrismaConfig } from 'prisma/config';
      import { defineConfig } from '@prisma/orm-postgres/config';
      export default definePrismaConfig({ orm: defineConfig({
        contract: ${JSON.stringify(path.join(root, "infrastructure/prisma/contract.prisma"))},
        db: { connection: process.env.DATABASE_URL! },
        migrations: { dir: ${JSON.stringify(path.join(root, "infrastructure/prisma/migrations"))} }
      }) });`);
    created = true;
    execFileSync("docker", ["run", "--detach", "--name", container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
      "--env", "POSTGRES_DB=booking_test", "--mount", "type=tmpfs,destination=/var/lib/postgresql/data", "postgres:17-bookworm"], { timeout: 30_000, stdio: "pipe" });
    execFileSync("docker", ["exec", container, "sh", "-c", "until pg_isready -h 127.0.0.1 -U postgres -d booking_test >/dev/null 2>&1; do sleep 0.1; done"], { timeout: 30_000 });
    const port = execFileSync("docker", ["port", container, "5432/tcp"], { encoding: "utf8" }).trim();
    if (!/^127\.0\.0\.1:\d+$/.test(port)) throw new Error("Unexpected PostgreSQL binding");
    env.DATABASE_URL = `postgresql://postgres@${port}/booking_test?sslmode=disable`;
    execFileSync(process.execPath, [path.join(root, "node_modules/prisma/dist/prisma.js"), "db", "migrate", "--config", path.join(temporary, "prisma.config.ts"), "--db", env.DATABASE_URL], {
      cwd: temporary, env, encoding: "utf8", timeout: 60_000, stdio: "pipe",
    });
    btcpayServer = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString("utf8");
      const url = new URL(request.url!, "http://127.0.0.1");
      btcpayPaths.push(`${request.method} ${url.pathname}${url.search}`);
      const send = (status: number, value: unknown) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
      if (url.pathname === "/api/v1/server/info") return send(200, { version: "2.4.7", fullySynched: true, supportedPaymentMethods: ["BTC-CHAIN"], syncStatus: [{ paymentMethodId: "BTC-CHAIN", available: true }] });
      if (url.pathname === "/api/v1/stores/synthetic-store/payment-methods") return send(200, [{ paymentMethodId: "BTC-CHAIN", enabled: true }]);
      if (url.pathname === "/api/v1/stores/synthetic-store/payment-methods/BTC-CHAIN/wallet/preview") return send(200, { addresses: [{ index: 0, keyPath: "0/0", address: "mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn" }] });
      if (url.pathname === "/api/v1/stores/synthetic-store/invoices" && request.method === "POST") {
        invoicePosts++;
        const input = JSON.parse(body) as { amount: string; metadata: { orderId: string } };
        postedInvoiceAmounts.push(input.amount);
        const id = `invoice-${invoicePosts}`;
        const invoice = { id, storeId: "synthetic-store", amount: input.amount, currency: "USD", paidAmount: "0.00", status: "New", additionalStatus: "None",
          checkoutLink: `http://btcpay.test/i/${id}`, metadata: input.metadata,
          paymentMethods: [{ paymentMethodId: "BTC-CHAIN", currency: "BTC", destination: btcpayDestination, amount: "0.00001000", due: "0.00001000", paymentMethodPaid: "0", payments: [] }] };
        invoices.set(id, invoice);
        const barrier = invoicePostBarrier;
        if (barrier) {
          invoicePostBarrier = undefined;
          barrier.signal();
          await barrier.proceed;
        }
        if (failNextPost) { failNextPost = false; return send(503, { error: "response lost after invoice creation" }); }
        return send(200, { id, storeId: "synthetic-store", checkoutLink: invoice.checkoutLink, metadata: input.metadata });
      }
      if (url.pathname === "/api/v1/stores/synthetic-store/invoices" && request.method === "GET") {
        const orderId = url.searchParams.get("orderId");
        return send(200, [...invoices.values()].filter((invoice) => (invoice.metadata as { orderId: string }).orderId === orderId));
      }
      const match = /^\/api\/v1\/(?:stores\/synthetic-store\/)?invoices\/([^/]+)$/.exec(url.pathname);
      if (match && request.method === "GET") return invoices.has(match[1]!) ? send(200, invoices.get(match[1]!)) : send(404, {});
      return send(404, { path: url.pathname });
    });
    await new Promise<void>((resolve) => btcpayServer.listen(0, "127.0.0.1", resolve));
    const address = btcpayServer.address();
    if (!address || typeof address === "string") throw new Error("Native BTCPay HTTP stub did not bind TCP");
    btcpayUrl = `http://127.0.0.1:${address.port}`;
    deploymentProofPath = path.join(temporary, "synthetic-operator-deployment-proof.json");
    const checkedAt = Date.now() - 1_000;
    const proof = { version: 1 as const, apiUrl: btcpayUrl, storeId: "synthetic-store", network: "testnet" as const,
      composeProject: "synthetic-operator-attestation", btcpayContainerId: "synthetic-btcpay-container",
      btcpayImage: "btcpayserver/btcpayserver:2.4.7" as const, btcpayVersion: "2.4.7" as const, btcpayFullySynched: true as const,
      coreContainerId: "synthetic-core-container", coreImage: "btcpayserver/bitcoin:32.1" as const, coreChain: "test" as const,
      coreInitialBlockDownload: false as const, checkedAt, expiresAt: checkedAt + 9 * 60_000 };
    writeFileSync(deploymentProofPath, JSON.stringify({ ...proof, signature: signBtcpayDeploymentProof(proof, deploymentProofKey) }), { mode: 0o600 });
  }, 120_000);

  beforeEach(async () => {
    invoices = new Map(); invoicePosts = 0; postedInvoiceAmounts = []; failNextPost = false; btcpayPaths = []; btcpayDestination = "mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn"; invoicePostBarrier = undefined;
    sql(`TRUNCATE "ReferralAttribution", "ReferralCode", "PaymentAttempt", "Booking", "GuestAccount", "AdminUser", "AdminLoginThrottle", "Listing", "ListingTermAssignment", "ListingMedia" RESTART IDENTITY;
      INSERT INTO "Listing" (slug, title, "contentHtml", attributes, active, "updatedAt", "pricePerNightCents", "cleaningFeeCents", "extraGuestFeeCents", "petFeeCents", "ivaBasisPoints", "tourismBasisPoints", "maxGuests", "baseGuests", "petsAllowed")
        VALUES ('synthetic-stay', 'Agreed historical title', '', '{}', true, now(), 10000, 2000, 1500, 3000, 1300, 500, 4, 2, true);
      INSERT INTO "AdminUser" (email, name, "passwordHash", role, "authVersion", "updatedAt") VALUES ('synthetic-operator@example.test', 'Synthetic Operator', 'unused-test-hash', 'ADMIN', 1, now());
      INSERT INTO "ReferralCode" (code, active) VALUES ('SYNTHETIC-A', true), ('SYNTHETIC-B', true), ('SYNTHETIC-OFF', false);`);
    [a, b] = await Promise.all([startWorker(btcpayWorkerConfig()), startWorker(btcpayWorkerConfig())]);
    await a.run({ action: "guest", email: "shared-worker@example.test" });
    await b.run({ action: "guestLogin", email: "shared-worker@example.test", password: "synthetic-password-123" });
  }, 30_000);

  afterEach(async () => {
    await Promise.all(children.map(child => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      return new Promise<void>(resolve => { child.once("exit", () => resolve()); child.kill(); });
    }));
  });

  afterAll(() => {
    try { if (created) execFileSync("docker", ["rm", "--force", container], { timeout: 30_000, stdio: "pipe" }); }
    finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); btcpayServer?.close(); }
  });

  it("keeps all agreed prices, policies and receipt title after catalogue edits, without exposing private booking fields", async () => {
    sql(`UPDATE "Listing" SET "ivaBasisPoints" = 701, "tourismBasisPoints" = 237;`);
    const booking = await create();
    sql(`UPDATE "Listing" SET title = 'Changed title', "pricePerNightCents" = 99000, "cleaningFeeCents" = 8000,
      "petFeeCents" = 9000, "extraGuestFeeCents" = 5000, "ivaBasisPoints" = 0, "tourismBasisPoints" = 0,
      "maxGuests" = 1, "baseGuests" = 1, "petsAllowed" = false;
      UPDATE "Booking" SET "adminNotes" = 'Private internal note' WHERE id = ${booking.id};`);
    const response = await b.run<Api>({ action: "request", route: "quote", method: "POST", body: {
      session_id: booking.checkout_session_id, guests: 3, with_pet: true, total_amount_cents: 1,
    } });
    expect(response.status).toBe(200);
    privateResponse(response);
    expect(response.body.data).toMatchObject({ maxGuests: 4, baseGuests: 2, petsAllowed: true, petFeeCents: 3000, extraGuestFeeCents: 1500,
      ivaRate: 0.0701, tourismRate: 0.0237, quote: { subtotalCents: 28000, taxCents: 1823, tourismCents: 616, totalCents: 30439 } });
    const stored = await b.run<Booking>({ action: "get", id: booking.id });
    expect(stored).toMatchObject({ total_amount_cents: 30439, cleaning_fee_cents: 2000, pet_fee_cents: 3000, extra_guest_fee_cents: 3000,
      pricing_snapshot: booking.pricing_snapshot, agreed_listing_title: "Agreed historical title" });
    const dto = await b.run<{ checkout: CheckoutData; receipt: BookingConfirmationData }>({ action: "dto", sessionId: booking.checkout_session_id });
    expect(Object.keys(dto.checkout.booking).sort()).toEqual(["id", "version", "status", "check_in", "check_out", "nights", "guest_name", "guest_email", "guests", "total_amount_cents", "payment_open", "pricing_available"].sort());
    expect(Object.keys(dto.receipt.booking!).sort()).toEqual(["status", "guest_name", "check_in", "check_out", "nights", "total_amount_cents", "testPayment"].sort());
    expect(dto.receipt.booking!.testPayment).toBeNull();
    expect(dto.checkout.listing.title).toBe("Agreed historical title");
    expect(dto.receipt.listing?.title).toBe("Agreed historical title");
    expect((await create()).pricing_snapshot).toMatchObject({ pricePerNightCents: 99000, maxGuests: 1, petsAllowed: false });
  });

  it("aggregates the selected period separately from global attention counts and returns only five newest rows", async () => {
    sql(`INSERT INTO "Booking" ("listingId", "checkIn", "checkOut", nights, "guestName", "guestEmail", "pricePerNightCents", "cleaningFeeCents", "petFeeCents", "extraGuestFeeCents", "discountCents", "taxCents", "totalAmountCents", status, "agreedListingTitle", "createdAt", "updatedAt", "paymentReviewRequired", "pricingReviewRequired") VALUES
      (1, '2099-06-10', '2099-06-11', 1, 'Newest', 'newest@example.test', 0, 0, 0, 0, 0, 0, 1000, 'confirmed', 'Historical', now() - interval '1 day', now(), false, true),
      (1, '2099-06-10', '2099-06-11', 1, 'Second', 'second@example.test', 0, 0, 0, 0, 0, 0, 2000, 'cancelled', 'Historical', now() - interval '2 days', now(), false, true),
      (1, '2099-06-10', '2099-06-11', 1, 'Third', 'third@example.test', 0, 0, 0, 0, 0, 0, 3000, 'pending_payment', 'Historical', now() - interval '3 days', now(), false, true),
      (1, '2099-06-10', '2099-06-11', 1, 'Fourth', 'fourth@example.test', 0, 0, 0, 0, 0, 0, 4000, 'confirmed', 'Historical', now() - interval '4 days', now(), true, true),
      (1, '2099-06-10', '2099-06-11', 1, 'Fifth', 'fifth@example.test', 0, 0, 0, 0, 0, 0, 5000, 'pending_payment', 'Historical', now() - interval '5 days', now(), false, true),
      (1, '2099-06-10', '2099-06-11', 1, 'Sixth', 'sixth@example.test', 0, 0, 0, 0, 0, 0, 6000, 'confirmed', 'Historical', now() - interval '6 days', now(), false, true),
      (1, '2099-06-10', '2099-06-11', 1, 'Outside', 'outside@example.test', 0, 0, 0, 0, 0, 0, 7000, 'pending_payment', 'Historical', now() - interval '10 days', now(), false, true);
      INSERT INTO "PaymentAttempt" (id, "bookingId", provider, "storeId", network, "realTotalCents", "testAmountCents", status, "updatedAt")
        SELECT '33333333-3333-4333-8333-333333333333', id, 'btcpay-testnet', 'synthetic-store', 'testnet', "totalAmountCents", 100, 'review', now() FROM "Booking" WHERE "guestName" = 'Fourth';
      INSERT INTO "PaymentAttempt" (id, "bookingId", provider, "storeId", network, "realTotalCents", "testAmountCents", status, "updatedAt")
        SELECT '44444444-4444-4444-8444-444444444444', id, 'btcpay-testnet', 'synthetic-store', 'testnet', "totalAmountCents", 100, 'review', now() FROM "Booking" WHERE "guestName" = 'Outside';`);

    await expect(a.run({ action: "bookingStatistics", role: "EDITOR", period: 7 })).rejects.toThrow("forbidden");
    const stats = await a.run<{ total: number; confirmed: number; cancelled: number; confirmedReservationCents: number; pendingPayment: number; pendingPaymentCents: number; paymentReviewRequired: number; recent: Array<{ guestName: string; listingTitle: string }> }>({ action: "bookingStatistics", role: "ADMIN", period: 7 });
    expect(stats).toMatchObject({ total: 6, confirmed: 3, cancelled: 1, confirmedReservationCents: 11000,
      pendingPayment: 3, pendingPaymentCents: 15000, paymentReviewRequired: 2,
      recent: ["Newest", "Second", "Third", "Fourth", "Fifth"].map(guestName => ({ guestName, listingTitle: "Agreed historical title" })) });
  }, 30_000);

  it("protects staff booking operations, versions edits, and records an idempotent cancellation without changing payment data", async () => {
    const booking = await create();
    await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
    const token = await a.run<string>({ action: "adminToken", id: 1, authVersion: 1 });
    const call = (route: "list" | "detail" | "contact" | "notes" | "cancel", method: "GET" | "PATCH" | "POST", body?: Record<string, unknown>, useToken = token) =>
      a.run<{ status: number; headers: Record<string, string>; body: Record<string, unknown> }>({ action: "adminRequest", route, method, id: booking.id, token: useToken, body });
    const list = await call("list", "GET");
    expect(list.status).toBe(200);
    expect(list.headers["cache-control"]).toContain("no-store");
    expect(JSON.stringify(list.body)).not.toContain(booking.checkout_session_id);
    expect((await a.run<{ status: number }>({ action: "adminRequest", route: "list", method: "GET", token, query: `?listingId=2147483648` })).status).toBe(400);
    expect((await a.run<{ status: number }>({ action: "adminRequest", route: "list", method: "GET", token, query: `?from=2099-02-30` })).status).toBe(400);
    expect((await a.run<{ status: number }>({ action: "adminRequest", route: "list", method: "GET", token, query: `?from=2099-06-20&to=2099-06-10` })).status).toBe(400);
    const current = await a.run<Booking>({ action: "get", id: booking.id });
    expect((await call("detail", "GET", undefined, "")).status).toBe(401);
    expect((await a.run<{ status: number }>({ action: "adminRequest", route: "contact", method: "PATCH", id: booking.id, token, origin: "https://attacker.example", body: { version: current.version, name: "Hostile", email: "hostile@example.test", phone: null } })).status).toBe(403);
    expect(await a.run<Booking>({ action: "get", id: booking.id })).toEqual(current);
    const contact = await call("contact", "PATCH", { version: current.version, name: "Updated Guest", email: "UPDATED@example.test", phone: null });
    expect(contact).toMatchObject({ status: 200, body: { version: current.version + 1 } });
    const notes = await call("notes", "PATCH", { version: current.version + 1, notes: "Staff-only" });
    expect(notes).toMatchObject({ status: 200, body: { version: current.version + 2 } });
    const stale = await call("contact", "PATCH", { version: current.version, name: "Overwrite", email: "overwrite@example.test", phone: null });
    expect(stale.status).toBe(409);
    expect((await call("contact", "PATCH", { version: current.version + 2, name: "Overwrite", email: "overwrite@example.test", phone: null, status: "confirmed" })).status).toBe(400);
    const beforeCancel = await a.run<Booking>({ action: "get", id: booking.id });
    const cancelled = await call("cancel", "POST", { version: beforeCancel.version, confirmed: true, reason: "Guest request" });
    expect(cancelled).toMatchObject({ status: 200, body: { status: "cancelled", version: beforeCancel.version + 1 } });
    expect(await call("cancel", "POST", { version: beforeCancel.version + 1, confirmed: true, reason: "Retry" })).toMatchObject({ status: 200, body: { status: "cancelled" } });
    const saved = await a.run<Booking>({ action: "get", id: booking.id });
    expect(saved).toMatchObject({ status: "cancelled", guest_name: "Updated Guest", guest_email: "updated@example.test", admin_notes: "Staff-only",
      total_amount_cents: beforeCancel.total_amount_cents, pricing_snapshot: beforeCancel.pricing_snapshot, payment_reference: beforeCancel.payment_reference,
      cancelled_by: "1", cancellation_reason: "Guest request" });
    expect(saved.cancelled_at).not.toBeNull();
    expect(JSON.stringify(await a.run({ action: "history" }))).not.toContain("Staff-only");
    sql(`UPDATE "AdminUser" SET role = 'BOOKING_MANAGER' WHERE id = 1;`);
    expect((await call("list", "GET")).status).toBe(200);
    sql(`UPDATE "AdminUser" SET role = 'EDITOR' WHERE id = 1;`);
    expect((await call("list", "GET")).status).toBe(403);
    sql(`UPDATE "AdminUser" SET role = 'ADMIN' WHERE id = 1;`);
    sql(`UPDATE "AdminUser" SET "authVersion" = 2 WHERE id = 1;`);
    expect((await call("list", "GET")).status).toBe(401);
    const currentToken = await a.run<string>({ action: "adminToken", id: 1, authVersion: 2 });
    expect((await a.run<{ status: number }>({ action: "adminRequest", route: "list", method: "GET", token: currentToken })).status).toBe(200);
    sql(`UPDATE "AdminUser" SET active = false WHERE id = 1;`);
    expect((await a.run<{ status: number }>({ action: "adminRequest", route: "detail", method: "GET", id: booking.id, token: currentToken })).status).toBe(401);
  });

  it("restricts staff payment refresh and idempotently confirms the existing invoice from settled evidence", async () => {
    const worker = await testnetWorker();
    const booking = await payable(worker);
    const token = await worker.run<string>({ action: "adminToken", id: 1, authVersion: 1 });
    const refresh = (useToken = token, origin?: string) => worker.run<{ status: number; headers: Record<string, string>; body: Record<string, unknown> }>({
      action: "adminRequest", route: "detail", method: "POST", id: booking.id, token: useToken, origin,
    });
    const beforeRequests = btcpayPaths.length;
    expect((await refresh("")).status).toBe(401);
    const guest = await worker.run<{ cookie: string }>({ action: "guestLogin", email: "shared-worker@example.test", password: "synthetic-password-123" });
    expect((await refresh(guest.cookie.split(";", 1)[0]!.split("=")[1]!)).status).toBe(401);
    for (const origin of ["", "https://attacker.example"]) expect((await refresh(token, origin)).status).toBe(403);
    sql(`UPDATE "AdminUser" SET role = 'EDITOR' WHERE id = 1;`);
    expect((await refresh()).status).toBe(403);
    sql(`UPDATE "AdminUser" SET role = 'ADMIN', "authVersion" = 2 WHERE id = 1;`);
    expect((await refresh()).status).toBe(401);
    sql(`UPDATE "AdminUser" SET "authVersion" = 1, active = false WHERE id = 1;`);
    expect((await refresh()).status).toBe(401);
    sql(`UPDATE "AdminUser" SET active = true WHERE id = 1;`);
    expect(btcpayPaths).toHaveLength(beforeRequests);
    expect(await a.run({ action: "get", id: booking.id })).toEqual(booking);

    const pending = await refresh();
    expect(pending).toMatchObject({ status: 200, body: { version: booking.version, status: "pending_payment", paymentReviewRequired: false, testPayment: { amountCents: 100, status: "pending" } } });
    expect(pending.headers["cache-control"]).toContain("no-store");
    expect(sql(`SELECT status FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`)).toBe("pending");
    markStubInvoiceSettled(invoices.get("invoice-1")!);
    sql(`UPDATE "AdminUser" SET role = 'BOOKING_MANAGER' WHERE id = 1;`);
    const settled = await refresh();
    expect(settled).toMatchObject({ status: 200, body: { version: booking.version + 1, status: "confirmed", paymentReviewRequired: false, testPayment: { amountCents: 100, status: "paid" } } });
    const confirmed = await a.run<Booking>({ action: "get", id: booking.id });
    expect(confirmed).toMatchObject({ status: "confirmed", payment_reference: booking.payment_reference, total_amount_cents: 25600 });
    const paidAttempt = sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t WHERE "bookingId" = ${booking.id};`);
    expect(JSON.parse(paidAttempt)).toMatchObject({ status: "paid", invoiceId: "invoice-1", realTotalCents: 25600, testAmountCents: 100 });
    expect((await refresh()).body).toEqual(settled.body);
    expect(await a.run({ action: "get", id: booking.id })).toEqual(confirmed);
    expect(sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t WHERE "bookingId" = ${booking.id};`)).toBe(paidAttempt);
    expect(invoicePosts).toBe(1);
  }, 30_000);

  it("refreshes settled payments with an expired deployment proof without creating another invoice", async () => {
    const worker = await testnetWorker();
    const booking = await create();
    const token = await worker.run<string>({ action: "adminToken", id: 1, authVersion: 1 });
    const message = { action: "adminRequest", route: "detail", method: "POST", id: booking.id, token };
    expect((await worker.run<{ status: number }>(message)).status).toBe(409);
    expect(invoicePosts).toBe(0);
    await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
    expect((await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } })).status).toBe(200);
    markStubInvoiceSettled(invoices.get("invoice-1")!);
    const proof = JSON.parse(readFileSync(deploymentProofPath, "utf8")) as BtcpayDeploymentProof;
    const checkedAt = Date.now() - 11 * 60_000;
    const expired = { ...proof, checkedAt, expiresAt: checkedAt + 10 * 60_000 };
    const expiredPath = path.join(temporary, "expired-deployment-proof.json");
    const signed = JSON.stringify({ ...expired, signature: signBtcpayDeploymentProof(expired, deploymentProofKey) });
    writeFileSync(expiredPath, signed, { mode: 0o600 });
    const disabled = await startWorker({ ...btcpayWorkerConfig(), BTCPAY_DEPLOYMENT_PROOF_PATH: expiredPath });
    const response = await disabled.run<{ status: number; body: { error: string } }>(message);
    expect(response.status).toBe(200);
    expect(readFileSync(expiredPath, "utf8")).toBe(signed);
    expect((await a.run<Booking>({ action: "get", id: booking.id })).status).toBe("confirmed");
    expect(sql(`SELECT status FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`)).toBe("paid");
    expect(invoicePosts).toBe(1);
  }, 30_000);

  it("reserves one frozen testnet invoice across processes and blocks repricing while the provider is called", async () => {
    const booking = await create();
    await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
    const x = await testnetWorker();
    const y = await testnetWorker();
    const [left, right] = await Promise.all([x.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } }),
      y.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } })]);
    expect([left.status, right.status], JSON.stringify({ bodies: [left.body, right.body], btcpayPaths })).toContain(200);
    expect([left.status, right.status].every((status) => status === 200 || status === 409)).toBe(true);
    expect(invoicePosts).toBe(1);
    const stored = await a.run<Booking>({ action: "get", id: booking.id });
    const attempt = JSON.parse(sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t WHERE "bookingId" = ${booking.id};`)) as Record<string, unknown>;
    expect(attempt).toMatchObject({ status: "pending", realTotalCents: 25600, testAmountCents: 100, network: "testnet", invoiceId: "invoice-1" });
    expect(postedInvoiceAmounts).toEqual(["1.00"]);
    expect(stored.payment_reference).toBe(attempt.id);
    expect(await b.run({ action: "quote", id: booking.id, version: stored.version, quote: { ...quote, total_amount_cents: 1 } })).toBeNull();
    const resumed = await testnetWorker();
    expect((await resumed.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } })).status).toBe(200);
    expect(invoicePosts).toBe(1);
  }, 30_000);

  it("reconciles a persisted one-cent legacy attempt without rewriting it and rejects that amount for a new dollar attempt", async () => {
    const legacyBooking = await create();
    await a.run({ action: "quote", id: legacyBooking.id, version: legacyBooking.version, quote });
    const worker = await testnetWorker();
    const legacyId = "11111111-1111-4111-8111-111111111111";
    sql(`INSERT INTO "PaymentAttempt" (id, "bookingId", provider, "storeId", network, "realTotalCents", "testAmountCents", "invoiceId", "checkoutLink", "btcDestination", "btcAmount", status, "updatedAt")
      VALUES ('${legacyId}', ${legacyBooking.id}, 'btcpay-testnet', 'synthetic-store', 'testnet', 25600, 1, 'legacy-invoice', 'http://btcpay.test/i/legacy', 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', '0.00001000', 'pending', now());
      UPDATE "Booking" SET "paymentReference" = '${legacyId}' WHERE id = ${legacyBooking.id};`);
    const legacyInvoice = { id: "legacy-invoice", storeId: "synthetic-store", amount: "0.01", currency: "USD", paidAmount: "0.01", status: "Settled", additionalStatus: "None",
      checkoutLink: "http://btcpay.test/i/legacy", metadata: { orderId: legacyId },
      paymentMethods: [{ paymentMethodId: "BTC-CHAIN", currency: "BTC", destination: "mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn", amount: "0.00001000", due: "0", paymentMethodPaid: "0.00001000",
        payments: [{ status: "Settled", destination: "mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn", value: "0.00001000" }] }] };
    invoices.set("legacy-invoice", legacyInvoice);
    const legacyDto = await worker.run<{ checkout: CheckoutData }>({ action: "dto", sessionId: legacyBooking.checkout_session_id });
    expect(legacyDto.checkout).toMatchObject({ testChargeUsd: "0.01", methods: [{ name: "Bitcoin testnet — USD 0.01 test charge", available: true }] });
    const legacyResult = await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: legacyBooking.checkout_session_id, action: "reconcile" } });
    expect(legacyResult.body).toEqual({ ok: true, data: { status: "confirmed", paymentStatus: "paid" } });
    expect(sql(`SELECT "testAmountCents" FROM "PaymentAttempt" WHERE id = '${legacyId}';`)).toBe("1");
    expect(await a.run<Booking>({ action: "get", id: legacyBooking.id })).toMatchObject({ status: "confirmed", payment_reference: legacyId, total_amount_cents: 25600 });

    const currentBooking = await create(a, undefined, ["2099-06-18", "2099-06-20"]);
    await a.run({ action: "quote", id: currentBooking.id, version: currentBooking.version, quote });
    const opened = await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: currentBooking.checkout_session_id } });
    expect(opened.status).toBe(200);
    const currentDto = await worker.run<{ checkout: CheckoutData }>({ action: "dto", sessionId: currentBooking.checkout_session_id });
    expect(currentDto.checkout).toMatchObject({ testChargeUsd: "1.00", methods: [{ name: "Bitcoin testnet — USD 1.00 test charge", available: true }] });
    expect(postedInvoiceAmounts).toEqual(["1.00"]);
    const attemptId = String((opened.body.data.payment as Record<string, unknown>).id);
    expect(sql(`SELECT "realTotalCents" || ':' || "testAmountCents" FROM "PaymentAttempt" WHERE id = '${attemptId}';`)).toBe("25600:100");
    invoices.get("invoice-1")!.amount = "0.01";
    const mismatched = await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: currentBooking.checkout_session_id, action: "reconcile" } });
    expect(mismatched.status).toBe(409);
    expect(await a.run<Booking>({ action: "get", id: currentBooking.id })).toMatchObject({ status: "pending_payment", payment_reference: attemptId, total_amount_cents: 25600 });
    expect(sql(`SELECT status || ':' || "testAmountCents" FROM "PaymentAttempt" WHERE id = '${attemptId}';`)).toBe("review:100");

    const invalidBooking = await create(a, undefined, ["2099-06-26", "2099-06-28"]);
    expect(sql(`DO $$ BEGIN
      INSERT INTO "PaymentAttempt" (id, "bookingId", provider, "storeId", network, "realTotalCents", "testAmountCents", status, "updatedAt")
        VALUES ('22222222-2222-4222-8222-222222222222', ${invalidBooking.id}, 'btcpay-testnet', 'synthetic-store', 'testnet', 25600, 2, 'creating', now());
      RAISE EXCEPTION 'unsupported test charge was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END $$;
    SELECT 'unsupported charge rejected';`)).toBe("unsupported charge rejected");
  }, 30_000);

  it("does not return BTCPay instructions when cancellation wins during invoice creation", async () => {
    const booking = await create();
    await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
    const worker = await testnetWorker();
    const held = holdNextInvoicePost();
    const opening = worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } });
    let attemptId = "";
    try {
      await held.entered;
      const reserved = await a.run<Booking>({ action: "get", id: booking.id });
      const attempt = JSON.parse(sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t WHERE "bookingId" = ${booking.id};`)) as Record<string, unknown>;
      attemptId = String(attempt.id);
      expect(reserved.payment_reference).toBe(attempt.id);
      expect(attempt).toMatchObject({ realTotalCents: 25600, testAmountCents: 100, status: "creating" });
      expect(await a.run<Booking>({ action: "cancel", id: booking.id, version: reserved.version })).toMatchObject({ status: "cancelled" });
    } finally {
      held.release();
    }
    const opened = await opening;
    expect(opened.status).not.toBe(200);
    expect(opened.body.ok).toBe(false);
    expect(opened.body.data?.payment).toBeUndefined();
    expect(invoicePosts).toBe(1);
    expect(await a.run<Booking>({ action: "get", id: booking.id })).toMatchObject({
      status: "cancelled", payment_reference: attemptId, total_amount_cents: 25600,
    });
    expect(sql(`SELECT "realTotalCents" || ':' || "testAmountCents" FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`)).toBe("25600:100");
  }, 30_000);

  it("recovers an uncertain invoice POST by the stable orderId without posting again", async () => {
    const booking = await create();
    await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
    const worker = await testnetWorker();
    failNextPost = true;
    const first = await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } });
    expect(first.status).toBe(409);
    worker.close();
    const resumed = await testnetWorker();
    const retry = await resumed.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } });
    expect(retry.status).toBe(200);
    expect(invoicePosts).toBe(1);
    expect(retry.body.data).toMatchObject({ payment: { id: (await a.run<Booking>({ action: "get", id: booking.id })).payment_reference, status: "pending", network: "testnet", testAmountCents: 100 } });
    const attempt = JSON.parse(sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t WHERE "bookingId" = ${booking.id};`)) as { invoiceId: string };
    const invoice = invoices.get(attempt.invoiceId)!;
    markStubInvoiceSettled(invoice);
    const reconciled = await resumed.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id, action: "reconcile" } });
    expect(reconciled.body).toEqual({ ok: true, data: { status: "confirmed", paymentStatus: "paid" } });
    expect(await a.run<Booking>({ action: "get", id: booking.id })).toMatchObject({ status: "confirmed" });
  }, 30_000);

  it("accepts official BIP173/350 testnet vectors for P2WPKH, P2WSH, and P2TR", async () => {
    const vectors = [
      ["v0 P2WPKH, 42 chars", "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"],
      ["v0 P2WSH, 62 chars", "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7"],
      ["v1 P2TR, 62 chars", "tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c"],
    ] as const;
    const worker = await testnetWorker();
    for (const [index, [outputType, address]] of vectors.entries()) {
      const booking = await create(a, undefined, [`2099-06-${10 + index * 2}`, `2099-06-${12 + index * 2}`]);
      await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
      btcpayDestination = address;
      const opened = await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } });
      expect.soft(opened.status, `${outputType}: ${JSON.stringify({ opened, reason: sql(`SELECT "reviewReason" FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`) })}`).toBe(200);
      if (opened.status === 200) expect.soft(opened.body.data).toMatchObject({ payment: { status: "pending", btc: { address } } });
    }
  }, 45_000);

  it("allows a full Processing invoice to settle later when authoritative payment evidence becomes final", async () => {
    const booking = await create();
    await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
    const worker = await testnetWorker();
    expect((await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } })).status).toBe(200);
    const attempt = JSON.parse(sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t WHERE "bookingId" = ${booking.id};`)) as { id: string; invoiceId: string };
    const invoice = invoices.get(attempt.invoiceId)!;
    const method = (invoice.paymentMethods as Array<Record<string, unknown>>)[0]!;
    invoice.status = "Processing"; invoice.paidAmount = invoice.amount; method.due = "0"; method.paymentMethodPaid = method.amount;
    method.payments = [{ status: "Processing", destination: method.destination, value: method.amount }];
    const reconcile = await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id, action: "reconcile" } });
    expect(reconcile.status).toBe(200);
    expect(reconcile.body).toEqual({ ok: true, data: { status: "pending_payment", paymentStatus: "pending" } });
    expect(await a.run<Booking>({ action: "get", id: booking.id })).toMatchObject({ status: "pending_payment", payment_review_required: false });
    expect(sql(`SELECT status FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`)).toBe("pending");
    markStubInvoiceSettled(invoice);
    const rawBody = JSON.stringify({ storeId: "synthetic-store", invoiceId: attempt.invoiceId, type: "InvoiceSettled" });
    const signature = `sha256=${createHmac("sha256", "synthetic-webhook-secret").update(rawBody).digest("hex")}`;
    expect((await worker.run<Api>({ action: "request", route: "webhook", method: "POST", rawBody, signature })).status).toBe(200);
    expect(await a.run<Booking>({ action: "get", id: booking.id })).toMatchObject({ status: "confirmed", payment_reference: attempt.id });
  }, 30_000);

  it.each(["webhook", "staff refresh"] as const)("keeps a partial-payment review terminal even if the invoice later reports settled (%s)", async (entrypoint) => {
    const booking = await create();
    await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
    const worker = await testnetWorker();
    expect((await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } })).status).toBe(200);
    const attempt = JSON.parse(sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t WHERE "bookingId" = ${booking.id};`)) as { id: string; invoiceId: string };
    const invoice = invoices.get(attempt.invoiceId)!;
    const method = (invoice.paymentMethods as Array<Record<string, unknown>>)[0]!;
    invoice.status = "Processing"; invoice.paidAmount = "0.00"; method.due = "0.00000500"; method.paymentMethodPaid = "0.00000500";
    method.payments = [{ status: "Processing", destination: method.destination, value: "0.00000500" }];
    const body = () => JSON.stringify({ storeId: "synthetic-store", invoiceId: attempt.invoiceId, type: "InvoiceProcessing" });
    const sign = (raw: string) => `sha256=${createHmac("sha256", "synthetic-webhook-secret").update(raw).digest("hex")}`;
    let rawBody = body();
    expect((await worker.run<Api>({ action: "request", route: "webhook", method: "POST", rawBody, signature: sign(rawBody) })).status).toBe(200);
    expect(sql(`SELECT status FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`)).toBe("review");
    markStubInvoiceSettled(invoice);
    if (entrypoint === "staff refresh") {
      const token = await worker.run<string>({ action: "adminToken", id: 1, authVersion: 1 });
      expect(await worker.run({ action: "adminRequest", route: "detail", method: "POST", id: booking.id, token })).toMatchObject({
        status: 200, body: { status: "pending_payment", paymentReviewRequired: true, testPayment: { status: "review" } },
      });
    } else {
      rawBody = JSON.stringify({ storeId: "synthetic-store", invoiceId: attempt.invoiceId, type: "InvoiceSettled" });
      expect((await worker.run<Api>({ action: "request", route: "webhook", method: "POST", rawBody, signature: sign(rawBody) })).status).toBe(200);
    }
    expect(invoicePosts).toBe(1);
    expect(await a.run<Booking>({ action: "get", id: booking.id })).toMatchObject({ status: "pending_payment", payment_review_required: true, payment_reference: attempt.id });
    expect(sql(`SELECT status FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`)).toBe("review");
  }, 30_000);

  it("accepts only raw-body HMAC and confirms from authoritative settled invoice data, not webhook claims", async () => {
    const booking = await create();
    await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
    const worker = await testnetWorker();
    expect((await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } })).status).toBe(200);
    const attempt = JSON.parse(sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t WHERE "bookingId" = ${booking.id};`)) as { id: string; invoiceId: string };
    const rawBody = JSON.stringify({ storeId: "synthetic-store", invoiceId: attempt.invoiceId, type: "InvoiceExpired" });
    const signature = `sha256=${createHmac("sha256", "synthetic-webhook-secret").update(rawBody).digest("hex")}`;
    expect((await worker.run<Api>({ action: "request", route: "webhook", method: "POST", rawBody, signature: "sha256=" + "0".repeat(64) })).status).toBe(401);
    expect((await a.run<Booking>({ action: "get", id: booking.id })).status).toBe("pending_payment");
    const invoice = invoices.get(attempt.invoiceId)!;
    markStubInvoiceSettled(invoice);
    const received = await worker.run<Api>({ action: "request", route: "webhook", method: "POST", rawBody, signature });
    expect(received.status).toBe(200);
    expect(await a.run<Booking>({ action: "get", id: booking.id })).toMatchObject({ status: "confirmed", payment_reference: attempt.id });
    expect(sql(`SELECT status FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`)).toBe("paid");
    const repeated = await worker.run<Api>({ action: "request", route: "webhook", method: "POST", rawBody, signature });
    expect(repeated.status).toBe(200);
    const outOfOrder = JSON.stringify({ storeId: "synthetic-store", invoiceId: attempt.invoiceId, type: "InvoiceExpired" });
    const oldSignature = `sha256=${createHmac("sha256", "synthetic-webhook-secret").update(outOfOrder).digest("hex")}`;
    expect((await worker.run<Api>({ action: "request", route: "webhook", method: "POST", rawBody: outOfOrder, signature: oldSignature })).status).toBe(200);
    expect(await a.run<Booking>({ action: "get", id: booking.id })).toMatchObject({ status: "confirmed", payment_reference: attempt.id });
  }, 30_000);

  it("keeps foreign-owner and simulated-payment requests from mutating a real BTCPay attempt", async () => {
    const booking = await create();
    await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
    const owner = await testnetWorker();
    const priced = await a.run<Booking>({ action: "get", id: booking.id });
    for (const action of ["simulate_paid", "unknown_action"]) {
      expect((await owner.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id, action } })).status).toBe(404);
    }
    expect(await a.run({ action: "get", id: booking.id })).toEqual(priced);
    expect(sql(`SELECT count(*) FROM "PaymentAttempt";`)).toBe("0");
    expect(invoicePosts).toBe(0);
    const opened = await owner.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } });
    expect(opened.status, JSON.stringify({ opened, btcpayPaths, attempt: sql(`SELECT "reviewReason" FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`) })).toBe(200);
    const stored = await a.run<Booking>({ action: "get", id: booking.id });
    const attempt = sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t;`);
    const other = await testnetWorker();
    expect((await other.run<{ status: number }>({ action: "guest", email: "another-owner@example.test" })).status).toBe(200);
    const denied = await other.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } });
    expect(denied.status).toBe(404);
    for (const action of ["simulate_paid", "unknown_action"]) {
      expect((await owner.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id, action } })).status).toBe(404);
    }
    expect(await a.run({ action: "get", id: booking.id })).toEqual(stored);
    expect(sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t;`)).toBe(attempt);
    expect(invoicePosts).toBe(1);
  }, 30_000);

  it("fails closed for unconfigured and obsolete mock providers without changing persisted attempts or creating invoices", async () => {
    const booking = await payable();
    const uncharged = await create(a, undefined, ["2099-06-18", "2099-06-20"]);
    const priced = await a.run<Booking>({ action: "quote", id: uncharged.id, version: uncharged.version, quote });
    const attempt = sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t;`);
    const paths = [...btcpayPaths];
    for (const overrides of [{}, { PAYMENT_PROVIDER: "btc-mock" }]) {
      const disabled = await startWorker(overrides);
      expect((await disabled.run<{ status: number }>({ action: "guestLogin", email: "shared-worker@example.test", password: "synthetic-password-123" })).status).toBe(200);
      for (const current of [booking, priced]) {
        const dto = await disabled.run<{ checkout: CheckoutData }>({ action: "dto", sessionId: current.checkout_session_id });
        expect(dto.checkout.methods).toMatchObject([{ available: false }]);
        for (const action of [undefined, "reconcile", "simulate_paid"]) {
          const rejected = await disabled.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: current.checkout_session_id, action } });
          expect(rejected).toMatchObject({ status: 404, body: { ok: false, code: "payment_unavailable" } });
          privateResponse(rejected);
        }
        expect(await request(disabled, "btc", current.checkout_session_id!)).toMatchObject({ status: 404, body: { ok: false, code: "payment_unavailable" } });
        expect(await a.run({ action: "get", id: current.id })).toEqual(current);
      }
    }
    expect(sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t;`)).toBe(attempt);
    expect(btcpayPaths).toEqual(paths);
    expect(invoicePosts).toBe(1);
  }, 30_000);

  it("allows production testnet creation but rejects mainnet create, reconciliation, and webhook paths", async () => {
    const booking = await create();
    await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
    const production = await testnetWorker();
    // Historical unowned rows remain capability-accessible in production, so auth cannot mask the provider guard.
    sql(`UPDATE "Booking" SET "guestAccountId" = NULL WHERE id = ${booking.id};`);
    const opened = await production.run<Api>({ action: "request", route: "btc", method: "POST", production: true, body: { session_id: booking.checkout_session_id } });
    expect(opened.status).toBe(200);
    expect(invoicePosts).toBe(1);
    sql(`UPDATE "Booking" SET "guestAccountId" = ${booking.guest_account_id} WHERE id = ${booking.id};`);
    const owner = await testnetWorker();
    expect((await owner.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } })).status).toBe(200);
    const attempt = JSON.parse(sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t WHERE "bookingId" = ${booking.id};`)) as { id: string; invoiceId: string };
    const before = btcpayPaths.length;
    sql(`UPDATE "Booking" SET "guestAccountId" = NULL WHERE id = ${booking.id};`);
    const mainnet = await testnetWorker("mainnet");
    const creation = await mainnet.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } });
    const reconciliation = await mainnet.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id, action: "reconcile" } });
    const rawBody = JSON.stringify({ storeId: "synthetic-store", invoiceId: attempt.invoiceId, type: "InvoiceSettled" });
    const signature = `sha256=${createHmac("sha256", "synthetic-webhook-secret").update(rawBody).digest("hex")}`;
    const webhook = await mainnet.run<Api>({ action: "request", route: "webhook", method: "POST", rawBody, signature });
    expect(creation.status).toBe(404);
    expect(reconciliation.status).toBe(404);
    expect(webhook.status).toBe(503);
    expect(btcpayPaths).toHaveLength(before);
    sql(`UPDATE "Booking" SET "guestAccountId" = ${booking.guest_account_id} WHERE id = ${booking.id};`);
    expect(await a.run<Booking>({ action: "get", id: booking.id })).toMatchObject({ status: "pending_payment", payment_reference: attempt.id });
    expect(sql(`SELECT status FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`)).toBe("pending");
  }, 30_000);

  it("does not create an invoice when the receiving wallet differs from the configured testnet wallet", async () => {
    const booking = await create();
    await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
    const worker = await startWorker({ ...btcpayWorkerConfig(), BTCPAY_EXPECTED_WALLET_ADDRESS: "n2eMqTT929pb1RDNuqEnxdaLau1rxy3efi" });
    expect((await worker.run<{ status: number }>({ action: "guestLogin", email: "shared-worker@example.test", password: "synthetic-password-123" })).status).toBe(200);
    const response = await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } });
    expect(response.status).not.toBe(200);
    expect(invoicePosts).toBe(0);
    expect(sql(`SELECT status FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`)).toBe("review");
  }, 30_000);

  it("holds mismatched store, dust and partial-payment evidence for review without confirming", async () => {
    const booking = await create();
    await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
    const worker = await testnetWorker();
    const opened = await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } });
    expect(opened.status, JSON.stringify({ opened, btcpayPaths, attempt: sql(`SELECT "reviewReason" FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`) })).toBe(200);
    const attempt = JSON.parse(sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t WHERE "bookingId" = ${booking.id};`)) as { invoiceId: string };
    const invoice = invoices.get(attempt.invoiceId)!;
    for (const alter of [
      () => { invoice.storeId = "foreign-store"; },
      () => { invoice.storeId = "synthetic-store"; (invoice.paymentMethods as Array<Record<string, unknown>>)[0]!.amount = "0.00000100"; },
      () => { const method = (invoice.paymentMethods as Array<Record<string, unknown>>)[0]!; method.amount = "0.00001000"; method.due = "0.00000500"; method.payments = [{ status: "Processing", destination: method.destination, value: "0.00000500" }]; invoice.status = "Processing"; },
    ]) {
      alter();
      const rejected = await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id, action: "reconcile" } });
      expect(rejected.status).toBe(409);
      expect((await a.run<Booking>({ action: "get", id: booking.id })).status).toBe("pending_payment");
      expect(sql(`SELECT status FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`)).toBe("review");
    }
  }, 30_000);

  it.each(["webhook", "staff refresh"] as const)("does not resurrect a cancelled booking when a valid late settled payment arrives (%s)", async (entrypoint) => {
    const booking = await create();
    await a.run({ action: "quote", id: booking.id, version: booking.version, quote });
    const worker = await testnetWorker();
    const opened = await worker.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } });
    expect(opened.status, JSON.stringify({ opened, btcpayPaths, attempt: sql(`SELECT "reviewReason" FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`) })).toBe(200);
    const attempt = JSON.parse(sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t WHERE "bookingId" = ${booking.id};`)) as { id: string; invoiceId: string };
    const current = await a.run<Booking>({ action: "get", id: booking.id });
    await a.run({ action: "cancel", id: booking.id, version: current.version });
    markStubInvoiceSettled(invoices.get(attempt.invoiceId)!);
    if (entrypoint === "staff refresh") {
      const token = await worker.run<string>({ action: "adminToken", id: 1, authVersion: 1 });
      expect(await worker.run({ action: "adminRequest", route: "detail", method: "POST", id: booking.id, token })).toMatchObject({
        status: 200, body: { status: "cancelled", paymentReviewRequired: true, testPayment: { status: "paid" } },
      });
    } else {
      const rawBody = JSON.stringify({ storeId: "synthetic-store", invoiceId: attempt.invoiceId, type: "InvoiceSettled" });
      const signature = `sha256=${createHmac("sha256", "synthetic-webhook-secret").update(rawBody).digest("hex")}`;
      expect((await worker.run<Api>({ action: "request", route: "webhook", method: "POST", rawBody, signature })).status).toBe(200);
    }
    expect(invoicePosts).toBe(1);
    expect(sql(`SELECT status FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`)).toBe("paid");
    expect(await a.run<Booking>({ action: "get", id: booking.id })).toMatchObject({ status: "cancelled", payment_review_required: true, payment_reference: attempt.id });
  }, 30_000);

  it("rejects stale payment association after a concurrent quote and rejects all repricing once a payment owns the amount", async () => {
    const booking = await create();
    const holder = await startWorker();
    await holder.run({ action: "hold", listingId: 1 });
    const associating = a.run<Booking | null>({ action: "associate", input: { id: booking.id, expectedVersion: booking.version,
      amountCents: booking.total_amount_cents, paymentReference: "stale-payment" } });
    try {
      await waitForBlocked([a.backend]);
      expect(await b.run<Booking>({ action: "quote", id: booking.id, version: booking.version, quote })).toMatchObject({ total_amount_cents: 25600 });
    } finally { await holder.run({ resume: true }); }
    expect(await associating).toBeNull();
    const current = await a.run<Booking>({ action: "get", id: booking.id });
    expect(await a.run({ action: "associate", input: { id: current.id, expectedVersion: current.version, amountCents: 1, paymentReference: "wrong-amount" } })).toBeNull();
    const opened = await a.run<Booking>({ action: "associate", input: { id: current.id, expectedVersion: current.version,
      amountCents: current.total_amount_cents, paymentReference: "owned-payment" } });
    for (const version of [current.version, opened.version]) {
      expect(await b.run({ action: "quote", id: current.id, version, quote: { ...quote, total_amount_cents: 1 } })).toBeNull();
    }
    const rejected = await b.run<Api>({ action: "request", route: "quote", method: "POST", body: { session_id: booking.checkout_session_id, guests: 3 } });
    expect(rejected.status).toBe(409);
    expect(await a.run({ action: "get", id: booking.id })).toEqual(opened);
  }, 20_000);

  it("serializes overlapping confirmations across processes, permits adjacent stays and survives a fresh process", async () => {
    const first = await payable(a);
    const second = await payable(b);
    expect(a.pid).not.toBe(b.pid);
    expect(a.backend).not.toBe(b.backend);
    const holder = await startWorker();
    await holder.run({ action: "hold", listingId: 1 });
    const confirmations = [a.run<MarkPaidResult>({ action: "paid", evidence: evidence(first) }), b.run<MarkPaidResult>({ action: "paid", evidence: evidence(second) })];
    try { await waitForBlocked([a.backend, b.backend]); }
    finally { await holder.run({ resume: true }); }
    const results = await Promise.all(confirmations);
    expect(results.filter(result => result.found && result.booking.status === "confirmed")).toHaveLength(1);
    expect(results.filter(result => result.found && result.doubleBooked && result.booking.status === "cancelled" && result.booking.payment_review_required)).toHaveLength(1);
    const adjacent = await payable(a, undefined, ["2099-06-12", "2099-06-14"]);
    expect(await a.run({ action: "paid", evidence: evidence(adjacent) })).toMatchObject({ found: true, doubleBooked: false, booking: { status: "confirmed" } });
    a.close(); b.close();
    const fresh = await startWorker();
    expect([a.pid, b.pid]).not.toContain(fresh.pid);
    for (const result of results) {
      if (!result.found) throw new Error("Missing payment result");
      expect(await fresh.run({ action: "get", id: result.booking.id })).toEqual(result.booking);
      expect(await fresh.run({ action: "paid", evidence: evidence(result.booking) })).toMatchObject({ found: true,
        alreadyConfirmed: result.booking.status === "confirmed", booking: result.booking });
    }
    expect(sql(`SELECT count(*) FROM "Booking" WHERE status = 'confirmed';`)).toBe("2");
  }, 20_000);

  it("keeps cancellation authoritative for a late, repeated payment and refuses mismatched payment evidence", async () => {
    const booking = await payable();
    for (const patch of [{ amountCents: 1 }, { bookingId: booking.id + 100 }, { paymentId: "unrelated" }, { currency: "EUR" }]) {
      expect(await b.run({ action: "paid", evidence: { ...evidence(booking), ...patch } })).toEqual({ found: false });
    }
    expect(await a.run({ action: "get", id: booking.id })).toEqual(booking);
    const cancelled = await a.run<Booking>({ action: "cancel", id: booking.id, version: booking.version });
    const late = await b.run<MarkPaidResult>({ action: "paid", evidence: evidence(booking) });
    expect(late).toMatchObject({ found: true, alreadyConfirmed: false, booking: { status: "cancelled", payment_review_required: true,
      payment_reference: booking.payment_reference, cancelled_at: cancelled.cancelled_at, cancellation_reason: cancelled.cancellation_reason } });
    expect(await a.run({ action: "paid", evidence: evidence(booking) })).toEqual(late);
  });

  it("serializes cancellation against payment in both arrival orders without reviving a cancelled booking", async () => {
    const holder = await startWorker();
    for (const cancelFirst of [true, false]) {
      const booking = await payable();
      await holder.run({ action: "hold", listingId: 1 });
      let cancelling: Promise<Booking | null>;
      let paying: Promise<MarkPaidResult>;
      try {
        if (cancelFirst) {
          cancelling = a.run({ action: "cancel", id: booking.id, version: booking.version });
          await waitForBlocked([a.backend]);
          paying = b.run({ action: "paid", evidence: evidence(booking) });
        } else {
          paying = b.run({ action: "paid", evidence: evidence(booking) });
          await waitForBlocked([b.backend]);
          cancelling = a.run({ action: "cancel", id: booking.id, version: booking.version });
        }
        await waitForBlocked([a.backend, b.backend]);
      } finally { await holder.run({ resume: true }); }
      const [cancelled, payment] = await Promise.all([cancelling, paying]);
      expect(payment).toMatchObject({ found: true, alreadyConfirmed: false, doubleBooked: false });
      if (cancelFirst) {
        expect(cancelled).toMatchObject({ status: "cancelled", cancellation_reason: "Guest requested cancellation", cancelled_by: "1" });
        expect(cancelled?.cancelled_at).not.toBeNull();
        expect(payment).toMatchObject({ booking: { status: "cancelled", payment_review_required: true,
          cancelled_at: cancelled!.cancelled_at, cancellation_reason: cancelled!.cancellation_reason, cancelled_by: cancelled!.cancelled_by } });
      } else {
        expect(cancelled).toBeNull();
        expect(payment).toMatchObject({ booking: { status: "confirmed", payment_review_required: false, cancelled_at: null, cancellation_reason: null, cancelled_by: null } });
      }
      if (!payment.found) throw new Error("Missing payment result");
      expect(payment.booking.payment_reference).toBe(booking.payment_reference);
      expect(await a.run({ action: "get", id: booking.id })).toEqual(payment.booking);
      expect(await b.run({ action: "paid", evidence: evidence(booking) })).toMatchObject({ found: true,
        alreadyConfirmed: !cancelFirst, booking: payment.booking });
    }
  }, 30_000);

  it("requires the exact stored capability on every public checkout entrypoint and returns status only with private headers", async () => {
    const booking = await payable();
    const exact = booking.checkout_session_id!;
    for (const route of ["status", "btc", "quote"]) {
      for (const [sessionId, expectedStatus] of [[String(booking.id), 400], ["cko_1_abc", 400], [`cko_${booking.id}_${randomUUID()}`, 404], [exact.replace(`cko_${booking.id}_`, `cko_${booking.id + 1}_`), 404]] as const) {
        const response = await a.run<Api>({ action: "request", route, method: route === "quote" ? "POST" : "GET", sessionId, body: { session_id: sessionId } });
        expect(response.status, `${route}: ${sessionId}`).toBe(expectedStatus);
        privateResponse(response);
        expect(JSON.stringify(response.body)).not.toContain(booking.guest_email);
      }
    }
    const status = await request(b, "status", exact);
    expect(status.body).toEqual({ ok: true, data: { status: "pending_payment" } });
    privateResponse(status);
    const missing = await b.run<{ checkout: CheckoutData | null; receipt: BookingConfirmationData }>({ action: "dto", sessionId: `cko_${booking.id}_${randomUUID()}` });
    expect(missing.checkout).toBeNull();
    expect(missing.receipt.booking).toBeNull();
  });

  it("keeps every booking reader and checkout mutation within the owning guest account", async () => {
    const booking = await create();
    await b.run({ action: "guest", email: "second-owner@example.test" });
    const session = booking.checkout_session_id!;
    const stolen = await b.run<Api>({ action: "request", route: "status", method: "GET", sessionId: session });
    expect(stolen.status).toBe(404);
    expect(await b.run({ action: "dto", sessionId: session })).toEqual({ checkout: null, receipt: { booking: null, listing: null } });
    expect(await b.run({ action: "history" })).toEqual([]);
    const ownedHistory = await a.run<Array<{ id: number }>>({ action: "history" });
    expect(ownedHistory.map(row => row.id)).toEqual([booking.id]);
    for (const route of ["quote", "btc"] as const) {
      const result = await b.run<Api>({ action: "request", route, method: "POST", body: { session_id: session, guests: 3 } });
      expect(result.status).toBe(404);
      expect(await a.run({ action: "get", id: booking.id })).toEqual(booking);
    }
    expect((await b.run<Api>({ action: "request", route: "btc", method: "GET", sessionId: session })).status).toBe(404);
    const forged = await b.run<Booking>({ action: "create", input: {
      listing_id: 1, check_in: "2099-06-20", check_out: "2099-06-22", guest_name: "Attacker", guest_email: "victim@example.test",
      guest_account_id: 1, user_id: 1,
    } });
    expect(forged.guest_account_id).toBeGreaterThan(1);
    // Contact details sent with the request are ignored: the booking carries the account's own.
    expect(forged.guest_email).not.toBe("victim@example.test");
    expect(forged.guest_name).not.toBe("Attacker");
    expect(sql(`SELECT "email" = '${forged.guest_email}' AND "name" = '${forged.guest_name}' FROM "GuestAccount" WHERE "id" = ${forged.guest_account_id};`)).toBe("t");
    const noSession = await a.run<Api>({ action: "request", route: "bookings", method: "POST", cookie: "", body: {
      listing_id: 1, check_in: "2099-06-24", check_out: "2099-06-26", guest_name: "No Session", guest_email: "none@example.test",
    } });
    expect(noSession.status).toBe(401);
    expect(sql(`SELECT count(*) FROM "Booking" WHERE "guestEmail" = 'none@example.test';`)).toBe("0");
  });

  it("normalizes guest identity, stores only a password hash, and rejects duplicate accounts without creating staff access", async () => {
    // Same ids/version and signing secret: audience checks alone must separate these accounts.
    sql(`INSERT INTO "AdminUser" (email, name, "passwordHash", role, "updatedAt") VALUES ('staff@example.test', 'Staff', 'unused-login-hash', 'ADMIN', now());`);
    expect(await a.run({ action: "crossAudience" })).toEqual({ guestFromStaff: null, staffFromGuest: null });
    for (const password of ["short", "😀".repeat(20)]) {
      expect((await a.run<{ status: number }>({ action: "guest", email: "invalid@example.test", password })).status).toBe(400);
    }
    const [first, duplicate] = await Promise.all([
      a.run<{ status: number }>({ action: "guest", name: "  Guest One ", email: "  Mixed@Example.test " }),
      b.run<{ status: number }>({ action: "guest", name: "Other", email: "mixed@example.test" }),
    ]);
    expect([first.status, duplicate.status].sort()).toEqual([200, 409]);
    expect(sql(`SELECT email || ':' || (left("passwordHash", 7) = '$2b$12$') FROM "GuestAccount" WHERE email = 'mixed@example.test';`)).toBe("mixed@example.test:true");
    expect(sql(`SELECT count(*) FROM "GuestAccount" WHERE "passwordHash" = 'synthetic-password-123';`)).toBe("0");
    expect(sql(`SELECT count(*) FROM "AdminUser" WHERE email = 'mixed@example.test';`)).toBe("0");
  });

  it("copies the account's name, email and optional phone onto new bookings", async () => {
    expect((await a.run<{ status: number }>({ action: "guest", email: "bad-phone@example.test", phone: "call me" })).status).toBe(400);
    expect(sql(`SELECT count(*) FROM "GuestAccount" WHERE email = 'bad-phone@example.test';`)).toBe("0");
    expect((await a.run<{ status: number }>({ action: "guest", name: "Phone Guest", email: "phone@example.test", phone: " +503 6062 7813 " })).status).toBe(200);
    expect(await create(a, undefined, ["2099-07-10", "2099-07-12"]))
      .toMatchObject({ guest_name: "Phone Guest", guest_email: "phone@example.test", guest_phone: "+503 6062 7813" });
    expect((await b.run<{ status: number }>({ action: "guest", name: "No Phone", email: "no-phone@example.test", phone: "" })).status).toBe(200);
    expect(sql(`SELECT "phone" IS NULL FROM "GuestAccount" WHERE email = 'no-phone@example.test';`)).toBe("t");
    expect(await create(b, undefined, ["2099-07-14", "2099-07-16"]))
      .toMatchObject({ guest_name: "No Phone", guest_email: "no-phone@example.test", guest_phone: null });
  });

  type ListingApi = { status: number; headers: Record<string, string>; body: Record<string, unknown> };
  const listingApi = (token: string, route: "list" | "detail" | "content" | "commercial" | "status", method: "GET" | "POST" | "PATCH" | "DELETE",
    id?: number, body?: Record<string, unknown>, origin?: string) =>
    a.run<ListingApi>({ action: "listingRequest", route, method, id, token, body, origin });
  async function addStaff() {
    sql(`INSERT INTO "AdminUser" (email, name, "passwordHash", role, "authVersion", "updatedAt") VALUES
      ('editor@example.test', 'Editor', 'unused-test-hash', 'EDITOR', 1, now()),
      ('manager@example.test', 'Manager', 'unused-test-hash', 'BOOKING_MANAGER', 1, now());`);
    // One request at a time: a worker answers in order, without correlating replies.
    const tokens: string[] = [];
    for (const id of [1, 2, 3]) tokens.push(await a.run<string>({ action: "adminToken", id, authVersion: 1 }));
    return tokens;
  }

  it("plan 4: ADMIN and EDITOR edit descriptive content; mixed, nested, stale or out-of-role patches write nothing", async () => {
    const [, editor, manager] = await addStaff();
    const key = randomUUID();
    sql(`INSERT INTO "MediaAsset" ("objectKey", "originalName", "mimeType", "sizeBytes", width, height, "defaultAlt") VALUES
      ('blog/${key}-1', 'one.jpg', 'image/jpeg', 10, 100, 80, 'Shared blog alt'), ('blog/${key}-2', 'two.jpg', 'image/jpeg', 10, 100, 80, null);
      INSERT INTO "ListingTerm" (taxonomy, slug, name) VALUES ('hp_listing_category', 'villas-${key}', 'Villas'), ('hp_listing_pets', 'pets-${key}', 'Allowed');
      INSERT INTO "ListingTermAssignment" ("listingId", "termId") SELECT 1, id FROM "ListingTerm" WHERE slug = 'pets-${key}';`);
    const [first, second] = sql(`SELECT id FROM "MediaAsset" WHERE "objectKey" LIKE 'blog/${key}-%' ORDER BY "objectKey";`).split("\n").map(Number);
    const villas = Number(sql(`SELECT id FROM "ListingTerm" WHERE slug = 'villas-${key}';`));
    const snapshot = () => sql(`SELECT title || '|' || version || '|' || attributes::text || '|' || coalesce("coverMediaId"::text, '-') || '|' || "pricePerNightCents" || '|' || active FROM "Listing" WHERE id = 1;`);
    const before = snapshot();

    const detail = await listingApi(editor, "detail", "GET", 1);
    expect(detail.status).toBe(200);
    expect(detail.headers["cache-control"]).toContain("no-store");
    expect(detail.body.listing).toMatchObject({ id: 1, version: 1, bookings: null, commercial: { pricePerNightCents: 10000 } });
    expect((await listingApi(manager, "detail", "GET", 1)).status).toBe(403);
    expect((await listingApi(manager, "list", "GET")).status).toBe(403);
    expect((await listingApi(manager, "content", "PATCH", 1, { version: 1, title: "Manager edit" })).status).toBe(403);
    expect((await listingApi(manager, "commercial", "PATCH", 1, { version: 1, pricePerNightCents: 1 })).status).toBe(403);
    expect((await listingApi(manager, "status", "PATCH", 1, { version: 1, action: "deactivate" })).status).toBe(403);
    expect((await listingApi(manager, "detail", "DELETE", 1, { version: 1, confirmed: true })).status).toBe(403);

    for (const body of [{ version: 1, title: "Mixed", price: 1 }, { version: 1, title: "Mixed", active: false }, { version: 1, title: "Mixed", guests: 9 },
      { version: 1, title: "Mixed", petsAllowed: false }]) {
      expect((await listingApi(editor, "content", "PATCH", 1, body)).status).toBe(403);
    }
    for (const body of [{ version: 1, attributes: { price: "1" } }, { version: 1, "attributes.price": "1" },
      { version: 1, gallery: [{ mediaId: first, alt: "x", nested: { price: 1 } }] }]) {
      expect((await listingApi(editor, "content", "PATCH", 1, body)).status).toBe(400);
    }
    expect((await listingApi(editor, "content", "PATCH", 1, { version: 1, title: "Hostile" }, "https://attacker.example")).status).toBe(403);
    expect((await listingApi(editor, "content", "PATCH", 1, { version: 1, gallery: [{ mediaId: 999_999, alt: "Missing" }] })).status).toBe(400);
    expect(snapshot()).toBe(before);

    const saved = await listingApi(editor, "content", "PATCH", 1, {
      version: 1, title: "Edited by editor", bedrooms: 3, amenities: ["wifi"], categoryIds: [villas], coverMediaId: first,
      gallery: [{ mediaId: first, alt: "Pool at dusk", roomGroup: "Outside" }, { mediaId: second, decorative: true }],
    });
    expect(saved).toMatchObject({ status: 200, body: { version: 2 } });
    expect(sql(`SELECT title || '|' || version || '|' || (attributes->>'bedrooms') || '|' || (attributes->>'wifi') || '|' || "coverMediaId" || '|' || "pricePerNightCents" FROM "Listing" WHERE id = 1;`))
      .toBe(`Edited by editor|2|3|1|${first}|10000`);
    expect(sql(`SELECT string_agg("mediaId" || ':' || position || ':' || alt || ':' || coalesce("roomGroup", '-'), ',' ORDER BY position) FROM "ListingMedia" WHERE "listingId" = 1;`))
      .toBe(`${first}:0:Pool at dusk:Outside,${second}:1::-`);
    // Shared image metadata (used by the blog too) is never edited from a listing.
    expect(sql(`SELECT "defaultAlt" FROM "MediaAsset" WHERE id = ${first};`)).toBe("Shared blog alt");
    // Only categories change; the pets taxonomy assignment stays.
    expect(sql(`SELECT string_agg(t.taxonomy, ',' ORDER BY t.taxonomy) FROM "ListingTermAssignment" a JOIN "ListingTerm" t ON t.id = a."termId" WHERE a."listingId" = 1;`))
      .toBe("hp_listing_category,hp_listing_pets");

    expect((await listingApi(editor, "content", "PATCH", 1, { version: 1, title: "Stale" })).status).toBe(409);
    expect((await listingApi(editor, "commercial", "PATCH", 1, { version: 2, pricePerNightCents: 1 })).status).toBe(403);
    expect((await listingApi(editor, "status", "PATCH", 1, { version: 2, action: "deactivate" })).status).toBe(403);
    expect((await listingApi(editor, "detail", "DELETE", 1, { version: 2, confirmed: true })).status).toBe(403);
    expect((await listingApi(editor, "list", "POST", undefined, { title: "Nope", slug: "nope" })).status).toBe(403);

    expect((await listingApi(editor, "content", "PATCH", 1, { version: 2, gallery: [], coverMediaId: null })).status).toBe(200);
    expect(sql(`SELECT count(*) FROM "ListingMedia" WHERE "listingId" = 1;`)).toBe("0");
    expect(sql(`SELECT count(*) FROM "MediaAsset" WHERE id IN (${first}, ${second});`)).toBe("2");

    sql(`UPDATE "AdminUser" SET "authVersion" = 2 WHERE id = 2;`);
    expect((await listingApi(editor, "content", "PATCH", 1, { version: 3, title: "After revocation" })).status).toBe(401);
    expect(sql(`SELECT title || '|' || version FROM "Listing" WHERE id = 1;`)).toBe("Edited by editor|3");
  });

  it("plan 4: ADMIN prices new bookings only, archives instead of deleting history, and withdrawn listings take no new payments", async () => {
    const [admin] = await addStaff();
    const earlier = await create(a, undefined, ["2099-08-01", "2099-08-03"]);
    const open = await payable(a, undefined, ["2099-08-05", "2099-08-07"]);
    let version = 1;

    expect((await listingApi(admin, "commercial", "PATCH", 1, { version, baseGuests: 9 })).status).toBe(400);
    expect((await listingApi(admin, "commercial", "PATCH", 1, { version, pricePerNightCents: null })).status).toBe(400);
    expect((await listingApi(admin, "commercial", "PATCH", 1, { version, title: "Mixed", pricePerNightCents: 1 })).status).toBe(400);
    expect(sql(`SELECT version || '|' || "pricePerNightCents" FROM "Listing" WHERE id = 1;`)).toBe("1|10000");
    const priced = await listingApi(admin, "commercial", "PATCH", 1, { version, pricePerNightCents: 25_000, minStayNights: 2, checkInSeconds: 50_400 });
    expect(priced).toMatchObject({ status: 200, body: { version: 2 } });
    version = 2;

    expect(await a.run<Booking>({ action: "get", id: earlier.id })).toMatchObject({ price_per_night_cents: 10_000, pricing_snapshot: { pricePerNightCents: 10_000 } });
    expect(await create(a, undefined, ["2099-08-10", "2099-08-12"])).toMatchObject({ price_per_night_cents: 25_000, pricing_snapshot: { pricePerNightCents: 25_000 } });

    expect((await listingApi(admin, "detail", "DELETE", 1, { version, confirmed: true })).status).toBe(409);
    expect((await listingApi(admin, "status", "PATCH", 1, { version, action: "archive" })).status).toBe(400);
    expect(await listingApi(admin, "status", "PATCH", 1, { version, action: "archive", confirmed: true }))
      .toMatchObject({ status: 200, body: { version: 3, status: "archived" } });
    version = 3;
    expect(sql(`SELECT active || '|' || ("archivedAt" IS NOT NULL) FROM "Listing" WHERE id = 1;`)).toBe("false|true");
    expect(sql(`SELECT count(*) FROM "Booking" WHERE "listingId" = 1;`)).toBe("3");

    const withdrawn = await a.run<Api>({ action: "request", route: "bookings", method: "POST", body: { listing_id: 1, check_in: "2099-09-01", check_out: "2099-09-03" } });
    expect(withdrawn.status).toBe(404);
    const quoted = await a.run<Booking>({ action: "quote", id: earlier.id, version: earlier.version, quote });
    expect(quoted).not.toBeNull();
    const fresh = await a.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: earlier.checkout_session_id } });
    expect(fresh).toMatchObject({ status: 409, body: { code: "listing_unavailable" } });
    // A payment opened before the listing was withdrawn is still served and processed.
    const existing = await a.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: open.checkout_session_id } });
    expect(existing.status).toBe(200);
    expect(existing.body.data).toMatchObject({ payment: { bookingId: open.id, status: "pending" } });

    expect((await listingApi(admin, "status", "PATCH", 1, { version, action: "activate" })).status).toBe(409);
    expect(await listingApi(admin, "status", "PATCH", 1, { version, action: "restore" })).toMatchObject({ status: 200, body: { status: "inactive" } });

    const createdListing = await listingApi(admin, "list", "POST", undefined, { title: "Casa Nueva", slug: "casa-nueva" });
    expect(createdListing).toMatchObject({ status: 201, body: { version: 1 } });
    const newId = createdListing.body.id as number;
    expect((await listingApi(admin, "list", "POST", undefined, { title: "Otra", slug: "casa-nueva" })).status).toBe(409);
    expect(sql(`SELECT active || '|' || ("archivedAt" IS NULL) FROM "Listing" WHERE id = ${newId};`)).toBe("false|true");
    const notReady = await listingApi(admin, "status", "PATCH", newId, { version: 1, action: "activate" });
    expect(notReady.status).toBe(400);
    expect(notReady.body.error).toMatch(/description.*cover image.*nightly price.*maximum number of guests/);
    // A deletable listing with several associations: they all go, the shared images stay.
    const key = randomUUID();
    sql(`INSERT INTO "MediaAsset" ("objectKey", "originalName", "mimeType", "sizeBytes", width, height) VALUES
      ('blog/${key}-1', 'one.jpg', 'image/jpeg', 10, 100, 80), ('blog/${key}-2', 'two.jpg', 'image/jpeg', 10, 100, 80);
      INSERT INTO "ListingTerm" (taxonomy, slug, name) VALUES ('hp_listing_category', 'new-${key}', 'New');`);
    const images = sql(`SELECT id FROM "MediaAsset" WHERE "objectKey" LIKE 'blog/${key}-%' ORDER BY "objectKey";`).split("\n").map(Number);
    const category = Number(sql(`SELECT id FROM "ListingTerm" WHERE slug = 'new-${key}';`));
    expect(await listingApi(admin, "content", "PATCH", newId, { version: 1, categoryIds: [category], coverMediaId: images[0],
      gallery: images.map((mediaId) => ({ mediaId, alt: `Room ${mediaId}` })) })).toMatchObject({ status: 200, body: { version: 2 } });
    expect((await listingApi(admin, "detail", "DELETE", newId, { version: 2 })).status).toBe(400);
    expect(await listingApi(admin, "detail", "DELETE", newId, { version: 2, confirmed: true })).toMatchObject({ status: 200, body: { deleted: true } });
    expect(sql(`SELECT (SELECT count(*) FROM "Listing" WHERE id = ${newId}) || '|' || (SELECT count(*) FROM "ListingMedia" WHERE "listingId" = ${newId})
      || '|' || (SELECT count(*) FROM "ListingTermAssignment" WHERE "listingId" = ${newId}) || '|' || (SELECT count(*) FROM "MediaAsset" WHERE id IN (${images.join(",")}));`))
      .toBe("0|0|0|2");
  }, 30_000);

  it("revokes retained guest cookies on logout and account deactivation; throttles guest authentication persistently", async () => {
    const booking = await create();
    const retained = a.run<{ status: number; cookie: string }>({ action: "guestLogout" });
    expect((await retained).status).toBe(200);
    expect(await a.run({ action: "history" })).toBeNull();
    expect(await b.run({ action: "history" })).toBeNull();
    expect(await b.run({ action: "history", cookie: "guest_session=malformed" })).toBeNull();
    const loggedIn = await a.run<{ status: number }>({ action: "guestLogin", email: "shared-worker@example.test", password: "synthetic-password-123" });
    expect(loggedIn.status).toBe(200);
    sql(`UPDATE "GuestAccount" SET active = false WHERE id = ${booking.guest_account_id};`);
    expect(await a.run({ action: "history" })).toBeNull();
    const attempts: Array<{ status: number }> = [];
    for (let index = 0; index < 6; index++) attempts.push(await b.run<{ status: number }>({ action: "guestLogin", email: "throttle@example.test", password: "wrong-password" }));
    expect(attempts.slice(0, 5).every(value => value.status === 401)).toBe(true);
    expect(attempts[5].status).toBe(429);
    const fresh = await startWorker();
    expect((await fresh.run<{ status: number }>({ action: "guestLogin", email: "throttle@example.test", password: "wrong-password" })).status).toBe(429);
  }, 30_000);

  it("rejects missing or hostile origins and insecure guest auth in production", async () => {
    expect((await a.run<{ status: number }>({ action: "guest", origin: "https://attacker.example" })).status).toBe(403);
    expect((await a.run<{ status: number }>({ action: "guest", origin: "" })).status).toBe(403);
    expect((await a.run<{ status: number }>({ action: "guest", production: true })).status).toBe(503);
    const insecure = await startWorker({ BLOG_APP_ORIGIN: "http://demo.example.test" });
    expect((await insecure.run<{ status: number }>({ action: "guest" })).status).toBe(503);
    const booking = await create();
    for (const route of ["quote", "btc"] as const) {
      expect((await a.run<Api>({ action: "request", route, method: "POST", sessionId: booking.checkout_session_id!, origin: "https://attacker.example",
        body: { session_id: booking.checkout_session_id, guests: 3 } })).status).toBe(403);
    }
    expect(await a.run({ action: "get", id: booking.id })).toEqual(booking);
  });

  it("supports production HTTPS guest accounts and keeps their bookings private", async () => {
    const publicOrigin = "https://demo.example.test";
    const guest = await startWorker({ ...btcpayWorkerConfig(), NODE_ENV: "production", BLOG_APP_ORIGIN: publicOrigin });
    const registration = await guest.run<{ status: number; cookie: string }>({ action: "guest", email: "public-guest@example.test" });
    expect(registration.status).toBe(200);
    expect(registration.cookie).toContain("Secure");
    expect(registration.cookie).toContain("HttpOnly");
    expect(registration.cookie).toContain("SameSite=Strict");
    const booking = await create(guest);
    expect((await guest.run<{ checkout: CheckoutData }>({ action: "dto", sessionId: booking.checkout_session_id })).checkout.booking.id).toBe(booking.id);
    expect((await b.run<{ checkout: CheckoutData | null }>({ action: "dto", sessionId: booking.checkout_session_id })).checkout).toBeNull();
    expect((await guest.run<{ status: number }>({ action: "guestLogout" })).status).toBe(200);
    expect((await guest.run<{ status: number }>({ action: "guestLogin", email: "public-guest@example.test", password: "synthetic-password-123" })).status).toBe(200);
    expect((await guest.run<{ status: number }>({ action: "guest", origin: "https://attacker.example" })).status).toBe(403);
  }, 30_000);

  it("GET never reconciles paid evidence; POST validates provider identity, booking, amount and currency before confirming", async () => {
    const booking = await payable(a, "SYNTHETIC-A");
    const reused = await a.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } });
    expect(reused.status).toBe(200);
    expect(reused.body.data).toMatchObject({ payment: { id: booking.payment_reference, amountCents: booking.total_amount_cents } });
    expect(await b.run({ action: "get", id: booking.id })).toEqual(booking);
    const payment = { id: booking.payment_reference, bookingId: booking.id, amountCents: booking.total_amount_cents, currency: "USD", status: "paid" };
    markStubInvoiceSettled(invoices.get("invoice-1")!);
    const before = sql(`SELECT row_to_json(t) FROM "ReferralAttribution" t;`);
    const attempt = sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t;`);
    const paths = [...btcpayPaths];
    const read = await request(a, "btc", booking.checkout_session_id!);
    expect(read.body.data).toMatchObject({ status: "pending_payment", payment: { id: booking.payment_reference, status: "pending", testAmountCents: 100, network: "testnet" } });
    privateResponse(read);
    expect(await b.run({ action: "get", id: booking.id })).toEqual(booking);
    expect(sql(`SELECT row_to_json(t) FROM "ReferralAttribution" t;`)).toBe(before);
    expect(sql(`SELECT row_to_json(t) FROM "PaymentAttempt" t;`)).toBe(attempt);
    expect(btcpayPaths).toEqual(paths);
    for (const patch of [null, { id: "wrong" }, { bookingId: booking.id + 1 }, { amountCents: 1 }, { currency: "EUR" }]) {
      await a.run({ action: "evidence", payment: patch === null ? null : { ...payment, ...patch } });
      const rejected = await request(a, "btc", booking.checkout_session_id!, "reconcile");
      expect(rejected.status).toBe(409);
      privateResponse(rejected);
      expect(await b.run({ action: "get", id: booking.id })).toEqual(booking);
    }
    await a.run({ action: "evidence", payment });
    expect((await request(a, "btc", booking.checkout_session_id!, "reconcile")).body).toEqual({ ok: true, data: { status: "confirmed", paymentStatus: "paid" } });
    expect(sql(`SELECT status FROM "ReferralAttribution" WHERE "bookingId" = ${booking.id};`)).toBe("confirmed");
    const confirmed = await b.run({ action: "get", id: booking.id });
    expect((await request(a, "btc", booking.checkout_session_id!, "reconcile")).status).toBe(200);
    expect(await b.run({ action: "get", id: booking.id })).toEqual(confirmed);
  });

  it("does not expose simulate_paid in production", async () => {
    const booking = await payable();
    // Historical unowned rows remain capability-accessible, even without a guest session.
    sql(`UPDATE "Booking" SET "guestAccountId" = NULL WHERE id = ${booking.id};`);
    const legacy = await b.run<Booking>({ action: "get", id: booking.id });
    const rejected = await a.run<Api>({ action: "request", route: "btc", method: "POST", production: true,
      body: { session_id: booking.checkout_session_id, action: "simulate_paid" } });
    expect(rejected.status).toBe(404);
    privateResponse(rejected);
    expect(await b.run({ action: "get", id: booking.id })).toEqual(legacy);
  });

  it("attributes once across processes, ignores invalid/inactive codes and syncs only authoritative persisted states", async () => {
    const booking = await create();
    const results = await Promise.all([a.run<{ ok: boolean; alreadyRecorded: boolean }>({ action: "referral", id: booking.id, code: "SYNTHETIC-A" }),
      b.run<{ ok: boolean; alreadyRecorded: boolean }>({ action: "referral", id: booking.id, code: "SYNTHETIC-A" })]);
    expect(results.every(result => result.ok)).toBe(true);
    expect(results.map(result => result.alreadyRecorded).sort()).toEqual([false, true]);
    expect(await a.run({ action: "referral", id: booking.id, code: "SYNTHETIC-B" })).toMatchObject({ ok: false, reason: "already_attributed" });
    expect(await a.run({ action: "sync", id: booking.id, reported: "confirmed" })).toBe(false);
    expect(sql(`SELECT status FROM "ReferralAttribution" WHERE "bookingId" = ${booking.id};`)).toBe("pending");
    for (const code of ["unknown", "SYNTHETIC-OFF"]) {
      const plain = await create(a, code);
      expect(plain.status).toBe("pending_payment");
      expect(sql(`SELECT count(*) FROM "ReferralAttribution" WHERE "bookingId" = ${plain.id};`)).toBe("0");
    }
    const cancelled = await a.run<Booking>({ action: "cancel", id: booking.id, version: booking.version });
    for (const worker of [a, b]) expect(await worker.run({ action: "sync", id: booking.id, reported: "confirmed" })).toBe(true);
    expect(cancelled.status).toBe("cancelled");
    expect(sql(`SELECT status || ':' || count(*) FROM "ReferralAttribution" WHERE "bookingId" = ${booking.id} GROUP BY status;`)).toBe("cancelled:1");
  });

  it("commits payment despite a real referral write failure and repairs attribution on a later POST reconciliation", async () => {
    const booking = await payable(a, "SYNTHETIC-A");
    markStubInvoiceSettled(invoices.get("invoice-1")!);
    sql(`CREATE FUNCTION reject_test_referral() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic referral outage'; END $$;
      CREATE TRIGGER reject_test_referral BEFORE UPDATE ON "ReferralAttribution" FOR EACH ROW EXECUTE FUNCTION reject_test_referral();`);
    try {
      expect((await request(a, "btc", booking.checkout_session_id!, "reconcile")).body).toEqual({ ok: true, data: { status: "confirmed", paymentStatus: "paid" } });
      expect(await b.run({ action: "get", id: booking.id })).toMatchObject({ status: "confirmed" });
      expect(sql(`SELECT status FROM "ReferralAttribution" WHERE "bookingId" = ${booking.id};`)).toBe("pending");
    } finally { sql(`DROP TRIGGER reject_test_referral ON "ReferralAttribution"; DROP FUNCTION reject_test_referral();`); }
    // Independent processes recover referral writes from the persisted settled attempt.
    const confirmed = await b.run<Booking>({ action: "get", id: booking.id });
    expect((await request(b, "btc", booking.checkout_session_id!, "reconcile")).body).toEqual({ ok: true, data: { status: "confirmed", paymentStatus: "paid" } });
    expect(sql(`SELECT status || ':' || count(*) FROM "ReferralAttribution" WHERE "bookingId" = ${booking.id} GROUP BY status;`)).toBe("confirmed:1");
    expect((await request(b, "btc", booking.checkout_session_id!, "reconcile")).status).toBe(200);
    expect(await b.run({ action: "get", id: booking.id })).toEqual(confirmed);
    expect(sql(`SELECT status FROM "PaymentAttempt" WHERE "bookingId" = ${booking.id};`)).toBe("paid");
    expect(invoicePosts).toBe(1);
    expect(sql(`SELECT count(*) FROM "ReferralAttribution" WHERE "bookingId" = ${booking.id};`)).toBe("1");
  });

  it("imports historical amounts/capabilities exactly, repeats and verifies safely, and refuses missing/conflicting sources or destinations", async () => {
    const source = path.join(temporary, "synthetic-bookings.json");
    const conflicting = path.join(temporary, "synthetic-conflict.json");
    const session = `cko_70_${randomUUID()}`;
    const historical = { id: 70, listing_id: 1, check_in: "2099-08-10", check_out: "2099-08-12", nights: 2,
      guest_name: "Historical Guest", guest_email: "shared-worker@example.test", guest_phone: null, guest_notes: "Historical note",
      guests: 2, currency: "USD", price_per_night_cents: 2_000_000_000, cleaning_fee_cents: 12345, pet_fee_cents: 0,
      extra_guest_fee_cents: 0, discount_cents: 0, tax_cents: 0, total_amount_cents: 4_000_012_345, coupon_code: null,
      status: "pending_payment", checkout_session_id: session, payment_reference: "historical-payment", admin_notes: "Historical internal note",
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z" };
    writeFileSync(source, JSON.stringify({ nextId: 80, bookings: [historical] }), { mode: 0o600 });
    writeFileSync(conflicting, JSON.stringify({ nextId: 80, bookings: [{ ...historical, total_amount_cents: historical.total_amount_cents + 1 }] }), { mode: 0o600 });
    sql(`INSERT INTO "ReferralAttribution" ("bookingId", "referralCode", status) VALUES (70, 'SYNTHETIC-A', 'pending'), (999, 'SYNTHETIC-A', 'confirmed');`);
    const referralsBefore = sql(`SELECT jsonb_agg(to_jsonb(t) ORDER BY "bookingId") FROM "ReferralAttribution" t;`);
    const target = new URL(env.DATABASE_URL!).host + "/booking_test";
    function importer(paths: string[], mode: "apply" | "verify", identity = target) {
      return spawnSync(process.execPath, ["--conditions=react-server", "--experimental-strip-types", path.join(root, "scripts/bookings-import.mts"),
        ...paths.flatMap(source => ["--source", source]), `--${mode}`, "--target", identity], {
        cwd: temporary, env, encoding: "utf8", timeout: 30_000,
      });
    }
    expect(importer([source], "verify").stderr).toContain("destination reconciliation failed");
    expect(importer([source], "apply", "127.0.0.1:1/wrong_database").stderr).toContain("--target must match");
    for (const mode of ["apply", "apply", "verify"] as const) {
      const result = importer([source], mode);
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject(mode === "verify"
        ? { verified: 1, destinationExtras: 0, requiredNextId: 80, nextAvailableId: 80, orphanReferralCount: 1 }
        : { imported: 1, orphanReferralCount: 1 });
    }
    const imported = await b.run<Booking>({ action: "get", id: 70 });
    const { created_at, updated_at, ...historicalFields } = historical;
    expect(imported).toMatchObject({ ...historicalFields, pricing_snapshot: null, pricing_review_required: true, agreed_listing_title: "Historical listing #1" });
    expect(Date.parse(imported.created_at)).toBe(Date.parse(created_at));
    expect(Date.parse(imported.updated_at)).toBe(Date.parse(updated_at));
    expect((await request(b, "status", session)).body).toEqual({ ok: true, data: { status: "pending_payment" } });
    expect(await b.run({ action: "history" })).toEqual([]);
    expect((await b.run<{ checkout: CheckoutData | null; receipt: BookingConfirmationData }>({ action: "dto", sessionId: session })).checkout).not.toBeNull();
    const quoteRejected = await b.run<Api>({ action: "request", route: "quote", method: "POST", body: { session_id: session, guests: 2 } });
    expect(quoteRejected.status).toBe(409);
    expect(await b.run({ action: "get", id: 70 })).toEqual(imported);
    for (const [paths, error] of [
      [[source, path.join(temporary, "missing.json")], "booking source is unreadable"],
      [[source, conflicting], "source files conflict"],
      [[conflicting], "destination booking differs from source"],
    ] as const) {
      const failed = importer([...paths], "apply");
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain(error);
      expect(failed.stderr).not.toContain(historical.guest_email);
      expect(await b.run({ action: "get", id: 70 })).toEqual(imported);
    }
    expect(sql(`SELECT jsonb_agg(to_jsonb(t) ORDER BY "bookingId") FROM "ReferralAttribution" t;`)).toBe(referralsBefore);
    expect((await create()).id).toBe(80);
  }, 60_000);
});
