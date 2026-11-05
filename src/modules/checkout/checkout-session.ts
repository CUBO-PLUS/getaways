/**
 * The checkout session id is the handle in the guest's checkout URL
 * (`/checkout?session_id=`). It is stored on the booking as checkout_session_id.
 */
export function isCheckoutSessionId(id: string): boolean {
  return isCanonicalCheckoutSessionId(id);
}

export function newCheckoutSessionId(bookingId: number): string {
  return `cko_${bookingId}_${crypto.randomUUID()}`;
}
import { isCanonicalCheckoutSessionId } from "@/modules/bookings/booking-persistence";
