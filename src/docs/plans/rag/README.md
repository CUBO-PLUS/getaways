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

## Estado actual

- La implementación RAG está en `main`. El usuario confirmó que el asistente responde.
- El índice local contiene 9 blogs y 11 listings (20 fuentes), con 548 chunks. La cola
  no tiene trabajos activos ni filas con error (`lastError`); el estado terminal
  `failed` con `lastError = NULL` no representa un fallo según el contrato actual.
- Compose tiene activos app y worker. Los logs recientes del worker muestran una
  reconciliación de 20 fuentes sin cambios.
- Se añadieron imágenes públicas a las cards en el commit `d59f8c9`.
- `src/modules/guests/server/auth.ts` permite origen HTTPS para huéspedes; el antiguo
  bloqueo histórico de producción/localhost ya no describe la implementación y no debe
  usarse como impedimento del plan.
- El usuario da por terminado el trabajo local y acepta su cierre en ese alcance
  (2026-11-08); esto no es aceptación formal de R1–R6 ni autorización de producción.
- Las casillas de fases y aceptación permanecen sin marcar. La aceptación local no
  acredita pruebas no realizadas ni evidencia interrumpida: concurrencia real,
  evaluación multilingüe y semántica integral, recuperación de la aplicación en su
  entorno, límites de seguridad y aceptación por entorno siguen sin demostrarse.

## Aceptación del plan

- [ ] El inventario de publicaciones y hospedajes públicos está cubierto y reconciliado.
- [ ] Los cambios y retiradas se reflejan sin divulgar información privada ni obsoleta.
- [ ] La búsqueda exacta, textual y semántica funciona en consultas representativas.
- [ ] El agente cita fuentes válidas, respeta su alcance y responde en varios idiomas.
- [ ] La página exige sesión para consultar y presenta resultados visuales verificables.
- [ ] Se registra evidencia, limitaciones, recuperación y aceptación por entorno.

El usuario acepta cerrar el trabajo local sin más pruebas por ahora. Esta decisión de
alcance no constituye aceptación formal del plan: no se marca ninguna fase como aceptada
y los puntos pendientes se conservan en [verificación y operación](06-verificacion-y-operacion.md).
