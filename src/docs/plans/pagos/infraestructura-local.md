# BTCPay testnet — API remota en VPS

## Destino actual: VPS por HTTPS

Por petición del operador se consume **`https://btcpay.mauriciodmo.com`**. El stack
local de verificación fue apagado y se eliminaron sus cuatro contenedores y cinco
volúmenes, sin tocar PostgreSQL/RustFS de la app. Los dos archivos Compose de pagos
se retiraron del repositorio. **No ejecutar el verificador del stack local**:
las instrucciones locales de abajo son históricas y ya no están soportadas.
El entorno local conserva `compose.dev.yaml`, con la app, PostgreSQL y RustFS;
los volúmenes `postgres_data` y `rustfs_data` se mantienen.

**Cierre local aceptado — 2026-11-07:** T/P y el panel C1 están aceptados tras la
verificación de la persona solicitante. El pago de USD 1.00 de testnet de la reserva
2 quedó liquidado y reconciliado. [Evidencia y excepciones](README.md#cierre-local-aceptado--2026-11-07).
La operación aceptada utiliza reconciliación explícita, incluido el refresco manual
del panel; webhook automático y recuperación ensayada siguen pendientes. La prueba
firmada conserva su vigencia de diez minutos: el cierre no la vuelve permanente.

**Activación local del 2026-11-07 UTC:** las migraciones de pagos se aplicaron con
autorización sobre la base local, sin modificar sus datos previos. El proveedor
remoto está configurado para la app host en `http://localhost:3000`; `.env.local`
es privado y no sustituye la clave actual del `.env`. Core remoto se comprobó por
el génesis de **testnet4**. El valor de aplicación `BTCPAY_NETWORK=testnet` es una
etiqueta genérica del contrato, no una instrucción para cambiar Bitcoin Core.
Las direcciones `tb1` y las claves públicas no distinguen testnet3 de testnet4:
comparar solo la wallet no demuestra qué cadena está siguiendo el nodo.

Configura estas variables en el entorno privado de la app o en `.env.local`
ignorado por Git. Conserva aparte sus variables de base de datos y almacenamiento;
no copies el entorno completo de otra aplicación:

```dotenv
PAYMENT_PROVIDER=btcpay-testnet
BTCPAY_NETWORK=testnet
BTCPAY_API_URL=https://btcpay.mauriciodmo.com
BTCPAY_STORE_ID=<ID devuelto por la API de este VPS>
BTCPAY_API_KEY=<clave restringida a esa tienda>
BTCPAY_EXPECTED_WALLET_ADDRESS=<primera dirección SegWit testnet de Sparrow, ruta 0/0>
BTCPAY_DEPLOYMENT_PROOF_PATH=<ruta privada al archivo de prueba>
BTCPAY_DEPLOYMENT_PROOF_KEY=<32 bytes aleatorios en hexadecimal>
```

El ID de tienda está ligado al origen de la API. No se migran ni reinterpretan
facturas/intentos anteriores al cambiar de servidor. La clave necesita los permisos
`btcpay.store.cancreateinvoice`, `btcpay.store.canviewinvoices`,
`btcpay.store.canviewstoresettings` y, para comprobar la red de la wallet remota,
**`btcpay.store.canviewwallet`**. Este último es de lectura; **no** se necesitan
permisos para gastar, firmar transacciones o modificar la wallet.

Desde `src/`, carga exclusivamente esas variables privadas y ejecuta:

```sh
node --env-file=.env --env-file=.env.local scripts/btcpay-deployment-preflight.mjs
```

En modo remoto el preflight **no usa Docker**. Comprueba HTTPS sin redirecciones,
versión fijada, sincronización completa y `BTC-CHAIN` habilitado. Consulta el preview
de la wallet y compara la dirección `0/0` generada por la red del servidor con la
primera dirección testnet previamente comprobada en Sparrow. El soporte remoto
actual es SegWit nativo P2WPKH (`tb1q…`); no se adivinan rutas, multisig o Taproot.
No basta `BTCPAY_NETWORK=testnet`: server info no publica la red y por eso se exige
también la comparación de la wallet. No solicita ni guarda claves privadas/semilla.

Solo al aprobar todo escribe una prueba HMAC privada `0600`, vinculada a origen,
tienda, dirección y red, con vigencia máxima de diez minutos. Renuévala antes de
evaluar pagos. El modo remoto confía en la API autenticada del VPS bajo TLS; **no
declara haber inspeccionado sus contenedores ni el RPC de Core**. El modo Docker
opcional conserva sus verificaciones independientes anteriores.

Sin sincronización, con `403` al consultar la wallet o con una dirección diferente
no se emite la prueba ni se habilita el checkout. No se crea una factura para probar
credenciales. Producción y mainnet siguen bloqueadas para el cargo de prueba.

Para webhooks configura además `BTCPAY_WEBHOOK_SECRET` y un callback HTTPS
**públicamente alcanzable por el VPS** hacia `/api/webhooks/btcpay`. `localhost:3003`
no es alcanzable desde el VPS y no se abre ningún túnel ni excepción SSRF general.
Mientras no exista ese callback, usa reconciliación explícita autenticada; no se
declaran notificaciones automáticas operativas.

## Histórico retirado: infraestructura local (no ejecutar)

Este Compose opcional usa **testnet (testnet3)**: las versiones fijadas del contenedor Bitcoin aceptan `BITCOIN_NETWORK=testnet` y generan `testnet=1`/`[test]`; `testnet4` no es el contrato soportado por ese entrypoint. Core, NBXplorer y BTCPay comparten la selección `testnet`. No modifica app/PostgreSQL/RustFS. No iniciar Lightning ni aceptar fondos reales.

## Preparación y arranque

No se necesitan credenciales para RPC: Core usa su cookie RPC, compartida solo con NBXplorer; PostgreSQL sigue el modelo upstream `trust` en la red privada del stack. No publicar Postgres/RPC/NBXplorer al host. No añadir ni crear claves/wallets.

Desde `src/`, usa siempre el proyecto Compose explícito `gateways-btcpay-testnet` (el mismo predeterminado por el verificador):

```sh
docker compose -p gateways-btcpay-testnet -f compose.btcpay.testnet.yaml --profile btcpay config -q
BTCPAY_VERIFY_PROJECT=gateways-btcpay-testnet BTCPAY_PORT=3002 ./scripts/verify-btcpay-testnet.sh
```

La segunda orden arranca o reutiliza ese mismo proyecto y hace la verificación; ejecuta exactamente la misma orden para repetirla. La interfaz se publica solo en loopback, `http://localhost:3002` (o `BTCPAY_PORT`). Core RPC (43782), P2P (39388) y NBXplorer (32838) solo se exponen dentro de la red Docker. La app del host accede mediante `http://localhost:3002`; desde otro contenedor, localhost no es el host. No uses un proyecto aleatorio para la verificación: no aísla puertos ni subredes.

Si ya existe un stack BTCPay y su proyecto Compose es diferente, selecciónalo explícitamente y usa su puerto publicado. El nombre del proyecto, servicio e IPAM deben corresponder al stack existente:

```sh
BTCPAY_VERIFY_PROJECT=mi-proyecto-existente BTCPAY_PORT=3002 ./scripts/verify-btcpay-testnet.sh
```

El verificador revisa antes de `up` si otro contenedor ocupa ese puerto o si otra red Docker se solapa con `172.31.0.0/24`; ante conflicto termina con diagnóstico sin crear contenedores/redes. No ejecuta `down`, borra volúmenes ni cambia una red existente. Para usar otra subred hay que cambiarla deliberadamente en Compose y revisar el diseño antes de verificar.

Para webhook saliente hacia la app local, no uses localhost ni actives una excepción general. Solo cuando la red dev `gateways-dev_default` ya exista, inicia con `compose.btcpay.integration.yaml` además del Compose base. Este une BTCPay a la red existente y aplica exactamente `BTCPAY_SSRFEXCEPTIONS=app:3000`; configura en la tienda un URL controlado `http://app:3000/<ruta-de-webhook-real>`. `app:3000` es el nombre/puerto interno del servicio, no una ruta de aplicación inventada; confirma primero qué ruta admite la app. La excepción habilita solo ese hostname/puerto, no destinos arbitrarios, y se valida aparte cualquier redirección a IP privada. El overlay requiere que el stack dev ya esté funcionando; no lo crea ni modifica. Sin ese overlay, no declares webhooks app↔BTCPay configurados.

## Verificación antes de pruebas

El verificador reintenta de forma acotada el RPC Core al arrancar y comprueba `getblockchaininfo` (`chain=test`, `pruned=true`, objetivo de poda), además de respuestas HTTP de NBXplorer/BTCPay. Informa el estado IBD/altura, pero **no prueba sincronización completa ni altura actual**. Para habilitar checkout, el preflight de identidad posterior sí requiere Core sincronizado (`initialblockdownload=false`) y BTCPay sincronizado; la operación real necesita además onboarding de tienda/wallet y prueba de fondos/pago. No cambies la red con volúmenes existentes.

Completa onboarding, crea una tienda y configura su wallet BTC on-chain testnet. Confirma en la UI que tienda, wallet y nodo indican testnet y que existe una dirección de recepción. No guardes seeds ni credenciales en este repositorio. La poda `5000` conserva aproximadamente 5 GB de bloques y no sirve para Lightning.

## Aplicación (opt-in explícito)

El flujo BTCPay requiere `PAYMENT_PROVIDER=btcpay-testnet`, `BTCPAY_NETWORK=testnet`, `BTCPAY_API_URL`, `BTCPAY_STORE_ID`, `BTCPAY_API_KEY`, `BTCPAY_DEPLOYMENT_PROOF_PATH` y `BTCPAY_DEPLOYMENT_PROOF_KEY`; para notificaciones requiere además `BTCPAY_WEBHOOK_SECRET`. Nunca pases secretos al navegador ni los guardes en Git. Producción siempre deshabilita el cargo fijo de testnet. Además del VPS HTTPS descrito arriba, el preflight opcional local soporta una app en el host (`http://127.0.0.1:3002`) o el servicio `app` de `compose.dev.yaml` (`http://btcpay:49392`), con comprobación de red Docker exacta y sin excepciones SSRF amplias.

### Prueba efímera de identidad del despliegue

`BTCPAY_DEPLOYMENT_PROOF_KEY` debe ser una clave aleatoria de 32 bytes hex (64 caracteres), compartida por el operador y el proceso de app, pero nunca almacenada en el repositorio. El archivo se mantiene en `src/.local/` (ignorado por Git y montado por el bind mount de desarrollo `.:/app`); usa mode `0600` y configura `BTCPAY_DEPLOYMENT_PROOF_PATH` al mismo archivo desde el namespace de cada proceso. Genera/renueva la prueba desde `src/` justo antes de usar pagos:

```sh
export BTCPAY_DEPLOYMENT_PROOF_KEY="$(openssl rand -hex 32)" # conservar solo en entorno privado de app/operador
export BTCPAY_API_URL=http://127.0.0.1:3002
export BTCPAY_STORE_ID='<store-id>'
export BTCPAY_DEPLOYMENT_PROOF_PATH="$HOME/.local/share/btcpay-testnet-proof.json"
node scripts/btcpay-deployment-preflight.mjs --project gateways-btcpay-testnet --api-url "$BTCPAY_API_URL" --store-id "$BTCPAY_STORE_ID" --proof-path "$BTCPAY_DEPLOYMENT_PROOF_PATH"
```

Para la app dentro del Compose dev, el `BTCPAY_API_URL` runtime debe ser **exactamente** `http://btcpay:49392`; el preflight comprueba el loopback publicado por separado y solo firma ese alias interno cuando verifica el mismo contenedor BTCPay y la red real de `gateways-dev/app`. Inicia la integración opcional solo con el stack dev ya activo:

```sh
docker compose -p gateways-btcpay-testnet -f compose.btcpay.testnet.yaml -f compose.btcpay.integration.yaml --profile btcpay up -d
```

Configura el `.env.local` ignorado por Git que se monta como `/app/.env.local` en `compose.dev.yaml` con `BTCPAY_API_URL=http://btcpay:49392`, `BTCPAY_DEPLOYMENT_PROOF_PATH=/app/.local/btcpay-deployment-proof.json` y los mismos valores privados de tienda/API key/webhook/proof key del operador. El path correspondiente en el host es `src/.local/btcpay-deployment-proof.json`. Desde `src/`, genera el proof para esa API alcanzable por app y para el loopback exacto publicado:

```sh
node scripts/btcpay-deployment-preflight.mjs \
  --project gateways-btcpay-testnet \
  --api-url http://btcpay:49392 \
  --probe-url "http://127.0.0.1:${BTCPAY_PORT:-3002}" \
  --app-project gateways-dev --app-service app --app-network gateways-dev_default \
  --store-id "$BTCPAY_STORE_ID" \
  --proof-path .local/btcpay-deployment-proof.json
```

El preflight solo inspecciona Docker/Core y hace GETs; no crea wallet ni factura. Comprueba imágenes/labels fijados, mapping loopback→BTCPay, `BTCPAY_NETWORK=testnet`, `NBXPLORER_NETWORK=testnet`, RPC `http://bitcoind:43782/`, peer `bitcoind:39388`, aliases de red BTCPay→NBXplorer→Core y, en modo app-container, el contenedor `gateways-dev/app` compartiendo `gateways-dev_default` con alias `btcpay`. Luego verifica BTCPay 2.4.7/sync, BTC-CHAIN habilitado y Core 32.1 con `getblockchaininfo.chain=test` e IBD falso. Emite JSON HMAC-SHA256 ligado al **API_URL que realmente usa la app**, probe loopback, tienda, red, ambos contenedores de pago y, en modo contenedor, ID del app/servicio/red/alias; TTL máximo 10 minutos y archivo `0600`. La app valida HMAC en tiempo constante, permisos/archivo, expiración y origen/tienda/red antes de create/get/reconcile/webhook y de habilitar checkout. Si cambia el contenedor/app/red, puerto, tienda, red o expira la prueba, repite el preflight. `BTCPAY_DEPLOYMENT_PROOF_KEY` debe mantenerse igual al generar y validar; rotarla invalida la prueba anterior.

La clave API solo necesita `btcpay.store.cancreateinvoice`, `btcpay.store.canviewinvoices` y `btcpay.store.canviewstoresettings`; no habilites `canmodifystoresettings`. No uses `includeConfig=true`: además de requerir permiso más amplio puede revelar configuración/xpub. El runtime consulta server info y método de tienda, pero solo habilita el checkout después de validar la prueba independiente del preflight. El DTO `ApplicationServerInfoData` de BTCPay v2.4.7 no contiene una propiedad de red.

Cada reserva obtiene como máximo un intento durable, reservado con el total real congelado antes de cualquier solicitud de red. Por autorización del operador, los **nuevos** intentos solicitan `1.00 USD`, solo `BTC-CHAIN`; el importe real permanece como cotización separada. Los intentos anteriores conservan `0.01 USD`: no se recotizan, borran ni se les abre una factura de reemplazo. Cada factura/estado liquidado se compara contra el importe **persistido** de su intento, no contra la configuración nueva. Timeout no provoca un segundo POST: se busca la factura por `metadata.orderId` exacto y cualquier ausencia/ambigüedad queda para revisión. Las lecturas GET no reconcilian; el huésped puede iniciar reconciliación explícita con POST y el webhook firmado solo dispara un GET autoritativo.

Se comprobó que USD 0.01 equivale aproximadamente a 13 satoshis con la cotización del VPS (75892.4 USD/BTC), por debajo de 294 satoshis para P2WPKH; BTCPay rechaza ese importe on-chain. El operador autorizó cambiarlo a USD 1.00; su pago de testnet y la confirmación de la reserva 2 están registrados en el cierre local. Una cantidad BTC vacía, cero, inválida, insegura o inferior al umbral de polvo se retiene para revisión sin mostrar instrucciones ni aumentar automáticamente el importe. Para evaluar el dólar usa una reserva nueva o sin intento de pago; el intento antiguo de un centavo no cambia. No afirmar cobro del precio de estancia ni ejecución de escenarios operativos distintos al registrado.

Webhook entrante de la app: `POST /api/webhooks/btcpay` (configura ese path en el webhook de BTCPay, URL absoluta alcanzable por BTCPay). BTCPay v2.4.7 envía `BTCPay-Sig: sha256=<hex>` como HMAC-SHA256 del cuerpo exacto; la app compara en tiempo constante y vuelve a consultar la factura antes de cambiar reserva.

Fuentes autoritativas fijadas en tag `v2.4.7`: `BTCPayServer/wwwroot/swagger/v1/swagger.template.invoices.json`, `.../swagger.template.serverinfo.json`, `.../swagger.template.stores-payment-methods.json`, `BTCPayServer/Controllers/GreenField/GreenfieldInvoiceController.cs`, `GreenfieldServerInfoController.cs`, `GreenfieldStorePaymentMethodsController.cs`, `BTCPayServer.Client/Models/{InvoiceData,InvoicePaymentMethodDataModel,WebhookInvoiceEvent,CreateInvoiceRequest}.cs`, `BTCPayServer/Plugins/Webhooks/WebhookSender.cs`. Server info efectivamente no publica red; InvoiceData define `storeId`, decimal strings, `status`, `additionalStatus`, `metadata.orderId` y payment methods; el DTO de pago define BTC `amount/due/paymentMethodPaid/payments[].status/destination`; el sender confirma el header de firma citado arriba.

## Webhooks y SSRF

BTCPay protege sus solicitudes HTTP salientes contra SSRF; no desactives esa protección ni agregues excepciones generales (`0.0.0.0/0`, redes Docker completas, localhost). El overlay opcional anterior establece únicamente `app:3000`. Las excepciones aplican globalmente y destinos de redirección se validan por separado. Deja deshabilitado el overlay si no se requiere esa conexión.

## Copias y limpieza

Detén servicios antes del respaldo: copia consistentemente los volúmenes `bitcoin_datadir`, `nbxplorer_datadir`, `btcpay_datadir`, `btcpay_pluginsdir` y `postgres_datadir` con una herramienta de Docker/volúmenes. Protege copias como secretos (pueden incluir datos de wallet); prueba restauración aislada. No uses `down -v` salvo que quieras borrar permanentemente los datos.

El simple arranque de infraestructura no acepta Fase T ni prueba pagos. Su cierre
local posterior se apoya en las verificaciones y aceptación registradas, no en el
arranque histórico de contenedores; no certifica producción ni recuperación.
