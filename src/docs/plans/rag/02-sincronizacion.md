# [ ] R2 — Sincronización del índice

[Volver al plan](README.md) · Requiere [R1](01-indexacion-inicial.md).

## Cambios de fuente

- [ ] Inventariar todos los caminos de escritura relevantes, incluidos importaciones,
  publicación, despublicación, edición descriptiva y comercial, cambios de servicios,
  categorías, estado y eliminación; identificar efectos de cambios en datos asociados.
- [ ] Registrar de forma persistente el trabajo pendiente en la misma transacción que
  cambia la fuente pública, sin llamar al modelo ni mantener transacciones abiertas
  durante la inferencia. El guardado editorial no depende del éxito de embeddings.
- [x] Procesar fuera de la transacción con concurrencia limitada, reintentos, registro
  de fallos y recuperación tras reinicios; definir cómo se inicia y supervisa el
  procesador en cada entorno, sin depender de una petición web efímera.
- [ ] Agrupar cambios repetidos de una fuente y omitir fragmentos cuya huella y versión
  de modelo/extractor sigan vigentes; permitir reindexación por cambio de modelo.
- [ ] Antes de publicar resultados, comprobar versión/huella actual y reemplazar
  fragmentos atómicamente; un trabajo antiguo no puede sobrescribir uno más reciente.
- [ ] Retirar o invalidar fragmentos y referencias al despublicar, desactivar, archivar
  o eliminar; consultar siempre visibilidad y vigencia actual antes de responder.
- [ ] Evitar que un snapshot desactualizado se presente como vigente durante el
  procesamiento o después de un fallo. Definir estado pendiente y recuperación segura.
- [x] Reconciliar periódicamente pendientes y fuentes para reparar operaciones omitidas
  sin indexar contenido privado ni producir escrituras duplicadas.

## Aceptación

- [ ] Publicar y editar contenido actualiza índice y citas; guardar un borrador no
  modifica el contenido público indexado.
- [ ] Cambiar servicios o estado altera los resultados; retirar una fuente la excluye
  inmediatamente incluso si hay trabajos atrasados.
- [ ] Pruebas de fallos, reinicios, duplicados y dos actualizaciones concurrentes
  demuestran que no se pierde la última versión ni se restaura contenido retirado.
- [ ] Registrar métricas y evidencia de pendientes, errores, reintentos y reconciliación.
