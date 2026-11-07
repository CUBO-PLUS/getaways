# [x] Fases T/P — BTCPay remoto y pago de prueba local

[Orden y criterios vigentes](../README.md) · [Configuración y operación local](infraestructura-local.md).

**Implementación revisada con subagentes GPT-6 Luna, 2026-11-05.** Los cambios se
trasladaron sin commit al directorio original, en `feature/btcpay-testnet-reservas`.
Aquella revisión técnica no aceptaba T/P ni acreditaba el recorrido pagado; el
cierre local posterior se registra a continuación. No se habilita mainnet.

## Cierre local aceptado — 2026-11-07

La persona solicitante confirmó «ya hice mi verificacion y me parece bien todo» y
pidió «cierra lo que queda pendiente». **T/P quedan cerradas y aceptadas para el
entorno local**, junto con 3.4/C1 y el plan 3, con las excepciones operativas de
este documento. Responsable de aceptación: persona solicitante; referencia del
árbol previo a esta actualización documental: `0decd80`.

Evidencia operativa posterior a la activación, sin repetir pagos ni migraciones:

- La factura de la **reserva 2** se comprobó en BTCPay con `Settled/None`, importe
  y pago de **USD 1.00**, saldo pendiente cero y pago on-chain liquidado. Identidad,
  tienda, destino y referencia coincidieron. Acredita la pagabilidad observada del
  dólar en testnet, no una garantía con cualquier cotización/comisión futura.
- La prueba de despliegue había caducado y el webhook no estaba configurado. Se
  renovó mediante el preflight existente y se ejecutó la reconciliación autoritativa
  del proveedor, `markPaid` y sincronización de referidos. Resultado comprobado:
  reserva `confirmed`, intento `paid`, sin revisión; cotización, fechas y referencia
  preservadas. Repetir `markPaid` fue idempotente, sin cambiar la versión.
- La persona solicitante confirmó «ya aparece como pagada». Esta confirmación y la
  aceptación funcional actual no se presentan como inspección independiente de
  todas las pantallas de administrador y huésped.
- Se implementó el botón temporal de refresco manual en el detalle administrativo,
  mediante POST autorizado a `/api/admin/bookings/[id]`. Reutiliza los controles de
  proveedor, prueba vigente y evidencia de liquidación; no crea facturas ni fuerza
  un estado financiero. Las pruebas aisladas del refresco no mutaron pagos reales.
- Se conservan los resultados técnicos registrados abajo: **491 pruebas generales
  y 33 integraciones de reservas aprobadas**, con los límites indicados. No se han
  vuelto a ejecutar por esta actualización documental.

**Excepciones del cierre:** no hay callback público/secreto de webhook operativos
acreditados; se acepta por ahora la reconciliación explícita. La prueba firmada
continúa caducando a los diez minutos y requiere renovación. El aislamiento entre
huéspedes tiene evidencia automatizada, pero no se da por ejecutado un recorrido
pagado real con dos cuentas. Tampoco se acredita el ensayo de restauración del
respaldo fresco. Se mantienen pendientes antes de certificar automatización,
recuperación u otro destino. No se cobró el precio real de la estancia, no se
habilita producción/mainnet ni se autoriza modificar el VPS o desplegar la app.

Los apartados fechados siguientes conservan el estado de cada comprobación anterior;
sus pendientes históricos de pago y aceptación quedan sustituidos por este cierre.

## Activación local autorizada — 2026-11-07 UTC

**Limpieza posterior autorizada — 2026-11-07:** retirados el proveedor
`btc-mock`, la dirección placeholder, la interfaz de simulación y su acción API.
Solo `PAYMENT_PROVIDER=btcpay-testnet` selecciona pagos; una configuración ausente
u obsoleta los deshabilita, sin fallback. El checkout identifica Testnet y el
importe real del intento: **USD 1.00 para nuevos intentos**, conservando el
centavo de los históricos. No se cambia la cotización del hospedaje, las filas,
las referencias de pagos ni las restricciones de producción/mainnet o de prueba
de despliegue. La referencia mock histórica no se convierte ni se reemplaza.
Las menciones a simulación conservadas más abajo son evidencia histórica.

