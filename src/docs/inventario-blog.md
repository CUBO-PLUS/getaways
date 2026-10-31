# Inventario previo a migración del blog

Estado: inspección estática del árbol del proyecto; no se modificaron datos ni lectores. Fecha del inventario: 2026-10-31.

## Consumidores y contratos observados

| Área | Consumidor / ruta | Consulta o dato | Contrato que debe conservarse |
| --- | --- | --- | --- |
| Artículo | `app/(site)/[...segments]/page.tsx` → `getEditorialData()` en `modules/content/server/editorial.ts` → `EditorialTemplate` | `getPostBySlugAndDate(year, month, day, slug)` | Publicado únicamente; HTML sanitizado; título, fecha, portada. Artículo inexistente/no publicado da 404. `editorial.ts` prepara los datos del artículo y su objeto `article` de JSON-LD; no emite canonical ni Open Graph. |
| Metadatos por ruta | `app/(site)/[...segments]/page.tsx` → `generateMetadata()` | Consulta artículo/página y resuelve portada del post | Para artículo emite title/description, canonical `/${segments.join("/")}` y Open Graph `type: article`, title, URL, publishedTime e imagen propia si está disponible. Para páginas editoriales emite title/description y canonical. |
| JSON-LD | `modules/content/server/editorial.ts` → `articleSchema()` (`shared/seo/structured-data.ts`) → `EditorialTemplate` / `components/seo/JsonLd.tsx` | Datos `article` preparados al resolver artículo | Marcado estructurado del artículo; distinto de los metadatos Next.js de `generateMetadata()`. |
| Índice | `app/(site)/blog/page.tsx` | `getAllPosts()` y `getPostCategoriesWithCounts()` | Orden fecha descendente, tarjetas reutilizadas, filtros/categorías y conteo solo de publicaciones visibles. |
| Archivo de categoría | `app/(site)/category/[slug]/page.tsx` | `getPostsByCategory()` + categorías/conteos | Categoría `category` de WordPress, publicaciones relacionadas visibles y mismas `PostCard`. |
| Portada | `modules/site/server/home.ts` → `components/templates/HomeTemplate.tsx` | `getRecentPosts(POST_COUNT)` | Tarjetas recientes (límite configurado en módulo), mismas URLs y recursos gráficos. |
| Navegación/footer | `components/organisms/Footer.tsx` | `getPostCategoriesWithCounts()` | Categorías del blog con conteos, enlazadas a `/category/{slug}`. |
| Sitemap general | `app/sitemap.ts` | `getRecentPosts(100)` | Incluye `/blog` y hasta 100 publicaciones recientes, `lastModified` desde `published_at`; URL con fecha UTC. |
| News sitemap | `app/news-sitemap.xml/route.ts` | `getRecentPosts(50)` | Solo publicaciones de las últimas 48 h; `publication_date` ISO y título XML escapado. |
| Datos SEO por artículo | `app/(site)/[...segments]/page.tsx` (`generateMetadata`), `modules/content/server/editorial.ts`, `shared/seo/structured-data.ts` | Metadata usa `seo_title || title` y `seo_description || excerpt || descriptionFromHtml(content_html)`; portada y fecha. `editorial.ts` alimenta artículo/JSON-LD. | La ruta es quien emite canonical y Open Graph; JSON-LD lo prepara/emite el flujo de plantilla. No inventar autor: JSON-LD omite autor si no hay dato real; conservar SEO y fecha. |
| Presentación de tarjetas | `components/molecules/PostCard.tsx`; `shared/utils/time.ts` | slug, `published_at`, imagen destacada, categorías | Ruta `/YYYY/MM/DD/slug`; formato de fecha fijo y categoría(s) correctas. |

`modules/content/server/content.ts` centraliza las consultas. No confundir sus consultas de posts con `getPageBySlug`/`getSiteContent`: las páginas editoriales y el contenido configurable del sitio son parte del mismo módulo pero no forman parte del cambio de fuente del blog.

## Datos locales

Archivos base: `data/posts.json`, `data/terms.json`, `data/post_terms.json`, `data/media.json`, y `public/media/`. Contrato TS en `data/types/content.ts` y `data/types/media.ts`.

