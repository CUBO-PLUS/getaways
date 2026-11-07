"use client";

import { useState, type FormEvent } from "react";
import { CalendarDays, CreditCard, MessageSquare, UserRound } from "lucide-react";

type Booking = {
  id: number;
  version: number;
  status: string;
  listing: { title: string; archived: boolean };
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number | null;
  contact: { name: string; email: string; phone: string | null };
  guestNotes: string | null;
  internalNotes: string | null;
  quote: {
    currency: string;
    nightlyCents: number;
    cleaningCents: number;
    petCents: number;
    extraGuestCents: number;
    discountCents: number;
    taxCents: number;
    totalCents: number;
  };
  paymentReferencePresent: boolean;
  paymentReviewRequired: boolean;
  testPayment: { amountCents: number; status: string } | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancelledBy: string | null;
};

type Operation = "contact" | "notes" | "cancel";

const card = "min-w-0 rounded-xl border border-[rgba(7,36,86,0.075)] bg-white p-5 sm:p-6";
const input = "mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-[14px] text-[#394342] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]";
const button = "inline-flex min-h-11 items-center justify-center rounded-full bg-[#394342] px-5 font-body text-[14px] font-medium text-white outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd] disabled:cursor-wait disabled:opacity-50";
const statusLabels: Record<string, string> = { pending_payment: "Pendiente de pago", confirmed: "Confirmada", cancelled: "Cancelada" };
const paymentLabels: Record<string, string> = { pending: "Pendiente", paid: "Pagado", review: "En revisión", expired: "Expirado", failed: "Fallido", creating: "Preparando pago" };

