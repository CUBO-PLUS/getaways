# [ ] R3 — Búsqueda híbrida y filtros

[Volver al plan](README.md) · Requiere [R1](01-indexacion-inicial.md) y [R2](02-sincronizacion.md).

## Recuperación

- [ ] Combinar búsqueda semántica por contexto y búsqueda textual por nombre y términos;
  evaluar ambas por separado y combinadas con preguntas reales y multilingües.
- [ ] Convertir requisitos inequívocos a filtros estructurados validados con un
  vocabulario permitido: servicios, ubicación, capacidad y otros datos confirmados.
- [ ] Reutilizar las claves y convenciones del catálogo; auditar datos heredados y
  distinguir verdadero, falso y desconocido donde la fuente lo permita. La ausencia de
  una casilla de servicio sigue la semántica vigente del catálogo, no una inferencia.
- [ ] Aplicar todos los filtros obligatorios antes del ranking: `wifi` **y** `hammocks`
  solo devuelve alojamientos que cumplan ambos. No relajar filtros sin explicarlo.
- [ ] Para capacidad y otros campos desconocidos, no afirmar cumplimiento. Revisar
  diferencias con `filterListings`, que conserva capacidad desconocida en ciertos casos.
- [ ] Si no existen coincidencias, indicarlo y, si se ofrecen alternativas, identificar
  explícitamente cuáles requisitos no cumplen o no están confirmados.
- [ ] Verificar visibilidad, vigencia y autorización de cada fuente en la consulta;
  devolver IDs, fragmentos y metadatos de procedencia para citas y cards.
- [ ] Soportar conteo y paginación completa cuando se soliciten todos los alojamientos,
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
