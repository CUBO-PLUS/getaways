# Fase H — Cuentas de huéspedes

Implementación local del 2026-11-05 UTC con subagentes **GPT-6 Luna**. No incluye
BTCPay (T/P), administración de reservas (3.4) ni recuperación de cuentas pública.
**Corte local autorizado y completado**, con respaldo final, preservación y smoke
sin escrituras sintéticas. **Entrega aceptada y cerrada para el entorno local el
2026-11-05** por petición explícita de la persona solicitante: «marcalo como completada».
El cierre no habilita producción ni incluye las fases T/P.

## Contacto desde la cuenta y teléfono opcional — 2026-11-07

Por petición de la persona solicitante, el checkout ya no pide nombre, correo ni
teléfono: `POST /api/bookings` copia en la reserva los de la cuenta autenticada
(`getGuestSession`) e ignora los que lleguen en el cuerpo. El registro admite un
teléfono **opcional** (`GuestAccount.phone`, nullable, con check de no vacío); vacío
se guarda como NULL y la reserva queda con `guestPhone` NULL.

- Migración `20261107T0711_guest_account_phone` (columna + check, aditiva), planeada
  desde `20261107T0153_allow_one_dollar_testnet_charge`. La ref `db` apuntaba a un
  estado anterior y un primer plan recreaba `PaymentAttempt`; se descartó sin aplicar.
- Aplicada al Compose local tras respaldo `backups/pre-guest-phone-20261107T071130Z.dump`
  (21 tablas con datos en `pg_restore --list`); `db:check` coincide con el contrato.
- La cuenta todavía no permite editar nombre, correo ni teléfono después del registro.
- Evidencia: `booking-db.test.ts` sobre PostgreSQL desechable verifica teléfono
  válido, inválido (400 sin fila) y vacío (NULL), y que nombre/correo enviados por el
  cliente no sustituyen los de la cuenta; `BookingWidget.test.tsx` verifica que el
  formulario no pide contacto y que el POST solo envía fechas, hospedaje y referido.

## Contrato y límites

- `GuestAccount` es independiente de `AdminUser`: nombre, correo normalizado único,
  contraseña bcrypt coste 12, cuenta activa y versión de autenticación; sin roles.
  Contraseñas de al menos 12 caracteres y como máximo 72 bytes UTF-8.
- `/account/register`, `/account/login` y `/account` permiten registro, acceso,
  salida e historial privado. Las API POST `/api/guest/register`, `login` y
  `logout` validan origen exacto, datos y disponibilidad local. Formularios nativos
  usan POST también antes de hidratar; se avisa que requieren JavaScript.
- Cookie `guest_session`, HttpOnly, SameSite=Strict, ocho horas y Secure en HTTPS;
  JWT con audiencia `gateways-guest`. Los tokens del personal no autorizan huéspedes
  ni viceversa. Cada acceso verifica cuenta activa y `authVersion` en PostgreSQL;
  salir revoca también copias retenidas del token.
- Se reutilizan `jose`, `bcryptjs`, `BLOG_SESSION_SECRET`, `BLOG_APP_ORIGIN` y el
  throttle persistido existente. El correo de sus buckets lleva prefijo `guest:`;
  el presupuesto IP se comparte con el acceso del personal. Sin proxy confiable
  existe un presupuesto global deliberado, no se confía en IP enviada por cliente.
- Las nuevas reservas obtienen `guestAccountId` de la sesión validada en servidor,
  nunca de un ID o correo del cuerpo. Checkout, recibo, status, cotización y pago
  exigen propietario además de la credencial de checkout. Los POST de checkout
  rechazan origen ausente o ajeno antes de escribir.
- Históricos: propietario nullable, sin backfill por correo ni mecanismo de
  reclamación automática. Conservan su credencial de checkout anterior; no aparecen
  en el historial de una cuenta nueva aunque coincida el correo. La FK RESTRICT
  impide eliminar cuentas con reservas y no crea cascadas de historial.
- El historial muestra solo reservas del propietario y la evidencia de pago
  almacenada; GET no consulta ni reconcilia proveedores. `paid` en desarrollo
  puede proceder del mock y no acredita dinero real. Los estados detallados de
  intentos BTCPay pertenecen a P, no se inventan en H.
- Páginas/API privadas llevan no-store, no-referrer y noindex. El retorno tras
  login se limita a rutas locales permitidas; conserva fechas/ref de la ficha,
  no credenciales ni datos personales en la query.

