import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider, PaymentSession } from "@/modules/payments/types";
import { BTCPAY_TEST_AMOUNT_CENTS, BTCPAY_TEST_AMOUNT_USD } from "@/modules/payments/types";
import { getBookingById } from "@/modules/bookings/server/booking-store";
import { getAttemptByInvoice, getPaymentAttempt, recordSettledAttempt, reservePaymentAttempt, saveInvoice, saveInvoiceDetails, setAttemptStatus } from "@/modules/payments/server/payment-attempts";

type Invoice = {
  id?: unknown; storeId?: unknown; amount?: unknown; paidAmount?: unknown; currency?: unknown; status?: unknown;
  additionalStatus?: unknown; checkoutLink?: unknown; metadata?: unknown;
  paymentMethods?: unknown;
};

const baseUrl = () => {
  const value = process.env.BTCPAY_API_URL;
  if (!value) throw new Error("BTCPay testnet API URL is not configured.");
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid BTCPay API URL.");
  return url.toString().replace(/\/$/, "");
};
const storeId = () => {
  if (!process.env.BTCPAY_STORE_ID) throw new Error("BTCPay store id is not configured.");
  return process.env.BTCPAY_STORE_ID;
};
const apiKey = () => {
  if (!process.env.BTCPAY_API_KEY) throw new Error("BTCPay API key is not configured.");
  return process.env.BTCPAY_API_KEY;
};

export async function isBtcpayTestnetEnabled() {
  return process.env.PAYMENT_PROVIDER === "btcpay-testnet" && process.env.BTCPAY_NETWORK === "testnet" &&
    Boolean(process.env.BTCPAY_API_URL && process.env.BTCPAY_STORE_ID && process.env.BTCPAY_API_KEY && process.env.BTCPAY_EXPECTED_WALLET_ADDRESS);
}

