import { getBookingBySessionId } from "@/modules/bookings/server/bookings";
import { isCheckoutSessionId } from "@/modules/checkout/checkout-session";
import { privateCheckoutJson } from "@/modules/checkout/private-response";

export const dynamic = "force-dynamic";

/*
 * Lets the checkout page watch for a payment that is confirmed elsewhere.
 * The Bitcoin panel polls this. Returns the status and nothing else: no guest
 * name, email or price.
 */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  if (!isCheckoutSessionId(sessionId)) {
    return privateCheckoutJson({ ok: false, error: "Invalid checkout session." }, { status: 400 });
  }

  try {
    const booking = await getBookingBySessionId(sessionId, request);
    if (!booking) {
      return privateCheckoutJson({ ok: false, error: "Checkout session not found." }, { status: 404 });
    }
    return privateCheckoutJson({ ok: true, data: { status: booking.status } });
  } catch {
    console.error("Unexpected error in GET /api/checkout/status");
    return privateCheckoutJson({ ok: false, error: "Status could not be read." }, { status: 500 });
  }
}