**Recuperación pendiente:** las cuentas están bloqueadas en `NODE_ENV=production`
y cuando `BLOG_APP_ORIGIN` no es loopback. Las API de identidad y nuevas reservas
responden 503 fuera del alcance local. Antes de retirar este bloqueo hay que
definir y verificar recuperación, entrega de correo, política operativa, TLS/proxy
y límites; no basta cambiar una variable ni publicar el Compose actual.

## Migración y recuperación

```text
Paquete: infrastructure/prisma/migrations/app/20261105T0323_guest_accounts
Origen B2: 03338025e81ccb1e61e9bbb29b7f143a122e1f1676b5986e4065564af03abe34
Destino H: 2deb3c565ad1d334c7e7cef4c50b31feeae096e88fedc03cfe6b4d38384ff18a
Migración: 4ad44546f8b01107384c566cfc9d8ab6e82c9711fa543f9937e70ccee91004bd
Operaciones: 5 aditivas; sin importación ni transformación de filas históricas.
```

Respaldo previo completo privado:
`backups/progreso-20261105T032003451Z-V6rYA7`, archivo SHA-256
`5a1fa6f885706218fa6b64ba9cda3e2d01cc9e2665adf6533e764bc04630d459`.
Snapshot PostgreSQL exportado, 179 medios y 179 objetos RustFS (186655527 bytes),
referencias/tamaños/hashes/listado estable comprobados. Los archivos de respaldo
no se versionan ni se comparten públicamente.

Se restauró **ese dump fresco** en PostgreSQL 18 tmpfs aislado. `db migrate --show`
seleccionó únicamente H; aplicar ejecutó cinco operaciones, `db verify` confirmó
esquema/marcador y repetir aplicó cero. La comparación de valores de las 16 tablas
públicas previas fue exacta, descontando solo la columna nueva nullable. Cero
cuentas creadas y cero históricos asociados. Contenedor y configuración efímeros
eliminados. El ensayo no restauró RustFS ni define recuperación de cuentas.

```text
Preserved exact pre-existing values in 16 public tables
Database marker and schema match contract
Repeat migration: no-op; old rows preserved; no guest accounts created or legacy rows claimed.
```

Ante fallo de aplicación con el esquema aditivo, corregir hacia delante y mantener
las escrituras afectadas cerradas; no volver a un checkout que ignore propietarios.
Una restauración operativa exige autorización y evaluación de escrituras/pagos
posteriores; nunca restaurar automáticamente sobre la base activa. Tras restaurar
identidades, invalidar sesiones para no reactivar tokens previos.

## Verificación

### Recorrido de navegador aislado

App de desarrollo temporal `http://localhost:3003`, copia sin `.env` operativo,
PostgreSQL 18 tmpfs propio con todas las migraciones y un hospedaje/referido
sintéticos. Dos contextos Chrome separados, no dos pestañas que compartan cookies.
App temporal detenida, contenedor sintético eliminado y pestañas de prueba cerradas
al terminar; no se modificaron los servicios ni las filas del Compose operativo.

1. Registrar desde el formulario a `H Owner Synthetic` con correo en mayúsculas;
   redirige a `/account`. Segunda cuenta creada en otro contexto aislado.
2. Abrir la ficha con fechas 10–12 de diciembre de 2026 y referido sintético:
   tras hidratación conserva dos noches. Crear desde el widget original usando
   **otro correo de contacto**: el propietario sigue siendo la cuenta autenticada.
3. Checkout cotiza USD 256.00 y permite abrir/pagar con el **mock**. Historial del
   propietario muestra la estancia confirmada y pago de USD 256.00, con advertencia
   explícita de que no acredita pagos reales ni BTCPay.
4. La segunda cuenta, aun conociendo la credencial completa, obtiene 404 en status,
   GET BTC, POST quote, POST BTC y página checkout. El recibo no revela datos y su
   historial no contiene la reserva ajena. Las API conservan private/no-store.
5. Salir desde la UI y volver a iniciar sesión usando correo normalizado recupera
   el historial propio. Status propietario devuelve 200/confirmed; cuenta lleva
   no-store, no-referrer y `noindex, nofollow, noarchive`; `document.cookie` no puede
   leer `guest_session`.

Comprobación SQL de esa base exclusivamente sintética:

