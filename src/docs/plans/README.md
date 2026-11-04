# Planes de ampliación del panel

Estado: **plan 1 aceptado por la persona solicitante el 2026-11-03, con excepciones operativas pendientes**;
planes 2–4 pendientes. Inventario de referencia: 2026-10-31. El seguimiento de cada
plan distingue los cambios realizados de las verificaciones y entregas pendientes.

## Orden de ejecución y seguimiento

Todos los checkboxes empiezan pendientes. Marcar una fase solo después de registrar
su verificación y aceptación; marcar el plan cuando estén aceptadas todas sus fases
y su entrega. Las listas descriptivas de modelos, rutas y permisos no son tareas.

- [x] **Preparación común:** cerrada para continuar el trabajo local; verificada la app, PostgreSQL, RustFS y el marcador el 2026-11-03. Coolify aún no existe: esta aceptación no declara listo el futuro despliegue; revisar allí servicios y respaldos antes del corte.
- [x] **Plan 1 — [Usuarios, roles y acceso al panel](user-and-roles/README.md).** Aceptado por la persona solicitante con las excepciones operativas registradas en su README; no equivale a declarar listo un corte/despliegue.
  - [x] 1.1 — Usuarios, contrato, migración y aprovisionamiento.
  - [x] 1.2 — Autenticación común y sesiones revocables.
  - [x] 1.3 — Panel de usuarios y autorización del blog.
- [ ] **Plan 2 — [Persistencia del catálogo y medios](catalogo-y-medios/README.md).** Requiere el plan 1 para identidad y acceso a medios privados; no habilita administración comercial.
  - [ ] 2.1 — Modelo y contrato del catálogo.
  - [ ] 2.2 — Importación verificada de hospedajes y medios.
  - [ ] 2.3 — Lectores públicos, checkout y acceso a medios sobre PostgreSQL.
- [ ] **Plan 3 — [Persistencia y gestión de reservas](reservas/README.md).** Requiere el plan 2.
  - [ ] 3.1 — Modelo e importación privada de reservas.
  - [ ] 3.2 — Consistencia financiera, snapshots y concurrencia.
  - [ ] 3.3 — Adaptación de entradas, corte a PostgreSQL y verificación. **Hito de persistencia que desbloquea el plan 4.**
  - [ ] 3.4 — Panel operativo de reservas.
- [ ] **Plan 4 — [Administración de hospedajes](gestion-hospedajes/README.md).** Requiere planes 1–2 y el hito 3.3; no depende de terminar el panel 3.4.
  - [ ] 4.1 — Gestión editorial y permisos por campo.
  - [ ] 4.2 — Gestión comercial de ADMIN.
  - [ ] 4.3 — Ciclo de vida, eliminación protegida y aceptación integrada.

```text
Preparación → Plan 1 → Plan 2 → Plan 3: 3.1 → 3.2 → 3.3
                                                    ├→ 3.4 Panel de reservas
                                                    └→ Plan 4: 4.1 → 4.2 → 4.3
```

Las fases 3.4 y el plan 4 pueden implementarse y entregarse sin esperar una a la
otra. Coordinar cambios en contrato y migraciones: partir siempre del destino
aprobado anterior, no generar/aplicar ramas de migración incompatibles.

La edición meramente descriptiva podría adelantarse tras el plan 2, pero **no se
adopta ese corte en este orden**: exigiría aceptación y despliegue parciales
explícitos, sin precios, cambios de estado comercial ni borrados.

## Controles que acompañan cada fase

- [ ] Aplicar y registrar las comprobaciones pertinentes de [verificación y aceptación](comunes/verificacion-y-aceptacion.md), sin esperar al final.
- [ ] Ensayar respaldo, corte y recuperación de cada entrega según [transición y recuperación](comunes/transicion-y-recuperacion.md).
- [ ] Registrar por entrega comandos/resultados, versión, marcador de migración, responsable y pendientes. Ningún checkbox sustituye la evidencia.

Estos documentos son guías transversales, no planes adicionales ni fases finales.
Cada README identifica sus criterios y corte: A (identidad), B1 (catálogo), B2
(reservas persistidas), C1 (panel de reservas) y C2 (administración de hospedajes).

## Reglas y alcance comunes

Todas las rutas de código y comandos son relativos a `src/`. Los archivos y comandos
propuestos todavía no existen necesariamente. Migraciones e importaciones requieren
aprobación, respaldo y primera ejecución sobre una base aislada.

- Roles fijos de una sola asignación: **ADMIN**, **EDITOR**, **BOOKING_MANAGER**.
  La [matriz común](comunes/00-inventario-y-permisos.md) define los permisos; no se
  crea un motor configurable ni roles múltiples sin una necesidad confirmada.
- Autorizar cada lectura protegida y mutación en servidor; no confiar en navegación.
- Reutilizar `jose`, `bcryptjs`, el cliente PostgreSQL y las reglas existentes.
- Conservar referidos, blog, migraciones, IDs e historial; nunca cascadas a reservas/pagos.
- No escribir operaciones en JSON fuente ni mantener fallbacks/dual-write improvisados.
- Catálogo, disponibilidad agregada y checkout del huésped siguen públicos con su
  credencial propia; la sesión de personal no sustituye la credencial de checkout.
- Sin SSO, MFA, correo transaccional, auditoría avanzada, reembolsos automáticos ni
  proveedor de pagos real como requisitos. El mock de pagos sigue siendo de desarrollo.
- Los **nueve artículos y sus imágenes ya se importaron en el entorno local**; ese
  resultado no demuestra el estado de otros destinos. Ninguna nueva importación queda
  autorizada por estos planes. El lector público del blog ya consulta PostgreSQL.

## Antecedentes y límites de la evidencia

`feature/blog-editorial` se integró en `main` por fast-forward hasta `9e2871b`.
La planificación previa revisó código, pruebas y guías locales de Next.js 16.4.2;
antes de implementar, volver a verificar versiones y documentación correspondiente.

- Prisma CLI `8.0.0-rc.23`, runtime `@prisma/orm-postgres@8.0.0-rc.18`.
- Blog: `jose ^6.2.14`, `bcryptjs ^3.0.3`.
- Next.js: `node_modules/next/dist/docs/01-app/02-guides/authentication.md`,
  `data-security.md` y referencia de `cookies`.
- Prisma: `.agents/skills/prisma-8/references/contract.md`, `migrations.md`,
  `migration-model.md` y `queries-postgres.md`.
- [Claims en jose 6.2.14](https://github.com/panva/jose/blob/v6.2.14/docs/types/interfaces/JWTClaimVerificationOptions.md).
- [Seguridad y API de bcryptjs](https://github.com/dcodeIO/bcrypt.js#security-considerations).
- [Plan previo del blog](blog/propuesta-original.md) y
  [revisión editorial](blog/revision-editorial.md).

El worktree del blog conserva cambios locales no incluidos en el merge:
`src/compose.dev.yaml` y `src/docs/levantamiento-local-20261031.md`. No descartarlos
ni incorporarlos automáticamente. El registro histórico describía una base sin
artículos; la línea base del 2026-11-02 confirma nueve artículos en la base local,
sin afirmar el estado de otros destinos.

Consultar la evidencia de línea base y registrar las verificaciones y restauraciones
de cada implementación; actualizar el checklist de fase y el de este índice.
