# [ ] R6 — Verificación, operación y aceptación

[Volver al plan](README.md). Se aplica desde R1; el cierre integral requiere R5.

## Verificación por fase

- [ ] Mantener pruebas mínimas de regresiones reales para extracción de JSON/HTML,
  normalización de servicios, idempotencia y separación de contenido público y privado.
- [ ] Verificar con PostgreSQL desechable reindexación, concurrencia, fallos, reintentos,
  despublicación y exclusión inmediata; no usar datos reales para pruebas destructivas.
- [ ] Probar filtros exactos combinados, búsqueda textual/semántica y resultados
  multilingües con un conjunto de preguntas representativo y criterios registrados.
- [ ] Verificar acceso de huéspedes y protección de API, citas válidas, cards basadas
  en datos reales, rechazo de temas ajenos y resistencia a instrucciones maliciosas.
- [ ] Ejecutar las comprobaciones existentes pertinentes, registrar comandos, resultados,
  fallos previos y límites; hacer recorrido en navegador de los estados principales.

## Operación y seguridad

- [ ] Registrar modelo y versiones, dimensiones, coste estimado, rendimiento, consumo
  de CPU/memoria, número de fuentes/fragmentos, tiempo de indexación y latencia.
- [ ] Definir supervisión de pendientes, errores, antigüedad del índice y reintentos,
  sin registrar preguntas sensibles, credenciales ni información privada innecesaria.
- [ ] Documentar variables y secretos sin valores, permisos, política de datos y
  dependencia externa del proveedor; verificar configuración antes de activar el agente.
- [ ] Documentar copia de seguridad, migración, reconstrucción idempotente y recuperación
  del índice; ensayar restauración en entorno aislado antes de cualquier corte.
- [ ] Verificar pgvector y recursos en el entorno de destino; resolver por separado la
  habilitación segura de cuentas de huéspedes fuera de localhost antes de producción.
- [ ] Definir procedimiento para detener el procesador y desactivar el asistente sin
  afectar publicación, catálogo, reservas o pagos.

### Procedimientos disponibles (implementación local; no ejecutados con datos reales)

Ejecutar desde `src/`, con dependencias instaladas y un `DATABASE_URL` que apunte al
entorno expresamente autorizado. Los comandos cargan `.env` mediante `@next/env`.
No copiar secretos a argumentos, historial, tickets ni este documento.

| Componente | Arranque / uso | Parada / límite |
| --- | --- | --- |
| Reconciliación inicial | `pnpm rag:reconcile` hace dry-run (default `write=false`) y emite JSON con elegibles, fragmentos estimados, omitidos/fallidos y fallos por `tipo:id`. Revisar salida antes de `pnpm rag:reconcile -- --enqueue`, que encola cambios y fuentes no elegibles para que el worker las procese. | Es un comando de una ejecución; terminar con su código de salida. `--enqueue` escribe en la cola y puede llevar a eliminar del índice fuentes retiradas. No usar sin revisión y respaldo. |
| Worker | `pnpm rag:worker` inicia proceso Node separado de Next; reconcilia al arrancar y cada 15 min, y procesa lotes de hasta 10 secuencialmente. En local: `docker compose -f compose.dev.yaml --profile worker up -d rag-worker`; supervisión: `docker compose -f compose.dev.yaml --profile worker logs -f rag-worker`. | Local: `docker compose -f compose.dev.yaml --profile worker stop rag-worker`; producción: `docker compose stop rag-worker` / `docker compose start rag-worker`. SIGTERM/SIGINT interrumpe esperas y termina tras el lote/reconciliación en curso. Reinicio supervisado usa `restart: unless-stopped`; lease de cinco minutos recupera trabajos abandonados. |
| Asistente | Deshabilitar acceso al endpoint `/api/rag/answer` en el mecanismo de despliegue/ruteo aprobado para detener consultas sin parar catálogo, reservas ni pagos. No existe un interruptor RAG documentado/configurado en esta implementación. | Confirmar desde el entorno de destino que la ruta no acepta consultas y que el resto del sitio sigue disponible; prueba pendiente. |

