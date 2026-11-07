# Assignment: implement a mock Bitcoin payment

> **Historical assignment — superseded 2026-11-07.** The placeholder provider and
> simulated-payment action have been retired. Current checkout uses BTCPay Testnet
> with USD 1.00 for new attempts, keeping the stay quote separate. Missing provider
> configuration disables checkout; do not reintroduce simulation from this brief.
> See [current payment documentation](docs/plans/pagos/README.md).

## English

### Goal

The checkout of this site has an itemized bill and a payment step. Right now the payment step is a starter stub. Your job is to build a **mock Bitcoin (BTC) payment**: the customer picks Bitcoin, sees the amount in sats, pays to an address or invoice, and the booking becomes confirmed when the payment is paid.

Nothing is real. There is no real money, no real wallet and no real network call required. You can mock the exchange rate, the address and the payment.

### Run the project

```bash
npm install
npm run dev
```

Open http://localhost:3000, pick a property, go to checkout and reach the payment step. See [README.md](./README.md) for the project map.

### Where to plug in

| File | What you do there |
| --- | --- |
| `modules/payments/types.ts` | The contract. Read it first. Do not change its shape without telling the teacher. |
| `modules/payments/btc-mock.ts` | Implement `createPayment` and `getPayment` for Bitcoin. This is a starter stub with `TODO(student)` comments. |
| `modules/payments/index.ts` | Exports the active provider. |
| `app/api/checkout/btc/route.ts` | Server route. `POST` creates a payment for the saved total. `GET ?session_id=` returns the status. |
| `modules/bookings/server/booking-store.ts` | Has `markPaid(paymentId)`. Only this function confirms a booking. |
| `components/organisms/BitcoinPanel.tsx` | The checkout UI for the Bitcoin method. Shows the amount, address or invoice, QR code, timer and status. |

Keep provider logic in `modules/payments/` and payment UI in `components/organisms/`. Add real tests under the relevant area's `_test_/` folder (for example, `modules/payments/_test_/btc-mock.test.ts`); `npm test` discovers those folders. Do not create a parallel payments implementation under the route or template.

### The contract

```ts
export type PaymentSession = {
  id: string;
  bookingId: number;
  amountCents: number;
  currency: "USD";
  btc?: {
    address?: string;
    invoice?: string;
    amountSats?: number;
    expiresAt?: string;
  };
  status: "pending" | "paid" | "expired" | "failed";
};

export interface PaymentProvider {
  readonly key: string;
  readonly label: string;
  createPayment(input: {
    bookingId: number;
    amountCents: number;
    description: string;
  }): Promise<PaymentSession>;
  getPayment(id: string): Promise<PaymentSession | null>;
}
```

Rules that come with the contract:

- A booking becomes `confirmed` only through `markPaid(paymentId)` in `modules/bookings/server/booking-store.ts`. Do not set the status any other way.
- The total comes from the saved quote on the booking. Do not recalculate the price in the payment code.
- In development, a "simulate payment" button may call `markPaid`. It is not shown in production builds (`NODE_ENV !== "production"`). Keep it that way.

### Requirements

1. Show the Bitcoin amount in **sats**, converted from the USD total. Use a USD to BTC rate that you mock, or fetch it from a public price API. If you fetch, handle the case where the request fails.
2. Show a **Bitcoin address or a BOLT11-style invoice**, and a **QR code** for it. A mocked address or invoice is fine. Do not use a real wallet's private data.
3. Show an **expiry timer**. When the time runs out, the payment becomes `expired`.
4. **Poll the status** from the browser (`GET /api/checkout/btc`) until the payment is paid, expired or failed.
5. When the payment is paid, call `markPaid` so the booking becomes `confirmed`. The confirmation page must then show the booking.
6. Handle **underpaid** payments (paid less than the amount in sats) and **expired** payments. Show a clear message in plain English. Do not confirm an underpaid booking.
7. Keep the UI in plain English. Keep the code style of the project.

### Stretch goals (optional)

- A Lightning invoice mock (BOLT11-style string, with its own expiry).
- A testnet mode with a clear label.
- A webhook simulation: a dev-only route that marks a payment paid after a delay.
- Tests with `vitest` for the conversion from USD to sats, expiry, and underpaid handling.
- Show the exchange rate and when it was last updated.

### Acceptance checklist

- [ ] `npm install` and `npm run dev` work with no `.env` file.
- [ ] The checkout shows one payment method: "Bitcoin (student mock)".
- [ ] The amount is shown in sats, and it matches your rate.
- [ ] An address or invoice and a QR code are shown.
- [ ] The timer counts down and the payment expires at zero.
- [ ] The browser polls the status and updates without a reload.
- [ ] A paid payment confirms the booking through `markPaid`.
- [ ] The booking appears as confirmed on the confirmation page.
- [ ] An underpaid or expired payment does not confirm the booking, and the message is clear.
- [ ] No API keys, secrets or real personal data are in your code.
- [ ] `npx tsc --noEmit -p .` passes.

