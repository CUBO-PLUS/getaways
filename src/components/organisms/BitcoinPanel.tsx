"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, Copy, Loader2 } from "lucide-react";
import QRCode from "qrcode";

import type { PaymentSession } from "@/modules/payments/types";

/*
 * The Bitcoin payment panel. It shows what the provider returned and waits.
 *
 * It does not decide anything about money. The page asks the server
 * (POST /api/checkout/btc with action=reconcile) every few seconds, and when the booking is confirmed
 * it moves on. Only markPaid() on the server confirms a booking.
 *
 * Students: the amount in sats, the QR and the expiry all come from the
 * provider (modules/payments/btc-mock.ts). Add what the provider does not give
 * you here, such as a live rate or a partial-payment message.
 */

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function BitcoinPanel({
  sessionId,
  payment,
  totalAmountCents,
  demo,
  onPaid,
  onBack,
}: {
  sessionId: string;
  payment: PaymentSession;
  totalAmountCents: number;
  demo: boolean;
  onPaid: () => void;
  onBack: () => void;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const paidRef = useRef(false);

  const payload = payment.btc?.invoice ?? (payment.btc?.address ? `bitcoin:${payment.btc.address}` : null);
  const copyable = payment.btc?.invoice ?? payment.btc?.address ?? null;
  const expiresAt = payment.btc?.expiresAt ? Date.parse(payment.btc.expiresAt) : null;
  const remaining = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null;
  const expired = remaining === 0 || payment.status === "expired";

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!payload) return;
    let active = true;
    QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 240 })
      .then((url) => active && setQrUrl(url))
      .catch(() => active && setQrUrl(null));
    return () => {
      active = false;
    };
  }, [payload]);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/checkout/btc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, action: "reconcile" }), cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (json?.ok && json.data?.status === "confirmed" && !paidRef.current) {
        paidRef.current = true;
        onPaid();
      }
    } catch {
      // A dropped poll is fine. The next one is three seconds away.
    }
  }, [sessionId, onPaid]);

  useEffect(() => {
    const id = setInterval(checkStatus, 3000);
    return () => clearInterval(id);
  }, [checkStatus]);

  async function copyPayload() {
    if (!copyable) return;
    try {
      await navigator.clipboard.writeText(copyable);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  // Dev only. The server refuses this in production.
  async function simulatePaid() {
    setSimulating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/checkout/btc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, action: "simulate_paid" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMessage(json?.error ?? "The simulation failed.");
        return;
      }
      if (json.data?.status === "confirmed" && !paidRef.current) {
        paidRef.current = true;
        onPaid();
        return;
      }
      setMessage("The booking was not confirmed. Check the dates and try again.");
    } catch {
      setMessage("The simulation failed. Check your connection.");
    } finally {
      setSimulating(false);
    }
  }

  return (
    <section className="flex flex-col items-center mb-6 text-center gap-3.5" aria-label="Bitcoin payment">
      <button type="button" className="self-start inline-flex items-center bg-transparent text-body-text text-[13px] cursor-pointer p-0 gap-1.5 border-0
        hover:text-heading" onClick={onBack}>
        <ArrowLeft size={15} aria-hidden="true" />
        <span>Other method</span>
      </button>

      <h2 className="font-heading text-[19px] m-0">Pay with bitcoin</h2>
      <p className="flex flex-col m-0 gap-0.5">
        <strong className="text-[26px] text-heading">{money(totalAmountCents)}</strong>
        {payment.btc?.amountSats != null && <span className="text-[13px] text-body-text">{payment.btc.amountSats.toLocaleString("en-US")} sats</span>}
      </p>

      <div className="grid place-items-center w-72 max-w-full aspect-square bg-white p-2.5 rounded-xl border border-border">
        {qrUrl && !expired ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="block w-full h-auto" src={qrUrl} alt="Bitcoin payment QR code" width={240} height={240} />
        ) : (
          <div className="text-body-text text-[13px]">{expired ? "This payment expired" : "Waiting for a payment address"}</div>
        )}
      </div>

      {remaining !== null && !expired && (
        <p className="text-[13px] text-body-text tabular-nums m-0">Expires in {formatCountdown(remaining)}</p>
      )}

      {copyable && !expired && (
        <div className="flex items-stretch w-full gap-2 max-[560.001px]:flex-col">
          <code className="flex-1 min-w-0 bg-[rgba(15,_23,_39,_0.03)] text-[11px] leading-[1.5] text-left wrap-anywhere max-h-[4.6em] overflow-hidden px-3 py-2.5 rounded-lg border border-border">{copyable}</code>
          <button className="inline-flex flex-none items-center bg-white text-[13px] cursor-pointer px-3.5 py-0 gap-1.5 rounded-lg border border-border max-[560.001px]:justify-center max-[560.001px]:p-2.5" type="button" onClick={copyPayload} aria-label="Copy">
            {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      )}

      {!expired && (
        <p className="inline-flex items-center text-[13px] text-body-text m-0 gap-2">
          <Loader2 size={14} className="flex-none basis-5.5 w-5.5 animate-spin [animation-duration:900ms] motion-reduce:[animation-duration:2.4s]" aria-hidden="true" />
          <span>Waiting for payment…</span>
        </p>
      )}

      {demo && (
        <div className="w-full bg-[rgba(255,_193,_7,_0.08)] text-left p-3.5 rounded-[10px] border border-dashed border-[rgba(178,_122,_12,_0.45)]">
          <p className="mt-0 mb-2.5 mx-0 text-[12.5px] leading-[1.55] text-[#6b4a08]">
            <strong>Student mock.</strong> No real bitcoin moves here. This button marks the payment as paid so
            you can test the confirmation page. It is removed in production.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="bg-[#7a5206] text-white text-[13px] font-semibold cursor-pointer px-3.5 py-2 rounded-lg border border-[#7a5206] disabled:opacity-55 disabled:cursor-not-allowed" type="button" onClick={simulatePaid} disabled={simulating}>
              {simulating ? "Simulating…" : "Simulate payment"}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className="flex items-start mt-3 mb-0 text-[13px] leading-[1.5] text-[#8a1c2b] mx-0 gap-2" role="alert">
          <AlertCircle className="flex-none mt-0.5" size={15} aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}
    </section>
  );
}
