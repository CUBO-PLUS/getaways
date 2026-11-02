# [ ] Plan — Mejorar el editor del blog

[Plan de migración](README.md) · [Propuesta original](propuesta-original.md)

## Objetivo

Hacer que una persona editora pueda modificar y publicar un artículo con confianza,
sin tener que conocer Tiptap ni adivinar cómo editar las imágenes. Conservar Tiptap,
el esquema editorial, los borradores y las protecciones existentes. Este plan no
autoriza una nueva importación ni cambios masivos sobre los artículos migrados.

## Punto de partida

- Antes de esta mejora, `modules/content/client/blog-editor.tsx` usaba Tiptap y
  ofrecía formato básico, autoguardado, vista previa y edición de metadatos. La interfaz
  era poco clara. La implementación actual está en `modules/content/client/blog-editor/`.
- El panel de texto alternativo y pie aparecía al seleccionar una imagen; era fácil
  pasarlo por alto. Las imágenes migradas con alt vacío se marcaron como decorativas
  y necesitan una decisión editorial individual, no una descripción inventada.
- Guardar modifica el borrador, no la publicación. El servidor ya permite volver a
  publicar una versión guardada mediante `publishBlogDraft`, pero la interfaz de un
  artículo publicado solo ofrecía retirarlo. La publicación valida, entre otros
  campos, el texto alternativo de la portada.
- La migración local importó nueve artículos y 64 medios; las diferencias visuales y
  los alt vacíos se aceptaron para importar, no como revisión editorial terminada.
  Confirmar el entorno y su estado antes de editar datos.

## 1. Edición y estados comprensibles

- [x] Rediseñar el espacio de trabajo alrededor del contenido: barra de formato
  reconocible, zona de escritura legible y detalles secundarios agrupados. Mantener
  etiquetas claras, estados activos, foco visible y uso por teclado y en móvil.
- [x] Distinguir claramente **borrador**, **publicado**, cambios por guardar y
  cambios guardados que aún no están publicados. No inferir que una publicación
  coincide con el borrador solo porque ambos existan; comprobar qué información
  proporciona realmente el servidor y añadir la mínima necesaria si hace falta.
- [x] Conservar autoguardado serializado, avisos al salir, recuperación de errores,
  protección contra versiones obsoletas y vista previa protegida. Explicar qué
  ocurrió y cómo resolverlo, sin descartar cambios locales.
- [x] Mantener títulos, resumen, categorías, portada y SEO accesibles sin hacer que
  las opciones secundarias compitan con la edición. Informar que el slug queda
  bloqueado tras la primera publicación.

## 2. Imágenes y accesibilidad

- [x] Hacer evidente cómo seleccionar una imagen existente y abrir sus opciones de
  **texto alternativo**, carácter decorativo y pie de foto, con nombre accesible y
  funcionamiento con teclado. Mostrar claramente qué imagen se está editando.
- [x] Al insertar una imagen, conservar la elección informativa/decorativa y explicar
  con un ejemplo breve cuándo corresponde cada una. Si es informativa, exigir una
  descripción; si es decorativa, guardar alt vacío de forma coherente. El pie no
  sustituye al alt. Permitir editar y quitar la imagen sin perder contenido vecino.
- [x] Hacer visible el alt de la portada junto a su vista previa y mostrar errores
  concretos antes de publicar. Conservar las restricciones y validaciones de subida
  existentes; no ampliar formatos sin comprobar seguridad y compatibilidad.
- [x] Permitir identificar y revisar imágenes migradas marcadas como decorativas,
  sin afirmar automáticamente que son incorrectas. La persona editora decide por
  imagen y contexto; los cambios se aplican solo al guardar y publicar el artículo.

## 3. Publicación explícita

- [x] Ofrecer **Publicar** para borradores y **Actualizar publicación** para
  artículos publicados, además de una acción diferenciada **Retirar** con
  confirmación y explicación de que deja de estar disponible públicamente.
- [x] Reutilizar la operación y la validación del servidor: no publicar con cambios
  pendientes, guardado en curso o conflicto; transmitir la versión guardada y
  mostrar los errores útiles devueltos por el servidor. Una actualización fallida
  no debe borrar la publicación anterior ni los cambios locales.
