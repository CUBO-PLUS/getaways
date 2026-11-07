# [ ] Fase 4.3 — Ciclo de vida, eliminación protegida y aceptación

Dependencia: [fase 4.2](02-gestion-comercial.md).
[Plan 4 y checklist](README.md). Cierra la entrega C2.

## Pantallas y endpoints de ADMIN

- [x] Implementar `app/admin/listings/new/page.tsx`: alta solo ADMIN.
- [x] Añadir POST de ADMIN en `app/api/admin/listings/route.ts`.
- [x] Implementar `app/api/admin/listings/[id]/status/route.ts`: PATCH solo ADMIN.
- [x] Añadir DELETE de ADMIN en `app/api/admin/listings/[id]/route.ts`.
- [x] Integrar confirmaciones y reglas con las mismas operaciones de `listing-admin.ts`, sesión vigente y control de versión.

Implementado el 2026-11-07; [evidencia](README.md#implementación-y-evidencia-técnica--2026-11-07).

## Ciclo de vida y eliminación

- [x] Crear con slug único y estado inactivo hasta completar datos mínimos.
- [x] Mantener slugs existentes y no ofrecer renombrado sin estrategia de redirección.
- [x] Activar/desactivar cambia aparición pública y nuevas reservas, no historial.
- [x] Archivar retira de venta y conserva fila para reservas/recibos, con confirmación.
- [x] Eliminar físicamente solo sin reservas ni referencias que lo requieran, incluidos cupones estáticos u otras asociaciones externas identificadas.
- [x] Proteger cualquier reserva mediante FK `Restrict` y comprobación transaccional. Nunca Cascade hacia reservas o referidos.
- [x] Devolver conflicto al eliminar hospedaje con historial y ofrecer archivar; no borrar historial para cumplir la acción.
- [ ] Confirmar y aplicar la política de pendientes: impedir nuevos pagos sobre hospedajes retirados, pero procesar con seguridad pagos ya abiertos/tardíos, sin perder referencias ni cambiar importes. Archivar no cancela estancias pagadas automáticamente. **Aplicada** tal como está escrita y verificada por API; falta la confirmación de la persona solicitante.

Las mutaciones conservan la revalidación transaccional de sesión/rol/versión.
Invalidar después del commit las vistas públicas reales; disponibilidad, acceso
directo y checkout deben respetar estado vigente.

## Verificación futura

```bash
pnpm exec vitest run modules/listings/_test_ shared/media/_test_
NODE_ENV=development PRISMA_TEST_DATABASE=1 pnpm exec vitest run modules/listings/_test_/listing-admin-db.test.ts
pnpm exec tsc --noEmit --incremental false
pnpm run lint
```

La prueba de integración es propuesta; configurar y comprobar destino aislado.

- [ ] Navegador: ADMIN alta/cambio de precio/archivado y EDITOR descripción/portada/galería; enviar patches comerciales y anidados manipulados.
- [x] Comprobar que reservas previas mantienen las condiciones garantizadas por 3.2–3.3.
- [ ] Ejecutar aceptación de catálogo/medios/historial de la [verificación común](../comunes/verificacion-y-aceptacion.md).
- [ ] Ensayar y ejecutar [corte C2](../comunes/transicion-y-recuperacion.md); si 3.4 está entregada, añadir recorrido conjunto con su panel. Su ausencia no bloquea C2.

## Cierre

- [ ] ADMIN crea, edita datos/precios, gestiona imágenes, retira y elimina hospedajes eliminables; con historial solo archiva.
- [ ] EDITOR modifica solo datos descriptivos; no cambia directa ni indirectamente total, elegibilidad, estado de venta o capacidad de una estancia.
- [ ] BOOKING_MANAGER no modifica catálogo por endpoint directo.
- [ ] Ficha y checkout no muestran tarifas de fuentes diferentes; medios compartidos y reservas históricas sobreviven a retirada de galerías/archivado.
- [ ] Evidencia C2 registrada y todas las fases del plan aceptadas antes de marcarlo completo.
