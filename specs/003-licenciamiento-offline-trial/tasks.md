# Tareas de Implementación — Spec 003: Sistema de Licenciamiento y Seguridad Offline (Trial 7 Días)

## Lista de Tareas

- [x] **T1. Módulo criptográfico y gestor de licencias en `assets/js/license.js`.**
  - Implementar funciones puras: `generarCadenaSolicitud(deviceId, email)`, `computarFirmaLicencia(deviceId, email, exp, salt)`, `generarTokenLicencia(...)`, `validarTokenLicencia(...)`.
  - Implementar la clase `VaultLicenseManager` con persistencia dual (`IndexedDB` + `localStorage`).
  - Inicializar `Device ID` único y `trial_start_date` en la primera apertura.
  - Implementar validación 100% offline con `crypto.subtle` (navegador) y `node:crypto` (tests).
  - Exportar funciones y clase para navegador (`window.vaultLicense`) y Node.js (`module.exports`).

- [x] **T2. Interfaz visual de bloqueo no eludible y activación en `index.html`.**
  - Diseñar el overlay modal no eludible `#modal-trial-lock` con estilo glassmorphism, indicador de candado de seguridad, visualización del Device ID, cadena `REQ|<DeviceID>|<correo>`, botón de copiado, botón directo de WhatsApp `+56933395447`, campo para token y botón "Activar Licencia Offline".
  - Diseñar el diálogo proactivo `#modal-license-info` para consultar días restantes o activar anticipadamente.
  - Añadir badge interactivo en el header/navbar que muestre los días de prueba restantes o el estado activo de la licencia.

- [x] **T3. Orquestación del ciclo de vida y control de acceso en `assets/js/app.js`.**
  - Inicializar `window.vaultLicense.init()` en el arranque de la aplicación.
  - Comprobar estado de licencia al desbloquear el PIN y periódicamente.
  - Si el trial expiró y no hay licencia válida, invocar `bloquearPorTrialExpirado()` para presentar el overlay no eludible.
  - Implementar manejadores `handleCopyLicenseRequest()`, `handleOpenWhatsAppSupport()` y `handleSubmitLicenseActivation()`.
  - Actualizar el badge de licencia en el dashboard.

- [x] **T4. Actualización del Service Worker en `sw.js`.**
  - Incluir `./assets/js/license.js` en la lista de recursos precacheados `ASSETS` de `sw.js` e incrementar a `CACHE_NAME = 'boveda-digital-v3'`.

- [x] **T5. Suite de pruebas unitarias automatizadas.**
  - Añadir pruebas unitarias en `tests/boveda.test.js` para:
    - Generación correcta del Device ID y cadena `REQ|<DeviceID>|<correo>`.
    - Cálculo de firma SHA-256 con la sal maestra `"Halterofilia-SuperSecret-Salt-2026"`.
    - Generación y decodificación de tokens Base64.
    - Rechazo de tokens manipulados, de firma errónea o con Device ID discordante.
    - Detección de vencimiento del período de 7 días (`TRIAL_DAYS = 7`, `604800000 ms`).
  - Ejecutar `node --test tests/boveda.test.js tests/server.test.js` y asegurar 100% verde (43/43 tests pasando).

- [x] **T6. Actualización obligatoria de `memory.md` y cierre de Spec.**
  - Registrar en `memory.md` (Sección 1, Sección 2 y Sección 3 con fecha de hoy) la arquitectura de licenciamiento offline y reglas de negocio.
  - Marcar tareas completadas en `tasks.md` y actualizar estado a `implementada` en `spec.md`.

- [x] **T7. Generación automática de usuario e interactividad en Cadena de Solicitud.**
  - Generar automáticamente `this.userEmail` (`usuario_<shortId>@boveda.com`) en la primera ejecución con persistencia dual (`IndexedDB` + `localStorage`).
  - Incorporar inputs editables `#lock-user-email-input` y `#info-user-email-input` con manejador `handleLicenseEmailChange` para actualizar en tiempo real la cadena de solicitud y el mensaje de WhatsApp.
  - Sincronizar automáticamente el usuario al iniciar sesión en `auth.js`.
  - Añadir pruebas unitarias específicas y verificar 44/44 tests pasando.
