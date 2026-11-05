# [x] Fase 3.2 — Consistencia financiera, snapshots y concurrencia

Dependencia: [fase 3.1](01-modelo-e-importacion.md).
[Plan 3 y checklist](README.md). Prerrequisito del corte B2 y de la gestión comercial.

**Cerrada y aceptada localmente el 2026-11-05 UTC**, junto con B2;
[aceptación y excepción operativa de restauración](06-testing-b2.md#aceptación-y-cierre-local).

**Implementación local — 2026-11-04:** store PostgreSQL y cotización desde
`pricingSnapshot` V1 entregados en `feature/reservas-fase3`, con revisión técnica final aprobada.
Las confirmaciones serializan por fila `Listing` antes de bloquear `Booking`;
cotizaciones y asociaciones de pago usan versión/estado/importe observados.
El código y la tabla `Booking` ya están activos en el Compose local tras el corte autorizado.
En aquella entrega no se ejecutaron pruebas de aplicación ni carreras entre dos
conexiones. [Evidencia del corte](05-evidencia-local.md). La petición posterior
autoriza el [testing B2](06-testing-b2.md), donde se registra por separado la
verificación ejecutada y los límites del cierre local.

## Reglas financieras

- [x] Conservar comportamiento y pruebas de céntimos/impuestos al adaptar `quoteStay()`; aritmética exacta con BigInt y rechazo de resultados no representables.
- [x] Mantener el requisito previo a B1 de validar entradas y calcular sin pérdida productos, descuentos, impuestos y totales; verificar que los resultados sean representables en reservas, API y proveedor antes de guardar o habilitar pagos. No confiar en una comprobación posterior a aritmética ya redondeada ni imponer techos comerciales sin acuerdo.
- [x] Cotizar desde el snapshot completo de tarifa, limpieza, extras, mascota, impuestos y capacidad; los cambios posteriores del catálogo no recotizan el checkout abierto.
- [x] Calcular importes en servidor. EDITOR, BOOKING_MANAGER y el cliente público no pueden enviar un total que se guarde directamente.
- [x] Guardar quote solo si sigue pendiente y sin pago abierto, mediante transacción o actualización condicional atómica. Conflicto devuelve 409.

## Concurrencia y transiciones

- [x] Serializar por hospedaje los cambios que puedan confirmar ocupación. Bloquear la misma fila `Listing` y comprobar solapes dentro de la transacción antes de confirmar; bloquear solo una reserva no protege dos reservas distintas.
- [x] Todos los confirmadores actuales siguen ese camino; intervalos `[entrada, salida)` permiten salida/entrada el mismo día. Cualquier cambio futuro de fechas debe conservar esta regla; reprogramaciones fuera de alcance.
- [x] Mantener orden estable de bloqueos: hospedaje, reserva y registros asociados. Transacciones cortas y sin llamadas de red al proveedor de pagos.
- [x] Resolver cancelación y confirmación concurrentes en un estado válido; nunca reconfirmar una cancelada ni eliminar referencia de pago para «desbloquear» precio.
- [x] Separar cotización, asociación de pago, cancelación y confirmación, sin `updateBooking(Partial<Booking>)`. Contacto/notas del panel quedan para 3.4/C1.

Las funciones internas de pago no requieren cookie de personal: requieren evidencia
del proveedor y su camino de confianza, nunca un body con `status=confirmed`.

## Límite del proveedor de pagos

Apertura de pago necesita idempotencia por reserva y revalidación del importe.
El mock actual usa Map local al proceso y referencias deterministas por reserva;
no conserva evidencia al reiniciar ni garantiza idempotencia entre instancias.
No anunciar soporte de pagos multiinstancia sin resolver esa limitación.
No implementar un proveedor real como parte de esta fase.

## Verificación y cierre

- [x] Verificar snapshots estables tras modificar catálogo y rechazo de quote con pago abierto.
- [x] Verificar con dos conexiones reales que dos confirmaciones solapadas no ganan ambas.
- [x] Verificar pago repetido idempotente y pago tardío/cancelación sin reconfirmación, incluida la carrera en ambos órdenes.
- [x] Conservar las pruebas financieras existentes y añadir solo los huecos reales según la [verificación común](../comunes/verificacion-y-aceptacion.md).
- [x] Registrar la limitación del mock y mantener bloqueada cualquier afirmación de pagos reales/multiinstancia listos para producción.

Comandos, resultados y aceptación local: [testing B2](06-testing-b2.md).
No acredita producción ni cierra el plan 3 completo.
