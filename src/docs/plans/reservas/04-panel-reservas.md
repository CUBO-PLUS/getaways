# [ ] Fase 3.4 — Panel de reservas

Dependencia: [fase 3.3 aceptada (B2)](03-entradas-corte-y-verificacion.md),
incluida la identidad del plan 1. No depende del plan 4; el recorrido conjunto se
comprueba cuando ambos paneles estén habilitados.
Acceso: ADMIN y BOOKING_MANAGER. EDITOR no recibe datos de huéspedes.

[Plan 3 y checklist](README.md). Entrega C1.

## Operaciones mínimas propuestas

- [ ] Listar con paginación y filtros de hospedaje, estado y fechas.
- [ ] Ver detalle: estancia, contacto del huésped, notas, desglose acordado, estado y
   resumen del hospedaje, incluso si está archivado.
- [ ] Corregir nombre, correo y teléfono con validación; las notas internas permanecen
   separadas de las notas del huésped y nunca salen por rutas públicas.
- [ ] Añadir/editar notas operativas.
- [ ] Cancelar con motivo y confirmación, registrando actor y fecha; operación idempotente.
- [ ] Ver claramente si un pago/cancelación requiere revisión o devolución manual.

«Gestionar» no concede acceso a cambiar cualquier columna. No hay selección libre
de estado, borrado de reservas, modificación de importes acordados, eliminación de
referencias de pago ni botón «marcar pagado». ADMIN usa las mismas reglas financieras.

Reprogramar fechas, cambiar hospedaje/capacidad, crear reservas manuales, descuentos
manuales, confirmar sin pago y reembolsar necesitan reglas adicionales. Quedan
decisiones pendientes, no permisos implícitos ni requisitos obligatorios iniciales.
Confirmar este límite funcional antes de implementar la fase.

## Rutas y archivos propuestos

| Ruta | Operación |
| --- | --- |
| `app/admin/bookings/page.tsx` | Listado autorizado |
| `app/admin/bookings/[id]/page.tsx` | Detalle autorizado |
| `app/api/admin/bookings/route.ts` | GET paginado, filtros validados |
| `app/api/admin/bookings/[id]/route.ts` | GET limitado al trabajo operativo |
| `app/api/admin/bookings/[id]/contact/route.ts` | PATCH de campos de contacto |
| `app/api/admin/bookings/[id]/notes/route.ts` | PATCH de nota interna |
| `app/api/admin/bookings/[id]/cancel/route.ts` | POST con versión, motivo y confirmación |

Operaciones concretas en `modules/bookings/server/booking-admin.ts`; componentes
en `modules/bookings/client/`. Reutilizar `Booking` persistido y cálculos existentes.
No duplicar tabla o store para el panel ni usar `listBookings()` sin paginación para
enviar todos los datos personales al navegador.

La selección de hospedaje usa un resumen propio de esta área: ID, título, estado y
datos necesarios de estancia. No conceder permiso del editor de hospedajes para
rellenar un filtro. No incluir secretos de checkout en el resumen o listado.

## Autorización y protección de datos

- Server Components y cada endpoint verifican identidad activa y rol.
- Todas las mutaciones comprueban origen y límites de entrada; versión obsoleta es 409.
- Cambios de contacto/notas no aceptan precio, rol, estado, fechas o referencia de pago.
- Consultas parametrizadas, longitudes acotadas, filtros/orden permitidos y página máxima.
- `private, no-store` en páginas/datos privados y errores. No indexar el panel.
- No incluir email, teléfono, session ID o notas en URLs, analytics o logs de error.
- El ID de reserva identifica un recurso: no es una autorización de huésped.
- Las lecturas públicas de disponibilidad/status nunca amplían su DTO a los datos
  del panel. Revisar también props RSC y metadatos, no solo JSON.
- Desactivar o cambiar rol de BOOKING_MANAGER revoca acceso en todas las sesiones.

## Cancelación y pagos

En una transacción, revalidar actor/versión y aplicar transición permitida. Conservar
importe, desglose, session ID, referencia y atribución de referido. No recalcular
comisiones o borrar atribución silenciosamente; cualquier efecto sobre referidos
necesita regla de negocio confirmada.