- [x] Mantener fecha original y URL, categorías y medios de la publicación; revisar
  la invalidación de las rutas reales del artículo con fecha, listado, categorías y
  demás consumidores afectados. La retirada no debe eliminar el borrador ni medios.
- [x] Si no se confirma la respuesta de publicación, consultar el estado sin afirmar
  falsamente que se guardó o publicó y sin perder cambios posteriores.

## 4. Verificación y entrega

- [x] Revisar pruebas existentes y añadir solo la cobertura que falte para edición
  de alt/pie, acceso por teclado, estados de guardado, publicación de un borrador y
  actualización de uno ya publicado. Proteger conflictos, autorización y preservación
  de la publicación ante errores en pruebas locales sin escritura en servicios reales.
- [ ] Completar la integración con PostgreSQL y RustFS aislados: comprobar conflictos,
  autorización y preservación de la publicación ante errores con persistencia real.
  Las respuestas HTTP simuladas no prueban transacciones ni permisos de medios.
- [ ] Comprobar en navegador escritorio y móvil: abrir un artículo migrado, editar
  imagen y portada, guardar, previsualizar, actualizar y comprobar la URL pública;
  verificar también retirada y acceso no autorizado en datos de prueba aislados.
- [ ] Ejecutar y registrar las comprobaciones pertinentes desde `src/`: pruebas,
  TypeScript, lint, build y, si se modifica la lógica de datos, comprobación de base
  de datos. Registrar comandos, resultados, entorno y pendientes reales.
- [x] Obtener aceptación de uso del flujo editorial por la persona solicitante. La
  revisión de los nueve artículos y sus textos alternativos es una tarea separada,
  completada después mediante el [cierre de contenido](revision-editorial.md), no
  por el mero hecho de mejorar el editor.

## Fuera de alcance

Nuevos roles o autenticación, biblioteca de medios general, colaboración en tiempo
real, programación de publicaciones e historial de revisiones. No añadir
dependencias ni cambiar el esquema de documentos si las funciones existentes bastan.

## Registro de implementación — 2026-11-02

- Aceptación de uso comunicada por la persona solicitante: «todo está bien en el
  punto de vista de uso ahora». Se registra como conformidad funcional del flujo,
  sin atribuirle pruebas específicas de dispositivos, conflictos, seguridad o
  recuperación que no se detallaron. No aprueba los alt ni el contenido por artículo.
- Posteriormente, la persona solicitante aceptó también el contenido actual y
  encargó completar los alt. Se actualizaron nueve portadas y 56 imágenes, en
  borradores y publicaciones, con respaldo previo y comprobación de las rutas
  públicas. El [cierre editorial](revision-editorial.md) ya no tiene pendientes de contenido.
- Se reemplazó el aside lateral por una sección permanente en la parte superior,
  con pestañas «Resumen y dirección», «Categorías», «Portada» y «Buscadores (SEO)».
  Solo se muestra una opción a la vez, usando el ancho disponible y conservando los
  valores al alternar. Las pestañas admiten flechas, Inicio y Fin con teclado.
  Las ventanas se reservan para imágenes y enlaces; son no modales y se pueden
  arrastrar, mover con flechas y cerrar con botón o Escape.
- Las opciones de imagen se abren al seleccionarla o desde la revisión de imágenes.
  La edición conserva la referencia a esa imagen aunque cambie el cursor. Las
  descripciones informativas vacías bloquean el guardado con un aviso concreto.
- «Revisar imágenes» se movió a la barra de formato, junto a «Insertar imagen» y
  el nuevo «Separador» (`horizontalRule`, ya admitido por el esquema). La barra se
  mantiene sticky durante la escritura; el recorte horizontal del documento se
  cambia a `clip` solo cuando está montado el editor, para evitar que `overflow`
  interfiera con sticky sin alterar el resto del sitio. Al final hay «Volver arriba».
- La vista previa sustituye temporalmente toda la interfaz de edición, no abre una
  ventana flotante. Usa la ruta protegida del borrador guardado y ofrece «Volver a
  editar». El editor permanece montado y conserva contenido, selección y pestaña.
