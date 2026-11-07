# 05 — Modelo operativo y sostenibilidad

> Documento de planificación inicial. Sus requisitos, eventos y propuestas no constituyen evidencia de implementación o validación. Consultar el [estado actualizado](README.md#estado-actual) y el [informe estratégico](Gateways_Informe_Estrategico.pdf) para conocer los avances y límites documentados.

## Operación propuesta

El operador de Gateways mantiene propiedades, tarifas, políticas y experiencias aprobadas, y confirma solicitudes cuando no haya integración automática. El equipo construye y documenta el prototipo; la responsabilidad posentrega debe acordarse expresamente.

| Actividad | Responsable propuesto durante el sprint | Frecuencia / disparador |
| --- | --- | --- |
| Validar FAQs, políticas y contenido | Roger + contacto del negocio | Antes de publicar y ante cada cambio |
| UX, campañas, métricas y Google Docs | Luis con apoyo de Roger | Avance diario y revisión semanal |
| Sitio, concierge y SEO técnico | Ricardo | Pruebas en cada cambio relevante |
| Integraciones, pagos y atribución | Mauricio | Pruebas en cada cambio relevante |
| Revisión cruzada y demo | Los cuatro | Antes de cerrar entregables |
| Mantenimiento después del sprint | Pendiente de acuerdo con Gateways | Definir antes de transferencia |

## Recursos y costos por confirmar

- Hosting/staging, dominio y WordPress existentes; inventario de plugins/licencias.
- Modelo IA: precio por uso, presupuesto, límites y responsable de credenciales.
- WhatsApp si aplica: proveedor, autorizaciones y costo de mensajería.
- Reservas: proveedor actual, acceso a API y posibles comisiones.
- Bitcoin: integración, costos por transacción/liquidación, soporte y reembolsos.
- Analítica: herramienta, consentimiento, retención y tiempo de revisión.
- Trabajo humano: atención de solicitudes, actualización de contenido y soporte.

**Estimación por completar:** costo mensual = infraestructura + licencias + uso de IA/mensajería + operación humana; agregar comisiones variables por reserva/pago. Comparar contra el margen de reservas directas incrementales, descontando beneficios y soporte. No declarar rentabilidad sin cotizaciones, volúmenes y márgenes validados.

## Mantenimiento mínimo

1. Probar cambios en staging y disponer de respaldo/plan de reversión antes de tocar producción.
2. Revisar contenido del concierge y retirar información vencida; informar desconocidos en lugar de inventar.
3. Limitar gasto/uso de IA y validar entradas; si falla un servicio, ofrecer contacto humano sin perder la solicitud.
4. Separar secretos y datos de prueba; controlar acceso, documentar retención y evitar datos personales en Git.
5. Verificar integraciones y eventos después de cambios; registrar incidencias y correcciones.
6. Entregar manual de uso, instrucciones técnicas, costos, responsables y límites conocidos.

## Riesgos y respuesta

| Riesgo | Respuesta durante el sprint |
| --- | --- |
| Sin acceso al sitio o reservas | Solicitar acceso temprano; documentar bloqueo y usar datos de prueba etiquetados con aprobación de la mentora |
| Reservas duplicadas o disponibilidad incorrecta | No prometer confirmación sin fuente autorizada; confirmar mediante sistema u operador |
| IA inventa información | Fuentes aprobadas, límites explícitos, pruebas y escalamiento humano |
| Cobro incorrecto / evento duplicado | Sandbox, estado verificado en servidor y procesamiento sin duplicados |
| Filtración o abuso de servicios | Secretos en servidor, validación, límites de uso y datos mínimos |
| Sobrealcance | Priorizar un recorrido completo y demostrable; no ocultar requisitos pendientes |
| Fechas contradictorias | Trabajar con entrega preventiva el 3 de noviembre y pedir confirmación escrita |
| Falta de evolución demostrable | Trabajo diario real en GitHub y Google Docs, sin historial fabricado |

## Transferencia

La entrega debe indicar qué funciona, qué usa datos de prueba, qué necesita permisos/proveedores y qué no está listo para producción. Acordar quién conserva acceso, quién asume costos y cómo apagar o revertir el prototipo. Ninguna puesta en producción está autorizada por estos documentos.