### Submission

Send your repository link or zip file to the teacher, with a short note on what you built, what you mocked, and what you did not finish.

---

## Español

### Objetivo

El checkout de este sitio tiene una factura detallada y un paso de pago. Hoy el paso de pago es un "stub" inicial. Su tarea es construir un **pago simulado en Bitcoin (BTC)**: el cliente elige Bitcoin, ve el monto en sats, paga a una dirección o factura, y la reserva queda confirmada cuando el pago está pagado.

Nada es real. No hay dinero real, ni billetera real, ni llamadas de red obligatorias. Pueden simular la tasa de cambio, la dirección y el pago.

### Cómo correrlo

```bash
npm install
npm run dev
```

Abran http://localhost:3000, elijan una propiedad, vayan al checkout y lleguen al paso de pago. El mapa del proyecto está en [README.md](./README.md).

### Dónde conectar

| Archivo | Qué hacer |
| --- | --- |
| `modules/payments/types.ts` | El contrato. Léanlo primero. No cambien su forma sin avisar al profesor. |
| `modules/payments/btc-mock.ts` | Implementen `createPayment` y `getPayment` para Bitcoin. Es un stub con comentarios `TODO(student)`. |
| `modules/payments/index.ts` | Exporta el proveedor activo. |
| `app/api/checkout/btc/route.ts` | Ruta del servidor. `POST` crea el pago por el total guardado. `GET ?session_id=` devuelve el estado. |
| `modules/bookings/server/booking-store.ts` | Tiene `markPaid(paymentId)`. Solo esta función confirma una reserva. |
| `components/organisms/BitcoinPanel.tsx` | La interfaz de pago con Bitcoin: monto, dirección o factura, QR, temporizador y estado. |

Mantengan la lógica del proveedor en `modules/payments/` y la interfaz en `components/organisms/`. Las pruebas nuevas van dentro de `_test_/` de su área (por ejemplo, `modules/payments/_test_/btc-mock.test.ts`); `npm test` descubre esas carpetas. No creen otra implementación de pagos dentro de la ruta o el template.

### El contrato

Es el mismo código de arriba. Reglas:

- Una reserva pasa a `confirmed` solo mediante `markPaid(paymentId)` en `modules/bookings/server/booking-store.ts`.
- El total sale de la cotización guardada en la reserva. No recalculen el precio en el código de pago.
- En desarrollo puede existir un botón "simular pago" que llama a `markPaid`. No debe aparecer en producción (`NODE_ENV !== "production"`).

### Requisitos

1. Mostrar el monto en Bitcoin en **sats**, convertido desde el total en USD. Usen una tasa USD a BTC simulada, o tráiganla de una API pública de precios. Si la consultan, manejen el caso en que falle.
2. Mostrar una **dirección de Bitcoin o una factura tipo BOLT11**, y un **código QR**. Una dirección simulada está bien. No usen datos privados de una billetera real.
3. Mostrar un **temporizador de expiración**. Al llegar a cero, el pago pasa a `expired`.
4. **Consultar el estado** desde el navegador (`GET /api/checkout/btc`) hasta que el pago esté pagado, expirado o fallido.
5. Cuando el pago esté pagado, llamar a `markPaid` para que la reserva quede `confirmed`. La página de confirmación debe mostrar la reserva.
6. Manejar pagos **insuficientes** (menos sats de los pedidos) y pagos **expirados**. Mostrar un mensaje claro. No confirmar una reserva con pago insuficiente.
7. La interfaz va en inglés sencillo, como el resto del sitio. Mantengan el estilo de código del proyecto.

### Extras opcionales

- Simular una factura Lightning (texto tipo BOLT11, con su propia expiración).
- Un modo testnet con una etiqueta clara.
- Una simulación de webhook: una ruta solo para desarrollo que marca un pago como pagado después de un tiempo.
- Pruebas con `vitest` para la conversión USD a sats, la expiración y el pago insuficiente.

### Lista de aceptación

- [ ] `npm install` y `npm run dev` funcionan sin archivo `.env`.
- [ ] El checkout muestra un solo método: "Bitcoin (student mock)".
- [ ] El monto aparece en sats y coincide con su tasa.
- [ ] Se muestran dirección o factura y código QR.
- [ ] El temporizador baja y el pago expira en cero.
- [ ] El navegador consulta el estado y se actualiza sin recargar.
- [ ] Un pago pagado confirma la reserva mediante `markPaid`.
- [ ] La reserva aparece confirmada en la página de confirmación.
- [ ] Un pago insuficiente o expirado no confirma la reserva, y el mensaje es claro.
- [ ] No hay claves API, secretos ni datos personales reales en su código.
- [ ] `npx tsc --noEmit -p .` pasa.

### Entrega

Envíen al profesor el enlace del repositorio o un zip, con una nota corta: qué construyeron, qué simularon y qué les faltó.
