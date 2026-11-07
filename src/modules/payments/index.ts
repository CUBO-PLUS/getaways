import { btcpayTestnetProvider } from "@/modules/payments/btcpay-testnet";
import type { PaymentProvider } from "@/modules/payments/types";

export type { PaymentProvider, PaymentSession } from "@/modules/payments/types";

const unavailableProvider: PaymentProvider = {
  key: "unavailable",
  label: "Unavailable",
  async createPayment() { throw new Error("Payment provider is not configured."); },
  async getPayment() { throw new Error("Payment provider is not configured."); },
};

// Explicit opt-in only: missing or obsolete configuration must never open a fake payment.
export const activePaymentProvider: PaymentProvider = process.env.PAYMENT_PROVIDER === "btcpay-testnet"
  ? btcpayTestnetProvider
  : unavailableProvider;

export function isPaymentProviderConfigured() {
  return activePaymentProvider.key !== "unavailable";
}
