"use client";

import { useState, type FormEvent } from "react";

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

  const money = (cents: number) => `USD ${(cents / 100).toFixed(2)}`;

  return (
    <>
      <h1 className="mt-5 text-3xl">Reserva #{booking.id}</h1>
      <h2 className="mt-3 text-xl">
        {booking.listing.title}{booking.listing.archived ? " (archivado)" : ""}: {booking.checkIn} – {booking.checkOut}
      </h2>
      <p>{booking.nights} noches · {status}</p>

      <section className="my-6 border-l-4 border-amber-600 bg-amber-50 p-4">
        <h2 className="font-bold">Revisión financiera</h2>
        <p>Cancelar libera las fechas, pero no reembolsa pagos. Revisa manualmente cualquier pago recibido o posterior a la cancelación. El importe del hospedaje no es el cargo testnet.</p>
        {paymentReviewRequired && <strong>Este pago requiere revisión manual.</strong>}
        {testPayment && <>
          <p>Pago testnet separado: {money(testPayment.amountCents)} · {testPayment.status}</p>
          <button type="button" disabled={busy} aria-busy={refreshing} onClick={() => void refreshPayment()} className="mt-3 border px-4 py-2 disabled:opacity-50">
            {refreshing ? "Consultando BTCPay…" : "Refrescar estado del pago"}
          </button>
          <p role="status" aria-live="polite">{paymentMessage}</p>
        </>}
      </section>

      <h2 className="font-semibold">Desglose acordado</h2>
      <p>
        Por noche {money(booking.quote.nightlyCents)} · limpieza {money(booking.quote.cleaningCents)} ·
        mascotas {money(booking.quote.petCents)} · huéspedes extra {money(booking.quote.extraGuestCents)} ·
        descuento −{money(booking.quote.discountCents)} · impuestos {money(booking.quote.taxCents)} ·
        total {money(booking.quote.totalCents)} · Referencia de pago: {booking.paymentReferencePresent ? "conservada" : "ninguna"}
      </p>

      <form method="post" onSubmit={(event) => save(event, "contact")} className="my-6 grid gap-3">
        <h2 className="text-xl">Contacto del huésped</h2>
        <input type="hidden" name="version" value={version} />
        <label>Nombre<input required maxLength={200} name="name" defaultValue={booking.contact.name} className="block w-full border p-2" /></label>
        <label>Correo<input required type="email" maxLength={254} name="email" defaultValue={booking.contact.email} className="block w-full border p-2" /></label>
        <label>Teléfono<input maxLength={100} name="phone" defaultValue={booking.contact.phone ?? ""} className="block w-full border p-2" /></label>
        <button disabled={busy} className="justify-self-start border px-4 py-2">Guardar contacto</button>
      </form>

      {booking.guestNotes && (
        <section>
          <h2>Nota del huésped</h2>
          <p className="whitespace-pre-wrap">{booking.guestNotes}</p>
        </section>
      )}
      <form method="post" onSubmit={(event) => save(event, "notes")} className="my-6 grid gap-3">
        <h2 className="text-xl">Notas internas</h2>
        <input type="hidden" name="version" value={version} />
        <label>Solo personal<textarea name="notes" maxLength={4_000} defaultValue={booking.internalNotes ?? ""} rows={5} className="block w-full border p-2" /></label>
        <button disabled={busy} className="justify-self-start border px-4 py-2">Guardar nota</button>
      </form>

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
          className="my-8 border border-red-700 p-4"
        >
          <h2 className="text-xl">Cancelar reserva</h2>
          <input type="hidden" name="version" value={version} />
          <label>Motivo<input required maxLength={500} name="reason" className="block w-full border p-2" /></label>
          <label className="my-3 block"><input required type="checkbox" name="confirmed" value="yes" /> Confirmo la cancelación de estas fechas</label>
          <button disabled={busy} className="border border-red-700 px-4 py-2">Cancelar reserva</button>
        </form>
      )}
      {status === "cancelled" && (booking.cancelledAt
        ? <p>Cancelada {booking.cancelledAt} · {booking.cancellationReason}</p>
        : <p>Cancelación guardada. Recarga para consultar los detalles registrados; los otros formularios conservan sus cambios locales.</p>)}
      <p role="alert" aria-live="polite">{error}</p>
      {success && <p role="status" aria-live="polite">{success}</p>}
      {conflict && (
        <button type="button" onClick={() => location.reload()} className="border px-4 py-2">
          Recargar versión actual (descarta ediciones)
        </button>
      )}
      <noscript><p>Activa JavaScript para guardar cambios. Los formularios no enviarán datos personales mediante GET.</p></noscript>
    </>
  );
}
