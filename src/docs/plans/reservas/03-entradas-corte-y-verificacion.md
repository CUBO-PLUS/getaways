# [ ] Fase 3.3 — Entradas, corte a PostgreSQL y verificación

Dependencia: [fase 3.2](02-consistencia-financiera-y-concurrencia.md).
[Plan 3 y checklist](README.md). Cierra el **hito B2**, que desbloquea el plan 4
y la fase 3.4 sin dependencia entre estos últimos.

**Implementación local — 2026-11-04:** lectores/escritores adaptados conjuntamente
en el worktree `reservas-fase3`, sin fallback a archivo/memoria. Reconciliación de
pagos por `POST action=reconcile`; `GET` no cambia reservas ni referidos. La
capacidad de checkout se valida por formato completo y coincidencia exacta en BD;
recibos/checkout usan DTO limitados, privados y sin caché.
La revisión global aprobada y sus correcciones se registran en [la evidencia](05-evidencia-local.md).
**Corte local B2 completado:** migración aplicada, cero reservas importadas por
confirmación de la persona solicitante y aplicación original reiniciada sobre
PostgreSQL. Las verificaciones diferidas se realizan en el
[seguimiento de testing B2](06-testing-b2.md), no retroactivamente en este corte.
La aceptación para producción sigue fuera de esta entrega; no falta aplicar la
migración local.

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

El archivo de integración ya existe y crea su propio contenedor PostgreSQL
desechable, con entorno permitido explícitamente y sin cargar `.env` operativo.
El flag no vuelve seguros otros tests: revisar su destino antes de habilitarlos.
Estas pruebas no usan ni escriben en un bucket S3.

- [ ] Completar las comprobaciones aplicables de [verificación y aceptación](../comunes/verificacion-y-aceptacion.md).
- [ ] Ensayar restauración y ejecutar importación final y corte según el [hito B2](../comunes/transicion-y-recuperacion.md).
- [x] Probar checkout, confirmación, disponibilidad, referidos y dos procesos usando la misma fuente.
- [x] Revisar la integración de referidos vigente al implementar (incluida la PR #1 si se integró): comprobar con PostgreSQL real que una reserva con código activo crea una sola atribución pendiente, que confirmar o cancelar sincroniza su estado y que los reintentos no duplican registros. Verificar también que un código inválido o inactivo no impide reservar ni crea atribución.
- [ ] Conciliar las atribuciones existentes con las reservas importadas por `bookingId`; identificar y resolver o registrar explícitamente los huérfanos y conflictos de IDs antes del corte. Evaluar una FK solo después de esa revisión, sin borrar historial ni introducir cascadas.
- [x] Comprobar que un fallo de sincronización de referidos no revierte el pago y que existe un mecanismo de recuperación verificable para corregir el estado; no depender de un GET si su efecto se trasladó a la reconciliación indicada arriba.

## Cierre del hito de persistencia B2

- [ ] Importación reconciliada y reservas/atribuciones/sesiones preservadas.
- [x] Dos procesos observan los mismos datos; solo una confirmación gana en un solape.
- [x] Cotización estable ante cambios de catálogo y pagos tardíos sin reconfirmación.
- [x] Sin lectores/escritores de reservas sobre memoria/archivo ni fallback operativo.
- [x] Mock identificado como desarrollo; su falta de persistencia bloquea presentar checkout de pagos reales como listo para producción.
- [ ] Evidencia y aceptación B2 registradas; habilitado iniciar 3.4 y el plan 4, sin exponer aún sus interfaces.

Verificación técnica ejecutada: [testing B2](06-testing-b2.md). La aceptación de
entrega y el ensayo del respaldo fresco no se marcan por aprobar estas pruebas.
