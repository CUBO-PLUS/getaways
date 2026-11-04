# Guía común — Transición, despliegue y recuperación

Dependencia: [verificación y aceptación](verificacion-y-aceptacion.md) de las
funcionalidades que se habiliten. [Orden general y checklists](../README.md).
No es una fase final ni autoriza ejecutar procedimientos al escribir el plan.

Separar entregas: **A** identidad; **B1** catálogo; **B2** reservas persistidas;
**C1** panel de reservas; **C2** administración de hospedajes. C1 y C2 requieren
B2, pero no dependen entre sí. Los cortes B1 y B2 se ensayan y aceptan por separado.

## Preparación y seguridad operativa

- [ ] Confirmar volumen, instancia, base y bucket reales; no reemplazar servicios ni
  borrar volúmenes para hacer coincidir el entorno con el ejemplo de Compose.
- [ ] Conservar configuración y cambios locales del worktree del blog. El merge solo
  incluyó commits: su endurecimiento pendiente de `compose.dev.yaml` debe revisarse
  aparte antes de reutilizar el inicializador de RustFS de `main`.
- [ ] Revisar `compose.prod.yaml`: no describe todavía auth, RustFS y límites completos. Revisar
  TLS, redes privadas, persistencia, variables y healthchecks antes de declarar producción lista.
- [ ] Confirmar `BLOG_SESSION_SECRET` y origen exacto disponibles en todas las instancias;
  nunca `NEXT_PUBLIC_`. Retirar `BLOG_ADMIN_PASSWORD_HASH` después del corte.
- [ ] Evitar imprimir secretos mediante `docker compose config`, env dumps o logs de CI.
- [ ] Configurar credenciales de app con acceso necesario, no identidad raíz de S3; separar
  credenciales de migración de las de ejecución cuando se configure el despliegue.
- [x] Revisar documentación obsoleta del blog: `.env.example` refleja que el lector
  público consulta PostgreSQL sin fallback estático.

## Respaldo y ensayo de recuperación

- [ ] Respaldar PostgreSQL custom completo, incluyendo marcador y tablas de Prisma, con permisos
   0600 y almacenamiento protegido. Incluye hashes y datos personales: tratarlo como secreto.
- [ ] Respaldar objetos RustFS y sus metadatos/correspondencias; registrar si está vacío.
- [ ] Respaldar archivos privados `.data/bookings.json` de todas las instancias antes del corte;
   JSON fuente, medios locales, código y configuración necesaria sin publicarla.
- [ ] Registrar hashes de contrato/migraciones, versión de aplicación, recuentos y
   snapshot de filas anteriores para comprobar preservación.
- [ ] Restaurar en una base/bucket aislados y verificar datos, medios y credenciales
   operativas. `pg_restore --list` por sí solo no demuestra recuperación.

Ejemplo futuro con conexión suministrada mediante configuración segura `PG*`/
archivo protegido, sin contraseña en argumentos. `RESTORE_DATABASE` es un nombre
de base **aislada**, no URL de producción:

```bash
pg_dump --format=custom --file="$BACKUP_FILE"
pg_restore --list "$BACKUP_FILE"
pg_restore --exit-on-error --dbname="$RESTORE_DATABASE" "$BACKUP_FILE"
```

Confirmar RPO/RTO, retención, responsable y ubicación fuera del volumen original.
Un volumen persistente o un backup anterior a otras escrituras no bastan.

## Hito A — Sustituir administrador compartido

- [ ] Ensayar fases 1.1–1.3 y recuperación CLI en clon; aprobar las pruebas aplicables.
- [ ] Preparar imagen nueva, variables y operador con acceso de recuperación.
- [ ] Poner panel y API administrativa en mantenimiento para evitar mezcla de versiones.
- [x] Obtener respaldo fresco; `db migrate --show` debe presentar exclusivamente la ruta revisada. Verificado para el corte local.
- [x] Aplicar migración de usuarios y verificar esquema/marcador, sin recrear blog/referidos. Verificado en la base local y clones aislados.
- [x] Aprovisionar primer ADMIN individual con entrada oculta y credencial nueva;
   comprobar que repetir bootstrap falla. Recomendar segundo ADMIN individual.
- [ ] Activar la nueva aplicación en todas las instancias y retirar las antiguas.
- [ ] Rotar firma coordinadamente y rechazar audiencia/claims antiguos; eliminar hash
   compartido de configuración. No mantener «contraseña antigua O cuenta nueva».
