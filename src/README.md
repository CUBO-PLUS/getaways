# Getaways El Salvador: aplicación y entrada técnica

[Resumen global, equipo y estrategia](../README.md) ·
[Índice de arquitectura](./docs/arquitectura/README.md) ·
[Flujos implementados](./docs/arquitectura/flujos.md#flujos-de-aplicación) ·
[Datos y operación](./docs/arquitectura/datos-y-operacion.md#datos-y-operación)

Esta carpeta contiene la aplicación Next.js de Getaways El Salvador. El runtime
separa deliberadamente los datos operativos en PostgreSQL, los bytes de medios en
RustFS mediante S3 y las páginas estáticas/arte del sitio en JSON o archivos
locales. El catálogo, blog, reservas, cuentas, pagos y RAG no usan el JSON local
como fallback operativo.

El checkout actual usa **BTCPay Testnet** y un cargo fijo de prueba de **USD
1.00** para cada tentativa nueva, separado de la cotización real de la estancia.
No hay proveedor simulado y las guardas de configuración no aceptan mainnet.
[`TASK.md`](./TASK.md) conserva el enunciado histórico; no describe el flujo
vigente.

## Cómo orientarse

| Necesitas | Documento canónico |
| --- | --- |
| Capas, módulos, límites y mapa de lectura | [Índice de arquitectura](./docs/arquitectura/README.md) |
| Recorridos detallados, secuencias, estados, checkout y RAG | [Flujos](./docs/arquitectura/flujos.md#flujos-de-aplicación) |
| Fuentes de verdad, relaciones, topologías y guardas operativas | [Datos y operación](./docs/arquitectura/datos-y-operacion.md#datos-y-operación) |
| Preparación de producción, sin afirmar despliegue | [Guía de producción](./docs/produccion.md) |
| Respaldo y restauración local | [Guía de respaldos](./backups/README.md#guardar-el-progreso-completo) |

Las páginas enlazadas se referencian entre sí: el índice vuelve a este README y
a los dos documentos de arquitectura, y los documentos de flujos y datos vuelven
al índice. No se repiten aquí sus diagramas Mermaid ni sus recorridos detallados.

## Arquitectura resumida

`app/` expone páginas, layouts y route handlers del App Router. `modules/`
contiene las reglas de dominio server-only; `infrastructure/` conecta PostgreSQL,
RustFS/S3, archivos locales y pgvector; `ai/` contiene adaptadores de modelos
para RAG; y `scripts/` ejecuta importaciones, provisión y workers fuera de la
petición web.

El [índice de arquitectura](./docs/arquitectura/README.md) conserva el mapa de
capas y módulos. El [documento de datos y operación](./docs/arquitectura/datos-y-operacion.md#fuentes-de-verdad-y-límites)
es la referencia para propiedad de datos y topología; el [documento de
flujos](./docs/arquitectura/flujos.md#reserva-cotización-y-pago) es la referencia
para recorridos de reserva, pago y RAG.

## Requisitos y desarrollo local

Requisitos mínimos:

- Node.js 24 o posterior.
- pnpm 12.
- Docker para PostgreSQL y RustFS locales.

Desde `src/`, copia `.env.example` a `.env` si aún no existe y completa los
valores privados necesarios. No guardes credenciales reales en el repositorio.
Después, instala dependencias, levanta las dependencias locales y arranca la
aplicación en el host:

```bash
pnpm install
docker compose -f compose.dev.yaml up -d --wait db rustfs rustfs-init
pnpm db:generate
pnpm db:check
pnpm dev
```

Abre <http://localhost:3000>. La imagen local de `db` usa PostgreSQL 18.6 con
pgvector 0.8.7 y habilita `vector` solo al crear un volumen nuevo. Para un
volumen existente, respáldalo y habilita la extensión por separado; los scripts
de inicialización no se vuelven a ejecutar sobre un volumen ya creado.
`DATABASE_COMPOSE_HOST` adapta una URL de loopback solo dentro de Compose; un
proceso en el host usa el puerto publicado.

La aplicación y el worker RAG son perfiles opcionales si quieres ejecutarlos
dentro de Docker en lugar de usar `pnpm dev`:

```bash
docker compose -f compose.dev.yaml --profile app up -d --wait
docker compose -f compose.dev.yaml --profile worker up -d --wait
```

Dentro del contenedor la app usa `http://rustfs:9000`; desde el host usa el
endpoint publicado en `127.0.0.1`. `rustfs-init` crea el bucket configurado. Las
credenciales root de RustFS son solo para el servicio/initializer; la app debe
usar una identidad S3 restringida. La configuración local no incluye BTCPay,
Bitcoin Core ni NBXplorer.

## Compose con forma de producción

`compose.prod.yaml` declara `app`, `rag-worker`, `rustfs` y `rustfs-init`.
PostgreSQL es externo y llega mediante `DATABASE_URL`; la app solo expone el
puerto 3000 dentro de la red de Compose. RustFS conserva un volumen persistente
y sus bindings de host son de loopback. BTCPay y su wallet/webhook son externos
a este stack.

Que un servicio aparezca en Compose no demuestra que exista un VPS, proxy, DNS,
TLS, base externa, bucket, backup o despliegue accesible. La [guía de
producción](./docs/produccion.md) es una lista de preparación y verificación
pendiente; los detalles de topología y guardas están en
[datos y operación](./docs/arquitectura/datos-y-operacion.md#topología-declarada-de-desarrollo-y-producción).

## Comandos de entrada

Los comandos de abajo son puntos de entrada; sus efectos, precondiciones y
guardas están en [checks y operaciones](./docs/arquitectura/datos-y-operacion.md#checks-y-operaciones-con-guardas).

| Propósito | Comando | Nota breve |
| --- | --- | --- |
| Desarrollo / producción local | `pnpm dev`, `pnpm build`, `pnpm start` | `build` emite el contrato Prisma como prebuild. |
| Contrato de base de datos | `pnpm db:generate`, `pnpm db:check` | No uses `db:init` contra una base existente. |
| Administrador | `pnpm admin:user bootstrap` o `pnpm admin:user recover` | Terminal interactiva; nunca pases contraseñas como argumentos o variables. |
| Importar catálogo | `pnpm listings:import <source-root>` | Por defecto dry-run; `--apply` escribe y `--verify` compara. |
| Importar blog | `pnpm blog:dry-run <source-root>`; `pnpm blog:import <source-root> <final-conversion.json> <approval.json> [--execute]` | El último modo escribe solo con `--execute`. |
| Indexar RAG | `pnpm rag:reconcile [--enqueue]`; `pnpm rag:worker` | `--enqueue` y el worker escriben la cola/índice. |
| Optimizar imágenes | `pnpm images:optimize [--apply]` | Dry-run salvo `--apply`; verifica hashes antes de limpiar originales. |
| Verificar BTCPay | `./scripts/verify-btcpay-testnet.sh` | Comprueba su stack externo de Testnet, no el despliegue de esta app. |

Para respaldos coordinados del Compose local usa
`node scripts/backup-progress.mjs "nota"`; para el procedimiento completo,
exclusiones y restauración consulta [backups/README.md](./backups/README.md).

## Límites operativos que conviene conocer

- El [índice](./docs/arquitectura/README.md#límites-y-guardas) documenta los
  guards de sesión/rol, `no-store`/noindex y límites de las rutas. No confundas
  cabeceras de privacidad con autorización.
- `GET /api/checkout/status` devuelve únicamente `booking.status`. La lectura de
  detalles de pago y las instrucciones del checkout pasan por la ruta BTCPay,
  que valida la identidad persistida, la reserva, la tienda, la red, el cargo de
  prueba y el total real antes de exponerlos; la reconciliación autoritativa se
  explica en [flujos, pago](./docs/arquitectura/flujos.md#reconciliación-confirmación-y-conflictos-tardíos).
- La elegibilidad RAG excluye trabajos `pending`/`processing` y trabajos
  `failed` que conservan `lastError`; un `failed` sin `lastError` no coincide con
  esa exclusión SQL. La revalidación posterior a la generación puede fallar
  cerrada; el detalle está en [flujos, RAG](./docs/arquitectura/flujos.md#rag-extracción-cola-búsqueda-y-respuesta).
- PostgreSQL y los objetos RustFS deben respaldarse juntos y restaurarse en
  destinos identificados y aislados. Un volumen de Compose no es un respaldo.

## Mapa breve del proyecto

| Ruta | Responsabilidad |
| --- | --- |
| `app/(site)/`, `app/checkout/` | Páginas públicas, cuenta, checkout y confirmación. |
| `app/api/checkout/`, `app/api/webhooks/btcpay/` | Cotización, estado, BTCPay y webhook firmado. |
| `app/admin/`, `app/api/admin/` | Panel y operaciones con comprobaciones de rol. |
| `modules/bookings/`, `modules/checkout/` | Cotización, disponibilidad, sesión de checkout y transiciones. |
| `modules/content/`, `modules/listings/` | Blog/publicación y catálogo PostgreSQL. |
| `modules/auth/`, `modules/guests/`, `modules/users/` | Sesiones y administración de cuentas. |
| `modules/payments/`, `modules/referrals/` | Intentos BTCPay y atribución de referidos. |
| `modules/rag/`, `ai/embedding.ts` | Extracción, cola, embeddings, búsqueda y agente. |
| `infrastructure/prisma/`, `infrastructure/storage/` | Contrato/migraciones PostgreSQL y adaptador S3/RustFS. |
| `infrastructure/data/local-client.ts`, `data/`, `public/` | Lectura de snapshots/arte estático, no almacén operativo del catálogo/blog. |
| `scripts/` | Importaciones, mantenimiento, provisión, RAG y verificaciones. |

## Secretos, respaldos y desconocidos explícitos

Mantén `.env` privado y nunca confirmes credenciales de PostgreSQL, claves S3,
tokens o secretos webhook de BTCPay, datos de wallet ni claves Anthropic. Usa la
identidad root de RustFS solo para el servicio/initializer y una identidad de
aplicación restringida para la app. Respalda PostgreSQL y los objetos RustFS en
conjunto y ensaya la restauración; revisa las [exclusiones de backups](./backups/README.md#guardar-el-progreso-completo).

El repositorio no puede demostrar estado de despliegue, DNS/TLS, comportamiento
del proxy, configuración de PostgreSQL externo, sincronización o entrega del
webhook BTCPay, red/credenciales de RustFS, calendario de backups ni responsable
operativo. Confirma esos puntos fuera del repositorio antes de desplegar.

La configuración de pagos requiere opt-in explícito de BTCPay Testnet y falla
cerrada si falta o es obsoleta. Consulta también la [configuración y límites de
pagos](./docs/plans/pagos/infraestructura-local.md), la [optimización de
imágenes](./docs/image-optimization.md), las [notas de importación del
catálogo](./docs/plans/catalogo-y-medios/README.md), [AGENTS.md](./AGENTS.md) y
[LICENSE-NOTE.md](./LICENSE-NOTE.md).
