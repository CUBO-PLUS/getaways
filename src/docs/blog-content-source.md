# Fuente pública del blog

`BLOG_CONTENT_SOURCE` selecciona la fuente para artículos, listados, categorías, portada, metadatos y sitemaps:

- `static` ejecuta el lector heredado del blog sobre Supabase (`posts`, `terms`, `post_terms` y `media`), tal cual, y es el valor predeterminado. Es un modo de fuente seleccionado, no un fallback desde PostgreSQL.
- `postgres` consulta exclusivamente `BlogPublication` y relaciones publicadas. Requiere migraciones aplicadas y contenido importado/revisado.

Configurar el valor explícitamente en cada despliegue. Un valor desconocido falla; PostgreSQL vacío o no disponible no activa el origen estático ni oculta el error. No activar `postgres` hasta aprobar la importación y confirmar la base objetivo.

Con `postgres`, los lectores esperan una solicitud entrante mediante `connection()` antes de importar/consultar Prisma. Así las páginas públicas (portada, índice, categoría y artículo con metadatos) no consultan la DB durante `next build` y se vuelven a renderizar por solicitud tras publicar o retirar. Los sitemap ya son dinámicos. Con `static`, no se llama `connection()` y el prerender existente se conserva. **La variable debe coincidir en build y runtime**: compilar en `static` y cambiar solo el entorno runtime a `postgres` podría dejar páginas estáticas prerenderizadas.

**Riesgo de rollback:** volver a `static` puede reexponer publicaciones que se retiraron en PostgreSQL y no se retiraron del origen estático. Antes de cambiar la variable a `static`, comparar la lista de retiradas y excluirlas del origen estático; no usar el cambio como rollback ciego. Mantener `static` mientras la importación aún no esté revisada/aplicada.
