# [ ] B.1 — Línea base y preparación

[Plan del blog](README.md). Dependencia: ninguna. Esta fase no importa contenido,
no aplica migraciones y no considera autorizada ninguna escritura en destino.

## Comprobar el estado real

- [x] Registrar versión y estado de Git; inspeccionar la implementación existente del
  panel, renderizador, importador y lectores públicos frente al plan original, sin
  considerar cerradas funcionalidades solo porque existan archivos.
- [ ] Identificar los destinos de PostgreSQL y RustFS, sus volúmenes, credenciales
  mediante canal seguro y responsables; confirmar que no se apunta a producción.
- [ ] Ejecutar `pnpm run db:check` y `pnpm exec prisma db migrate --show` desde
  `src/` con la conexión correcta; registrar marcador y discrepancias sin secretos.
- [x] Comprobar recuentos y referencias existentes sin exponer datos privados. No
  asumir que el destino sigue vacío ni alterar publicaciones u objetos existentes.
- [x] Registrar línea base de pruebas (`pnpm exec vitest run --maxWorkers=2`),
  `pnpm exec tsc --noEmit --incremental false`,
  `pnpm run lint` y los controles de BD aplicables; documentar errores y omisiones.

## Respaldo y recuperación

- [ ] Identificar destino aislado de ensayo para BD y bucket, distinto del destino
  real; no confiar solo en flags de test ni borrar datos de desarrollo.
- [x] Preparar respaldo consistente de PostgreSQL y objetos RustFS; el dump local
  previo no respalda objetos ni sustituye un respaldo fresco. No guardar secretos
  ni dumps sensibles en Git.
- [ ] Ensayar restauración en entorno aislado y verificar marcador, filas y objetos;
  registrar comandos, resultado, responsable y ubicación segura de las copias.

## Cierre

Evidencia del 2026-11-02: [estado y versión](README.md#verificación-de-este-seguimiento--2026-11-02)
y [resultados de comandos](mejora-editor.md#comandos-desde-src). La línea base
registra también los bloqueos de lint y conexión de BD; no los da por resueltos.
El checkpoint posterior al cierre de contenido incluye la BD completa y los 65
objetos actuales del bucket, con referencias conciliadas desde el snapshot de BD,
listado estable y hashes verificados. La restauración aislada sigue pendiente;
ver [respaldo conjunto](../../../backups/README.md).
En la revisión posterior de contenido se confirmaron nueve borradores, nueve
publicaciones y 65 activos en la BD local, con 64 medios distintos referenciados
por los artículos. Ver [cierre de contenido](revision-editorial.md).

- [ ] Estado, línea base y recuperación registrados; problemas identificados y
  aceptados o resueltos antes de avanzar a la revisión editorial.
