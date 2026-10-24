# memory.md — Memoria del proyecto Bóveda Digital

Registro de todo lo que debe preservarse entre sesiones de trabajo: arquitectura de datos, decisiones técnicas tomadas e historial de cambios.
**Los agentes deben leer este archivo antes de empezar y actualizarlo al terminar cada tarea** (ver `AGENTS.md`).

---

## 1. Estructura de datos y persistencia

### A. Persistencia Local en `IndexedDB` (`BovedaDigitalDB`, versión 1)
- **Almacén `documents` (KeyPath: `id`):**
  - `id`: Identificador único UUID (`doc_xxxxxxxxx`).
  - `user_id`: ID del usuario propietario asociado en el backend.
  - `category`: Categoría funcional (`identidad`, `vehiculos`, `finanzas`, `residencia`, `salud`).
  - `title`: Título legible del documento.
  - `encrypted_payload`: Texto cifrado en Base64 con AES-256-GCM (contiene número de documento, emisor, fechas, notas y adjunto).
  - `iv`: Vector de inicialización de 12 bytes en Base64.
  - `checksum`: Hash SHA-256 de integridad criptográfica.
  - `expiry_date`: Fecha ISO de vencimiento (para consultas rápidas de alertas).
  - `is_synced`: Booleano de estado de sincronización con la nube.
  - `created_at` / `updated_at`: Marcas temporales ISO 8601.

- **Almacén `settings` (KeyPath: `key`):**
  - `currentUser`: Perfil del usuario autenticado con datos de licencia y suscripción.
  - `accessToken` / `refreshToken`: Tokens JWT emitidos por el backend.
  - `userSalt`: Salt criptográfico único para derivar la clave maestra local.
  - `vaultPinHash_<email>`: Hash SHA-256 del PIN + Salt para validación de desbloqueo.
  - `customDrawers_<userId>`: Diccionario de gavetas personalizadas creadas por el usuario (`label`, `subtitle`, `color`, `icon`, `isCustom`, `drawerNumber`).
  - `gdrive_client_id` / `gdrive_last_backup`: Configuración y marca temporal del último respaldo cifrado en Google Drive.
  - `gdrive_token` / `gdrive_token_expiry`: Token de acceso efímero para operaciones con la Google Drive API (scope `drive.file`).
  - `gdrive_auto_sync`: Booleano de activación de la sincronización automática en segundo plano (debounced 1.5s).
  - `vault_device_id`: Identificador persistente y único del dispositivo (`dev_<uuid>`).
  - `vault_user_email`: Usuario o correo asociado a la licencia, generado automáticamente (`usuario_<shortId>@boveda.com`) o ingresado interactivamente por el usuario, con persistencia dual (`IndexedDB` + `localStorage`).
  - `vault_trial_start`: Marca temporal en ms del primer arranque de la app para computar los 7 días de prueba.
  - `vault_license_token`: Token de activación Base64 verificado criptográficamente con `"Halterofilia-SuperSecret-Salt-2026"`.
  - `vault_license_data`: Metadatos de la licencia activa (`deviceId`, `email`, `exp`, `isPerpetual`).

- **Almacén `audit_log` (KeyPath: `id` auto-incremental):**
  - Registro de eventos (`LOGIN_SUCCESS`, `VAULT_UNLOCKED`, `DOC_CREATED`, `DOC_VIEWED`, `DOC_DELETED`, etc.).

### B. Estructura del Token JWT y Claims de Suscripción
Compatible con el backend centralizado de la app de Halterofilia:
```json
{
  "sub": "usr_9b1deb4d-3b7d",
  "email": "usuario@ejemplo.com",
  "apps": ["halterofilia", "boveda_digital"],
  "crypto_salt": "ae8713595fed1e759db1062454187513",
  "subscription": {
    "plan": "free" | "pro",
    "status": "active",
    "max_docs": 5,
    "cloud_sync_enabled": false
  }
}
```

### C. Persistencia en Servidor / Cloud (`server.js`, `data/vault_cloud.json`)
- **Almacenamiento persistente en disco/cloud:**
  - `users`: Directorio de usuarios registrados con hash SHA-256 de contraseña, perfil de suscripción y `cryptoSalt` unificado para derivación de claves simétricas en clientes móviles y de escritorio.
  - `documents`: Mapa persistente por `user_id` con registros cifrados Zero-Knowledge (`encrypted_payload`, `iv`, `checksum`, `category`, `title`, `expiry_date`, `created_at`, `updated_at`).
  - `shares`: Registro de tokens de acceso efímeros compartidos.

---

## 2. Decisiones vigentes