Configuración opcional del worker, inyectada por el supervisor (sin valores secretos):
`RAG_WORKER_POLL_MS` (1 000–60 000; default 5 000) y
`RAG_RECONCILE_INTERVAL_MS` (60 000–86 400 000; default 900 000). En producción,
desde `src/`: `docker compose -f compose.prod.yaml up -d rag-worker`; logs con
`docker compose -f compose.prod.yaml logs -f rag-worker`; parada con
`docker compose -f compose.prod.yaml stop rag-worker`. El servicio solo recibe
`DATABASE_URL`; no requiere acceso a RustFS ni al proveedor AI externo.

El proceso único reconcilia al iniciar y periódicamente (15 min por defecto; configurable
con `RAG_RECONCILE_INTERVAL_MS`, 60 s–24 h), escaneando blogs publicados vigentes y listings activos/no archivados,
encola fuentes nuevas/obsoletas y, con `--enqueue` y cero fallos de escaneo, encola
orígenes ya no elegibles. No calcula embeddings en el reconciliador: el worker carga la
fuente pública actual, genera embeddings localmente en CPU y publica fuente/fragmentos
en una transacción. Cola: `pending`, `processing`, `failed`; el worker reclama con
`SKIP LOCKED`, lease/token de fencing, hasta 8 intentos y backoff exponencial limitado a
1 h. El lote informa `claimed`, `indexed`, `unchanged`, `invalidated`, `superseded` y
`failed`. El worker imprime solo contadores y tipo de error (nunca mensaje/payload),
espera 5 s entre sondeos por defecto (`RAG_WORKER_POLL_MS`, 1–60 s) y aplica backoff
exponencial de 1 s a 5 min al fallar la reconciliación o el lote. Reconciliación y lote
son secuenciales dentro del proceso; varias réplicas siguen protegidas por `SKIP LOCKED`
y fencing de lease. No existe exportador de métricas. La cola no tiene
estado `completed`: tras procesar correctamente, el worker también deja
`status='failed'` pero limpia `lastError`; distinguir terminales por `lastError`/reporte y
no interpretar el estado aislado como métrica fiable de fallos. Una fuente fallida queda
excluida de búsqueda según R3. Investigar estado, antigüedad, `attempts`, `lastError`
acotado y leases antes de reencolar o intervenir manualmente. No registrar
texto de preguntas, corpus, tokens, URL de conexión, credenciales ni payloads.

### Configuración, privacidad y prerrequisitos

- `DATABASE_URL`: obligatoria para runtime y comandos Prisma; credencial PostgreSQL
  restringida al entorno/operación necesaria. `ANTHROPIC_API_KEY`: secreto requerido por
  el proveedor AI SDK en ejecución del agente. No se requieren credenciales del proveedor
  de embeddings: `src/ai/embedding.ts` descarga/carga el modelo Hugging Face fijado en
  CPU, revisión `daa72c51243991dfcaf9f9137d2c573d8f7790c0`, 768 dimensiones. Preparar
  salida HTTPS/cache local y memoria/CPU suficientes; no hay mediciones de consumo.
- No guardar valores en docs. Inyectar secretos desde el gestor aprobado, limitar acceso
  al proceso/host y rotarlos según política. Requests y corpus pueden contener datos
  personales: solo fuentes publicables se indexan; patrones comunes de correo/teléfono se
  redactan antes de enviar contexto/historial al modelo, pero esta heurística no anonimiza
  nombres ni direcciones y no es completa ni sustituye revisión de privacidad. El proveedor recibe consulta/contexto redactados;
  no se persisten conversaciones por diseño. Logs de worker y reportes identifican
  fuentes por tipo/ID y errores truncados, aun así deben protegerse como logs operativos.
- Verificar en PostgreSQL destino versión/soporte de `pgvector`, disponibilidad de la
  extensión `vector` y permisos del rol. Hay descriptor/migración de extensión
  `CREATE EXTENSION IF NOT EXISTS vector` en `migrations/pgvector/`; su existencia local
  no demuestra que esté instalada o que el rol pueda crearla en destino.
