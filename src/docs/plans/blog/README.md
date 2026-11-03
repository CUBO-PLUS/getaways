# [x] Plan inmediato — Completar la migración del blog

[Propuesta original](propuesta-original.md) · [Inventario previo](inventario-previo.md) · [Revisión editorial](revision-editorial.md) · [Mejora del editor](mejora-editor.md)

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

**Actualización 2026-11-02: plan marcado como completado por decisión de la persona
solicitante, con pendientes técnicos abiertos.** Se actualizaron los alt de los
nueve artículos existentes en la BD local por encargo explícito. No se reimportó
ni se escribieron objetos en RustFS. El cierre del plan no implica que se hayan
ejecutado ni aceptado individualmente las verificaciones pendientes de B.1, B.3 y
la mejora del editor que se detallan a continuación.

- El 2026-11-01 se verificó el esquema PostgreSQL contra el contrato del blog:
  marcador `6f61bccf5fb3a4ddac61b783b36527564f3cbd4a8bf439056252a731b20389c7`;
  `db:check` pasó y `db migrate --show` no mostró migraciones pendientes.
- En esa comprobación histórica había cero `BlogPost` y cero `BlogPublication`; no
  describe el estado posterior a la migración local. El lector público ya
  consulta PostgreSQL sin fallback: una base vacía no muestra los artículos fuente.
- Los lectores esperan una solicitud mediante `connection()` antes de consultar
  Prisma, evitando lecturas durante `next build`. Las páginas y la configuración
  compartida del sitio conservan su lector; los JSON del blog son fuente de
  importación y respaldo, no una fuente pública alternativa.
- La [revisión editorial](revision-editorial.md) está cerrada: la persona solicitante
  acepta contenido y presentación actuales. Se completaron nueve alt de portada y
  56 de imágenes del cuerpo, revisados visualmente y aplicados a borradores y
  publicaciones. La conversión de los originales intactos conserva 483 diagnósticos
  y ocho warnings: 56 casos de alt se resolvieron en BD; las demás diferencias se
  aceptan para la presentación actual. No se presenta esa conversión como limpia.
- La [mejora del editor](mejora-editor.md) registra una importación local de nueve
  artículos y 64 medios. Se comprobaron los artefactos privados en
  `src/backups/blog-pre-migracion-20261102-9Yf4Mk/`: la aprobación coincide con la
  conversión y sus diagnósticos por artículo mediante `assertApproved`. No identifica
  por sí sola responsable, destino, ensayo ni aceptación final. La revisión posterior
  de contenido sí consultó el destino local: nueve borradores, nueve publicaciones,
  65 activos y 64 medios distintos usados por estos artículos.
- `src/backups/blog-20261101.dump` es un respaldo local ignorado por Git del estado
  previo; su listado se verificó, pero no se ensayó su restauración. No contiene los
  artículos ni los objetos de RustFS. Comprobar su existencia y vigencia antes de usarlo.
- Existe además `src/backups/blog-migrado-20261102/`, con dump, manifiesto y 64
  archivos de objetos. Se verificaron tamaños y SHA-256 de los 64 contra el
  manifiesto; esto no demuestra restauración ni conciliación con el destino actual.
  Los respaldos y aprobaciones permanecen fuera de Git.
- Antes de actualizar el contenido se creó un dump completo en
  `src/backups/blog-contenido-20261102-J0yf7F/`, con listado verificado, estados
  anterior/posterior e informes. Se confirmó que solo cambiaron los alt y el carácter
  informativo de las imágenes, además de versiones/timestamps. No se ensayó restauración.
- Después de completar el contenido se creó el checkpoint conjunto
  `src/backups/progreso-20261102T190057675Z-eyXUZX.tar.gz`: BD completa y los 65
  objetos actuales del bucket, con referencias conciliadas desde el snapshot,
  listado estable y hashes verificados. Incluye progreso y pendientes; ver
  [respaldo y skill reutilizable](../../../backups/README.md). No acredita restauración.
