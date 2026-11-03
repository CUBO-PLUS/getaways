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
- [ ] Revocación, último ADMIN, throttle compartido y gestión de contraseñas verificados.
- [ ] Blog público, referidos y medios existentes conservados; sin importar artículos.
- [ ] Ejecutar los controles aplicables de [verificación común](../comunes/verificacion-y-aceptacion.md) y registrar evidencia.
- [ ] Ensayar y ejecutar el **hito A** de [transición y recuperación](../comunes/transicion-y-recuperacion.md), incluida recuperación CLI.

Completar este plan desbloquea el plan 2. BOOKING_MANAGER puede tener un inicio
explicativo hasta que exista su sección, sin recibir permisos de otras áreas.

## Registro local — 2026-11-02

- Implementados cuentas individuales, sesiones revocables, gestión de usuarios y
  autorización editorial. La aceptación permanece pendiente del recorrido integrado.
- La migración aditiva `20261102T2256_add_admin_users` se ensayó primero sobre un
  clon sin red del respaldo y después se aplicó a la base local. `db:check` pasó,
  `db migrate --show` no mostró pendientes y el marcador quedó en
  `1d24b7dffc9a8683f50290225c3f53f644a21598a8804dec3c879f7d65e94772`.
- En el clon se conservaron las huellas de las nueve tablas anteriores y siete claves
  foráneas; las tablas de referidos estaban vacías. En otro PostgreSQL aislado se
  ensayó la misma migración con tres códigos y tres atribuciones sintéticas: todas
  sus columnas y relaciones por código permanecieron idénticas. Los `bookingId` se
  conservaron, sin verificar la existencia externa de esas reservas. En la base local
  siguen nueve borradores, nueve publicaciones y 65 medios. No se importaron artículos.
- Se repitió la migración en otro clon aislado con blog y referidos no vacíos en la
  misma base: hashes por tabla y cinco conjuntos de relaciones coincidieron antes y
  después. Los identificadores de reservas externos no se verificaron contra reservas.
- En PostgreSQL aislado se ensayaron bootstrap, rechazo de segundo bootstrap,
  login, revocación, permisos de EDITOR, carrera del último ADMIN y límite de
  intentos (5/5 comprobaciones). También se ensayó la recuperación CLI sobre una
  cuenta sintética inactiva: se reactivó como ADMIN, se invalidó el token anterior y
  solo la nueva contraseña permitió iniciar sesión.
- `pnpm exec vitest run --maxWorkers=2`: 460 aprobadas, seis omitidas. TypeScript,
  build y ESLint focalizado pasaron. El lint global detectó cuatro errores en un
  helper histórico de respaldo; el primer intento de la suite sin limitar workers
  agotó el tiempo de una prueba, que aislada y con dos workers pasó.
- Verificación posterior: `pnpm run lint` pasó tras excluir `backups/`, que contiene
  artefactos privados generados y ningún código de aplicación versionado. No se
  modificaron los respaldos; las reglas siguen aplicándose al código fuente.
- Las seis pruebas omitidas de la suite ordinaria requieren `PRISMA_TEST_DATABASE=1`:
  una de conexión Prisma y cinco de referidos. El indicador por sí solo no aísla la
  conexión; las seis pasaron posteriormente en una base nueva y dedicada.
- El build volvió a pasar después de los últimos cambios de aplicación. Las
  comprobaciones focalizadas de autenticación, usuarios, blog y configuración
  ejecutaron 21 pruebas aprobadas.
- La suite completa posterior `pnpm exec vitest run --maxWorkers=2` pasó con 465
  pruebas aprobadas y seis omitidas; esas seis se ejecutaron por separado en la base
  aislada indicada arriba.
- En otra base sintética aislada se rechazaron correos normalizados duplicados y
  contraseñas actuales incorrectas; se verificó la revocación al desactivar, cambiar
  rol, restablecer contraseña y cerrar sesión. El throttle conservó intentos entre
  dos procesos; en otra prueba, dos procesos sincronizados lanzaron 20 solicitudes
  al mismo presupuesto: cinco se admitieron y quince se limitaron. Los ensayos de
  concurrencia del throttle y del último ADMIN se ejecutaron en entornos aislados.
- 2026-11-03: se versionó y ejecutó `PRISMA_TEST_DATABASE=1 pnpm exec vitest run
  infrastructure/prisma/_test_/plan1-postgres.test.ts --maxWorkers=1` desde `src`:
  3 pruebas aprobadas. En un PostgreSQL efímero propio se comprobó preservación de
  filas/relaciones sintéticas de blog y referidos al aplicar y repetir la migración,
  el siguiente ID de las secuencias y concurrencia real entre procesos para último
  ADMIN y throttle. El test no hereda `DATABASE_URL`, no usa `.env` ni RustFS, enlaza
  el puerto solo a loopback y elimina únicamente su contenedor y directorio temporales.