Verificación de la limpieza: `pnpm exec vitest run --maxWorkers=1`, **491 pruebas
aprobadas y 42 opt-in omitidas**; `pnpm exec next build`,
`pnpm exec tsc --noEmit --incremental false` y `git diff --check` correctos.
`pnpm lint`: cero errores y dos avisos previos. La primera corrida con dos workers
mostró un fallo intermitente en `booking-detail.test.tsx`, no modificado por esta
limpieza; pasó aislado y en la repetición general serial. Esto no acredita una
factura pagada en el VPS ni una nueva aceptación operativa.

Integración final aislada: `PRISMA_TEST_DATABASE=1 pnpm exec vitest run
modules/bookings/_test_/booking-db.test.ts --maxWorkers=1 --reporter=verbose`,
**33/33 aprobadas** en 245.93 s. PostgreSQL desechable y servidor HTTP BTCPay
sintético; sin usar la BD, el bucket ni BTCPay reales. Se conservaron las pruebas
de USD 1.00/centavo histórico, idempotencia, rechazo de simulación y configuración
obsoleta, aislamiento de huéspedes, permisos, carreras y recuperación de referidos.

- Autorización explícita para migrar la base local y activar BTCPay, sin commits.
  Respaldo completo reciente verificado por SHA256 y dump PostgreSQL previo adicional
  en `src/backups/btcpay-local-activation-20261107/`, con listado de restauración válido.
- Base `gateways` local: dos migraciones existentes, siete operaciones; origen
  `2deb3c565ad1d334c7e7cef4c50b31feeae096e88fedc03cfe6b4d38384ff18a`, destino
  `037777a4bf2bc4f8541a71ef82b3d78039573f89b113ecf5038b9f87007998f0`.
  Contenido exacto de las **17 tablas previas preservado**; nueva `PaymentAttempt`
  vacía. `db verify` aprobó; segunda migración: cero operaciones, ya actualizada.
- `.env.local` privado `0600` selecciona el proveedor remoto y la tienda actual.
  La clave se sigue leyendo del `.env` existente; no se cambió ese archivo ni las
  variables de DB, sesiones o RustFS. Core se verificó por el génesis **testnet4**
  `00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043`.
  La wallet `0/0` coincide con la verificada de Sparrow y el preflight GET aprobó.
- Next local reiniciado en `http://localhost:3000`; proveedor y prueba válida
  comprobados, inicio HTTP 200 y API habilitada con respuestas privadas sin caché.
  La única reserva existente conserva su referencia mock: no se convierte ni se
  abre una factura de reemplazo; usar una nueva reserva para evaluar BTCPay.
- No se crearon facturas, pagos, reembolsos ni commits. No se repitió la suite de
  código por esta operación de configuración/migración. La prueba dura diez minutos;
  renovarla según la guía. En esa activación aún faltaban pago y aceptación,
  completados posteriormente según el cierre anterior; callback público y secreto
  de webhook siguen pendientes. Los apartados siguientes conservan evidencia histórica.

