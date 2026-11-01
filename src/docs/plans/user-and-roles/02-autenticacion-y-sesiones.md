# [ ] Fase 1.2 — Autenticación común y sesiones revocables

Dependencia: [fase 1.1](01-usuarios-y-migraciones.md).
La identidad pasa a ser del panel completo, no del blog.

[Plan 1 y checklist](README.md).

## Diseño mínimo

Crear `modules/auth/server/auth.ts` con lectura de sesión e identidad y comprobación
de permisos fijos. Reutilizar `jose` y `bcryptjs`; no añadir otro framework de auth.
Recibir cookies reales de la solicitud o `await cookies()` en Server Components,
sin construir un `Request("http://localhost")` para adaptar la API.

- JWT firmado HS256, duración absoluta de ocho horas, sin renovación ni refresh token.
- Claims: `sub` = ID de usuario, `sv` = `authVersion`, `iat`, `exp`, `iss`, `aud`.
- Nueva audiencia del panel, distinta de `blog-admin`, para rechazar sesiones antiguas.
- `jwtVerify()` fija algoritmo, emisor, audiencia, claims obligatorios y antigüedad
  máxima. Validar tipos, rango de IDs, versión y coherencia temporal.
- No incluir correo, nombre, hash o rol como autoridad. Un JWT firmado no está cifrado.
- Consultar PostgreSQL en cada acceso protegido: usuario existente, activo,
  versión coincidente y permisos de su rol actual. Sin caché entre solicitudes.
- Si exige cambio de contraseña, solo permitir cambio propio y logout. Restringir
  expiración de la sesión temporal a la caducidad de la credencial.
- Errores de BD/configuración cierran acceso con respuesta operativa apropiada;
  nunca recurrir a la contraseña anterior.

El login compara credenciales y luego revalida que hash, estado y versión no hayan
cambiado concurrentemente. En mutaciones, volver a comprobar usuario y versión
dentro de la transacción de negocio; no confiar en un actor serializado por el cliente.

## Cookies y revocación

Conservar `blog_admin_session` para evitar cambios cosméticos, aunque cubra todo
el panel: `HttpOnly`, `SameSite=Strict`, `Path=/`, sin `Domain`, `Secure` obligatorio
con HTTPS en producción y `Max-Age` alineado con `exp`.

Incrementar `authVersion` al cambiar/restablecer contraseña, cambiar rol,
desactivar/reactivar y cerrar sesión. El logout mínimo revoca **todas** las sesiones
del usuario; mostrar ese alcance. No crear tabla de sesiones salvo necesidad de
cerrar únicamente un dispositivo.

En logout actualizar solo si la versión presentada sigue vigente: una cookie vieja
no puede expulsar sesiones nuevas. Limpiar cookie también si es inválida. Si la BD
falla, limpiar la cookie local e informar que no se confirmó revocación en servidor.
La revocación bloquea nuevas autorizaciones tras commit; no retira datos ya descargados.

## Origen y límites compartidos

- Separar configuración de firma/origen del antiguo `BLOG_ADMIN_PASSWORD_HASH`.
- Mantener inicialmente `BLOG_SESSION_SECRET` y `BLOG_APP_ORIGIN` para todas las
  áreas; son nombres heredados, no dos fuentes de autenticación.
- Clave de firma aleatoria de al menos 32 bytes, común entre instancias y fuera del repo.
- Comparar `Origin` exactamente con origen configurado en POST/PUT/PATCH/DELETE;
  rechazar ausente, `null` o distinto, incluido login/logout y cargas multipart.
- Sin CORS con credenciales para dominios externos. La protección integrada de
  Server Actions no se aplica automáticamente a Route Handlers.
- El throttle de PostgreSQL reserva intentos atómicamente **antes** de bcrypt,
  con ventanas por correo normalizado y por IP confiable. Contar también correos
  desconocidos. Propuesta: cinco intentos por correo/15 minutos y límite IP más amplio.
- `429` + `Retry-After`; credenciales erróneas, cuenta inexistente o inactiva devuelven
  mensaje genérico. Comparación con hash ficticio para desconocidos/inactivos.
- Reutilizar límite en reautenticaciones. Mantener límite local de concurrencia
  solo para recursos, nunca como protección distribuida.
- Caducidad y limpieza acotada de filas vencidas. No almacenar cuerpos o contraseñas.
- Confiar en IP reenviada solo si el proxy la sobrescribe y no se puede eludir.
  Confirmar proxy y límites antes de despliegue; PostgreSQL evita exigir Redis.

## Entradas y archivos

- Nuevos `app/admin/login/page.tsx`, `app/api/admin/login/route.ts`,
  `app/api/admin/logout/route.ts`, componentes cliente en `modules/auth/client/`.
- `modules/auth/server/auth.ts` y, si conviene, `login-throttle.ts`.
- Adaptar `modules/content/server/blog-auth.ts` y todos sus llamadores en fase 1.3.
- El login de `/admin/blog/login` puede redirigir a `/admin/login`. Los endpoints
  antiguos se eliminan al adaptar el cliente, o delegan temporalmente al mismo
  handler de cuentas individuales. Nunca mantienen el acceso compartido.
- Un solo contrato de sesión para usuarios, blog, hospedajes y reservas.

## Verificación futura

Adaptar pruebas existentes de origen/firma, sin perder la validación de cuerpos
limitados del login. Pruebas nuevas indicadas en la [verificación común](../comunes/verificacion-y-aceptacion.md):

```bash
pnpm exec vitest run modules/auth/_test_ modules/content/_test_/blog-auth.test.ts
pnpm exec tsc --noEmit --incremental false
pnpm run lint
```

Las comprobaciones compartidas de límites y revocación se ejecutan también contra
PostgreSQL con dos clientes. No basta una prueba que reinicie contadores de memoria.

## Cierre

- [ ] Un token antiguo, expirado, manipulado, sin `sub`/`sv` o de cuenta desactivada no autoriza.
- [ ] La sesión se revoca en todas las instancias después de los cambios relevantes.
- [ ] Una sesión de BOOKING_MANAGER no implica `isBlogAdmin=true` ni permiso editorial.
- [ ] Cookie y mensajes verificados en navegador; origen hostil rechazado sin mutación.
