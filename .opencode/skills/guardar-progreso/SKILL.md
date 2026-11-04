---
name: guardar-progreso
description: Guarda un checkpoint local de Gateways con un dump completo de PostgreSQL, todos los objetos actuales de RustFS, hashes y una nota del avance. Usar cuando pidan guardar progreso, respaldar el avance, hacer un dump de DB y RustFS o crear una copia completa antes de continuar. No activa restauraciones, despliegues ni commits.
---

# Guardar progreso de Gateways

## Flujo

1. Localiza la raíz del repositorio y lee `src/backups/README.md`, el estado de Git
   y los planes relevantes. Resume en español lo terminado y los pendientes reales;
   no marques tareas como verificadas solo porque exista código.
2. Confirma que el encargo autoriza crear el respaldo. «Guarda el progreso» o
   «haz el dump de DB y RustFS» lo autorizan; una pregunta sobre cómo hacerlo no.
3. Comprueba los contenedores locales `gateways-dev-app-1`, `gateways-dev-db-1` y
   `gateways-dev-rustfs-1`. Si faltan, están detenidos o no corresponden al proyecto,
   detente y explica el bloqueo. No arranques, pares ni reinicies servicios ni
   cambies a producción o a credenciales administrativas automáticamente.
4. Reutiliza el script del proyecto, ejecutándolo desde `src/`:

   ```sh
   node scripts/backup-progress.mjs "Completado: ... Pendiente: ..."
   ```

   Sustituye la nota por el progreso real. El script crea un directorio único
   `backups/progreso-<UTC>-<sufijo>/`, un `.tar.gz` y su `.sha256`, sin reemplazar
   respaldos previos. Exporta un snapshot PostgreSQL y copia el bucket completo,
   incluidos objetos no referenciados. No requiere extraer credenciales del contenedor.
5. Comprueba que el comando terminó correctamente. Desde `src/backups/`, verifica
   `sha256sum -c NOMBRE.tar.gz.sha256`; dentro del directorio nuevo verifica
   `sha256sum -c SHA256SUMS`. Comprueba también `postgres.list`, `checkpoint.json`
   y `node RUTA/restore-objects.mjs` **sin** `--execute` para verificar los objetos.
   Ese helper solo verifica los archivos guardados; la conciliación con BD y la
   estabilidad del bucket se comprueban durante la creación y constan en el checkpoint.
6. Registra en el seguimiento pertinente la ruta, fecha, recuentos y resultado,
   sin secretos. Informa solo del archivo final, lo que incluye y los límites reales.

## Límites y seguridad

- Reutiliza los scripts; no construyas otro importador ni otra capa de backups.
- No restaures, reimportes, publiques, hagas commits/push, borres copias ni subas
  datos a terceros como efecto secundario de «guardar progreso».
- Los dumps contienen toda la BD, no solo el blog. Mantén el paquete bajo
  `src/backups/`, ignorado por Git, con permisos privados. No incluyas `.env`,
  contraseñas, cookies ni claves en notas, comandos visibles o archivos de seguimiento.
- `git-status.txt` y el HEAD documentan el código, pero el paquete **no respalda**
  los archivos fuente sin commit. No anuncies que el código quedó guardado.
- El script verifica estabilidad del listado de objetos y referencias desde el
  snapshot de BD. Si cambian objetos durante la copia o falta uno, considera el
  checkpoint incompleto; no ocultes el error ni sobrescribas el intento anterior.
- Es un respaldo lógico de una BD y de los objetos actuales del bucket configurado;
  no incluye roles globales, credenciales, políticas del bucket ni historial de versiones.
  No lo presentes como snapshot distribuido ni como copia de todos los buckets RustFS.
- Un dump legible y hashes correctos no prueban restauración. Mantén ese pendiente
  hasta ensayarla con autorización en una BD y bucket nuevos y aislados. El helper
  de restauración no escribe sin `--execute`, exige un bucket vacío y no sobrescribe.

## Respuesta final

`Respaldo: src/backups/ARCHIVO.tar.gz`  
`Incluye BD completa y N objetos; hashes verificados. Restauración no ensayada.`
