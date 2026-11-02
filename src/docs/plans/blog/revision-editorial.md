# [x] Revisión editorial y contenido del blog

## Cierre de contenido — 2026-11-02

**Contenido completado y aceptado.** La persona solicitante confirmó «de contenido
esta bien asi» y encargó completar los textos alternativos y marcar terminado el
contenido. Se acepta la presentación actual, sin exigir equivalencia tipográfica
con WordPress. Esta aceptación no cierra seguridad, restauración, repetición de
importación ni los checks técnicos del [plan general](README.md).

### Trabajo aplicado y comprobado

- Se revisaron visualmente las nueve portadas y las 56 posiciones de imágenes en
  su contexto editorial, usando los archivos servidos por la aplicación local.
  Se redactaron descripciones en inglés, idioma de los artículos, sin inferir
  identidades ni detalles no observables. Las imágenes aportan información sobre
  lugares, comida, actividades o espacios de trabajo: se declararon informativas.
- Se completaron **65 usos de alt**: nueve `coverAlt` y 56 imágenes con `alt` no
  vacío y `decorative: false`. Son 64 medios distintos porque el medio 27 aparece
  en dos artículos. Se sustituyeron también los alt de portada de prueba existentes.
- Se actualizaron borradores y publicaciones existentes en una sola transacción,
  comprobando que coincidieran exactamente con el estado revisado y aumentando
  la versión de cada borrador. No se publicó ningún cambio ajeno al encargo.
- Se validaron los 18 documentos (nueve borradores y nueve publicaciones) y los
  requisitos de publicación. Títulos, texto, enlaces, pies, slugs, fechas, SEO,
  categorías, medios y correspondencias de importación se conservaron respecto al
  estado inmediatamente anterior, incluidos los cambios editoriales ya existentes.
  No se generaron resúmenes ni SEO opcionales ni se tocaron los JSON fuente.
- Las nueve URL públicas devolvieron HTTP 200. Se cotejaron exactamente sus 56
  alt, referencias de imagen y 27 pies con las publicaciones guardadas. En `/blog`
  se verificaron los nueve alt de portada; en Chrome las nueve imágenes cargaron.
- `pnpm blog:dry-run`: sin bloqueos. `pnpm blog:convert`: nueve esquemas válidos,
  483 diagnósticos y ocho warnings; salida 1, **no** conversión limpia. Ese comando
  sigue leyendo los originales intactos, no las correcciones editoriales de BD.
- Pruebas pertinentes: `pnpm exec vitest run modules/content/_test_/blog-publication-validation.test.ts modules/content/_test_/blog-link-roundtrip.test.ts modules/content/_test_/editor-content.test.ts --maxWorkers=2`:
  **10 pruebas pasaron** en tres archivos.

### Decisiones sobre diferencias de conversión

- **56 alt vacíos:** resueltos en el contenido vigente mediante las descripciones
  siguientes; no se aceptaron automáticamente como decorativos.
- **427 diagnósticos restantes y ocho warnings CTA:** se acepta conservar la
  presentación actual: separadores, espaciado, tamaño/alineación de imágenes,
  clases WordPress y enlaces de texto en lugar de botones. No se afirma igualdad
  visual exacta con el original ni se eliminan los diagnósticos históricos.
- Los ocho `aria-hidden="true"` del origen pertenecen a `div.wp-block-spacer`
  vacíos, sin texto ni hijos; no ocultan contenido significativo. Los atributos
  `id="/contact-us"` y `type="link"` del CTA de WP 930 no tienen referencias de
  ancla en estos artículos; el texto y destino del enlace vigente se preservaron.

### Evidencia y versión

Entorno: Compose local `gateways-dev`, PostgreSQL y aplicación en loopback.
Código base `650ccf493b5a93fea82e1fbb859032640e06c905`, con cambios sin commit.
Respaldo previo privado en `src/backups/blog-contenido-20261102-J0yf7F/`: dump
completo y listado legible por `pg_restore`, estados anterior/posterior, SQL aplicado,
descripciones, inventario, conversión e informe de comprobación pública. Los objetos
no se modificaron. La existencia del dump **no** acredita restauración ensayada.

