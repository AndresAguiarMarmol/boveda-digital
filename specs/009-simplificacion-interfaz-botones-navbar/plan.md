# Plan de Implementación — Spec 009: Simplificación de Interfaz Navbar

## 1. Modificación de Vista (`index.html`)
- Localizar las líneas 340-360 en `index.html` correspondientes a:
  - Botón Cambiar / Resetear PIN (`window.bovedaApp.resetPin()`).
  - Botón Inspector API / JWT (`modal-api-inspector`).
  - Botón Bloqueo Inmediato (`window.bovedaApp.lockVaultNow()`).
- Remover cuidadosamente estos tres bloques `<button>`.

## 2. Actualización de Service Worker (`sw.js`)
- Incrementar `CACHE_NAME` a `'boveda-digital-v11'`.

## 3. Pruebas Automatizadas (`tests/boveda.test.js`)
- Añadir el subtest `SDD 009: Simplificación de Interfaz del Navbar (Eliminación de botones PIN, </> y Bloquear)` comprobando:
  - Ausencia de los tres botones en el header del dashboard.
  - Presencia íntegra de los botones vigentes: Perfil de usuario, Trial/Licencia, Google Drive, Nube, Respaldar y Recuperar.
- Ejecutar suite de pruebas con `node --test tests/boveda.test.js tests/server.test.js`.

## 4. Documentación y Despliegue
- Actualizar `memory.md` (Sección 2 y Sección 3).
- Realizar commit y push a GitHub.
- Desplegar en Google Cloud Run.
