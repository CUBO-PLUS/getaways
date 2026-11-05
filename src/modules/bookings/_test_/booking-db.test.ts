import { execFileSync, fork, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Booking, MarkPaidResult, QuoteUpdate } from "../server/booking-store";
import type { CheckoutData } from "../../checkout/server/checkout";
import type { BookingConfirmationData } from "../server/bookings";

type Api = { status: number; headers: Record<string, string>; body: { ok: boolean; data: Record<string, unknown> } };
type Worker = Awaited<ReturnType<typeof startWorker>>;
const root = fileURLToPath(new URL("../../../", import.meta.url));
const children: ChildProcess[] = [];
let temporary: string;
let env: NodeJS.ProcessEnv;

async function startWorker() {
  const child = fork(path.join(root, "infrastructure/prisma/_test_/support/booking-worker.mts"), [], {
    cwd: temporary, env, execArgv: ["--experimental-strip-types", "--experimental-loader", path.join(root, "infrastructure/prisma/_test_/support/booking-loader.mjs")], stdio: ["ignore", "pipe", "pipe", "ipc"],
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
      listing_id: 1, check_in: dates[0], check_out: dates[1], guest_name: "Synthetic Guest", guest_email: "guest@example.test",
      guest_phone: "+15555550123", guest_notes: "Private guest note",
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
  }, 120_000);

  beforeEach(async () => {
    sql(`TRUNCATE "ReferralAttribution", "ReferralCode", "Booking", "GuestAccount", "AdminUser", "AdminLoginThrottle", "Listing", "ListingTermAssignment", "ListingMedia" RESTART IDENTITY;
      INSERT INTO "Listing" (slug, title, "contentHtml", attributes, active, "updatedAt", "pricePerNightCents", "cleaningFeeCents", "extraGuestFeeCents", "petFeeCents", "ivaBasisPoints", "tourismBasisPoints", "maxGuests", "baseGuests", "petsAllowed")
        VALUES ('synthetic-stay', 'Agreed historical title', '', '{}', true, now(), 10000, 2000, 1500, 3000, 1300, 500, 4, 2, true);
      INSERT INTO "ReferralCode" (code, active) VALUES ('SYNTHETIC-A', true), ('SYNTHETIC-B', true), ('SYNTHETIC-OFF', false);`);
    [a, b] = await Promise.all([startWorker(), startWorker()]);
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
    finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
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
    expect(Object.keys(dto.receipt.booking!).sort()).toEqual(["status", "guest_name", "check_in", "check_out", "nights", "total_amount_cents"].sort());
    expect(dto.checkout.listing.title).toBe("Agreed historical title");
    expect(dto.receipt.listing?.title).toBe("Agreed historical title");
    expect((await create()).pricing_snapshot).toMatchObject({ pricePerNightCents: 99000, maxGuests: 1, petsAllowed: false });
  });

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
        expect(cancelled).toMatchObject({ status: "cancelled", cancellation_reason: "Guest requested cancellation", cancelled_by: "synthetic-operator" });
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
    expect(forged.guest_email).toBe("victim@example.test");
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

  it("rejects missing or hostile origins and disables guest auth in production", async () => {
    expect((await a.run<{ status: number }>({ action: "guest", origin: "https://attacker.example" })).status).toBe(403);
    expect((await a.run<{ status: number }>({ action: "guest", origin: "" })).status).toBe(403);
    expect((await a.run<{ status: number }>({ action: "guest", production: true })).status).toBe(503);
    const booking = await create();
    for (const route of ["quote", "btc"] as const) {
      expect((await a.run<Api>({ action: "request", route, method: "POST", sessionId: booking.checkout_session_id!, origin: "https://attacker.example",
        body: { session_id: booking.checkout_session_id, guests: 3 } })).status).toBe(403);
    }
    expect(await a.run({ action: "get", id: booking.id })).toEqual(booking);
  });

  it("GET never reconciles paid evidence; POST validates provider identity, booking, amount and currency before confirming", async () => {
    const booking = await payable(a, "SYNTHETIC-A");
    const reused = await a.run<Api>({ action: "request", route: "btc", method: "POST", body: { session_id: booking.checkout_session_id } });
    expect(reused.status).toBe(200);
    expect(reused.body.data).toMatchObject({ payment: { id: booking.payment_reference, amountCents: booking.total_amount_cents } });
    expect(await b.run({ action: "get", id: booking.id })).toEqual(booking);
    const payment = { id: booking.payment_reference, bookingId: booking.id, amountCents: booking.total_amount_cents, currency: "USD", status: "paid" };
    await a.run({ action: "evidence", payment });
    const before = sql(`SELECT row_to_json(t) FROM "ReferralAttribution" t;`);
    const read = await request(a, "btc", booking.checkout_session_id!);
    expect(read.body.data).toMatchObject({ status: "pending_payment", payment: { status: "paid" } });
    privateResponse(read);
    expect(await b.run({ action: "get", id: booking.id })).toEqual(booking);
    expect(sql(`SELECT row_to_json(t) FROM "ReferralAttribution" t;`)).toBe(before);
    for (const patch of [null, { id: "wrong" }, { bookingId: booking.id + 1 }, { amountCents: 1 }, { currency: "EUR" }]) {
      await a.run({ action: "evidence", payment: patch === null ? null : { ...payment, ...patch } });
      const rejected = await request(a, "btc", booking.checkout_session_id!, "reconcile");
      expect(rejected.status).toBe(409);
      privateResponse(rejected);
      expect(await b.run({ action: "get", id: booking.id })).toEqual(booking);
    }
    await a.run({ action: "evidence", payment });
    expect((await request(a, "btc", booking.checkout_session_id!, "reconcile")).body).toEqual({ ok: true, data: { status: "confirmed" } });
    expect(sql(`SELECT status FROM "ReferralAttribution" WHERE "bookingId" = ${booking.id};`)).toBe("confirmed");
    const confirmed = await b.run({ action: "get", id: booking.id });
    expect((await request(a, "btc", booking.checkout_session_id!, "reconcile")).status).toBe(200);
    expect(await b.run({ action: "get", id: booking.id })).toEqual(confirmed);
  });

  it("does not expose simulate_paid or open the mock provider in production", async () => {
    const booking = await payable();
    const uncharged = await create();
    const priced = await a.run<Booking>({ action: "quote", id: uncharged.id, version: uncharged.version, quote });
    for (const [current, action] of [[booking, "simulate_paid"], [priced, undefined]] as const) {
      // Historical unowned rows intentionally remain capability-accessible; production guards must run beyond owner checks.
      sql(`UPDATE "Booking" SET "guestAccountId" = NULL WHERE id = ${current.id};`);
      const legacy = await b.run<Booking>({ action: "get", id: current.id });
      const rejected = await a.run<Api>({ action: "request", route: "btc", method: "POST", production: true,
        body: { session_id: current.checkout_session_id, action } });
      expect(rejected.status).toBe(404);
      privateResponse(rejected);
      expect(await b.run({ action: "get", id: current.id })).toEqual(legacy);
    }
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
    await a.run({ action: "evidence", payment: { id: booking.payment_reference, bookingId: booking.id,
      amountCents: booking.total_amount_cents, currency: "USD", status: "paid" } });
    sql(`CREATE FUNCTION reject_test_referral() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic referral outage'; END $$;
      CREATE TRIGGER reject_test_referral BEFORE UPDATE ON "ReferralAttribution" FOR EACH ROW EXECUTE FUNCTION reject_test_referral();`);
    try {
      expect((await request(a, "btc", booking.checkout_session_id!, "reconcile")).body).toEqual({ ok: true, data: { status: "confirmed" } });
      expect(await b.run({ action: "get", id: booking.id })).toMatchObject({ status: "confirmed" });
      expect(sql(`SELECT status FROM "ReferralAttribution" WHERE "bookingId" = ${booking.id};`)).toBe("pending");
    } finally { sql(`DROP TRIGGER reject_test_referral ON "ReferralAttribution"; DROP FUNCTION reject_test_referral();`); }
    // New process has no process-local provider evidence. Terminal bookings must still recover referrals.
    expect((await request(b, "btc", booking.checkout_session_id!, "reconcile")).status).toBe(409);
    expect(sql(`SELECT status || ':' || count(*) FROM "ReferralAttribution" WHERE "bookingId" = ${booking.id} GROUP BY status;`)).toBe("confirmed:1");
    expect((await request(b, "btc", booking.checkout_session_id!, "reconcile")).status).toBe(409);
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
