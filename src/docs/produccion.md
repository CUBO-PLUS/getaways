# Guía de salida a producción — demo pública Testnet

**Estado: pendiente de preparación y verificación.** Esta guía describe el destino
previsto: la aplicación en un contenedor independiente, en el mismo VPS donde ya
funciona BTCPay. No acredita que los servicios del VPS estén configurados ni autoriza
un despliegue, una migración o cambios en sus datos.

La demo crea facturas **Bitcoin Testnet por USD 1.00**, separadas del precio de la
estancia. No cobra el alojamiento ni admite pagos reales en mainnet. Mostrar esto
claramente a los visitantes y no presentar una reserva de prueba como compra real.

## 1. Bloqueos antes de desplegar

- [ ] Elegir el dominio HTTPS definitivo de la demo y confirmar quién administra
      DNS, certificados, VPS, datos y BTCPay.
- [ ] Publicar en Git el código de la versión aprobada: los cambios locales sin
      commit no estarán en una construcción remota.
- [ ] Resolver el empaquetado: `Dockerfile` copia `.next/standalone`, pero
      `next.config.ts` no declara `output: "standalone"`. Adaptar y probar la imagen
      real antes del despliegue; no asumir que el Dockerfile actual funciona.
- [ ] Adaptar `compose.prod.yaml` o la configuración equivalente del servicio:
      actualmente el contenedor no recibe `BLOG_APP_ORIGIN`, `BLOG_SESSION_SECRET`,
      `AUTH_TRUST_PROXY`, `NEXT_PUBLIC_SITE_URL` ni las variables `PAYMENT_PROVIDER`
      y `BTCPAY_*`. Además fija `S3_ENDPOINT=http://rustfs:9000` y crea su propio
      RustFS: decidir explícitamente si se usará ese servicio o uno existente.
- [ ] Asegurar que la configuración pública necesaria esté disponible durante la
      construcción y en ejecución; el Dockerfile actual no declara argumentos de
      construcción para `NEXT_PUBLIC_SITE_URL`. Comprobar con la imagen construida
      que las URLs y el botón de reserva funcionan. No incluir secretos en la imagen
      ni en variables `NEXT_PUBLIC_*`.
- [ ] Revisar el fallo de la suite general en
      `modules/auth/_test_/credential-form-fallback.test.tsx`: espera el enlace
      «Editar», pero el nombre accesible observado es «EditarEditora». No dar la
      suite por aprobada hasta resolverlo y repetirla.
- [ ] Preparar y ensayar una restauración conjunta de PostgreSQL y objetos RustFS;
      el respaldo local existente no demuestra recuperación en el VPS.

## 2. Red, dominio y acceso

- [ ] Apuntar el dominio al VPS, configurar HTTPS válido en el proxy y comprobar
      renovación de certificados. Redirigir HTTP a HTTPS.
- [ ] Conectar el proxy al puerto interno 3000 de la aplicación; evitar exponer ese
      puerto directamente a Internet. El mapeo actual de `compose.prod.yaml` publica
      `${APP_PORT:-3000}:3000`: ajustarlo según el proxy elegido.
- [ ] Mantener PostgreSQL, RustFS y sus consolas privados; usar redes internas,
      firewall y credenciales de mínimo privilegio. No interpretar `localhost` en
      el contenedor de la app como el VPS ni como otro contenedor.
- [ ] Confirmar que la app puede alcanzar PostgreSQL, RustFS y la API HTTPS de BTCPay,
      y que BTCPay puede alcanzar el webhook HTTPS público de la app.
- [ ] Decidir si el dominio de demo debe aparecer en buscadores. El `robots.ts`
      actual permite indexar páginas públicas; no confiar en `robots.txt` como
      protección de información privada.

## 3. Variables de entorno

Configurar los valores en el gestor de secretos del despliegue. Los ejemplos son
marcadores, no credenciales reales; no copiar secretos al repositorio, logs, URLs
públicas ni capturas. Las variables de servidor deben llegar al **contenedor app**.

