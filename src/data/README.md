# Fuentes y tipos de datos

Los contratos de los tres snapshots estáticos restantes y los tipos históricos
compartidos se organizan por dominio en [`types/`](./types/).
[`types.ts`](./types.ts) los reexporta y define `DataTables`, manteniendo compatibles
las importaciones desde `@/data/types`.
Representan las filas almacenadas, no los modelos enriquecidos con imágenes,
categorías o precios calculados que devuelven los módulos.

| Definiciones | Archivo |
| --- | --- |
| Identificadores y contenido compartido | [`types/common.ts`](./types/common.ts) |
| Propiedades y atributos nativos/almacenados | [`types/listings.ts`](./types/listings.ts) |
| Páginas, posts y SEO compartido | [`types/content.ts`](./types/content.ts) |
| Medios | [`types/media.ts`](./types/media.ts) |
| Términos, relaciones y `TermSummary` reutilizable | [`types/taxonomies.ts`](./types/taxonomies.ts) |
| Cupones, reutilizando reglas y precios existentes | [`types/coupons.ts`](./types/coupons.ts) |

| Archivo | Tipo | Registros actuales |
| --- | --- | ---: |
| `coupons.json` | `CouponRow` | 1 |
| `media.json` | `MediaRow` | 321 |
| `pages.json` | `PageRow` | 3 |

## Originales migrados retirados — 2026-11-07

`posts.json`, `post_terms.json`, `listings.json`, `listing_terms.json` y
`terms.json` se retiraron tras la migración autorizada. Blog, hospedajes y sus
categorías se leen de PostgreSQL; no hay fallback a estos originales.
`DataTables` y el cliente local ya no ofrecen esas tablas.

Los tres snapshots de la tabla anterior siguen activos. `media.json` y
`public/media/` sirven arte editorial de home y otras páginas; se conservan.
También se conservan los tipos históricos utilizados por adaptadores y código
compartido, sin mantener una segunda copia de los datos.

Los importadores se mantienen para recuperación con una carpeta fuente explícita
que contenga `data/` y `public/media/`. Los originales completos se archivaron con
hashes antes de retirarlos: ver [respaldo de originales](../backups/README.md#originales-previos-a-la-limpieza-selectiva--2026-11-07).
No extraerlos encima del árbol activo ni reimportarlos sobre cambios editoriales.

## Definir una propiedad

`PropertyAttributes` usa números para capacidades, precios y horarios, booleanos
para servicios y los tipos existentes para galerías y reseñas. Todos sus campos
son opcionales: un dato desconocido no se confunde con cero o `false`.

```ts
import type { PropertyAttributes } from "@/data/types/listings";

const attributes: PropertyAttributes = {
  bedrooms: 3,
  bathrooms: 2.5,
  guests: 6,
  parking: 2,
  price: 150,
  wifi: true,
  airconditioning: true,
  swimmingpool: true,
};
```

`Property` representa la propiedad completa con estos atributos. `ListingRow`
y `ListingAttributes` conservan el formato histórico de importación; declarar un tipo no
convierte automáticamente sus textos a números o booleanos.

- Los identificadores son números; las fechas se conservan como texto.
- `ListingAttributes` contiene campos opcionales de texto: también precios,
  cantidades, indicadores y horarios en segundos desde medianoche.
  `gallery_groups` y `reviews` son JSON serializado, no objetos ya decodificados.
- SEO, texto alternativo y referencias opcionales admiten `null`.
  Los campos de cupón y `parent_id` no son de tipo `null` exclusivamente aunque
  el snapshot actual solo contenga valores nulos en ellos.
- Las páginas usan `publish`/`draft`; los posts originales usaban `published`.
  `StoredTaxonomy` incluye las nueve taxonomías migradas, no solo las tres públicas.
- Los posts originales no contenían `updated_at`.

## Otras fuentes revisadas

Se reutilizan sus contratos existentes, sin duplicarlos:

| Fuente | Contrato |
| --- | --- |
| Reservas en `.data/bookings.json` | `Booking`, `BookingStatus`, `NewBooking` en `modules/bookings/server/booking-store.ts` |
| Pagos mock en memoria | `PaymentSession`, `PaymentProvider` en `modules/payments/types.ts` |
| Formulario concierge, sin backend | `ConciergeRequest` en `modules/concierge/concierge-shared.ts` |
| Contenido configurable y listas serializadas | `SiteContent`, `ListItem` en `modules/content/site-content.ts` |
| Galerías y reseñas decodificadas | `GalleryGroups` en `modules/listings/listing-gallery-groups.ts`; `ListingReview` en `modules/listings/listing-reviews.ts` |

El cliente local conserva el tipo de tabla y de las columnas seleccionadas.
Las pruebas de `_test_/data-types.test.ts` comprueban los snapshots y las consultas;
`tsc --noEmit` comprueba sus contratos estáticos.
