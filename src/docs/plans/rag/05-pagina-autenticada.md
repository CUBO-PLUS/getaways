# [ ] R5 — Página autenticada y resultados visuales

[Volver al plan](README.md) · Requiere [R4](04-agente-y-citas.md) y cuentas de huéspedes disponibles en el entorno de destino.

## Acceso

`src/modules/guests/server/auth.ts` acepta HTTPS público para cuentas de huéspedes.
La restricción histórica a localhost no aplica. La comprobación integral de sesión,
protección de API y abuso sigue pendiente.

- [ ] Crear una página dedicada y un enlace visible en la navegación pública; no usar
  chat flotante como sustituto de la página solicitada.
- [ ] Al intentar usar el asistente sin sesión, ofrecer registro o inicio de sesión y
  regresar a la página mediante un destino interno validado contra redirecciones externas.
- [ ] Reutilizar la sesión de huésped y verificar en servidor que la cuenta siga activa;
  proteger también la API ante acceso directo, sesión vencida o revocada.
- [ ] Aplicar protección de origen, límites por cuenta y protección contra abuso conforme
  a las convenciones existentes. No aceptar un ID del cliente como prueba de identidad.

## Interfaz

Se agregaron imágenes públicas a las cards (cambios sin commit). La confirmación de una
respuesta funcional no sustituye la verificación de cards, citas, accesibilidad y
comportamiento completo en navegador; esa aceptación sigue pendiente.

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