- **Antes de migrar:** el chequeo offline actual no encuentra una discrepancia de
  contrato en la cadena local: el contrato previo `94ab05f…` no contiene modelos RAG;
  `20261108T0427_rag_initial_index` añade `RagSource` y `RagChunk.embedding` como
  `vector(768)`, y `20261108T0508_rag_source_queue_contract` añade `RagSourceQueue`, con
  destino `593e975c…`. La migración de extensión `pgvector` (`CREATE EXTENSION IF NOT
  EXISTS vector`) está en el espacio separado `pgvector`; el preview offline la incluye
  junto con las dos migraciones `app`. Por tanto, la afirmación anterior de una
  conversión JSONB→vector y de una rama local RAG inconsistente no queda respaldada por
  los contratos/snapshots actuales y se retira. Esto no verifica el esquema ni el estado
  de migraciones de ninguna base real. Antes de operar en destino siguen siendo
  necesarios inventario/versión del esquema y estado aplicado, revisión SQL completa,
  aprobación del dueño de datos, ventana y plan de reversión. Obtener antes respaldo
  PostgreSQL consistente (`pg_dump` de esquema/datos e identidad/versión del destino)
  según política existente, verificar integridad y custodiar cifrado. No se ejecutó
  dump ni migración aquí. La carga inicial/reconciliación puede retirar fuentes no
  elegibles: dry-run, comparar conteos y respaldar antes de cualquier escritura,
  únicamente en entorno aislado/autorizado. Nunca ensayar con datos reales destructivos.

### Recuperación y observabilidad

1. Ante error, detener el worker con SIGTERM/SIGINT; capturar fecha, versión, entorno
   (sin URLs/secretos), salida JSON y conteos de cola. Revisar logs y fallos acotados,
   validar conectividad, extensión/permisos y espacio/capacidad. No borrar filas de cola
   ni índice para “limpiar” el error.
2. Tras corregir la causa, ejecutar primero `pnpm rag:reconcile` (solo lectura) y guardar
   la salida; con revisión/aprobación, `pnpm rag:reconcile -- --enqueue`; iniciar de
   nuevo `pnpm rag:worker` y observar que la cola disminuya y que el endpoint solo
   devuelva fuentes actualmente elegibles. Confirmar manualmente antes de dar por
   recuperado. Reintentos automáticos terminan en `failed` tras ocho intentos.
3. Restauración de base o reconstrucción desde respaldo: procedimiento aún no validado.
   Ensayar restauración en una base aislada, verificar esquema/pgvector, reconciliar y
   comparar conteos/citas antes de cualquier corte. No afirmar recuperación completa
   hasta completar esa evidencia; el índice vectorial no tiene respaldo/restauración
   ensayados en este trabajo.

Observabilidad mínima durante el piloto: reportar frecuencia y antigüedad de trabajos
`pending`/`processing`/`failed`, conteos de intentos, duración/tamaño de lotes, fuentes
elegibles/omitidas/indexadas/retiradas, fallos, CPU/memoria y latencia/error de búsqueda
y respuesta. Los campos y reportes del worker permiten inspección, pero paneles,
alertas, umbrales y métricas de calidad/coste siguen pendientes; la reconciliación
programada está implementada por el worker, pero no tiene métricas ni alerta propia.

## Registro de evidencia y aceptación

Completar por fase y entorno: fecha, versión/commit, responsable, comandos y resultados,
cantidades reconciliadas, incidencias, límites y aceptación. Ninguna casilla marcada
equivale por sí sola a autorizar producción ni acredita una restauración ensayada.

### R1 — contrato y plan offline (2026-11-08)

- `prisma contract emit`: correcto; contrato destino `b7ab6bf5623ca895f4113457d39b0c3ef5ce50e183af2b6d47c814df4fe8c62a`.
- `prisma migration plan --from 94ab05f313f0df2e8a84ea005e5bab69cd92f0ae5ed837e095da64475a9943c4 --name 20261108T0427_rag_initial_index`: 7 operaciones aditivas; SQL generado declara `embedding vector(768) NOT NULL`.
- `prisma db migrate --show --from 94ab05f313f0df2e8a84ea005e5bab69cd92f0ae5ed837e095da64475a9943c4 --to b7ab6bf5623ca895f4113457d39b0c3ef5ce50e183af2b6d47c814df4fe8c62a`: planifica la extensión `pgvector` (SQL `CREATE EXTENSION IF NOT EXISTS vector`) y la migración R1, sin aplicar cambios.
- No se aplicó ninguna migración ni se accedió a una base real. R1 sigue pendiente de inventario, ejecución y reconciliación con datos.

#### Revisión offline del contrato y la cadena (2026-11-08)

