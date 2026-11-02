# [ ] B.3 — Ensayo, importación y entrega

[Plan del blog](README.md). Dependencia: B.2 aprobada. Todas las rutas y comandos
son relativos a `src/`; verificar opciones reales del importador antes de ejecutarlo.

## Ensayo aislado

- [ ] Ensayar importación aprobada en PostgreSQL y bucket aislados; conservar IDs
  y correspondencias, sin sobrescribir contenido editorial preexistente.
- [ ] Comprobar nueve borradores y publicaciones, categorías, fechas, slugs, URLs,
  portadas, imágenes internas, alt, pies, objetos y accesibilidad. Comparar con
  inventario y revisión aprobados, no solo recuentos.
- [ ] Repetir importación y verificar que no duplica ni destruye cambios posteriores;
  comprobar manejo de errores y recuperación de escritura parcial en BD y objetos.
- [ ] Ejecutar pruebas existentes pertinentes y agregar únicamente la cobertura de
  regresiones faltante; verificar autorización, publicación, borradores, imágenes
  privadas y rutas públicas. Registrar resultados reales y fallos.

## Importación autorizada

- [ ] Identificar explícitamente destino, responsable, versión y ventana de corte;
  confirmar aprobación para importar los artículos y medios concretos.
- [ ] Crear respaldo fresco de BD y objetos y verificar la recuperación aislada;
  conservar originales, no borrar medios compartidos ni sobrescribir cambios nuevos.
- [ ] Ejecutar la importación aprobada usando el flujo existente y registrar
  comandos seguros, resultados, correspondencias, marcador y cualquier incidencia.
- [ ] Conciliar destino con el ensayo y recorrer todas las URL, listados, categorías,
  portada, metadatos y sitemap. Verificar imágenes y permisos en navegador.

## Entrega y recuperación

- [ ] Ejecutar `pnpm test`, `pnpm exec tsc --noEmit --incremental false`,
  `pnpm run lint`, `pnpm run build` y `pnpm run db:check`; registrar resultados y
  verificaciones reales de PostgreSQL y RustFS. Confirmar editor, guardado, conflicto,
  publicación, retirada y acceso a borradores/medios sin exponer credenciales.
- [ ] Documentar decisión de corte, responsable y verificación posterior. Ante un
  fallo, detener escrituras y evaluar cambios editoriales nuevos antes de restaurar;
  no sobrescribir ni borrar datos automáticamente. Un retorno temporal a la fuente
  estática exige decisión explícita y revisar artículos retirados.
- [ ] Registrar aceptación y pendientes; marcar fase y plan solo al cumplir sus
  criterios, sin presentar el mock o un ensayo como despliegue real.