Después del cierre se creó además el respaldo conjunto de BD y RustFS
`src/backups/progreso-20261102T190057675Z-eyXUZX.tar.gz`, con los nueve artículos
actualizados y los 65 objetos completos del bucket. SHA-256:
`c587894634eb3f85316dd2cc096cbaf34892851ba283280ba8b93f0ba4399b1c`.
Ver [instrucciones y alcance del checkpoint](../../../backups/README.md).

`revision-contenido.json` incluye hashes de cada documento y sus versiones;
SHA-256 canónico del informe:
`28a213a0a2d72be62bd1870e9c6553e9f8f5fbcb373e6d2cf742be19f629b054`.
La BD contiene nueve borradores, nueve publicaciones y 65 activos; se revisaron los
64 activos usados por estos artículos, sin alterar el activo adicional no utilizado.

| WP ID | Artículo | Versión antes → después | Portada (medio) | Imágenes de cuerpo con alt |
| ---: | --- | --- | ---: | ---: |
| 77 | Getaways Guides: El Zonte | 39 → 40 | 14 | 13 |
| 930 | Solo Female Travel in El Salvador | 1 → 2 | 23 | 8 |
| 988 | Co-Working Spots and Cafés in El Tunco | 1 → 2 | 28 | 4 |
| 1024 | Canegue Cafe | 1 → 2 | 33 | 4 |
| 1065 | El Salvador: Before Visiting | 1 → 2 | 39 | 6 |
| 1150 | Vacation Rental Booking Mistakes | 1 → 2 | 45 | 5 |
| 1210 | Surf Schools in Surf City | 1 → 2 | 52 | 6 |
| 1261 | El Salvador Beach Destination | 1 → 2 | 57 | 4 |
| 1303 | Covana Kitchen | 5 → 6 | 64 | 6 |

### Textos alternativos aplicados

Los IDs corresponden al destino local revisado y a los snapshots del respaldo;
no son IDs WordPress ni instrucciones para reimportar encima de cambios editoriales.