- [ ] Comprobar login, cambio de contraseña y flujo editorial antes de abrir el panel.
- [ ] Probar recuperación operativa sin dejar un endpoint o secreto de bootstrap permanente.

Conservar las URL públicas del blog. No importar artículos como smoke test.

## Hito B1 — Catálogo y medios en PostgreSQL

**Entrega local abreviada — 2026-11-04:** prevalece la excepción del
[índice](../README.md): respaldo fresco, app detenida, importación y comparación
directa de datos/bytes. No ejecutar tests ni repetir ensayos de restauración en
esta sesión. Los pasos de pruebas/recuperación de esta guía siguen pendientes para
un despliegue real; no impiden cerrar la implementación y migración local solicitadas.

**B1 local completado:** `--apply` y `--verify` confirmaron 11 hospedajes, 114 medios,
6 términos y 18 asociaciones. Filas y 65 objetos anteriores intactos; lectores y
checkout adaptados sin JSON fallback. [Resultado y límites](../catalogo-y-medios/04-evidencia-local.md).

Requiere A y fases 2.1–2.3 listas y ensayadas. No requiere migrar reservas ni
habilita administración comercial. La autorización de medios usa identidad de A.

- [ ] Aprobar modelo, correspondencias de medios y equivalencia del catálogo, incluidas cotizaciones actuales.
- [ ] Ensayar migración, importación repetida y restauración en base/bucket aislados con datos anteriores.
- [ ] Preparar versión con todos los lectores de catálogo adaptados, incluido checkout; sin formularios ni endpoints comerciales habilitados.
- [ ] Coordinar mantenimiento de las operaciones afectadas durante el cambio de lectores. Evitar mezcla de instancias/versiones y pausar escrituras de checkout/pagos si afectan la consistencia del corte.
- [ ] Obtener respaldo fresco de BD, objetos, catálogo original y archivos privados de reservas; verificar ruta de migraciones aprobada.
- [ ] Aplicar solo la migración de catálogo e importar datos aprobados con IDs, slugs, tarifas y medios preservados. Detenerse ante conflictos.
- [ ] Cambiar todas las lecturas de catálogo juntas a PostgreSQL; retirar versiones anteriores y no usar JSON como fallback.
- [ ] Verificar catálogo, medios públicos/privados, metadatos, sitemap, disponibilidad y checkout; reabrir operaciones afectadas solo con equivalencia confirmada.
- [ ] Registrar que las reservas continúan en el store anterior hasta B2: sin prometer concurrencia/pagos multiinstancia ni habilitar precios, estados comerciales o borrado desde panel.

## Hito B2 — Reservas compartidas y consistencia

Requiere B1 y fases 3.1–3.3 listas y ensayadas. No requiere el panel de reservas
3.4 ni el plan 4; su aceptación desbloquea ambos.

- [ ] Aprobar modelo, snapshots, reglas financieras, cancelaciones/pagos tardíos y tratamiento de términos históricos faltantes.
- [ ] Ensayar migración, importación privada repetida, carreras y restauración sobre una copia aislada.
- [ ] Bloquear todas las escrituras de reservas/checkout/pagos mientras se captura el estado final. Pausar reconciliadores y coordinar eventos pendientes para reanudarlos sin perder ni duplicar confirmaciones.
- [ ] Consolidar fuentes de reservas de todas las instancias: detenerse ante conflictos.
- [ ] Obtener respaldo final de BD, archivos y objetos; verificar ruta de migraciones desde el destino aprobado B1.
- [ ] Aplicar migración de reservas e importar solo datos aprobados, conservando IDs, sesiones, referencias, importes y atribuciones. Verificar valores y relaciones, no solo cantidades.
- [ ] Cambiar todos los lectores/escritores de reservas a PostgreSQL; retirar instancias con stores en memoria/archivo. Nunca dual-write improvisado o fallback automático.
- [ ] Verificar navegador, dos procesos, disponibilidad, checkout, referidos e historial; abrir escrituras solo cuando la fuente única y la consistencia estén confirmadas.
- [ ] Registrar aceptación B2 y limitaciones del mock de desarrollo. No habilitar pagos reales por este corte ni afirmar soporte multiinstancia del proveedor.

## Hito C1 — Panel operativo de reservas

Requiere B2 y fase 3.4 aceptada; no espera a C2.

