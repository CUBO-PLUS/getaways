# Fuente pública del blog

Las consultas públicas del blog usan PostgreSQL exclusivamente: artículos, listados, categorías, portada, metadatos y sitemaps leen las publicaciones existentes en la base. No existe selección por entorno ni fallback a Supabase o a los JSON locales. Las páginas y la configuración compartidas del sitio siguen usando su lector actual; los archivos JSON locales se conservan como respaldo y fuente del proceso de migración, no como origen de serving público.

**Requisito de despliegue:** antes de desplegar este cambio, aplicar las migraciones y realizar una importación aprobada del contenido y medios. Actualmente no hay destino de producción confirmado ni contenido aprobado para importar; por tanto, no ejecutar la importación ni escribir en la base como parte de este cambio. Si se despliega antes de completar esos pasos, el blog público no mostrará el contenido anterior; una base vacía no activa ningún fallback.

Las consultas esperan una solicitud entrante mediante `connection()` antes de importar/consultar Prisma, evitando lecturas en `next build` y manteniendo renderizado dinámico tras publicar o retirar. Se conservan las URLs públicas, filtros mediante la existencia de `BlogPublication`, renderizado y sitemaps.
