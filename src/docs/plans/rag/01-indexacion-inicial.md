# [ ] R1 — Indexación inicial

[Volver al plan](README.md) · Siguiente: [sincronización](02-sincronizacion.md).

## Inventario y extracción

- [ ] Inventariar cantidades, tamaños, idiomas, estructura y tipos reales de blogs
  publicados y hospedajes públicos, sin alterar datos ni registrar contenido privado.
- [ ] Identificar nodos de Tiptap, tablas o elementos existentes y casos que no se
  puedan extraer; documentar ejemplos y tratamiento, sin descartar datos silenciosamente.
- [ ] Recorrer el JSON de `BlogPublication` en orden, conservando título, extracto,
  encabezados, párrafos, listas, citas y pies de imagen pertinentes; no indexar
  borradores ni metadatos de imágenes decorativas como hechos.
- [ ] Para `Listing.contentHtml`, reutilizar `splitEditorContent` y un parser HTML
  apropiado para extraer contenido visible y estructura. Excluir envolturas base64,
  CSS, scripts, comentarios y marcadores de bloques dinámicos; decodificar entidades.
- [ ] Preservar enlaces, título, tipo, identificador y sección de origen para citas;
  generar rutas canónicas con los constructores existentes, sin inventarlas.
- [ ] Seleccionar mediante lista explícita los campos públicos y categorías útiles;
  excluir cuentas, reservas, notas internas y datos de administración.
- [ ] Recoger y normalizar los servicios canónicos de `AMENITY_KEYS`, capacidad y
  demás campos públicos relevantes sin inferirlos automáticamente del texto.
  Auditar valores antiguos ambiguos; no convertir `"false"` con truthiness.
- [ ] Fragmentar por secciones y límites reales de tokens, manteniendo contexto;
  documentar tratamiento de fragmentos largos y solapamiento si se necesita.

## Almacenamiento y ejecución eficiente

- [ ] Comprobar disponibilidad de pgvector y compatibilidad con el contrato/migraciones
  vigentes; verificar dimensiones, formato y prefijos de documentos y consultas del
  modelo de embeddings antes de elegir tipo vectorial y distancia.
- [ ] Diseñar almacenamiento de fuente, fragmento, enlace, huella y versiones de
  contenido, extractor y modelo; evitar duplicados y posibilitar reconstrucción.
- [ ] Incorporar migración reproducible y compatible con los procedimientos y respaldos
  del proyecto; no ejecutar contra una base operativa sin autorización.
- [ ] Preparar ejecución inicial idempotente, reanudable y por lotes acotados; calcular
  embeddings solo para fragmentos nuevos o modificados del mismo modelo/extractor.
- [ ] Medir tiempo, memoria, CPU, número de fragmentos, tamaño del índice y calidad de
  recuperación; elegir tamaño de lote y concurrencia a partir de resultados. No añadir
  infraestructura ni índices aproximados sin necesidad medida.
- [ ] Reconciliar fuentes elegibles, indexadas, omitidas y fallidas; hacer visibles los
  errores y permitir reintento sin borrar ni duplicar fuentes válidas.

## Aceptación

- [ ] Pruebas con contenido enriquecido representativo: estructura, entidades, listas,
  envolturas y texto largo sin pérdida silenciosa ni fuga de CSS/base64.
- [ ] La segunda ejecución no cambia los resultados ni recalcula contenido sin cambios.
- [ ] Las publicaciones y hospedajes públicos se reconcilian con el índice; borradores,
  inactivos, archivados y datos privados quedan fuera.
- [ ] Registrar entorno, modelo, versión, dimensiones, comandos, cantidades, tiempos,
  errores y evidencia en [operación](06-verificacion-y-operacion.md).