**Cambio de destino — 2026-11-06:** el operador configuró BTCPay en un VPS y pidió
eliminar el stack local. Se retiraron únicamente los cuatro contenedores, cinco
volúmenes y red de `btcpayverify79659`; los volúmenes de PostgreSQL/RustFS de la app
permanecen intactos. El origen actual es `https://btcpay.mauriciodmo.com`; la API
autenticada responde 200. La app admite prueba de despliegue remota HTTPS sin
Docker local, ligada a la primera dirección SegWit testnet comprobada del operador.
[Configuración, permisos y límites actuales](infraestructura-local.md#destino-actual-vps-por-https).
No se reutilizan referencias de la tienda anterior.
La adaptación HTTPS aprobó 3 pruebas (incluyen el script real, firma y bloqueo ante
fallos), 28 integraciones de reservas, 6 pruebas de interfaz y la suite general:
72 archivos / 483 tests aprobados, 8 archivos / 37 tests opt-in omitidos. TypeScript
y lint aprobados con los dos avisos previos. La clave renovada permite consultar la
wallet y su primera dirección coincide con la testnet verificada del operador.

**Verificación real — 2026-11-07 01:17 UTC:** la API del VPS respondió 200 con
`fullySynched=true` y `BTC-CHAIN available=true`. El preflight remoto aprobó y
generó una prueba privada `0600`, aceptada por el validador de la aplicación,
vinculada a origen, tienda y wallet esperados. La prueba dura **diez minutos** y
debe renovarse para operar después de expirar; no constituye activación permanente.
No se creó ninguna factura ni se enviaron fondos. Siguen pendientes payabilidad y
recorrido pagado del cargo autorizado, aceptación/corte y callback público/secreto de webhook.

**Importe autorizado — 2026-11-07 UTC:** el centavo equivale a unos 13 satoshis con
la cotización observada y queda por debajo del umbral P2WPKH de 294 satoshis.
La persona solicitante autorizó **USD 1.00 para nuevos intentos**. El precio real
de estancia no cambia. Los intentos históricos mantienen su centavo y referencias;
su lectura, recibo y reconciliación usan el importe persistido, no el nuevo valor.
No se abrió una factura de reemplazo para el intento anterior.

Migración aditiva `20261107T0153_allow_one_dollar_testnet_charge`:

```text
Origen: 0d32b087bdfeef5332ecc93ef9418fee8920c339af67a41247f8443589ebae7b
Destino: 037777a4bf2bc4f8541a71ef82b3d78039573f89b113ecf5038b9f87007998f0
Migración: 93f134750ed867d66da88b2be9fe7b84a0fced501dacd0e81c8f374710c4e40c
```

Dos operaciones de restricción: permitir los importes persistidos de 1 y 100
centavos, sin modificar filas ni migraciones anteriores. En el ensayo inicial se
aplicó únicamente en la base sintética: comparación exacta de las 18 tablas públicas
antes/después aprobada, incluidos reservas, intento antiguo y referencias;
`db verify` aprobó esquema y marcador. La posterior migración local autorizada se
documenta al inicio de esta guía.

Verificación del cambio a un dólar: **29/29** pruebas PostgreSQL/HTTP y **8/8**
de BitcoinPanel aprobadas, incluida compatibilidad con intentos antiguos y rechazo
de importes discordantes. Suite general final `npm test -- --maxWorkers=2`:
**72 archivos / 485 tests aprobados**, 8 archivos / 38 tests opt-in omitidos.
TypeScript y `git diff --check` aprobados; lint sin errores y con dos avisos previos.
Esto no acredita una factura real pagable ni una liquidación con fondos de testnet.
La renovación final de la prueba remota falló con **HTTP 503 de BTCPay**; no se
renovó la vigencia. La evaluación de pagos requiere recuperar el VPS y aprobar
de nuevo el preflight. No se modificó el VPS ni se reintentaron facturas.
**Recuperación posterior:** tras comunicar el operador un reinicio del servicio,
una nueva verificación GET aprobó y renovó la prueba por diez minutos. El 503
anterior ya no bloquea; la factura de un dólar y su liquidación siguen sin probarse.

## T — Histórico de infraestructura local verificada y retirada

- Compose opcional con Bitcoin Core `32.1`, NBXplorer `2.6.21`, BTCPay `2.4.7`
  y PostgreSQL `18.6`. Red **testnet3**, on-chain; sin Lightning.
- Poda XXS de 5 GB, datos persistentes y RPC/PostgreSQL/NBXplorer sin publicación
  al host. BTCPay se publica únicamente en loopback, puerto 3002 por defecto.
- Conexión opcional con la red de la app y excepción SSRF exacta `app:3000`;
  no se desactiva la protección ni se permiten subredes completas.
- La versión fijada está por encima del rango afectado por el aviso de seguridad
  `2.4.1` y anteriores. No se reutilizaron wallets ni secretos de otra instancia.

Verificación real del proyecto aislado `btcpayverify79659`:

```text
Core: chain=test, pruned=true, prune_target_size=5242880000
NBXplorer: HTTP 200, network=Testnet
BTCPay: HTTP 200, publicación 127.0.0.1:3002
```

En esa comprobación Core seguía en IBD, con altura 0. No se verificaron tienda,
wallet, recepción de fondos ni entrega de webhooks a la app operativa. El arranque
de servicios no sustituye esos requisitos.

## P — Contrato implementado

- Activación explícita de BTCPay; configuración desconocida no cae silenciosamente
  al mock. Producción y mainnet quedan bloqueadas.
- Preflight del operador emite una prueba privada firmada, ligada a URL, tienda y
  testnet, con vigencia máxima de diez minutos. El modo local verifica Docker/Core
  y admite host o `http://btcpay:49392`, sin socket Docker en la app. El modo VPS
  verifica API HTTPS, sincronización y primera dirección de wallet testnet
  previamente comprobada por el operador; no inventa inspecciones de Core remoto.
- Un intento persistido por reserva se crea antes de llamar al proveedor y congela
  la cotización. El importe real de la estancia se conserva separado de la factura
  de **USD 1.00** para nuevos intentos. No hay llamadas de red dentro de la transacción.
- Una respuesta incierta se reconcilia por `orderId` estable, sin repetir el POST
  de factura. No se abre un reemplazo automáticamente.
- Webhook HMAC acotado y reconciliación contra la API autoritativa; la notificación
  por sí sola no confirma. Se verifican identidad, tienda, moneda, importes, método
  on-chain, destino y evidencia liquidada. GET e historial no mutan estados.
- Direcciones testnet con checksum y umbrales de polvo por tipo de salida. Un
  importe no pagable queda en revisión, **sin aumentar automáticamente el cargo**.
- Pago completo sin confirmaciones espera; parciales, tardíos, vencidos, marcados
  manualmente o conflictivos requieren revisión. Una reserva cancelada nunca se
  reconfirma y cancelar no implica reembolsar.
- Checkout, recibo e historial distinguen el cargo de prueba del precio real y muestran el importe histórico de cada intento.
  Ante revisión, cancelación o estado no verificable se ocultan las instrucciones
  de envío; la recuperación exige una nueva verificación satisfactoria.

## Migración y preservación

```text
Paquete: 20261105T1241_add_btcpay_payment_attempts
Origen H: 2deb3c565ad1d334c7e7cef4c50b31feeae096e88fedc03cfe6b4d38384ff18a
Destino P: 0d32b087bdfeef5332ecc93ef9418fee8920c339af67a41247f8443589ebae7b
Migración: 77f3690784c66834eab4a45c73abc6c769a7cc21ad2a86c339d5020a897fa4b9
```

Cinco operaciones aditivas: tabla de intentos, unicidad por reserva y factura,
índice de estado y FK `Restrict`. No se reescribieron migraciones anteriores.

El controlador ensayó H → P sobre PostgreSQL 18 tmpfs **desechable**, con blog y
referidos sintéticos no vacíos. Comparó el contenido exacto de las 17 tablas previas,
no solo cantidades:

```text
apply: PASS exact preservation of 17 existing tables; PaymentAttempt empty
repeat: PASS exact preservation of 17 existing tables; PaymentAttempt empty
verify: PASS schema and marker match P contract
```

No se escribió en la base operativa. Antes del corte siguen siendo necesarios
autorización, respaldo fresco y los controles de recuperación de la
[guía común](../comunes/transicion-y-recuperacion.md).

## Verificación técnica y límites

La integración automatizada usa PostgreSQL desechable, procesos independientes y
un servidor HTTP local en la frontera de BTCPay. No simula el ORM ni depende de
fondos o servicios externos. Conserva los casos anteriores B2/H y añade pruebas de
intento único, resultado incierto, aislamiento de propietarios, firma/repeticiones,
estados financieros, direcciones testnet, cancelación y recuperación de interfaz.

La revisión técnica de P terminó con **especificación y calidad aprobadas** tras
corregir regresiones reproducidas antes del arreglo. Cierre técnico de P:

```bash
PRISMA_TEST_DATABASE=1 npm test -- modules/bookings/_test_/booking-db.test.ts
# 28 passed, 0 failed; B2/H/P/C1 + cambio de proveedor, PostgreSQL desechable + HTTP local.
npm test -- components/organisms/_test_/BitcoinPanel.test.tsx
# 6 passed, 0 failed; estados terminales y recuperación por verificación explícita.
npx tsc --noEmit --incremental false
# exit 0, incluyendo tests.
git diff --check
# exit 0.
python3 -m unittest scripts._test_.test_verify_btcpay_testnet -v
# 2 passed: proyecto reutilizado, readiness y colisiones previas a compose up.
```

La revisión global de T/P/C1 y su repetición final aprobaron especificación y
calidad. El cierre corrigió y protegió con regresión que cambiar la configuración
BTCPay → mock no permita confirmar una referencia BTCPay mediante simulación.
El verificador reutiliza el proyecto seleccionado, rechaza colisiones de puerto o
subred antes de arrancar y espera al RPC de Core de forma acotada; sus pruebas de
contrato no se presentan como una nueva ejecución real de Docker/BTCPay.

La suite general del cierre inicial aprobó 71 archivos y 480 tests (8 archivos y 37 tests
opt-in omitidos, no acreditados como ejecutados). Identidad sobre otro PostgreSQL
desechable: 3/3 aprobados. Lint: cero errores y dos avisos anteriores, sin
supresiones para ocultarlos.

Build del cierre inicial, anterior a la adaptación HTTPS: `npm run build -- --webpack` **exit 0**, con emisión
del contrato Prisma, compilación optimizada, TypeScript y generación de 23 páginas
aprobadas. Incluye las rutas dinámicas `/admin/bookings`, su detalle, las cinco
rutas API del panel y `/api/webhooks/btcpay`. Se ejecutó con entorno explícito y
PostgreSQL sintético desechable; no leyó credenciales ni escribió en la base
operativa. El servidor de pruebas se detuvo antes para no compartir `.next` con
el build. La adaptación HTTPS repitió pruebas, TypeScript y lint, no un nuevo build.
Este resultado no habilita el flujo testnet en producción.

En aquella entrega los cambios estaban **sin commit ni merge**, en el worktree
aislado. La activación y aceptación locales posteriores se registran al inicio;
no se deducen de estas pruebas. El panel conserva contacto, notas, refresco manual
de pago y cancelación, sin permisos implícitos para reembolsar, recotizar o modificar
referidos.

## Seguimiento del cierre local y excepciones pendientes

- [x] Sincronización reportada por la API del VPS, URL/tienda/wallet y preflight remoto verificados (2026-11-07 01:17 UTC); renovar prueba efímera antes de operar. No acredita inspección RPC/Docker del VPS.
- [x] Tienda, wallet testnet y acceso API del operador comprobados; configuración
  privada fuera de Git y permisos necesarios documentados. No acredita auditoría
  exhaustiva de permisos del VPS.
- [x] Registrar el bloqueo de USD 0.01 y la autorización del operador para USD 1.00.
- [x] USD 1.00 pagable y liquidado en testnet; reserva 2 confirmada con evidencia
  autoritativa y visualización de pago confirmada por la persona solicitante.
- [x] Migración y habilitación local autorizadas, con respaldo y preservación de las
  17 tablas previas; evidencia de corte registrada. No equivale a ensayo de restauración.
- [x] Registrar aceptación funcional local T/P y C1 por la persona solicitante el 2026-11-07.
- [ ] Configurar y verificar callback HTTPS público y secreto de webhook; mientras
  tanto se mantiene el refresco explícito y la renovación de la prueba de diez minutos.
- [ ] Completar recorrido real con dos cuentas aisladas, incluido historial; las
  pruebas automatizadas de propiedad no se presentan como ese recorrido operativo.
- [ ] Ensayar la restauración del respaldo fresco y completar controles de recuperación
  para otro destino; excepción operativa del cierre local.

El proveedor mock y su acción de simulación se retiraron; se conservan referencias
históricas sin convertirlas. Los pagos sintéticos y el servidor HTTP de integración
no acreditan por sí mismos cobros de BTCPay. El pago operativo de USD 1.00 fue de
testnet, no del precio real de la estancia.
