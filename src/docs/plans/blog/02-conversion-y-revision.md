# [ ] B.2 — Conversión y revisión editorial

[Plan del blog](README.md). Dependencia: B.1. No importar ni publicar en esta fase.

## Inventario y conversión

- [ ] Ejecutar los comandos de inventario/conversión disponibles desde `src/`,
  incluidos `pnpm blog:dry-run` y `pnpm blog:convert`; registrar versiones,
  resultados y ubicación privada de informes. Un fallo por pérdidas no es éxito.
- [ ] Inventariar nueve artículos, categorías, URL, fechas, portadas, imágenes,
  enlaces, pies y relaciones. Mantener los archivos fuente intactos.
- [ ] Revisar los diagnósticos actuales frente a
  [la revisión previa](revision-editorial.md); corregir el conversor o
  artefactos de conversión sin eliminar silenciosamente nodos ni atributos.
- [ ] Comparar origen y destino: texto, jerarquía, enlaces, pies, imágenes,
  presentación y render móvil/escritorio. Registrar resolución o aceptación
  explícita de cada diferencia con evidencia; no tratar atributos desconocidos como
  inocuos por defecto.
- [ ] Revisar contextual y humanamente el texto alternativo de cada imagen: aprobar
  alt informativo o justificar su carácter decorativo. No inventar alt ni aceptar
  automáticamente todos los vacíos.
- [ ] Regenerar informes y verificar documentos contra el esquema editorial vigente;
  preservar slugs, fechas, categorías y correspondencias estables de medios.

## Cierre

- [ ] Responsable editorial aprueba por artículo contenido, medios y diferencias;
  registrar evidencia y decisiones, incluidos diagnósticos aceptados explícitamente.
- [ ] Informe y artefactos identifican versión y entradas exactas para el ensayo.
  La aprobación editorial no sustituye la autorización de importación de B.3.
