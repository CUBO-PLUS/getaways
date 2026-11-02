# Revisión de conversión del blog

Estado: revisión de contenido y diagnósticos actualizada tras corregir CTA. Quedan decisiones visuales/accesibles abiertas. **No aprobada para importar ni cambiar la fuente pública**. No se ejecutó la importación ni se editaron JSON fuente.

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

## Cierre reproducible pendiente

1. CTA funcional resuelto en los 8 artículos: texto y href `/contact-us` preservados como link permitido. Sigue pendiente comparar estilo visual de botón; revisar además el `id`/`type` fuente restante en WP 930.
2. Confirmar el diseño final frente a fuente para 60 separadores, 8 gaps de 67px y dimensiones/alineación de las 56 imágenes. Contact sheets generados; falta render comparativo de ambos documentos, particularmente móvil y desktop.
3. Decidir el alt de las 56 imágenes por posición y contexto: informativo con texto editorial aprobado, o decorativo solo si no añade información. Revisar si `media.alt_text` aporta sugerencia sin sustituir criterio humano; no se escribió ningún valor.
4. Tras corregir otras pérdidas solo en el artefacto de conversión (nunca JSON fuente), volver a generar informes y verificar igualdad de texto, hrefs, captions, estructura y render. Mantener bloqueada la importación hasta resolver alt y discrepancias visuales.

**Resultado:** 483 pérdidas y 8 diferencias visuales CTA quedan desglosadas con evidencia local. Se preservan texto sin whitespace, los ocho enlaces CTA y las 27 captions simples; los demás atributos no se descartan silenciosamente. Permanecen 56 decisiones de alt y discrepancias visuales pendientes. La inspección de miniaturas no autoriza inventar alt ni aprobar. **No hay aprobación para importar** hasta cerrar accesibilidad y render comparativo.
