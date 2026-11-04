# Respaldos locales de PostgreSQL y RustFS

Los archivos de esta carpeta se ignoran en Git: pueden contener datos sensibles.
El dump en formato custom incluye el esquema, los datos y el marcador de migración;
no incluye los objetos de RustFS ni credenciales o roles globales de PostgreSQL.
Guardar también una copia segura fuera de esta máquina.

## Guardar el progreso completo

Desde `src/`, con el Compose local `gateways-dev` activo:

```bash
node scripts/backup-progress.mjs "Completado: ... Pendiente: ..."
```

La skill de proyecto **`guardar-progreso`** reutiliza este comando. Se puede pedir
«guarda el progreso con DB y RustFS» o cargar `@guardar-progreso` en OpenCode.

Cada ejecución crea un directorio único `progreso-<UTC>-<sufijo>/`, su `.tar.gz` y
un `.tar.gz.sha256`. Incluye:

- `postgres.dump` y `postgres.list`: toda la BD mediante un snapshot exportado.
- `objects/` y `rustfs-manifest.json`: todos los objetos actuales del bucket
  configurado, incluso los no usados por artículos, con SHA-256, tipos y metadatos.
- `SHA256SUMS`: hashes de los archivos del paquete.
- `checkpoint.json`, `PROGRESO.md` y `git-status.txt`: recuentos, versiones de
  borradores, HEAD, cambios sin commit, avance y pendientes; sin credenciales.
- `restore-objects.mjs`: verifica archivos por defecto; solo escribe con
  `--execute`, exige un bucket vacío y no sobrescribe objetos.

Se concilian las referencias de medios con el snapshot de BD y se comprueba que
el listado del bucket no cambie durante la copia. La aplicación usa objetos
inmutables: no es un snapshot distribuido ni una copia del volumen completo de
RustFS. No incluye credenciales, roles globales, políticas/historial del bucket ni
archivos fuente sin commit. No restaura ni reinicia servicios, ni borra copias previas.
Un fallo deja el intento incompleto identificado; no usarlo como checkpoint válido.

### Último checkpoint verificado — 2026-11-04

`progreso-20261104T203633013Z-zRoteV.tar.gz`

SHA-256: `367712df2e564a9881f663d99516590b20bee6a6ea56460e669970aca3b4ee54`.
Respaldo posterior a la fase 2: BD completa `gateways` (PostgreSQL 18.6),
11 hospedajes migrados, 9 borradores y 9 publicaciones; 179 activos y 179 objetos
del bucket `blog-media`, con 186 655 527 bytes de objetos. Incluye las tablas de
catálogo y sus relaciones, sin volver a importar datos.

Completado el 2026-11-04 a las 20:36:37 UTC. Se verificaron el hash del archivo,
todos los checksums internos, las referencias de medios desde el snapshot de BD,
el listado estable del bucket y los 179 archivos mediante el helper en modo
`verified-only`. **Restauración no ensayada.** No se ejecutaron tests de aplicación.

El estado Git se registra, pero el código sin commit y los archivos de reservas
fuera de PostgreSQL no se copian. Se mantienen las exclusiones descritas arriba;
el respaldo local no es una copia independiente de esta máquina.

### Checkpoint anterior verificado — 2026-11-02

`progreso-20261102T190057675Z-eyXUZX.tar.gz`

SHA-256: `c587894634eb3f85316dd2cc096cbaf34892851ba283280ba8b93f0ba4399b1c`.
Contiene nueve borradores, nueve publicaciones y 65 activos/objetos (87 737 783
bytes de objetos), posteriores a completar los alt de portadas e imágenes.
Verificados listado del dump, comparación del tar con los archivos, checksums y
los 65 objetos sin subirlos. **Restauración no ensayada.** El intento previo
`progreso-20261102T190040114Z-HKWSuK/` quedó incompleto y no es una copia válida.

Comprobaciones de los scripts: tres pruebas de regresión protegen cambios del
bucket, referencias faltantes/incoherentes y restauración sin sobrescritura.
`pnpm exec vitest run --maxWorkers=2`: 446 pruebas pasaron y seis se omitieron.
`pnpm exec tsc --noEmit --incremental false` y ESLint de los dos scripts y su prueba
pasaron. El lint global conserva el bloqueo del helper histórico `.cjs`; no se da
por resuelto. La skill pasó validación de formato y dos escenarios simulados de
checkpoint válido/incompleto; esas simulaciones no sustituyen la copia real.

Desde `src/backups/`:

```bash
sha256sum -c progreso-20261102T190057675Z-eyXUZX.tar.gz.sha256
```

Dentro del directorio extraído, ejecutar `sha256sum -c SHA256SUMS`. Para verificar
los objetos sin red ni escrituras, desde `src/`:

```bash
node backups/progreso-20261102T190057675Z-eyXUZX/restore-objects.mjs
```

## Recuperación

Para comprobar un dump desde `src/`:

```bash
docker exec -i gateways-dev-db-1 pg_restore --list < backups/ARCHIVO.dump
```

Para recuperarlo, restaurar **primero en una base vacía y aislada**, con PostgreSQL
compatible y un usuario con permisos suficientes. Sustituir el contenedor, usuario,
base y archivo por los del destino de prueba:

```bash
docker exec -i CONTENEDOR_AISLADO pg_restore --exit-on-error --no-owner --no-privileges \
  -U USUARIO -d BASE_VACIA < backups/ARCHIVO.dump
```

Verificar el marcador y los datos antes de cualquier corte. No restaurar encima de
una base existente sin respaldo y aprobación explícita.
Para objetos, seguir `PROGRESO.md` del paquete y configurar un bucket **nuevo,
privado y aislado**; no reutilizar el entorno activo como destino de ensayo.
