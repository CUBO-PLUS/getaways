# [ ] Fase 3.3 — Entradas, corte a PostgreSQL y verificación

Dependencia: [fase 3.2](02-consistencia-financiera-y-concurrencia.md).
[Plan 3 y checklist](README.md). Cierra el **hito B2**, que desbloquea el plan 4
y la fase 3.4 sin dependencia entre estos últimos.

## Entradas públicas e internas

- [ ] Adaptar `modules/bookings/server/{booking-store,bookings,availability-search}.ts`, `modules/checkout/server/checkout.ts`, `app/api/bookings/route.ts` y disponibilidad.
- [ ] Adaptar `app/api/checkout/{quote,status,btc}/route.ts`, checkout, confirmación y todos los llamadores de pagos/referidos. Conservar firmas externas cuando sea posible; no duplicar stores.
- [ ] Cambiar juntos todos los lectores/escritores operativos; desde el corte solo PostgreSQL.

El checkout del huésped sigue usando su session ID aleatorio como credencial de
capacidad: coincidencia exacta en BD, validación de formato/longitud y DTO limitado.
No autorizar por ID numérico ni por el simple prefijo `cko_`.
No confundir esa credencial con la sesión de personal. Evitar filtrarla por logs,
Referer y caché; `no-store` y políticas apropiadas en checkout/confirmación.
Status público sigue devolviendo solo estado; disponibilidad no devuelve datos personales.

`GET /api/checkout/btc` actualmente reconcilia pagos y puede escribir:

- [ ] Trasladar ese efecto a un POST de reconciliación o mecanismo interno autenticado adecuado al proveedor, sin permitir que un cliente declare pagado.
- [ ] Mantener `simulate_paid` exclusivamente en desarrollo e inaccesible en producción.

## Verificación y corte futuros

Tras la migración ensayada de 3.1 y las reglas verificadas de 3.2:

```bash
pnpm run db:check
pnpm exec vitest run modules/bookings/_test_ modules/bookings/server/_test_ modules/referrals/_test_
NODE_ENV=development PRISMA_TEST_DATABASE=1 pnpm exec vitest run modules/bookings/_test_/booking-db.test.ts
pnpm exec tsc --noEmit --incremental false
```

El archivo de integración es propuesto. El flag de prueba no selecciona por sí solo
una base aislada; configurar y verificar conexión y bucket según la guía común.

- [ ] Completar las comprobaciones aplicables de [verificación y aceptación](../comunes/verificacion-y-aceptacion.md).
- [ ] Ensayar restauración y ejecutar importación final y corte según el [hito B2](../comunes/transicion-y-recuperacion.md).
- [ ] Probar checkout, confirmación, disponibilidad, referidos y dos procesos usando la misma fuente.

## Cierre del hito de persistencia B2

- [ ] Importación reconciliada y reservas/atribuciones/sesiones preservadas.
- [ ] Dos procesos observan los mismos datos; solo una confirmación gana en un solape.
- [ ] Cotización estable ante cambios de catálogo y pagos tardíos sin reconfirmación.
- [ ] Sin lectores/escritores de reservas sobre memoria/archivo ni fallback operativo.
- [ ] Mock identificado como desarrollo; su falta de persistencia bloquea presentar checkout de pagos reales como listo para producción.
- [ ] Evidencia y aceptación B2 registradas; habilitado iniciar 3.4 y el plan 4, sin exponer aún sus interfaces.
