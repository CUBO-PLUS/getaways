# Evidencia de implementación local — Plan 3 / B2

Fecha: 2026-11-04. Base de código: `5fb26372a4c36969cd45bb9c63586c972d19b8c5`.
Trabajo aislado en rama `feature/reservas-fase3`, worktree `reservas-fase3`, con
subagentes `openai/gpt-6-luna`, integrado después en el checkout original y migrado
al Compose local por autorización posterior. **Corte local B2 completado**; no
implica despliegue en producción ni aceptación funcional/concurrencia no ejecutada.

## Alcance

Fases 3.1–3.3: modelo/importación privada, consistencia financiera y adaptación
conjunta de lectores/escritores a PostgreSQL. Según el índice raíz, 3.4/C1 permanece
después del recorrido de huéspedes y pagos testnet H/T/P; no se implementan esas
fases ni proveedor real como parte de B2.

En esta entrega original se conservó la restricción de no crear/ejecutar tests de
aplicación. Se registran verificación directa de migración/datos y typecheck por
separado; no sustituyen las pruebas de concurrencia, roles y navegador.
La petición posterior autoriza el [seguimiento de testing B2](06-testing-b2.md);
sus resultados no se atribuyen retroactivamente a esta entrega.

## Respaldo y restauración aislada

Se obtuvo un `pg_dump --format=custom` completo de la base local B1 y se restauró
con `pg_restore --exit-on-error` en **`gateways_phase3_20261104`**. La configuración
privada del worktree apunta exclusivamente a ese clon. No se modificaron la base
operativa `gateways`, objetos RustFS ni el servicio de aplicación original.

- Dump privado con permisos `0600`, fuera del repositorio.
- SHA-256: `e67e98e0e4409ffc0c683962f61a0f26949897772efb325a0207d30d493832df`.
- Fotografías anteriores por recuento/hash de las 15 tablas públicas, sin guardar
  datos personales en este documento.

Resultado directo de restauración:

```text
restored_database | gateways_phase3_20261104
Listing          | 11
MediaAsset       | 179
BlogPost         | 9
AdminUser        | 2
ReferralAttribution | 0
```

## Fuente operativa — inventario anterior al corte

Comprobación del checkout original y del contenedor activo:

```text
original_private_booking_file_exists: False
container_booking_source_absent
```

La ausencia de `.data/bookings.json` **no demuestra cero reservas**: pueden existir
otras instancias o estado en memoria aún no consolidado. El importador debe rechazar
una fuente inexistente/ilegible; nunca sustituirla silenciosamente por una lista vacía.
Los datos sintéticos de ensayo no pueden usarse como fuente del corte real.

Un inventario de otros worktrees encontró un archivo en
`catalogo-fase-2-completa/src/.data/bookings.json`: 1 reserva pendiente,
`nextId=2`, SHA-256
`264ef78a87ba09b41994652f980c58df9697597f69f2afad2bbc7f7a36efc440`.
Se desconoce si es historial operativo o una reserva de desarrollo; no se importó
ni se considera fuente aprobada. Debe aclararse su procedencia antes de consolidar.

Para completar el corte B2 se necesita una fuente final coherente de todas las
instancias, con escrituras detenidas, o confirmación explícita de que no existe
historial que preservar. La migración/importación operativa requiere aprobación
separada. No se marca B2 como aceptado por implementar el código.

**Confirmación posterior de la persona solicitante — 2026-11-04:** «no hay reservas
pendientes». Se registra la ausencia de pendientes; no se utiliza el archivo
candidato de desarrollo como una reserva operativa ni se autoriza por esa frase
a borrar reservas confirmadas/canceladas o declarar vacío todo el historial.
También se solicitó corregir los errores anteriores de TypeScript con otro
subagente Luna; se registra el resultado de ese seguimiento por separado.

**Bloqueo local resuelto posteriormente:** la persona solicitante indicó
«continua con la migracion no hay datos de reservas en la db». Con la aplicación
detenida se volvió a comprobar que no había archivo operativo y que `gateways`
no tenía tabla `Booking` ni atribuciones. Se preparó una fuente explícita de cero
reservas para este destino local; no se convirtieron errores de lectura en una
importación vacía ni se tomó como fuente la reserva de otro worktree.

## Verificaciones de implementación

### Migración aislada 3.1

Antes de migrar se añadió un código/atribución **sintéticos exclusivamente al clon**
para comprobar preservación con referidos no vacíos. Se repitió la fotografía de las
15 tablas anteriores. Los nueve artículos existentes no se reimportaron.

