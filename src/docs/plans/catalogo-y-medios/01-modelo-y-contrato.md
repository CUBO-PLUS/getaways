# [ ] Fase 2.1 — Modelo y contrato del catálogo

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

## Migración y verificación futura

- [ ] Actualizar contrato y generar artefactos y nueva migración aditiva, sin migrar páginas/cupones.
- [ ] Seguir el [flujo versionado de migraciones](../user-and-roles/01-usuarios-y-migraciones.md), primero en clon respaldado.

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

## Cierre

- [ ] Restricciones, campos comerciales y relaciones revisados.
- [ ] Migración reproducida en base aislada con blog y referidos previos intactos.
- [ ] Modelo listo para importación; sin cambiar todavía lectores operativos ni habilitar edición comercial/borrado.
