# [ ] Fase 4.1 — Gestión editorial y permisos por campo

Dependencia: planes 1–2 y [fase 3.3 aceptada (B2)](../reservas/03-entradas-corte-y-verificacion.md).
[Plan 4 y checklist](README.md). No depende del panel operativo de reservas.
No hacer CRUD sobre JSON fuente ni exponer operaciones de fases aún incompletas.

## Pantallas y endpoints editoriales

- [ ] Implementar `app/admin/listings/page.tsx`: listado con estado, búsqueda y accesos según rol.
- [ ] Implementar `app/admin/listings/[id]/page.tsx`: preparar secciones descriptivas y comerciales separadas, sin habilitar todavía la segunda.
- [ ] Implementar GET de `app/api/admin/listings/route.ts` para ADMIN/EDITOR y lectura autorizada en `app/api/admin/listings/[id]/route.ts`.
- [ ] Implementar `app/api/admin/listings/[id]/content/route.ts`: PATCH de ADMIN/EDITOR.
- [ ] Reutilizar la carga/selección de medios del plan 2.
- [ ] Mantener operaciones en `modules/listings/server/listing-admin.ts` y componentes en `modules/listings/client/`. Rutas finas, reglas en servidor.

No ofrecer a BOOKING_MANAGER este formulario ni un GET completo del catálogo
administrativo: obtiene solo resumen operativo por la sección de reservas.

## Autorización por campo, no solo por formulario

El endpoint `content` acepta exclusivamente:

- Título y descripción, manteniendo sanitización del render existente.
- Ubicación descriptiva, edificio, dormitorios, baños, estacionamientos y comodidades.
- Vídeo de origen/protocolo admitido; categorías existentes.
- Portada, galería ordenada, grupos por habitación y alt contextual.
- Versión esperada de concurrencia.

Rechazar con 403 intentos de modificar campos comerciales y con 400 campos
desconocidos. Si llega un patch mixto con `title` y `price`, **no guardar ninguna
parte**. No ignorar silenciosamente campos prohibidos.

No aceptar directamente `attributes`, claves punteadas, patches JSON arbitrarios,
`Object.assign()` de la solicitud o relaciones anidadas sin validar. Un campo
oculto de formulario, preset o importación HTTP también debe pasar por esa frontera.

Todas las mutaciones revalidan sesión/rol y versión dentro de la transacción.
Versión obsoleta devuelve 409 sin sobrescribir. La interfaz no pierde cambios
locales si se revoca la sesión o hay conflicto.

## Imágenes y publicación descriptiva

EDITOR puede subir, elegir, reordenar y retirar imágenes de la ficha. «Retirar de
la galería» no significa borrar un objeto compartido por blog u otro hospedaje.
Conservar validación de bytes, dimensiones, tamaño, nombres y compensación.

Exigir alt informativo o elección decorativa explícita. Evitar editar metadatos
compartidos que alteren publicaciones del blog. No borrar objetos con referencias
activas; borrado definitivo, solo ADMIN y tras comprobación global de referencias.
No añadir recolección automática de huérfanos en esta fase.

En un hospedaje activo, guardar contenido descriptivo lo actualiza públicamente;
no equivale a permitir su activación al EDITOR. Invalidar después del commit las
vistas reales afectadas: detalle, archivos, relacionados, portada, destinos y sitemap.
También disponibilidad y rutas directas deben respetar estado vigente.

## Verificación y cierre

- [ ] Probar ADMIN/EDITOR editando descripción, portada y galería sin alterar metadatos compartidos del blog.
- [ ] Enviar PATCH manipulado con `price`, `active`, `guests`, `petsAllowed` y JSON anidado; comprobar rechazo completo sin escrituras.
- [ ] Comprobar que BOOKING_MANAGER no modifica catálogo mediante endpoint directo.
- [ ] Verificar conflictos y revocación sin pérdida de cambios locales; aplicar las [pruebas comunes](../comunes/verificacion-y-aceptacion.md).
- [ ] Dejar el incremento listo para 4.2, sin declarar entregado C2 ni habilitar operaciones comerciales incompletas.
