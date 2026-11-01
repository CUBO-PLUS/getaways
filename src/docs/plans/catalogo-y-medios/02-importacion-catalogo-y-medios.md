# [ ] Fase 2.2 — Importación verificada del catálogo y medios

Dependencia: [fase 2.1](01-modelo-y-contrato.md).
[Plan 2 y checklist](README.md).

## Importación independiente del blog

- [ ] Inventariar los 11 hospedajes, términos y medios realmente referenciados, incluidas portadas, galería y etiquetas de habitaciones utilizadas por portada/destinos.
- [ ] Implementar `scripts/listings-import.mts`, con inventario/dry-run antes de permitir escritura. No requiere ni concede aprobación para importar artículos.
- [ ] Preservar IDs, slugs, contenido y orden; convertir importes una vez con las reglas actuales y comparar cotizaciones antes/después. No inventar precios o tasas.
- [ ] Copiar solo medios necesarios al almacenamiento existente; claves estables basadas en origen y huella, comprobar bytes y correspondencia `legacyMediaId`.
- [ ] Importar filas y relaciones de manera repetible. Si el destino ya fue editado, rechazar diferencias; no hacer upsert que sobrescriba cambios administrativos.
- [ ] Avanzar secuencias después de IDs explícitos y verificar que un alta nueva no colisiona.
- [ ] Comparar títulos, atributos, precios, categorías, portada, galería y URLs.

No reutilizar IDs numéricos de medios locales como si ya fueran `MediaAsset.id`.
Mantener correspondencias al transformar galerías y grupos. El futuro importador
del blog deberá reconocer medios ya migrados por `legacyMediaId`, sin duplicarlos
ni modificar publicaciones; esa adaptación no autoriza su ejecución.

## Ensayo y corte

- [ ] Ensayar primero en base/bucket aislados con datos anteriores sintéticos; comprobar preservación y repetición sin sobrescritura según la [verificación común](../comunes/verificacion-y-aceptacion.md).
- [ ] Definir y documentar la CLI del importador antes de usar sus comandos. No ejecutar una importación por escribir este plan.
- [ ] Registrar equivalencia de cotizaciones y galerías, correspondencias y compensación de objetos si falla una transacción.

La importación operativa final se coordina con la fase 2.3 y el corte B1. No cambiar
lectores de forma parcial. JSON y `public/media/` quedan intactos como originales,
no fallback operativo.

## Cierre

- [ ] Importador ensayado, repetible y con conflictos explícitos ante destinos distintos.
- [ ] IDs, secuencias, medios, relaciones y valores equivalentes verificados.
- [ ] Sin importar artículos ni alterar publicaciones del blog.