- **Cifrado Zero-Knowledge y Web Crypto API:** El backend centralizado nunca recibe las claves maestras ni los documentos en texto claro. La clave simétrica de 256 bits se deriva exclusivamente en el cliente mediante PBKDF2 (100,000 iteraciones, SHA-256) a partir del PIN maestro del usuario y un salt criptográfico.
- **Preservación y Portabilidad del Salt Criptográfico en Respaldos (`crypto_salt`):** Para garantizar que un respaldo JSON exportado en un dispositivo (PC) pueda ser importado y descifrado de forma transparente en otro dispositivo (teléfono celular), el archivo de respaldo exporta de manera pública y estandarizada el `crypto_salt` y el `pin_hash` de verificación. El módulo de descifrado en cliente implementa recuperación multi-salt automática que prueba claves secundarias/históricas con el PIN en memoria y re-cifra transparentemente los expedientes descifrados con la clave maestra activa actual.
- **Asistente Interactivo de PIN de Respaldo y Re-Cifrado en Caliente:** Cuando un respaldo proviene de otro dispositivo protegido con un PIN maestro diferente o cuando no se pueden descifrar los expedientes de inmediato, el sistema despliega el diálogo accesible `#modal-backup-pin-prompt`. Al ingresar el PIN original del respaldo, el cliente prueba las sales candidatas, descifra los expedientes legítimos, los re-cifra inmediatamente con la clave maestra activa del dispositivo receptor y los guarda en `IndexedDB`, garantizando Zero-Knowledge absoluto y acceso instantáneo sin reiniciar la bóveda.
- **Aislamiento de Entorno de Pruebas y Sanitización de Payloads:** Las pruebas automatizadas operan con `process.env.NO_DISK_PERSIST = 'true'`, evitando la contaminación de `data/vault_cloud.json`. Todos los métodos de importación, sincronización y serialización utilizan `esPayloadCifradoValido(doc)` para descartar registros corruptos o placeholders de tests, preservando exclusivamente documentos con payloads AES-256-GCM auténticos.
- **Sistema de Licenciamiento y Seguridad Offline (Spec 003 / AGENTS.md 4.1):**
  - *Período de Prueba (Trial):* 7 días continuos (`TRIAL_DAYS = 7`, `604,800,000 ms`) desde la primera apertura del dispositivo.
  - *Device ID Único y Usuario Asociado:* Generados de forma persistente (`dev_<uuid>` y `usuario_<shortId>@boveda.com` o correo ingresado) y resguardados con persistencia dual (`IndexedDB` + `localStorage`).
  - *Cadena de Solicitud Interactiva:* `REQ|<DeviceID>|<usuario>` con edición y sincronización reactiva en tiempo real en los modales `#modal-trial-lock` y `#modal-license-info`, copiado en 1 toque y enlace directo a WhatsApp `+56933395447`.
  - *Token de Activación:* Cadena Base64 con payload estructurado `{ deviceId, email, exp, signature }`.
  - *Firma Criptográfica SHA-256:* Computada de forma canónica sobre `${deviceId}:${email}:${exp}:${salt}` con sal fija `"Halterofilia-SuperSecret-Salt-2026"`, validable 100% offline mediante Web Crypto API (`crypto.subtle`).
  - *Bloqueo Estricto No Eludible:* Al expirar los 7 días sin licencia activa, el overlay `#modal-trial-lock` bloquea la interacción con la aplicación impidiendo eludir la pantalla hasta ingresar un token válido.
- **Service Worker v3 con Estrategia Network-First para Código Local:** `sw.js` opera bajo `CACHE_NAME = 'boveda-digital-v3'`, incorporando `license.js` a los recursos esenciales precacheados.
- **Acceso 100% Offline:** Toda la información cifrada reside en `IndexedDB`, permitiendo consultar y crear documentos sin conexión a internet.
- **Sincronización Cloud Bidireccional y Despliegue en Google Cloud Run:** La aplicación cuenta con sincronización bidireccional automática y manual (`batch-sync`, descarga remota y eliminación sincronizada `DELETE /api/v1/documents/:id`). Detecta automáticamente el origen del servidor, actualiza el indicador de estado en la UI (🟢 Sincronizado, 🟡 Sincronizando, ⚪ Offline) y se distribuye con `Dockerfile` nativo optimizado para despliegue en Google Cloud Run.
- **Compatibilidad con Backend Existente (Halterofilia):** Utiliza autenticación REST sobre HTTPS con tokens JWT / OAuth2, refresh tokens rotativos y sesiones administradas en servidor.
- **Modelo de Licenciamiento de Planes:**
  - *Plan Gratuito:* Limitado a un máximo de 5 documentos y almacenamiento local.
  - *Plan PRO:* Almacenamiento ilimitado, alertas de vencimiento, copias de seguridad cifradas en la nube y exportación avanzada.
