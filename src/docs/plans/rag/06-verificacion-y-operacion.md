# [ ] R6 — Verificación, operación y aceptación

[Volver al plan](README.md). Se aplica desde R1; el cierre integral requiere R5.

## Verificación por fase

- [ ] Mantener pruebas mínimas de regresiones reales para extracción de JSON/HTML,
  normalización de servicios, idempotencia y separación de contenido público y privado.
- [ ] Verificar con PostgreSQL desechable reindexación, concurrencia, fallos, reintentos,
  despublicación y exclusión inmediata; no usar datos reales para pruebas destructivas.
- [ ] Probar filtros exactos combinados, búsqueda textual/semántica y resultados
  multilingües con un conjunto de preguntas representativo y criterios registrados.
- [ ] Verificar acceso de huéspedes y protección de API, citas válidas, cards basadas
  en datos reales, rechazo de temas ajenos y resistencia a instrucciones maliciosas.
- [ ] Ejecutar las comprobaciones existentes pertinentes, registrar comandos, resultados,
  fallos previos y límites; hacer recorrido en navegador de los estados principales.

## Operación y seguridad

- [ ] Registrar modelo y versiones, dimensiones, coste estimado, rendimiento, consumo
  de CPU/memoria, número de fuentes/fragmentos, tiempo de indexación y latencia.
- [ ] Definir supervisión de pendientes, errores, antigüedad del índice y reintentos,
  sin registrar preguntas sensibles, credenciales ni información privada innecesaria.
- [ ] Documentar variables y secretos sin valores, permisos, política de datos y
  dependencia externa del proveedor; verificar configuración antes de activar el agente.
- [ ] Documentar copia de seguridad, migración, reconstrucción idempotente y recuperación
  del índice; ensayar restauración en entorno aislado antes de cualquier corte.
- [ ] Verificar pgvector y recursos en el entorno de destino; resolver por separado la
  habilitación segura de cuentas de huéspedes fuera de localhost antes de producción.
- [ ] Definir procedimiento para detener el procesador y desactivar el asistente sin
  afectar publicación, catálogo, reservas o pagos.

## Registro de evidencia y aceptación

Completar por fase y entorno: fecha, versión/commit, responsable, comandos y resultados,
cantidades reconciliadas, incidencias, límites y aceptación. Ninguna casilla marcada
equivale por sí sola a autorizar producción ni acredita una restauración ensayada.

- [ ] R1: inventario, extracción, indexación y reconciliación.
- [ ] R2: sincronización, retirada, concurrencia y recuperación.
- [ ] R3: filtros exactos, cobertura, búsqueda e idiomas.
- [ ] R4: agente, ámbito, citas, seguridad y fallos.
- [ ] R5: sesión, navegador, tarjetas y accesibilidad.
- [ ] R6: operación, recuperación, requisitos del entorno y aceptación integral.
