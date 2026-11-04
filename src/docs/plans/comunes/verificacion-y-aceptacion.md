# Guía común — Pruebas mínimas y aceptación

Aplicación: acompaña cada implementación; aceptación final por entrega habilitada.
Esta entrega no crea ni ejecuta pruebas de aplicación. No medir éxito por número de tests.

Para el **plan 2 local del 2026-11-04**, por petición expresa se omiten también
lint, typecheck, build, fixtures y navegador. Validación mínima: inventario,
importación transaccional y comparación fuente/destino, objetos por SHA-256,
secuencias y hashes de filas previas. No marcar como ejecutadas las pruebas y
restauraciones diferidas que aparecen más abajo; registrar el resultado en
[evidencia del catálogo](../catalogo-y-medios/04-evidencia-local.md).

[Orden general y checklists](../README.md). No es una fase final independiente.
Registrar comprobaciones en la fase correspondiente y en el checklist aplicable
de esta guía; no marcar controles de funcionalidades aún no implementadas.

## Aplicación por plan e hito

- [ ] **Plan 1 / A:** identidad, revocación, credenciales, último ADMIN, throttle y autorización real del blog.
- [x] **Plan 2 / B1 local:** importación y comparación directa de catálogo, IDs/secuencias y bytes completadas; autorización implementada, sin prueba de roles ni testing por la excepción solicitada. [Evidencia](../catalogo-y-medios/04-evidencia-local.md).
- [ ] **Plan 3 / B2 (3.1–3.3):** importación privada, snapshots, checkout, concurrencia, referidos y fuente única compartida.
- [ ] **Plan 3 / C1 (3.4):** acceso operativo, contacto/notas, cancelación, privacidad y conflictos.
- [ ] **Plan 4 / C2:** frontera editorial/comercial, ciclo de vida, historial, imágenes e invalidación pública.

Cada hito incorpora las regresiones relevantes de los anteriores. El recorrido
conjunto de ambos paneles se completa cuando C1 y C2 estén disponibles; no crear
una dependencia artificial entre sus entregas por ese recorrido.

## Cobertura revisada que se conserva

| Pruebas existentes | Contrato protegido |
| --- | --- |
| `modules/content/_test_/blog-auth.test.ts` | Origen exacto, sesión, ausencia de cookie, multipart inválido y límite concurrente local |
| `blog-write-errors.test.ts` en la misma carpeta | JSON inválido e IDs fuera de rango PostgreSQL |
| `blog-editor-state.test.ts` | Conservación de cambios y reconciliación de publicación |
| `blog-media-references.test.ts` | Referencias de medios válidas |
| Pruebas de importación/snapshot del blog | Contenido, fechas, relaciones y rechazo de reimportación destructiva |
| `modules/listings/_test_/listing-visibility.test.ts` | Visibilidad y conservación de atributos |
| Pruebas de contenido, galerías, presets, categorías, amenities y reseñas | Contratos de representación del catálogo |
| `modules/bookings/_test_/booking-quote.test.ts` | Cálculo exacto de centavos, descuentos, limpieza e impuestos |
| `modules/bookings/server/_test_/availability-search.test.ts` | Filtros de fechas del archivo |
| `modules/referrals/_test_/` | Validación, atribución, persistencia y concurrencia |
| `infrastructure/prisma/_test_/db.test.ts` | SQL real y reutilización del cliente; no prueba migraciones o autorización |
| `_test_/organization.test.ts` | Tests dentro de `_test_/` y límites de imports |

Adaptar pruebas al nuevo contrato sin eliminar regresiones únicas. El test del límite
en memoria se reemplaza por prueba del comportamiento compartido, conservando su
objetivo de limitar intentos simultáneos. No limitarse a probar un contador nuevo.

## Integración mínima propuesta

Reutilizar Vitest y PostgreSQL; sin nuevas dependencias de test. Agrupar escenarios
por comportamiento/área, no crear un archivo por endpoint. Posibles archivos:

- `modules/auth/_test_/session-db.test.ts`: identidad, revocación, límite compartido
  y matriz de accesos del blog.
- `modules/users/_test_/users-db.test.ts`: contraseñas, roles, bootstrap y último ADMIN.
- `modules/listings/_test_/listing-admin-db.test.ts`: límite editorial/comercial,
  imágenes y eliminación protegida.
- `modules/bookings/_test_/booking-db.test.ts`: panel operativo, privacidad,
  snapshots financieros y concurrencia de ocupación/cancelación.

No duplicar pruebas puras de bcrypt, jose, aritmética o serialización que ya prueban
sus bibliotecas. Usar hashing real con coste reducido solo en tests; no simular toda
la BD y llamar «integración» al resultado.

### Casos que deben fallar si se rompe seguridad

- [ ] **Autorización de entradas:** matriz parametrizada por rol, sesión ausente o
   cuenta inactiva sobre lecturas y mutaciones reales. Rechazo antes de cualquier
   cambio de BD/S3. Blog y medios privados no accesibles a BOOKING_MANAGER.
- [ ] **Revocación:** conservar token, desactivar/cambiar rol/cambiar/restablecer
   contraseña/logout y volver a usarlo desde otro cliente. Token sin claims,
   expirado, alterado o del contrato antiguo no autoriza.
