# [x] B.2 — Conversión y revisión editorial

[Plan del blog](README.md). **Contenido cerrado el 2026-11-02** por aceptación de
la persona solicitante y corrección de alt en los artículos ya migrados. La
dependencia técnica B.1 sigue abierta; este cierre no la da por cumplida ni autoriza
una nueva importación. La actualización de contenido existente fue solicitada
explícitamente, sin reimportar ni sustituir cambios editoriales previos.

## Inventario y conversión

- [x] Ejecutar los comandos de inventario/conversión disponibles desde `src/`,
  incluidos `pnpm blog:dry-run` y `pnpm blog:convert`; registrar versiones,
  resultados y ubicación privada de informes. Un fallo por pérdidas no es éxito.
- [x] Inventariar nueve artículos, categorías, URL, fechas, portadas, imágenes,
  enlaces, pies y relaciones. Mantener los archivos fuente intactos.
- [x] Revisar los diagnósticos actuales frente a
  [la revisión previa](revision-editorial.md); corregir el conversor o
  el contenido persistido resultante sin eliminar silenciosamente nodos ni atributos.
- [x] Registrar la aceptación explícita de contenido y presentación actuales,
  incluidas las diferencias frente al origen; comprobar textos, jerarquía, enlaces,
  pies e imágenes sin alterar cambios editoriales existentes. Las diferencias de
  render se aceptan por conformidad de la persona solicitante, no por afirmar una
  comparación independiente nueva en móvil/escritorio. Revisar atributos desconocidos.
- [x] Revisar visual y contextualmente el texto alternativo de cada imagen: redactar
  alt informativo por encargo de la persona solicitante, sin inventar detalles ni
  aceptar automáticamente los vacíos como decorativos. Incluye las nueve portadas.
- [x] Regenerar informes y verificar documentos contra el esquema editorial vigente;
  preservar slugs, fechas, categorías y correspondencias estables de medios.

## Cierre

Evidencia, decisiones por grupo de diagnósticos, versiones, respaldo y los 64 textos
alternativos distintos están en la [revisión editorial cerrada](revision-editorial.md).
La persona solicitante acepta contenido y presentación actuales, incluidos los
cambios de estilo respecto a WordPress, sin exigir igualdad visual exacta. No se
afirma una nueva comparación visual independiente de todos los renders fuente:
se registra la aceptación explícita del resultado actual.

- [x] La persona solicitante aprueba los nueve artículos, medios y diferencias;
  registrar evidencia y decisiones, incluidos diagnósticos aceptados explícitamente.
- [x] Informe y artefactos identifican versiones y estados exactos del contenido
  aprobado. Los originales y sus diagnósticos se conservan, y las correcciones están
  en BD. La aprobación editorial no sustituye la autorización de importación de B.3
  ni permite reimportar encima de las nuevas versiones.
