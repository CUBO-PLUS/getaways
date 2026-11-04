# [x] Fase 2.2 — Importación verificada del catálogo y medios

Dependencia: [fase 2.1](01-modelo-y-contrato.md).
[Plan 2 y checklist](README.md).

## Importación independiente del blog

- [x] Inventariados 11 hospedajes, 6 términos y 114 medios referenciados, incluidas portadas, galería y etiquetas utilizadas por portada/destinos.
- [x] Implementar `scripts/listings-import.mts`, con inventario/dry-run antes de permitir escritura. No requiere ni concede aprobación para importar artículos.
- [x] IDs, slugs, contenido, orden y campos comerciales equivalentes comparados contra la fuente; sin inventar precios o tasas. No se ejecutaron escenarios de cotización por la instrucción de no testing.
- [x] **Bloqueante antes de escribir:** inventariar y clasificar todos los atributos, incluidos objetos, listas y JSON codificado como texto. Convertir los campos financieros reconocidos a columnas tipadas y rechazar alias financieros, datos comerciales anidados y conflictos; las claves o estructuras desconocidas bloquean la importación hasta decidir explícitamente si se preservan como descripción o se rechazan. Comparar fuente y destino sin descartar atributos silenciosamente. El `CHECK` actual de JSONB solo filtra algunas claves de primer nivel y no garantiza esta clasificación.
- [x] La única escritura habilitada usa el normalizador cerrado de la CLI. Sin endpoints nuevos de escritura; el plan 4 deberá reutilizar validaciones y reforzar permisos antes de habilitar edición.
- [x] Copiados 114 medios al bucket existente con claves por origen/huella y correspondencia `legacyMediaId`; bytes comprobados por SHA-256.
- [x] Importador sin upsert destructivo y con rechazo de diferencias; reintento de una transacción revertida reutilizó objetos inmutables sin duplicarlos.
- [x] Secuencias avanzadas sin retroceder: Listing 84, ListingTerm 24 y MediaAsset 179; siguientes 85, 25 y 180, sin altas sintéticas.
- [x] Comparados títulos, atributos, precios, términos, portada, galería, dimensiones y correspondencias de medios.

No reutilizar IDs numéricos de medios locales como si ya fueran `MediaAsset.id`.
Mantener correspondencias al transformar galerías y grupos. El futuro importador
del blog deberá reconocer medios ya migrados por `legacyMediaId`, sin duplicarlos
ni modificar publicaciones; esa adaptación no autoriza su ejecución.

## Ensayo y corte

**Excepción para la entrega local del 2026-11-04:** no crear fixtures ni ejecutar
tests o restauraciones de ensayo. Usar el catálogo real inventariado, un respaldo
fresco de BD y objetos y comparación directa después de importar. Mantener rechazo
de conflictos, clasificación de atributos, IDs, secuencias y comprobación de bytes.
No repetir el importador para comprobar idempotencia: su modo de verificación debe
comparar sin escribir. El orden fuente se conserva como metadato interno
`attributes._sourceOrdinal`, derivado del inventario y omitido por el adaptador público;
esto evita otra migración de esquema y no duplica importes.

CLI (desde `src/`; dry-run no escribe DB ni S3):

```bash
pnpm listings:import              # dry-run por defecto
pnpm listings:import --apply     # escritura explícita
pnpm listings:import --verify    # comparación fuente/destino sin escribir
```

`_sourceOrdinal` se deriva del orden del JSON fuente y se persiste internamente
en `Listing.attributes` para conservar el orden de catálogo; no se acepta desde
la fuente ni forma parte de los atributos descriptivos expuestos.

- [x] Fuente/destino y preservación de datos previos comparados en el entorno local respaldado; ensayo aislado diferido para despliegue.
- [x] Definir y documentar la CLI del importador antes de usar sus comandos. No ejecutar una importación por escribir este plan.
- [x] Galerías y campos comerciales equivalentes registrados; ante fallo se conservan y reportan claves inmutables para reintento seguro, sin borrar objetos compartidos. No se ejecutaron pruebas de cotización.

La importación operativa final se coordina con la fase 2.3 y el corte B1. No cambiar
lectores de forma parcial. JSON y `public/media/` quedan intactos como originales,
no fallback operativo.

## Cierre

- [x] Importador implementado y validación de datos completada; repetible sin sobrescritura, sin ensayo automatizado adicional.
- [x] IDs, secuencias, medios, relaciones y valores equivalentes verificados.
- [x] Sin importar artículos ni alterar publicaciones del blog; hashes de filas y 65 objetos anteriores intactos. [Evidencia](04-evidencia-local.md).
