"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Bitcoin, Loader2 } from "lucide-react";

import BitcoinPanel from "@/components/organisms/BitcoinPanel";
import type { PaymentSession } from "@/modules/payments/types";

/*
 * The payment choice: Bitcoin through BTCPay Testnet.
 * Its panel is BitcoinPanel; the server side is app/api/checkout/btc.
 */

export type CheckoutMethod = {
  key: string;
  name: string;
  detail: string;
  available: boolean;
};

export default function CheckoutMethods({
  sessionId,
  methods,
  totalAmountCents,
  onPanelChange,
}: {
  sessionId: string;
  methods: CheckoutMethod[];
  /** The real stay quote, shown separately from the fixed test charge. */
  totalAmountCents: number;
  /** Told when the payment panel opens or closes, so the price questions above can lock while it is open. */
  onPanelChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [payment, setPayment] = useState<PaymentSession | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const usable = methods.filter((method) => method.available);

  function goToConfirmation() {
    router.push(`/booking-confirmation?session_id=${encodeURIComponent(sessionId)}`);
  }

  async function startBitcoin() {
    setStarting(true);
    setMessage(null);
    // Lock the price questions from the click: the payment is opened for the total on the booking now.
    onPanelChange?.(true);
    let opened = false;
    try {
      const res = await fetch("/api/checkout/btc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMessage(json?.error ?? "The payment could not be opened.");
        return;
      }
      setPayment(json.data.payment as PaymentSession);
      opened = true;
    } catch {
      setMessage("The payment could not be opened. Check your connection.");
    } finally {
      if (!opened) onPanelChange?.(false);
      setStarting(false);
    }
  }

  if (payment) {
    return (
      <BitcoinPanel
        sessionId={sessionId}
        payment={payment}
        totalAmountCents={totalAmountCents}
        onPaid={goToConfirmation}
        onBack={() => {
          setPayment(null);
          onPanelChange?.(false);
        }}
      />
    );
  }

  return (
    <section aria-label="Payment methods">
      <h2 className="mt-0 mb-3 mx-0 text-[15px] tracking-[0.2px]">How would you like to pay?</h2>
      <ul className="flex flex-col mt-0 mb-3.5 list-none mx-0 p-0 gap-2.5">
        {usable.map((method) => (
          <li className="flex items-center justify-between px-4 py-3.5 gap-4 rounded-lg border border-border max-[480.001px]:flex-col max-[480.001px]:items-start" key={method.key}>
            <button
              type="button"
              className="flex items-center w-full bg-white text-left cursor-pointer [transition:border-color_0.12s,_box-shadow_0.12s] p-4 gap-3.5
                rounded-[10px] border border-solid border-border [&:hover:not(:disabled)]:shadow-[0_2px_10px_rgba(15,_23,_39,_0.08)]
                [&:hover:not(:disabled)]:border-heading disabled:cursor-progress disabled:opacity-70"
              onClick={startBitcoin}
              disabled={starting}
              aria-busy={starting}
            >
              <span className="grid place-items-center flex-none size-10 bg-[rgba(15,_23,_39,_0.06)] text-body-text text-[13px] leading-[1.45] rounded-full" aria-hidden="true">
                {starting ? <Loader2 size={20} className="flex-none basis-5.5 w-5.5 animate-spin [animation-duration:900ms] motion-reduce:[animation-duration:2.4s]" /> : <Bitcoin size={20} />}
              </span>
              <span className="flex flex-col min-w-0 flex-1 gap-0.75 text-[13px] leading-[1.45] text-body-text">
                <strong className="text-[15px] text-text">{method.name}</strong>
                <span>{method.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {usable.length === 0 && <p role="status">Bitcoin testnet payments are currently unavailable. Please contact our team.</p>}

      {message && (
        <p className="flex items-start mt-3 mb-0 text-[13px] leading-[1.5] text-[#8a1c2b] mx-0 gap-2" role="alert">
          <AlertCircle className="flex-none mt-0.5" size={15} aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}
    </section>
  );
}
