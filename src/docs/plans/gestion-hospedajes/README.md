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

## Aceptación y entrega

- [ ] EDITOR modifica solo contenido descriptivo; patches mixtos/comerciales no guardan ninguna parte.
- [ ] ADMIN gestiona precios y ciclo de vida sin modificar condiciones históricas ni perder reservas/referidos.
- [ ] Medios compartidos, invalidación pública y conflictos de versión verificados.
- [ ] Ejecutar controles editoriales, comerciales y de historial de la [verificación común](../comunes/verificacion-y-aceptacion.md).
- [ ] Ensayar y ejecutar el **hito C2** de [transición y recuperación](../comunes/transicion-y-recuperacion.md).
