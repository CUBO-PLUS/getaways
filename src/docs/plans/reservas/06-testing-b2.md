# Testing de la fase actual — 3.1–3.3 / B2

Fecha: 2026-11-05 UTC. Seguimiento del corte local registrado en
[05-evidencia-local.md](05-evidencia-local.md). La petición posterior «haz el testing
necesario para la fase actual» autoriza estas pruebas y sustituye la restricción
anterior de no testing **para esta verificación B2**. No cambia el alcance de H/T/P,
3.4 ni producción.

## Entorno y seguridad

- Comandos desde `src/`, sobre los cambios locales sin commit posteriores a `5fb2637`.
- Integración con PostgreSQL desechable y datos sintéticos; nunca usar el
  `DATABASE_URL` operativo para ejecutar las escrituras de las pruebas.
- El navegador usa `http://localhost:3001` solo para lecturas del catálogo,
  disponibilidad y rechazo de capacidades inválidas/inexistentes.
- Comprobación operativa de solo lectura inicial: 0 reservas, 11 hospedajes,
  179 medios. Sin reimportar catálogo/blog, migrar la base local ni escribir en S3.

## Primera pasada y regresiones encontradas

```text
npm test
Test Files  3 failed | 65 passed | 7 skipped (75)
Tests       3 failed | 464 passed | 9 skipped (476)
```

Los tres fallos corresponden a contratos antiguos: una cotización con entradas
negativas ahora se rechaza, `cko_12_abc` ya no es una capacidad válida y el test de
datos de páginas aún presupone el catálogo en JSON. Se deben adaptar sin relajar
validación ni introducir un fallback de producción.

```text
PRISMA_TEST_DATABASE=1 ./node_modules/.bin/vitest run infrastructure/prisma/_test_/plan1-postgres.test.ts
Tests  1 failed | 2 passed (3)
```

Las carreras de último ADMIN y throttle pasan con procesos independientes.
La comparación de migración detecta la columna aditiva `MediaAsset.legacyMediaId`
(null); debe comparar todos los valores anteriores sin considerar esa columna nueva
como pérdida de datos. No se modifica la migración para satisfacer el test.

## Verificaciones completadas

| Comando | Resultado |
| --- | --- |
| `./node_modules/.bin/tsc --noEmit --incremental false --pretty false` | Exit 0, sin diagnósticos |
| `npm run lint` | Exit 0, 0 errores / 3 avisos |
| `npm run build` | Exit 0, compilación, TypeScript y 18 páginas estáticas correctos |
| `docker exec gateways-dev-app-1 pnpm run db:check` | Exit 0, marcador y esquema coinciden con el contrato; sin avisos |
| `docker exec gateways-dev-app-1 pnpm exec prisma db migrate --show` | Exit 0, `migrations: []`, nada pendiente; solo inspección |
| `git diff --check` | Exit 0 |

Avisos de lint: variable `error` no usada en `app/api/bookings/route.ts`, argumento
`_reportedStatus` no usado en `modules/referrals/referral-lifecycle.ts` y export
anónimo en el soporte existente `plan1-bcrypt.mts`. No impiden las comprobaciones.

El build vuelve a emitir el contrato con el mismo storage hash de B2:
`03338025e81ccb1e61e9bbb29b7f143a122e1f1676b5986e4065564af03abe34`.

### Navegador y HTTP reales, sin escrituras

- `/properties` y ficha Solaris: carga correcta desde PostgreSQL, formulario y
  medios visibles; sin pantalla de error de aplicación.
- `/checkout?session_id=cko_12_abc`: HTTP 404.
- `/booking-confirmation?session_id=cko_12_abc`: pantalla «Booking not found»,
  sin mostrar reserva ni repetir la capacidad desconocida.
- API status y Bitcoin con capacidad incompleta: HTTP 400, «Invalid checkout
  session.»; capacidad canónica inexistente en status: HTTP 404.
- Respuestas privadas de API: `Cache-Control: private, no-store, max-age=0`,
  `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow, noarchive`.
  Checkout/confirmación también conservan `no-store`, `no-referrer` y `noindex`.
- `/api/listings/10/availability`: HTTP 200, exclusivamente `blocked: []`;
  hospedaje inexistente: HTTP 404. Sin datos de huéspedes.
- POST con JSON roto o listing negativo a reservas, ID numérico a quote y
  capacidad truncada a `simulate_paid`: HTTP 400, sin guardar reservas.

### Smoke de la compilación de producción

Servidor temporal con `next start --hostname 127.0.0.1 --port 3002`, lanzado por
`node --input-type=module` y detenido en `finally`. Assertions HTTP reales:

