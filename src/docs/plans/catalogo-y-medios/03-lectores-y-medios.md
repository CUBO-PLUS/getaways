# [ ] Fase 2.3 — Lectores públicos, checkout y acceso a medios

Dependencia: [fase 2.2](02-importacion-catalogo-y-medios.md).
[Plan 2 y checklist](README.md). Cierra el hito de entrega B1.

## Lectores y medios afectados

- [ ] Adaptar `modules/listings/server/listings.ts`: detalle, archivos, relacionados, categorías, mascotas, destacados y filtros de visibilidad consultan PostgreSQL.
- [ ] Adaptar `modules/listings/server/detail.ts`: para objetos S3 usar ancho/alto persistidos; no pasar una URL `/api/...` a `readImageDimensions()` como ruta del filesystem.
- [ ] Adaptar `modules/bookings/server/bookings.ts`: quitar import estático y pasar `getListing()` a lectura asíncrona. Adaptar todos sus llamadores: confirmación, checkout y endpoints de quote/Bitcoin.
- [ ] Adaptar `modules/site/server/home.ts`, archivo de propiedades, destinos, metadatos, sitemap y lectores de medios usados por esas vistas: comprobar la misma fuente.
- [ ] Conservar en `shared/media/server/media.ts` las imágenes estáticas del resto del sitio y separar explícitamente los medios del catálogo persistido cuando sea necesario.
- [ ] Compartir acceso de medios en `shared/media/server/` reutilizando S3, validación y compensación existentes; no un cliente/bucket por área.

Los endpoints de medios se amplían de manera coherente: un objeto es público si
lo referencia una publicación de blog **o un hospedaje activo**. En otro caso
requiere permiso de su área. BOOKING_MANAGER no recibe biblioteca privada.
Conservar `private, no-store`, bucket privado, `nosniff` y bytes inmutables.
Al cambiar alt/orden utilizar la asociación del hospedaje, no mutar el archivo o
metadato compartido de una publicación existente.

Las imágenes heredadas de `public/media/` ya son públicas y no se pueden volver
privadas cambiando una fila. No prometer revocación de esas URLs ni de copias descargadas.

## Verificación y corte futuros

```bash
pnpm run db:check
pnpm exec vitest run modules/listings/_test_ shared/media/_test_ _test_/page-data.test.ts
pnpm exec tsc --noEmit --incremental false
```

- [ ] Completar controles de catálogo, medios e importación de la [verificación común](../comunes/verificacion-y-aceptacion.md).
- [ ] Ejecutar importación final aprobada y cambiar todas las lecturas juntas mediante el [hito B1](../comunes/transicion-y-recuperacion.md). Sin fallback a JSON.
- [ ] Verificar catálogo público, checkout, galerías, metadatos y sitemap en navegador.

## Cierre

- [ ] Catálogo equivalente en PostgreSQL, sin modificar originales ni blog.
- [ ] Todos los consumidores, incluido checkout, ven la misma tarifa y visibilidad.
- [ ] Medios y galerías no colisionan con los del blog; rutas y orden se conservan.
- [ ] Lecturas no se resuelven durante build ni quedan congeladas por caché estática.
- [ ] No se habilitan edición comercial ni borrado; reservas siguen en su store anterior hasta B2, con sus limitaciones documentadas.
