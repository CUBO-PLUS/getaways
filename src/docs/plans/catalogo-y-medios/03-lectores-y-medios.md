# [x] Fase 2.3 — Lectores públicos, checkout y acceso a medios

Dependencia: [fase 2.2](02-importacion-catalogo-y-medios.md).
[Plan 2 y checklist](README.md). Cierra el hito de entrega B1.

## Lectores y medios afectados

- [x] `modules/listings/server/{catalog,listings}.ts`: detalle, archivos, relacionados, categorías, mascotas y destacados consultan PostgreSQL con `active=true` y `archivedAt=null`.
- [x] `modules/listings/server/detail.ts`: objetos S3 usan dimensiones persistidas, sin lectura de filesystem.
- [x] `modules/bookings/server/bookings.ts`: `getListing()` asíncrono sin import JSON; llamadores adaptados en confirmación, checkout y endpoints de quote/Bitcoin/disponibilidad.
- [x] Home, propiedades, destinos, metadatos y sitemap usan los mismos lectores. Grupos y fotos derivadas usan IDs `MediaAsset`, no IDs heredados.
- [x] `shared/media/server/media.ts` conserva arte estático del sitio; no se usa para resolver adjuntos del catálogo PostgreSQL.
- [x] `/api/media/[id]` comparte el handler y cliente/bucket existentes del blog; las URLs previas del blog siguen funcionando.

Los endpoints de medios se amplían de manera coherente: un objeto es público si
lo referencia una publicación de blog **o un hospedaje activo**. En otro caso
requiere permiso de su área. BOOKING_MANAGER no recibe biblioteca privada.
Conservar `private, no-store`, bucket privado, `nosniff` y bytes inmutables.
Al cambiar alt/orden utilizar la asociación del hospedaje, no mutar el archivo o
metadato compartido de una publicación existente.

Las imágenes heredadas de `public/media/` ya son públicas y no se pueden volver
privadas cambiando una fila. No prometer revocación de esas URLs ni de copias descargadas.

## Verificación y corte local abreviado

- [x] Implementar guardas B1: fechas ISO reales comprobadas por roundtrip UTC, noches coherentes y huéspedes enteros positivos; productos, sumas, descuentos e impuestos con `BigInt` y redondeo de mitad hacia arriba. Rechazar centavos fuera del entero seguro y satoshis no representables en el mock antes de crear un pago. No fijar techos comerciales arbitrarios. Código revisado, sin afirmar pruebas de límites ejecutadas.
- [x] Control de atributos de 2.2 completado y catálogo importado; JSONB no almacena campos comerciales.

Por petición expresa del 2026-11-04 no ejecutar Vitest, lint, typecheck ni build.
La verificación de esta entrega se limita a la CLI del catálogo en modo de lectura:
filas, relaciones, importes, orden, dimensiones y bytes S3, además de la
preservación del blog y referidos. No confundir esto con una prueba de navegador
o de checkout; esas comprobaciones quedan diferidas al despliegue.

- [x] Validación abreviada de catálogo, medios e importación completada; pruebas generales diferidas según la [excepción común](../comunes/verificacion-y-aceptacion.md).
- [x] Importación final local aplicada y verificada con app detenida, lectores adaptados juntos al [B1 local](../comunes/transicion-y-recuperacion.md), sin fallback JSON.
- [x] Consumidores revisados sobre la fuente PostgreSQL; recorrido de navegador diferido por alcance local sin testing.

## Cierre

- [x] Catálogo equivalente en PostgreSQL, sin modificar originales ni blog.
- [x] Consumidores, incluido checkout, conectados al mismo adaptador de tarifa/visibilidad; sin afirmar prueba funcional ejecutada.
- [x] Medios sin colisiones con el blog; galerías/grupos remapeados a IDs persistidos y orden conservado.
- [x] Rutas de catálogo y home configuradas dinámicas; sin lectura estática de catálogo en build. No se ejecutó build.
- [x] Sin edición comercial ni borrado; reservas siguen en su store anterior hasta B2. [Resultado local](04-evidencia-local.md).
