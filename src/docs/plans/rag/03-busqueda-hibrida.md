# [ ] R3 — Búsqueda híbrida y filtros

[Volver al plan](README.md) · Requiere [R1](01-indexacion-inicial.md) y [R2](02-sincronizacion.md).

## Recuperación

- [x] Combinar búsqueda semántica por contexto y búsqueda textual por nombre y términos.
  La evaluación comparativa con preguntas reales y multilingües sigue pendiente.
- [x] Convertir requisitos inequívocos a filtros estructurados validados con un
  vocabulario permitido: servicios, ubicación, capacidad y otros datos confirmados.
- [x] Reutilizar las claves y convenciones del catálogo; corregir el manejo de filtros
  nullable para distinguir valores conocidos de desconocidos.
- [ ] Auditar datos heredados y
  distinguir verdadero, falso y desconocido donde la fuente lo permita. La ausencia de
  una casilla de servicio sigue la semántica vigente del catálogo, no una inferencia.
- [x] Aplicar todos los filtros obligatorios antes del ranking: `wifi` **y** `hammocks`
  solo devuelve alojamientos que cumplan ambos. No relajar filtros sin explicarlo.
- [ ] Para capacidad y otros campos desconocidos, no afirmar cumplimiento. Revisar
  diferencias con `filterListings`, que conserva capacidad desconocida en ciertos casos.
- [ ] Si no existen coincidencias, indicarlo y, si se ofrecen alternativas, identificar
  explícitamente cuáles requisitos no cumplen o no están confirmados.
- [ ] Verificar visibilidad, vigencia y autorización de cada fuente en la consulta;
  devolver IDs, fragmentos y metadatos de procedencia para citas y cards.
- [x] Soportar conteo y paginación completa cuando se soliciten todos los alojamientos,
  sin confundir el límite de contexto vectorial con el total de resultados.
- [ ] Consultar precio y disponibilidad desde la lógica vigente y en tiempo real cuando
  proceda; no garantizar disponibilidad ni una cotización a partir del índice.

## Aceptación

- [ ] Comprobar filtros combinados, ausencia de coincidencias, valores desconocidos,
  coincidencias exactas, búsqueda semántica, paginación y exclusión de retirados.
- [ ] Evaluar consultas y documentos en varios idiomas, nombres propios y sinónimos como
  «hamacas»/«hammocks»; registrar errores y decisiones de ajuste.
- [ ] Medir latencia y calidad sobre un conjunto representativo; documentar límites y
  agregar índices o infraestructura adicionales solo cuando la medición lo justifique.

## Implementación disponible

- `src/modules/rag/search.ts` exporta `searchRag` y `validateRagSearchInput` para uso
  server-only. La respuesta separa `totalCount` del page size y cada resultado incluye
  `sourceType`, `sourceId`, URL canónica, título, sección, fragmento y score.
- La API R4 `/api/rag/answer` detecta explícitamente `wifi`/`wi-fi` y `hamacas`/`hammocks`
  como filtros obligatorios del esquema permitido antes de ranking; no delega esta
  extracción al modelo. Si no hay coincidencias, informa que no halló alojamientos que
  confirmen todos los servicios. Negaciones y términos no mapeados no se convierten en
  requisitos positivos.
- La consulta combina coseno pgvector con ranking textual `simple` y deduplica a un
  fragmento mejor posicionado por fuente. Amenidades (claves `AMENITY_KEYS`), slugs de
  categorías existentes y capacidad mínima se validan; todos los filtros aplican con
  AND. Capacidad nula no cumple un mínimo.
- La SQL excluye publicaciones futuras/no publicadas, listings inactivos/archivados y
  fuentes con trabajo R2 pendiente, procesándose o agotado con error registrado. Esta
  última condición evita servir snapshots viejos tras un fallo terminal de reindexación.
- Quedan pendientes filtros estructurados adicionales (ubicación/edificio y métricas),
  evaluación multilingüe/calidad,
  medición de latencia y comprobación de precio/disponibilidad en tiempo real.