export default function BookingDetail({ booking }: { booking: Booking }) {
  const [version, setVersion] = useState(booking.version);
  const [status, setStatus] = useState(booking.status);
  const [paymentReviewRequired, setPaymentReviewRequired] = useState(booking.paymentReviewRequired);
  const [testPayment, setTestPayment] = useState(booking.testPayment);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refreshPayment() {
    setError("");
    setSuccess("");
    setPaymentMessage("");
    setBusy(true);
    setRefreshing(true);
    try {
      const response = await fetch(`/api/admin/bookings/${booking.id}`, { method: "POST", cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        setPaymentMessage(result.error ?? "No se pudo consultar el pago. Inténtalo de nuevo.");
        return;
      }
      setStatus(result.status);
      setPaymentReviewRequired(result.paymentReviewRequired);
      setTestPayment(result.testPayment);
      // Keep the edit version: refreshing payment must not silently overwrite concurrent staff edits.
      if (result.version !== version) setConflict(true);
      setPaymentMessage(result.paymentReviewRequired
        ? "Estado actualizado. Este pago requiere revisión manual."
        : result.testPayment?.status === "paid" ? "Pago confirmado por BTCPay." : "Estado consultado. BTCPay aún no confirma el pago.");
    } catch {
      setPaymentMessage("No se pudo conectar. Inténtalo de nuevo; tus ediciones se conservaron.");
    } finally {
      setBusy(false);
      setRefreshing(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>, operation: Operation) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setConflict(false);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const payload = operation === "contact"
      ? { version, name: data.name, email: data.email, phone: data.phone || null }
      : operation === "notes"
        ? { version, notes: data.notes }
        : { version, reason: data.reason, confirmed: data.confirmed === "yes" };

    setBusy(true);
    try {
      const response = await fetch(`/api/admin/bookings/${booking.id}/${operation}`, {
        method: operation === "cancel" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 409) {
        setError("La reserva cambió. Tus ediciones se conservaron.");
        setConflict(true);
        return;
      }
      if (!response.ok) {
        setError("No se pudo guardar. Revisa los datos e inténtalo de nuevo.");
        return;
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("version" in result) || typeof result.version !== "number") {
        setError("La operación se guardó, pero no se pudo actualizar la versión. Recarga para continuar.");
        setConflict(true);
        return;
      }
      setVersion(result.version);
      if (operation === "cancel") {
        setStatus("cancelled");
        setPaymentReviewRequired((current) => current || booking.status === "confirmed");
        setSuccess("Reserva cancelada. No se emitió un reembolso automático; revisa manualmente el pago.");
      } else {
        setSuccess("Cambios guardados.");
      }
    } catch {
      setError("No se pudo conectar. Tus ediciones se conservaron; inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const money = (cents: number) => new Intl.NumberFormat("es-SV", { style: "currency", currency: booking.quote.currency || "USD" }).format(cents === 0 ? 0 : cents / 100);
  const date = (value: string) => new Intl.DateTimeFormat("es", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));

  return (
    <>
      <header className="mb-6 mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 mb-2 text-xs uppercase tracking-wider text-slate-500">Operación / Detalle de estancia</p>
          <h1 className="m-0 font-heading text-[32px] font-medium leading-tight sm:text-4xl">Reserva #{booking.id}</h1>
        </div>
        <span className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${status === "confirmed" ? "bg-emerald-50 text-emerald-800" : status === "cancelled" ? "bg-slate-200 text-slate-700" : "bg-amber-50 text-amber-900"}`}>{statusLabels[status] ?? status}</span>
      </header>
      <section className={`${card} mb-6 border-t-4 border-t-[#394342]`} aria-labelledby="stay-heading">
        <p className="m-0 text-xs text-slate-500">Hospedaje{booking.listing.archived ? " · archivado" : ""}</p>
        <h2 id="stay-heading" className="m-0 mt-2 font-heading text-xl font-medium">{booking.listing.title}</h2>
        <dl className="m-0 mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
          <div><dt className="flex items-center gap-2 text-xs text-slate-500"><CalendarDays aria-hidden className="size-4" /> Entrada</dt><dd className="m-0 mt-2 font-medium">{date(booking.checkIn)}</dd></div>
          <div><dt className="text-xs text-slate-500">Salida</dt><dd className="m-0 mt-2 font-medium">{date(booking.checkOut)}</dd></div>
          <div><dt className="text-xs text-slate-500">Estancia</dt><dd className="m-0 mt-2 font-medium">{booking.nights} {booking.nights === 1 ? "noche" : "noches"} · {booking.guests ?? "—"} {booking.guests === 1 ? "huésped" : "huéspedes"}</dd></div>
        </dl>
      </section>
      {error && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
      {conflict && <button type="button" onClick={() => location.reload()} className={`${button} mb-5`}>Recargar versión actual (descarta ediciones)</button>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
      <form method="post" onSubmit={(event) => save(event, "contact")} className={card} aria-labelledby="contact-heading">
        <h2 id="contact-heading" className="m-0 flex items-center gap-2 font-heading text-lg font-medium"><UserRound aria-hidden className="size-5 text-slate-400" /> Ficha del huésped</h2>
        <p className="m-0 mb-5 mt-2 text-sm leading-6 text-slate-500">Datos de contacto para coordinar la estancia.</p>
        <input type="hidden" name="version" value={version} />
        <div className="grid gap-4">
          <label>Nombre<input required maxLength={200} name="name" defaultValue={booking.contact.name} className={input} /></label>
          <label>Correo<input required type="email" maxLength={254} name="email" defaultValue={booking.contact.email} className={input} /></label>
          <label>Teléfono<input type="tel" maxLength={100} name="phone" defaultValue={booking.contact.phone ?? ""} className={input} /></label>
        </div>
        <button disabled={busy} className={`${button} mt-5`}>Guardar contacto</button>
      </form>

      {booking.guestNotes && (
        <section className={card}>
          <h2 className="m-0 font-heading text-lg font-medium">Nota del huésped</h2>
          <p className="m-0 mt-3 whitespace-pre-wrap break-words text-sm leading-6">{booking.guestNotes}</p>
        </section>
      )}
      <form method="post" onSubmit={(event) => save(event, "notes")} className={card} aria-labelledby="notes-heading">
        <h2 id="notes-heading" className="m-0 flex items-center gap-2 font-heading text-lg font-medium"><MessageSquare aria-hidden className="size-5 text-slate-400" /> Notas internas</h2>
        <p className="m-0 mb-4 mt-2 text-sm leading-6 text-slate-500">Información de seguimiento, visible solo para el equipo.</p>
        <input type="hidden" name="version" value={version} />
        <label>Solo personal<textarea name="notes" maxLength={4_000} defaultValue={booking.internalNotes ?? ""} rows={5} className={input} /></label>
        <button disabled={busy} className={`${button} mt-5`}>Guardar nota</button>
      </form>
      </div>

      <aside className="min-w-0 space-y-6" aria-label="Importes y pago">
        <section className={card} aria-labelledby="quote-heading">
          <p className="m-0 mb-2 text-xs uppercase tracking-wider text-slate-500">Condiciones acordadas · {booking.quote.currency}</p>
          <h2 id="quote-heading" className="m-0 font-heading text-lg font-medium">Total del hospedaje</h2>
          <p className="m-0 mt-3 font-heading text-[30px] font-medium tabular-nums text-[#394342]">{money(booking.quote.totalCents)}</p>
          <dl className="m-0 mt-5 divide-y divide-slate-100 text-sm">
            {([["Tarifa por noche", booking.quote.nightlyCents], ["Limpieza", booking.quote.cleaningCents], ["Mascotas", booking.quote.petCents], ["Huéspedes extra", booking.quote.extraGuestCents], ["Descuento", -booking.quote.discountCents], ["Impuestos", booking.quote.taxCents]] as const).map(([label, amount]) => <div key={label} className="flex justify-between gap-4 py-2.5"><dt className="text-slate-500">{label}</dt><dd className="m-0 whitespace-nowrap tabular-nums">{money(amount)}</dd></div>)}
          </dl>
          <p className="m-0 mt-3 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">Las condiciones de esta reserva no cambian al editar las tarifas del hospedaje.</p>
        </section>
        <section className={`${card} ${paymentReviewRequired ? "border-amber-300 bg-amber-50" : ""}`} aria-labelledby="payment-heading">
          <h2 id="payment-heading" className="m-0 flex items-center gap-2 font-heading text-lg font-medium"><CreditCard aria-hidden className="size-5 text-slate-400" /> Pago testnet</h2>
          <p className="m-0 mt-2 text-sm leading-6 text-slate-500">Cargo de prueba independiente del total del hospedaje.</p>
          {paymentReviewRequired && <p className="mb-0 mt-4 rounded-lg bg-amber-100 p-3 text-sm font-medium leading-6 text-amber-900">Este pago requiere revisión manual.</p>}
          {testPayment ? <>
            <p className="mb-0 mt-4 font-medium">{money(testPayment.amountCents)} · {paymentLabels[testPayment.status] ?? testPayment.status}</p>
            <button type="button" disabled={busy} aria-busy={refreshing} onClick={() => void refreshPayment()} className={`${button} mt-4 w-full`}>{refreshing ? "Consultando BTCPay…" : "Refrescar estado del pago"}</button>
            <p role="status" aria-live="polite" className="m-0 mt-3 text-sm leading-6">{paymentMessage}</p>
          </> : <p className="mb-0 mt-4 text-sm">Sin intento de pago registrado.</p>}
          <p className="m-0 mt-4 text-xs leading-5 text-slate-500">Referencia de pago: {booking.paymentReferencePresent ? "conservada" : "ninguna"}.</p>
          <p className="m-0 mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">Cancelar libera las fechas, pero no reembolsa pagos. Revisa manualmente los pagos recibidos o posteriores a la cancelación.</p>
        </section>
      </aside>
      </div>

      {status !== "cancelled" && (
        <form
          method="post"
          onSubmit={(event) => {
            const confirmed = window.confirm(
              `¿Cancelar la estancia en ${booking.listing.title}, ${booking.checkIn} a ${booking.checkOut}? Esto no reembolsa pagos; puede requerir revisión/devolución manual.`,
            );
            if (!confirmed) {
              event.preventDefault();
              return;
            }
            void save(event, "cancel");
          }}
          className="my-8 rounded-xl border border-red-300 bg-red-50/60 p-5"
        >
          <h2 className="mb-2 mt-0 font-heading text-lg font-medium text-red-900">Cancelar reserva</h2>
          <p className="m-0 mb-4 text-sm leading-6 text-red-900">Se liberarán las fechas. Esta acción no emite un reembolso automático.</p>
          <input type="hidden" name="version" value={version} />
          <label className="grid gap-1.5">Motivo<input required maxLength={500} name="reason" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-body text-[14px] focus-visible:outline-2 focus-visible:outline-[#0277bd]" /></label>
          <label className="my-3 flex min-h-11 items-center gap-2 text-sm"><input required type="checkbox" name="confirmed" value="yes" className="size-4 accent-[#394342]" /> Confirmo la cancelación de estas fechas</label>
          <button disabled={busy} className="min-h-11 rounded-full border border-red-700 px-5 font-body text-[14px] font-medium text-red-900 disabled:opacity-50">{busy ? "Cancelando…" : "Cancelar reserva"}</button>
        </form>
      )}
      {status === "cancelled" && (booking.cancelledAt
        ? <p>Cancelada {booking.cancelledAt} · {booking.cancellationReason}</p>
        : <p>Cancelación guardada. Recarga para consultar los detalles registrados; los otros formularios conservan sus cambios locales.</p>)}
      <noscript><p>Activa JavaScript para guardar cambios. Los formularios no enviarán datos personales mediante GET.</p></noscript>
    </>
  );
}
