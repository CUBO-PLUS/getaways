# [x] Plan 2 — Persistencia del catálogo y medios

[Orden general y seguimiento](../README.md).

## Objetivo y dependencias

PostgreSQL será la fuente única del catálogo editable, conservando IDs, slugs,
precios, relaciones y representación pública. Reutilizar `MediaAsset` y S3 sin
duplicar almacenamiento ni importar artículos del blog.

Requiere el **plan 1 completo**: la ampliación de medios públicos/privados usa la
identidad común y los permisos editoriales. No necesita el panel de reservas.

## Fases

**Ruta rápida local (2026-11-04):** reutilizar el esquema de 2.1 ya aplicado,
mantener la app detenida durante el respaldo y la importación y conservar JSON y
`public/media/` intactos. No añadir CRUD ni pasos de aprobación por ficha. Por
petición expresa no se ejecutan tests, lint, typecheck ni build: solo inventario,
importación y verificación directa de datos/objetos. Los ensayos de pruebas y
restauración indicados en guías generales quedan diferidos para despliegue, no
presentados como ejecutados. Véase [evidencia local](04-evidencia-local.md).

- [x] **2.1 — [Modelo y contrato](01-modelo-y-contrato.md).** Esquema aditivo, restricciones y migración existentes reutilizados. Requiere plan 1.
- [x] **2.2 — [Importación del catálogo y medios](02-importacion-catalogo-y-medios.md).** Correspondencias y equivalencia verificadas directamente, sin sobrescribir cambios. Requiere 2.1.
- [x] **2.3 — [Lectores y acceso a medios](03-lectores-y-medios.md).** Consumidores, incluido checkout, adaptados a PostgreSQL. Requiere 2.2.

## Aceptación y entrega

- [x] Catálogo comparado campo a campo, lectores sobre una misma tarifa y visibilidad.
- [x] Originales intactos, 114 medios sin colisiones; acceso compartido ADMIN/EDITOR para medios no públicos implementado, sin prueba de roles en esta entrega.
- [x] Sin habilitar edición comercial, archivado, borrado ni formularios administrativos.
- [x] Validación abreviada de datos/objetos completada según la excepción local de la [guía común](../comunes/verificacion-y-aceptacion.md).
- [x] **B1 local:** importación y cambio de lectores completados; ensayos de restauración, navegador y certificación de despliegue diferidos expresamente. [Comandos y resultados](04-evidencia-local.md).

El corte B1 no migra reservas: su store anterior sigue siendo una limitación
documentada hasta B2. No prometer operación/pagos multiinstancia por migrar catálogo.
Esta entrega desbloquea el plan 3, no la administración comercial del plan 4.
