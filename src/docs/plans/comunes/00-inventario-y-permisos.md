# [x] Preparación común — Inventario y permisos

Dependencia: ninguna. Estado: completada para continuar el trabajo local el 2026-11-03.
El destino Coolify aún no existe; esto no acredita preparación para desplegar.

[Orden general](../README.md). Preparación compartida de los cuatro planes;
no marcar completa hasta confirmar decisiones, servicios, datos y línea base.

## Hallazgos actuales

| Área | Fuente real | Limitación |
| --- | --- | --- |
| Identidad | `modules/content/server/blog-auth.ts` | Contraseña compartida por hash de entorno; sin usuarios persistidos |
| Sesiones | JWT HS256 de ocho horas, cookie `blog_admin_session` | Solo claim `role: admin`; logout no revoca copias del JWT |
| Origen | `assertSameOrigin()` | Origen exacto; configuración acoplada al hash compartido |
| Intentos | Contadores de proceso | Hasta cinco fallos por quince minutos; no protege entre instancias |
| Blog | `BlogPost` y `BlogPublication` | Borrador separado de publicación; preservar control de versión |
| Medios del blog | `MediaAsset` + RustFS/S3 | Acceso público solo por referencia publicada; en otro caso requiere sesión |
| Hospedajes | `data/listings.json`, `listing_terms.json`, `terms.json` | Lecturas locales; no existe CRUD administrativo persistido |
| Medios del catálogo | `data/media.json`, `public/media/` | Lectura local, rutas públicas y dimensiones obtenidas del filesystem |
| Reservas | `modules/bookings/server/booking-store.ts` | Memoria + `.data/bookings.json`; no coordina procesos o instancias |
| Pagos | `modules/payments/btc-mock.ts` | Stub en memoria; persistir reservas no hace persistente al proveedor |
| Referidos | PostgreSQL | Atribución por `bookingId`, sin FK actual; conservar identificadores |

Los JSON fuente contienen **11 hospedajes, 9 artículos, 321 medios, 20 relaciones
de hospedajes y 53 términos**. Son recuentos de archivos, no de PostgreSQL.

El contrato `infrastructure/prisma/contract.prisma` conserva `ReferralCode`,
`ReferralAttribution`, `BlogPost`, `BlogPublication`, `MediaAsset`, `BlogCategory`,
`BlogPostCategory`, `BlogPublicationCategory` y `BlogImportMapping`.

## Matriz objetivo

| Operación | Público | EDITOR | BOOKING_MANAGER | ADMIN |
| --- | :---: | :---: | :---: | :---: |
| Leer publicaciones y catálogo activo | Sí | Sí | Sí | Sí |
| Crear reserva / consultar checkout propio | Con credencial de huésped cuando corresponda | Igual | Igual | Igual |
| Leer, crear y editar borradores del blog | No | Sí | No | Sí |
| Vista previa y medios privados del blog | No | Sí | No | Sí |
| Publicar o retirar artículos | No | No | No | Sí |
| Consultar listado administrativo de hospedajes | No | Sí | Solo resumen operativo necesario | Sí |
| Editar descripción, imágenes y datos descriptivos | No | Sí | No | Sí |
| Crear, activar, desactivar, archivar o eliminar hospedajes | No | No | No | Sí |
| Cambiar precios, tasas, cargos, capacidad y políticas de reserva | No | No | No | Sí |
| Listar reservas y consultar datos de huéspedes | No | No | Sí | Sí |
| Editar contacto, notas y cancelar reservas | No | No | Sí | Sí |
| Modificar total, marcar pagado o reembolsar arbitrariamente | No | No | No | No: usar flujo de negocio específico |
| Listar/crear/desactivar usuarios, asignar roles y restablecer contraseña ajena | No | No | No | Sí |
| Cambiar contraseña propia y cerrar sesión | No | Sí | Sí | Sí |