- **Posts:** 9 registros; 9 con `status: published`. Campos: `id`, `wp_id`, `slug`, `title`, `content_html`, `excerpt`, `published_at`, `author_wp_id`, `seo_title`, `seo_description`, `featured_media_id`, `status`. Ninguna portada nula; los IDs de portada locales resuelven en el catálogo de media.
- **Fechas:** rango observado `2021-09-20T18:08:00+00:00` a `2026-08-03T15:20:06+00:00`. En los datos examinados todos llevan offset explícito `+00:00`.
- **Categorías:** 9 términos de taxonomía `category`: Uncategorized (`uncategorized`), Ideas, Tips, Trends, Getaways Guides, Surf, Eat & Drink, Before You Go y The Coast. Las categorías públicas reales deben obtenerse filtrando `post_terms` a IDs de posts (no contar relaciones de páginas/u otros tipos). Los conteos públicos actuales se derivan de posts publicados, no de todos los términos.
- **Relaciones:** `post_terms.json` contiene 70 pares `{post_id, term_id}` y mezcla relaciones de contenido fuera de posts. Importar solo relaciones cuyos `post_id` pertenezcan al conjunto de posts, preservando el ID WP y el taxonomy `category`; no tratar tags u otras taxonomías como categorías.
- **Medios:** 321 filas en `media.json`, con `{id, wp_id, storage_path, original_filename, alt_text}`; 320 archivos bajo `public/media/` (un registro del índice puede no tener archivo local). Las 55 referencias `wp-image-N` encontradas en cuerpos de posts corresponden a `wp_id` existentes: NO son necesariamente el `id` local. Los 9 `featured_media_id` sí son IDs locales del catálogo. Importación debe mapear de forma explícita `id` local / `wp_id` WP y resolver ambos usos sin confundirlos.
- **Cuerpo WordPress:** hay 154 bloques paragraph, 60 separator, 56 image, 55 heading, 27 list-item, 7 list, 8 buttons, 8 button y 8 spacer (conteo de marcadores Gutenberg en `content_html`). Se encontraron 56 figuras y 27 pies `<figcaption>`. El conversor debe conservar listas, heading level/clases y pies; además de los nodos previstos en el plan, hay bloques `buttons`, `button`, `spacer` y formato/atributos Gutenberg que necesitan equivalencia explícita o informe de conversión, no descarte silencioso.
- **Alt:** el catálogo tiene `alt_text`; el inventario de referencias de imagen en HTML permite comprobar el alt literal por artículo. Acordar prioridad entre alt del nodo y metadato sin reemplazar silenciosamente un alt editorial.
- **Medios externos/referencias:** los `src` inspeccionados usan rutas `/media/...`; las imágenes WordPress se enlazan por nombre y `wp-image-ID`. Durante migración hay que comprobar cada archivo, no deducir integridad solo de IDs.

## Seguridad y administración

- No hay implementación de autenticación ni ruta `app/admin/` en el árbol de aplicación. La aparición textual de “auth” en material interno de Prisma no constituye login operativo.
- No existe paquete de auth en `src/package.json`, ni middleware de sesión/autorización identificado por búsquedas de código. El panel no puede habilitar escrituras hasta elegir/proveer identidad y autorización.
- Decisión propuesta: crear cuentas de administración cerradas (sin registro público) para operadores editoriales designados; exigir rol/permisos de administración en cada acción del servidor, incluido lectura de borradores, preview y carga. No reutilizar una estrategia inexistente. Elegir mecanismo de sesión en paso de diseño/implementación y cubrir CSRF/origin según el mecanismo. Esto es una decisión de alcance, no implementación.
- RustFS no está en `compose.dev.yaml` ni `compose.prod.yaml`; ambos solo definen app y PostgreSQL. Desarrollo: servicio Docker local, persistencia por volumen, API expuesta solo en loopback al host; desde la app en Compose, endpoint por nombre de servicio y puerto interno. Producción: RustFS debe ser local/administrado junto al despliegue, en red privada persistente y alcanzado por DNS/endpoint interno estable (no URL del host Docker en contenido); no exponer consola/API públicamente. Configurar endpoint de aplicación diferenciado del endpoint del navegador; el plan exige bucket privado. No hay infraestructura de despliegue adicional en el repo que permita confirmar DNS o TLS concretos, así que deben fijarse en el entorno de despliegue antes de conectar.

## Regla de fechas y URLs

`modules/content/paths.ts` toma año/mes/día con getters UTC y produce `/{YYYY}/{MM}/{DD}/{slug}`. Para buscar, `getPostBySlugAndDate` valida calendario real y consulta `published_at` desde `T00:00:00Z` hasta `T23:59:59Z`. Para evitar cambio de permalink al migrar: conservar instante ISO/timestamptz y derivar segmentos de calendario UTC; nunca convertir a zona local ni reconstruir desde fecha local. Preservar slug. Comparar por artículo URL calculada antes/después; considerar precisión del extremo (la consulta actual llega a `23:59:59Z`, no incluye fracciones de segundo posteriores dentro del último segundo: los datos actuales no muestran problema, pero una versión futura puede usar límite exclusivo del día siguiente).

## Hallazgos críticos / pendientes de cierre

1. **Bloqueo de seguridad:** no hay autenticación administrativa. El plan de “quién administra” solo puede resolverse como cuentas cerradas para operadores designados; todavía falta selección técnica de sesión y proveedor/gestión de credenciales. No abrir escrituras hasta implementar y verificar autorización por operación.
2. **RustFS sin despliegue definido:** actualmente no existe servicio ni endpoint. Desarrollo puede definirse por Compose; endpoint/DNS/TLS y persistencia de producción no son verificables desde este repo y requieren decisión del operador.
3. **Riesgo de importación:** IDs de imagen en cuerpos son `wp_id`; `featured_media_id` usa `id` local. Correlacionar mediante `media.wp_id`, no unir ambos como una misma clave.
4. **Riesgo de pérdida editorial:** hay 27 pies de foto y bloques `buttons/button/spacer` fuera del núcleo editorial planeado. Definir conversión y revisar diferencias antes de cambiar fuente pública.
5. Mantener filtros de publicado en todas las consultas, incluida categoría, tarjetas, metadatos, sitemap y portada. La fecha de los slugs es UTC.
