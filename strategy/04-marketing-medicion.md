# 04 — Marketing, conversión y medición

> Documento de planificación inicial. Sus requisitos, eventos y propuestas no constituyen evidencia de implementación o validación. Consultar el [estado actualizado](README.md#estado-actual) y el [informe estratégico](Gateways_Informe_Estrategico.pdf) para conocer los avances y límites documentados.

## Contenido y adquisición

Propuesta inicial a validar: posicionar Gateways como alojamiento boutique y punto de partida para explorar El Zonte. Crear contenido útil para decidir y reservar, no solo atraer visitas.

| Intención | Contenido propuesto | Acción siguiente |
| --- | --- | --- |
| Encontrar alojamiento | Fichas con servicios, ubicación, condiciones y fotos autorizadas | Consultar disponibilidad o iniciar solicitud |
| Preparar la visita | Guías de surf, gastronomía, transporte y estadías largas | Crear itinerario y explorar alojamientos |
| Resolver objeciones | FAQs validadas sobre acceso, conectividad, políticas y pagos | Concierge o contacto humano |
| Volver/recomendar | Beneficios y reglas claras de lealtad/referidos | Compartir código o consultar elegibilidad |

Investigar búsquedas e idioma antes de priorizar temas. Conectar Instagram y campañas con páginas pertinentes y UTMs consistentes. No prometer mejores tarifas directas si el negocio no lo ha autorizado. Medir antes/después de cada cambio con sus limitaciones.

## SEO y descubrimiento por IA

- Unificar nombre, ubicación, contacto, propiedades y políticas con información aprobada; resolver la inconsistencia Gateways/Getaways.
- Auditar títulos, descripciones, encabezados, URLs, enlaces internos, sitemap, canonical e indexabilidad antes de modificar.
- Publicar respuestas claras y verificables a preguntas reales, con fecha de revisión y fuentes cuando aplique.
- Usar datos estructurados pertinentes y coherentes con el contenido visible; validar su implementación, sin reseñas inventadas.
- Revisar consistencia de perfiles externos y enlaces con autorización del negocio.
- Registrar un conjunto de consultas sobre alojamiento en El Zonte y comparar menciones/citas en buscadores y asistentes, anotando herramienta, fecha y contexto.
- No garantizar aparición en ChatGPT, Gemini, Claude o Grok. Las respuestas varían y una mención no prueba una reserva atribuida.
- Staging debe permanecer fuera del índice; probar la configuración prevista de producción sin indexar accidentalmente el prototipo.

## Conversión

Prioridades a validar mediante pruebas: CTA visible, condiciones claras, formularios breves, mensajes de error útiles y continuidad entre alojamiento, consulta y solicitud. Comparar tareas completadas y abandonos observados; no declarar una mejora porcentual sin medición comparable.

## Referidos y lealtad

**Reglas propuestas, sujetas a aprobación comercial:** código único por participante; beneficio solo tras reserva/estadía elegible confirmada por el operador; sin autorreferidos, sin acumulación duplicada y sin recompensa por una simple visita. Definir quién recibe el beneficio, importe/tipo, tope, vigencia, exclusiones y tratamiento de cancelaciones antes de publicarlo.

Para lealtad, proponer un beneficio de retorno para huéspedes con estadía completada. Importe y condiciones: **pendientes**. El prototipo debe demostrar elegibilidad y rechazo de un caso no elegible sin prometer recompensas reales.

Capturar código en la llegada o formulario y preservarlo hasta la solicitud según consentimiento aplicable. Mantener registro de solicitud, origen, participante, elegibilidad y beneficio aplicado con acceso restringido. Definir una ventana de atribución con el negocio; no inventar una como política oficial.

## Eventos y atribución propuestos

| Evento | Momento | Propiedades mínimas sin datos personales |
| --- | --- | --- |
| `property_view` | Se visualiza una ficha | `property_id`, fuente/medio/campaña disponibles |
| `concierge_started` | Primera interacción enviada | tipo booking/trip, página de origen |
| `itinerary_generated` | Se presenta un itinerario válido | duración, número de recomendaciones |
| `booking_started` | Inicio de solicitud | `property_id`, origen disponible |
| `booking_request_submitted` | El servidor acepta una solicitud | `request_id` seudónimo, referido válido si existe |
| `whatsapp_clicked` | Salida al canal humano | página, intención; no representa reserva |
| `bitcoin_payment_created` | Se genera un cobro sandbox | identificador de prueba, red, estado |
| `bitcoin_payment_confirmed` | El servidor verifica el pago | identificador de prueba, estado confirmado |
| `booking_confirmed` | Sistema autorizado u operador confirma | identificador seudónimo, canal atribuido |
| `referral_qualified` | Se cumplen las reglas aprobadas | identificador seudónimo y estado de elegibilidad |

Registrar UTMs de llegada y origen conocido con una política documentada; separar primer contacto de último contacto conocido. Clasificar sin fuente como «desconocido», sin inventar precisión. No enviar nombres, correo, teléfono, prompts completos o datos de pago a analítica. Acordar consentimiento, acceso y retención; no usar fingerprinting para llenar vacíos.

## KPIs y lectura de resultados

| Indicador | Cálculo / criterio |
| --- | --- |
| Conversión a solicitud | Solicitudes únicas aceptadas / sesiones medidas elegibles × 100 |
| Conversión a reserva | Reservas confirmadas del grupo observado / sesiones medidas de ese grupo × 100; aclarar rezagos y cobertura |
| Participación directa | Reservas directas confirmadas / total de reservas confirmadas del período × 100 |
| Cobertura de atribución | Reservas confirmadas con fuente identificada / reservas confirmadas × 100 |
| Conversión asistida | Solicitudes vinculadas a una interacción concierge / sesiones con concierge × 100; no implica causalidad |
| Uso de Bitcoin | Reservas elegibles pagadas con Bitcoin / reservas elegibles confirmadas × 100; sandbox por separado |
| Referidos y retorno | Reservas elegibles referidas y reservas repetidas, según reglas aprobadas |

Para cada KPI registrar período, fuente, responsable, numerador, denominador y exclusión de tráfico interno/pruebas. Si el denominador es cero, informar «sin datos», no 0 %. Línea base y metas numéricas: **pendientes de acceso y validación**. Separar siempre métricas sintéticas de la demo y resultados comerciales reales.
