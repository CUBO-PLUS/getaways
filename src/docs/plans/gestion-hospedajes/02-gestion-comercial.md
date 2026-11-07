# [ ] Fase 4.2 — Gestión comercial de ADMIN

Dependencia: [fase 4.1](01-gestion-editorial.md) y el hito de persistencia B2 ya
aceptado. [Plan 4 y checklist](README.md).
Solo habilitar precios con reservas en PostgreSQL y snapshots completos.

## Pantalla y endpoint

- [x] Habilitar la sección comercial de `app/admin/listings/[id]/page.tsx` solo para ADMIN.
- [x] Implementar `app/api/admin/listings/[id]/commercial/route.ts`: PATCH solo ADMIN.
- [x] Reutilizar operaciones concretas en `modules/listings/server/listing-admin.ts`, sin repositorio genérico ni escritura de atributos arbitrarios.

Implementado el 2026-11-07; [evidencia](README.md#implementación-y-evidencia-técnica--2026-11-07).

## Escritura estricta

Solo `commercial` admite importes, tasas, capacidad máxima, huéspedes incluidos,
mascotas, estancia mínima y horarios. El cuerpo se valida con lista permitida y
conversión estricta; no usar el parser tolerante del snapshot como validación de escritura.
Precios en centavos, impuestos con precisión definida, rangos y coherencia en servidor.
Reutilizar presets existentes únicamente para ADMIN y mostrando los cambios.

La frontera exacta está en la [matriz y campos restringidos](../comunes/00-inventario-y-permisos.md).
No duplicar campos financieros como otra fuente de verdad en JSONB.

- [x] Revalidar sesión/rol y versión dentro de cada transacción, igual que en 4.1.
- [x] Rechazar versiones obsoletas con 409 sin sobrescribir ni perder cambios locales.
- [x] Mantener snapshots acordados de reservas previas; cambiar catálogo no recotiza checkouts abiertos ni altera elegibilidad histórica.
- [x] Invalidar vistas públicas afectadas después del commit, conservando la misma fuente de tarifas para ficha y checkout. Las vistas son `force-dynamic` y leen las mismas columnas, así que no hay caché que invalidar.

## Verificación y cierre

- [x] ADMIN cambia precios, cargos, tasas y políticas válidas; entradas incoherentes no se guardan.
- [x] EDITOR y BOOKING_MANAGER reciben rechazo al invocar directamente el endpoint comercial.
- [x] Una reserva previa mantiene tarifa, cargos, impuestos y condiciones; una nueva usa valores vigentes.
- [ ] Pruebas de contratos comerciales/snapshots registradas según la [verificación común](../comunes/verificacion-y-aceptacion.md).
- [ ] Sin habilitar todavía altas, cambios de estado ni eliminación incompletos de 4.3.
