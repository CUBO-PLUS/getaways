# Respaldos locales de PostgreSQL

Los archivos de esta carpeta se ignoran en Git: pueden contener datos sensibles.
El dump en formato custom incluye el esquema, los datos y el marcador de migración;
no incluye los objetos de RustFS ni credenciales o roles globales de PostgreSQL.
Guardar también una copia segura fuera de esta máquina.

Para comprobar un dump desde `src/`:

```bash
docker exec -i gateways-dev-db-1 pg_restore --list < backups/ARCHIVO.dump
```

Para recuperarlo, restaurar **primero en una base vacía y aislada**, con PostgreSQL
compatible y un usuario con permisos suficientes. Sustituir el contenedor, usuario,
base y archivo por los del destino de prueba:

```bash
docker exec -i CONTENEDOR_AISLADO pg_restore --exit-on-error --no-owner --no-privileges \
  -U USUARIO -d BASE_VACIA < backups/ARCHIVO.dump
```

Verificar el marcador y los datos antes de cualquier corte. No restaurar encima de
una base existente sin respaldo y aprobación explícita.
