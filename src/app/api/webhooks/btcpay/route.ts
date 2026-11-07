import { markPaid, getBookingById } from "@/modules/bookings/server/booking-store";
import { reconcileBtcpayWebhook } from "@/modules/payments/btcpay-testnet";
import { syncReferralStatusForBooking } from "@/modules/referrals/referral-lifecycle";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 65_536) return new Response(null, { status: 413 });
  if (!request.body) return new Response(null, { status: 400 });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 65_536) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let raw: string;
  try { raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new Response(null, { status: 400 }); }
  const result = await reconcileBtcpayWebhook(raw, request.headers.get("BTCPay-Sig"));
  if (!result.ok) return new Response(null, { status: result.status });
  if (result.ignored || !result.attempt || result.payment?.status !== "paid" ||
    result.payment.amountCents !== Number(result.attempt.realTotalCents) ||
    result.payment.bookingId !== result.attempt.bookingId) return new Response(null, { status: 200 });
  const booking = await getBookingById(result.attempt.bookingId);
  if (booking?.payment_reference !== result.attempt.id || booking.total_amount_cents !== result.payment.amountCents) {
    return new Response(null, { status: 200 });
  }
  const saved = await markPaid({ paymentId: result.attempt.id, bookingId: booking.id,
    amountCents: result.payment.amountCents, currency: "USD" });
  if (saved.found) {
    try { await syncReferralStatusForBooking(saved.booking.id); }
    catch { console.error("Unable to sync referral attribution after BTCPay webhook"); }
  }
  return new Response(null, { status: 200 });
  } catch {
    console.error("BTCPay webhook verification/reconciliation failed");
    return new Response(null, { status: 503 });
  }
}