```json
{"guestAccounts":2,"staffAccounts":0,"normalized":true,"bcryptCost12":true,"ownedBookings":1,"booking":{"status":"confirmed","amount":25600,"checkIn":"2026-12-10","checkOut":"2026-12-12"},"referral":"confirmed"}
```

### Comprobaciones de aplicación

Primera ejecución completa del controlador sobre H:

```bash
npm test -- --maxWorkers=2
# 69 archivos aprobados, 8 omitidos; 472 tests aprobados, 24 omitidos; exit 0.

NODE_ENV=development PRISMA_TEST_DATABASE=1 ./node_modules/.bin/vitest run \
  infrastructure/prisma/_test_/plan1-postgres.test.ts --maxWorkers=1
# 3 aprobados en PostgreSQL desechable; exit 0.

npm run build
# Compilación, TypeScript y generación de páginas correctas; exit 0.
# Incluye /account, login/register y las tres API guest.

./node_modules/.bin/eslint modules/guests 'app/(site)/account' app/api/guest \
  app/api/bookings app/api/checkout components/organisms/BookingWidget.tsx \
  modules/bookings/server modules/checkout/server next.config.ts modules/site/nav.ts
# 0 errores/avisos; exit 0.

git diff --check
# exit 0.
```

El lint global previo pasó con cero errores y dos avisos existentes
(`plan1-bcrypt.mts` y `referral-lifecycle.ts`). La primera compilación encontró
tipos inválidos en la adaptación del harness de tests; se corrigieron antes de
la compilación satisfactoria registrada arriba. No se excluyeron los tests del
typecheck ni se relajó el contrato de producción.

### Integración final H/B2

El controlador revisó los cambios de Luna y añadió la comprobación de audiencias
cruzadas con IDs/versiones coincidentes, límites bcrypt multibyte y persistencia
del throttle en un proceso nuevo, dentro de los mismos cuatro casos H. La
regresión existente del mock en producción usa históricos sin propietario: no
puede pasar únicamente por el bloqueo de sesiones guest en producción.

```bash
NODE_ENV=development PRISMA_TEST_DATABASE=1 ./node_modules/.bin/vitest run \
  modules/bookings/_test_/booking-db.test.ts \
  infrastructure/prisma/_test_/plan1-postgres.test.ts --maxWorkers=1
# 18 aprobados, 0 omitidos; exit 0 (15 H/B2 + 3 identidad/migración del personal).

./node_modules/.bin/vitest run modules/auth/_test_/credential-form-fallback.test.tsx \
  components/organisms/_test_/BookingWidget.test.tsx --maxWorkers=1
# 4 aprobados, 0 omitidos; exit 0.

./node_modules/.bin/tsc --noEmit --incremental false --pretty false
npm run lint
# Ambos exit 0; lint global conserva solo los dos avisos existentes.
```

Las pruebas H añaden cuatro casos PostgreSQL, un caso de retorno del widget y
uno de retorno seguro tras login; extienden la prueba existente de envío nativo
seguro para ambos formularios guest. Sin dependencias nuevas ni pruebas eliminadas.
Cubren lecturas/mutaciones entre dos propietarios, ausencia de sesión, ID de
cliente manipulado, unicidad concurrente normalizada, hash, audiencias separadas,
revocación/desactivación, throttle persistido, origen, bloqueo de producción y
históricos sin asociación por correo. Los omitidos de la suite normal **no**
cuentan como aprobados; H/B2/Plan1 se ejecutaron explícitamente en PostgreSQL propio.

Repetición final del controlador sobre los archivos integrados:

```bash
npm test -- --maxWorkers=2
# Test Files 70 passed | 8 skipped (78)
# Tests      474 passed | 24 skipped (498)
# exit 0
```

De los 24 omitidos, 18 son H/B2/Plan1 y sí se ejecutaron explícitamente como se
registra arriba; los otros seis opt-in anteriores no se habilitaron contra una
conexión operativa. No se necesita un shim temporal de Node para reproducir estas
ejecuciones del controlador: se hicieron con Node 24 y los comandos indicados.

## Estado operativo y pendientes