- Se activó el historial nativo de Tiptap: `Ctrl+Z` para deshacer y
  `Ctrl+Shift+Z` o `Ctrl+Y` para rehacer, con `Cmd` en Mac y botones en la barra.
  La carga inicial queda fuera del historial para no deshacer el artículo completo.
  El autoguardado no vacía el historial; es local a la sesión y al artículo, no un
  historial persistente de revisiones. Los campos externos conservan sus atajos
  nativos, sin un interceptor global de teclado. Una regresión con Tiptap real
  comprueba la carga inicial, ambos atajos, el botón y el guardado posterior a
  deshacer usando la siguiente versión del servidor.
- El estado inicial compara campos editoriales y categorías con el snapshot
  publicado. Tras guardar se indica conservadoramente que puede haber cambios sin
  publicar; la coincidencia solo se afirma con información confirmada del servidor.
  Publicar y retirar conservan la fecha inicial y bloquean la dirección. Se revalida
  la URL canónica con fecha; categorías, listados y otros consumidores consultan
  PostgreSQL por petición mediante `connection()`, sin caché de datos compartida.
- Verificación de interfaz con Chrome y API simulada en un contexto aislado:
  escritorio de 1920 px y móvil de 390 × 844 px, edición de alt/pie y portada,
  arrastre, desplazamiento con flechas, Escape, restauración de foco, guardado y
  actualización con versión guardada. Sin desbordamiento horizontal en móvil.
  En la revisión de pestañas se comprobó además la barra a `top: 0` tras desplazarse
  1800 px en escritorio y 2200 px en móvil, el separador en el JSON guardado,
  «Volver arriba» con desplazamiento final 0 y la alternancia de vista previa sin
  recrear el editor ni volver a solicitar el borrador. El contenido del iframe no
  se validó con sesión y base reales en esta comprobación aislada.
  El punto de entrada temporal de prueba se eliminó. Estas comprobaciones **no**
  sustituyen la prueba completa con PostgreSQL y medios reales.
- Comprobación HTTP real sin sesión en el servidor local de prueba: lectura admin
  devuelve 401; vista previa devuelve 307 hacia el acceso editorial.
- Durante la implementación del editor no se ejecutaron importaciones ni escrituras
  sobre los nueve artículos o sus medios. La actualización posterior de alt se
  registra por separado arriba. No se modificó el contrato de base de datos ni se
  añadieron dependencias.
- Se reprodujo el error «Invalid blog document: unsupported mark attribute» al
  serializar enlaces importados con Tiptap real. La extensión compartida ahora
  declara solo `href`, `target` y `rel`, con `rel="noopener noreferrer"`, según el
  esquema editorial existente. No se amplió la lista de atributos permitidos ni
  se relajó la validación de enlaces inseguros. Una regresión comprueba enlaces
  importados y nuevos mediante edición, validación y renderizado.

### Comandos desde `src/`

| Comando | Resultado |
| --- | --- |
| `pnpm test` | Registro anterior con paralelismo predeterminado: 442 pasaron, 6 omitidas y 2 agotaron el timeout de 5 s (integración del editor y `ConciergeForm`). No repetido con ese paralelismo en la revisión de cierre. |
| `pnpm exec vitest run --maxWorkers=2` | Última revisión del 2026-11-02: 446 pruebas pasaron, 6 omitidas; 59 archivos pasaron y 6 se omitieron. Incluye Tiptap real, pestañas, separador, vista previa, deshacer/rehacer con respuestas HTTP simuladas y tres regresiones del respaldo. Las omitidas no cuentan como verificadas. |
| `pnpm exec tsc --noEmit --incremental false` | Repetido: correcto. |
| `pnpm run build` | Repetido: correcto; incluye emisión del contrato y compilación de producción. |
| `pnpm run lint` | Repetido: bloqueado por cuatro errores de `require()` en `backups/blog-migrado-20261102/restore-objects.cjs`. |
| `pnpm run db:check` | Repetido: bloqueado por `CONFIG.DB_CONNECTION_REQUIRED` en este proceso local. |
| `git diff --check` | Correcto. |

Pendientes para cerrar el plan: completar la comprobación con una conexión de base
de datos aislada, probar guardado/vista previa/publicación/retirada de extremo a
extremo con evidencia y resolver los bloqueos de checks registrados. La aceptación
de uso ya fue comunicada y la revisión de contenido de los nueve artículos y sus
textos alternativos quedó completada por separado.