- `pnpm exec prisma migration check`: correcto (`All checks passed`).
- `pnpm exec prisma db migrate --show` sin `--from`: no genera preview offline porque
  requiere conexión para leer el marcador vivo; no se configuró ni consultó una base.
- `pnpm exec prisma db migrate --show --from 94ab05f313f0df2e8a84ea005e5bab69cd92f0ae5ed837e095da64475a9943c4 --to 593e975c2cf39bb4737ae52f0ef84454570bd41f10de8a659f5728692cbad57f`: correcto,
  muestra 3 migraciones: instalación `pgvector` independiente, R1
  (`94ab05f…`→`b7ab6bf…`) y cola RAG (`b7ab6bf…`→`593e975…`).
- `prisma preview --show` no es un comando registrado en esta CLI (`CLI.UNKNOWN_COMMAND`).
  El preview offline admitido aquí es `db migrate --show --from … [--to …]`.
- Estas comprobaciones validan la cadena local/preview, no detectan drift, migraciones
  aplicadas, datos existentes, disponibilidad/permisos de `pgvector` ni compatibilidad
  de una base real. No se modificó ni ejecutó ninguna migración.

### R2–R5 — evidencia de implementación (informes SDD locales)

- Informes `.superpowers/sdd/README/task-2a-report.md` a `task-2c-report.md` describen
  cola y worker; `task-3-report.md` búsqueda; `task-4-report.md` agente; y
  `task-5-report.md` API/interfaz. Son evidencia de cambios y verificaciones locales,
  no de aceptación operativa ni de despliegue.
- Verificaciones reportadas: tests unitarios R1 (2), búsqueda (2), agente (2), endpoint
  (2) y categorías (4); ESLint acotado aprobado en los informes. No se vuelven a ejecutar
  en esta tarea documental. Typecheck global reportó errores preexistentes de tipos
  generados Next; checks acotados RAG reportados sin errores.
- No hay evidencia de migración aplicada, PostgreSQL/pgvector de destino, indexación ni
  reconciliación de corpus real, concurrencia/recuperación DB, restauración, llamadas al
  proveedor, revisión en navegador ni aceptación integral. Estos puntos continúan
  pendientes y ninguna evidencia local los sustituye.

### Revisión estática de privacidad y negaciones (2026-11-08)

- La revisión estática corrigió la redacción sobre extracción, aclaración y fuentes para
  precisar que la heurística redacta patrones comunes de correo/teléfono, pero no anonimiza
  nombres ni direcciones. No equivale a una auditoría de privacidad ni demuestra anonimización
  completa.
- Se corrigieron negaciones representativas en español e inglés. Las 7 pruebas enfocadas
  correspondientes pasan. No se ejecutó una evaluación multilingüe integral ni una revisión
  de auditoría; ambas siguen pendientes, al igual que la aceptación y recuperación completas.

### Comprobación manual local mínima (2026-11-08)

- Se hicieron dos consultas sintéticas, una en español y otra en inglés, ejecutando el agente
  directamente. Se confirmó `DATABASE_URL` con host loopback `127.0.0.1` y base `gateways`;
  el índice local tenía 20 fuentes y 548 fragmentos según el estado operativo previo. La
  búsqueda consultó el índice sin escrituras; no se crearon cuentas ni se modificaron DB o
  RustFS. Las respuestas se generaron con el proveedor Anthropic configurado.
- Español: se citaron seis listados y se devolvieron tres tarjetas; inglés: se citaron tres
  listados y se devolvieron tres tarjetas. Ambas respuestas evitaron afirmar precio o
  disponibilidad. Los resultados no fueron equivalentes en amplitud ni detalle.
- Esta comprobación pequeña acredita únicamente que ambas rutas respondieron con resultados
  observables en este entorno local. No es una evaluación de calidad, privacidad, cobertura
  multilingüe o aceptación integral; R3/R4 y la aceptación general siguen pendientes.

### Respaldo local antes de revisión RAG (2026-11-08)

- Respaldo autorizado creado en el repositorio original, sin modificarlo:
  `src/backups/progreso-20261108T051745605Z-S7Yjl6.tar.gz`.
