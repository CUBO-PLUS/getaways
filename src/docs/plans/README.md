# Planes de cuentas, reservas y administración

Estado: **plan 1 aceptado por la persona solicitante el 2026-11-03, con excepciones operativas pendientes**;
**plan 2 implementado y migrado localmente el 2026-11-04**, sin testing por petición
expresa; código de 3.1–3.3 implementado, revisado y **migrado al Compose local**
el 2026-11-04, con cero reservas iniciales por confirmación de la persona solicitante.
**Fases 3.1–3.3 / B2 cerradas y aceptadas para el entorno local el 2026-11-05 UTC**
por la persona solicitante tras el [testing funcional/concurrencia](reservas/06-testing-b2.md).
Se conserva como excepción operativa el ensayo pendiente de restauración del respaldo
fresco; no certifica producción ni pagos reales. **H está implementada, verificada
y migrada al Compose local el 2026-11-05 UTC**, con corte autorizado por la persona
solicitante; **H aceptada y cerrada para el entorno local el 2026-11-05** por petición
«marcalo como completada». **T/P tienen implementación y revisión técnica; sus
cambios están sin commit en `feature/btcpay-testnet-reservas`, en el directorio
original. Pagos fue migrado y activado localmente contra BTCPay testnet4 el
2026-11-07 UTC**, con autorización; falta aceptación del recorrido pagado.
[Evidencia y pendientes](pagos/README.md). **3.4 está implementada y verificada con
Luna**, disponible en esa rama sin aceptación C1;
[evidencia](reservas/04-panel-reservas.md#implementación-y-evidencia-técnica--2026-11-05). Plan 4 sigue
pendiente. La prioridad es un
recorrido local de reserva y pago en testnet asociado a una cuenta de huésped.
Inventario de referencia: 2026-10-31.

**Cambio de infraestructura — 2026-11-06:** por petición de la persona solicitante,
BTCPay se consume desde `https://btcpay.mauriciodmo.com`. El stack y sus cinco
volúmenes BTCPay locales fueron eliminados sin tocar PostgreSQL/RustFS de la app.
Los Compose de pagos se retiraron; no reiniciar el stack BTCPay local.
La API del VPS aprobó sincronización, verificación de wallet/red y preflight remoto
en la comprobación del 2026-11-07 01:17 UTC. La prueba privada dura diez minutos y
requiere renovación. Falta el recorrido pagado de testnet y su aceptación;
esta comprobación no acepta automáticamente T/P.

**Activación local autorizada — 2026-11-07 UTC:** se verificó el respaldo reciente
y se creó un dump PostgreSQL previo adicional. Las dos migraciones pendientes
aprobaron, conservando exactamente las 17 tablas existentes; `PaymentAttempt`
quedó vacía. Esquema/marcador verificados y segunda aplicación sin operaciones.
La app de `http://localhost:3000` usa `btcpay-testnet` con la tienda actual del VPS;
Core testnet4 se comprobó por su génesis, no solo por una dirección `tb1`.
La reserva que ya tenía referencia mock se conservó: para evaluar una nueva factura
se necesita otra reserva. No se abrió una factura, confirmó un pago ni creó un commit.

**Cambio de importe autorizado — 2026-11-07 UTC:** tras comprobar que USD 0.01
equivale a unos 13 satoshis y no alcanza el umbral on-chain de la wallet, la persona
solicitante autorizó **USD 1.00 de testnet para nuevos intentos** («colocalo a un
dolar mejor»). Se mantienen el precio real de la estancia y los intentos antiguos
de un centavo, sin reescribirlos ni crearles una factura de reemplazo.

**Seguimiento posterior:** la persona solicitante autoriza el testing de la fase
actual 3.1–3.3/B2. Comandos, resultados y límites en
[testing B2](reservas/06-testing-b2.md); las restricciones históricas de no testing
no impiden esta verificación y no se convierten en evidencia de pruebas anteriores.

**Actualización de alcance — 2026-11-04:** completar el plan 2 en el Compose local
con subagentes Luna y **sin crear ni ejecutar tests, lint, typecheck o build** por
petición de la persona solicitante. La ruta abreviada es respaldo fresco → inventario
→ importación transaccional → comparación fuente/destino y bytes → lectores PostgreSQL.
No repetir la migración de esquema ya aplicada ni construir paneles de preparación,
aprobaciones por ficha o infraestructura nueva. Esta excepción sustituye los ensayos
y recorridos de pruebas del plan 2 para esta entrega local; no acredita producción,
recuperación ensayada ni autoriza pagos reales. La evidencia se registra en
[el cierre de catálogo](catalogo-y-medios/04-evidencia-local.md).

Este índice actualiza el orden y el alcance acordados. Los planes detallados y las
guías comunes conservan sus controles y evidencia, pero aún describen el alcance
anterior: donde excluyen cuentas de huéspedes o BTCPay en testnet, prevalece este
índice. No se autoriza por ello cobrar en mainnet ni omitir respaldos, verificaciones
o aprobaciones de migración.

## Orden de ejecución y seguimiento

Marcar una fase solo después de registrar su verificación y aceptación; marcar el
plan cuando estén aceptadas todas sus fases y su entrega. Los checks completados
conservan la aceptación anterior y no certifican los nuevos alcances.

- [x] **Preparación común:** cerrada para continuar el trabajo local; verificada la app, PostgreSQL, RustFS y el marcador el 2026-11-03. Coolify aún no existe: esta aceptación no declara listo el futuro despliegue; revisar allí servicios y respaldos antes del corte.
- [x] **Plan 1 — [Usuarios, roles y acceso al panel](user-and-roles/README.md).** Aceptado por la persona solicitante con las excepciones operativas registradas en su README; no equivale a declarar listo un corte/despliegue.
  - [x] 1.1 — Usuarios, contrato, migración y aprovisionamiento.
  - [x] 1.2 — Autenticación común y sesiones revocables.
  - [x] 1.3 — Panel de usuarios y autorización del blog.
- [x] **Plan 2 — [Persistencia del catálogo y medios](catalogo-y-medios/README.md).** Implementación y migración local completadas: 11 hospedajes, 114 imágenes y 6 términos; [evidencia](catalogo-y-medios/04-evidencia-local.md). Sin testing ni certificación de despliegue; no habilita administración comercial.
  - [x] 2.1 — Modelo y contrato del catálogo.
  - [x] 2.2 — Importación verificada de hospedajes y medios.
  - [x] 2.3 — Lectores públicos, checkout y acceso a medios sobre PostgreSQL.
- [x] **Fase H — [Cuentas de huéspedes](huespedes/README.md).** Implementada con subagentes Luna, verificada, migrada y aceptada localmente el 2026-11-05 por petición «marcalo como completada». Registro, sesiones y reservas propias separados del personal; respaldo final y 16 tablas previas preservadas. No habilita producción.
- [ ] **Fase T — Infraestructura BTCPay.** Compose local verificado previamente y ahora retirado por petición; destino actual VPS del operador por HTTPS. Sincronización y preflight remotos aprobados en la comprobación registrada. [Evidencia y límites](pagos/README.md). Pendiente aceptación/corte; no se da por cerrada.
- [ ] **Plan 3 — [Persistencia y gestión de reservas](reservas/README.md).** Requiere el plan 2; el recorrido de huéspedes incorpora además la fase H.
  **Implementación y corte local 3.1–3.3 completados**, integrados en el checkout original
  y activos sobre PostgreSQL; [evidencia](reservas/05-evidencia-local.md).
  [Testing técnico B2 completado](reservas/06-testing-b2.md), con recorrido mock y
  carreras reales sobre PostgreSQL desechable. **Aceptación local registrada** por
  petición «cierra en @src/docs/plans/», con la excepción de restauración indicada
  arriba. El plan 3 completo no se cierra: falta aceptar y habilitar 3.4/C1 después
  del recorrido operativo H/T/P; su implementación aislada ya está verificada.
  - [x] 3.1 — Modelo e importación privada de reservas.
  - [x] 3.2 — Consistencia financiera, snapshots y concurrencia.
  - [x] 3.3 — Adaptación de entradas, corte a PostgreSQL y verificación. **Hito B2 de persistencia aceptado localmente.**
  - [ ] **Fase P — Integración de reservas y pagos BTCPay en testnet.** Código y revisión técnica con Luna completados; cargo de prueba nuevo autorizado: USD 1.00. [Evidencia y límites](pagos/README.md). Falta el recorrido con fondos de testnet, payabilidad del nuevo importe y corte autorizado; no acredita cobro real.
  - [ ] 3.4 — Panel operativo de reservas: implementado y revisado con Luna, 27 integraciones y recorrido de navegador aprobados en aislamiento. [Evidencia](reservas/04-panel-reservas.md#implementación-y-evidencia-técnica--2026-11-05). Pendientes aceptación/corte C1; no acepta P ni habilita el corte antes del recorrido prioritario.
- [ ] **Plan 4 — [Administración de hospedajes](gestion-hospedajes/README.md).** Mantenerlo después del recorrido prioritario. Sus dependencias funcionales siguen siendo los planes 1–2 y B2, no el panel 3.4.
  - [ ] 4.1 — Gestión editorial y permisos por campo.
  - [ ] 4.2 — Gestión comercial de ADMIN.
  - [ ] 4.3 — Ciclo de vida, eliminación protegida y aceptación integrada.

```text
Preparación → Plan 1 → Plan 2 → 3.1 → 3.2 → 3.3/B2 ─┐
                    ├→ H: cuentas de huéspedes ──────┼→ P: reserva + pago testnet
                    └→ T: BTCPay local ──────────────┘          │
                                                                ├→ 3.4 Panel de reservas
                                                                └→ Plan 4: administración
```

Tras P, las fases 3.4 y el plan 4 pueden implementarse y entregarse sin esperar una
a la otra. Coordinar cambios en contrato y migraciones: partir siempre del destino
aprobado anterior, no generar/aplicar ramas incompatibles.

La edición meramente descriptiva podría adelantarse tras el plan 2, pero **no se
adopta ese corte en este orden**: exigiría aceptación y despliegue parciales
explícitos, sin precios, cambios de estado comercial ni borrados.

## Fase H — Cuentas de huéspedes

- [x] Crear registro con nombre, correo único normalizado y contraseña; inicio y cierre de sesión. Reutilizar los mecanismos de seguridad existentes sin conceder roles ni acceso de personal al registrarse.
- [x] Almacenar contraseñas con hash seguro; proteger sesiones, origen y accesos de fuerza bruta. Mantener bloqueadas las cuentas fuera del entorno local hasta definir recuperación de acceso.
- [x] Asociar cada reserva nueva a la cuenta autenticada en el servidor y ofrecer una vista de sus propias reservas y pagos. Autorizar cada consulta y mutación por propietario; no aceptar un ID de usuario enviado por el cliente como prueba de propiedad.
- [x] No asociar reservas anteriores automáticamente solo por coincidencia de correo. Conservar la credencial de checkout para históricos sin propietario; las nuevas exigen también la sesión del propietario, sin exponer reservas ajenas.

**H cerrada y aceptada localmente el 2026-11-05** por petición explícita
«marcalo como completada»: ver [evidencia, migración y límites](huespedes/README.md).
El corte local autorizado
con «bien» ya se completó tras las pruebas de integración. Registro, acceso y
checkout local están disponibles en `http://localhost:3001`; no se crearon datos
sintéticos en la base operativa. La recuperación de cuentas sigue pendiente antes
de habilitar su uso fuera del entorno local; T/P permanecen fuera de este cierre.

## Fase T — Infraestructura local de prueba

- [ ] Integrar en Docker Compose local BTCPay Server, NBXplorer y Bitcoin Core en **testnet**, con el perfil `opt-save-storage-xxs` y los servicios necesarios para su funcionamiento. Mantener la app, PostgreSQL y RustFS existentes.
- [ ] Usar volúmenes persistentes para nodo, BTCPay y sus datos; configurar secretos fuera del repositorio y mantener RPC y servicios internos sin exposición pública innecesaria.
- [ ] Configurar una URL de BTCPay accesible desde el navegador y conectividad entre servicios para API y webhooks; verificar las restricciones de destinos privados de BTCPay sin abrir excepciones generales.
- [ ] Comprobar red, sincronización, tienda, wallet y acceso antes de probar. La poda XXS conserva aproximadamente 5 GB de bloques y **no se recomienda para Lightning**; el alcance inicial es Bitcoin on-chain.
- [ ] Usar una versión soportada y actualizada; revisar el [aviso de seguridad de BTCPay](https://blog.btcpayserver.org/btcpay-server-security-incident-2-4-1-and-earlier/) antes de usar una instancia existente. Esto no configura ni autoriza despliegue en Coolify.

## Fase P — Reserva y pago de prueba

- [ ] Antes de habilitar pagos, verificar el requisito previo a B1 de entradas y totales exactos y representables en reservas, API y proveedor; rechazar los no representables sin establecer límites comerciales arbitrarios.
- [ ] Exigir registro o inicio de sesión para el nuevo recorrido; crear la reserva pendiente con propietario, fechas, condiciones y precio calculados en servidor. Conservar referidos y snapshots.
- [ ] Crear una factura BTCPay de **USD 1.00** por cada nuevo intento de prueba, independientemente del precio de la estancia. Guardar el precio real y el importe de prueba por separado y mostrar claramente que el pago es de prueba en testnet. Conservar el importe original de los intentos históricos de USD 0.01.
- [ ] Aislar datos y configuración de prueba, comprobar que app, BTCPay y nodo usan testnet y bloquear el importe fijo y el flujo de prueba en mainnet. Una prueba pagada no acredita que se haya cobrado el precio real.
- [ ] Persistir referencias y estado de los intentos; evitar facturas duplicadas y reconciliar resultados inciertos antes de reintentar. No mantener una transacción de base abierta durante llamadas de red.
- [ ] Verificar la firma de las notificaciones de BTCPay, relacionarlas con la factura y tienda esperadas y procesarlas de forma idempotente. Confirmar solo con evidencia válida de pago liquidado; reconciliar notificaciones perdidas o fuera de orden.
- [ ] Mantener la protección contra reservas solapadas y tratar pagos parciales, vencidos, tardíos, cancelaciones y conflictos de disponibilidad como casos explícitos de revisión; no reconfirmar una reserva cancelada ni afirmar un reembolso no realizado.
- [ ] Probar de extremo a extremo con fondos de testnet: dos usuarios aislados, creación de reserva, factura, pago, confirmación e historial. Cubrir notificaciones duplicadas o inválidas y pagos tardíos, además de los controles financieros y de concurrencia existentes.
- [x] Registrar el bloqueo de USD 0.01 por el umbral de polvo on-chain y consultar antes de cambiarlo: la persona solicitante autorizó USD 1.00 para nuevos intentos.
- [ ] Verificar que USD 1.00 sea pagable con las reglas y comisiones on-chain de testnet. Si no lo es, registrar el bloqueo y consultar antes de volver a cambiar el importe.

**Aceptación del recorrido prioritario:** cuenta propia, reserva persistida y factura
de prueba asociadas; pago confirmado mediante BTCPay y acceso del huésped limitado a
sus propios datos; datos de prueba y precio real diferenciados. No acredita operación
con dinero real.

## Controles que acompañan cada fase

- [ ] Aplicar y registrar las comprobaciones pertinentes de [verificación y aceptación](comunes/verificacion-y-aceptacion.md), sin esperar al final.
- [ ] Ensayar respaldo, corte y recuperación de cada entrega según [transición y recuperación](comunes/transicion-y-recuperacion.md).
- [ ] Registrar por entrega comandos/resultados, versión, marcador de migración, responsable y pendientes. Ningún checkbox sustituye la evidencia.
- [ ] Registrar evidencia específica de H, T y P, incluida la comprobación de testnet, aislamiento de cuentas, reconciliación y recuperación; no dar por aceptadas esas fases por completar B2.

Estos documentos son guías transversales, no planes adicionales ni fases finales.
Cada README identifica sus criterios y corte: A (identidad), B1 (catálogo), B2
(reservas persistidas), C1 (panel de reservas) y C2 (administración de hospedajes).

## Reglas y alcance comunes

Todas las rutas de código y comandos son relativos a `src/`. Los archivos y comandos
propuestos todavía no existen necesariamente. Migraciones e importaciones requieren
aprobación, respaldo y primera ejecución sobre una base aislada.

- Roles del personal de una sola asignación: **ADMIN**, **EDITOR**, **BOOKING_MANAGER**.
  La [matriz común](comunes/00-inventario-y-permisos.md) define los permisos; no se
  crea un motor configurable ni roles múltiples sin una necesidad confirmada. Las
  cuentas de huéspedes no reciben permisos de personal.
- Autorizar cada lectura protegida y mutación en servidor; no confiar en navegación.
- Reutilizar `jose`, `bcryptjs`, el cliente PostgreSQL y las reglas existentes.
- Conservar referidos, blog, migraciones, IDs e historial; nunca cascadas a reservas/pagos.
- No escribir operaciones en JSON fuente ni mantener fallbacks/dual-write improvisados.
- Catálogo y disponibilidad agregada siguen públicos. El nuevo recorrido de reserva
  y pago requiere sesión de huésped; la sesión de personal no sustituye su autorización.
- BTCPay en testnet es requisito del recorrido prioritario; el mock permanece solo
  como herramienta de desarrollo, no como evidencia de pago. Mainnet queda fuera de
  esta entrega. No se requieren SSO, MFA, auditoría avanzada ni reembolsos automáticos;
  la recuperación de cuentas queda por definir antes del uso fuera del entorno local.
- El catálogo persistido debe permitir la futura administración de hospedajes y medios:
  preservar IDs, relaciones y precios históricos. Los cambios comerciales posteriores
  no recotizan reservas ni facturas ya abiertas.
- Los **nueve artículos y sus imágenes ya se importaron en el entorno local**; ese
  resultado no demuestra el estado de otros destinos. Ninguna nueva importación queda
  autorizada por estos planes. El lector público del blog ya consulta PostgreSQL.

## Antecedentes y límites de la evidencia

`feature/blog-editorial` se integró en `main` por fast-forward hasta `9e2871b`.
La planificación previa revisó código, pruebas y guías locales de Next.js 16.4.2;
antes de implementar, volver a verificar versiones y documentación correspondiente.

- Prisma CLI `8.0.0-rc.23`, runtime `@prisma/orm-postgres@8.0.0-rc.18`.
- Blog: `jose ^6.2.14`, `bcryptjs ^3.0.3`.
- Next.js: `node_modules/next/dist/docs/01-app/02-guides/authentication.md`,
  `data-security.md` y referencia de `cookies`.
- Prisma: `.agents/skills/prisma-8/references/contract.md`, `migrations.md`,
  `migration-model.md` y `queries-postgres.md`.
- [Claims en jose 6.2.14](https://github.com/panva/jose/blob/v6.2.14/docs/types/interfaces/JWTClaimVerificationOptions.md).
- [Seguridad y API de bcryptjs](https://github.com/dcodeIO/bcrypt.js#security-considerations).
- [Plan previo del blog](blog/propuesta-original.md) y
  [revisión editorial](blog/revision-editorial.md).

El worktree del blog conserva cambios locales no incluidos en el merge:
`src/compose.dev.yaml` y `src/docs/levantamiento-local-20261031.md`. No descartarlos
ni incorporarlos automáticamente. El registro histórico describía una base sin
artículos; la línea base del 2026-11-02 confirma nueve artículos en la base local,
sin afirmar el estado de otros destinos.

Consultar la evidencia de línea base y registrar las verificaciones y restauraciones
de cada implementación; actualizar el checklist de fase y el de este índice.