Los roles se aplican a todos los recursos del área, no por autor o propietario.
Cada cuenta tiene un rol. ADMIN no es permiso para saltarse validaciones financieras.

## Frontera editorial de hospedajes

**Permitido:** título, descripción, ubicación descriptiva, edificio, dormitorios,
baños, estacionamientos, comodidades, vídeo válido, portada, orden de galería,
agrupación por habitación y textos alternativos; asignación de categorías existentes.

**Solo ADMIN:** precio por noche, limpieza, cargo por mascota y huésped extra,
impuestos, capacidad máxima (`guests`), huéspedes incluidos (`base_guests`), permiso
de mascotas, estancia mínima, horarios de entrada/salida y estado comercial.

La capacidad y las políticas no son meramente descriptivas: cambian la elegibilidad
y el cálculo de una reserva. Tampoco aceptar un objeto `attributes` completo desde
el editor: contiene campos comerciales y permitiría eludir esta separación.
Los cambios descriptivos se aplican directamente al hospedaje existente; no se
construye otro sistema de borradores/publicaciones para el catálogo.

## Entradas del blog que se adaptarán

- Server Components: `app/admin/blog/page.tsx`, `[id]/page.tsx`,
  `[id]/preview/page.tsx`; login en `app/admin/blog/login/page.tsx`.
- `app/api/blog/admin/login/route.ts`, `logout/route.ts`.
- `app/api/blog/admin/posts/route.ts`: GET protegido y POST con origen + sesión.
- `app/api/blog/admin/posts/[id]/route.ts`: GET protegido y PUT con origen + sesión.
- `app/api/blog/admin/posts/[id]/{publish,unpublish}/route.ts`: POST con origen + sesión.
- `app/api/blog/admin/categories/route.ts`: lectura protegida.
- `app/api/blog/media/route.ts`: carga protegida con origen, límites y validación real.
- `app/api/blog/media/[id]/route.ts`: lectura anónima por referencia publicada;
  si no, sesión. Respuesta `private, no-store`.
- `modules/content/server/blog-operations.ts`: funciones compartidas sin comprobación
  interna de permisos; hoy las invocan los endpoints anteriores.

La vista previa autentica antes de consultar el borrador; tiene `noindex`.
No se encontraron Server Actions editoriales ni middleware/proxy de autorización.
No asumir que proteger un layout protege endpoints o futuras acciones.

## Flujos de catálogo, reserva y checkout que se adaptarán

- Catálogo: `modules/listings/server/{listings,detail}.ts`,
  `modules/site/server/home.ts`, páginas `/properties`, `/listing/[slug]`,
  `/listing-category/[slug]`, `/destinations/[slug]`, sus metadatos y `app/sitemap.ts`.
- Reservas: `modules/bookings/server/{bookings,booking-store,availability-search}.ts`.
- Entradas públicas: `app/api/bookings/route.ts`,
  `app/api/listings/[id]/availability/route.ts`,
  `app/api/checkout/{quote,status,btc}/route.ts`, `app/checkout/page.tsx`,
  `app/(site)/booking-confirmation/page.tsx`.
- Llamadores de `getListing()`: reglas de reservas, confirmación,
  `modules/checkout/server/checkout.ts` y endpoints de cotización/Bitcoin.
  Actualmente es síncrona y lee JSON: pasar a BD implica adaptar todos sus llamadores.
- Referidos: `modules/referrals/referral-store.ts` consulta la reserva por ID;
  no debe perder atribución al cambiar el almacenamiento.

`GET /api/checkout/btc` hoy puede ejecutar `markPaid()` al consultar el proveedor.
Es una mutación real, aunque el método sea GET. Revisarla en la fase 3.3 del plan de reservas, no describir
todo el checkout como lectura ni convertir el panel en otro confirmador de pagos.

## Decisiones a cerrar