```text
prisma db migrate --show
1 migration will run: 20261104T2124_add_booking_persistence
from b3b6063e6e046aeb330bcb6c54502a2d20efa4c8e4aebb86346f522aafe9258d
to   03338025e81ccb1e61e9bbb29b7f143a122e1f1676b5986e4065564af03abe34

prisma db migrate
Applied 1 migration(s) (7 operation(s)) across 1 contract space(s)
advancedRef: null

Pre-existing tables checked: 15
Changed pre-existing tables: []
PASS: complete pre-existing rows preserved after Booking migration
```

Solo se creó `Booking`, sus restricciones, índices y FK `Restrict` a `Listing`.
El marcador del clon corresponde al hash `to` anterior; la referencia de desarrollo
del repositorio no se avanzó para aparentar un corte operativo.

### Typecheck intermedio

Comando tanto en la base original `5fb2637` como en el worktree después de 3.1:

```text
./node_modules/.bin/tsc --noEmit --incremental false --pretty false
Baseline diagnostics: 23
Phase3.1 diagnostics: 23
Diagnostics identical: True
New diagnostics: 0
exit: 2
```

No es un typecheck aprobado. Los errores previos son el target `ES2017` con literales
BigInt, tipos de Node 20 sin `registerHooks` y dos errores en `listings-import.mts`.
La igualdad se comprobó comparando la salida completa, no solo el recuento.

### Importación privada de ensayo

Fuente **sintética**, separada de cualquier historial operativo: dos reservas,
una pendiente sin términos históricos y otra confirmada con snapshot completo;
un total superior a `int4` para verificar centavos `int8`, y `nextId=4500`.

Durante el ensayo, `--apply` detectó `RUNTIME.ENCODE_FAILED` porque el codec
`pg/timestamptz-temporal@1` exige `Temporal.Instant` y rechaza `Date`. Se corrigieron
las escrituras de timestamps y la comparación exacta de instantes. No se introdujo
un fallback ni se ocultó el fallo. Después:

```text
bookings-import --source <fuente-sintetica-privada>
mode: dry-run; sourceCount: 2; toImport: 2; destinationExtras: 0; orphanReferralCount: 0

bookings-import --source <fuente-sintetica-privada> --apply \
  --target 127.0.0.1:5432/gateways_phase3_20261104
mode: apply; imported: 2; orphanReferralCount: 0

imported_synthetic_rows: 2
source_ids_preserved: true
stay_dates_preserved: true
exact_int8_amounts_preserved: true
missing_terms_blocked: true
historical_snapshot_preserved: true
next_available_id: 4500
preserved_synthetic_attributions: 1
After import: pre-existing tables checked: 15; changed: []
```

`--target` identifica host, puerto y base **sin credenciales**. Los errores de BD
se redactan, no se imprimen datos personales ni argumentos de consultas.

El modo `--verify` también detectó un uso incorrecto de `db.query`; se corrigió a
`tx.query` dentro de una transacción de solo lectura. Resultado final:

```text
bookings-import --source <fuente-sintetica-privada> --verify \
  --target 127.0.0.1:5432/gateways_phase3_20261104
mode: verify; verified: 2; destinationExtras: 0
nextAvailableId: 4500; requiredNextId: 4500; orphanReferralCount: 0
```

Se repitieron `--apply` y `--verify`: dos filas equivalentes, sin duplicados ni
movimiento hacia atrás de secuencia. La salida `imported: 2` representa dos filas
procesadas, no dos filas nuevas en la repetición. Las fechas de creación/actualización
también coinciden exactamente con la fuente.

```text
bookings-import --source <archivo-inexistente>
bookings import aborted: booking source is unreadable or invalid JSON
Missing-source guard: exit 1 as required; no empty-history fallback
```

Después de las correcciones, typecheck vuelve a los mismos 23 diagnósticos de la
base, sin diagnósticos nuevos. No certifica integración dinámica de 3.2–3.3.

### Implementación 3.2–3.3

- `booking-store.ts` usa exclusivamente `db.orm.public.Booking` y transacciones;
  no existe un `updateBooking(Partial<Booking>)` ni store operativo en archivo.
- Las cotizaciones toman tarifa, limpieza, extras, impuestos y capacidad del snapshot
  guardado; una actualización que pierde la versión/estado/pago devuelve conflicto.
- Confirmación y cancelación bloquean `Listing` antes de `Booking`. Solo `markPaid`
  confirma, comprobando referencia, reserva, importe y ausencia de solapes `[in,out)`.
- El panel Bitcoin solicita reconciliación por POST; GET conserva únicamente lecturas.
  La sincronización de referidos relee el estado autorizado en la misma secuencia de
  bloqueos y se puede reintentar sin revertir el resultado del pago.
- DTO específicos conservan título histórico y excluyen notas internas, actor y
  referencias de pago; respuestas privadas/no-store/no-referrer/noindex, incluidos
  errores. `simulate_paid` y la apertura del mock no están disponibles en producción.