- [x] Implementar cuentas separadas, sesiones revocables y autorización por propietario.
- [x] Respaldar PostgreSQL/RustFS y ensayar restauración PostgreSQL + migración aditiva.
- [x] Verificar recorrido UI aislado, dos cuentas y pago mock sin tocar datos operativos.
- [x] Obtener autorización explícita del corte: respuesta «bien» a la pregunta de aplicar H al Compose local después de verificar la integración.
- [x] Aplicar H al Compose operativo local después de la verificación final.
- [x] Registrar aceptación local de la persona solicitante el 2026-11-05: «marcalo como completada». Fase H cerrada en el índice.
- [ ] Definir/ensayar recuperación de acceso antes de habilitar cuentas fuera de local.

### Corte autorizado del Compose local

El 2026-11-05 UTC la persona solicitante respondió **«bien»** a la pregunta
explícita de aplicar H al Compose local tras verificar la integración. Responsable
de ejecución: agente principal, tras revisión de la entrega de los subagentes Luna.

1. `prisma db migrate --show` seleccionó exclusivamente H desde el marcador B2.
2. Respaldo completo fresco: `backups/progreso-20261105T040107967Z-lIDiaJ`, 179
   objetos / 186655527 bytes; SHA-256 del archivo
   `e9b655b008f24204ae725e23288d459216088a5fd7bc662adec6b3d710c77ab1`.
3. App detenida mientras se capturó `pre-h-paused.dump` en ese directorio,
   permisos 0600 y SHA-256
   `c65f539d4e8016ffe59298aa2cd25c5ec34ee17f6988e9d7eb443ae31593e842`.
   Este dump final separado y su hash no forman parte del archivo tar previo.
4. `prisma db migrate --advance-ref db`: una migración, cinco operaciones aditivas;
   marcador/ref `db` en el destino H indicado arriba. `prisma db verify`: esquema
   y marcador coinciden. Comparación exacta de valores de las 16 tablas previas
   aprobada, ignorando solo la columna nullable añadida. App reiniciada.
5. `prisma db migrate --show` posterior: **Already up to date — nothing to run**.

Se corrigió además el desajuste de configuración local: el contenedor ya estaba
publicado en 3001, pero el origen apuntaba a 3000. En `.env` privado se alinearon
`APP_PORT=3001`, `BLOG_APP_ORIGIN=http://localhost:3001` y
`NEXT_PUBLIC_SITE_URL=http://localhost:3001` para habilitar el widget original de
reserva en ese entorno. No se cambiaron secretos, puertos publicados ni código
para aceptar orígenes arbitrarios. Producción y pagos reales siguen bloqueados.

Smoke HTTP operativo, sin crear usuarios ni reservas de prueba:

```text
GET  /account                         307 /account/login
GET  /account/register                200 (no-store, no-referrer)
POST /api/guest/register {}           400 con origen correcto
POST /api/guest/register {}           403 con origen ajeno
POST /api/bookings {}                 401 sin sesión de huésped
GET  /api/checkout/status inválido    400 (private/no-store/no-referrer)
GET  /properties                      200
GET  /listing/<ficha pública>         200; widget «Reserve your stay» y enlace Account
```

Recuento posterior: `GuestAccount=0`, `Booking=0`, `Listing=11`, `BlogPost=9`,
`MediaAsset=179`, `ReferralAttribution=0`. No se crearon identidades de ejemplo ni
se importaron datos. El respaldo fresco del corte final conserva verificación de
dump/objetos, pero no se afirma haber restaurado **ese segundo dump** ni RustFS;
el ensayo de restauración ejecutado fue el primer checkpoint de esta entrega.

### Verificación al retomar la sesión — 2026-11-05 10:26 UTC

Los servicios existentes estaban detenidos al retomar. Se ejecutó únicamente
`docker compose -f compose.dev.yaml start app`, que inició la app y sus
dependencias existentes: sin recrear volúmenes, restaurar datos ni repetir la
migración. PostgreSQL y RustFS quedaron healthy; app publicada en 3001.

`npm run db:check` confirmó nuevamente **Database marker and schema match contract**,
con el mismo marcador H y sin avisos de esquema. Recuentos conservados: cero
huéspedes/reservas sintéticos, 11 hospedajes, 9 artículos y 179 medios.

```text
GET  /account/register       200; no-store
GET  /account                307 /account/login; no-store
POST /api/guest/register {}  400; private/no-store
POST /api/bookings {}        401; private/no-store
```

Las peticiones inválidas solo comprueban las fronteras; no crearon cuentas,
reservas ni intentos de autenticación. No se repitieron las suites ya aprobadas.
