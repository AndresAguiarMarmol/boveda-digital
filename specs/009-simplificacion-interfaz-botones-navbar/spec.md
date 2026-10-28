# Especificación Funcional — Spec 009: Simplificación de Interfaz (Eliminación de botones PIN, </> y Bloquear)

## 1. Contexto y Objetivos
En la versión actual de Bóveda Digital con identificación de usuario en primer uso y licenciamiento de dispositivo, se requiere simplificar la barra superior (Navbar) del Dashboard principal eliminando tres controles de acceso directo que no se necesitan en esta etapa de cara al usuario final:
1. El botón de **"PIN"** (Cambiar o Restablecer PIN de Bóveda).
2. El botón **"</>"** (Inspector de API y Tokens JWT).
3. El botón **"Bloquear"** (Bloqueo Inmediato de la Bóveda).

Se debe preservar estrictamente el resto de las funcionalidades del sistema (perfil de usuario, badge de licencia/trial, PWA, Google Drive, sincronización en la nube, respaldo y recuperación de datos, visor de documentos, cifrado Zero-Knowledge y lógica de sesión).

## 2. Requerimientos Funcionales (RF)
- **RF-1 (Eliminación de Botones del Navbar):** En `index.html`, dentro del contenedor de acciones del encabezado (`<header>` en `#dashboard-view`), remover los elementos `<button>` correspondientes a:
  - Cambiar/Resetear PIN (`window.bovedaApp.resetPin()`).
  - Inspector API/JWT (`modal-api-inspector`).
  - Bloqueo inmediato (`window.bovedaApp.lockVaultNow()`).
- **RF-2 (Preservación de Métodos Subyacentes):** Mantener las funciones en `assets/js/app.js` y `assets/js/auth.js` sin alteración para evitar rupturas colaterales en la lógica de la aplicación.
- **RF-3 (Actualización de Caché):** Actualizar `sw.js` a `boveda-digital-v11` para garantizar la actualización inmediata del DOM en navegadores y celulares.
- **RF-4 (Pruebas Automatizadas):** Incorporar aserciones en la suite de pruebas `tests/boveda.test.js` que verifiquen la ausencia de estos tres botones en la barra de navegación del Dashboard y la vigencia del resto de los componentes.