- [x] Aprobar matriz, cuenta de un solo rol y campos comerciales restringidos.
- [x] Confirmar que EDITOR puede actualizar contenido público del hospedaje sin revisión
   previa; publicación del blog permanece reservada a ADMIN.
- [x] Aprobar gestión inicial de reservas: contacto, notas, filtros y cancelación;
   reprogramación, descuentos manuales, confirmación manual y reembolsos quedan
   pendientes de reglas específicas, no implícitos en «gestionar».
- [x] ADMIN establece contraseñas de otras cuentas y confirma sus cambios con su
   propia contraseña; cada usuario puede cambiar su propia contraseña. Decisión de
   la persona solicitante, 2026-11-02.
- [x] Las contraseñas pueden usarse indefinidamente, sin cambio obligatorio inicial.
   Decisión de la persona solicitante, 2026-11-02.
- [x] Sesiones de ocho horas y revocación de todas las sesiones al cambiar una
   contraseña o desactivar la cuenta.
- [x] Entregar contraseñas por canal privado; la persona solicitante será responsable
   de recuperar el acceso administrativo. Confirmado el 2026-11-02.
- [x] Identificar origen HTTPS, proxy confiable, instancias, respaldos y almacenamiento.
   Destino futuro `getaways.mauriciodmo.com` en Coolify, una instancia, proxy/HTTPS de
   Coolify, PostgreSQL y RustFS allí; respaldos solo locales. Verificar configuración y
   respaldo independiente antes del despliegue.
- [x] Resolver datos de reservas existentes sin imprimir datos personales: la persona
   solicitante confirma que no hay reservas y no autoriza inspeccionar las fuentes. No
   se importan reservas; esta conclusión es una confirmación del solicitante, no una
   inspección independiente.

### Confirmaciones operativas — 2026-11-03

- El despliegue futuro será en Coolify bajo `getaways.mauriciodmo.com`; el servidor/proyecto
  aún no existe. Se prevé una instancia inicial; Coolify gestionará HTTPS y proxy inverso,
  y alojará PostgreSQL y RustFS. Verificar configuración real cuando se aprovisione.
- Los respaldos actuales son solo locales. Sirven para el trabajo local, no para aprobar
  un corte/despliegue; antes de ese hito hace falta un destino independiente y ensayo de
  restauración.
- La persona solicitante confirma que no hay reservas y no autoriza inspeccionar fuentes
  locales. Registrar como declaración del solicitante, no como comprobación independiente;
  no importar reservas sin aprobación posterior si se descubre que existen.
- [x] No volver a importar los nueve artículos del blog ni sus imágenes en estos planes.

Las decisiones marcadas sobre roles, gestión inicial de reservas y sesiones fueron
confirmadas por la persona solicitante el 2026-11-02; no autorizan migraciones,
importaciones ni restauraciones.
La persona solicitante confirmó que todo el entorno objetivo está en local; esto no
demuestra por sí solo el contenido de la memoria de los procesos locales.

## Verificación

Desde `src/`, antes de implementar:

- [x] Ejecutar y registrar la línea base de los siguientes comandos; no ocultar errores previos.

```bash
git status --short
pnpm run db:check
pnpm exec prisma db migrate --show
pnpm test
pnpm exec tsc --noEmit --incremental false
pnpm run lint
```

## Cierre

- [x] Decisiones registradas y línea base de errores conocida.
- [x] Marcador, servicios y datos locales identificados (evidencia actual abajo).
- [x] Confirmada la exclusión de la importación de los nueve artículos y sus imágenes.

## Línea base local — 2026-11-02

Registro inicial sobre `main` en `1f18b7e`; no equivale a aceptación de la preparación.
El árbol tenía modificado `src/docs/plans/blog/README.md` y `.opencode/` sin seguimiento.
No se ejecutaron migraciones, importaciones ni restauraciones.