- **Metáfora Visual de Mueble Gavetero (Filing Cabinet) Cromático y Extensible:** La organización de documentos se estructura en un archivador blindado donde cada gaveta cuenta con una identidad cromática única (LED, reflejo de tirador, bordes, riel y credencial visual). El sistema incluye 5 gavetas base (`identidad` Cyan, `vehiculos` Esmeralda, `finanzas` Ámbar, `residencia` Púrpura, `salud` Rosa) y permite al usuario crear gavetas personalizadas con nuevos conceptos, selector de color HSL/Hex y selector de iconos Lucide, con persistencia offline en `IndexedDB`. Los documentos cuentan con soporte completo de ciclo de vida: lectura descifrada, impresión limpia (`window.print()`), modificación con re-cifrado AES-256-GCM y eliminación.
- **Arranque a 1 Toque (PWA) y Soporte Multiplataforma:** La aplicación implementa arquitectura Progressive Web App (`manifest.json`, `sw.js` y meta tags de pantalla completa standalone). En dispositivos móviles (Android/iOS) se instala como app nativa en la pantalla de inicio abriendo al instante sin barras de navegador. En escritorios Windows cuenta con lanzador batch de 1 toque (`iniciar.bat`) que orquesta el servidor local y el navegador.
- **Sincronización y Respaldo Cifrado con Google Drive (Zero-Knowledge):** Los respaldos destinados a Google Drive exportan el paquete criptográfico estandarizado (`boveda_backup.json` con payloads AES-256-GCM, IVs, checksums SHA-256 y salt criptográfico). Google Drive almacena exclusivamente el archivo blob cifrado bajo el scope restringido `drive.file` / `drive.appdata`, garantizando que ni Google ni terceros pueden acceder a los datos sin el PIN maestro derivado por el usuario. La aplicación cuenta con sincronización automática continua en segundo plano (con debounce de 1.5s y refresco silencioso de token GIS) que se activa automáticamente al desbloquear la bóveda, crear, modificar o eliminar expedientes y gavetas personalizadas, configurable mediante un interruptor interactivo en la interfaz.
- **Compatibilidad y Despliegue en GitHub Pages:** Toda la aplicación opera con rutas relativas (`./`), soporte de PWA en subdirectorios (`manifest.json`, `sw.js`), bypass de Jekyll (`.nojekyll`) y contingencia offline 100% autónoma en `IndexedDB` con sincronización Zero-Knowledge en Google Drive, permitiendo desplegarse de forma transparente y gratuita en GitHub Pages (`https://andresaguiarmarmol.github.io/boveda-digital/`) sin necesidad obligatoria de servidor Node.js backend.

---

## 3. Historial de cambios

### 2026-10-24 — Spec 003: Robustecimiento de Firma Criptográfica, Emisor Administrativo y Normalización Canónica
- **Causa Raíz del Error de Firma Inválida:**
  - Los teclados de dispositivos móviles suelen aplicar auto-capitalización al Device ID (ej. `Dev_...` en lugar de `dev_...`), o bien al copiar desde consolas y chats de mensajería se introducen comillas envolventes (`"..."`), saltos de línea o discrepancias de minúsculas que rompían la verificación de hash SHA-256.
  - Ausencia de una utilidad administrativa para convertir directamente la cadena `REQ|<DeviceID>|<correo>` en un token Base64 auténtico, forzando manipulaciones manuales del payload que invalidaban la firma.
- **Normalización Criptográfica Canónica (`assets/js/license.js`):**
  - Insensibilidad estricta a mayúsculas/minúsculas en `deviceId` y `email` en `computarFirmaLicencia`, `generarTokenLicencia` y `validarTokenLicencia`.
  - Tratamiento canónico de `exp` convirtiendo siempre a cadena recortada sin importar si es número o string.
  - Limpieza automática de comillas envolventes (`"` o `'`), espacios en blanco y caracteres de salto de línea en `cleanToken`.
  - Implementada `generarTokenDesdeCadenaSolicitud(cadenaSolicitud, diasValidez)`.
- **Herramientas de Emisión Administrativa (CLI y UI):**
  - Creado script ejecutable de consola [scripts/generar-token.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/scripts/generar-token.js) para generar tokens oficiales con 1 solo comando.
  - Añadido el panel interactivo *"Generador de Tokens de Activación (Administrador)"* en `#modal-license-info` de [index.html](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html) con soporte para pegar la cadena `REQ|...`, seleccionar vigencia y copiar o aplicar el token con 1 clic.
- **Suite de Pruebas Unitarias:** 45/45 pruebas pasando al 100% en verde con `node --test tests/boveda.test.js tests/server.test.js`.

### 2026-10-24 — Spec 003: Generación Automática de Usuario e Inclusión Reactiva en la Cadena de Solicitud de Licencia
- **Generación y Persistencia Dual del Usuario (`assets/js/license.js`):**
  - Implementada la generación automática de un usuario asociado legible (`usuario_<shortId>@boveda.com`) si el dispositivo no posee sesión activa ni registro previo, persistido dualmente en `IndexedDB` y `localStorage` (`vault_user_email`).
  - Añadido el método `setUserEmail(email)` que sincroniza y valida el usuario activo ante cambios de sesión o edición en caliente.
  - `generarCadenaSolicitud(deviceId, email)` ahora toma de forma transparente el usuario generado/guardado si no se proporciona explícitamente.
- **Interfaz Interactiva y Sincronización en Tiempo Real (`index.html`, `assets/js/app.js`):**
  - En `#modal-trial-lock` y `#modal-license-info`: reemplazado el campo estático por inputs interactivos editables (`#lock-user-email-input`, `#info-user-email-input`).
  - Implementado `handleLicenseEmailChange(origin, value)`: al modificar el usuario o correo en pantalla, la Cadena de Solicitud (`REQ|<DeviceID>|<usuario>`), el botón de copiado y el enlace directo de WhatsApp se actualizan reactivamente al instante.
  - Sincronización automática de `setUserEmail` al iniciar sesión en `auth.js` (online y offline).