- SHA-256 externo: `2ab20b0202b7513fe90c850a1b427f515813d829335934d2efa4d7634dcfe91a`;
  modo `0600`. Incluye la BD completa `gateways` (PostgreSQL 18.6) y 179 objetos
  actuales de `blog-media` (54 227 190 bytes). Hash externo e internos verificados;
  `postgres.list` disponible (192 entradas) y helper comprobado en modo
  `verified-only`, sin escribir objetos. La copia no incluye el código sin commit de
  este worktree. No se aplicaron migraciones ni se hizo indexación real. Restauración
  no ensayada.

- [ ] R1: inventario, extracción, indexación y reconciliación.
- [ ] R2: sincronización, retirada, concurrencia y recuperación.
- [ ] R3: filtros exactos, cobertura, búsqueda e idiomas.
- [ ] R4: agente, ámbito, citas, seguridad y fallos.
- [ ] R5: sesión, navegador, tarjetas y accesibilidad.
- [ ] R6: operación, recuperación, requisitos del entorno y aceptación integral.

### Aplicación autorizada en PostgreSQL local (2026-11-08)

- Se verificó antes de escribir el respaldo `src/backups/progreso-20261108T051745605Z-S7Yjl6.tar.gz`: SHA-256 coincide con el sidecar (`2ab20b0202b7513fe90c850a1b427f515813d829335934d2efa4d7634dcfe91a`) y permisos `0600`.
- Destino identificado como `gateways` en PostgreSQL 18.6, contenedor local `gateways-dev-db-1` y volumen Docker `gateways-dev_postgres_data`; extensión `vector` 0.8.7. El contenedor estaba detenido y se inició para inspeccionar/operar. No se accedió a RustFS.
- Inspección inicial encontró los tres marcadores esperados: `pgvector` `4a96b488…`, app `593e975c…`, y las migraciones `20260601T0000_install_vector_extension`, `20261108T0427_rag_initial_index` y `20261108T0508_rag_source_queue_contract` ya registradas. **No se aplicaron migraciones adicionales**: el destino ya estaba en el contrato requerido.
- RAG ya contenía 20 fuentes y 506 chunks. Se ejecutó con el código del worktree `rag:reconcile --enqueue`: `eligible=20`, `queued=0`, `unchanged=20`, `omitted=0`, `failed=0`.
- Se inició el worker y se detuvo con SIGTERM tras confirmar que no había trabajo; salida 0. Verificación final: `RagSource` blog 9/listing 11, `RagChunk` 506 con dimensiones 768, cola 20 trabajos terminales, 0 `pending`/`processing` y 0 filas con `lastError`.
- Nota de contrato: las 20 filas terminales de cola usan `status='failed'` con `lastError=NULL` también tras éxito; no se interpretan como errores. No se reconstruyó ni modificó contenido cuando el reconcile lo encontró sin cambios.
- **Estado histórico al momento de esa operación:** el repositorio original aún no contenía el código RAG y la reconciliación se ejecutó desde el worktree. Ya no describe el estado actual: la implementación está en `main` (ver “Estado actual de ejecución local”).

### Respaldo fresco previo al apagado — 2026-11-08

- No se creó un checkpoint nuevo: la comprobación encontró `gateways-dev-db-1`
  en ejecución y `gateways-dev-rustfs-1` detenido (`exited`). El procedimiento
  `guardar-progreso` prohíbe iniciar o reiniciar RustFS, así que no se ejecutó el
  script de respaldo. El checkpoint anterior precede a la indexación RAG y no
  acredita que incluya los embeddings actuales.
- La DB local migrada tiene, según la verificación previa, 9 fuentes blog, 11
  listings y 506 chunks. El código sin commit permanece en este worktree y no está
  incluido en respaldos; la sincronización automática sigue pendiente. No se
  modificó el repositorio original ni se inició/reinició ningún contenedor.
- Reintentar el respaldo completo cuando RustFS esté activo por operación autorizada.

### Reintento de reconciliación y worker local (2026-11-08)

- Se verificó el destino antes de operar: contenedor `gateways-dev-db-1` en ejecución,
  imagen `gateways-dev-db`, volumen `gateways-dev_postgres_data`; PostgreSQL 18.6,
  base/rol `gateways`, `pgvector` 0.8.7. `DATABASE_URL` se cargó con `@next/env` desde
  la configuración local original; se comprobó únicamente host `127.0.0.1`, puerto
  `5432` y base `gateways` (sin exponer credenciales). El respaldo previo mantuvo
  SHA-256 verificado y permisos `0600`.
