# [ ] Fase 3.1 — Modelo e importación privada de reservas

Dependencia: [plan 2 completo](../catalogo-y-medios/README.md).
[Plan 3 y checklist](README.md). No implementar proveedor de pagos real.

## Problemas del almacenamiento actual

`booking-store.ts` conserva copias globales y escribe un archivo por renombrado.
Esto evita archivos parciales en un proceso, no sobrescrituras entre instancias.
Además, `updateBooking()` acepta un patch amplio sin proteger estados; `saveQuote()`
lee y después actualiza sin una condición atómica de estado/referencia de pago.

`markPaid()` es hoy el único confirmador: detecta solapes, es idempotente para
confirmadas y mantiene cancelada una reserva con pago tardío. Esos contratos se
conservan en PostgreSQL, no se reemplazan por un selector libre de estado.

## Modelo `Booking`

Añadir al contrato sin modificar datos de referidos o blog:

- ID entero conservado y `listingId` con FK `Restrict` a `Listing`.
- Fechas de entrada/salida como fechas de estancia, no timestamps desplazables
  por zona horaria; noches positivas, entrada anterior a salida y fechas reales.
- Nombre, correo, teléfono, notas del huésped y notas internas actuales.
- Moneda USD y todos los importes actuales en centavos: tarifa, limpieza, mascota,
  extra huésped, descuento, impuestos y total; restricciones de no negatividad/rango.
- Huéspedes, cupón, estado cerrado `pending_payment | confirmed | cancelled`.
- `checkoutSessionId?` único, `paymentReference?` único y nullable, tras comprobar
  duplicados en la fuente. Son datos sensibles; no se devuelven en listados administrativos.
- `pricingSnapshot` JSONB de estructura cerrada y versionada con tarifas/políticas
  acordadas: tarifa base, cargos unitarios, impuestos, capacidad, huéspedes incluidos
  y mascotas. No es configuración dinámica ni historial completo.
- Título de hospedaje acordado para recibo, versión de concurrencia, fechas de
  creación/actualización y datos mínimos de cancelación: fecha, motivo y actor.
- Índices por `listingId, status, checkIn` y `createdAt` para disponibilidad y listado.
  No índice sobre cada campo personal sin necesidad.

No añadir borrado de reservas. No agregar FK a `ReferralAttribution.bookingId`
sin revisar atribuciones huérfanas; conservar ese modelo y sus IDs inicialmente.

## Importación privada

- [ ] Identificar cada archivo/instancia con reservas y detener sus escrituras al obtener la fuente final coherente del corte B2. No asumir que los archivos son idénticos.
- [ ] Respaldar fuera del repositorio con permisos restrictivos. No imprimir huéspedes, sesiones, referencias de pago o notas en informes públicos.
- [ ] Implementar `scripts/bookings-import.mts`: validar esquema, IDs únicos, sesiones/pagos duplicados, referencias a hospedajes, importes, estados y fechas.
- [ ] Preservar IDs para no romper checkout ni referidos; no regenerar session IDs. Importar en transacción, verificar recuentos y valores, ajustar secuencia.
- [ ] Conservar importes almacenados; nunca reconstruir precios históricos desde tarifas actuales. Si faltan términos para una cotización pendiente, marcarla para revisión y bloquear recotización hasta resolverlos explícitamente.
- [ ] Rechazar fuentes ilegibles y destinos distintos; nunca tratar un archivo ilegible como «cero reservas». La repetición verifica equivalencia y rechaza conflictos.

## Migración y cierre

- [ ] Generar migración desde el destino aprobado del plan 2 y revisarla/aplicarla en entorno aislado con el [flujo del plan 1](../user-and-roles/01-usuarios-y-migraciones.md).
- [ ] Ensayar importador con datos privados protegidos o fixtures apropiados, verificando IDs, sesiones, importes, secuencias y atribuciones preservados.
- [ ] Registrar conflictos y términos faltantes; resolver o bloquear explícitamente las operaciones afectadas.
- [ ] Dejar listo modelo/importador sin cambiar aún el store operativo. La importación final y el cambio conjunto de lectores/escritores ocurren en 3.3/B2.
