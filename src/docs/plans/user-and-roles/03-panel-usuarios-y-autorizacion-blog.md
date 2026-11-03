# [ ] Fase 1.3 — Panel común, usuarios y autorización editorial

Dependencia: [fase 1.2](02-autenticacion-y-sesiones.md).
Primer hito desplegable sin esperar la migración del catálogo.

[Plan 1 y checklist](README.md).

## Usuarios y navegación

Rutas propuestas:

| Página / endpoint | Acceso |
| --- | --- |
| `app/admin/page.tsx` | Inicio y enlaces según rol, sin cargar datos de otras áreas |
| `app/admin/users/page.tsx` | ADMIN: listado y alta |
| `app/admin/account/password/page.tsx` | Cualquier cuenta activa |
| `app/api/admin/users/route.ts` | GET/POST de ADMIN |
| `app/api/admin/users/[id]/route.ts` | PATCH de nombre, rol y estado por ADMIN |
| `app/api/admin/users/[id]/reset-password/route.ts` | POST de ADMIN con reautenticación |
| `app/api/admin/account/password/route.ts` | POST de cambio propio con contraseña actual |

Componentes cliente en `modules/users/client/`; operaciones del servidor en
`modules/users/server/users.ts`. Listado sin hash. Correo inicialmente inmutable.
No endpoint público de creación ni pantalla para recuperar contraseña por correo.

No redirigir a BOOKING_MANAGER hacia el blog al iniciar sesión. Mientras la sección
de reservas no exista, mostrar un inicio explicativo sin otorgar otros permisos.
Los enlaces no son controles de acceso: cada destino verifica sus permisos.

Confirmar alta, cambio de rol, desactivación y restablecimiento mostrando cuenta y
efecto sobre sesiones. Exigir contraseña actual para acciones sensibles. Aplicar
protección del último ADMIN en servidor, incluso al llamar directamente al endpoint.

## Blog: adaptar todos los caminos

1. Server Components de listado y edición: ADMIN/EDITOR; BOOKING_MANAGER sin acceso.
2. Vista previa: misma autorización antes de consultar `BlogPost`, `noindex` y sin
   caché compartida. No introducir enlaces de vista previa públicos.
3. GET de listado, borrador y categorías: ADMIN/EDITOR, DTO mínimo, no-store también
   en errores. Evitar devolver documentos completos en listado si no se necesitan.
4. Crear y guardar: ADMIN/EDITOR; publicar y retirar: solo ADMIN.
5. Llevar autorización a las operaciones compartidas de
   `modules/content/server/blog-operations.ts`, con identidad obtenida del servidor.
   Mantener transacciones, bloqueo del artículo, control de versión y validaciones.
6. Carga de medios: ADMIN/EDITOR, origen y límites antes de procesar. Conservar
   detección real con sharp, límites de píxeles/tamaño y compensación S3.
7. Lectura de medios: público solo por referencia publicada; privados para
   ADMIN/EDITOR. BOOKING_MANAGER no puede explorar imágenes privadas del blog.
8. Reemplazar completamente `isBlogAdmin()`; no redefinirlo como «cualquier usuario».

Archivos existentes afectados: todos los listados en el [inventario común](../comunes/00-inventario-y-permisos.md) bajo
`app/admin/blog/`, `app/api/blog/`, `modules/content/server/blog-auth.ts`,
`blog-operations.ts` y `modules/content/client/{blog-admin,blog-editor,blog-login}.tsx`.

## Lecturas públicas que deben conservarse

`modules/content/server/{content,content-postgres,editorial}.ts`, `/blog`,
`/category/[slug]`, `/{año}/{mes}/{día}/{slug}`, portada, metadatos y ambos sitemaps
siguen consultando publicaciones, no borradores. Una cookie administrativa no
cambia la fuente pública. Conservar independencia entre guardado y publicación.

No añadir borrado del blog o CRUD de categorías: no son necesarios para usuarios.
No importar los nueve artículos para probar roles; utilizar contenido sintético aislado.

## Experiencia y accesibilidad

- Etiquetas, errores vinculados a campos, `role=alert`, foco visible y navegación
  por teclado. Confirmaciones con cancelación y devolución del foco.
- `autocomplete=username`, `current-password` y `new-password` apropiados.
- `401`: sesión inválida; `403`: permiso insuficiente; `409`: conflicto o protección
  del último administrador; `503`: servicio no disponible. No revelar detalles internos.
- Editor sin botón de publicación; peticiones directas igualmente rechazadas.
- Revocación durante edición: detener autoguardado y permitir copiar cambios locales;
  no borrarlos o redirigir descartándolos silenciosamente.
- Logout solo muestra éxito global cuando el servidor confirmó la revocación.

## Verificación futura

```bash
pnpm exec vitest run modules/content/_test_ modules/auth/_test_ modules/users/_test_
pnpm exec tsc --noEmit --incremental false
pnpm run lint
```

Completar pruebas de autorización con PostgreSQL descritas en la [verificación común](../comunes/verificacion-y-aceptacion.md) y recorrido
de navegador con los tres roles. Si se conserva alguna acción de servidor nueva,
verificarla como entrada independiente y aplicar sus protecciones de origen.

## Cierre

- [x] ADMIN puede gestionar cuentas y completar flujo editorial; EDITOR prepara borradores.
- [x] BOOKING_MANAGER no lee borradores ni usuarios al pedir sus URLs directamente.
- [x] Publicar/retirar como EDITOR devuelve 403 sin cambio en publicación o almacenamiento.
- [ ] Ninguna respuesta, prop de cliente o log incluye hash o contraseña.
- [ ] Sesión compartida por entorno y comprobaciones antiguas retiradas; solo permanece
  la clave de firma como secreto de sesión.
