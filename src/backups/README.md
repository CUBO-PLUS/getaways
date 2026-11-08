# Respaldos locales de PostgreSQL y RustFS

Los archivos de esta carpeta se ignoran en Git: pueden contener datos sensibles.
El dump en formato custom incluye el esquema, los datos y el marcador de migración;
no incluye los objetos de RustFS ni credenciales o roles globales de PostgreSQL.
Guardar también una copia segura fuera de esta máquina.

## Guardar el progreso completo

Desde `src/`, con PostgreSQL y RustFS del Compose local `gateways-dev` activos.
La app puede ejecutarse en el host; no hace falta el contenedor `app`. El script
carga `.env*` con la configuración de desarrollo y usa las credenciales S3 de la
aplicación, sin cambiarlas por credenciales administrativas. `S3_ENDPOINT` debe
apuntar a loopback y al puerto publicado por RustFS:

```bash
node scripts/backup-progress.mjs "Completado: ... Pendiente: ..."
```

La skill de proyecto **`guardar-progreso`** reutiliza este comando. Se puede pedir
«guarda el progreso con DB y RustFS» o cargar `@guardar-progreso` en OpenCode.

Cada ejecución deja solo `progreso-<UTC>-<sufijo>.tar.gz` y su `.tar.gz.sha256`,
con permisos privados y dos líneas de resumen. Dentro del paquete se incluye:

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
El directorio de trabajo se elimina solo tras verificar los objetos y comparar el
archivo empaquetado. Un fallo conserva el intento incompleto identificado; no
usarlo como checkpoint válido. Las copias anteriores no se limpian automáticamente.
Para revisar el contenido, extraer en una carpeta temporal privada bajo `backups/`,
verificar `SHA256SUMS`, `checkpoint.json`, `postgres.list` y el helper sin `--execute`;
eliminar después únicamente esa extracción temporal.

### Último checkpoint verificado — 2026-11-08

`progreso-20261108T024343326Z-Cv3kMb.tar.gz`

SHA-256: `ded69af06efca556b0926bc51a7d1b59d88190f60b1953d65c5a6f839dec18d6`.
Completado a las 02:43:46 UTC: BD local `gateways` completa y 179 objetos del
bucket `blog-media` (54 227 190 bytes). Hash exterior e internos comprobados,
listado del dump disponible y helper de objetos verificado sin escritura. Las
referencias de medios y la estabilidad del listado se comprobaron al crear el
paquete. **Restauración no ensayada; no incluye código sin commit ni credenciales.**

### Checkpoint anterior — 2026-11-07

`progreso-20261107T053706375Z-QYKRN6.tar.gz`

SHA-256: `88a8c950745e4b93ec5acf19949f15295cef7c0bed1144df4bb23e1b89bd4c85`.
Completado a las 05:37:12 UTC, posterior a las migraciones locales de pagos y la
activación del proveedor BTCPay remoto. BD `gateways` completa, incluidas
`Booking` y `PaymentAttempt`, y 179 objetos actuales del bucket `blog-media`
(186 655 527 bytes). Hash exterior, 186 checksums internos, dump legible y helper
de 179 objetos en modo `verified-only` comprobados. Paquete y checksum `0600`;
extracción privada eliminada después de verificar. Sin reinicios, restauraciones
ni cambios en respaldos anteriores. **Restauración no ensayada; no incluye código
sin commit ni credenciales.**

### Checkpoint anterior a la migración de pagos — 2026-11-07

`progreso-20261107T052142289Z-KOFaSq.tar.gz`

SHA-256: `25e65537372a6d831eef1eefe90f98461a778ec6e1b29373051746d231c87739`.
Completado a las 05:21:48 UTC desde el host, sin iniciar ni reiniciar servicios.
BD `gateways` completa (PostgreSQL 18.6) y 179 objetos del bucket `blog-media`
(186 655 527 bytes). Dump legible con datos de hospedajes, relaciones, medios,
reservas y blog. Hash exterior, 186 checksums internos, referencias conciliadas,
listado estable y helper de 179 objetos en modo `verified-only` verificados.
Paquete y checksum con permisos `0600`; extracción de verificación eliminada.
La app Docker permanece detenida. Las copias anteriores permanecen intactas.
**Restauración no ensayada. No incluye código sin commit ni credenciales.**

### Checkpoint previo al corte B2 — 2026-11-04

`progreso-20261104T224003331Z-UcgQFM.tar.gz`

SHA-256: `b5509d31e48a34678d28122de76115bb2cca6dc09576d6c6c465bcc393c87349`.
Respaldo previo al corte B2 autorizado: BD `gateways` completa, 179 objetos del
bucket `blog-media` (186 655 527 bytes), 11 hospedajes y 9 borradores/publicaciones.
Hash exterior, 186 checksums internos y helper de 179 objetos verificados.
**Restauración de este checkpoint no ensayada.**

Complemento privado `b2-corte-20261104T2242-3l4xp4xa/`: dump final con app detenida,
fuente explícita vacía, hashes previos de tablas y patch integrado de código. Hash
del dump: `ee5f754ac8bf1e80be540093a47a50e3ae8662e8f54ec29a7d97dd6a181de596`.
Su `SHA256SUMS` permite comprobar los archivos. Este complemento no reemplaza el
archivo completo que contiene los objetos RustFS. Ver [el corte B2](../docs/plans/reservas/05-evidencia-local.md).

### Checkpoint posterior al catálogo — 2026-11-04

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

## Originales previos a la limpieza selectiva — 2026-11-07

`originales-blog-catalogo-20261107T055737Z-64192e.tar.gz` y su `.sha256`,
ambos privados (`0600`). SHA-256:
`69fcfe0e98db85281c88b84c4c7b002931de1297e0d825bb7a365474a537dea0`.

Complementa los checkpoints PostgreSQL/RustFS: conserva los ocho JSON fuente y
los 320 archivos originales de `public/media/` (328 archivos, 262 708 802 bytes
empaquetados). `originals-manifest.json` registra el SHA-256 por archivo; se
compararon los 328 miembros empaquetados contra los originales antes del borrado.
No incluye credenciales ni sustituye el respaldo de la BD y los objetos actuales.

Solo se retiraron del árbol activo `data/posts.json`, `data/post_terms.json`,
`data/listings.json`, `data/listing_terms.json` y `data/terms.json`.
Las páginas, el índice de medios, los cupones, los archivos de `public/media/` y
las variables de entorno actuales siguen en uso y no se eliminaron.

Para recuperar una fuente histórica, verificar primero el `.sha256` y extraer
en una carpeta privada **aislada**, nunca sobre el árbol activo. Comprobar todos
los hashes de `originals-manifest.json` antes de usarla. Los importadores requieren
esa carpeta como `<source-root>`; no vuelven automáticamente a los originales.
La importación sigue requiriendo revisión y aprobación; no ejecutar `--apply` o
`--execute` sobre la base actual para deshacer esta limpieza. Guardar una copia
segura fuera de esta máquina. No se ensayó una nueva restauración de BD/S3.

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
