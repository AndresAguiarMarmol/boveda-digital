# Plan de Implementación — Spec 008: Soporte SMTP Gmail para Envío Real de Códigos y Resiliencia de Validación

## Fases de ejecución

### Fase 1: Variables de Entorno y Seguridad
- Actualizar `.gitignore` para incluir `.env`.
- Crear `.env.example` con la plantilla de configuración de Gmail (`smtp.gmail.com`, puerto 465, usuario, contraseña de aplicación).
- Crear `.env` local para que el usuario pueda ingresar sus credenciales directamente.
- En `server.js`: implementar la función `loadEnvFile()` para cargar variables de entorno desde `.env` al iniciar.

### Fase 2: Robustecimiento del Despacho SMTP en `server.js`
- Sanitizar contraseñas (`pass.replace(/\s+/g, '')`).
- Manejar respuestas multilínea completas de Gmail (`250-` y `250 `).
- Capturar códigos de error SMTP (>= 400) para reportar diagnósticos claros.
- Estructurar el mensaje con cabeceras RFC 5322 (`Date`, `Message-ID`, `From`, `To`, `Subject`).
- Si el envío SMTP falla o no hay credenciales, retornar `simulated: true` con el código generado para contingencia sin bloquear al usuario.

### Fase 3: Resiliencia en Cliente (`auth.js` y `app.js`)
- En `VaultAuth.sendEmailVerificationCode`: ante cualquier fallo HTTP o 401 del servidor, degradar suavemente al modo local generando el código en `sessionStorage` y retornando éxito simulado.
- En `BovedaApp.handleOnboardingSubmitStep1`: si la respuesta es simulada o trae código, exhibir el código en la pantalla del Paso 2 y notificarlo mediante Toast.
- En `desplegar-cloud.bat`: permitir pasar variables SMTP de `.env` a Google Cloud Run automáticamente.

### Fase 4: Pruebas, Memoria y Despliegue
- Actualizar `sw.js` a `boveda-digital-v9`.
- Incorporar pruebas automatizadas en `tests/server.test.js` y `tests/boveda.test.js`.
- Actualizar `memory.md`.
- Guardar en GitHub.
