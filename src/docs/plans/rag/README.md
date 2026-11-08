# [ ] Plan RAG — Índice y asistente de viajes

[Orden general y seguimiento](../README.md).

## Objetivo

Permitir que huéspedes autenticados consulten información del negocio mediante una
página dedicada con respuestas multilingües, citas verificables y resultados visuales.
El corpus comprende blogs publicados y hospedajes activos y no archivados; nunca
borradores, cuentas, reservas ni información interna. La navegación hacia el asistente
será visible sin sesión, pero la consulta y su API exigirán una cuenta de huésped.

El agente se limita al negocio y al contenido disponible. Sus instrucciones y
configuración se mantienen en español; responde en el idioma del visitante. No realiza
reservas ni pagos por su cuenta. Las cards y enlaces proceden de datos validados por
el servidor, no de HTML generado por el modelo.

## Fases y dependencias

- [ ] **R1 — [Indexación inicial](01-indexacion-inicial.md):** inventario, extracción de contenido enriquecido, embeddings e índice inicial verificable.
- [ ] **R2 — [Sincronización](02-sincronizacion.md):** publicación, cambios, retirada y reindexación recuperable. Requiere R1.
- [ ] **R3 — [Búsqueda híbrida](03-busqueda-hibrida.md):** búsqueda semántica, textual y filtros exactos de servicios. Requiere R1–R2.
- [ ] **R4 — [Agente y citas](04-agente-y-citas.md):** conectar búsqueda, respuestas acotadas y resultados estructurados. Requiere R3.
- [ ] **R5 — [Página autenticada](05-pagina-autenticada.md):** acceso, presentación dinámica y experiencia de huéspedes. Requiere R4 y cuentas de huéspedes funcionales en el entorno de destino.
- [ ] **R6 — [Verificación y operación](06-verificacion-y-operacion.md):** controles transversales desde R1 y aceptación integral tras R5.

Las fases se entregan en ese orden; la verificación acompaña cada una. No marcar una
casilla sin evidencia y aceptación. Crear este plan no autoriza aplicar migraciones,
indexar datos reales, cambiar la política de cuentas ni desplegar en producción.

## Situación de partida y límites

- `BlogPublication` contiene el snapshot público; `BlogPost` también contiene borradores.
- El catálogo público selecciona `Listing.active = true` y `archivedAt IS NULL`.
- `src/ai/embedding.ts` ya carga EmbeddingGemma localmente, pero su prefijo actual es
  de consulta; verificar el formato documental, dimensiones, límite de tokens y modelo
  realmente instalado antes de diseñar el almacenamiento.
- Existe configuración Anthropic; verificar disponibilidad, costes y modelo antes del uso.
- pgvector se habilitó localmente; su disponibilidad y permisos en la base externa de
  producción no están verificados.
- Las cuentas de huéspedes están restringidas a localhost y fuera de producción en
  `src/modules/guests/server/auth.ts`. No retirar ese bloqueo sin resolver los requisitos
  de seguridad y recuperación de cuentas y aprobar su habilitación por separado.

## Aceptación del plan

- [ ] El inventario de publicaciones y hospedajes públicos está cubierto y reconciliado.
- [ ] Los cambios y retiradas se reflejan sin divulgar información privada ni obsoleta.
- [ ] La búsqueda exacta, textual y semántica funciona en consultas representativas.
- [ ] El agente cita fuentes válidas, respeta su alcance y responde en varios idiomas.
- [ ] La página exige sesión para consultar y presenta resultados visuales verificables.
- [ ] Se registra evidencia, limitaciones, recuperación y aceptación por entorno.
