# Plan de implementación del blog: Tiptap, PostgreSQL y RustFS

Estado: propuesta pendiente de implementación.

## Objetivo y alcance

Migrar el blog existente a PostgreSQL y añadir un panel administrativo con Tiptap. Almacenar imágenes en un bucket local de RustFS y renderizar los artículos en el servidor, sin enviar el editor a los visitantes.

Incluye borradores, autoguardado, publicación explícita, categorías, SEO y carga de imágenes. No incluye colaboración en tiempo real, programación de publicaciones, historial completo de revisiones ni migración del resto del sitio.

## Punto de partida

- Next.js 16 y Prisma 8 ya están instalados. PostgreSQL está definido en `compose.dev.yaml`.
- El contrato está en `infrastructure/prisma/contract.prisma`; contiene modelos de referidos que deben conservarse.
- El blog lee `data/posts.json` y relaciones locales a través de `modules/content/server/content.ts`.
- `modules/content/server/editorial.ts` prepara HTML heredado de WordPress y metadatos.
- Los medios se consultan desde `shared/media/server/media.ts`; sus archivos están en `public/media/`.
- Las URLs actuales son `/{año}/{mes}/{día}/{slug}`. Deben conservarse.
- No asumir que existe autenticación administrativa: comprobarla antes de habilitar escrituras.

Las rutas de este documento son relativas a `src/`. Antes de implementar, leer `AGENTS.md`, las instrucciones locales aplicables y las guías pertinentes de `node_modules/next/dist/docs/`. Verificar las APIs actuales de Prisma 8 y Tiptap; no copiar ejemplos de otras versiones sin comprobarlos.

## Decisiones de arquitectura

1. PostgreSQL es la fuente de verdad de contenido y metadatos; RustFS guarda los archivos.
2. El formato editorial principal es JSONB de Tiptap, no HTML.
3. La versión de trabajo y la publicación son independientes. Guardar nunca publica.
4. Una publicación es una instantánea reemplazable; no se construye un historial completo.
5. Las imágenes se identifican por `mediaId`, no por URLs temporales ni por endpoints internos de Docker.
6. El servidor renderiza con `renderToReactElement()` y un mapeo propio para imágenes.
7. Se reutilizan los módulos y límites actuales. No se introduce una capa genérica de repositorios.

## Paso 1. Inventario y decisiones previas

- Revisar los consumidores de las consultas del blog: artículos, tarjetas, categorías, portada del sitio, metadatos y sitemap, si existe.
- Inventariar artículos, categorías, relaciones, portadas, imágenes internas, pies de foto y bloques WordPress.
- Comprobar la estrategia existente de autenticación. Definir quién puede administrar contenido; reutilizarla si existe.
- Confirmar que RustFS será local en desarrollo y definir cómo la aplicación lo alcanzará en el despliegue.
- Fijar la interpretación de las fechas de las URLs existentes para evitar desplazamientos por zona horaria.

**Criterio de cierre:** listado de consumidores y datos a migrar, autenticación definida y reglas de URLs documentadas.

## Paso 2. Contrato de base de datos

Añadir los siguientes modelos conceptuales al contrato existente, adaptando su sintaxis a Prisma 8:

| Modelo | Campos principales |
| --- | --- |
| `BlogPost` | `id`, `slug` único, `title`, `excerpt`, `document` JSONB, `documentSchemaVersion`, `coverMediaId`, `coverAlt`, `seoTitle`, `seoDescription`, `version`, `createdAt`, `updatedAt` |
| `BlogPublication` | `postId` único y FK, copia de los campos editoriales del borrador, `publishedAt`, `updatedAt` |
| `MediaAsset` | `id`, `objectKey` único, `originalName`, `mimeType`, `sizeBytes`, `width`, `height`, `defaultAlt`, `createdAt` |
| `BlogCategory` | `id`, `name`, `slug` único |
| `BlogPostCategory` | `postId`, `categoryId`, clave primaria compuesta |
| `BlogPublicationCategory` | `publicationPostId`, `categoryId`, clave primaria compuesta |

