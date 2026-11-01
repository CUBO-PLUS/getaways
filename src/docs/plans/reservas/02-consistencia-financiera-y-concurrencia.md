# [ ] Fase 3.2 — Consistencia financiera, snapshots y concurrencia

Dependencia: [fase 3.1](01-modelo-e-importacion.md).
[Plan 3 y checklist](README.md). Prerrequisito del corte B2 y de la gestión comercial.

## Reglas financieras

- [ ] Reutilizar `quoteStay()` y las pruebas actuales de céntimos/impuestos.
- [ ] Cotizar desde el snapshot completo antes de permitir edición de precios. Hoy solo la tarifa por noche se toma del booking; limpieza, extras, mascota e impuestos se vuelven a leer del hospedaje y cambiarían un checkout abierto.
- [ ] Calcular importes en servidor. EDITOR, BOOKING_MANAGER y el cliente público no pueden enviar un total que se guarde directamente.
- [ ] Guardar quote solo si sigue pendiente y sin pago abierto, mediante transacción o actualización condicional atómica. Conflicto devuelve 409.

## Concurrencia y transiciones

- [ ] Serializar por hospedaje los cambios que puedan confirmar ocupación. Bloquear la misma fila `Listing` y comprobar solapes dentro de la transacción antes de confirmar; bloquear solo una reserva no protege dos reservas distintas.
- [ ] Hacer que todos los confirmadores y futuros cambios de fechas sigan ese camino; intervalos `[entrada, salida)` permiten salida/entrada el mismo día.
- [ ] Mantener orden estable de bloqueos: hospedaje, reserva y registros asociados. Transacciones cortas y sin llamadas de red al proveedor de pagos.
- [ ] Resolver cancelación y confirmación concurrentes en un estado válido; nunca reconfirmar una cancelada ni eliminar referencia de pago para «desbloquear» precio.
- [ ] Separar operaciones concretas de contacto/notas, cotización, asociación de pago, cancelación y confirmación. No exponer `updateBooking(Partial<Booking>)` al panel.

Las funciones internas de pago no requieren cookie de personal: requieren evidencia
del proveedor y su camino de confianza, nunca un body con `status=confirmed`.

## Límite del proveedor de pagos

Apertura de pago necesita idempotencia por reserva y revalidación del importe.
El stub actual con Map y IDs temporales no la garantiza entre instancias.
No anunciar soporte de pagos multiinstancia sin resolver esa limitación.
No implementar un proveedor real como parte de esta fase.

## Verificación y cierre

- [ ] Verificar snapshots estables tras modificar catálogo y rechazo de quote con pago abierto.
- [ ] Verificar con dos conexiones reales que dos confirmaciones solapadas no ganan ambas.
- [ ] Verificar pago repetido idempotente y pago tardío/cancelación sin reconfirmación.
- [ ] Conservar las pruebas financieras existentes y añadir solo los huecos reales según la [verificación común](../comunes/verificacion-y-aceptacion.md).
- [ ] Registrar la limitación del mock y mantener bloqueada cualquier afirmación de pagos reales/multiinstancia listos para producción.
