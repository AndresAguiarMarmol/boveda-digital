# Tareas: Spec 011 — Correo Electrónico del Usuario Autenticado en "Licencia y Período de Prueba"

- [x] **T1. Añadir prueba automatizada `SDD 011` en `tests/boveda.test.js`.** RF-1, RF-2, RF-3, RF-4, RF-5
  - Hecho cuando: El test `SDD 011` valide la resolución del correo del usuario autenticado en `VaultLicenseManager`, `VaultAuth`, `BovedaApp` e `index.html`.
- [x] **T2. Actualizar etiqueta y campos de correo en `index.html`.** RF-1
  - Hecho cuando: En `#modal-license-info` la etiqueta sea `Correo Electrónico:` y los inputs `#info-user-email-input` y `#lock-user-email-input` no tengan valores genéricos estáticos (`su-usuario@dominio.com`).
- [x] **T3. Implementar `getAuthenticatedEmail()` y prioridad de correo autenticado en `assets/js/license.js` y `assets/js/auth.js`.** RF-2, RF-3, RF-4
  - Hecho cuando: `VaultLicenseManager` y `VaultAuth` sincronicen y prioricen el correo del usuario autenticado/verificado sobre cualquier placeholder.
- [x] **T4. Actualizar `openLicenseModal()`, `checkLicenseLock()`, `init()`, `renderDashboardHeader()`, `saveUserProfile()` y `handleOnboardingSubmitStep2()` en `assets/js/app.js` y subir `sw.js` a `v13`.** RF-2, RF-3, RF-4, RNF-2
  - Hecho cuando: Al abrir "Licencia y Período de Prueba", `#info-user-email-input` y `#info-cadena-solicitud` contengan el correo del usuario autenticado y `node --test` pase al 100% en verde.
- [x] **T5. Actualizar `memory.md` con los cambios de Spec 011.**
  - Hecho cuando: `memory.md` refleje la decisión técnica en la Sección 2 y el registro en el historial de la Sección 3.