| Medio | Texto alternativo |
| ---: | --- |
| 1 | Swimming pool and loungers beside the wave mural at Zonset Surf Residences. |
| 2 | Palm-thatched beachfront restaurant above El Zonte's rocky shore. |
| 3 | Olas Permanentes beachfront restaurant alongside close-ups of seafood dishes. |
| 4 | Wooden benches and tropical gardens beside the thatched dining area at Nan-tal. |
| 5 | Jeisi's Pupuseria sign advertising pupusas and Bitcoin payments. |
| 6 | Aerial view of El Zonte's rocky coastline and dark-sand beach beside the caves. |
| 7 | El Zonte skate bowl shaded by palm trees, with murals along the walls. |
| 8 | Tienda El Pulpo storefront with an open counter and red signs in El Zonte. |
| 9 | Pool and palm-thatched pavilion surrounded by trees in El Zonte. |
| 10 | Bitcoin Hardware Store's white storefront on a paved street in El Zonte. |
| 11 | Wooden pedestrian bridge with metal trusses crossing the river in El Zonte. |
| 12 | Two sunset views over El Zonte beach, with orange skies reflected on wet sand. |
| 13 | Crepe topped with strawberries, chocolate drizzle and whipped cream on a square plate. |
| 14 | El Zonte's dark-sand beach and wooded headland reflected in the shallow water. |
| 15 | Suchitoto's white church and red-tiled rooftops overlooking the lake at sunset. |
| 16 | El Tunco's offshore rock silhouetted against an orange sunset. |
| 17 | Turquoise crater lake inside Santa Ana Volcano beneath low clouds. |
| 18 | Surfer riding a breaking wave off El Salvador's coast. |
| 19 | Drinks arranged on the counter of a café and bar. |
| 20 | Bright apartment living room with a corner sofa and floor-to-ceiling ocean views. |
| 21 | Colorful murals and a shopfront along a cobblestone street on the Ruta de las Flores. |
| 22 | Aerial view of El Zonte's dark-sand beach, rocky outcrops and beachfront homes. |
| 23 | Traveler in a sunhat sitting on a beach lounger facing the ocean. |
| 24 | Open-air seating and wooden tables beneath Nómada's high thatched roof. |
| 25 | Customers at outdoor tables overlooking the beach at Dale Dale Cafe. |
| 26 | Tusell Tostadores entrance with outdoor tables and a surfboard beside the doorway. |
| 27 | Remote worker using a laptop at a counter in Surf Cafe. |
| 28 | Rustic café counter with colorful signs for coffee, smoothies and juices. |
| 29 | Brunch plate with a fried egg, avocado, rice and salad at Canegue Cafe. |
| 30 | Two customers seated at a wooden table in Canegue Cafe's shaded patio. |
| 31 | Wooden tables with small potted cacti in Canegue Cafe's outdoor seating area. |
| 32 | Customer holding two red smoothies at Canegue Cafe. |
| 33 | Canegue Cafe's open counter and chalkboard menu framed by leafy plants. |
| 34 | Airport terminal illuminated in blue beside the runway at sunset. |
| 35 | People playing football on the wet beach as the sun sets over the ocean. |
| 36 | Apartment dining table and lounge with floor-to-ceiling views of the ocean. |
| 37 | Small group walking from a dark-sand beach onto a trail through dense greenery. |
| 38 | Surfers carrying their boards along a rocky beach beside a beachfront building. |
| 39 | White cathedral overlooking a tree-lined city square at dusk. |
| 40 | Smartphone displaying the Airbnb logo on a paper map. |
| 41 | Oceanfront apartment living room with a corner sofa and broad windows facing the beach. |
| 42 | Paved coastal road lined with trees, with the ocean visible in the distance. |
| 43 | Shared outdoor pool with loungers in front of an apartment building. |
| 44 | Guests gathered in a garden seating area beside an outdoor pool. |
| 45 | Traveler using a laptop at a wooden table in a softly lit room. |
| 46 | Puro Surf participants warming up together on the beach before entering the water. |
| 47 | Surf instructor demonstrating a beach exercise beside a surfboard at Los 3 Hermanos Surf. |
| 48 | Surf Strong group posing with upright surfboards on Playa San Blas. |
| 49 | Surfing Your Fears group holding surfboards on a rocky beach. |
| 50 | Wayo Surf School participants carrying surfboards toward the waves. |
| 51 | Young surfers and instructors gathered around surfboards on the beach. |
| 52 | Surfer balancing on a board while riding a breaking wave. |
| 53 | Surfer riding a curling wave below a sunlit rocky cliff. |
| 54 | Quiet cobblestone street bordered by colorful homes and tropical plants. |
| 55 | Aerial view of an airport terminal and runway at sunset. |
| 56 | Pizza and a side dish served at a small table directly on the sand. |
| 57 | Aerial view of dark-sand beaches along El Salvador's green Pacific coast. |
| 58 | Two open-faced breakfast sandwiches topped with eggs and avocado, served with beans. |
| 59 | Bowls, tacos and other dishes arranged on a wooden table at Covana Kitchen. |
| 60 | Server attending to a diner at a table in Covana Kitchen. |
| 61 | Remote worker using a laptop beside a coffee in Covana Kitchen's open-air dining area. |
| 62 | Ocean view through Covana Kitchen's tall thatched roof and open dining area. |
| 63 | Covana Kitchen's steep thatched roofs above a lawn with wooden chairs. |
| 64 | Tables and green chairs under Covana Kitchen's thatched roof, with views toward the ocean. |

## Informe histórico previo a la importación local

