# 02 — Auditoría y decisión de arquitectura

**Estado:** revisión exploratoria disponible y auditoría técnica integral pendiente.

El sitio de referencia es https://getawayselsalvador.com/. El [informe estratégico](Gateways_Informe_Estrategico.pdf) incluye observaciones de UX, comparación de tres referencias locales y una recomendación provisional de continuar validando el rebuild mediante un piloto controlado.

Las tablas siguientes describen verificaciones y criterios de cierre; no deben interpretarse como comprobaciones íntegramente ejecutadas.

## Auditoría conjunta

| Área | Qué revisar | Evidencia requerida | Responsable propuesto |
| --- | --- | --- | --- |
| Marketing y contenido | Propuesta de valor, idioma, fotografías, políticas, confianza y CTAs | Capturas fechadas, URLs y observaciones | Roger + Luis |
| UX y conversión | Descubrimiento → alojamiento → consulta → reserva; fricción y formularios | Recorrido grabado/anotado en móvil y escritorio | Luis + Ricardo |
| Competencia | Al menos tres alternativas relevantes; reserva directa, contenido y pagos | Tabla con URLs, fecha, fortalezas y diferencias verificadas | Roger |
| WordPress | Hosting, tema, plugins, versiones, reservas, APIs, copias y acceso a staging | Inventario autorizado sin credenciales | Ricardo + Mauricio |
| Rendimiento y móvil | Carga de páginas clave, imágenes, respuesta y estabilidad visual | Mediciones con dispositivo, herramienta, fecha y condiciones | Ricardo |
| Accesibilidad | Teclado, foco, etiquetas, contraste y mensajes de error | Pruebas manuales y resultados de herramientas | Ricardo + Luis |
| SEO técnico | Indexabilidad, robots, sitemap, canonical, títulos, estructura y datos estructurados | URLs y resultados de inspección | Ricardo |
| Datos y atribución | Eventos, UTMs, consentimiento, pasos entre dominios y reservas | Mapa de eventos existentes y vacíos | Mauricio + Luis |
| Integraciones y seguridad | Disponibilidad, pagos, límites de API y manejo de secretos/datos | Documentación, permisos y prueba controlada | Mauricio |

Cada hallazgo debe incluir **observación, evidencia, impacto, prioridad, recomendación y responsable**. Separar problemas demostrados de oportunidades e hipótesis. No realizar pruebas intrusivas sin autorización.

## Comparación de alternativas

| Alternativa | Elegir si la auditoría demuestra… | Costo/riesgo que se debe comprobar |
| --- | --- | --- |
| Optimizar WordPress | La infraestructura es mantenible y admite el flujo requerido | Dependencia de plugins, rendimiento y límites de integración |
| Híbrido | El contenido existente sirve, pero algunas funciones necesitan un servicio aparte | Complejidad de operación, datos y mantenimiento de dos piezas |
| Reconstruir | Hay bloqueos comprobados que no se resuelven razonablemente en lo existente | Migración, redirecciones, pérdida de SEO, costo y formación del operador |

Comparar plazo del sprint, costo inicial/recurrente, continuidad de reservas, operación por el negocio, seguridad e integraciones. Preferir reutilizar lo que funcione. La existencia de código nuevo en `/src` no demuestra que WordPress deba reemplazarse.

## Recomendación provisional y aprobación pendiente

- Referencia: informe estratégico del 7 de noviembre de 2026.
- Recomendación provisional: continuar la validación del rebuild mediante un piloto controlado.
- Sustento disponible: MVP desarrollado, revisión exploratoria de UX y comparación de alternativas en el informe.
- Pendiente: auditoría técnica integral de WordPress, costos, mantenimiento, integraciones y riesgos de migración.
- Aprobación del negocio, participantes y acta de decisión: pendientes de documentar.

Antes de sustituir el sitio en producción, inventariar URLs, preservar contenido válido, planificar redirecciones, definir recuperación y acordar responsables operativos.
