# Tareas de Implementación — Spec 008: Soporte SMTP Gmail para Envío Real de Códigos y Resiliencia de Validación

- [x] **Tarea 1: Configuración de Variables de Entorno y Protección**
  - [x] Añadir `.env` a `.gitignore` y `.dockerignore`.
  - [x] Crear `.env.example` con la guía de configuración de Gmail SMTP.
  - [x] Crear `.env` inicial listo para rellenar.
  - [x] Implementar `loadEnvFile()` en `server.js`.

- [x] **Tarea 2: Optimización del Motor SMTP en `server.js`**
  - [x] Añadir limpieza de espacios en contraseña de aplicación de Gmail.
  - [x] Soporte para respuestas multilínea (`250-`) y control de errores `>= 400`.
  - [x] Incorporación de cabeceras RFC 5322 (`Date`, `Message-ID`).
  - [x] Respaldo transparente en modo simulado ante fallos de conexión.

- [x] **Tarea 3: Resiliencia en Cliente (`auth.js`, `app.js` y `desplegar-cloud.bat`)**
  - [x] En `auth.js`, degradar suavemente a `sessionStorage` ante fallos o 401 del servidor.
  - [x] En `app.js`, exhibir el código en pantalla ante cualquier despacho en modo simulado.
  - [x] Actualizar `desplegar-cloud.bat` y documentar variables en Cloud Run.

- [x] **Tarea 4: Service Worker v9 y Pruebas Automatizadas**
  - [x] Actualizar `sw.js` a `boveda-digital-v9`.
  - [x] Añadir pruebas unitarias en `tests/server.test.js` y `tests/boveda.test.js`.
  - [x] Validar 100% de pruebas en verde con `node --test`.

- [x] **Tarea 5: Actualización de Memoria y Sincronización en GitHub**
  - [x] Actualizar `memory.md` en secciones 1, 2 y 3.
  - [x] Guardar cambios en Git y sincronizar en GitHub.
