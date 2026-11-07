/*
 * BTCPay payment evidence keeps the real stay quote separate from the test charge.
 * Only authoritative settlement can confirm a booking; there is no simulated payment.
 */

export const BTCPAY_TEST_AMOUNT_CENTS = 100;
export const BTCPAY_TEST_AMOUNT_USD = (BTCPAY_TEST_AMOUNT_CENTS / 100).toFixed(2);

export type PaymentSession = {
  /** Provider's id for this payment. Stored on the booking as payment_reference. */
  id: string;
  /** The booking this payment is for. */
  bookingId: number;
  /** Real stay quote in US cents; a testnet charge is carried separately below. */
  amountCents: number;
  currency: "USD";
  btc?: {
    /** On-chain address to pay. */
    address?: string;
    /** Lightning invoice (BOLT11 or similar) to pay. */
    invoice?: string;
    /** The USD amount converted to satoshis at the rate you chose. */
    amountSats?: number;
    /** ISO time after which the invoice or address quote is no longer valid. */
    expiresAt?: string;
  };
  /** Real quote stays distinct from the fixed testnet charge. */
  testAmountCents?: 1 | typeof BTCPAY_TEST_AMOUNT_CENTS;
  network?: "testnet";
  checkoutLink?: string;
  status: "pending" | "paid" | "expired" | "failed" | "review";
};

export interface PaymentProvider {
  readonly key: string;
  readonly label: string;
  createPayment(input: { bookingId: number; amountCents: number; description: string }): Promise<PaymentSession>;
  getPayment(id: string): Promise<PaymentSession | null>;
}
