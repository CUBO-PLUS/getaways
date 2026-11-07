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
    <main lang="es" className="mx-auto max-w-6xl px-4 py-8 font-body text-[14px] text-[#394342] sm:px-6 lg:px-10 lg:py-10">
      <Link className="inline-flex min-h-11 items-center font-body text-sm font-medium text-[#394342] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]" href="/admin/bookings">← Volver a reservas</Link>
      <BookingDetail booking={booking} />
    </main>
  );
}
