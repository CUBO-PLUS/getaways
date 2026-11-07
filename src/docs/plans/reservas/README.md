# [x] Plan 3 — Persistencia y gestión de reservas

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
El corte original no ejecutó pruebas de aplicación/concurrencia ni aceptó producción. El testing
posterior sí está completado sobre PostgreSQL desechable y con recorrido de
navegador mock: [resultados finales](06-testing-b2.md#resultado-final-repetido-por-el-controlador).
No falta migración local y no se habilitan pagos reales.
La restricción de no tests correspondía a aquella entrega. Una petición posterior
autoriza ahora el testing de B2; resultados y límites en
[06-testing-b2.md](06-testing-b2.md), sin atribuirlos retroactivamente al corte.
Seguimiento solicitado: corregidos los 23 errores anteriores de TypeScript con
otro subagente Luna; typecheck completo aprobado con salida 0, sin supresiones.
La persona solicitante confirmó además que no hay reservas pendientes.

**Cierre local aceptado — 2026-11-05 UTC:** tras revisar los resultados, la persona
solicitante pidió «cierra en @src/docs/plans/». Quedan cerradas **3.1, 3.2, 3.3 y B2**,
con el ensayo de restauración del respaldo fresco como excepción operativa pendiente.
No se da por ejecutado ese ensayo ni se certifican producción o pagos reales.
En aquel cierre quedaron fuera 3.4/C1 y T/P; su aceptación posterior se registra abajo.
**Actualización técnica 2026-11-05:** 3.4 implementada y revisada con Luna en un
worktree aislado; 27 integraciones PostgreSQL y recorrido de navegador aprobados.
[Evidencia y límites](04-panel-reservas.md#implementación-y-evidencia-técnica--2026-11-05).
T/P también tienen [implementación y verificación técnica](../pagos/README.md).

**Cierre del plan 3 aceptado — 2026-11-07:** tras comunicar «ya hice mi verificacion
y me parece bien todo», la persona solicitante pidió «cierra lo que queda pendiente».
Se acepta **3.4/C1 local** y se cierra el plan 3 junto con T/P: pagos migrados y
activos, reserva 2 confirmada tras pago liquidado de USD 1.00 de testnet y panel
operativo disponible con refresco manual del pago. [Evidencia del recorrido y
excepciones](../pagos/README.md#cierre-local-aceptado--2026-11-07).
No se atribuyen a esta aceptación pruebas nuevas, entrega automática de webhooks,
recorrido pagado real con dos cuentas ni ensayo de recuperación. El plan 4 continúa
pendiente; el cierre es local y conserva las excepciones operativas indicadas abajo.

No habilita cobros en mainnet, reembolsos automáticos, reprogramaciones,
reservas manuales ni cambios arbitrarios de importes/estados.

## Fases

- [x] **3.1 — [Modelo e importación privada](01-modelo-e-importacion.md).** Reservas, snapshots e importador privado ensayado. Requiere plan 2.
- [x] **3.2 — [Consistencia financiera y concurrencia](02-consistencia-financiera-y-concurrencia.md).** Cotizaciones estables y transiciones atómicas. Requiere 3.1.
- [x] **3.3 — [Entradas, corte y verificación](03-entradas-corte-y-verificacion.md).** Todos los lectores/escritores en PostgreSQL, importación final y comprobación multiinstancia de persistencia; no del proveedor mock. Requiere 3.2. **B2 aceptado localmente.**
- [x] **3.4 — [Panel de reservas](04-panel-reservas.md).** ADMIN/BOOKING_MANAGER consultan, corrigen contacto, anotan y cancelan. C1 aceptado localmente el 2026-11-07 con excepciones operativas; no requiere el plan 4.

Para el orden actualizado prevalece el índice raíz: 3.4 se entrega **después** de
las fases H/T/P del recorrido prioritario, no automáticamente al implementar B2.

La importación de 3.1 se ensaya en entorno aislado. El corte de la fuente operativa
solo ocurre al aceptar 3.3; no se entregan stores mixtos durante 3.1–3.2.

## Aceptación y entregas

- [x] **B2 local:** importación reconciliada, IDs/sesiones/referidos intactos y fuente única PostgreSQL; snapshots y concurrencia verificados. Aceptado con la excepción operativa indicada arriba.
- [x] Registrar aceptación B2 antes de iniciar la implementación del plan 4. Su ejecución sigue después de H/T/P según el índice raíz.
- [x] **C1 local:** panel operativo autorizado, paginado y con permisos y controles financieros verificados en aislamiento; aceptación funcional registrada el 2026-11-07.
- [x] Ejecutar los controles aplicables a B2 de reservas, dinero, carreras y privacidad de la [verificación común](../comunes/verificacion-y-aceptacion.md).
- [x] Ejecutar el corte local B2 con respaldo y ensayo previo en clon; [evidencia](05-evidencia-local.md).
- [ ] Ensayar restauración del respaldo fresco de B2: excepción operativa del cierre local, pendiente antes de certificar recuperación para otro destino.
- [x] Registrar habilitación y aceptación funcional local C1, sin migración nueva ni repetición del corte B2/P.
- [ ] Completar el ensayo formal de recuperación C1 de [transición y recuperación](../comunes/transicion-y-recuperacion.md): excepción operativa, no acreditada por la aceptación funcional.

El plan 4 depende de B2, **no de completar 3.4/C1**. Tras B2 ambos trabajos pueden
avanzar sin dependencia funcional entre sí, coordinando archivos y migraciones.
Las referencias mock históricas se conservan; el proveedor de simulación se retiró.
Este cierre no habilita cobros en mainnet ni certifica producción.
