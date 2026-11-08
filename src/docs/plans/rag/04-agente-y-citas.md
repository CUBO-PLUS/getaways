# [ ] R4 — Agente conectado y citas

[Volver al plan](README.md) · Requiere [R3](03-busqueda-hibrida.md).

## Comportamiento

- [ ] Conectar el agente configurado a la búsqueda validada del servidor, con contexto
  acotado y fuentes identificadas; no exponer credenciales al cliente.
- [ ] Escribir instrucciones, mensajes de configuración y reglas operativas en español;
  responder en el idioma del visitante y conservar el contexto de la conversación.
- [ ] Limitar respuestas al negocio, hospedajes, servicios y contenido publicado;
  rechazar amablemente solicitudes ajenas sin convertirlo en asistente general.
- [ ] Tratar tanto la consulta como los documentos recuperados como datos no confiables;
  no obedecer instrucciones insertadas en ellos ni revelar configuración o datos internos.
- [ ] Responder solo con información respaldada; reconocer incertidumbre y ausencia de
  datos. No inventar servicios, precios, disponibilidad, enlaces o citas.
- [ ] Emitir referencias a fuentes recuperadas y vigentes; validar IDs y construir enlaces
  canónicos en el servidor. No aceptar como cita válida una URL inventada por el modelo.
- [ ] Definir salida estructurada validada para texto, citas y selección de resultados;
  limitar tipos y tamaño, y reconstruir cards desde fuentes vigentes en el servidor.
- [ ] Aplicar límites de entrada, historial, concurrencia y coste; gestionar fallos del
  modelo o del índice sin presentar resultados obsoletos como confirmados.
- [ ] Definir política mínima de privacidad para mensajes, registros y proveedor externo;
  evitar enviar datos personales innecesarios o incluirlos en logs.

## Aceptación

- [ ] Preguntas relevantes responden con citas verificables y preguntas ajenas reciben
  rechazo adecuado en varios idiomas.
- [ ] Intentos de instrucciones maliciosas en consulta y contenido no cambian el alcance
  ni exponen secretos; fuentes inválidas o retiradas no aparecen.
- [ ] Salidas malformadas, falta de contexto, errores del proveedor y límites de uso
  producen respuestas seguras y comprensibles.