| Comprobación | Resultado |
| --- | --- |
| `git status --short` | Cambios locales indicados arriba, anteriores a este registro. |
| `pnpm run db:check` | En el host falló: `CONFIG.DB_CONNECTION_REQUIRED`. En `gateways-dev-app-1`, marcador y esquema coinciden con el contrato. |
| `pnpm exec prisma db migrate --show` | En el host falló por falta de conexión. En el contenedor: sin migraciones pendientes. |
| `pnpm test` | 59 archivos y 446 pruebas aprobadas; 6 archivos y 6 pruebas omitidas. |
| `pnpm exec tsc --noEmit --incremental false` | Correcto. |
| `pnpm run lint` | Falló: cuatro errores `@typescript-eslint/no-require-imports` en `backups/blog-migrado-20261102/restore-objects.cjs`. |

La aplicación local respondió HTTP 200; PostgreSQL y RustFS estaban activos y
saludables, y el endpoint de disponibilidad de RustFS respondió HTTP 200. Los puertos
estaban ligados a localhost. El bucket configurado tenía 65 objetos; no se comprobó
individualmente su integridad. En PostgreSQL se contaron nueve `BlogPost`, nueve
`BlogPublication`, 65 `MediaAsset`, 77 `BlogImportMapping` y cero filas en cada
tabla de referidos. Marcador `app`:
`6f61bccf5fb3a4ddac61b783b36527564f3cbd4a8bf439056252a731b20389c7`.
El archivo `.data/bookings.json` no estaba presente en `/app` del contenedor; esto no
descarta reservas en memoria ni en otros destinos. Una revisión posterior tampoco
encontró ese archivo en las dos rutas locales revisadas. `compose.prod.yaml` no
define RustFS ni demuestra por sí solo la configuración completa de producción.

En esa línea base quedaban por identificar origen HTTPS, proxy, otras instancias y
responsables; comprobar datos de reservas y ensayar recuperación. El
[seguimiento del blog](../blog/README.md) registra el checkpoint local existente y
sus límites: no acredita una restauración. Las decisiones anteriores requieren
aprobación explícita; no se infieren de esta línea base.

Antes de implementar el plan 1 se creó el checkpoint local
`src/backups/progreso-20261102T225648428Z-JXtk67.tar.gz`: dump completo y 65 objetos,
con referencias conciliadas, listado estable y hashes verificados. No incluye cambios
de código sin commit. Se restauró el dump en el contenedor aislado sin red
`gateways-restore-jxtk67-20261102`: 9 borradores y versiones, 9 publicaciones,
65 activos y marcador presentes. Los 65 objetos se verificaron sin red, pero no se
restauraron en ese ensayo. Posteriormente se recuperaron conjuntamente la base y los
objetos del checkpoint siguiente; consultar la evidencia del [plan 1](../user-and-roles/README.md).
La base del primer ensayo reside en tmpfs y no constituye un respaldo persistente.

## Verificación local — 2026-11-03

Tras autorización de la persona solicitante, se levantó `compose.dev.yaml`; no se
consultaron reservas, ni se ejecutaron migraciones o importaciones.

| Comprobación | Resultado |
| --- | --- |
| Servicios | `app`, PostgreSQL y RustFS activos; PostgreSQL/RustFS saludables. |
| App y RustFS | App `HTTP 200`; `/health/ready` de RustFS `HTTP 200`. |
| `pnpm run db:check` | Correcto: marcador y esquema coinciden con el contrato; sin advertencias. |
| `pnpm exec prisma db migrate --show` | Correcto: no hay migraciones pendientes. |
| Marcador | `storageHash` `1d24b7dffc9a8683f50290225c3f53f644a21598a8804dec3c879f7d65e94772`; `profileHash` `3916f444a8a17ad749191acf9e08dad97d1a327b88c2f1d45d12f240296aa8b2`. |

La declaración de que no existen reservas no fue verificada directamente, por petición
de no inspeccionar sus fuentes. Coolify y su respaldo independiente siguen pendientes;
revalidarlos antes de cualquier corte o despliegue.
