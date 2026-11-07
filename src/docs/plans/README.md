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
«marcalo como completada». **T/P, 3.4/C1 y el plan 3 quedan cerrados y aceptados
para el entorno local el 2026-11-07**, tras la verificación de la persona solicitante
y su petición «cierra lo que queda pendiente». Pagos está migrado y activado contra
BTCPay testnet4; la reserva 2 quedó confirmada con un pago liquidado de USD 1.00
de testnet. [Evidencia y excepciones](pagos/README.md#cierre-local-aceptado--2026-11-07).
El panel operativo está aceptado; [evidencia y límites](reservas/04-panel-reservas.md).
**El plan 4 está implementado localmente desde el 2026-11-07 y pendiente de aceptación**
([evidencia](gestion-hospedajes/README.md#implementación-y-evidencia-técnica--2026-11-07)); el checkout
toma ya nombre, correo y teléfono opcional de la cuenta del huésped. El cierre local
no acredita webhook automático, restauración ensayada ni producción/mainnet.
Inventario de referencia: 2026-10-31.

**Cambio de infraestructura — 2026-11-06:** por petición de la persona solicitante,
BTCPay se consume desde `https://btcpay.mauriciodmo.com`. El stack y sus cinco
volúmenes BTCPay locales fueron eliminados sin tocar PostgreSQL/RustFS de la app.
Los Compose de pagos se retiraron; no reiniciar el stack BTCPay local.
La API del VPS aprobó sincronización, verificación de wallet/red y preflight remoto
en la comprobación del 2026-11-07 01:17 UTC. La prueba privada dura diez minutos y
requiere renovación. Esa comprobación por sí sola no aceptó T/P; el pago y la
aceptación posteriores se registran en el cierre local del 2026-11-07.

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
- [x] **Fase T — Infraestructura BTCPay.** Aceptada localmente el 2026-11-07 con el VPS por HTTPS como destino vigente; no reinstalar el stack local retirado. Red, sincronización, tienda, wallet y preflight verificados. [Evidencia y excepciones](pagos/README.md#cierre-local-aceptado--2026-11-07): callback automático y recuperación siguen pendientes.
- [x] **Plan 3 — [Persistencia y gestión de reservas](reservas/README.md).** Cerrado y aceptado localmente el 2026-11-07, con excepciones operativas explícitas; requiere el plan 2 y la fase H para huéspedes.
  **Implementación y corte local 3.1–3.3 completados**, integrados en el checkout original
  y activos sobre PostgreSQL; [evidencia](reservas/05-evidencia-local.md).
  [Testing técnico B2 completado](reservas/06-testing-b2.md), con recorrido mock y
  carreras reales sobre PostgreSQL desechable. **Aceptación local registrada** por
  petición «cierra en @src/docs/plans/», con la excepción de restauración indicada
  arriba. El cierre posterior de P y 3.4/C1 incorpora el recorrido pagado de testnet
  y la aceptación funcional de la persona solicitante; no certifica producción.
  - [x] 3.1 — Modelo e importación privada de reservas.
  - [x] 3.2 — Consistencia financiera, snapshots y concurrencia.
  - [x] 3.3 — Adaptación de entradas, corte a PostgreSQL y verificación. **Hito B2 de persistencia aceptado localmente.**
  - [x] **Fase P — Integración de reservas y pagos BTCPay en testnet.** Aceptada localmente el 2026-11-07: USD 1.00 liquidado y reserva 2 confirmada mediante reconciliación autoritativa. [Evidencia y excepciones](pagos/README.md#cierre-local-aceptado--2026-11-07). No acredita cobro del precio real ni notificaciones automáticas.
  - [x] 3.4 — Panel operativo de reservas / C1: implementado, verificado y aceptado localmente el 2026-11-07 tras la revisión de la persona solicitante. Incluye refresco manual del pago sin omitir controles financieros. [Evidencia y excepciones](reservas/04-panel-reservas.md).
- [ ] **Plan 4 — [Administración de hospedajes](gestion-hospedajes/README.md).** Implementado localmente el 2026-11-07, con pruebas sobre PostgreSQL desechable; pendiente del recorrido en navegador, el corte C2 y la aceptación. Sus dependencias funcionales siguen siendo los planes 1–2 y B2, no el panel 3.4.
  - [ ] 4.1 — Gestión editorial y permisos por campo.
  - [ ] 4.2 — Gestión comercial de ADMIN.
  - [ ] 4.3 — Ciclo de vida, eliminación protegida y aceptación integrada.

```text
Preparación → Plan 1 → Plan 2 → 3.1 → 3.2 → 3.3/B2 ─┐
                    ├→ H: cuentas de huéspedes ──────┼→ P: reserva + pago testnet
                    └→ T: BTCPay VPS ────────────────┘          │
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

## Fase T — Infraestructura de prueba aceptada localmente

El cambio autorizado al VPS sustituye el requisito de mantener BTCPay en Compose
local. Las comprobaciones del stack retirado quedan como evidencia histórica, no
como tareas de reinstalación ni certificación de la infraestructura interna del VPS.

- [x] Consumir BTCPay por HTTPS desde la app local, conservando PostgreSQL/RustFS y retirando el stack BTCPay local según lo solicitado.
- [x] Mantener secretos fuera de Git y comprobar origen, tienda, wallet, sincronización y red testnet4; preflight firmado con vigencia máxima de diez minutos.
- [x] Registrar comprobaciones de versión y seguridad del stack ensayado y del preflight remoto; Bitcoin on-chain, sin habilitar Lightning, mainnet ni despliegue de la app en Coolify.
- [ ] Habilitar callback HTTPS público y secreto de webhook; no hay entrega automática operativa acreditada. La reconciliación explícita es el alcance local aceptado.

## Fase P — Reserva y pago de prueba

- [x] Verificar entradas y totales exactos y representables en reservas, API y proveedor; evidencia técnica B2/P registrada.
- [x] Exigir sesión de huésped y calcular en servidor propietario, fechas, condiciones y precio; conservar referidos y snapshots. Evidencia H/P registrada.
- [x] Crear facturas de **USD 1.00** para nuevos intentos, separadas del precio real; conservar intentos históricos de USD 0.01 y mostrar Testnet.
- [x] Verificar testnet y bloquear producción/mainnet para este cargo fijo; no equivale al cobro del precio real.
- [x] Persistir intentos/referencias, impedir duplicados y reconciliar resultados inciertos sin transacciones abiertas durante llamadas de red; pruebas PostgreSQL/HTTP registradas.
- [x] Implementar y probar firma, identidad e idempotencia del webhook y reconciliación autoritativa; confirmación liquidada verificada para la reserva 2. La entrega automática real sigue pendiente en T.
- [x] Verificar solapamientos, pagos parciales/tardíos, cancelación y revisión financiera; pruebas aisladas registradas, sin atribuir todos estos casos al pago real del VPS.
- [ ] Probar de extremo a extremo con fondos de testnet: dos usuarios aislados, creación de reserva, factura, pago, confirmación e historial. Cubrir notificaciones duplicadas o inválidas y pagos tardíos, además de los controles financieros y de concurrencia existentes.
- [x] Registrar el bloqueo de USD 0.01 por el umbral de polvo on-chain y consultar antes de cambiarlo: la persona solicitante autorizó USD 1.00 para nuevos intentos.
- [x] Verificar que USD 1.00 sea pagable: factura liquidada en testnet y reserva 2 confirmada. No garantiza pagabilidad futura con cualquier cotización/comisión.

**Aceptación del recorrido prioritario:** cuenta propia, reserva persistida y factura
de prueba asociadas; pago confirmado mediante BTCPay y acceso del huésped limitado a
sus propios datos; datos de prueba y precio real diferenciados. No acredita operación
con dinero real.

**Cierre local aceptado — 2026-11-07:** la persona solicitante confirmó «ya hice mi
verificacion y me parece bien todo» y pidió cerrar los pendientes. Se aceptan T/P,
3.4/C1 y el plan 3 con las excepciones operativas no ejecutadas: webhook público,
recorrido real con dos cuentas, ensayo de restauración del respaldo fresco y
controles transversales aún abiertos. El aislamiento de cuentas y casos financieros
tienen evidencia automatizada aislada, no un segundo pago real. No se repiten
migraciones ni pagos para corregir este seguimiento. Referencia del árbol antes de
esta actualización documental: `0decd80`; responsable de aceptación: persona solicitante.

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
- BTCPay en testnet es requisito del recorrido prioritario; el proveedor mock y su
  acción de simulación se retiraron. Las referencias históricas no se convierten.
  Mainnet queda fuera de esta entrega. No se requieren SSO, MFA, auditoría avanzada ni reembolsos automáticos;
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
