# Plan de Implementación: Spec 011 — Correo Electrónico del Usuario Autenticado en "Licencia y Período de Prueba"

## 1. Archivos y Responsabilidades
- **`index.html` (RF-1):**
  - En `#modal-license-info` ("Licencia y Período de Prueba"): actualizar la etiqueta `<label for="info-user-email-input">` a `Correo Electrónico:` y eliminar el atributo estático `value="su-usuario@dominio.com"` tanto en `#info-user-email-input` como en `#lock-user-email-input`.
- **`assets/js/license.js` (RF-2, RF-3, RF-4):**
  - Añadir función auxiliar `_isPlaceholderEmail(email)` que identifique correos genéricos de plantilla (`su-usuario@dominio.com`, `atleta@halterofilia.com`, `atleta@alterofilia.com`, `usuario@correo.com`, `usuario@boveda.com` y `usuario_*@boveda.com`).
  - Añadir método `getAuthenticatedEmail(explicitEmail = null)` en `VaultLicenseManager` que resuelva de forma determinista el correo del usuario autenticado priorizando:
    1. `explicitEmail` (si es válido y no es placeholder).
    2. `this.userProfile?.email` (correo autenticado/verificado del usuario del dispositivo).
    3. `window.vaultAuth?.currentUser?.email` (correo de la sesión autenticada en `VaultAuth`, si no es placeholder).
    4. `this.userEmail` persistido (si no es placeholder).
    5. Fallback al correo disponible en `window.vaultAuth?.currentUser?.email` o `this.userEmail`.
  - Actualizar `init()` y `getEstadoLicencia(email)` en `VaultLicenseManager` para utilizar `getAuthenticatedEmail(email)` al construir el estado y la `cadenaSolicitud` (`REQ|<DeviceID>|<correo_autenticado>`).
- **`assets/js/auth.js` (RF-2, RF-3):**
  - En `init()`: al restaurar `savedUser`, comprobar si existe un `vault_user_profile` con correo autenticado y sincronizar `savedUser.email` si `savedUser.email` era un correo genérico/placeholder.
  - Añadir método `syncAuthenticatedEmail(email, fullName)` en `VaultAuth` para mantener sincronizado `this.currentUser.email` en memoria y en `IndexedDB` cuando el usuario completa el Onboarding o actualiza su Perfil de Usuario.
- **`assets/js/app.js` (RF-2, RF-3, RF-4):**
  - Añadir método `getAuthenticatedUserEmail()` en `BovedaApp` que delega en `window.vaultLicense.getAuthenticatedEmail()` y `window.vaultAuth?.currentUser?.email`.
  - En `init()` y `renderDashboardHeader()`: usar `getAuthenticatedUserEmail()` para no sobrescribir el correo verificado del perfil con correos genéricos.
  - En `handleOnboardingSubmitStep2()` y `saveUserProfile()`: invocar `window.vaultAuth.syncAuthenticatedEmail(email, fullName)` además de `window.vaultLicense.setUserEmail(email)`.
  - En `openLicenseModal()` y `checkLicenseLock()`: obtener `authenticatedEmail = this.getAuthenticatedUserEmail()`, sincronizarlo en `window.vaultLicense`, asignarlo a `#info-user-email-input` y `#lock-user-email-input`, y actualizar `#info-cadena-solicitud` y `#lock-cadena-solicitud`.
- **`sw.js` (RNF-2):**
  - Incrementar `CACHE_NAME` a `'boveda-digital-v13'`.
- **`tests/boveda.test.js`:**
  - Añadir prueba unitaria e integración `SDD 011` que verifique los requisitos RF-1 a RF-5.

## 2. Algoritmo de Resolución de Correo Autenticado (Pseudocódigo)
```text
FUNCIÓN getAuthenticatedEmail(explicitEmail):
  SI explicitEmail es válido Y NO es placeholder:
    RETORNAR normalizar(explicitEmail)
  SI userProfile.email es válido Y NO es placeholder:
    RETORNAR normalizar(userProfile.email)
  SI vaultAuth.currentUser.email es válido Y NO es placeholder:
    RETORNAR normalizar(vaultAuth.currentUser.email)
  SI this.userEmail es válido Y NO es placeholder:
    RETORNAR normalizar(this.userEmail)
  RETORNAR normalizar(explicitEmail || userProfile.email || vaultAuth.currentUser.email || this.userEmail)
```

## 3. Decisiones Justificadas
- **Sincronización bidireccional entre `VaultLicenseManager` y `VaultAuth`:**
  - *Decisión:* Mantener `vaultAuth.currentUser.email` y `vaultLicense.userEmail` sincronizados tras el Onboarding y la edición de perfil, dando prioridad a correos reales sobre placeholders de sistema.
  - *Alternativa descartada:* Leer únicamente `vaultAuth.currentUser.email`. Se descartó porque cuando el usuario se registra por primera vez en el modal de Onboarding, el correo verificado se guardaba en `vault_user_profile` sin actualizar `vaultAuth.currentUser`, provocando que `currentUser` conservara el valor por defecto y pisara el correo real del usuario.

## 4. Estrategia de Pruebas (`node --test`)
- Crear test `SDD 011: Campo Correo Electrónico con correo del usuario autenticado en Licencia y Período de Prueba` en `tests/boveda.test.js`.
- Verificar que `VaultLicenseManager.getEstadoLicencia()` y `getAuthenticatedEmail()` prioricen el correo autenticado del usuario sobre cualquier placeholder (`su-usuario@dominio.com` / `usuario_*@boveda.com`) y generen `REQ|<DeviceID>|<correo_autenticado>`.
- Verificar que `index.html`, `app.js`, `auth.js` y `sw.js` (`v13`) cumplan todos los criterios.

