# Cierre local del plan 2 — 2026-11-04

**Nota posterior — 2026-11-07:** tras autorización se retiraron los JSON originales
del catálogo, términos y relaciones del árbol activo. Los ocho JSON y los medios
fuente completos quedaron en un [archivo privado verificado](../../../backups/README.md#originales-previos-a-la-limpieza-selectiva--2026-11-07).
Las lecturas siguen en PostgreSQL; páginas y arte estático local se conservan.
Los comandos históricos de esta evidencia ahora requieren `<source-root>` antes
de `--apply`/`--verify`. Esta limpieza no modifica la BD ni los objetos RustFS.

## Alcance

Implementación con dos subagentes GPT-6 Luna: importador y lectores/consumidores.
Sin tests, lint, typecheck, build ni recorrido de navegador, por petición expresa.
Solo se valida la migración de datos; no es aceptación de producción ni de pagos.

## Destino y respaldo

- Compose `gateways-dev`, base `gateways`, volúmenes existentes, sin recrearlos.
- Se iniciaron solo PostgreSQL y RustFS; app detenida durante las escrituras.
- Antes: 0 hospedajes, 65 medios, 9 borradores y 9 publicaciones de blog.
- Respaldo privado: `backups/progreso-20261104T200702624Z-QvCdWO/` (relativo a `src/`).
- Dump PostgreSQL completo: 116850 bytes; SHA-256
  `6ffaa44893d1267fe6864c88524ff0b1c5a34fb0717cfe3857a75f355506d233`.
- Copiados los 65 objetos previos con metadatos y SHA-256; listado estable.
- `pg_restore --list` leyó el dump; no se ensayó restauración en esta sesión.

## Resultado

Desde `src/`, sin tests:

```text
pnpm listings:import
  mode=dry-run listings=11 media=114 terms=6 missingListings=11
pnpm listings:import --apply
  mode=applied listings=11 media=114 terms=6
pnpm listings:import --verify
  mode=verified listings=11 media=114 terms=6
```

El primer `--apply` encontró que el runtime instalado no expone `tx.raw` y revirtió
la transacción. Se corrigió a planes `db.raw.sql` ejecutados mediante `tx.query`/
`tx.execute`; el reintento reutilizó las 114 claves S3 inmutables ya subidas,
sin duplicarlas ni borrar objetos. No se reaplicó el esquema ni se cambió el marcador.

Comparación directa final (`phase2-preservation.json` dentro del respaldo privado):

```json
{
  "database": "gateways",
  "listings": 11,
  "terms": 6,
  "termAssignments": 18,
  "listingMedia": 114,
  "mediaAssets": 179,
  "blogPosts": 9,
  "publications": 9,
  "previousRowsPreserved": true,
  "originalMediaPreserved": 65,
  "originalS3ObjectsVerified": 65,
  "testsRun": false
}
```

- `--verify` compara campos completos del hospedaje, descripciones, importes/tasas,
  términos, asociaciones, portada, posición/alt/grupo, dimensiones y bytes S3.
- Las filas previas de blog, relaciones, mappings, referidos y usuarios conservan
  sus hashes; los 65 medios y sus objetos originales permanecen intactos.
- Secuencias: Listing=84, ListingTerm=24 y MediaAsset=179; próximos IDs 85/25/180.
- Se revisaron los consumidores y se adaptaron al lector PostgreSQL sin fallback
  JSON. No se ejecutaron tests, lint, typecheck, build ni navegador.
- Git no registra cambios en `data/`, `public/media/` ni archivos de tests.
- Al finalizar se inició de nuevo el contenedor existente con
  `docker start gateways-dev-app-1`; no se hizo smoke test de la aplicación.

## Clasificación de la fuente

- Los atributos admitidos se clasifican en campos comerciales tipados y una lista
  cerrada de descripción. No se aceptan claves desconocidas ni objetos comerciales
  anidados; `gallery_groups` solo contiene correspondencias de foto a etiqueta.
- Los IDs WordPress sintéticos negativos de las fichas 83 y 84 se deben convertir
  desde el lexema JSON a `BigInt`, sin pasar por `Number`.
- La fuente tiene 20 asociaciones de términos; dos apuntan a `listing_id=3`, que
  no existe entre los 11 hospedajes. Se conservan las 18 asociaciones válidas y
  se reportan las dos huérfanas, sin crear un hospedaje ni asignarlas a otro.
- Se conservan los seis términos de categorías/mascotas, incluidos los vacíos.
- Arte editorial estático de home (hero, CTA y fondos de categorías) sigue en su
  lector de sitio; las fotos derivadas de hospedajes/grupos pasan a PostgreSQL/S3.

## Límites

### Respaldo posterior al cierre

A petición de la persona solicitante se creó
`backups/progreso-20261104T203633013Z-zRoteV.tar.gz` mediante
`node scripts/backup-progress.mjs`, sin modificar ni restaurar servicios.
Incluye la BD completa y los 179 objetos actuales del bucket (186 655 527 bytes),
con referencias conciliadas y listado estable. SHA-256 del archivo:
`367712df2e564a9881f663d99516590b20bee6a6ea56460e669970aca3b4ee54`.
Checksums externos/internos correctos y helper `verified-only` con 179 objetos.
No se ensayó restauración; no incluye código sin commit ni archivos de reservas
fuera de PostgreSQL. Este paquete es posterior a la migración; el respaldo previo
registrado arriba se conserva sin reemplazarlo.

Reservas siguen en su store previo hasta B2. No se importan artículos, no se
habilita administración comercial, no se cambian originales JSON/medios locales
ni se despliega en Coolify. Respaldo local no equivale a copia independiente.