- **Suite de Pruebas Unitarias:** 44/44 pruebas pasando 100% en verde con `node --test tests/boveda.test.js tests/server.test.js`.

### 2026-10-24 — Spec 003: Sistema de Licenciamiento y Seguridad Offline (Trial 7 Días y Activación Criptográfica SHA-256)
- **Implementación del Módulo Criptográfico de Licencias (`assets/js/license.js`):**
  - Implementadas funciones puras `generarCadenaSolicitud(deviceId, email)`, `computarFirmaLicencia(deviceId, email, exp, salt)`, `generarTokenLicencia(...)` y `validarTokenLicencia(...)`.
  - Implementada la clase `VaultLicenseManager` con persistencia dual (`IndexedDB` + `localStorage`) para resguardar el `Device ID`, la fecha de inicio del trial y los tokens activados ante limpiezas de caché.
  - Firma canónica basada en SHA-256 con sal fija `"Halterofilia-SuperSecret-Salt-2026"`, 100% verificable sin internet.
- **Componentes Visuales y Bloqueo No Eludible (`index.html`, `assets/js/app.js`):**
  - Diseñado el diálogo `#modal-trial-lock` no eludible (evita escape y clics externos) que se dispara automáticamente cuando `(Date.now() - trial_start) >= 7 días` sin activación.
  - Exhibición destacada del contacto `+56933395447` y la cadena `REQ|<DeviceID>|<correo>` con enlace dinámico hacia WhatsApp.
  - Añadido diálogo informativo y de activación proactiva `#modal-license-info`.
  - Incorporado badge interactivo `#badge-license-status` en el navbar del Dashboard que muestra los días de prueba restantes o el estado activo de la licencia.
- **Actualización de Service Worker (`sw.js`):**
  - Añadido `license.js` a los assets y actualizado `CACHE_NAME` a `'boveda-digital-v3'`.
- **Suite de Pruebas Unitarias Automatizadas:**
  - 43 de 43 pruebas pasando 100% en verde con `node --test tests/boveda.test.js tests/server.test.js`.

### 2026-10-24 — Spec 002: Solución Integral de Restauración Multi-Dispositivo (PC ↔ Celular), Asistente de PIN de Respaldo y Service Worker v2
- **Causa Raíz Identificada y Resuelta:**
  - El mensaje *"Recuperación exitosa: 28 expedientes"* se debía a que `tests/server.test.js` no aislaba la persistencia en disco, inyectando 24 registros de prueba dummy (`'U2FsdGVkX1+payload...'`) en `data/vault_cloud.json` que se exportaban en los respaldos.
  - El teléfono celular no mostraba los documentos porque los 5 documentos legítimos fueron cifrados con salt `'226000658459336d4184642799fc8498'`, mientras que `sw.js` en el celular mantenía la versión `v1` en caché (Cache-First) sin el código de descifrado multi-salt y sin asistente para ingresar el PIN de origen.
- **Aislamiento y Depuración de Datos (`tests/server.test.js`, `data/vault_cloud.json`, `server.js`):**
  - Configurado `process.env.NO_DISK_PERSIST = 'true'` en `tests/server.test.js` para evitar contaminación en ejecuciones de pruebas.
  - Depurado `data/vault_cloud.json` eliminando los 24 registros espurios y preservando intactos los 5 expedientes reales del usuario `usr_pro_001` con el salt efectivo `'226000658459336d4184642799fc8498'`.
- **Sanitización Robusta de Payloads (`assets/js/storage.js`):**
  - Implementada función `esPayloadCifradoValido(doc)` para descartar strings dummy o corruptos en `serializarBackupBoveda`, `importBackupData`, `fusionarDocumentosBackup` y `mergeCloudDocuments`.
  - Exportación de la sal efectiva real en `exportBackupData`.
- **Persistencia de PIN de Sesión (`assets/js/auth.js`):**
  - Almacenamiento temporal en `sessionStorage` (`_vault_session_pin`) durante `setupPin`, `unlockWithPin` y `unlockWithBiometrics`. Recuperación en `init()` para tolerar recargas en navegadores móviles, y purga inmediata en `lockVault()` y `logout()`.
- **Asistente Interactivo de PIN de Respaldo (`index.html`, `assets/js/app.js`):**
  - Añadido modal accesible `#modal-backup-pin-prompt` con teclado numérico, estilo glassmorphism y botón de descifrado.
  - Implementados métodos `openBackupPinPrompt()`, `cancelBackupPinUnlock()` y `submitBackupPinUnlock()` en `BovedaApp`. Si un respaldo importado no puede descifrarse de inmediato, el asistente solicita el PIN del respaldo, prueba las sales candidatas, descifra los expedientes reales, los re-cifra en caliente con la clave activa del celular y los guarda en `IndexedDB`.
- **Renovación del Service Worker a v2 (`sw.js`):**
  - Actualizado `CACHE_NAME` a `'boveda-digital-v2'` para invalidar la caché vieja en celulares.
  - Implementada estrategia *Network-First* con fallback a Cache para scripts y recursos del mismo origen, asegurando que los dispositivos móviles siempre reciban las últimas versiones.