```text
PASS production /checkout status=404 no-store/no-referrer/noindex
PASS production /booking-confirmation status=200 no-store/no-referrer/noindex
PASS production /api/checkout/status status=400 no-store/no-referrer/noindex
PASS production /api/checkout/btc status=400 no-store/no-referrer/noindex
PASS production /api/checkout/quote status=400 no-store/no-referrer/noindex
Production smoke server stopped; no operational writes
```

Las solicitudes usan únicamente capacidades inválidas (`cko_12_abc` o `12`),
rechazadas antes de consultar/escribir reservas. El recibo contiene «Booking not
found». Esto comprueba también que las cabeceras sobreviven a la compilación,
no solo al servidor de desarrollo.

## Integración B2 y cierre

### Recorrido completo en navegador sobre datos sintéticos

Servidor de desarrollo temporal en `http://localhost:3003`, PostgreSQL 17 en un
contenedor propio con volumen tmpfs y todas las migraciones aplicadas desde cero.
Fixture de un hospedaje sin medios y un referido sintético; sin copiar datos ni
credenciales operativos. `NEXT_PUBLIC_SITE_URL=http://localhost:3003` habilita el
widget de checkout **solo en ese servidor**. Sin esa variable, el widget existente
lleva a contacto y no crea una reserva; no se alteró la configuración operativa.

Pasos y resultados reales mediante Chrome:

1. Completar el widget con datos sintéticos y fechas 20–23 de noviembre de 2026.
   Reserva pendiente persistida y una atribución pendiente.
2. Checkout: tres noches a USD 100, limpieza USD 20, IVA 13 % y turismo 5 %:
   total **USD 374.00**. Seleccionar tres huéspedes y mascota: subtotal USD 380,
   IVA USD 46.80, turismo USD 18, total **USD 444.80**.
3. Cambiar título, tarifa, limpieza y tasas en el catálogo de esa base de prueba.
   Recargar checkout conserva título acordado, extras y total **USD 444.80**.
4. Elegir Bitcoin mock: importe correcto y controles de precio bloqueados.
   POST quote manipulado con pago abierto devuelve **409**, sin cambiar el total.
5. Simular pago, exclusivamente en desarrollo: recibo «You're all set» con título
   histórico y USD 444.80, sin correo ni referencia interna del proveedor.
6. Disponibilidad pública devuelve únicamente el intervalo 20–23 de noviembre;
   status devuelve únicamente estado y conserva las cabeceras privadas.

Comprobación SQL del contenedor de prueba tras el recorrido:

```text
Booking: confirmed|44480|10000|B2 synthetic stay|false
ReferralAttribution: count=1|status=confirmed
Availability: {"blocked":[{"start_date":"2026-11-20","end_date":"2026-11-23"}]}
```

Servidor y contenedor sintéticos detenidos/eliminados al terminar. Los datos del
recorrido nunca se escribieron en `gateways` ni en RustFS. El pago es simulado,
no evidencia de dinero recibido.

Control de solo lectura sobre `gateways` después del recorrido:

```text
Booking|0
Listing|11
BlogPost|9
MediaAsset|179
ReferralAttribution|0
Booking_id_seq: last_value=1, is_called=false
```

### Defecto encontrado y corregido

La recarga inicial reprodujo una carrera en `CheckoutExtras`: StrictMode inicia
dos efectos y ambos envían un POST de cotización. El primero guarda el precio,
pero se descarta su callback; el segundo pierde el CAS y deja la pantalla sin
precio ni posibilidad de pago.

```text
Antes:   POST /api/checkout/quote 200; POST /api/checkout/quote 409
         «This booking changed while we were pricing it.»
Después: POST /api/checkout/quote 200 (una sola solicitud)
         «Confirm $444.80 and choose payment»
```

Arreglo mínimo: compartir la promesa de cotización inicial por `sessionId`,
conservando cleanup, protección de respuestas obsoletas y CAS del servidor.
No desactivar StrictMode ni relajar conflictos financieros. Dos regresiones de
componente protegen el montaje StrictMode y el cambio a otra sesión sin reutilizar
su cotización. Documentación actual de React consultada con Context7 y guía local
`reactStrictMode.md` de Next.js 16.4.2.

### Suites y contratos protegidos

- `modules/bookings/_test_/booking-db.test.ts` y
  `infrastructure/prisma/_test_/support/booking-worker.mts`: PostgreSQL real, APIs
  reales y procesos independientes. Snapshots/políticas/título históricos, DTO
  mínimo, CAS cotización/asociación de pago, solapes y adyacencia, persistencia en
  proceso nuevo, pagos repetidos/tardíos, capacidades exactas, evidencia del
  proveedor, GET sin escrituras, reconciliación POST y bloqueo del mock en producción.
- Referidos en esa misma integración: creación única concurrente, código
  inválido/inactivo no impide reservar, estado autorizado y recuperación tras un
  trigger que provoca un fallo real de escritura de atribución sin revertir el pago.
