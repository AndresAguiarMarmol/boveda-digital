# Plan de Implementación: Spec 010 — Eliminación de Solicitud de Clave para la Bóveda Protegida

## Objetivos
1. Implementar `autoUnlock()` en `VaultAuth` (`assets/js/auth.js`) para derivar y retener la clave maestra de forma transparente y sin interacción del usuario.
2. Actualizar los flujos de `BovedaApp` (`assets/js/app.js`):
   - En `init()`: sesión activa -> `autoUnlock()` -> `switchView('dashboard')`.
   - En `form-login`: login exitoso -> `autoUnlock()` -> `switchView('dashboard')`.
   - En `handleOnboardingSubmitStep2`: verificación exitosa -> `autoUnlock()` -> `switchView('dashboard')`.
   - En `loadAndRenderDocuments`: auto-recuperar `masterKey` mediante `autoUnlock()` si no estuviera en memoria.
3. Mantener ocultas las vistas `pin-lock-view` y `pin-setup-view` en `index.html` para que nunca se muestren al usuario.
4. Incrementar la versión del Service Worker a `boveda-digital-v12` en `sw.js`.
5. Actualizar la suite de pruebas automatizadas en `tests/boveda.test.js` asegurando cobertura de Spec 010 y 100% de tests pasando.
6. Actualizar `memory.md` y sincronizar los cambios en GitHub.

---

## Fases de Ejecución

### Fase 1: Módulo de Autenticación (`assets/js/auth.js`)
- Añadir método `async autoUnlock(preferredPin = '123456')`:
  - Obtiene el PIN de sesión (`sessionStorage`), de la configuración persistente (`vaultPinRawSecret_` o `vault_transparent_pin`), o recurre al PIN por defecto (`'123456'`).
  - Si no existe un PIN configurado en el dispositivo, invoca transparentemente `setupPin(pin)` para derivar la clave y registrar el hash.
  - Si ya existe un hash, deriva la clave maestra con el PIN y sal correspondiente. Si el PIN por defecto no coincide (ej. PIN previo del usuario), prueba claves candidatas o las sales registradas.
  - Guarda `_vault_session_pin` en `sessionStorage` y `vaultPinRawSecret_` en settings.
  - Asigna `this.masterKey` y `this.lastEnteredPin`.

### Fase 2: Controlador de Aplicación (`assets/js/app.js`)
- En `init()`: reemplazar la bifurcación `pin-lock` / `pin-setup` por `await window.vaultAuth.autoUnlock(); this.switchView('dashboard');`.
- En el evento `submit` de `form-login`: tras el login exitoso, ejecutar `await window.vaultAuth.autoUnlock(); this.switchView('dashboard');`.
- En `handleOnboardingSubmitStep2`: al validar el OTP, ejecutar `await window.vaultAuth.autoUnlock(); this.switchView('dashboard');`.
- En `loadAndRenderDocuments`: ante ausencia de `masterKey`, intentar `await window.vaultAuth.autoUnlock()`.

### Fase 3: Service Worker y Pruebas
- Incrementar `CACHE_NAME` a `'boveda-digital-v12'` en `sw.js`.
- Agregar caso de prueba `SDD 010` en `tests/boveda.test.js`.
- Ejecutar `node --test tests/boveda.test.js tests/server.test.js` y verificar 100% de tests en verde.

### Fase 4: Documentación y GitHub
- Actualizar `memory.md` (Sección 2 y Sección 3).
- Commit y push a la rama `main` en GitHub.