- `BlogPost` contiene el trabajo editable. La existencia de `BlogPublication` determina si está publicado.
- La publicación copia título, resumen, documento, versión de esquema, portada, texto alternativo y SEO. Las categorías publicadas usan su propia relación para que editar el borrador no cambie el sitio público.
- No duplicar un estado que pueda contradecir la existencia de la publicación.
- `version` permite escrituras condicionales para evitar sobrescribir cambios de otra pestaña.
- `documentSchemaVersion` versiona nuestro esquema de contenido, no la versión del paquete Tiptap.
- Conservar `publishedAt` al actualizar una publicación. Bloquear cambios de slug tras la primera publicación, incluso si luego se retira.
- Definir claves foráneas y políticas de borrado explícitas; restringir la eliminación de categorías o portadas utilizadas. Las imágenes dentro del JSON requieren validación adicional en la aplicación.
- Mantener el bucket en configuración mientras solo exista uno.
- Crear índices para consultas reales: slug, fecha de publicación y relaciones. No añadir un índice GIN sobre el documento sin necesidad concreta.
- Registrar la migración versionada y regenerar los contratos emitidos según el flujo del proyecto.

**Criterio de cierre:** migración aplicable sobre la base actual sin alterar referidos, contrato generado y restricciones verificadas.

## Paso 3. RustFS y almacenamiento

- Añadir RustFS a `compose.dev.yaml`, con versión de imagen fijada y volumen persistente.
- Exponer la API `9000` y la consola `9001` solo en loopback para desarrollo.
- Crear un bucket privado `blog-media` mediante una inicialización repetible.
- Definir variables de ejemplo para endpoint, región, bucket y credenciales; no incluir secretos reales ni variables públicas con credenciales.
- Distinguir el endpoint del proceso local del endpoint dentro de Docker.
- Implementar un cliente S3 exclusivo del servidor en `infrastructure/storage/`, con `forcePathStyle: true`.
- Usar credenciales de aplicación con permisos mínimos sobre el bucket; no utilizar credenciales administrativas en el navegador.
- Documentar arranque y respaldo: el volumen persistente no sustituye una copia de seguridad. Los respaldos deben incluir PostgreSQL y objetos.

**Criterio de cierre:** subir y recuperar un objeto desde la aplicación; persiste después de recrear el contenedor y el acceso anónimo directo al bucket está denegado.

## Paso 4. Esquema editorial y validación

- Crear el esquema compartido dentro de `modules/content/`, sin importar componentes del editor desde código público de servidor.
- Admitir párrafos, H2/H3, negrita, cursiva, enlaces, listas, citas, separadores e imágenes. El título externo es el único H1.
- Extender el nodo de imagen para almacenar `mediaId` y `alt`; incluir un atributo de pie de foto si el inventario confirma su uso.
- Compartir las extensiones de contenido entre editor, validación y renderizador. Mantener las extensiones exclusivamente interactivas fuera de esa configuración.
- Validar en el servidor la estructura, los nodos y atributos permitidos, la versión de esquema, tamaños y profundidad del documento.
- Validar destinos de enlaces y referencias a medios. Rechazar protocolos peligrosos, URLs de imágenes arbitrarias y contenido base64.
- Exigir texto alternativo para imágenes informativas y permitir `alt` vacío para imágenes declaradas decorativas.
- Rechazar versiones o nodos no soportados; no eliminar contenido desconocido silenciosamente.

**Criterio de cierre:** un mismo documento válido puede editarse y renderizarse; documentos inválidos no llegan a almacenamiento ni publicación.

## Paso 5. Autenticación y carga de imágenes

