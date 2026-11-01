# [ ] Plan 1 — Usuarios, roles y acceso al panel

[Orden general y seguimiento](../README.md).

## Objetivo y límites

Sustituir el administrador compartido por cuentas individuales en PostgreSQL,
centralizar identidad y sesiones, gestionar usuarios y autorizar el blog por rol.
No migra catálogo/reservas ni implementa sus paneles administrativos.

Dependencia: preparación y decisiones del [inventario común](../comunes/00-inventario-y-permisos.md).

## Fases

- [ ] **1.1 — [Usuarios, contrato y aprovisionamiento](01-usuarios-y-migraciones.md).** Modelo, migración aditiva, contraseñas, bootstrap y recuperación. Requiere preparación común.
- [ ] **1.2 — [Autenticación y sesiones](02-autenticacion-y-sesiones.md).** Identidad común, revocación y límite compartido. Requiere 1.1.
- [ ] **1.3 — [Panel de usuarios y autorización del blog](03-panel-usuarios-y-autorizacion-blog.md).** Primer hito funcional entregable. Requiere 1.2.

Las fases 1.1–1.2 son prerrequisitos internos, no cortes que mantengan simultáneamente
cuentas individuales y acceso mediante contraseña compartida.

## Aceptación y entrega

- [ ] ADMIN administra cuentas y publicación; EDITOR trabaja borradores; BOOKING_MANAGER no accede a usuarios ni contenido editorial privado.
- [ ] Revocación, último ADMIN, throttle compartido y credenciales temporales verificados.
- [ ] Blog público, referidos y medios existentes conservados; sin importar artículos.
- [ ] Ejecutar los controles aplicables de [verificación común](../comunes/verificacion-y-aceptacion.md) y registrar evidencia.
- [ ] Ensayar y ejecutar el **hito A** de [transición y recuperación](../comunes/transicion-y-recuperacion.md), incluida recuperación CLI.

Completar este plan desbloquea el plan 2. BOOKING_MANAGER puede tener un inicio
explicativo hasta que exista su sección, sin recibir permisos de otras áreas.
