# Plan de Implementación — Spec 007: Identificación Obligatoria en Primer Uso y Validación por Código al Correo Electrónico

## Resumen del enfoque
Implementar un flujo de bienvenida e identificación obligatoria para el primer arranque de la app en cualquier dispositivo, combinando:
1. Endpoints en `server.js` para generación, despacho SMTP (con fallback simulado) y verificación de códigos OTP de 6 dígitos.
2. Métodos en `assets/js/license.js` y `assets/js/auth.js` para comprobar el estado de identificación (`isUserIdentifiedAndVerified()`), gestionar códigos de validación y persistir la marca `vault_user_verified`.
3. Diálogo ineludible `#modal-first-run-onboarding` en `index.html` con dos pasos guiados:
   - Paso 1: Llenado de Ficha Completa (Foto opcional, Nombre, Apellidos, Correo, Teléfono).
   - Paso 2: Ingreso de Código Validador de 6 dígitos enviado al correo con opción de reenvío y edición de email.
4. Integración en `assets/js/app.js` (`init()`) para desplegar este diálogo antes de cualquier otra vista cuando la app se abra por primera vez.
5. Actualización de caché en `sw.js` a `v8`.
6. Pruebas automatizadas en `tests/server.test.js` y `tests/boveda.test.js`.

---

## Fases de ejecución

### Fase 1: Backend (`server.js`)
- Añadir estructura de almacenamiento en memoria para códigos de verificación con expiración (15 minutos).
- Implementar cliente SMTP nativo con `node:tls` / `node:net` o transporte directo según variables de entorno (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
- Implementar `POST /api/v1/auth/send-verification-code`:
  - Validar presencia y formato de email.
  - Generar código numérico de 6 dígitos aleatorio seguro.
  - Enviar email con plantilla estilizada de Bóveda Digital o simular si SMTP no está configurado.
- Implementar `POST /api/v1/auth/verify-code`:
  - Validar código y tiempo de expiración.
  - Si es correcto, remover código y retornar confirmación de verificación.

### Fase 2: Módulo Cliente de Licencia y Autenticación (`license.js`, `auth.js`)
- En `VaultLicenseManager` (`assets/js/license.js`):
  - Añadir propiedad y métodos `isUserVerified()`, `markUserVerified(isVerified)`.
  - Persistencia en `localStorage` y `IndexedDB` (`vault_user_verified`).
- En `VaultAuth` (`assets/js/auth.js`):
  - Implementar `sendEmailVerificationCode(email, fullName)`.
  - Implementar `verifyEmailCode(email, code)`.

### Fase 3: Interfaz Gráfica de Onboarding (`index.html`)
- Crear `#modal-first-run-onboarding` con diseño blindado glassmorphism y prevención de cierre.
- Paso 1: Ficha de Identificación del Usuario (Nombre, Apellidos, Correo, Teléfono, Foto, y botón "Continuar y Enviar Código").
- Paso 2: Pantalla de Verificación por Correo (Indicador de email destinatario, input de código de 6 dígitos con formato espaciado, botón "Verificar y Activar Bóveda", botón "Reenviar Código", botón "Cambiar Correo").

### Fase 4: Orquestación en la Aplicación (`app.js`)
- En `init()`:
  - Verificar si `vaultLicense.isUserVerified()` es verdadero.
  - Si no está verificado, bloquear el flujo y abrir `#modal-first-run-onboarding`.
- Métodos del controlador:
  - `handleOnboardingSubmitStep1()`: Valida campos, envía código vía backend y cambia a Paso 2.
  - `handleOnboardingSubmitStep2()`: Valida código, guarda perfil completo, marca verificado, cierra onboarding y pasa a `switchView('pin-setup')`.
  - `handleOnboardingResendCode()`: Reenvía el código al correo actual.
  - `handleOnboardingBackToStep1()`: Permite corregir datos o correo.

### Fase 5: Pruebas, Caché y Memoria
- Actualizar `sw.js` a `boveda-digital-v8`.
- Escribir pruebas unitarias e integración en `tests/boveda.test.js` y `tests/server.test.js`.
- Ejecutar suite de pruebas con `node --test`.
- Actualizar `memory.md` y registrar en Git.
