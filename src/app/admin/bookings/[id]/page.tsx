import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import { staffBookingDetail } from "@/modules/bookings/server/booking-admin";
import BookingDetail from "@/modules/bookings/client/booking-detail";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function BookingPage({ params }: PageProps<"/admin/bookings/[id]">) {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN" && actor.role !== "BOOKING_MANAGER") notFound();
  const rawId = (await params).id;
  if (!/^[1-9]\d*$/.test(rawId) || Number(rawId) > 2_147_483_647) notFound();
  const booking = await staffBookingDetail(actor, Number(rawId));
  if (!booking) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-[#394342]">
      <Link href="/admin/bookings">← Reservas</Link>
      <BookingDetail booking={booking} />
    </main>
  );
}
