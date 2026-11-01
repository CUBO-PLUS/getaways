# [ ] Fase 1.1 — Usuarios, contrato y aprovisionamiento

Dependencia: [preparación común](../comunes/00-inventario-y-permisos.md).
No implementa todavía el login ni modifica el catálogo.

[Plan 1 y checklist](README.md).

## Modelo propuesto

Añadir al contrato existente, sin reemplazar ningún modelo:

| Modelo | Campos |
| --- | --- |
| `AdminUser` | `id` Int PK autoincremental, `email` único, `name`, `passwordHash`, `role`, `active`, `authVersion`, `mustChangePassword`, `passwordExpiresAt?`, `passwordChangedAt`, `createdAt`, `updatedAt`, `deactivatedAt?` |
| `AdminLoginThrottle` | `key` String PK, `attempts` Int, `windowEndsAt` DateTime |
| Enum de rol | `ADMIN`, `EDITOR`, `BOOKING_MANAGER`; predeterminado `EDITOR` |

- Usar enum de dominio de Prisma 8 sobre texto con `@@type("pg/text@1")`,
  con restricción de pertenencia generada; no asumir sintaxis de Prisma 7.
- Correo normalizado con trim y minúsculas en altas y búsquedas. `UNIQUE(email)`
  y CHECK de normalización, además de validación de formato y longitud en servidor.
- `authVersion` comienza en 1; CHECK positivo. Incrementos atómicos.
- Nombre obligatorio no vacío. No exponer el hash en DTO, logs, HTML o RSC.
- Fechas con patrones existentes: `DateTime` y `temporal.updatedAt()`.
  El cliente ya carga `temporal-polyfill/full/global`; los valores temporales
  PostgreSQL no deben tratarse automáticamente como `Date` de JavaScript.
- Índice de caducidad del throttle. Sin índices preventivos sobre rol o activo.
- No hay relación de autoría obligatoria con blog, hospedajes o reservas.
- Sin borrado físico de usuarios desde la aplicación; desactivar conserva datos.

## Contraseñas y altas

- Contraseña de 8 a 32 caracteres y máximo 72 **bytes UTF-8**, comprobados antes
  de bcrypt: 32 caracteres multibyte pueden superar ese límite.
- No aplicar trim ni normalización a contraseñas. Permitir gestores y pegado.
- Usar `bcryptjs.hash()`/`compare()` asíncronos; coste inicial 12, calibrado en destino.
- Alta y restablecimiento mediante contraseña temporal; solo guardar su hash,
  exigir cambio y fijar caducidad propuesta de 24 horas.
- Entrega por canal seguro externo. Sin registro público ni recuperación por correo.
- Cambio propio exige contraseña actual, nueva y confirmación.
- Restablecer otra cuenta exige ADMIN y reautenticación; para la propia usar cambio
  de contraseña, no el restablecimiento administrativo.
- Cambiar contraseña invalida todas las sesiones y elimina la condición temporal.

## Último administrador y CLI

1. Rechazar cualquier cambio que deje cero ADMIN activos.
2. Prohibir propia desactivación/degradación desde el panel.
3. Serializar cambios del conjunto de administradores mediante bloqueo
   transaccional común en PostgreSQL. Dentro, revalidar actor, contar y actualizar.
4. No basta bloquear cada usuario por separado: dos administradores podrían
   desactivarse concurrentemente.
5. CLI inicial solo con tabla de usuarios vacía; rechazar ejecuciones posteriores.
6. Recuperación operativa es otro comando explícito, con identidad y confirmación,
   disponible solo a operadores con acceso al servidor/BD. Revoca sesiones también.
7. Entrada oculta de contraseñas; nunca argumentos, historial, fixtures o secretos
   permanentes en entorno. No implementar un endpoint web de bootstrap.

## Archivos afectados o propuestos

- `infrastructure/prisma/contract.prisma`, generados `contract.json` y `contract.d.ts`.
- Nuevo paquete de migración y snapshots en `infrastructure/prisma/migrations/`.
- `modules/users/server/users.ts`: operaciones concretas, no repositorio genérico.
- `scripts/admin-user.mts`, script de invocación en `package.json`.
- `.env.example` y `README.md`: documentación sin credenciales reales.

## Migración versionada de Prisma 8

El esquema del blog se aplicó localmente según el registro del otro worktree.
El contrato termina en `6f61bccf…`, pero `migrations/app/refs/db.json` sigue en
`179c076…`. Confirmar marcador real antes de planificar. No usar el origen implícito
si la referencia quedó atrasada ni `--from @empty` sobre esta base.

Comandos futuros, si la preparación común confirma ese origen:

```bash
pnpm run db:generate
pnpm exec prisma migration plan \
  --from 6f61bccf5fb3a4ddac61b783b36527564f3cbd4a8bf439056252a731b20389c7 \
  --name add_admin_users
pnpm exec prisma db migrate --show
```

Revisar `migration.ts`, `ops.json`, `migration.json` y snapshots. Solo adiciones;
no recreación del blog ni modificación de referidos. No editar generados a mano.
Si se edita una transformación generada, reemitir el paquete según la guía local.

Tras aprobación y respaldo, primero en clon aislado y después en desarrollo:

```bash
pnpm exec prisma db migrate --advance-ref db
pnpm run db:check
pnpm run test:db
pnpm exec tsc --noEmit --incremental false
```

En despliegue usar `pnpm run db:migrate`, sin avanzar referencias del repositorio.
En los planes 2–3 planificar desde el destino aprobado de la migración anterior,
no volver a usar el hash del blog. No usar `db:init`, `db:update`, `migrate dev`,
`migrate deploy`, reseteos o reconciliación forzada como sustitutos de este flujo.

## Cierre

- [ ] Migración incremental revisada y reproducida en una base con datos sintéticos previos.
- [ ] Referidos, publicaciones, borradores, medios y correspondencias de importación intactos.
- [ ] Alta y recuperación sin contraseñas en repositorio o salida de comandos.
- [ ] Correo duplicado rechazado y último ADMIN protegido incluso con concurrencia.
- [ ] Cuenta BOOKING_MANAGER representable sin otorgar acceso editorial.
