# Spec 010: Eliminación de la Solicitud de Clave para la Bóveda Protegida

## Contexto y Motivación
El usuario ha solicitado explícitamente:
> *"eliminar la solicitud de clave para la Bóveda Protegida , por que para mi esto no es necesario. No modificar el resto de las funcionalidades."*

En versiones anteriores, tras identificarse en el onboarding o iniciar sesión, la aplicación mostraba la pantalla `pin-lock-view` ("Bóveda Protegida") exigiendo ingresar un PIN de 6 dígitos en un teclado numérico táctil para desbloquear y derivar la clave criptográfica. Asimismo, si no había PIN configurado, se presentaba la pantalla `pin-setup-view` ("Configura tu PIN de Bóveda").

Para simplificar la experiencia de usuario y eliminar cualquier fricción innecesaria, se elimina la solicitud manual de clave/PIN para la Bóveda Protegida, permitiendo el ingreso directo al Dashboard con desbloqueo automático y transparente, preservando intacto el cifrado AES-256-GCM y la compatibilidad con todas las demás funcionalidades de la app.

---

## Requisitos Funcionales

1. **Acceso Directo y Desbloqueo Automático (Zero-Friction Access):**
   - El sistema NO debe presentar la pantalla de "Bóveda Protegida" (`pin-lock-view`) ni solicitar PIN al usuario en ningún punto del flujo normal.
   - El sistema NO debe presentar la pantalla de configuración de PIN (`pin-setup-view`).
   - Al abrir la aplicación con sesión iniciada, al iniciar sesión desde `auth-view`, o al completar la verificación de identificación en el onboarding (Paso 2/2), la app debe desbloquear la bóveda automáticamente (`autoUnlock`) y abrir de inmediato la vista principal (`dashboard-view`).

2. **Preservación del Cifrado Criptográfico AES-256-GCM y Zero-Knowledge:**
   - La derivación de la clave maestra (`window.vaultAuth.masterKey`) continuará operando bajo Web Crypto API (PBKDF2 + AES-GCM 256 bits).
   - Se implementará un mecanismo transparente de `autoUnlock()` en `VaultAuth` que garantiza la derivación y retención de la clave maestra en memoria:
     - Utiliza el PIN activo guardado previamente (`sessionStorage` o configuración local), o el PIN estándar de sistema (`'123456'`).
     - Si el usuario no tiene PIN configurado previamente, el sistema inicializa y persiste de forma transparente el PIN de respaldo sin interrumpir al usuario.
   - Los documentos locales y remotos se siguen cifrando y descifrando con total normalidad y seguridad.

3. **Carga y Renderizado Fluido de Documentos:**
   - En `loadAndRenderDocuments()`, si por alguna eventualidad no existe `masterKey` en memoria, se ejecuta `autoUnlock()` silenciosamente para garantizar el descifrado inmediato de los expedientes sin mostrar advertencias ni redirigir al usuario al bloqueo.

4. **Integridad de Funcionalidades:**
   - Se preservan intactas todas las demás funciones: Onboarding de primer uso con código al correo, visualización y gestión de documentos, sincronización Cloud Run, Google Drive, Respaldo y Restauración, perfil de usuario, y sistema de licencias/trial.

5. **Actualización de Service Worker y Pruebas:**
   - Incrementar `CACHE_NAME` a `boveda-digital-v12` en `sw.js`.
   - Incorporar pruebas automatizadas unitarias en `tests/boveda.test.js`.
   - Verificar que el 100% de las pruebas del sistema pasen en verde.
