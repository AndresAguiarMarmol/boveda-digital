# Plan de Implementación — Spec 003: Sistema de Licenciamiento y Seguridad Offline (Trial 7 Días)

## 1. Arquitectura del Módulo de Licencias (`assets/js/license.js`)

Se creará un módulo especializado `VaultLicenseManager` autónomo, compatible tanto con el navegador (Web Crypto API `crypto.subtle` e `IndexedDB` / `localStorage`) como con Node.js para testing (`node:crypto`).

```mermaid
graph TD
    A[Inicio de la App] --> B[Consultar Almacenamiento Local]
    B --> C{¿Existe Device ID?}
    C -->|No| D[Generar Device ID dev_uuid]
    C -->|Sí| E[Obtener Device ID]
    D --> F{¿Existe Licencia Activa?}
    E --> F
    F -->|Sí| G[Validar Firma SHA-256 y Vigencia del Token]
    G -->|Válido| H[Estado: LICENSED - Bóveda Habilitada]
    G -->|Expirado o Corrupto| I{¿Trial Activo?}
    F -->|No| I
    I -->|Date.now() - trial_start < 7 días| J[Estado: TRIAL - Bóveda Habilitada con Contador]
    I -->|Date.now() - trial_start >= 7 días| K[Estado: EXPIRED - Superponer Bloqueo No Eludible]
    K --> L[Mostrar REQ|DeviceID|Correo y WhatsApp]
    L --> M[Usuario ingresa Token de Activación]
    M --> N[Validar Token Offline con crypto.subtle]
    N -->|Firma Correcta| O[Guardar Licencia y Desbloquear Bóveda]
    N -->|Firma Incorrecta| P[Mostrar Error y Mantener Bloqueo]
```

---

## 2. Definición Criptográfica y Estructuras de Datos

### A. Constantes Maestras
- `TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000` (604,800,000 ms = 7 días).
- `LICENSE_SALT = "Halterofilia-SuperSecret-Salt-2026"` (Sal fija especificada en `AGENTS.md`).
- `CONTACT_PHONE = "+56933395447"`.

### B. Claves de Persistencia Local
- `vault_device_id`: Identificador persistente del dispositivo (`dev_<uuid>`).
- `vault_trial_start`: Marca temporal en ms del primer arranque de la app.
- `vault_license_token`: Cadena en Base64 del token de activación ingresado.
- `vault_last_clock_check`: Última marca temporal registrada para detectar retrocesos fraudulentos del reloj del sistema.

### C. Cadena Canónica y Firma SHA-256
$$\text{Signature} = \text{SHA-256}(\text{deviceId} + ":" + \text{email} + ":" + \text{exp} + ":" + \text{"Halterofilia-SuperSecret-Salt-2026"})$$

El token exportado es el Base64 del JSON canónico:
```json
{
  "deviceId": "dev_4b8f3e21a9c847d",
  "email": "andres.pro@boveda.com",
  "exp": 1821820800000,
  "signature": "7a3f8b...64_caracteres_hex..."
}
```

---

## 3. Impacto en Componentes del Proyecto

1. **Nuevo archivo `assets/js/license.js`:**
   - Clase `VaultLicenseManager` y funciones puras (`generarCadenaSolicitud`, `computarFirmaLicencia`, `generarTokenLicencia`, `validarTokenLicencia`).
   - Soporte dual (Browser + Node.js `module.exports`).
2. **Actualización de `index.html`:**
   - Inclusión del script `assets/js/license.js`.
   - Diálogo modal/overlay no eludible `#modal-trial-lock` (bloqueo total al expirar el trial).
   - Modal de activación proactiva `#modal-license-info` (accesible desde el navbar antes de que expire el trial).
   - Badge indicador de estado de trial/licencia en la barra de navegación del dashboard.
3. **Actualización de `assets/js/app.js`:**
   - Invocación de `window.vaultLicense.verificarLicencia()` en `init()`, al desbloquear el PIN y en intervalos regulares.
   - Si la licencia expira, se bloquea la interacción activando `#modal-trial-lock`.
   - Manejadores de eventos `copiarCadenaSolicitud()`, `abrirWhatsAppSoporte()`, `activarConToken()`.
4. **Actualización de `sw.js`:**
   - Añadir `'./assets/js/license.js'` a la lista de recursos precacheados `ASSETS`.
5. **Pruebas unitarias en `tests/boveda.test.js`:**
   - Cobertura completa del ciclo de vida del trial, emisión de tokens, validación con sal maestra, detección de tokens fraudulentos y caducidad.
6. **Actualización obligatoria de `memory.md`:**
   - Registro de arquitectura y decisiones en Secciones 1, 2 y 3.