- Proteger el panel y cada operación de escritura en el servidor, incluida la carga y la lectura de borradores.
- Aplicar protección contra CSRF u orígenes no autorizados según el mecanismo de sesión elegido. Ocultar la interfaz no constituye autorización.
- Empezar con cargas a través del backend, sin URLs prefirmadas ni configuración CORS adicional.
- Limitar tamaño de petición y archivo; usar inicialmente JPEG, PNG y WebP, con máximo propuesto de 10 MB.
- Comprobar formato real y dimensiones, no solo extensión o `Content-Type`. Reutilizar dependencias existentes si son suficientes.
- Generar claves aleatorias e inmutables; el nombre original es solo metadato. No permitir rutas elegidas por el cliente.
- Subir el archivo, registrar `MediaAsset` y devolver su identificador. Si falla el registro, intentar eliminar el objeto y registrar cualquier fallo de compensación.
- Resolver imágenes mediante una URL estable de la aplicación. La ruta pública solo sirve activos referenciados por publicaciones; los usados únicamente en borradores requieren autorización.
- Resolver los medios por lotes al renderizar para evitar una consulta por imagen.
- No permitir eliminar activos referenciados por borradores o publicaciones. No crear todavía una tarea automática de limpieza.
- Definir caché de imágenes sin filtrar medios privados: retirar una publicación no puede dejar una ruta privada accesible por una respuesta pública cacheada.

**Criterio de cierre:** cargas no autorizadas o inválidas son rechazadas; una imagen puede insertarse y verse en el editor sin hacer público el borrador.

## Paso 6. Guardado y publicación

- Implementar las operaciones editoriales en `modules/content/server/`, con entradas validadas y comprobación de permisos.
- Crear borradores con documento vacío válido y slug único.
- Guardar con comparación e incremento atómicos de `version`. Devolver conflicto si la versión enviada quedó obsoleta.
- Serializar las peticiones de autoguardado, usar debounce y actualizar la versión local únicamente tras confirmación del servidor.
- Mostrar estados guardando, guardado, error y conflicto. No descartar cambios locales ante un fallo.
- Publicar usando la versión esperada del borrador; no publicar mientras existan cambios locales sin guardar.
- Dentro de una transacción, comprobar la versión, validar referencias y copiar datos y categorías a la publicación.
- Al actualizar, conservar la fecha original. Al retirar, eliminar la instantánea y sus relaciones publicadas, no el borrador ni los archivos.
- Invalidar las rutas o etiquetas de caché afectadas después del commit: artículo, archivos de categorías, listado y otros consumidores reales.
- La vista previa utiliza el mismo renderizador, requiere autorización y no se comparte en caché pública ni se indexa.

**Criterio de cierre:** guardar un artículo publicado no modifica su versión pública; publicar actualiza la instantánea y retirar la vuelve inaccesible.

## Paso 7. Panel administrativo

- Añadir las rutas de gestión en `app/admin/blog/` y el editor en la jerarquía existente de componentes.
- Ofrecer listado con borradores/publicados, creación, edición, vista previa, publicación y retirada.
- Incluir título, slug, resumen, categorías, portada, texto alternativo y campos SEO.
- Inicializar Tiptap únicamente en cliente con la configuración compatible con Next.js; verificar `immediatelyRender: false` en la versión elegida.
- Añadir una barra accesible con nombres de botones, estados activos y navegación por teclado.
- Advertir sobre cambios pendientes al abandonar la edición. No mostrar guardado exitoso antes de la confirmación del servidor.

**Criterio de cierre:** un administrador puede completar el flujo editorial sin modificar archivos manualmente.

## Paso 8. Migración del contenido existente

