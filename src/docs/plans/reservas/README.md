# [ ] Plan 3 — Persistencia y gestión de reservas

[Orden general y seguimiento](../README.md).

## Objetivo y dependencias

Sustituir memoria/archivo por PostgreSQL, preservar checkout y referidos, mantener
condiciones económicas acordadas y habilitar operación limitada de reservas.
Requiere el **plan 2 completo** y la identidad del plan 1.

**Avance local — 2026-11-04:** 3.1 implementada con subagentes Luna, ensayada
en un clon PostgreSQL y posteriormente migrada al Compose local autorizado:
migración aditiva, importación privada y preservación de las tablas anteriores.
Código de 3.2–3.3 implementado,
con correcciones de consistencia/recibos/privacidad aplicadas. Revisión global de
Luna: **especificación y calidad aprobadas, sin hallazgos importantes**; no acredita
comportamiento de aplicación/concurrencia que no se ejecutó.
**Corte local B2 ejecutado:** código integrado en el checkout original, app reiniciada
y conectada a `gateways`; cero reservas importadas, siguiente ID 1, sin huérfanos y
15 tablas previas intactas. La persona solicitante autorizó continuar la migración
y confirmó ausencia de datos de reservas. [Evidencia y límites](05-evidencia-local.md).
Las casillas de aceptación de entrega se mantienen pendientes; el corte original
no ejecutó pruebas de aplicación/concurrencia ni aceptó producción. El testing
posterior sí está completado sobre PostgreSQL desechable y con recorrido de
navegador mock: [resultados finales](06-testing-b2.md#resultado-final-repetido-por-el-controlador).
No falta migración local y no se habilitan pagos reales.
La restricción de no tests correspondía a aquella entrega. Una petición posterior
autoriza ahora el testing de B2; resultados y límites en
[06-testing-b2.md](06-testing-b2.md), sin atribuirlos retroactivamente al corte.
Seguimiento solicitado: corregidos los 23 errores anteriores de TypeScript con
otro subagente Luna; typecheck completo aprobado con salida 0, sin supresiones.
La persona solicitante confirmó además que no hay reservas pendientes.

No implementa proveedor de pagos real, reembolsos automáticos, reprogramaciones,
reservas manuales ni cambios arbitrarios de importes/estados.

## Fases

- [ ] **3.1 — [Modelo e importación privada](01-modelo-e-importacion.md).** Reservas, snapshots e importador privado ensayado. Requiere plan 2.
- [ ] **3.2 — [Consistencia financiera y concurrencia](02-consistencia-financiera-y-concurrencia.md).** Cotizaciones estables y transiciones atómicas. Requiere 3.1.
- [ ] **3.3 — [Entradas, corte y verificación](03-entradas-corte-y-verificacion.md).** Todos los lectores/escritores en PostgreSQL, importación final y comprobación multiinstancia. Requiere 3.2. **Cierra el hito de persistencia B2.**
- [ ] **3.4 — [Panel de reservas](04-panel-reservas.md).** ADMIN/BOOKING_MANAGER consultan, corrigen contacto, anotan y cancelan. Requiere 3.3; no requiere el plan 4.

Para el orden actualizado prevalece el índice raíz: 3.4 se entrega **después** de
las fases H/T/P del recorrido prioritario, no automáticamente al implementar B2.

La importación de 3.1 se ensaya en entorno aislado. El corte de la fuente operativa
solo ocurre al aceptar 3.3; no se entregan stores mixtos durante 3.1–3.2.

## Aceptación y entregas

- [ ] **B2:** importación reconciliada, IDs/sesiones/referidos intactos y fuente única PostgreSQL; snapshots y concurrencia verificados.
- [ ] Registrar aceptación B2 antes de iniciar la implementación del plan 4. No basta crear tablas o marcar 3.1.
- [ ] **C1:** panel operativo autorizado, paginado y sin filtración de datos personales ni controles financieros arbitrarios.
- [ ] Ejecutar controles de reservas, dinero, carreras y privacidad de la [verificación común](../comunes/verificacion-y-aceptacion.md).
- [ ] Ensayar cortes **B2 y C1** de [transición y recuperación](../comunes/transicion-y-recuperacion.md), cada uno al habilitar su alcance.

El plan 4 depende de B2, **no de completar 3.4/C1**. Tras B2 ambos trabajos pueden
avanzar sin dependencia funcional entre sí, coordinando archivos y migraciones.
Persistir reservas no vuelve persistente al mock de pagos ni habilita pagos reales.
