# [ ] Plan inmediato — Completar la migración del blog

[Propuesta original](propuesta-original.md) · [Inventario previo](inventario-previo.md) · [Revisión editorial](revision-editorial.md)

## Objetivo y alcance

Completar y aceptar la migración de los nueve artículos existentes y sus medios a
PostgreSQL y RustFS, preservando contenido, accesibilidad, categorías y URL. Este
plan se ejecuta antes de la ampliación del panel; no implementa usuarios, catálogo
ni reservas. No depende de adoptar el nuevo sistema de roles para su revisión e
importación; conservar la autorización existente hasta que se sustituya.

El [plan original](propuesta-original.md) contiene los requisitos de
arquitectura, seguridad, editor y publicación que siguen vigentes. Este seguimiento
no declara implementada ninguna fase anterior sin evidencia de aceptación.

## Estado comprobado y límites

- El 2026-11-01 se verificó el esquema PostgreSQL contra el contrato del blog:
  marcador `6f61bccf5fb3a4ddac61b783b36527564f3cbd4a8bf439056252a731b20389c7`;
  `db:check` pasó y `db migrate --show` no mostró migraciones pendientes.
- En esa base había cero `BlogPost` y cero `BlogPublication`. El lector público ya
  consulta PostgreSQL sin fallback: una base vacía no muestra los artículos fuente.
- Los lectores esperan una solicitud mediante `connection()` antes de consultar
  Prisma, evitando lecturas durante `next build`. Las páginas y la configuración
  compartida del sitio conservan su lector; los JSON del blog son fuente de
  importación y respaldo, no una fuente pública alternativa.
- La última [revisión documentada](revision-editorial.md) registra nueve
  conversiones bloqueadas: 483 diagnósticos de pérdida y ocho advertencias visuales;
  incluye 56 decisiones de texto alternativo pendientes. Son resultados históricos:
  volver a reproducirlos y no confundir preservación de texto con aprobación editorial.
- `src/backups/blog-20261101.dump` es un respaldo local ignorado por Git del estado
  previo; su listado se verificó, pero no se ensayó su restauración. No contiene los
  artículos ni los objetos de RustFS. Comprobar su existencia y vigencia antes de usarlo.
- Importar artículos y medios requiere aprobación explícita después de la revisión,
  ensayo aislado y respaldo; organizar este plan no autoriza la importación ni el
  despliegue. No modificar los JSON fuente ni ocultar pérdidas con un fallback.

## Fases y seguimiento

- [ ] **B.1 — [Línea base y preparación](01-linea-base-y-preparacion.md).** Confirmar servicios, origen y destino, contrato, implementación existente y recuperación.
- [ ] **B.2 — [Conversión y revisión editorial](02-conversion-y-revision.md).** Resolver o aceptar con evidencia cada diagnóstico y aprobar contenido y medios. Requiere B.1.
- [ ] **B.3 — [Ensayo e importación](03-importacion-y-entrega.md).** Ensayar en destinos aislados, obtener autorización, respaldar, importar y verificar la entrega. Requiere B.2.

## Aceptación y entrega

- [ ] Los nueve artículos aprobados y sus medios están disponibles, con URL,
  fechas, categorías, textos, enlaces, pies y accesibilidad verificados.
- [ ] La importación es repetible sin duplicados ni sobrescritura de cambios;
  las referencias y objetos coinciden y las fuentes originales permanecen intactas.
- [ ] Panel, publicaciones, borradores y medios privados conservan sus protecciones;
  los lectores públicos no exponen borradores ni utilizan fallback improvisado.
- [ ] Pruebas, recorrido real, respaldo y restauración ensayada registrados con
  versión, entorno, marcador, responsable, resultados y pendientes.
- [ ] Entrega aprobada y fases aceptadas antes de marcar completo el plan.

Los planes de ampliación siguen manteniendo su propio alcance y sus controles: su
exclusión de importar artículos no impide que este plan independiente lo haga tras
su propia aprobación. Ningún cambio de estado en este documento modifica esos planes.