Cancelar libera disponibilidad de una confirmada según política aprobada, pero
**no equivale a un reembolso**. Mostrar advertencia antes de confirmar. Si hay pago
abierto, no borrarlo: un pago posterior mantiene la reserva cancelada y genera una
señal operativa de revisión. Nunca reconfirmar por repetir la notificación de pago.

Verificar con concurrencia que cancelación y `markPaid()` respetan la fase 3.2 y no
resucitan una reserva cancelada. Las operaciones de red externas quedan fuera de
la transacción y no se simulan con un simple cambio de estado en BD.

## Experiencia y verificación futura

Estados y fechas en texto, no solo color. Formularios etiquetados; confirmación de
cancelación con nombre del hospedaje/fechas, advertencia financiera y foco correcto.
Ante conflicto conservar notas locales y mostrar recarga explícita.

```bash
NODE_ENV=development PRISMA_TEST_DATABASE=1 pnpm exec vitest run modules/bookings/_test_/booking-db.test.ts
pnpm exec vitest run modules/bookings/_test_ modules/referrals/_test_
pnpm exec tsc --noEmit --incremental false
pnpm run lint
```

Navegador: BOOKING_MANAGER encuentra reserva, corrige contacto, guarda nota y
cancela con advertencia; EDITOR accede directamente y es rechazado. Comprobar
status público y disponibilidad sin exposición de contacto/notas.

## Cierre

- [ ] ADMIN y BOOKING_MANAGER gestionan las operaciones acordadas sobre la misma BD.
- [ ] No hay datos personales accesibles a EDITOR/anónimo ni cambios financieros arbitrarios.
- [ ] Cancelación preserva historial, importes y referencias; no promete devolución automática.
- [ ] Revocación y conflictos funcionan con dos sesiones/instancias, no solo en una pestaña.
- [ ] Verificación común aplicable y corte C1 registrados según las [guías transversales](../README.md).

## Implementación y evidencia técnica — 2026-11-05

Implementada y revisada con subagentes **GPT-6 Luna** en el worktree aislado
`btcpay-testnet-reservas`. Revisión de especificación y calidad aprobada tras
corregir el listado sin fechas, límites de filtros, revisión financiera y
preservación de borradores. No hay dependencias ni migraciones nuevas para C1.
**No se ha habilitado el panel sobre la aplicación operativa ni aceptado el corte C1.**

```bash
NODE_ENV=development PRISMA_TEST_DATABASE=1 npx vitest run modules/bookings/_test_/booking-db.test.ts
# 27 passed: conserva B2/H/P y añade el recorrido C1 sobre PostgreSQL desechable.
npx tsc --noEmit --incremental false
# exit 0, incluyendo tests.
```

La prueba C1 verifica roles, revocación de sesión, origen hostil sin escritura,
filtros, versiones, contacto/notas, cancelación auditada e idempotente, preservación
financiera y ausencia de notas internas en el historial del huésped.

Recorrido independiente en Chrome con cookies separadas para manager/admin/editor/huésped:

- Listado sin filtros 200, contacto y nota guardados consecutivamente; el segundo
  formulario conserva su borrador y usa la versión actualizada.
- Otro administrador modifica la reserva: el manager recibe 409, conserva su nota
  local y decide explícitamente recargar la versión actual.
- Confirmación nativa de cancelación con hospedaje, fechas y advertencia sin
  reembolso. Rechazar no muta; aceptar registra actor, fecha y motivo, mantiene
  precio y referencia y señala revisión manual.
- La disponibilidad pública libera las dos noches; status del propietario informa
  cancelada sin ampliar el DTO. EDITOR recibe 403 en API y 404 en detalle; sin
  identidad de personal se redirige a login. No se filtran contacto ni notas internas.

La reserva sintética conservó **25600 centavos y `btc_mock_1`** tras cancelar.
Fue confirmada **solo por el mock estudiantil**: no demuestra un pago BTCPay,
reembolso ni cobro del precio real. La aceptación/corte y los pendientes del
[recorrido T/P](../pagos/README.md) permanecen separados de esta evidencia.