- El 2026-11-02 la persona solicitante confirmó que el funcionamiento es correcto
  desde el punto de vista de uso. Se registra la aceptación funcional del editor,
  no una verificación técnica de escenarios concretos. Después aceptó también el
  contenido de los nueve artículos y delegó completar los alt. Ver
  [registro del editor](mejora-editor.md#registro-de-implementación--2026-11-02).
- Importar artículos y medios requiere aprobación explícita después de la revisión,
  ensayo aislado y respaldo; organizar este plan no autoriza la importación ni el
  despliegue. No modificar los JSON fuente ni ocultar pérdidas con un fallback.

## Fases y seguimiento

- [ ] **B.1 — [Línea base y preparación](01-linea-base-y-preparacion.md).** Implementación y checks locales revisados; faltan confirmar destinos, verificar BD y ensayar recuperación.
- [x] **B.2 — [Conversión y revisión editorial](02-conversion-y-revision.md).** Contenido y presentación aceptados, alt completados y comprobados en las nueve URL públicas. Cierre de contenido independiente de los pendientes técnicos de B.1/B.3.
- [ ] **B.3 — [Ensayo e importación](03-importacion-y-entrega.md).** Importación local y respaldo registrados, sin evidencia suficiente para cerrar ensayo, repetición, restauración y entrega. Requiere B.2.
- [ ] **[Mejora del editor](mejora-editor.md).** Edición, imágenes y publicación implementadas, con pruebas automatizadas y aceptación de uso comunicada; faltan evidencias del recorrido con servicios reales y cierre de checks técnicos.

### Verificación de este seguimiento — 2026-11-02

Árbol local basado en `650ccf493b5a93fea82e1fbb859032640e06c905`, con cambios
sin commit en editor, API, esquema editorial, importador, pruebas y documentación.
Se inspeccionaron panel, persistencia, renderizador, importador y lectores públicos.
Comandos y resultados actuales en [mejora del editor](mejora-editor.md#comandos-desde-src):
443 pruebas pasaron y 6 se omitieron en la línea base; tras añadir las tres
regresiones del respaldo, 446 pasaron y 6 se omitieron con dos workers.
TypeScript y build correctos;
lint falla en el script local de restauración y `db:check` carece de conexión.
Esa primera revisión no verificó servicios reales. Posteriormente, la revisión de
contenido sí comprobó PostgreSQL y las rutas públicas locales: nueve artículos con
HTTP 200, 56 alt de cuerpo, 27 pies y nueve portadas. No se ensayaron restauración,
repetición de importación ni despliegue; tampoco el circuito completo de errores
y autorización. Detalle en [revisión editorial](revision-editorial.md).

## Aceptación y entrega

- [x] Los nueve artículos aprobados y sus medios están disponibles en el entorno
  local, con URL, fechas, categorías, textos, enlaces y pies conservados y los alt de
  imágenes verificados. Contenido y presentación aceptados por la persona solicitante.
- [ ] La importación es repetible sin duplicados ni sobrescritura de cambios;
  las referencias y objetos coinciden y las fuentes originales permanecen intactas.
- [ ] Panel, publicaciones, borradores y medios privados conservan sus protecciones;
  los lectores públicos no exponen borradores ni utilizan fallback improvisado.
- [ ] Pruebas, recorrido real, respaldo y restauración ensayada registrados con
  versión, entorno, marcador, responsable, resultados y pendientes.
- [ ] Aceptación individual de la entrega técnica y de las fases pendientes; el
  plan se marcó completo por decisión de la persona solicitante sin esta evidencia.

Los planes de ampliación siguen manteniendo su propio alcance y sus controles: su
exclusión de importar artículos no impide que este plan independiente lo haga tras
su propia aprobación. Ningún cambio de estado en este documento modifica esos planes.
