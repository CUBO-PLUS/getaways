# [ ] R5 — Página autenticada y resultados visuales

[Volver al plan](README.md) · Requiere [R4](04-agente-y-citas.md) y cuentas de huéspedes disponibles en el entorno de destino.

## Acceso

- [ ] Crear una página dedicada y un enlace visible en la navegación pública; no usar
  chat flotante como sustituto de la página solicitada.
- [ ] Al intentar usar el asistente sin sesión, ofrecer registro o inicio de sesión y
  regresar a la página mediante un destino interno validado contra redirecciones externas.
- [ ] Reutilizar la sesión de huésped y verificar en servidor que la cuenta siga activa;
  proteger también la API ante acceso directo, sesión vencida o revocada.
- [ ] Aplicar protección de origen, límites por cuenta y protección contra abuso conforme
  a las convenciones existentes. No aceptar un ID del cliente como prueba de identidad.
- [ ] Mantener el bloqueo actual de cuentas en producción hasta resolver recuperación,
  seguridad y requisitos operativos y contar con autorización expresa para habilitarlas.

## Interfaz

- [ ] Presentar respuestas, fuentes verificadas y cards de hospedajes o artículos según
  los resultados; reutilizar componentes y rutas existentes cuando sean apropiados.
- [ ] Renderizar únicamente tipos de resultado permitidos con datos actuales y
  autorizados del servidor; nunca interpretar HTML o JSX arbitrario del modelo.
- [ ] Permitir resultados dinámicos útiles, como listas o comparaciones, sin afirmar
  datos desconocidos y mostrando filtros y ausencia de resultados cuando corresponda.
- [ ] Incluir carga, errores, reintento, expiración de sesión y respuestas vacías;
  mantener accesibilidad de teclado, etiquetas, anuncios de estado y diseño adaptable.
- [ ] Mostrar texto y respuestas en el idioma correspondiente sin alterar las reglas
  de configuración en español ni inventar traducciones de datos no respaldados.

## Aceptación

- [ ] Recorrer en navegador acceso anónimo → login/registro → retorno → consulta, y
  comprobar acceso directo no autorizado, sesión revocada y redirecciones inseguras.
- [ ] Comprobar cards, citas, listas y comparaciones contra las fuentes actuales, así
  como comportamiento en móvil, teclado, estados vacíos y fallos.