- [ ] **Credenciales:** cambio propio exige contraseña actual; restablecer otra cuenta
   exige contraseña del ADMIN. Comprobar longitud de 8 a 32 caracteres y límite de 72 bytes con caracteres
   multibyte; correo normalizado
   duplicado rechazado. No se devuelve hash en respuestas.
- [x] **Último ADMIN y throttle:** dos conexiones concurrentes no pueden dejar cero
   administradores ni exceder el presupuesto compartido de bcrypt por reiniciar procesos.
- [ ] **Mass assignment:** EDITOR envía `price`, tasas, `active`, `guests`, políticas o
   un objeto anidado junto con un campo permitido; se rechaza toda la escritura.
   BOOKING_MANAGER intenta cambiar precio/estado financiero de una reserva: sin efecto.
- [ ] **Historial e imágenes:** ADMIN elimina hospedaje sin referencias; con reservas
   obtiene conflicto y puede archivar sin perderlas. Quitar imagen de una galería
   no borra un objeto usado por otra ficha/publicación. Cambiar alt contextual no
   modifica una publicación de blog.
- [ ] **Dinero y carreras:** una reserva mantiene tarifa, cargos y tasas tras cambiar
   catálogo; un quote con pago abierto no se guarda. Dos confirmaciones solapadas
   no ganan ambas; repetir pago es idempotente y pago tardío no reconfirma cancelada.
- [ ] **Privacidad:** EDITOR/anónimo no reciben datos de huéspedes, notas internas o
   credenciales de checkout. Poseer solo ID numérico no permite consultar reserva.
   Origen ajeno/ausente no modifica usuarios, hospedajes o reservas.

- [ ] Ejecutar y registrar un ensayo de migración con fixtures anteriores que contengan
referidos y blog no vacíos. Comparar snapshot de filas/relaciones preexistentes antes
y después, no solo recuentos. Probar importaciones repetibles sin sobrescritura,
IDs conservados, siguiente ID sin colisión y equivalencia de cotizaciones/galerías.
El ensayo se automatiza como una comprobación de integración acotada al flujo de
migración, sin construir un framework genérico ni importar artículos reales.

## Entorno y comandos futuros

Base y bucket dedicados a pruebas, conexión explícita y protección contra apuntar
a producción. El flag `PRISMA_TEST_DATABASE=1` no cambia por sí solo el destino.
No hacer TRUNCATE global sobre desarrollo, imprimir datos personales o borrar objetos
fuera del prefijo de pruebas. Usar dos conexiones reales en pruebas de carreras.

```bash
pnpm test
pnpm run test:db
NODE_ENV=development PRISMA_TEST_DATABASE=1 pnpm exec vitest run \
  modules/auth/_test_/session-db.test.ts \
  modules/users/_test_/users-db.test.ts \
  modules/listings/_test_/listing-admin-db.test.ts \
  modules/bookings/_test_/booking-db.test.ts
pnpm exec tsc --noEmit --incremental false
pnpm run lint
pnpm run build
pnpm run db:check
```

Configurar variables por canal seguro antes de esos comandos, sin incrustar URLs
con contraseña en historial. `build` emite artefactos de contrato; revisar sus diferencias.

## Recorrido real en navegador

Usar perfiles separados ADMIN, EDITOR, BOOKING_MANAGER y huésped/anónimo:

- [ ] Login, cambio de contraseña y navegación exclusiva del rol; URL directa
   de otra área rechazada aunque se escriba a mano.
- [ ] ADMIN crea usuario, cambia rol/desactiva con otra sesión abierta y esta pierde acceso.
- [ ] EDITOR crea borrador, carga imagen, guarda y previsualiza; publicar directo falla.
   ADMIN publica, editar borrador no cambia lo público y retirar vuelve a ocultarlo.
- [ ] ADMIN crea hospedaje, carga fotos, asigna datos/precio y activa. EDITOR cambia
   descripción/galería; PATCH comercial manipulado falla y conserva los datos.
- [ ] Huésped crea reserva y cotiza; ADMIN cambia tarifas, checkout previo no cambia.
- [ ] BOOKING_MANAGER filtra, abre detalle, cambia contacto/nota y cancela con advertencia;
   no puede cambiar hospedajes/usuarios ni marcar pago manualmente.
- [ ] Hospedaje con reserva no se elimina; archivarlo impide nuevas reservas sin perder recibo.
- [ ] Origen hostil, cookies seguras, ausencia de caché privada y datos sensibles en red/RSC.
- [ ] Teclado, foco de confirmaciones, errores anunciados, contraste y ausencia de pérdida
   de cambios ante 401/403/409. Medios públicos/privados y ambas clases de sesión diferenciadas.

No hace falta instalar un runner de navegador para este primer recorrido. Registrar
pasos, resultado y entorno; si se automatiza después, reutilizar herramientas disponibles.

## Cierre

- [ ] Comandos aplicables y resultados registrados por entrega, con recorrido de roles correspondiente.
- [ ] Ensayo de preservación/restauración aprobado para cada corte de datos.
- [ ] Ninguna prueba previa omitida para ocultar errores; por fase, solo pruebas que cubren su hueco real.