- **Suite de Pruebas Automatizadas:** 38/38 tests pasando 100% en verde (`node --test tests/boveda.test.js tests/server.test.js`).
- **Preservación de Salt en Archivos de Respaldo (`storage.js`, `app.js`, `gdrive.js`):**
  - Incorporado `crypto_salt` y `pin_hash` dentro de la cabecera del JSON generado por `serializarBackupBoveda()` y `exportBackupData()`.
  - Permite a cualquier dispositivo receptor (como teléfonos celulares) conocer el salt con el que fueron cifrados los expedientes para derivar la misma clave maestra simétrica a partir del PIN.
- **Recuperación Multi-Salt y Auto-Reencriptación en Cliente (`app.js`):**
  - Implementada en `loadAndRenderDocuments()` una rutina de descifrado resiliente con sales históricas cuando la clave principal falla.
  - Al descifrar exitosamente con una sal histórica o secundaria, el sistema re-cifra el expediente automáticamente con la clave activa del dispositivo y lo actualiza en `IndexedDB`, unificando la bóveda en reposo.
  - Alertas transparentes en la UI en caso de expedientes que requieran verificar el PIN maestro.
- **Persistencia de Salt en Backend y Compatibilidad Multi-Dispositivo (`server.js`, `auth.js`):**
  - `server.js` emite y almacena el `crypto_salt` unificado del usuario en el token JWT y respuesta de login/registro.
  - `auth.js` persiste `userSalt_${email}` localmente en modo online y retiene `lastEnteredPin` en memoria volátil de sesión para migraciones automáticas sin fricción.
- **Corrección de Conteo en Google Drive (`gdrive.js`):**
  - Ajustado `mergedCount` al total de documentos recuperados.
- **Suite de Pruebas Automatizadas:** 36/36 tests pasando en verde (`node --test tests/boveda.test.js tests/server.test.js`).

### 2026-10-21 — Compatibilidad Completa con GitHub Pages y PWA en Subrutas
- **Rutas Relativas y Caché de PWA (`manifest.json`, `sw.js`, `index.html`):**
  - Ajustados enlaces de manifiesto (`./manifest.json`), `start_url` (`./index.html`) y `scope` (`./`) para operar transparentemente en subdirectorios de GitHub Pages (`/boveda-digital/`).
  - Cacheo resiliente en `sw.js` con rutas relativas a la raíz del scope e inclusión de `gdrive.js`.
  - Corrección de enlaces seguros compartidos en `app.js` conservando la ruta completa del repositorio.
- **Configuración de Despliegue Estático (`.nojekyll`, `.gitignore`):**
  - Incorporado `.nojekyll` para evitar el filtrado del motor Jekyll de GitHub Pages.
  - Creado `.gitignore` para excluir datos locales pesados de pruebas (`data/*.json`, `*.lnk`).
- **Documentación de Orígenes OAuth 2.0 (`docs/google-drive-setup.md`):**
  - Especificado el origen autorizado `https://andresaguiarmarmol.github.io` para Google Drive en despliegues sobre GitHub Pages.

### 2026-10-20 — Sincronización Automática con Google Drive y Guía de Configuración OAuth 2.0
- **Sincronización Automática Continua (`assets/js/gdrive.js`):**
  - Incorporados `autoSyncEnabled` (persistido en IndexedDB como `gdrive_auto_sync`), `setAutoSync()` y `triggerAutoSync(userId, reason)`.
  - Mecanismo de debounce de 1.5s para empaquetar operaciones continuas sin saturar la cuota de la API de Google Drive.
  - Soporte de re-autenticación silenciosa (`{ prompt: '' }`) en tokens expirados cuando la sesión OAuth ya fue autorizada.
- **Integración Reactiva en el Ciclo de Vida (`assets/js/app.js`):**
  - Invocación de `triggerAutoSync()` en los eventos de desbloqueo de bóveda (`submitPinUnlock`), creación de documentos (`handleSaveNewDocument`), edición y re-cifrado (`saveDocumentEdit`), eliminación (`handleDeleteSelectedDocument`) y creación/borrado de gavetas personalizadas.
  - Actualización dinámica de estados en UI (`syncing`, `synced`, `error`) con animación de pulso y LED reactivo en la barra superior.
- **Control de Usuario en la Interfaz (`index.html`):**
  - Añadido interruptor interactivo `#toggle-gdrive-autosync` en el diálogo `#modal-gdrive-sync` para activar/desactivar la auto-sincronización con un solo toque.
- **Guía de Configuración Paso a Paso (`docs/google-drive-setup.md`):**
  - Creado manual detallado para configurar el proyecto en Google Cloud Console, habilitar la Drive API, definir el scope `drive.file` y crear el Client ID para la Web.
- **Suite de Pruebas Automatizadas:** 35/35 tests pasando en verde (`node --test tests/boveda.test.js tests/server.test.js`).

