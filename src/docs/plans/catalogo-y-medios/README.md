# [ ] Plan 2 — Persistencia del catálogo y medios

[Orden general y seguimiento](../README.md).

## Objetivo y dependencias

PostgreSQL será la fuente única del catálogo editable, conservando IDs, slugs,
precios, relaciones y representación pública. Reutilizar `MediaAsset` y S3 sin
duplicar almacenamiento ni importar artículos del blog.

Requiere el **plan 1 completo**: la ampliación de medios públicos/privados usa la
identidad común y los permisos editoriales. No necesita el panel de reservas.

## Fases

- [ ] **2.1 — [Modelo y contrato](01-modelo-y-contrato.md).** Esquema aditivo, restricciones y migración revisada. Requiere plan 1.
- [ ] **2.2 — [Importación del catálogo y medios](02-importacion-catalogo-y-medios.md).** Ensayo repetible, correspondencias y equivalencia, sin sobrescribir cambios. Requiere 2.1.
- [ ] **2.3 — [Lectores y acceso a medios](03-lectores-y-medios.md).** Adaptar todos los consumidores, incluido checkout, y cortar a PostgreSQL. Requiere 2.2.

## Aceptación y entrega

- [ ] Catálogo equivalente y todos los consumidores usando la misma tarifa y visibilidad.
- [ ] Originales intactos, medios sin colisiones y acceso privado autorizado por área.
- [ ] Sin habilitar edición comercial, archivado, borrado ni formularios administrativos.
- [ ] Ejecutar controles de catálogo/importación de la [verificación común](../comunes/verificacion-y-aceptacion.md).
- [ ] Ensayar y ejecutar el **hito B1** de [transición y recuperación](../comunes/transicion-y-recuperacion.md).

El corte B1 no migra reservas: su store anterior sigue siendo una limitación
documentada hasta B2. No prometer operación/pagos multiinstancia por migrar catálogo.
Esta entrega desbloquea el plan 3, no la administración comercial del plan 4.