La revisión siguiente dejó
decisiones visuales/accesibles abiertas y no autorizó importar. Posteriormente se
registró una aprobación con aceptación de pérdidas y una migración local el
2026-11-02; ver [estado actual y límites](README.md#estado-comprobado-y-límites).
Esa aceptación inicial para importar no cerraba la revisión editorial; el cierre
posterior está registrado arriba. Las referencias a
«actual» y «no se ejecutó la importación» de este informe describen su corte previo,
no el estado posterior del entorno.

## Alcance y límite de evidencia

El informe identificado en `.superpowers/sdd/plan-implementacion-blog/task-8-report.md` documenta primero la salida previa de 507 pérdidas. Tras corregir CTA, se reprodujo desde `src/` con `pnpm blog:convert > /tmp/opencode/blog-conversion-after-cta.json`; exit 1 sigue siendo el bloqueo de revisión esperado. Resultado actual: 9 artículos, 9 esquemas válidos, 9 bloqueados, **483 `losses` y 8 `warnings` de diferencia visual CTA**. El JSON y los contactos visuales se guardaron únicamente en `/tmp/opencode/`; fuente, importación, DB y almacenamiento remoto no fueron tocados.

Se generaron contactos visuales locales de las 56 imágenes referenciadas, agrupadas por artículo y con número de posición/ID de medio, en `/tmp/opencode/blog-<wp_id>-contact.jpg`. Se revisaron visualmente los nueve contactos: las miniaturas cargan y corresponden a escenas/fotos; eso **no** valida su adecuación semántica en contexto, el recorte/tamaño del render final ni reemplaza el alt. No se redactó alt.

## Revisión por artículo

| WP ID | Diagnósticos | Preservación de texto* | Caption: origen/destino | Botón visible en origen | Dictamen |
| ---: | ---: | --- | ---: | --- | --- |
| 77 | 72 | Igual al quitar todo whitespace | 0/0 | — | Texto preservado; validar presentación y alt |
| 930 | 65 | Igual al quitar todo whitespace | 2/2 exactos | CONTACT US → `/contact-us` | Link/texto preservados; diferencia visual CTA advertida; `id`/`type` siguen como pérdidas |
| 988 | 43 | Igual al quitar todo whitespace | 4/4 exactos | CONTACT US → `/contact-us` | Link/texto preservados; diferencia visual CTA advertida |
| 1024 | 40 | Igual al quitar todo whitespace | 4/4 exactos | CONTACT US → `/contact-us` | Link/texto preservados; diferencia visual CTA advertida |
| 1065 | 55 | Igual al quitar todo whitespace | 2/2 exactos | CONTACT US → `/contact-us` | Link/texto preservados; diferencia visual CTA advertida |
| 1150 | 52 | Igual al quitar todo whitespace | 1/1 exactos | CONTACT US → `/contact-us` | Link/texto preservados; diferencia visual CTA advertida |
| 1210 | 57 | Igual al quitar todo whitespace | 6/6 exactos | CONTACT US → `/contact-us` | Link/texto preservados; diferencia visual CTA advertida |
| 1261 | 42 | Igual al quitar todo whitespace | 2/2 exactos | CONTACT US → `/contact-us` | Link/texto preservados; diferencia visual CTA advertida |
| 1303 | 57 | Igual al quitar todo whitespace | 6/6 exactos | CONTACT US → `/contact-us` | Link/texto preservados; diferencia visual CTA advertida |

*Comparación reproducible de `textContent` fuente frente a todo el texto/nodos `text` y atributos `caption` del documento, quitando whitespace para no confundir saltos de bloque de Gutenberg con pérdida de palabras. Coincide en los 9; **no** demuestra igualdad tipográfica ni espaciado equivalente. Los ocho CTA conservan texto y href como marks `link`; su estilo de botón queda registrado como warning visual. Artículo 77 no tiene CTA ni captions.

El cotejo confirma texto, hrefs y captions planos, no aprobación editorial integral. Los nueve informes siguen bloqueados hasta resolver las pérdidas restantes y decisiones de presentación/accesibilidad.

## Criterios para clasificar las 483 pérdidas y 8 warnings visuales

- **Pérdida semántica / bloqueante:** falta o cambia texto visible; cambia el orden/jerarquía de encabezados; desaparece el destino o texto de un enlace/CTA; se pierde texto de botón, contenido de figura o parte de una lista; se cambia una imagen significativa o su descripción accesible. Debe corregirse en conversión o preservarse como contenido equivalente y volver a comparar.
- **Tipografía/estilo:** solo cambia presentación (p. ej. clases o formato inline) y se comprueba que no codifica significado, jerarquía, estado ni affordance. Registrar como cambio visual, no llamarlo “metadato” ni aprobar sin comparar render.
- **Metadato posiblemente inocuo:** atributo técnico no representado que no afecta contenido, accesibilidad, navegación, SEO, seguridad ni apariencia (decisión caso a caso). Un atributo desconocido no es inocuo por defecto.
- **No clasificable:** sin contexto de origen/destino suficiente. Mantener pendiente, nunca descontarlo del total de pérdidas.

### Clasificación comprobada de los diagnósticos actuales

| Diagnóstico | Cantidad | Clasificación/evidencia | Acción segura |
| --- | ---: | --- | --- |
| `gutenberg-block-attributes-not-represented` | 124 | 60 separadores con `is-style-wide` (presentación); 56 atributos de imagen (ancho/alto/aspect ratio/alineación/tamaño/destino `none`; presentación y ajuste de tamaño); 8 spacers de 67px (espaciado visual real). No son pérdida de palabras, pero separators/spacers cambian ritmo visual. | Mantener visible como diferencia visual; no declarar equivalencia hasta comparar render a tamaño real y decidir si conservar separadores/espaciado. |
| `html-attribute-not-represented` | 239 | 229 clases de estilo WordPress (60 `hr`, 55 `h2`, 56 `figure`, 7 `ul`, 27 `figcaption`, 24 `div`); las 10 restantes son 8 `aria-hidden="true"` en wrappers y `type="link"`, `id="/contact-us"` en CTA. La clase del anchor CTA se reporta aparte como diferencia visual. `aria-hidden` requiere inspección del wrapper antes de descartarlo. | Revisar layout. `id` y `type` CTA siguen siendo pérdidas explícitas; href `/contact-us` sí queda como mark link. Ningún otro atributo se descarta. |
| `image-classes-not-represented` | 56 | Clases con width/height/aspect ratio; en su mayoría declaran ancho 793px, con variantes. Diferencia de tamaño/flujo, no alteración del archivo de imagen. | Render comparativo desktop/móvil; no es pérdida semántica por sí sola. |
| `empty-image-alt-needs-editorial-decision` | 56 | Todos los nodos de imagen tienen alt vacío en HTML convertido; el conversor los marca decorativos. La vista de miniaturas confirma que son fotografías/imágenes visibles, pero no decide si cada imagen es decorativa o informativa en su contexto. | Revisión humana contextual de las 56 posiciones; no inventar/copiar alt del catálogo automáticamente y no aprobar `decorative` por defecto. |
| `gutenberg-block-not-represented` | 8 | Restan 8 `spacer`. Los 8 `buttons` son contenedores y los 8 `button` se representan con sus anchors funcionales `CONTACT US` → `/contact-us`; esos 16 marcadores no son pérdidas tras la conversión. | Spacer sigue pendiente de equivalencia visual explícita. CTA funcional corregido; el estilo queda en 8 warnings separados. |

Suma actual: 124 + 239 + 56 + 56 + 8 = **483 losses**. Se añaden 8 warnings `button-style-not-represented` (no se incluyen en losses). No se encontraron diagnósticos de caption con formato, imagen enlazada, inline image, heading-level, comentario HTML o inline semántico no soportado. Las 27 captions son texto plano y se conservaron exactamente, distribuidas en 8 artículos.

La lógica descrita se contrastó con conversión reproducida; el detalle por artículo está en `/tmp/opencode/blog-conversion-after-cta.json`. El warning CTA confirma que el destino visual es enlace de texto, no botón estilizado.

## Pendientes históricos — resueltos o aceptados en el cierre de contenido

1. CTA funcional resuelto en los 8 artículos: texto y href `/contact-us` preservados como link permitido. Sigue pendiente comparar estilo visual de botón; revisar además el `id`/`type` fuente restante en WP 930.
2. Confirmar el diseño final frente a fuente para 60 separadores, 8 gaps de 67px y dimensiones/alineación de las 56 imágenes. Contact sheets generados; falta render comparativo de ambos documentos, particularmente móvil y desktop.
3. Decidir el alt de las 56 imágenes por posición y contexto: informativo con texto editorial aprobado, o decorativo solo si no añade información. Revisar si `media.alt_text` aporta sugerencia sin sustituir criterio humano; no se escribió ningún valor.
4. Tras corregir otras pérdidas solo en el artefacto de conversión (nunca JSON fuente), volver a generar informes y verificar igualdad de texto, hrefs, captions, estructura y render. Mantener bloqueada la importación hasta resolver alt y discrepancias visuales.

**Resultado histórico:** 483 pérdidas y 8 diferencias visuales CTA quedaron desglosadas con evidencia local. Se preservaban texto sin whitespace, los ocho enlaces CTA y las 27 captions simples; los demás atributos no se descartaban silenciosamente. En ese corte permanecían 56 decisiones de alt y discrepancias visuales pendientes, sin aprobación para importar. Las correcciones y la aceptación posteriores están registradas en el cierre de contenido al principio de este documento.
