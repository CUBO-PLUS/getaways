# [ ] B.1 — Línea base y preparación

[Plan del blog](README.md). Dependencia: ninguna. Esta fase no importa contenido,
no aplica migraciones y no considera autorizada ninguna escritura en destino.

## Comprobar el estado real

- [ ] Registrar versión y estado de Git; inspeccionar la implementación existente del
  panel, renderizador, importador y lectores públicos frente al plan original, sin
  considerar cerradas funcionalidades solo porque existan archivos.
- [ ] Identificar los destinos de PostgreSQL y RustFS, sus volúmenes, credenciales
  mediante canal seguro y responsables; confirmar que no se apunta a producción.
- [ ] Ejecutar `pnpm run db:check` y `pnpm exec prisma db migrate --show` desde
  `src/` con la conexión correcta; registrar marcador y discrepancias sin secretos.
- [ ] Comprobar recuentos y referencias existentes sin exponer datos privados. No
  asumir que el destino sigue vacío ni alterar publicaciones u objetos existentes.
- [ ] Registrar línea base de `pnpm test`, `pnpm exec tsc --noEmit --incremental false`,
  `pnpm run lint` y los controles de BD aplicables; documentar errores y omisiones.

## Respaldo y recuperación

- [ ] Identificar destino aislado de ensayo para BD y bucket, distinto del destino
  real; no confiar solo en flags de test ni borrar datos de desarrollo.
- [ ] Preparar respaldo consistente de PostgreSQL y objetos RustFS; el dump local
  previo no respalda objetos ni sustituye un respaldo fresco. No guardar secretos
  ni dumps sensibles en Git.
- [ ] Ensayar restauración en entorno aislado y verificar marcador, filas y objetos;
  registrar comandos, resultado, responsable y ubicación segura de las copias.

## Cierre

- [ ] Estado, línea base y recuperación registrados; problemas identificados y
  aceptados o resueltos antes de avanzar a la revisión editorial.