- Crear una importación repetible con correspondencias estables de IDs; conservar los originales cuando sea viable.
- Importar categorías y medios necesarios para el blog, sin cambiar los lectores de imágenes del resto del sitio.
- Copiar archivos a RustFS y transformar sus referencias en `mediaId`, tanto para portadas como para imágenes internas.
- Convertir HTML WordPress a JSON usando el esquema acordado. Detectar bloques, estilos o atributos sin equivalencia y emitir un informe.
- Revisar manualmente los artículos con bloques no soportados, pies de foto y formatos especiales. No aceptar conversiones que pierdan contenido silenciosamente.
- Conservar slugs, fechas, metadatos y categorías. Crear la versión de trabajo y su publicación para cada artículo actualmente publicado.
- Comprobar recuentos, relaciones, objetos y todas las URLs originales antes de cambiar las consultas públicas.
- Mantener intactos los JSON y medios locales como respaldo durante la transición. No usar un fallback automático que pueda volver a exponer artículos retirados.

**Criterio de cierre:** cada artículo migrado tiene contenido revisado, imágenes resueltas y la misma URL pública.

## Paso 9. Lectura pública y cambio de fuente

- Sustituir las consultas del blog en `modules/content/server/content.ts` por consultas a publicaciones, conservando los contratos de salida cuando resulte práctico.
- No migrar por accidente las páginas editoriales o la configuración del sitio que comparten ese módulo.
- Actualizar `modules/content/server/editorial.ts` y el template correspondiente para renderizar JSON mediante `renderToReactElement()` en servidor.
- Mapear imágenes a un componente adecuado; si se utiliza `next/image`, resolver dimensiones y restricciones de origen según la configuración real.
- Obtener tarjetas y SEO desde las columnas de la publicación, sin cargar documentos completos para los listados.
- Mantener filtros públicos centralizados: artículos, recientes, categorías, metadatos y sitemap no pueden consultar borradores.
- Adaptar las utilidades que hoy derivan descripciones desde HTML; usar resumen o texto extraído del documento cuando sea necesario.
- Asegurar que las rutas existentes siguen devolviendo 404 para contenido sin publicación y que el bundle público no incorpora el editor.

**Criterio de cierre:** el blog público lee PostgreSQL, conserva sus URLs y renderiza contenido sin montar una instancia de Tiptap.

## Paso 10. Verificación y puesta en uso

Revisar primero la cobertura existente y añadir solo las pruebas que falten para estos riesgos:

- Un usuario no autorizado no puede escribir, cargar archivos ni ver borradores o sus medios.
- El autoguardado no modifica la publicación; una escritura obsoleta no sobrescribe cambios.
- Publicar copia contenido y categorías de forma atómica; retirar elimina la visibilidad pública.
- Documentos, URLs y archivos inválidos son rechazados.
- La importación conserva URLs y contenido y puede repetirse sin duplicados.

Ejecutar desde `src/` los checks existentes pertinentes: pruebas, lint, TypeScript y build. Ejecutar los checks de base de datos con PostgreSQL disponible; verificar además el flujo real con RustFS y navegador. Registrar los comandos y sus resultados, sin declarar verificaciones que no se ejecutaron.

Antes del cambio de fuente, respaldar la base y los objetos. Si falla el despliegue, revertir la aplicación y evaluar qué datos se escribieron antes de restaurar; no borrar ni sobrescribir cambios editoriales nuevos. Cualquier vuelta temporal al blog estático debe ser explícita y revisar artículos retirados desde la migración.

## Dependencias y entregas

```text
Inventario → contrato → RustFS → esquema y validación
                                  ↓
                      autenticación y medios
                                  ↓
                      guardado/publicación → panel
                                  ↓
                      importación → lectura pública → verificación
```

- **Entrega 1:** datos y almacenamiento listos, sin cambiar el blog público.
- **Entrega 2:** panel protegido con borradores, medios y publicación comprobados.
- **Entrega 3:** migración revisada y cambio de fuente pública.

## Referencias

- [Tiptap: Static Renderer](https://tiptap.dev/docs/editor/api/utilities/static-renderer)
- [RustFS: AWS SDK para JavaScript](https://docs.rustfs.com/en/developer/examples/aws-sdk-js)
- [RustFS: instalación con Docker](https://docs.rustfs.com/en/installation/container/docker)
- Flujo local de Prisma y comandos del proyecto: `README.md`.
