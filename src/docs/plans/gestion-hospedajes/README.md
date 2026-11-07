# [ ] Plan 4 — Administración de hospedajes

[Orden general y seguimiento](../README.md).

## Objetivo y dependencias

Habilitar administración del catálogo persistido: contenido editorial para
ADMIN/EDITOR y operaciones comerciales y de ciclo de vida solo para ADMIN.

Requiere **planes 1–2 y fase 3.3 aceptada (B2)**: identidad vigente, catálogo en
PostgreSQL, reservas persistidas, snapshots y consistencia de checkout. No requiere
el panel operativo 3.4 ni que el plan 3 esté marcado completo.

## Fases

- [ ] **4.1 — [Gestión editorial y permisos por campo](01-gestion-editorial.md).** Pantallas compartidas, contenido, medios y concurrencia. Requiere B2.
- [ ] **4.2 — [Gestión comercial](02-gestion-comercial.md).** Precios y políticas tipadas solo para ADMIN, sin cambiar checkouts previos. Requiere 4.1.
- [ ] **4.3 — [Ciclo de vida y aceptación](03-ciclo-de-vida-y-aceptacion.md).** Altas, estados, archivado y eliminación protegida; recorrido integral. Requiere 4.2.

Las fases son incrementos internos: no exponer formularios ni endpoints de fases
incompletas. La entrega prevista C2 es conjunta; un corte editorial anticipado
necesita aprobación y aceptación explícitas, no queda habilitado por este documento.

## Implementación y evidencia técnica — 2026-11-07

Las tres fases se implementaron juntas en el Compose local, sobre el commit
`bb3cecb`. **Pendientes de aceptación funcional**: no se marcan ni el plan ni sus
fases. No hay migraciones de catálogo: se usan las columnas y relaciones del plan 2.

- Panel `/admin/listings` (listado, búsqueda y estado en texto), `/admin/listings/new`
  (solo ADMIN) y `/admin/listings/[id]` con secciones separadas: contenido y galería
  (ADMIN/EDITOR), precios y condiciones (ADMIN; EDITOR solo lectura) y ciclo de vida
  (ADMIN). BOOKING_MANAGER recibe 404 en páginas y 403 en API. Enlace en `/admin`.
- API: `GET/POST /api/admin/listings`, `GET/DELETE /api/admin/listings/[id]` y `PATCH`
  de `content`, `commercial` y `status`. Las reglas viven en
  `modules/listings/server/listing-admin.ts`. La frontera de escritura pura está en
  `modules/listings/listing-admin-fields.ts`.
- Cada mutación comprueba origen, revalida cuenta/rol/`authVersion` en la transacción,
  bloquea la fila y exige la versión esperada (409 si es obsoleta). La interfaz conserva
  los cambios locales ante 409/401 y recargar es una acción explícita.
- `content` acepta solo campos descriptivos. Cualquier campo comercial o de estado da
  403 y desconocidos, `attributes`, claves punteadas o JSON anidado dan 400; en ambos
  casos no se guarda nada. Cada imagen exige alt informativo o «decorativa» explícita.
  Quitar de la galería borra la asociación, nunca el `MediaAsset` ni su `defaultAlt`.
  Solo cambian las categorías: el término de mascotas se conserva. La subida reutiliza
  `/api/blog/media`.
- `commercial` usa columnas tipadas (centavos, puntos básicos, segundos) con rangos y
  coherencia (incluidos ≤ capacidad; activo exige precio y capacidad). Las reservas
  previas conservan su snapshot.
- Ciclo de vida: alta inactiva con slug único no renombrable; activar exige
  descripción, portada, precio y capacidad; archivar exige confirmación y conserva la
  fila; restaurar deja inactivo. Eliminar solo procede sin reservas ni cupón asociado;
  borra asociaciones y conserva las imágenes. Con historial devuelve 409 y propone archivar.
- Pagos: `POST /api/checkout/btc` ya no abre facturas nuevas para hospedajes inactivos
  o archivados (409 `listing_unavailable`). Los pagos ya abiertos se siguen sirviendo y
  procesando, y archivar no cancela estancias.
- Las páginas públicas son `force-dynamic` y leen PostgreSQL en cada petición: no hay
  caché que invalidar tras el commit. Rutas del panel y su API con `private, no-store`
  y `noindex`.
- Corrección encontrada por la prueba de integración: `where().delete()` del ORM borra
  solo la primera fila; las asociaciones usan `deleteAndCount()`.

```bash
NODE_ENV=development PRISMA_TEST_DATABASE=1 pnpm exec vitest run modules/bookings/_test_/booking-db.test.ts
# 36 passed: añade dos recorridos del plan 4 y conserva B2/H/P/C1.
pnpm exec vitest run modules/listings/_test_/listing-admin-fields.test.ts modules/listings/client/_test_/listing-editor.test.tsx
# 45 + 3 passed.
pnpm test          # 537 passed; 2 fallos preexistentes en backup-progress-archive (fallan igual en bb3cecb).
pnpm run lint      # 0 errores, 2 avisos previos.
pnpm exec tsc --noEmit --incremental false   # limpio en el contenedor (en el host faltan los tipos generados de Next).
```

**Límites:** no hubo recorrido en navegador con cuentas reales de personal (la base
local no tiene usuarios administrativos). No se ensayó el corte C2 ni la restauración.
El término de mascotas (`hp_listing_pets`) no se gestiona desde el panel. La política
de pagos pendientes en hospedajes retirados se aplicó tal como la describe la fase 4.3
y falta la confirmación explícita de la persona solicitante.

## Aceptación y entrega

- [ ] EDITOR modifica solo contenido descriptivo; patches mixtos/comerciales no guardan ninguna parte.
- [ ] ADMIN gestiona precios y ciclo de vida sin modificar condiciones históricas ni perder reservas/referidos.
- [ ] Medios compartidos, invalidación pública y conflictos de versión verificados.
- [ ] Ejecutar controles editoriales, comerciales y de historial de la [verificación común](../comunes/verificacion-y-aceptacion.md).
- [ ] Ensayar y ejecutar el **hito C2** de [transición y recuperación](../comunes/transicion-y-recuperacion.md).
