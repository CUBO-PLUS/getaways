# 03 — Especificaciones y prototipo

> Documento de planificación inicial. Sus requisitos, eventos y propuestas no constituyen evidencia de implementación o validación. Consultar el [estado actualizado](README.md#estado-actual) y el [informe estratégico](Gateways_Informe_Estrategico.pdf) para conocer los avances y límites documentados.

**Estado:** propuesta funcional, no implementación verificada. Los responsables de cada área están en el [plan del equipo](README.md#responsabilidad-compartida).

## Requisitos y aceptación

| ID | Requisito | Criterio para demostrarlo |
| --- | --- | --- |
| R01 | Experiencia de reserva directa | Desde una ficha, completar una solicitud con fechas y huéspedes; validar entradas y mostrar estado real o pendiente |
| R02 | Booking Concierge conectado a IA | Responder una FAQ con información aprobada, guiar a reserva y escalar una duda desconocida sin inventar |
| R03 | Trip Concierge e itinerario visual | Recoger intereses/duración y producir tarjetas por día con actividades, alojamiento y enlaces; etiquetar datos no confirmados |
| R04 | Disponibilidad e integraciones | Documentar el sistema actual y probar su API si hay acceso; si no, demostrar el flujo asistido con datos de prueba visibles |
| R05 | Bitcoin en sandbox | Crear un cobro de prueba, verificar su estado desde el servidor y demostrar pago confirmado, expiración y evento duplicado sin doble registro |
| R06 | Referidos y lealtad | Capturar un código válido, asociarlo a una solicitud de prueba y demostrar elegibilidad/no elegibilidad sin duplicar beneficios |
| R07 | Eventos y atribución | Verificar fuente/UTM, referido y pasos del embudo; conservar «desconocido» cuando falten datos |
| R08 | SEO, accesibilidad y móvil | Aplicar mejoras justificadas por auditoría y documentar pruebas de teclado, móvil, escritorio e indexabilidad prevista |
| R09 | Prototipo estratégico funcional | Roger y Luis muestran un flujo ejecutable con IA/low-code que conecta necesidad, especificación y decisión de producto |

Todos deben tener evidencia enlazada en el [checklist de entregables](checklist/entregables.md). Una pantalla estática no sustituye las integraciones o el prototipo funcional exigidos.

## Arquitectura lógica inicial

Este esquema expresa responsabilidades, no obliga a incorporar servicios nuevos. La arquitectura final depende de la auditoría.

```text
Instagram / Google / IA / referido
                  |
                  v
Sitio: contenido -> alojamiento -> concierge -> solicitud de reserva
                                     |                  |
                              Modelo IA + fuentes   Sistema de reservas
                                     |              (si hay acceso)
                              Itinerario visual          |
                                                  Cobro Bitcoin sandbox
                                                        |
                                               Verificación del servidor

Eventos consentidos + fuente/UTM + referido -> medición del recorrido
```

### Estructura web propuesta

Inicio → Alojamientos → Detalle de propiedad → Planifica tu viaje → Guía de El Zonte → Preguntas frecuentes/políticas → Contacto/reserva. Mostrar el CTA de reserva en páginas pertinentes y explicar condiciones antes del pago. Validar idioma inglés como prioridad con el negocio; no asumir traducciones ni tarifas existentes.

## Concierge: personalidad y flujo

**Personalidad propuesta:** anfitrión local, claro y amable, sin presión comercial. Atender en el idioma del viajero cuando el contenido lo permita. Identificarse como asistente automatizado.

**Instrucción base para validar en el prototipo:**

> Eres el asistente de Gateways El Salvador. Usa únicamente la información aprobada de propiedades, políticas y experiencias. Pregunta fechas, número de huéspedes e intereses según la tarea. No inventes tarifas, disponibilidad, tiempos de traslado ni reservas confirmadas. Si falta información, indícalo y ofrece contacto humano. No solicites datos de tarjetas, documentos ni claves. Presenta itinerarios como sugerencias y dirige a una solicitud de reserva con estado explícito.

**Reserva:** intención → fechas/huéspedes → preferencias → información aprobada → consulta de disponibilidad cuando exista → resumen → solicitud → confirmación por sistema autorizado u operador.

**Viaje:** duración/intereses/presupuesto orientativo → propuesta de días → tarjetas de actividades y alojamiento → ajustes → CTA de reserva. No presentar disponibilidad, clima, horarios o precios como verificados sin fuente vigente.

**Errores:** modelo no disponible → mensaje claro y contacto alternativo; datos incompletos → pedir aclaración; petición fuera de alcance o instrucciones maliciosas → no ejecutar acciones ni revelar secretos. La IA no decide el estado de pagos o reservas.

### Web y WhatsApp

Priorizar el concierge web para la demo. Validar con la mentora si satisface la alternativa «WhatsApp/website» del caso. Si se integra WhatsApp, documentar permisos, proveedor, costos y transferencia de contexto con consentimiento; si solo hay un enlace de contacto, no presentarlo como un bot integrado.

## Bitcoin: recorrido y viabilidad

1. Confirmar con el negocio demanda, método de liquidación, responsable, costos y política de reembolso; pedir asesoría aplicable antes de producción.
2. Comparar la opción Bitcoin on-chain/Lightning según disponibilidad de sandbox, experiencia del usuario, comisiones y soporte del operador. Proveedor y red: **pendientes**.
3. Mostrar importe, moneda de referencia, conversión si aplica, vencimiento, red y condiciones antes de crear el cobro de prueba.
4. Mostrar factura/QR y estado pendiente. El servidor verifica autenticidad del evento y/o consulta al proveedor; nunca confiar en un botón «ya pagué».
5. Registrar estados pendiente/confirmado/expirado/fallido y procesar notificaciones duplicadas sin duplicar pago o beneficio.
6. Ante expiración o fallo ofrecer reintento/contacto. Documentar reembolsos, volatilidad, posibles pagos tardíos y diferencia entre pago recibido y reserva confirmada.

No usar fondos reales ni recopilar claves privadas para demostrar el sprint. La viabilidad comercial queda pendiente hasta documentar costos y validación del negocio.

## Datos e integraciones

- Solicitud: identificador, propiedad, fechas, huéspedes, estado y contacto mínimo autorizado; no incluir contacto en eventos públicos.
- Itinerario: intereses, días y recomendaciones con fuentes; evitar almacenar conversaciones completas sin necesidad y consentimiento.
- Pago de prueba: identificador externo, solicitud asociada, importe, moneda/red, vencimiento y estado verificado.
- Atribución: fuente/medio/campaña, código de referido y solicitud; distinguir dato observado de autodeclarado.
- Documentar por API: propósito, autenticación, entradas/salidas, errores, límites, sandbox y ejemplo sin secretos. Secretos solo del lado servidor y fuera de Git.

## Pruebas y demo desde terminal

El README técnico debe dejar comandos reales de instalación, variables sin secretos, arranque y pruebas. Todavía no se fijan comandos porque este documento no verifica el stack ni su ejecución.

Demostrar: entrada válida e inválida, FAQ conocida/desconocida, caída de IA, itinerario, solicitud, Bitcoin confirmado/expirado/duplicado, referido inválido/autorreferido y eventos sin datos personales. Probar móvil, escritorio y teclado. Adjuntar comando/pasos, resultado esperado, resultado observado y evidencia. Identificar claramente cualquier mock.