### 2026-10-19 — Implementación Integral: Arranque a 1 Toque (PWA) y Sincronización Zero-Knowledge con Google Drive
- **Módulo Criptográfico de Google Drive (`assets/js/gdrive.js`):**
  - Implementada la clase `VaultGoogleDrive` con soporte para Google Identity Services (GIS) OAuth 2.0 y scope restringido `https://www.googleapis.com/auth/drive.file`.
  - Soporte de subida multipart `POST /upload/drive/v3/files` y actualización `PATCH` del archivo `boveda_digital_backup.json`.
  - Soporte de descarga directa y fusión segura mediante `window.vaultStorage.importBackupData()`.
  - Modo sandbox / demostración offline para pruebas sin requerir configuración previa en Google Cloud Console.
- **Interfaz Gráfica y Modales de Google Drive (`index.html`, `app.js`):**
  - Botón `#btn-gdrive-sync` en el Navbar del Dashboard con icono de disco duro y LED reactivo de estado (🟢 Conectado, ⚪ Desconectado).
  - Diálogo interactivo `#modal-gdrive-sync` con información de estado, marca temporal de último respaldo, acciones de conectar/desconectar, subida/descarga en 1 toque y configuración de Client ID personalizado.
- **Arranque a 1 Toque y PWA Instalable (`manifest.json`, `sw.js`, `index.html`, `iniciar.bat`):**
  - Botón reactivo `#btn-pwa-install` en la barra superior que intercepta `beforeinstallprompt` para permitir instalación en 1 solo clic.
  - Iconos de alta resolución generados en `assets/img/icon-192.png`, `assets/img/icon-512.png` y vectorial `assets/img/icon.svg`.
  - Service worker `sw.js` con soporte offline Stale-While-Revalidate y sincronización en segundo plano (`cloud-sync`).
  - Script lanzador para Windows [iniciar.bat](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/iniciar.bat).
- **Suite de Pruebas Automatizadas:** 35/35 tests pasando en verde (`node --test tests/boveda.test.js tests/server.test.js`).

### 2026-10-19 — Sincronización en la Nube / Google Cloud y Persistencia Server (Cloud Run Ready)
- **Persistencia en Disco del Servidor (`server.js`):** Implementada persistencia automática en `data/vault_cloud.json` (`loadDB` / `saveDB`) para mantener cuentas de usuario, expedientes cifrados y enlaces compartidos entre reinicios o despliegues del servidor.
- **Endpoint de Eliminación Cloud (`server.js`):** Añadido `DELETE /api/v1/documents/:id` protegido por JWT para propagar borrados de expedientes en la nube.
- **Compatibilidad Dual de Tokens JWT (`server.js`, `auth.js`):** Soporte simultáneo para claims `accessToken` (camelCase) y `access_token` (snake_case).
- **Servicio de Sincronización Bidireccional en Cliente (`storage.js`, `app.js`):**
  - Métodos `markDocumentSynced` y `mergeCloudDocuments` en `VaultStorage`.
  - Método `syncWithCloud` y `updateCloudSyncUI` en `BovedaApp`, disparado automáticamente al desbloquear la bóveda, crear, modificar o eliminar expedientes, y con botón manual en la barra de navegación.
- **Componentes Visuales de Nube en la Interfaz (`index.html`):**
  - Botón `#btn-cloud-sync` con LED indicador de estado dinámico (🟢 Conectada, 🟡 Sincronizando, ⚪ Modo Offline).
  - Badge `#cloud-status-text` en la barra superior de métricas del dashboard.
- **Configuración de Despliegue en Google Cloud (`Dockerfile`, `.dockerignore`, `docs/google-cloud-deployment.md`):** Contenedor ultraligero Node 20 Alpine y documentación paso a paso para despliegue serverless con `gcloud run deploy`.
- **Suite de Pruebas Unitarias Automatizadas:** 33/33 tests pasando en verde (`node --test tests/boveda.test.js tests/server.test.js`).

### 2026-10-18 — Corrección de Error en Recuperación de Respaldo (`storage.js`, `boveda.test.js`)
- **Corrección de llamada en `importBackupData` (`storage.js`):** Se corrigió la invocación `this.saveSetting` a `this.setSetting` al fusionar gavetas personalizadas (`customDrawers`) durante la restauración de un respaldo.
- **Alias de Compatibilidad (`storage.js`):** Se incorporó el método `saveSetting(key, value)` en la clase `VaultStorage` como alias transparente de `setSetting(key, value)` para garantizar retrocompatibilidad e invulnerabilidad ante llamadas con cualquier convención de nombre.
- **Suite de Pruebas Unitarias:** Se añadió prueba automatizada en `tests/boveda.test.js` validando la existencia de `saveSetting` y la correcta importación y persistencia de gavetas personalizadas al restaurar respaldos (29/29 tests pasando en verde).

### 2026-10-18 — Implementación Completa: Header/Footer Estáticos, Respaldo/Recuperación y Cinemática de Gavetas (Spec 001)
- **Header y Footer Estáticos Anclados (`index.html`, `vault.css`):**
  - Header anclado al top con texto exacto `"Boveda Digital "` (`fixed top-0`, `z-40`, glassmorphism).
  - Footer anclado a la base con texto exacto `"Análisis/Diseño de Andres Aguiar V 1.0 Santiago de Chile octubre 2026 - Contacto +56933395447 - Whatsapp +56933395447"`.
  - Resguardo de scroll vertical en el body (`pt-8 pb-10`) y exclusión en reglas de impresión `@media print`.