- Importador en esa misma integración: IDs/sesiones/pagos/fechas/importes
  históricos, revisión por snapshot faltante, apply repetido, verify, secuencia,
  huérfanos conservados, fuentes faltantes/conflictivas y destino incorrecto.
- `modules/checkout/_test_/checkout-extras.test.tsx`: las dos regresiones de UI
  anteriores, con fetch controlado solo como frontera HTTP.
- `booking-quote.test.ts`: se conserva la aritmética existente; nuevos bordes de
  impuesto exacto sobre importes grandes, producto/total no representables y
  rechazo de subcentavos. Sin repetir impuestos/descuentos ya cubiertos.
- Se adaptan además `checkout-session.test.ts`, `_test_/page-data.test.ts` y la
  proyección histórica de `plan1-postgres.test.ts`; no se elimina ninguna prueba.

Primera pasada completa tras las adaptaciones y el arreglo de UI:

```text
npm test
Test Files  69 passed | 8 skipped (77)
Tests       472 passed | 19 skipped (491)
```

Los skipped incluyen integraciones opt-in; no se consideran aprobadas por omisión.
La integración B2 y la suite de migración/último ADMIN/throttle se ejecutan además
de forma explícita en sus propios contenedores, sin cargar `.env` operativo.
El cierre final registra su resultado separado abajo.

### Resultado final repetido por el controlador

**16 casos añadidos y 4 pruebas existentes adaptadas**, sin dependencias nuevas ni
pruebas eliminadas. Tras revisar la cobertura se añade una sola carrera de
cancelación/pago en ambos órdenes; ambos backends deben estar bloqueados antes de
liberar el hospedaje. El importador verifica además un total histórico de
`4_000_012_345` centavos, superior a int4, conservado exactamente.

```bash
npm test
# Test Files 69 passed | 8 skipped (77)
# Tests      472 passed | 20 skipped (492)
# exit 0

NODE_ENV=development PRISMA_TEST_DATABASE=1 ./node_modules/.bin/vitest run \
  modules/bookings/_test_/booking-db.test.ts \
  infrastructure/prisma/_test_/plan1-postgres.test.ts
# Test Files 2 passed (2)
# Tests      14 passed (14): 11 B2 + 3 migración/identidad
# exit 0, 58.22 s

./node_modules/.bin/tsc --noEmit --incremental false --pretty false
npm run lint
npm run build
git diff --check
# Todos exit 0; lint conserva 0 errores y los 3 avisos indicados arriba.
```

El controlador revisó los tests/worker y repitió las dos suites anteriores sobre
los archivos finales. Los 20 skipped de la ejecución normal incluyen los 14 tests
opt-in ejecutados explícitamente; los 6 restantes son opt-in anteriores que no
se habilitaron indiscriminadamente porque algunos cargan `.env`. La persistencia,
concurrencia y ciclo de referidos de B2 sí se prueban sobre la base desechable.

**Incidencia intermitente registrada, no ocultada:** una ejecución de la suite
completa simultánea con tsc/lint agotó los 5 segundos de una prueba existente de
revocación en `blog-editor-integration.test.tsx` (471 pass / 1 timeout). La suite
completa posterior, ejecutada sola y sin cambiar código ni aumentar timeouts,
pasó con 472 pruebas. No se podó ni relajó esa regresión de autorización.

- [x] Importación repetible/no destructiva, historial y secuencia.
- [x] Snapshot económico y título estables tras cambiar catálogo.
- [x] CAS cotización/pago y capacidades exactas con DTO/cabeceras privados.
- [x] Dos procesos/conexiones reales: solapes, adyacencia, cancelación/pago en
  ambos órdenes, idempotencia y pago tardío sin reconfirmación.
- [x] GET sin reconciliar; POST con evidencia validada y mock bloqueado en producción.
- [x] Referido único, sincronización autorizada y recuperación tras fallo de BD.
- [x] Recorrido de navegador con pago simulado y comprobación SQL/HTTP.
- [x] Ningún store operativo de reservas en memoria/archivo; grep de
  `readFileSync|writeFileSync|__getawaysBookingStore|updateBooking(` sin coincidencias
  en `modules/bookings/server/*.ts`.

**Testing técnico B2 completado.** No equivale a la aceptación de la entrega por
la persona solicitante, a un despliegue ni al recorrido BTCPay de H/T/P. Los
contenedores de prueba fueron eliminados; Compose operativo sigue sano.

## Límites

- Sin proveedor real, pagos testnet o cuentas de huéspedes; H/T/P siguen pendientes.
- El mock Bitcoin conserva evidencia solo dentro de un proceso; no demuestra
  pagos compartidos entre instancias ni funcionamiento tras reiniciar el proveedor.
- No acredita producción, C1/C2 ni restauración del respaldo fresco del corte.