- El código ejecutado fue el del worktree `rag-implementacion` (HEAD `9d07d29`, con
  cambios locales), mientras el directorio de ejecución fue el `src/` original para
  que el script cargara su `.env` existente. No se modificó el repositorio original.
- Dry-run: `eligible=20`, `chunks=548`, `omitted=0`, `failed=0`. Reconcile con
  `--enqueue`: `eligible=20`, `queued=20`, `unchanged=0`, `omitted=0`, `failed=0`.
- Worker procesó dos lotes: `claimed=20`, `indexed=20`, `failed=0`; se detuvo con
  SIGTERM al quedar la cola sin trabajos activos y terminó con salida 0. No hubo
  errores de lote. Verificación posterior: 20 fuentes (9 blog, 11 listing), 548
  chunks de dimensión 768, 0 `pending`/`processing` y 0 filas con `lastError`.
  Las 20 filas terminales siguen usando `status='failed'` con `lastError=NULL` según
  el contrato actual; no se cuentan como errores.
- No se migró, no se accedió ni modificó RustFS, no se reinició ningún contenedor y
  no se hicieron commits ni pruebas amplias. El worker emitió solo la advertencia
  conocida de Node sobre `MODULE_TYPELESS_PACKAGE_JSON`; no impidió la ejecución.

### Respaldo completo posterior a indexación RAG (2026-11-08)

- Respaldo lógico creado desde el repositorio original autorizado, con PostgreSQL y
  RustFS locales en estado `healthy`, sin iniciar, parar ni reiniciar servicios:
  `src/backups/progreso-20261108T120939643Z-KhemK5.tar.gz`.
- Incluye la BD `gateways` completa (PostgreSQL 18.6) y 179 objetos actuales de
  `blog-media` (54 227 190 bytes). El índice incluido en la BD registra 9 blogs,
  11 listings y 548 chunks vectoriales. `postgres.list` contiene 215 entradas.
- SHA-256 externo e internos verificados; helper ejecutado en modo
  `verified-only` para los 179 objetos, sin escrituras. Archivo, sidecar y extracción
  temporal con permisos privados; extracción eliminada tras verificar.
- El código sin commit sigue en este worktree y no forma parte del respaldo; la
  sincronización al repositorio original está pendiente. Restauración no ensayada.

### Estado actual de ejecución local

- La implementación RAG está en `main`. Compose app/worker están activos; los logs del
  worker confirman reconciliación de 20 fuentes sin cambios.
- Estado del índice local: 20 fuentes (9 blogs, 11 listings), 548 chunks; cero trabajos
  pendientes/en proceso y cero filas con `lastError`. El estado terminal `failed` con
  `lastError = NULL` es el comportamiento de éxito del contrato actual.
- Los filtros nullable se corrigieron. El usuario confirmó que la respuesta funciona;
  se agregaron imágenes públicas a cards y hay cambios sin commit.
- HTTPS público para huéspedes está permitido por `src/modules/guests/server/auth.ts`;
  no aplica el bloqueo histórico a localhost que aparecía en notas anteriores.
- Sigue sin verificarse evaluación multilingüe, seguridad integral, recuperación o
  restauración ensayada, despliegue/operación de producción y aceptación integral.
  Estos datos de ejecución no marcan R1–R6 como aceptadas.

### Verificación estática de respuesta sin citas (2026-11-08)

- La revisión estática encontró que una respuesta sin citas podía salir como respuesta
  normal. Se corrigió para fallar de forma cerrada: sin citas válidas el agente devuelve
  el fallback seguro correspondiente al idioma, español o inglés.
- La prueba enfocada de ausencia de citas y fallback bilingüe pasó: 6 aprobadas. No se
  ejecutó una evaluación integral ni se declara aceptación de R4 o del plan.
- La validez estructural de una cita no demuestra que su contenido respalde
  semánticamente la afirmación; esa limitación requiere evaluación de calidad aparte.
- No hay una prueba aislada del fencing transaccional. La cobertura/verificación de
  concurrencia y fencing permanece pendiente; no inferirla de la prueba enfocada.
- El respaldo disponible contiene objetos de RustFS, pero no se ensayó su restauración.
  Respaldo verificado no equivale a recuperación demostrada.
