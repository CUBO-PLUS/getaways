# [x] Fase 2.1 — Modelo y contrato del catálogo

Dependencia: [plan 1 completo](../user-and-roles/README.md).
[Plan 2 y checklist](README.md).

## Decisión de almacenamiento

PostgreSQL será la fuente única del catálogo editable. No escribir en JSON de
build, mantener un catálogo paralelo «de administración» ni añadir una cadena de
fallbacks que vuelva a mostrar hospedajes desactivados.

Reutilizar los tipos y funciones de lectura actuales mediante adaptaciones pequeñas.
No convertir `infrastructure/data/local-client.ts` en un ORM nuevo. Sus lectores
de páginas y otros datos estáticos pueden seguir funcionando sin migrarlos.

## Contrato conceptual

| Modelo | Campos y restricciones principales |
| --- | --- |
| `Listing` | `id` conservado, `wpId?` único, `slug` único, `title`, `contentHtml`, atributos descriptivos JSONB, `active`, `archivedAt?`, `coverMediaId?`, `version`, `createdAt`, `updatedAt`; campos comerciales tipados de la lista siguiente |
| `ListingTerm` | `id` conservado, `wpId?`, `taxonomy`, `slug`, `name`; unicidad por taxonomía y slug |
| `ListingTermAssignment` | PK compuesta `listingId, termId`, FK explícitas e índice inverso |
| `ListingMedia` | PK compuesta `listingId, mediaId`, orden, alt contextual y grupo de habitación; índice por `mediaId` |
| `MediaAsset` existente | Reutilizar objetos inmutables; añadir `legacyMediaId?` único para correspondencia con medios JSON importados, sin cambiar IDs existentes |

Campos comerciales tipados en `Listing`:

- `pricePerNightCents`, `cleaningFeeCents`, `extraGuestFeeCents`, `petFeeCents`:
  enteros en centavos, no negativos y con límites seguros.
- Tasas IVA y turismo en puntos básicos, con rango validado y equivalencia exacta
  con los porcentajes actuales. Cero explícito no se reemplaza por un valor predeterminado.
- `maxGuests`, `baseGuests`, `petsAllowed`, `minStayNights`, horarios de entrada/salida.
- Validaciones de coherencia: huéspedes incluidos no superan capacidad; un hospedaje
  activo y reservable tiene tarifa/capacidad válidas.

Los campos financieros no se duplican como otra fuente de verdad dentro del JSONB.
El adaptador de lectura puede reconstruir temporalmente los atributos string que
esperan los consumidores actuales; todas las escrituras van a campos tipados.
Los atributos desconocidos se inventariarán y preservarán o bloquearán explícitamente:
no se descartan silenciosamente al importar.

Relaciones de catálogo tienen borrado `Restrict` cuando protegen medios/términos;
las asociaciones propias de un hospedaje eliminable pueden borrarse en su
transacción. La futura FK `Booking.listingId` será `Restrict`, nunca Cascade.
Cubrir índices de FK, slug y galería ordenada; no añadir GIN sin una consulta real.

## Migración y verificación

**Ruta rápida local — 2026-11-04:** el esquema y sus artefactos ya existen y la
aplicación local de esta fase está registrada abajo. No regenerar ni volver a
aplicar migraciones para importar los datos. La clasificación de atributos y la
adaptación de lectores se completan en 2.2–2.3 sin tests por petición expresa;
el orden fuente se guarda como metadato `_sourceOrdinal`, sin columnas nuevas.

- [x] Actualizar contrato y generar artefactos y nueva migración aditiva, sin migrar páginas/cupones.
- [x] Seguir el [flujo versionado de migraciones](../user-and-roles/01-usuarios-y-migraciones.md), primero en clon respaldado y después en la base local autorizada.

Referencia del flujo de preparación; no repetir la aplicación ya realizada:

```bash
pnpm run db:generate
pnpm exec prisma migration plan --from <destino-aprobado-plan-1> --name add_listings_catalog
pnpm exec prisma db migrate --show
# Aplicar primero en clon respaldado, según el flujo versionado del plan 1.
pnpm run db:check
pnpm exec tsc --noEmit --incremental false
```

Sustituir `<destino-aprobado-plan-1>` por el hash/ref aprobado más reciente de la
cadena de migraciones; no es un comando literal. No editar generados a mano.

## Evidencia del ensayo y aplicación local

- El 2026-11-04 se generó `20261104T0244_add_listings_catalog`, desde el contrato
  `1d24b7df…` hasta `b3b6063e…`. La migración revisada contiene 20 operaciones
  aditivas.
- Con autorización se respaldó PostgreSQL y se restauró un clon lógico, separado
  de la base original aunque en el mismo servidor y volumen. En el clon,
  `prisma db verify --json` pasó en modo no estricto
  (`codecCoverageSkipped=true`). Blog y medios conservaron sus filas, igual que
  los referidos sintéticos; se comprobaron restricciones, claves y valores cero.
- Tras un respaldo nuevo y comprobaciones de identidad, paquete y ruta, se aplicó
  una sola vez a la base local `gateways` con `--advance-ref db`. El marcador y el
  ref quedaron en `b3b6063e…`; `prisma db verify --json` confirmó marcador y esquema
  en modo no estricto, sin advertencias y con `codecCoverageSkipped=true`.
- Se preservaron los recuentos y hashes de las 11 tablas originales de aplicación
  y de los registros históricos de contrato y ledger. Las 65 filas previas de
  `MediaAsset` conservan `legacyMediaId` en `NULL`; las cuatro tablas nuevas están
  vacías. El respaldo nuevo se leyó íntegramente, pero no se restauró; no cubre
  RustFS ni roles globales.
- Las 27 pruebas existentes de cotización pasaron. `tsc --noEmit --incremental false`
  falla por cuatro errores de tipos Node en `plan1-worker.mts`, reproducidos también
  en `main`. El respaldo y la evidencia detallada son privados; el ensayo no cubre
  RustFS ni acepta un corte de catálogo.
- Antes de importar o cortar siguen siendo obligatorias la clasificación de atributos
  y la aritmética segura descritas en las fases 2.2 y 2.3. La fase 2.1 permanece
   pendiente de aceptación en ese registro histórico; la importación y los lectores
   se completaron en el cierre local posterior documentado en 2.2–2.3.
  No se hizo despliegue.

## Cierre

- [x] Restricciones, campos comerciales y relaciones revisados.
- [x] Migración reproducida en base aislada con blog y referidos previos intactos.
- [x] Modelo utilizado para importar y verificar los 11 hospedajes en el cierre local de 2.2–2.3; sin habilitar edición comercial/borrado.