| Variable | Uso y valor esperado |
| --- | --- |
| `DATABASE_URL` | **Obligatoria.** PostgreSQL de la aplicación, con host alcanzable desde el contenedor y credenciales restringidas. No usar `localhost` para una BD en otro contenedor. |
| `BLOG_APP_ORIGIN` | **Obligatoria.** Origen HTTPS exacto, por ejemplo `https://demo.ejemplo.com`, sin ruta ni `/` final. Lo usan la autenticación y las comprobaciones de origen. |
| `BLOG_SESSION_SECRET` | **Obligatoria y secreta.** Valor aleatorio estable de al menos 32 bytes; el mismo en todas las réplicas. Rotarlo invalida sesiones. |
| `NEXT_PUBLIC_SITE_URL` | **Obligatoria para el flujo de reserva y URLs públicas.** URL HTTPS de la demo; comprobar que está disponible en build y runtime y que sitemap/canonical usan el dominio correcto. |
| `S3_ENDPOINT` | **Obligatoria.** Endpoint RustFS/S3 alcanzable por la app, por ejemplo `http://rustfs:9000` solo si comparten red y ese es el servicio elegido. |
| `S3_REGION` | **Obligatoria.** Región configurada en el almacenamiento. |
| `S3_BUCKET` | **Obligatoria.** Bucket privado con los objetos correspondientes a la BD. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | **Obligatorias y secretas.** Identidad de aplicación restringida al bucket; no utilizar credenciales root. |
| `PAYMENT_PROVIDER` | **Obligatoria para pagos.** `btcpay-testnet`. Sin opt-in no hay proveedor de pago. |
| `BTCPAY_NETWORK` | **Obligatoria para pagos.** `testnet`; no habilita mainnet. |
| `BTCPAY_API_URL` | **Obligatoria para pagos.** Origen de la API BTCPay testnet alcanzable desde la app, preferentemente HTTPS; sin credenciales en la URL. |
| `BTCPAY_STORE_ID` | **Obligatoria para pagos.** Tienda del servidor y wallet testnet elegidos. |
| `BTCPAY_API_KEY` | **Obligatoria y secreta.** Clave restringida a la tienda y permisos de lectura de servidor/tienda/wallet e inicio y lectura de facturas; verificar contra el servidor desplegado. |
| `BTCPAY_EXPECTED_WALLET_ADDRESS` | **Obligatoria para pagos.** Dirección testnet de recepción `0/0` verificada independientemente; la app la compara con el preview antes de crear facturas. |
| `BTCPAY_WEBHOOK_SECRET` | **Obligatoria para webhook.** Secreto compartido con la configuración del webhook BTCPay; no es la API key. |
| `AUTH_TRUST_PROXY` | Opcional: `0` por defecto. Solo usar `1` si el proxy confiable **sobrescribe** `X-Real-IP` y no se puede acceder directamente a la app. En caso contrario todos comparten un límite de 50 intentos de autenticación por 15 minutos. |
| `UMAMI_API_KEY`, `UMAMI_API_URL` | Opcionales para estadísticas administrativas. Sin clave, esa sección no está disponible; no bloquea reservas. El rastreo público tiene dominio e ID fijados en `shared/analytics/umami.ts`: revisarlos para la demo. |

Si se usa el RustFS incluido en `compose.prod.yaml`, `RUSTFS_ROOT_ACCESS_KEY` y
`RUSTFS_ROOT_SECRET_KEY` son secretos del servicio/operador, no credenciales de app;
configurar volumen persistente y una identidad de aplicación con la política
`infrastructure/storage/blog-media-policy.json`, adaptando sus dos ARN si cambia
el bucket. `APP_PORT`, `RUSTFS_API_PORT` y `RUSTFS_CONSOLE_PORT` solo aplican al
Compose correspondiente. `DATABASE_COMPOSE_HOST` es una adaptación para Compose
local; no asumir que resuelve nombres de servicios del VPS.

El archivo `.env.example` contiene ejemplos de desarrollo y comentarios históricos;
no usarlo como configuración de producción sin revisión. Las variables
`BTCPAY_DEPLOYMENT_PROOF_PATH` y `BTCPAY_DEPLOYMENT_PROOF_KEY` **ya no son requisito
del checkout**: el archivo firmado de diez minutos no debe ser una dependencia
operativa. El preflight anterior puede conservarse como herramienta independiente.

## 4. Datos y almacenamiento

- [ ] Inventariar el origen y destino de PostgreSQL y RustFS, sus propietarios,
      volúmenes y permisos. No reutilizar ni sobrescribir bases o buckets de BTCPay.
- [ ] Respaldar BD y objetos de forma coordinada, proteger secretos y conservar una
      copia externa al VPS. Planificar frecuencia, retención y alertas.
- [ ] Ensayar restauración en un destino aislado; comparar registros, imágenes,
      referencias y accesos sin alterar el origen ni publicar datos privados.
- [ ] Revisar el esquema/marcador y ensayar las migraciones versionadas sobre una
      copia del destino antes de aplicarlas con autorización y respaldo. No ejecutar
      `db:init`, importaciones `--apply` ni restauraciones sobre una BD existente
      sin identificar el destino y aprobar el procedimiento.