- [ ] Confirmar alcance de operaciones, política de cancelación y efecto sobre referidos; preservar importes y referencias sin prometer reembolso.
- [ ] Preparar respaldo/versión recuperable y verificar que cualquier migración adicional parte del último destino aprobado.
- [ ] Verificar ADMIN/BOOKING_MANAGER, acceso directo denegado a EDITOR/anónimo, paginación, privacidad y revocación.
- [ ] Habilitar solo endpoints/pantallas completos; verificar contacto, notas y cancelación con conflicto/pago tardío, conservando checkout público.
- [ ] Registrar evidencia C1 y mantener fuera de alcance selección libre de estado, modificación de importes y «marcar pagado».

## Hito C2 — Administración de hospedajes

Requiere B2 y fases 4.1–4.3 aceptadas; no espera a C1.

- [ ] Confirmar frontera editorial/comercial, política de pendientes al retirar hospedajes y referencias externas que impiden borrado.
- [ ] Preparar respaldo/versión recuperable y coordinar cualquier migración adicional desde el último destino aprobado, sin ramas incompatibles con C1.
- [ ] Verificar permisos por campo, snapshots estables, conflictos de versión, medios compartidos y FK Restrict.
- [ ] Habilitar gestión editorial, comercial y eliminación protegida solo tras aceptación; comprobar invalidación pública, nuevas reservas e historial.
- [ ] Registrar evidencia C2; si C1 ya está habilitado, ejecutar además el recorrido conjunto de ambos paneles.

La importación del catálogo puede copiar imágenes compartidas, pero no importa ni
publica artículos del blog. La revisión editorial y la importación local ya constan
en el seguimiento del blog; no se presupone el estado de otros destinos ni se autoriza
una nueva importación. Coordinar la correspondencia de medios si se aprueba alguna.

Comandos de despliegue futuros, con entorno correcto y paquete revisado:

```bash
pnpm exec prisma db migrate --show
pnpm run db:migrate
pnpm run db:check
```

En desarrollo se puede avanzar `db` según fase 1.1; despliegue no modifica referencias
del repositorio. No usar `db:update` o `db sign` para ocultar drift.

## Reversión y fallos

- Prisma 8 documenta la aplicación PostgreSQL de una ejecución de `db migrate`
  en una transacción. Ante fallo, comprobar marcador/esquema antes de reintentar;
  no reescribir migraciones aplicadas o forzar marcadores.
- Si falla la app con esquema aditivo ya aplicado, corregir hacia delante o usar
  una versión conocida compatible con identidad nueva; pueden conservarse tablas nuevas.
- Después del hito A no volver a código que acepte el administrador compartido.
  Si no hay versión segura, mantener el panel cerrado y usar recuperación CLI.
- Después de B1 no volver a lectores de catálogo con fallback a JSON ni mezclar fuentes.
- Después de B2 no volver a escrituras de reservas sobre archivos: divergirían de la BD.
  Mantener escrituras pausadas hasta reparar/recuperar la fuente única. C1/C2 tampoco
  permiten retroceder a código incompatible con la identidad y persistencia aceptadas.
- Si una importación parcial subió objetos pero no confirmó filas, conservar informe
  de compensación y reconciliar por claves/huellas; no borrar carpetas o buckets completos.
- Restauración completa solo con autorización y cálculo de escrituras que se perderán.
  BD y objetos deben corresponder al mismo punto lógico; conservar evidencia de pagos
  externos y reconciliarlos antes de volver a aceptar reservas.
- Tras restaurar usuarios, rotar clave e invalidar sesiones para no reactivar tokens
  antiguos; revisar contraseñas/restablecimientos posteriores al respaldo.

## Pendientes que bloquean un despliegue real

- [ ] Origen HTTPS/proxy confiable y límites compartidos verificados.
- [ ] Operadores, entrega de credenciales y recuperación probados; último ADMIN protegido.
- [ ] Catálogo reconciliado para B1 y reservas reconciliadas para B2, sin fuentes locales desconocidas.
- [ ] Política de cancelación/pagos abiertos y efecto sobre referidos confirmada para las operaciones habilitadas.
- [ ] Mantener pagos reales bloqueados: el mock en Map no ofrece recuperación/multiinstancia.
- [ ] Restauración completa ensayada y tiempos/pérdida aceptables documentados por entrega.
- [ ] Confirmada ausencia de aprobación implícita para importar los nueve artículos y sus imágenes.

## Cierre

- [ ] Registrar comandos/resultados, versión, marcador y validación de roles por hito.
- [ ] Sin credenciales compartidas residuales, pérdida de historial, publicación accidental de borradores, datos personales filtrados o afirmaciones de pago/reembolso no realizado.
