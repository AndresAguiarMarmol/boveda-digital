# Tareas de Implementación — Spec 007: Identificación Obligatoria en Primer Uso y Validación por Código al Correo Electrónico

- [x] **Tarea 1: Endpoints de Verificación por Email en Backend (`server.js`)**
  - [x] Implementar almacenamiento de códigos OTP temporales con timestamp de expiración (15 minutos).
  - [x] Implementar helper de envío SMTP configurable mediante variables de entorno (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) con fallback seguro si no están presentes.
  - [x] Implementar `POST /api/v1/auth/send-verification-code` con generación de código aleatorio de 6 dígitos y plantilla HTML.
  - [x] Implementar `POST /api/v1/auth/verify-code` con validación estricta y descarte de código tras uso exitoso.

- [x] **Tarea 2: Lógica Cliente en Gestor de Licencias y Autenticación (`license.js`, `auth.js`)**
  - [x] Añadir métodos `isUserVerified()`, `markUserVerified(status)` y sincronización en `VaultLicenseManager`.
  - [x] Añadir métodos `sendEmailVerificationCode(email, fullName)` y `verifyEmailCode(email, code)` en `VaultAuth`.

- [x] **Tarea 3: Componente de UI `#modal-first-run-onboarding` en `index.html`**
  - [x] Diseñar el modal ineludible con backdrop blur, prevención de clic fuera y sin botón de descarte.
  - [x] Diseñar el contenedor Paso 1: Ficha completa (Nombre, Apellidos, Correo, Teléfono, Foto con cámara/galería).
  - [x] Diseñar el contenedor Paso 2: Validación por Correo con input para 6 dígitos, reenvío y retorno a paso 1.

- [x] **Tarea 4: Lógica de Control y Flujo de Primer Uso en `assets/js/app.js`**
  - [x] Integrar verificación obligatoria en `init()`.
  - [x] Implementar `openFirstRunOnboarding()`, `submitOnboardingStep1()`, `submitOnboardingStep2()`, `resendOnboardingCode()` y `backToOnboardingStep1()`.
  - [x] Conectar persistencia de perfil y avance a `pin-setup` tras verificación.

- [x] **Tarea 5: Service Worker v8 y Suite de Pruebas Automatizadas**
  - [x] Actualizar `CACHE_NAME` en `sw.js` a `'boveda-digital-v8'`.
  - [x] Añadir pruebas en `tests/server.test.js` para endpoints de código de verificación.
  - [x] Añadir pruebas en `tests/boveda.test.js` para verificación de usuario en primer uso e interfaz.
  - [x] Validar que 100% de las pruebas pasen con `node --test`.

- [x] **Tarea 6: Actualización de Memoria y Control de Versiones Git**
  - [x] Actualizar `memory.md` en secciones 1, 2 y 3.
  - [x] Registrar cambios en Git y sincronizar con repositorio remoto en GitHub.
