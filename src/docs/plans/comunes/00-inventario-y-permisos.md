# [ ] Preparación común — Inventario y permisos

Dependencia: ninguna. Estado: inventario de código realizado; decisiones y estado
real de servicios pendientes de confirmación.

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

- [ ] Aprobar matriz, cuenta de un solo rol y campos comerciales restringidos.
- [ ] Confirmar que EDITOR puede actualizar contenido público del hospedaje sin revisión
   previa; publicación del blog permanece reservada a ADMIN.
- [ ] Aprobar gestión inicial de reservas: contacto, notas, filtros y cancelación;
   reprogramación, descuentos manuales, confirmación manual y reembolsos quedan
   pendientes de reglas específicas, no implícitos en «gestionar».
- [ ] Confirmar entrega de contraseñas temporales, responsables de recuperación,
   ocho horas de sesión y logout de todas las sesiones.
- [ ] Identificar origen HTTPS, proxy confiable, instancias, respaldos y almacenamiento.
- [ ] Comprobar datos de reservas existentes sin imprimir datos personales y aprobar
   su importación privada; no asumir que el archivo local está vacío.

## Verificación

Desde `src/`, antes de implementar:

- [ ] Ejecutar y registrar la línea base de los siguientes comandos; no ocultar errores previos.

```bash
git status --short
pnpm run db:check
pnpm exec prisma db migrate --show
pnpm test
pnpm exec tsc --noEmit --incremental false
pnpm run lint
```

## Cierre

- [ ] Decisiones registradas y línea base de errores conocida.
- [ ] Marcador, servicios y datos reales identificados.
- [ ] Confirmada la exclusión de la importación de los nueve artículos y sus imágenes.
