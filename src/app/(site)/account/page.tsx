import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getGuestSession } from "@/modules/guests/server/auth";
import { getGuestReservations } from "@/modules/guests/server/reservations";
import { GuestLogoutButton } from "@/modules/guests/client/GuestAuthForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const session = await getGuestSession();
  if (!session) redirect("/account/login");
  const reservations = await getGuestReservations();
  return <section className="mx-auto max-w-4xl">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="font-heading text-3xl text-heading">Your account</h1><p className="mt-2 text-body-text">Your stays and payment status.</p></div>
      <GuestLogoutButton />
    </div>
    {!reservations?.length ? <p className="mt-8 rounded-lg border border-border p-6 text-body-text">No reservations yet. <Link href="/properties">Explore properties</Link></p> : <ul className="mt-8 grid list-none gap-4 p-0">
      {reservations.map((r) => <li key={r.id} className="rounded-lg border border-border bg-background p-5">
        <h2 className="m-0 font-heading text-xl text-heading">{r.listingTitle}</h2>
        <p className="mt-2 text-sm text-body-text">{r.checkIn} – {r.checkOut} · {r.nights} nights · {r.status.replaceAll("_", " ")}</p>
        <p className="text-sm text-body-text">Total: {(r.totalAmountCents / 100).toLocaleString("en-US", { style: "currency", currency: r.currency })}</p>
        {r.payment && <p className="text-sm text-body-text">{r.payment.network === "testnet"
          ? `Testnet test charge: ${(r.payment.testAmountCents! / 100).toLocaleString("en-US", { style: "currency", currency: r.currency })} · ${r.payment.status}. Stay quote ${(r.payment.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: r.currency })} is not charged.`
          : `Payment: ${r.payment.status} · ${(r.payment.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: r.currency })}`}</p>}
        {r.checkoutUrl && <Link href={r.checkoutUrl}>{r.status === "pending_payment" ? "Continue checkout" : "View reservation"}</Link>}
      </li>)}
    </ul>}
    {process.env.NODE_ENV !== "production" && <p className="mt-6 text-xs text-muted-text">Local environment only. Mock payments are not real payments; this page does not certify production or BTCPay payment status.</p>}
  </section>;
}
