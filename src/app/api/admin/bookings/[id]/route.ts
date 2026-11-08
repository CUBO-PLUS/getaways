import { staffBookingDetail } from "@/modules/bookings/server/booking-admin";
import { bookingReply, fail, idParam, staff } from "@/modules/bookings/server/booking-admin-http";
import { getBookingById, markPaid } from "@/modules/bookings/server/booking-store";
import { btcpayTestnetProvider, isBtcpayTestnetEnabled } from "@/modules/payments/btcpay-testnet";
import { syncReferralStatusForBooking } from "@/modules/referrals/referral-lifecycle";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/admin/bookings/[id]">) {
  try {
    const actor = await staff(request);
    if (actor instanceof Response) return actor;
    const id = idParam((await context.params).id);
    if (!id) return bookingReply(400, { error: "Invalid booking" });
    const booking = await staffBookingDetail(actor, id);
    return booking ? bookingReply(200, booking) : bookingReply(404, { error: "Booking not found" });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: RouteContext<"/api/admin/bookings/[id]">) {
  try {
    const actor = await staff(request, true);
    if (actor instanceof Response) return actor;
    const id = idParam((await context.params).id);
    if (!id) return bookingReply(400, { error: "Reserva inválida." });
    const booking = await getBookingById(id);
    if (!booking) return bookingReply(404, { error: "Reserva no encontrada." });
    if (!booking.payment_reference) return bookingReply(409, { error: "Esta reserva no tiene un pago abierto." });
    if (!(await isBtcpayTestnetEnabled())) {
      return bookingReply(503, { error: "BTCPay testnet no está habilitado o configurado." });
    }
    const payment = await btcpayTestnetProvider.getPayment(booking.payment_reference);
    if (!payment || payment.id !== booking.payment_reference || payment.bookingId !== booking.id ||
      payment.amountCents !== booking.total_amount_cents || payment.currency !== "USD") {
      return bookingReply(409, { error: "No se pudo verificar el pago de esta reserva. Requiere revisión manual." });
    }
    if (payment.status === "paid") {
      const result = await markPaid({ paymentId: payment.id, bookingId: booking.id,
        amountCents: payment.amountCents, currency: "USD" });
      if (!result.found) return bookingReply(409, { error: "La reserva cambió. Recarga para consultar su estado actual." });
      try { await syncReferralStatusForBooking(booking.id); }
      catch { console.error("Unable to sync referral attribution after staff payment refresh"); }
    }
    const latest = await staffBookingDetail(actor, id);
    if (!latest) return bookingReply(404, { error: "Reserva no encontrada." });
    return bookingReply(200, { version: latest.version, status: latest.status,
      paymentReviewRequired: latest.paymentReviewRequired, testPayment: latest.testPayment });
  } catch {
    return bookingReply(503, { error: "No se pudo consultar BTCPay. Inténtalo de nuevo; no se abrió otra factura." });
  }
}