- **Motor de Respaldo y Recuperación Zero-Knowledge (`storage.js`, `app.js`):**
  - Botones "Respaldar" y "Recuperar" en el Navbar del Dashboard.
  - Exportación en archivo JSON `boveda-backup-YYYY-MM-DD.json` con todos los payloads cifrados AES-256-GCM, IVs, checksums y gavetas personalizadas.
  - Validación estricta de estructura e importación con estrategia Merge no destructiva en `IndexedDB`.
- **Cinemática Física 3D de Apertura y Cierre de Gavetas (`vault.css`, `app.js`):**
  - Simulación física de extracción con perspectiva 3D (`transform: translateY(-4px) scale(1.008)`), micro-interacción en tirador metálico activo (`scale(0.94)`) y deslizamiento cinemático sobre el riel interior con curvas elásticas `cubic-bezier`.
  - Soporte de accesibilidad para `prefers-reduced-motion`.
- **Suite de Pruebas Automatizadas:** 28/28 tests pasando en verde con `node --test tests/boveda.test.js tests/server.test.js`.

### 2026-10-17 — Implementación del Servidor HTTP y API REST Backend (Node.js Nativo)
- **Servidor HTTP y API REST (`server.js`):** Creado servidor nativo Node.js sin dependencias externas (`node:http`, `node:crypto`, `node:fs`) que sirve tanto la SPA de Bóveda Digital como la API REST completa compatible con el ecosistema de Halterofilia.
- **Endpoints Implementados:**
  - `POST /api/v1/auth/login`: Autenticación con verificación de hash SHA-256 y emisión de tokens JWT firmados (HMAC-SHA256).
  - `POST /api/v1/auth/register`: Registro de nuevos usuarios con asignación automática de plan Free.
  - `POST /api/v1/auth/refresh`: Renovación rotativa de tokens de acceso JWT.
  - `GET /api/v1/auth/me`: Inspección del perfil del usuario y claims de aplicaciones (`halterofilia`, `boveda_digital`).
  - `GET /api/v1/subscription/status`: Validación del plan activo y límite de documentos.
  - `POST /api/v1/subscription/checkout`: Simulación de upgrade a suscripción PRO.
  - `GET /api/v1/documents`: Listado de metadatos cifrados en nube.
  - `POST /api/v1/documents`: Subida y validación estricta de cuota de documentos en servidor (Free: máx 5, Pro: ilimitado).
  - `POST /api/v1/documents/batch-sync`: Sincronización en lote Zero-Knowledge (sólo payloads cifrados, IVs y checksums).
  - `POST /api/v1/share/create` y `GET /api/v1/share/:token`: Generación y consulta pública de enlaces temporales seguros.
  - `GET /api/health`: Endpoint de estado y comprobación de compatibilidad.
- **Suite de Pruebas Automatizadas:** 23/23 tests pasando en verde con `node --test tests/boveda.test.js tests/server.test.js`.
- **Limpieza de Archivos Legacy:** Eliminados archivos obsoletos del proyecto anterior (`custom.css`, `data.js`, `i18n.js`, `main.js`, `search.js` y sus tests asociados).

### 2026-10-17 — Gavetas con Colores Diferenciados y Creación de Nuevas Gavetas Personalizadas (SDD Spec 001)
- **Documentación SDD Completa:** Generadas especificación formal [specs/001-gavetas-personalizadas/spec.md](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/specs/001-gavetas-personalizadas/spec.md) con requisitos en formato EARS, plan de implementación [specs/001-gavetas-personalizadas/plan.md](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/specs/001-gavetas-personalizadas/plan.md) y desglose de tareas [specs/001-gavetas-personalizadas/tasks.md](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/specs/001-gavetas-personalizadas/tasks.md).
- **Código Cromático por Gaveta:** Asignado un color y resplandor único a cada gaveta en [assets/css/vault.css](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/css/vault.css) mediante la variable CSS `--drawer-color` (Cyan `#06b6d4`, Esmeralda `#10b981`, Ámbar `#f59e0b`, Púrpura `#8b5cf6`, Rosa `#ec4899`), proyectada dinámicamente en los diodos LED, reflejo del tirador de acero, bordes de apertura activa, acento de carpeta y badge de expedientes.
- **Modal y Creación de Gavetas Personalizadas:**
  - Añadido botón *"Nueva Gaveta"* en la barra de control del archivador de [index.html](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html).
  - Implementado el diálogo interactivo `#modal-new-drawer` con inputs para nombre del concepto, subtítulo descriptivo, paleta de 10 colores vibrantes y selector visual de 10 iconos Lucide (`briefcase`, `graduation-cap`, `gem`, `landmark`, `key`, etc.).
  - Persistencia offline en el almacén `settings` de `IndexedDB` bajo la clave `customDrawers_<userId>`.
  - Actualización reactiva de los menús desplegables de categorías al añadir o editar documentos (`#new-doc-category-select` y `#edit-category`).