- El mock conserva referencias deterministas por reserva **solo como mejora local**;
  su Map sigue sin persistencia del proveedor. Una referencia olvidada genera revisión,
  no la apertura silenciosa de una factura nueva.

Correcciones aplicadas en los archivos `src/` reales del worktree y contrastadas
con el diff revisado, no únicamente con copias de trabajo:

- Un pago abierto no se confunde con pago recibido ni reembolsado. El recibo de
  cancelación pide revisión manual, sin prometer devoluciones o afirmar que no hubo cobro.
- Una cancelación automática por solape registra fecha, motivo y actor de sistema;
  un pago tardío preserva los datos de la cancelación manual anterior.
- Los helpers de referidos no continúan si no existe la fila de hospedaje que deben bloquear.
- `logging.incomingRequests: false` evita que Next.js en desarrollo imprima las URL
  completas con capacidades. **Los logs del proxy/plataforma necesitan redacción
  separada antes de un despliegue**; no se afirma privacidad integral del entorno.

Verificación final directa del controlador (sin ejecutar tests):

```text
./node_modules/.bin/tsc --noEmit --incremental false --pretty false
Typecheck exit: 2 (existing errors)
Baseline diagnostics: 23
Current diagnostics: 23
Same diagnostic messages ignoring shifted positions: True
New diagnostics: 0

grep de readFileSync|writeFileSync|__getawaysBookingStore|updateBooking( en modules/bookings
No matches found

git diff --check
exit: 0
```

En aquella comprobación, las posiciones de cuatro errores existentes en
`btc-mock.ts` se desplazaron; se compararon archivo/mensaje/código normalizando
únicamente línea y columna. Los 23 errores se corrigieron en el seguimiento posterior.
Revisión global de cierre realizada por un subagente Luna distinto de los
implementadores:

```text
Specification: PASS for phases 3.1–3.3
Quality: PASS on source review
Important findings: None
Runtime/concurrency behavior: not verified
B2 operational acceptance: blocked
```

La revisión comprobó los archivos `src/` reales, importador, migración, lectores,
mutaciones, checkout, referidos y recibos en conjunto. Lo anterior no equivale a
comprobar carreras reales, un flujo de pago end-to-end o habilitar el servicio original.

### Cierre de implementación — previo al corte posterior

- Código de 3.1–3.3 y documentación entregados en `feature/reservas-fase3`,
  worktree `reservas-fase3`; sin commits, merge, push o despliegue automático.
- Especificación y calidad revisadas por Luna; verificación directa de datos y
  preservación aislada registrada arriba. No se marca aceptación operativa B2.
- 3.4 permanece pendiente tras H/T/P según el índice raíz: posponer el panel no
  amplía el alcance a cuentas, BTCPay o cobros reales.
- Se conservó la restricción documentada de no tests de aplicación; su coste es
  mantener pendientes la aceptación de comportamiento y concurrencia.
- Siguiente paso operativo requiere una fuente coherente aprobada de reservas
  (o confirmación explícita de historial vacío), mantenimiento de escrituras y
  autorización del corte con respaldo fresco. El archivo candidato de otro
  worktree no se usó como historial por inferencia.

### Seguimiento — errores anteriores de TypeScript corregidos

Por solicitud posterior de la persona solicitante, **otro subagente Luna** corrigió
los 23 diagnósticos que la implementación había heredado:

- Target `ES2020`, compatible con los literales BigInt de los cálculos exactos;
  no se reescribió la lógica financiera.
- `@types/node` alineado con Node 24 usado por el host y Docker; ambos lockfiles
  actualizados a `24.19.2`. El loader existente conserva su comportamiento.
- Sintaxis genérica `.mts` desambiguada y MIME derivado del formato tipado de Sharp
  (`jpeg` produce `image/jpeg`), sin comparación imposible contra `jpg`.

El worktree utiliza ahora `node_modules` independiente, instalado con scripts de
ciclo de vida deshabilitados. No se instaló a través del symlink anterior ni se
modificaron los módulos/configuración del checkout original.

Resultado repetido por el controlador y revisado por otro subagente:

```text
./node_modules/.bin/tsc --noEmit --incremental false --pretty false
[sin diagnósticos]
TypeScript exit code: 0

Revisión del arreglo: especificación PASS; calidad PASS; sin hallazgos
```

Este resultado sustituye la limitación anterior de los 23 errores: el typecheck
completo **sí pasa**. No se excluyeron archivos, relajó `strict` ni añadieron
supresiones; no se ejecutaron tests, lint, build, navegador ni operaciones de datos.

## Corte local B2 autorizado y completado

Ejecutado el 2026-11-04 tras la autorización expresa anterior:

1. Respaldo completo fresco mediante el script existente, con PostgreSQL y los
   179 objetos RustFS; verificadas referencias, estabilidad del bucket y hashes.