- [ ] Transferir o restaurar el catálogo, blog, cuentas autorizadas y medios como un
      conjunto coherente; verificar que las imágenes públicas cargan a través de la
      app y que el bucket no permite lectura anónima directa.
- [ ] Si se necesita pgvector para el RAG futuro, instalar la extensión compatible
      en PostgreSQL y habilitarla por separado con permisos adecuados. El RAG no está
      terminado ni es requisito para el checkout de esta demo.
- [ ] Preparar una cuenta administradora por el procedimiento interactivo autorizado
      de `pnpm admin:user bootstrap` o `recover`, según corresponda; bootstrap solo
      funciona con la tabla vacía. La imagen runtime standalone no incluye necesariamente
      scripts/CLI: preparar un entorno de operador seguro con el código y dependencias.

## 5. BTCPay y confirmación de pagos

- [ ] Verificar de nuevo la red real del nodo y wallet en el VPS; `BTCPAY_NETWORK`
      es una etiqueta de configuración y las direcciones testnet no distinguen por sí
      solas testnet3 de testnet4. No cambiar de red reutilizando volúmenes a ciegas.
- [ ] Confirmar servidor compatible, sincronizado, método BTC-CHAIN habilitado y
      dirección `0/0` coincidente. La implementación actual exige BTCPay `2.4.7`;
      una actualización de servidor requiere revisar compatibilidad y pruebas.
- [ ] Crear/configurar el webhook de la tienda hacia
      `https://<dominio-demo>/api/webhooks/btcpay`, con su secreto correspondiente
      en `BTCPAY_WEBHOOK_SECRET`. Verificar entrega real desde BTCPay, firma y logs
      sin exponer el secreto. No asumir que está operativo por existir el endpoint.
- [ ] Probar con una reserva nueva y fondos **testnet**: apertura de factura de
      USD 1, dirección correcta, pago y liquidación; confirmar que el estado de la
      reserva cambia solo con evidencia válida. Probar también con el navegador
      cerrado para demostrar el webhook, y repetir la notificación para verificar
      idempotencia. No convertir ni reescribir intentos históricos.
- [ ] Verificar recuperación cuando BTCPay no responde: la app no debe presentar
      instrucciones no verificadas; usar el refresco autorizado de administración
      cuando corresponda. Facturas vencidas, parciales o inconsistentes requieren
      revisión; no crear reemplazos automáticamente.

## 6. Verificación final y operación

- [ ] Ejecutar desde `src/` las comprobaciones apropiadas para la versión: `pnpm
      exec tsc --noEmit --incremental false`, `pnpm lint`, `pnpm exec vitest run
      --maxWorkers=1` y construcción de la imagen real. Investigar cualquier fallo.
      Las pruebas de PostgreSQL son opt-in y usan un contenedor desechable:
      `PRISMA_TEST_DATABASE=1 pnpm exec vitest run modules/bookings/_test_/booking-db.test.ts --maxWorkers=1`.
- [ ] Comprobar inicio y reinicio del contenedor, salud, logs sin secretos, copias
      programadas, espacio en disco, alertas y procedimiento de vuelta atrás. Un
      healthcheck HTTP 200 por sí solo no demuestra que los pagos funcionen.
- [ ] Probar desde fuera del VPS con dos cuentas diferentes: registro e inicio de
      sesión, creación de reserva, privacidad entre huéspedes, cierre de sesión,
      panel de administración y el recorrido de pago descrito arriba.
- [ ] Confirmar cookies `Secure`, `HttpOnly`, `SameSite=Strict`, origen HTTPS exacto,
      rechazo de peticiones de otros orígenes y que PostgreSQL/RustFS no son públicos.
- [ ] Verificar políticas de datos y aviso de demo; no usar datos sensibles reales
      sin un plan adecuado. El flujo de recuperación de contraseña de huéspedes aún
      no está implementado: definir soporte antes de aceptar usuarios públicos.
- [ ] Registrar versión desplegada, responsables, fecha, resultados y pendientes.
      Obtener aceptación explícita antes de anunciar la demo.

Referencias: [operación BTCPay](plans/pagos/infraestructura-local.md),
[evidencia y límites de pagos](plans/pagos/README.md),
[guía general](../README.md) y [planes de transición](plans/comunes/transicion-y-recuperacion.md).
Las notas históricas de esos documentos pueden describir restricciones que han
cambiado; contrastarlas con el código y la versión que se despliegue.
