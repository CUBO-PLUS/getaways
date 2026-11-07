"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Loader2 } from "lucide-react";
import QRCode from "qrcode";

import type { PaymentSession } from "@/modules/payments/types";

type PaymentIssue = "review" | "expired" | "cancelled" | "unavailable";

/*
 * The Bitcoin payment panel. It shows what the provider returned and waits.
 *
 * It does not decide anything about money. The page asks the server
 * (POST /api/checkout/btc with action=reconcile) every few seconds, and when the booking is confirmed
 * it moves on. Only markPaid() on the server confirms a booking.
 * The amount in sats, address and invoice come from BTCPay, never a placeholder.
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
  onPaid,
  onBack,
}: {
  sessionId: string;
  payment: PaymentSession;
  totalAmountCents: number;
  onPaid: () => void;
  onBack: () => void;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentIssue, setPaymentIssue] = useState<PaymentIssue | null>(
    payment.status === "review" ? "review" : payment.status === "expired" ? "expired" : null,
  );
  const [now, setNow] = useState(() => Date.now());
  const paidRef = useRef(false);

  const btcAmount = payment.btc?.amountSats == null ? "" : `?amount=${(payment.btc.amountSats / 100_000_000).toFixed(8)}`;
  const payload = payment.btc?.invoice ?? (payment.btc?.address ? `bitcoin:${payment.btc.address}${btcAmount}` : null);
  const copyable = payment.btc?.invoice ?? payment.btc?.address ?? null;
  const expiresAt = payment.btc?.expiresAt ? Date.parse(payment.btc.expiresAt) : null;
  const remaining = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null;
  const expired = remaining === 0 || payment.status === "expired";
  const visibleIssue = paymentIssue ?? (expired ? "expired" : null);
  const issueMessage: Record<PaymentIssue, string> = {
    review: "This payment needs manual review. Do not send more funds or open another invoice.",
    expired: "This payment expired. Do not send funds; contact support before taking another payment action.",
    cancelled: "This booking was cancelled. Do not send funds; any payment requires manual review.",
    unavailable: "Payment status cannot be verified right now. Payment instructions are hidden until verification is available.",
  };

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

  const checkStatus = useCallback(async (explicitRefresh = false) => {
    if (paidRef.current || visibleIssue && !explicitRefresh) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/checkout/btc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, action: "reconcile" }), cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (json?.code === "payment_review") {
        setPaymentIssue("review");
        return;
      }
      if (json?.code === "payment_expired") {
        setPaymentIssue("expired");
        return;
      }
      if (json?.code === "payment_unavailable" || res.status === 503) {
        setPaymentIssue("unavailable");
        return;
      }
      if (json?.ok && json.data?.status === "cancelled") {
        setPaymentIssue("cancelled");
        return;
      }
      if (json?.ok && json.data?.status === "confirmed" && !paidRef.current) {
        paidRef.current = true;
        onPaid();
        return;
      }
      if (json?.ok && json.data?.status === "pending_payment" && json.data?.paymentStatus === "pending") {
        setPaymentIssue(null);
      } else if (!res.ok || !json?.ok) setPaymentIssue("unavailable");
    } catch {
      setPaymentIssue("unavailable");
    } finally {
      setRefreshing(false);
    }
  }, [sessionId, onPaid, visibleIssue]);

  useEffect(() => {
    if (visibleIssue) return;
    const id = setInterval(checkStatus, 3000);
    return () => clearInterval(id);
  }, [checkStatus, visibleIssue]);

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

  return (
    <section className="flex flex-col items-center mb-6 text-center gap-3.5" aria-label="Bitcoin payment">
      <button type="button" className="self-start inline-flex items-center bg-transparent text-body-text text-[13px] cursor-pointer p-0 gap-1.5 border-0
        hover:text-heading" onClick={onBack}>
        <ArrowLeft size={15} aria-hidden="true" />
        <span>Other method</span>
      </button>

      <h2 className="font-heading text-[19px] m-0">{payment.network === "testnet" ? "Bitcoin testnet payment" : "Pay with bitcoin"}</h2>
      <p className="flex flex-col m-0 gap-0.5">
        <strong className="text-[26px] text-heading">{money(payment.testAmountCents ?? totalAmountCents)}</strong>
        {payment.testAmountCents != null && <span className="text-[13px] text-body-text">Fixed test charge; stay quote: {money(totalAmountCents)} (not charged)</span>}
        {payment.btc?.amountSats != null && <span className="text-[13px] text-body-text">{payment.btc.amountSats.toLocaleString("en-US")} sats</span>}
      </p>

      {payment.network === "testnet" && <p className="m-0 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">Testnet only. This payment does not pay the real stay price.</p>}
      {visibleIssue && <div className="flex flex-col items-center gap-2" role="alert">
        <p className="m-0 text-sm text-red-800">{issueMessage[visibleIssue]}</p>
        {visibleIssue === "unavailable" && <button type="button" disabled={refreshing} onClick={() => void checkStatus(true)}>
          {refreshing ? "Checking status…" : "Refresh payment status"}
        </button>}
      </div>}
      {!paymentIssue && payment.status === "pending" && payment.checkoutLink && <a href={payment.checkoutLink} target="_blank" rel="noreferrer">Open BTCPay checkout</a>}

      <div className="grid place-items-center w-72 max-w-full aspect-square bg-white p-2.5 rounded-xl border border-border">
        {qrUrl && !expired && !visibleIssue && payment.status === "pending" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="block w-full h-auto" src={qrUrl} alt="Bitcoin payment QR code" width={240} height={240} />
        ) : (
          <div className="text-body-text text-[13px]">{visibleIssue ? "Payment instructions hidden" : "Waiting for a payment address"}</div>
        )}
      </div>

      {remaining !== null && !expired && (
        <p className="text-[13px] text-body-text tabular-nums m-0">Expires in {formatCountdown(remaining)}</p>
      )}

      {copyable && !expired && !visibleIssue && payment.status === "pending" && (
        <div className="flex items-stretch w-full gap-2 max-[560.001px]:flex-col">
          <code className="flex-1 min-w-0 bg-[rgba(15,_23,_39,_0.03)] text-[11px] leading-[1.5] text-left wrap-anywhere max-h-[4.6em] overflow-hidden px-3 py-2.5 rounded-lg border border-border">{copyable}</code>
          <button className="inline-flex flex-none items-center bg-white text-[13px] cursor-pointer px-3.5 py-0 gap-1.5 rounded-lg border border-border max-[560.001px]:justify-center max-[560.001px]:p-2.5" type="button" onClick={copyPayload} aria-label="Copy">
            {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      )}

      {!expired && !visibleIssue && payment.status === "pending" && (
        <p className="inline-flex items-center text-[13px] text-body-text m-0 gap-2">
          <Loader2 size={14} className="flex-none basis-5.5 w-5.5 animate-spin [animation-duration:900ms] motion-reduce:[animation-duration:2.4s]" aria-hidden="true" />
          <span>Waiting for payment…</span>
        </p>
      )}

    </section>
  );
}