2. App detenida, sin sustituir PostgreSQL/RustFS ni borrar volúmenes. Capturados
   dump final y hashes de las 15 tablas previas con las escrituras pausadas.
3. Código revisado y arreglo TypeScript integrados en el checkout original por
   `git apply --check` y aplicación del patch, previamente limpio; sin commits,
   merge, push, cambios de secretos ni importación de artículos/catálogo.
4. Aplicada exclusivamente la migración de `Booking` desde B1; referencia `db`
   avanzada mediante la CLI al destino realmente aplicado, sin forzar marcadores.
5. Importación y verificación de fuente local explícita `{"nextId":1,"bookings":[]}`.
6. Dependencias alineadas con Node 24 y app reiniciada con su configuración original.

```text
prisma db migrate --show
1 migration will run: 20261104T2124_add_booking_persistence

prisma db migrate --advance-ref db
Applied 1 migration(s) (7 operation(s)) across 1 contract space(s)
markerHash / advancedRef db:
03338025e81ccb1e61e9bbb29b7f143a122e1f1676b5986e4065564af03abe34

bookings-import apply
imported: 0; orphanReferralCount: 0
bookings-import verify
verified: 0; destinationExtras: 0
nextAvailableId: 1; requiredNextId: 1; orphanReferralCount: 0

Pre-existing operational tables checked: 15
Changed pre-existing tables: []
Operational Booking rows: 0
Next Booking ID: 1
Listing/Blog/Media counts: 11/9/179

gateways-dev-app-1 running=true
gateways-dev-db-1 running=true
gateways-dev-rustfs-1 running=true
App TCP readiness: port 3000 accepting connections

Lectura del cliente PostgreSQL desde el contenedor de la app:
applicationDatabase: gateways
bookings: 0; listings: 11; blogPosts: 9; mediaAssets: 179

Operational checkout TypeScript exit code: 0
```

La app monta el checkout original ya actualizado y conserva el entorno original;
no apunta al clon del ensayo. Se verificaron conectividad y datos, no se creó una
reserva de prueba ni se ejecutaron recorridos de aplicación o pagos.

**Comprobación final tras reanudar la sesión — 2026-11-05 UTC:** los tres
contenedores se encontraron detenidos con salida normal y sin OOM; se levantaron
los mismos contenedores existentes, sin recrear servicios/volúmenes ni repetir la
migración. Resultado actual:

```text
prisma db migrate --show
Already up to date — nothing to run
migrations: []

gateways-dev-app-1 running=true
gateways-dev-db-1 running=true health=healthy
gateways-dev-rustfs-1 running=true health=healthy
App TCP readiness: port 3000 accepting connections

database: gateways; bookings: 0; listings: 11; posts: 9; media: 179
next_booking_id: 1
```

Los 42 archivos entregados se compararon entre worktree y checkout operativo y
coinciden; el diff no contiene errores de whitespace. La sesión continúa ahora
desde el checkout original operativo, no desde el clon aislado.

### Respaldos del corte

- `src/backups/progreso-20261104T224003331Z-UcgQFM.tar.gz`
  — BD completa y 179 objetos, 186 655 527 bytes de objetos.
  SHA-256 `b5509d31e48a34678d28122de76115bb2cca6dc09576d6c6c465bcc393c87349`.
  Hash del archivo y 186 checksums internos correctos; helper `verified-only:179`.
- `src/backups/b2-corte-20261104T2242-3l4xp4xa/`
  — dump final con app detenida, fuente vacía explícita, recuentos/hashes anteriores
  y patch de código integrado; archivos privados, sin credenciales.
  SHA-256 de `postgres-final-paused.dump`:
  `ee5f754ac8bf1e80be540093a47a50e3ae8662e8f54ec29a7d97dd6a181de596`.
  SHA-256 de `source-integration.patch`:
  `0b5fe2d3c8eaf63bc5f0581bffe94069692bcc84acd54699b2997fa3e23e6ddd`.

El archivo completo se generó antes de pausar la app; el dump adicional captura
el estado PostgreSQL final pausado. La estabilidad y bytes del bucket constan en
el respaldo completo. No se afirma un snapshot distribuido ni restauración de
este respaldo fresco ensayada. Las reservas sintéticas permanecen solo en el clon.

## Límites

- Importación final vacía y cambio de versión local realizados; sin despliegue de producción.
- Sin pruebas de aplicación, lint, build ni navegador.
- Typecheck completo aprobado tras el seguimiento: 0 errores, exit 0.
- Sin aceptación de carreras con dos procesos de aplicación ni C1.
- El mock de pagos sigue siendo una herramienta de desarrollo sin persistencia
  compartida del proveedor; persistir reservas no vuelve reales los pagos.
- Sin cuentas de huéspedes H, infraestructura BTCPay T ni integración P.