- **Eliminación Segura de Gavetas:** Botón de descarte para gavetas personalizadas, validando que no contengan documentos activos antes de permitir el borrado.
- **Credencial Digital Dinámica:** Soporte de fondos degradados y bordes con el color de la gaveta personalizada en [assets/js/app.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js).
- **Pruebas Unitarias:** 14/14 tests pasando en verde en [tests/boveda.test.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/boveda.test.js).

### 2026-10-17 — Visualización Completa del Documento al Seleccionarlo (Credencial Digital y Descifrado Inline)
- Implementada la visualización del documento al seleccionarlo desde cualquier gaveta del archivador en [assets/js/app.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js), [index.html](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html) y [assets/css/vault.css](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/css/vault.css).
- Diseñada la **Credencial Digital de Alta Seguridad** (`.credential-card`) con paleta técnica diferenciada por gaveta (`theme-identidad`, `theme-vehiculos`, `theme-finanzas`, `theme-residencia`, `theme-salud`), microchip EMV dorado, franja de seguridad holográfica, avatar biométrico verificado, número grabado en relieve y banda OCR / MRZ (Machine Readable Zone).
- Implementado el **descifrado en memoria y renderizado inline** de expedientes adjuntos:
  - Imágenes vectoriales y mapas de bits (`image/*`): marco interactivo con zoom a pantalla completa y descarga directa.
  - Documentos PDF (`application/pdf`): visor embebido con controles nativos y apertura en nueva pestaña.
  - Gestión de memoria con revocación automática de URLs temporales (`URL.revokeObjectURL`) al cerrar el diálogo o cambiar de expediente.
- Incorporado el sembrado automático (`_seedInitialDemoDocuments`) con 3 documentos y escaneos vectoriales enriquecidos para que la bóveda siempre cuente con expedientes listos para consultar y probar desde el primer desbloqueo.
- Añadidas pruebas unitarias en [tests/boveda.test.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/boveda.test.js) con 10/10 tests pasando en verde.

### 2026-10-17 — Flujo y Botón de Reseteo de PIN Maestro
- Implementado el método `resetPin()` en [assets/js/auth.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/auth.js) y [assets/js/app.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js) para eliminar los hashes de PIN registrados y redirigir limpiamente a la pantalla de configuración de un nuevo PIN.
- Añadido el botón de acceso directo *"¿Olvidaste tu PIN? Restablecer PIN"* en la pantalla de desbloqueo táctil de [index.html](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html) y acceso rápido *"PIN"* en la barra de navegación del dashboard.
- 22/22 tests unitarios pasando en verde.

### 2026-10-17 — Implementación del Mueble Gavetero y Operaciones de Expedientes (Lectura, Impresión, Modificación y Eliminación)
- Diseñado e implementado el **Mueble Gavetero Blindado** en [index.html](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html) y [assets/css/vault.css](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/css/vault.css) con 5 cajones funcionales, tiradores de acero cepillado, tarjetero porta-etiqueta, LEDs indicadores de estado y apertura animada de riel de carpetas.
- Implementado el índice de expedientes colgantes por gaveta con badges de vigencia, copia rápida de números y botón para archivar directamente en cada gaveta.
- Añadido el control de apertura/cierre de cajones (`toggleDrawer`, `toggleAllDrawers`) y sincronización automática al buscar términos en tiempo real.
- Actualizado el modal de expediente `#modal-doc-detail` con soporte completo para:
  1. **Leerlo:** Vista estructurada con datos oficiales, previsualización y descarga descifrada de adjuntos.
  2. **Imprimirlo:** Generación de ficha imprimible oficial vía `window.print()` con reglas CSS dedicadas `@media print`.
  3. **Modificar sus características:** Modo de edición interactivo con re-cifrado instantáneo AES-256-GCM en IndexedDB.
  4. **Eliminarlo:** Borrado seguro con confirmación y actualización reactiva de los contadores de la gaveta.
- Creada suite de pruebas unitarias en [tests/boveda.test.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/boveda.test.js) con 22/22 tests pasando en verde.

- Diseñada la arquitectura integral y documentación técnica en [docs/architecture.md](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/docs/architecture.md) con diagrama de flujo secuencial Mermaid, esquema SQL de PostgreSQL para usuarios, suscripciones y documentos cifrados, y especificación de endpoints REST.
- Implementado el módulo criptográfico nativo en [assets/js/crypto.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/crypto.js) con Web Crypto API (AES-256-GCM y PBKDF2).
- Creado el motor de almacenamiento offline en [assets/js/storage.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/storage.js) con IndexedDB (`BovedaDigitalDB`) para documentos, adjuntos y registros de auditoría.
- Desarrollado el controlador de autenticación unificada en [assets/js/auth.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/auth.js) compatible con el backend de Halterofilia (JWT, refresh token y verificación de cuotas Free/Pro).
- Diseñado el sistema de interfaz de usuario en [assets/css/vault.css](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/css/vault.css) y [index.html](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html) con vistas de login, teclado de PIN táctil, dashboard, escáner de cámara inteligente, visor de detalles y modal de mejora a PRO.
- Orquestada la lógica de aplicación en [assets/js/app.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js) con gestión de estados, alertas de vencimiento, copias rápidas y enlaces compartidos temporales.
- Sintaxis validada al 100% con `node -c`.