- La prueba focalizada `pnpm exec vitest run modules/auth/_test_/auth.test.ts`
  pasó con tres casos, incluidos tokens expirados y firmados sin claims obligatorios.
- Verificación focalizada posterior: `pnpm exec vitest run --maxWorkers=2
  modules/auth/_test_ modules/users/_test_ modules/users/server/_test_
  infrastructure/prisma/_test_/client-cache.test.ts
  infrastructure/prisma/_test_/database-url.test.ts`: 12 pruebas aprobadas.
- Respaldo previo al corte: `src/backups/progreso-20261102T230800957Z-zBQ2WL.tar.gz`,
  dump completo y 65 objetos, hashes verificados. Se restauró su PostgreSQL en el
  ensayo combinado de blog y referidos; también se restauraron sus 65 objetos en
  RustFS aislado, sin puertos publicados, con claves, tamaños, SHA-256 y metadatos
  coincidentes. Posteriormente una aplicación aislada se conectó a ambos destinos
  recuperados del mismo checkpoint: mostró nueve publicaciones, verificó los hashes
  de 64 medios públicos y no expuso el medio privado sin sesión. Tras la migración en
  la copia, `db:check` y la verificación conjunta siguieron pasando. No se tocaron los
  servicios activos ni se verificó login en este ensayo de recuperación.
- Se aprovisionó el primer ADMIN en la base local; el 2026-11-02 se verificó que
  existe un ADMIN activo. El listado protegido respondió correctamente tras corregir
  la caché del cliente Prisma.
- El ensayo en Chrome con cuentas sintéticas verificó: ADMIN recibe 200 en páginas y
  API de blog y usuarios; EDITOR recibe 200 en blog y 403 en la API de usuarios;
  BOOKING_MANAGER recibe 403 en ambas API y no accede a las páginas protegidas.
  Los login se realizaron mediante API desde Chrome, no mediante el formulario hidratado.
  El ensayo detectó que el login previo a hidratación podía enviar contraseñas por URL;
  se corrigieron los formularios sensibles para usar POST también sin JavaScript.
  El reensayo del envío nativo confirmó POST sin contraseña en la URL (400 al no
  enviar JSON). Con un borrador sintético, EDITOR recibió 403 al publicar y retirar,
  mientras ADMIN publicó y retiró con 200. El recorrido hidratado posterior usó
  cuentas sintéticas: los tres roles iniciaron sesión; ADMIN publicó y retiró desde la
  interfaz; EDITOR editó y guardó sin controles de publicación; BOOKING_MANAGER fue
  redirigido al panel al intentar acceder al editor. Se utilizó una app aislada de
  producción con fuentes sustituidas solo en la copia y HTTPS local autofirmado.
- En ese entorno, ADMIN creó un EDITOR desde la interfaz y desactivó su cuenta con
  otra sesión abierta; al recargar, se solicitó de nuevo el login. EDITOR creó un
  borrador y verificó el autoguardado y la vista previa. Otro EDITOR subió un PNG
  sintético a un bucket nuevo aislado (201), lo insertó con alt y lo vio en la vista
  previa tras guardar (200). No se modificaron el bucket ni los datos activos.
- En HTTPS aislado la cookie tenía `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`
  y ocho horas de vigencia. Una mutación rechazó origen ausente y ajeno con 403; con
  origen correcto respondió 400 al cuerpo inválido, sin cambios. Ocho respuestas
  JSON/HTML/RSC inspeccionadas no contenían contraseñas ni hashes sintéticos; esta
  muestra no cubre todas las respuestas posibles.
- Dos procesos de aplicación aislados compartiendo PostgreSQL aceptaron la misma
  sesión sintética (200/200); tras cerrar sesión en uno, ambos rechazaron el token
  anterior inmediatamente (401/401). Se repitió con cambio de contraseña propia:
  ambos procesos rechazaron el token anterior. El ensayo entre procesos no cubrió
  cambio de rol ni desactivación; esas mutaciones se verificaron por separado.
- En un bucket sintético aislado, la lectura de una imagen privada devolvió 200 a
  ADMIN y EDITOR, 403 a BOOKING_MANAGER y 401 sin sesión. Se ajustaron respuestas de
  medios inexistentes o con almacenamiento inaccesible a `private, no-store`; el
  fallo operativo devuelve 503 y cuenta con una prueba de regresión focalizada.
- El cierre operativo completo sigue pendiente: el corte local no documentó
  mantenimiento ni rotación coordinada de la clave de firma. La audiencia y los
  claims antiguos se rechazan, pero esto no acredita una rotación. Tampoco se han
  automatizado en el repositorio los ensayos aislados de migración y concurrencia.
