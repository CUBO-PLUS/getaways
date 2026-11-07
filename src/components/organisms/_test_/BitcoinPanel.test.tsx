// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PaymentSession } from "@/modules/payments/types";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") } }));

import BitcoinPanel from "@/components/organisms/BitcoinPanel";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const pending: PaymentSession = {
  id: "attempt-1", bookingId: 1, amountCents: 25600, currency: "USD", testAmountCents: 100, network: "testnet",
  status: "pending", checkoutLink: "https://btcpay.example.test/invoice/1",
  btc: { address: "tb1qexample", amountSats: 1000 },
};

it.each([[100, "$1.00"], [1, "$0.01"]] as const)("displays the actual fixed test charge (%s cents) separately from the stay quote", (testAmountCents, displayAmount) => {
  render(<BitcoinPanel sessionId="cko_1_test" payment={{ ...pending, testAmountCents }} totalAmountCents={25600} onPaid={vi.fn()} onBack={vi.fn()} />);
  expect(screen.getByText(displayAmount)).toBeTruthy();
  expect(screen.getByText("Fixed test charge; stay quote: $256.00 (not charged)")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /simulate/i })).toBeNull();
  expect(screen.queryByText(/student mock/i)).toBeNull();
});

const terminalPolls = [
  ["manual review", 409, { ok: false, code: "payment_review", data: { status: "review" } }],
  ["expired payment", 409, { ok: false, code: "payment_expired", data: { status: "expired" } }],
  ["cancelled booking", 200, { ok: true, data: { status: "cancelled" } }],
  ["expired deployment proof", 404, { ok: false, code: "payment_unavailable" }],
  ["temporarily unavailable provider", 503, { ok: false }],
] as const;

it.each(terminalPolls)("hides send instructions after polling reports %s", async (_case, status, body) => {
  vi.useFakeTimers();
  const onPaid = vi.fn();
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);

  render(<BitcoinPanel sessionId="cko_1_test" payment={pending} totalAmountCents={25600} onPaid={onPaid} onBack={vi.fn()} />);
  expect(screen.getByRole("link", { name: "Open BTCPay checkout" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();

  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Open BTCPay checkout" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  expect(screen.queryByRole("img", { name: "Bitcoin payment QR code" })).toBeNull();
  expect(screen.queryByText(pending.btc!.address!)).toBeNull();
  expect(onPaid).not.toHaveBeenCalled();
});

it("restores instructions after unavailable polling recovers to an authoritative pending payment", async () => {
  vi.useFakeTimers();
  const onPaid = vi.fn();
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, code: "payment_unavailable" }), { status: 404 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { status: "pending_payment", paymentStatus: "pending" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);

  render(<BitcoinPanel sessionId="cko_1_test" payment={pending} totalAmountCents={25600} onPaid={onPaid} onBack={vi.fn()} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Open BTCPay checkout" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Refresh payment status" }));
    await vi.advanceTimersByTimeAsync(0);
  });

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("link", { name: "Open BTCPay checkout" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  expect(screen.getByText(pending.btc!.address!)).toBeTruthy();
  expect(onPaid).not.toHaveBeenCalled();
});