async function assertBtcpayTestnetEnabled() {
  if (!(await isBtcpayTestnetEnabled())) throw new Error("BTCPay testnet is unavailable or not configured.");
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000),
    headers: { Authorization: `token ${apiKey()}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  if (!response.ok) throw new Error(`BTCPay API returned HTTP ${response.status}.`);
  return await response.json() as T;
}

type TestnetAddressType = "p2pkh" | "p2sh" | "p2wpkh" | "p2wsh" | "p2tr";

function bech32Polymod(values: number[]) {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) checksum ^= generators[i]!;
  }
  return checksum >>> 0;
}

function decodeBech32Testnet(address: string): TestnetAddressType | null {
  if (address.length < 8 || address.length > 90 || (address !== address.toLowerCase() && address !== address.toUpperCase())) return null;
  const normalized = address.toLowerCase();
  const separator = normalized.lastIndexOf("1");
  if (separator !== 2 || normalized.slice(0, separator) !== "tb") return null;
  const alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const data = [...normalized.slice(separator + 1)].map((char) => alphabet.indexOf(char));
  if (data.length < 7 || data.some((value) => value < 0)) return null;
  const polymod = bech32Polymod([3, 3, 0, 20, 2, ...data]); // expandHrp("tb")
  const version = data[0]!;
  if (version > 16 || (version === 0 ? polymod !== 1 : polymod !== 0x2bc830a3)) return null;
  const words = data.slice(1, -6);
  let accumulator = 0;
  let bits = 0;
  const program: number[] = [];
  for (const word of words) {
    accumulator = (accumulator << 5) | word;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      program.push((accumulator >>> bits) & 0xff);
    }
  }
  if (bits >= 5 || ((accumulator << (8 - bits)) & 0xff) !== 0 || program.length < 2 || program.length > 40) return null;
  if (version === 0) return program.length === 20 ? "p2wpkh" : program.length === 32 ? "p2wsh" : null;
  return version === 1 && program.length === 32 ? "p2tr" : null;
}

function isValidBase58TestnetAddress(address: string): TestnetAddressType | null {
  if (!/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{26,35}$/.test(address)) return null;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const char of address) value = value * 58n + BigInt(alphabet.indexOf(char));
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const decoded = Buffer.concat([Buffer.alloc(address.match(/^1*/)?.[0].length ?? 0), Buffer.from(hex, "hex")]);
  if (decoded.length !== 25) return null;
  const body = decoded.subarray(0, 21);
  const checksum = createHash("sha256").update(createHash("sha256").update(body).digest()).digest().subarray(0, 4);
  if (!timingSafeEqual(checksum, decoded.subarray(21))) return null;
  return body[0] === 0x6f ? "p2pkh" : body[0] === 0xc4 ? "p2sh" : null;
}

function testnetAddressType(address: unknown): TestnetAddressType | null {
  if (typeof address !== "string") return null;
  return decodeBech32Testnet(address) ?? isValidBase58TestnetAddress(address);
}

function dustThresholdSats(type: TestnetAddressType): bigint {
  if (type === "p2pkh") return 546n;
  if (type === "p2sh") return 540n;
  if (type === "p2wpkh") return 294n;
  return 330n;
}

function decimalToUnits(value: unknown, places: number): bigint | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > places) return null;
  return BigInt(whole!) * 10n ** BigInt(places) + BigInt((fraction + "0".repeat(places)).slice(0, places) || "0");
}

export function btcAmountToSats(value: string): number | undefined {
  const sats = decimalToUnits(value, 8);
  return sats !== null && sats <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(sats) : undefined;
}

function paymentStatus(attemptId: string, attempt: { bookingId: number; realTotalCents: bigint; testAmountCents: number; invoiceId: string | null; checkoutLink: string | null; btcDestination: string | null; btcAmount: string | null; status: string }): PaymentSession {
  const testAmountCents = attempt.testAmountCents;
  if (testAmountCents !== 1 && testAmountCents !== BTCPAY_TEST_AMOUNT_CENTS) throw new Error("Unsupported stored test charge.");
  const sats = attempt.btcAmount ? btcAmountToSats(attempt.btcAmount) : undefined;
  return {
    id: attemptId, bookingId: attempt.bookingId, amountCents: Number(attempt.realTotalCents), currency: "USD",
    testAmountCents, network: "testnet", checkoutLink: attempt.checkoutLink ?? undefined,
    btc: attempt.btcDestination ? { address: attempt.btcDestination, amountSats: sats } : undefined,
    status: attempt.status === "paid" ? "paid" : attempt.status === "expired" ? "expired" : attempt.status === "review" || attempt.status === "creating" ? "review" : "pending",
  };
}

type StoredAttempt = NonNullable<Awaited<ReturnType<typeof getPaymentAttempt>>>;

async function assertAttemptMatchesBooking(attempt: StoredAttempt, bookingId?: number) {
  const booking = await getBookingById(attempt.bookingId);
  if (!booking || (bookingId !== undefined && booking.id !== bookingId) || booking.payment_reference !== attempt.id ||
    !Number.isSafeInteger(booking.total_amount_cents) || attempt.realTotalCents > BigInt(Number.MAX_SAFE_INTEGER) ||
    BigInt(booking.total_amount_cents) !== attempt.realTotalCents || attempt.provider !== "btcpay-testnet" ||
    attempt.storeId !== storeId() || attempt.network !== "testnet" || attempt.realTotalCents <= 0n ||
    (attempt.testAmountCents !== 1 && attempt.testAmountCents !== BTCPAY_TEST_AMOUNT_CENTS)) {
    await setAttemptStatus(attempt.id, "review", "Stored attempt no longer matches provider configuration or booking.");
    throw new Error("Stored payment attempt identity or amount mismatch.");
  }
  return booking;
}

async function reconcileInvoice(attempt: StoredAttempt): Promise<PaymentSession> {
  await assertBtcpayTestnetEnabled();
  let invoiceId = attempt.invoiceId;
  if (!invoiceId) {
    // v2.4.7 supports repeated orderId filters; this exact id is persisted before POST.
    const matches = await api<Invoice[]>(`/api/v1/stores/${encodeURIComponent(attempt.storeId)}/invoices?orderId=${encodeURIComponent(attempt.id)}&includePaymentMethods=true&take=2`);
    const exact = Array.isArray(matches) ? matches.filter((x) => (x.metadata as Record<string, unknown> | null)?.orderId === attempt.id) : [];
    if (exact.length !== 1 || typeof exact[0]?.id !== "string") {
      if (exact.length > 1) await setAttemptStatus(attempt.id, "review", "Multiple invoices found for stable orderId.");
      return paymentStatus(attempt.id, { ...attempt, status: exact.length > 1 ? "review" : "creating" });
    }
    invoiceId = exact[0].id;
    if (exact[0].storeId !== attempt.storeId) {
      await setAttemptStatus(attempt.id, "review", "Order lookup returned an invoice from an unexpected store.");
      return paymentStatus(attempt.id, { ...attempt, status: "review" });
    }
    await saveInvoice(attempt.id, { invoiceId, checkoutLink: typeof exact[0].checkoutLink === "string" ? exact[0].checkoutLink : "", destination: "", amount: "" });
  }

  const invoice = await api<Invoice>(`/api/v1/invoices/${encodeURIComponent(invoiceId)}?includePaymentMethods=true`);
  const expectedAmount = (attempt.testAmountCents / 100).toFixed(2);
  if (invoice.id !== invoiceId || invoice.storeId !== attempt.storeId ||
    decimalToUnits(invoice.amount, 2) !== BigInt(attempt.testAmountCents) || invoice.currency !== "USD" ||
    (invoice.metadata as Record<string, unknown> | null)?.orderId !== attempt.id) {
    await setAttemptStatus(attempt.id, "review", "BTCPay invoice identity or fixed amount mismatch.");
    return paymentStatus(attempt.id, { ...attempt, status: "review" });
  }
  const methods = Array.isArray(invoice.paymentMethods) ? invoice.paymentMethods as Array<Record<string, unknown>> : [];
  const btc = methods.find((m) => m.paymentMethodId === "BTC-CHAIN" && m.currency === "BTC");
  const destination = btc?.destination;
  const btcAmount = btc?.amount;
  const addressType = testnetAddressType(destination);
  if (!btc || typeof destination !== "string" || !addressType || typeof btcAmount !== "string") {
    await setAttemptStatus(attempt.id, "review", "Missing on-chain BTC method or non-testnet destination.");
    return paymentStatus(attempt.id, { ...attempt, status: "review" });
  }
  const sats = decimalToUnits(btcAmount, 8);
  const dustThreshold = dustThresholdSats(addressType);
  if (sats === null || sats <= 0n || sats > BigInt(Number.MAX_SAFE_INTEGER) || sats < dustThreshold) {
    await setAttemptStatus(attempt.id, "review", `USD ${expectedAmount} invoice is zero, malformed, unsafe, unknown-address-type, or below its Bitcoin Core dust threshold.`);
    return paymentStatus(attempt.id, { ...attempt, status: "review" });
  }
  await saveInvoiceDetails(attempt.id, { invoiceId, checkoutLink: typeof invoice.checkoutLink === "string" ? invoice.checkoutLink : "", destination, amount: btcAmount });

  const payments = Array.isArray(btc.payments) ? btc.payments as Array<Record<string, unknown>> : [];
  const paymentRowsValid = payments.every((payment) =>
    (payment.status === "Processing" || payment.status === "Settled") && payment.destination === destination &&
    (decimalToUnits(payment.value, 8) ?? 0n) > 0n);
  const paidSats = payments.reduce((total, payment) => total +
    (paymentRowsValid ? decimalToUnits(payment.value, 8) ?? 0n : 0n), 0n);
  const settledSats = payments.reduce((total, payment) => total +
    (payment.status === "Settled" && payment.destination === destination ? decimalToUnits(payment.value, 8) ?? 0n : 0n), 0n);
  const methodAmountSats = decimalToUnits(btc.amount, 8);
  const dueSats = decimalToUnits(btc.due, 8);
  const methodPaidSats = decimalToUnits(btc.paymentMethodPaid, 8);
  const completeAmountEvidence = methods.length === 1 && methodAmountSats !== null && methodPaidSats !== null &&
    dueSats === 0n && paidSats >= methodAmountSats && methodPaidSats >= methodAmountSats && paymentRowsValid;
  if (payments.some((payment) => payment.status === "Invalid") || payments.length > 0 && !paymentRowsValid ||
    invoice.status === "Processing" && payments.length > 0 && !completeAmountEvidence) {
    await setAttemptStatus(attempt.id, "review", "Partial, invalid, or mismatched on-chain payment requires manual review.");
    return paymentStatus(attempt.id, { ...attempt, status: "review" });
  }
  const paymentEvidence = methods.length === 1 && methods[0] === btc && payments.length > 0 &&
    payments.every((p) => p.status === "Settled" && p.destination === destination && (decimalToUnits(p.value, 8) ?? 0n) > 0n) &&
    methodAmountSats !== null && settledSats >= methodAmountSats && methodPaidSats !== null && methodPaidSats >= methodAmountSats;
  const paidStatus = invoice.status === "Settled" && invoice.additionalStatus === "None" && paymentEvidence &&
    decimalToUnits(invoice.paidAmount, 2) === BigInt(attempt.testAmountCents) && dueSats === 0n;
  if (paidStatus) {
    const persisted = await recordSettledAttempt(attempt.id);
    return paymentStatus(attempt.id, persisted ?? { ...attempt, status: "review" });
  }
  if (invoice.status === "Settled") {
    await setAttemptStatus(attempt.id, "review", "Settled BTCPay invoice did not satisfy complete payment evidence.");
    return paymentStatus(attempt.id, { ...attempt, status: "review" });
  }
  if (invoice.status === "Expired" || invoice.status === "Invalid" || invoice.additionalStatus !== "None" && invoice.additionalStatus !== undefined) {
    await setAttemptStatus(attempt.id, "review", `BTCPay state requires review: ${String(invoice.status)}/${String(invoice.additionalStatus)}.`);
    return paymentStatus(attempt.id, { ...attempt, status: "review" });
  }
  return paymentStatus(attempt.id, { ...attempt, invoiceId, checkoutLink: typeof invoice.checkoutLink === "string" ? invoice.checkoutLink : null, btcDestination: destination, btcAmount, status: "pending" });
}

async function reconcile(attempt: StoredAttempt): Promise<PaymentSession> {
  const result = await reconcileInvoice(attempt);
  const latest = await getPaymentAttempt(attempt.id);
  if (latest?.status === "paid" || latest?.status === "review") return paymentStatus(attempt.id, latest);
  return result;
}

export const btcpayTestnetProvider: PaymentProvider = {
  key: "btcpay-testnet",
  label: `Bitcoin testnet — USD ${BTCPAY_TEST_AMOUNT_USD} test charge`,

  async createPayment({ bookingId, amountCents }) {
    await assertBtcpayTestnetEnabled();
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new RangeError("Invalid frozen booking total.");
    const store = storeId();
    const booking = await getBookingById(bookingId);
    if (!booking) throw new Error("Booking not found.");
    const reservation = await reservePaymentAttempt({ bookingId, listingId: booking.listing_id, expectedVersion: booking.version,
      realTotalCents: amountCents, provider: "btcpay-testnet", storeId: store });
    if (!reservation) throw new Error("Booking changed while the payment attempt was reserved.");
    await assertAttemptMatchesBooking(reservation.attempt, bookingId);
    if (!reservation.created) return reconcile(reservation.attempt);

    // v2.4.7 server info has no network field. Verify real sync/method status here;
    // the returned on-chain destination is then checked for testnet before exposure.
    const info = await api<{ version?: unknown; fullySynched?: unknown; supportedPaymentMethods?: unknown; syncStatus?: unknown }>("/api/v1/server/info");
    const sync = Array.isArray(info.syncStatus) ? info.syncStatus as Array<Record<string, unknown>> : [];
    if (info.version !== "2.4.7" || info.fullySynched !== true || !Array.isArray(info.supportedPaymentMethods) || !info.supportedPaymentMethods.includes("BTC-CHAIN") ||
      !sync.some((s) => s.paymentMethodId === "BTC-CHAIN" && s.available === true)) {
      await setAttemptStatus(reservation.attempt.id, "review", "BTCPay version/network sync prerequisites are unsupported or not verified.");
      throw new Error("BTCPay 2.4.7 testnet BTC-CHAIN sync is not verified; attempt retained for manual review.");
    }
    const methods = await api<Array<Record<string, unknown>>>(`/api/v1/stores/${encodeURIComponent(store)}/payment-methods?onlyEnabled=true`);
    if (!Array.isArray(methods) || !methods.some((m) => m.paymentMethodId === "BTC-CHAIN" && m.enabled === true)) {
      await setAttemptStatus(reservation.attempt.id, "review", "Store BTC-CHAIN wallet is not enabled/configured.");
      throw new Error("BTCPay store on-chain wallet is not enabled; attempt retained for manual review.");
    }
    const wallet = await api<{ addresses?: Array<{ index?: unknown; keyPath?: unknown; address?: unknown }> }>(`/api/v1/stores/${encodeURIComponent(store)}/payment-methods/BTC-CHAIN/wallet/preview?offset=0&count=1`);
    const first = wallet.addresses?.find((address) => address.index === 0 && address.keyPath === "0/0");
    if (!testnetAddressType(process.env.BTCPAY_EXPECTED_WALLET_ADDRESS) || first?.address !== process.env.BTCPAY_EXPECTED_WALLET_ADDRESS) {
      await setAttemptStatus(reservation.attempt.id, "review", "BTCPay receiving wallet does not match the expected testnet wallet.");
      throw new Error("BTCPay testnet wallet is not verified; attempt retained for manual review.");
    }
    // No network call is repeated after this durable reservation, including on timeout.
    await assertBtcpayTestnetEnabled();
    const created = await api<Invoice>(`/api/v1/stores/${encodeURIComponent(store)}/invoices`, {
      method: "POST", body: JSON.stringify({ amount: BTCPAY_TEST_AMOUNT_USD, currency: "USD",
        metadata: { orderId: reservation.attempt.id }, checkout: { paymentMethods: ["BTC-CHAIN"], paymentTolerance: 0,
          expirationMinutes: 15, monitoringMinutes: 1440 } }),
    });
    if (typeof created.id !== "string" || created.storeId !== store) throw new Error("BTCPay returned an unverified invoice; attempt retained for reconciliation.");
    await saveInvoice(reservation.attempt.id, { invoiceId: created.id,
      checkoutLink: typeof created.checkoutLink === "string" ? created.checkoutLink : "", destination: "", amount: "" });
    const current = await getPaymentAttempt(reservation.attempt.id);
    if (!current) throw new Error("Persisted payment attempt disappeared.");
    // saveInvoice only accepts creating state. Do not trust create response: retrieve authoritative details.
    return reconcile({ ...current, invoiceId: created.id });
  },

  async getPayment(id) {
    await assertBtcpayTestnetEnabled();
    const attempt = await getPaymentAttempt(id);
    if (!attempt || attempt.provider !== "btcpay-testnet") return null;
    await assertAttemptMatchesBooking(attempt);
    if (attempt.status === "paid") return paymentStatus(id, attempt);
    if (attempt.status === "creating") return reconcile(attempt);
    if (!attempt.invoiceId) return paymentStatus(id, attempt);
    return reconcile(attempt);
  },
};

export async function reconcileBtcpayWebhook(rawBody: string, signature: string | null) {
  await assertBtcpayTestnetEnabled();
  const secret = process.env.BTCPAY_WEBHOOK_SECRET;
  if (!secret || !signature || rawBody.length > 65_536) return { ok: false as const, status: 401 };
  const match = /^sha256=([a-f0-9]{64})$/i.exec(signature);
  if (!match) return { ok: false as const, status: 401 };
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(match[1]!, "hex");
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) return { ok: false as const, status: 401 };
  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false as const, status: 400 };
    event = parsed as Record<string, unknown>;
  } catch { return { ok: false as const, status: 400 }; }
  if (typeof event.storeId !== "string" || typeof event.invoiceId !== "string" || typeof event.type !== "string" || !event.type.startsWith("Invoice")) return { ok: false as const, status: 400 };
  if (event.storeId !== process.env.BTCPAY_STORE_ID) return { ok: true as const, ignored: true as const };
  const attempt = await getAttemptByInvoice(event.invoiceId);
  if (!attempt || attempt.provider !== "btcpay-testnet" || attempt.storeId !== event.storeId) return { ok: true as const, ignored: true as const };
  // Event type/order is only a hint; this one GET is authoritative.
  const payment = await btcpayTestnetProvider.getPayment(attempt.id);
  return { ok: true as const, ignored: false as const, attempt, payment };
}
