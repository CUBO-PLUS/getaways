import BookingConfirmationTemplate from "@/components/templates/BookingConfirmationTemplate";
import { getBookingConfirmationData } from "@/modules/bookings/server/bookings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking Confirmation — Getaways El Salvador", robots: { index: false, follow: false, noarchive: true } };

export default async function BookingConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  return <BookingConfirmationTemplate data={await getBookingConfirmationData(sessionId)} />;
}
