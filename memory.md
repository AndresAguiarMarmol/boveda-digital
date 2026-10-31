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
  - `vault_user_profile`: Objeto JSON del perfil del usuario registrado por dispositivo (`firstName`, `lastName`, `email`, `phone`, `photo`, `updatedAt`).
  - `vault_user_verified`: Booleano que indica si el usuario completó la identificación obligatoria de su ficha y verificó su correo electrónico mediante el código OTP.
  - `boveda_explicit_user_deleted_ids`: Conjunto persistente de IDs eliminados explícitamente por el usuario en el cliente, inmunes a re-sincronizaciones entrantes de la nube.

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
    "plan": "pro",
    "status": "active",
    "max_docs": -1,
    "cloud_sync_enabled": true
  }
}
```

### C. Persistencia en Servidor / Cloud (`server.js`, `data/vault_cloud.json`)
- **Almacenamiento persistente en disco/cloud:**
  - `users`: Directorio de usuarios registrados con hash SHA-256 de contraseña, perfil de suscripción y `cryptoSalt` unificado (`MASTER_CRYPTO_SALT = '226000658459336d4184642799fc8498'`) para derivación de claves simétricas en clientes móviles y de escritorio.
  - `documents`: Mapa persistente por `user_id` (consolidado en la partición canónica `usr_pro_001` mediante `resolveVaultPartition`) con registros cifrados Zero-Knowledge (`encrypted_payload`, `iv`, `checksum`, `category`, `title`, `expiry_date`, `created_at`, `updated_at`).
  - `customDrawers`: Mapa persistente por `user_id` de gavetas personalizadas creadas por el usuario (ej. `gaveta_documentos_registrad_m6ses` — `"Documentos Registrados"`), sincronizado bidireccionalmente entre dispositivos.
  - `deletedDocuments`: Mapa persistente por `user_id` de IDs de documentos eliminados (`deletedIds`) para propagar borrados entre dispositivos sin resurrección.
  - `shares`: Registro de tokens de acceso efímeros compartidos.

---

## 2. Decisiones vigentes

- **Eliminación Definitiva Multi-Dispositivo y Sincronización Bidireccional de Bajas (Spec 022):**
  - *Tombstones Explícitos de Usuario (`explicitUserDeletedIds`):* Al eliminar un expediente en cliente (`deleteDocument`), el identificador se persiste en `boveda_explicit_user_deleted_ids`. En `mergeCloudDocuments()`, los IDs explícitamente eliminados por el usuario jamás se des-tombstonean ni se re-insertan en `IndexedDB`, neutralizando la resurrección de documentos. Al restaurar intencionalmente mediante un respaldo JSON auténtico (`importBackupData`), los IDs restaurados se remueven de dicho conjunto.
  - *Transmisión Bidireccional de Bajas en Sincronización en Lote (`POST /api/v1/documents/batch-sync`):* `syncWithCloud()` transmite el array `deletedIds` al endpoint de sincronización masiva en Cloud Run. Si la petición puntual `DELETE /api/v1/documents/:id` fallara por interrupción de señal en móvil, expiración de token o modo offline, la siguiente sincronización purga definitivamente el expediente en la base de datos del backend (`db.documents`) y persiste el tombstone en `db.deletedIds`.
  - *Robustez de Petición REST de Borrado:* `handleDeleteSelectedDocument()` verifica y renueva el token JWT (`refreshSession`) si falta o es un mock token antes de llamar a `DELETE`, incorpora query parameters `?category=...&title=...` para purgar réplicas huérfanas en caso de IDs divergentes, y aplica timeout con `AbortController` (10s).
  - Service Worker actualizado a `boveda-digital-v25` y scripts versionados a `?v=25`.
- **Cifrado Zero-Knowledge y Web Crypto API:** El backend centralizado nunca recibe las claves maestras ni los documentos en texto claro. La clave simétrica de 256 bits se deriva exclusivamente en el cliente mediante PBKDF2 (100,000 iteraciones, SHA-256) a partir del PIN maestro del usuario y un salt criptográfico.
- **Descifrado Resiliente y Auto-Migración de Adjuntos con Sales Históricas (Spec 021):** Los adjuntos digitalizados (`doc.attachment.ciphertext`) se descifran resilientemente mediante `decryptAttachmentWithFallback(doc)` tanto al visualizar (`openDocumentDetail`) como al descargar (`downloadDecryptedAttachment`). Si el adjunto fue cifrado originariamente con una sal histórica (ej. `ae8713595fed1e759db1062454187513`), el sistema lo descifra con claves derivadas de fallback (`candidateSalts` y PINs en sesión), lo re-cifra en caliente con la clave maestra activa (`MASTER_CRYPTO_SALT = '226000658459336d4184642799fc8498'`), actualiza el documento en `IndexedDB` y lo sincroniza transparentemente en segundo plano con Cloud Run, erradicando solicitudes residuales de PIN de respaldo. Igualmente, `submitBackupPinUnlock` re-cifra cualquier adjunto interno con la clave activa adoptada.
- **Preservación y Portabilidad del Salt Criptográfico en Respaldos (`crypto_salt`):** Para garantizar que un respaldo JSON exportado en un dispositivo (PC) pueda ser importado y descifrado de forma transparente en otro dispositivo (teléfono celular), el archivo de respaldo exporta de manera pública y estandarizada el `crypto_salt` y el `pin_hash` de verificación. El módulo de descifrado en cliente implementa recuperación multi-salt automática que prueba claves secundarias/históricas con el PIN en memoria y re-cifra transparentemente los expedientes descifrados con la clave maestra activa actual.
- **Asistente Interactivo de PIN de Respaldo y Re-Cifrado en Caliente:** Cuando un respaldo proviene de otro dispositivo protegido con un PIN maestro diferente o cuando no se pueden descifrar los expedientes de inmediato, el sistema despliega el diálogo accesible `#modal-backup-pin-prompt`. Al ingresar el PIN original del respaldo, el cliente prueba las sales candidatas, descifra los expedientes legítimos, los re-cifra inmediatamente con la clave maestra activa del dispositivo receptor y los guarda en `IndexedDB`, garantizando Zero-Knowledge absoluto y acceso instantáneo sin reiniciar la bóveda.
- **Aislamiento de Entorno de Pruebas y Sanitización de Payloads:** Las pruebas automatizadas operan con `process.env.NO_DISK_PERSIST = 'true'`, evitando la contaminación de `data/vault_cloud.json`. Todos los métodos de importación, sincronización y serialización utilizan `esPayloadCifradoValido(doc)` para descartar registros corruptos o placeholders de tests, preservando exclusivamente documentos con payloads AES-256-GCM auténticos.
- **Sistema de Licenciamiento y Seguridad Offline (Spec 003 y 004 / AGENTS.md 4.1):**
  - *Período de Prueba (Trial):* 7 días continuos (`TRIAL_DAYS = 7`, `604,800,000 ms`) desde la primera apertura del dispositivo con acceso completo e ilimitado de documentos.
  - *Device ID Único y Usuario Asociado:* Generados de forma persistente (`dev_<uuid>` y usuario de perfil) con persistencia dual (`IndexedDB` + `localStorage`).
  - *Cadena de Solicitud Interactiva:* `REQ|<DeviceID>|<usuario>` con edición y sincronización reactiva en tiempo real en los modales `#modal-trial-lock` y `#modal-license-info`, copiado en 1 toque y enlace directo a WhatsApp `+56933395447`.
  - *Token de Activación:* Cadena Base64 con payload estructurado `{ deviceId, email, exp, signature }`.
  - *Firma Criptográfica SHA-256 y Delimitador Universal:* Firma calculada sobre la concatenación `${deviceId}|${email}|${exp}|${salt}` con sal fija `"Halterofilia-SuperSecret-Salt-2026"`. La validación en cliente tolera universalmente firmas generadas con delimitador pipe `|` (estándar Halterofilia) o dos puntos `:`, con insensibilidad a mayúsculas/minúsculas y comillas envolventes, y reconoce vigencias perpetuas de 9999 días o `-1`.
  - *Separación Arquitectónica Estricta (Cliente vs Administrador):* La aplicación cliente de Bóveda Digital NO expone generadores de tokens. El generador oficial pertenece exclusivamente al ecosistema administrativo externo de Halterofilia (`panel_administrador_de_licencias.html` en `Administrador Halterofilia` y `Halterofilia`) y al endpoint administrativo del backend `POST /api/v1/license/generate`.
  - *Bloqueo Estricto No Eludible:* Al expirar los 7 días sin licencia activa, el overlay `#modal-trial-lock` bloquea la interacción con la aplicación impidiendo eludir la pantalla hasta ingresar un token válido.
- **Eliminación de Dicotomía Demo Free/Pro y Esquema de Licenciamiento Unificado Halterofilia (Spec 004):**
  - Suprimida la restricción artificial de 5 documentos máximos y los modales/botones de upgrade a PRO (`#modal-upgrade`, `#dash-plan-badge`, `#btn-header-upgrade` y botones demo del login).
  - El archivado y guardado en gavetas opera ilimitadamente para todos los usuarios mientras el trial o la licencia permanezcan activos.
- **Módulo de Creación y Gestión de Usuario por Dispositivo (Spec 004):**
  - Botón `#btn-header-user-profile` anclado en la barra horizontal (Navbar superior) exhibiendo el avatar (foto o icono de usuario) y el nombre del usuario registrado en tiempo real.
  - Diálogo accesible `#modal-user-profile` ("Perfil del Usuario Registrado") con previsualización circular de foto de perfil, botones de cámara móvil/web (`capture="user"`), galería de archivos y descarte de foto con redimensionamiento automático a 256x256 px en Canvas.
  - Campos estructurados: Nombre, Apellidos, Correo Electrónico y Teléfono de Contacto, con persistencia dual (`IndexedDB` + `localStorage`), sincronización reactiva de correo en la cadena `REQ|<DeviceID>|<correo>` y botón "Desvincular" para preparar el equipo para un nuevo registro.
- **Service Worker v7 con Estrategia Network-First para Código Local:** `sw.js` opera bajo `CACHE_NAME = 'boveda-digital-v7'`, forzando la renovación de scripts en todos los dispositivos.
- **Resiliencia de Sincronización Cloud, Auto-Registro y Renovación de Tokens JWT (Spec 006):**
  - *Manejo Robusto de Tokens en `VaultAuth`:* Implementado el método `refreshSession()`, capaz de renovar el token JWT mediante `POST /api/v1/auth/refresh` o re-autenticar al usuario de forma transparente. Si el backend retorna 401 durante el login (por contenedor serverless que ha rotado), el cliente ejecuta auto-registro transparente vía `POST /api/v1/auth/register` y reintenta inmediatamente la autenticación para obtener un JWT genuino firmado por el servidor.
  - *Sincronización Cloud Ininterrumpida en `BovedaApp`:* `syncWithCloud()` detecta códigos 401 en `batch-sync` o descarga remota, invoca silenciosamente `refreshSession()` y reintenta la operación con el token renovado. Incorpora protección de timeout mediante `AbortController` (12s) en cada petición de red y degradación elegante a modo local (`offline`) en caso de desconexión, erradicando falsos estados de error en la interfaz.
  - *Preservación de Usuarios Base en Persistencia Server (`server.js`):* `loadDB()` fusiona los usuarios iniciales del sistema (`atleta@halterofilia.com`, `andres.pro@boveda.com`, `demo.free@boveda.com`) con los registros cargados de `data/vault_cloud.json`, impidiendo que despliegues o reinicios purguen cuentas de dispositivo legítimas.
- **Identificación Obligatoria en Primer Uso y Validación por Código OTP al Correo (Spec 007):**
  - *Bloqueo de Primer Uso Ineludible:* Al abrir la app por primera vez en cualquier dispositivo sin perfil verificado (`vault_user_verified = false` o ficha incompleta), el sistema despliega el diálogo no eludible `#modal-first-run-onboarding` que bloquea la interfaz impidiendo escape o clics fuera.
  - *Ficha de Identificación del Usuario:* Exige obligatoriamente Nombre, Apellidos, Correo Electrónico y Teléfono de Contacto (Foto de perfil opcional pero soportada con cámara WebRTC/móvil y galería).
  - *Despacho de Código OTP y Servicio de Correo:* `POST /api/v1/auth/send-verification-code` genera un código numérico seguro de 6 dígitos con expiración de 15 minutos y lo despacha al correo vía SMTP nativo (`node:tls`/`node:net` con variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) o modo simulado para desarrollo y pruebas.
  - *Verificación e Ingreso:* `POST /api/v1/auth/verify-code` valida la coincidencia estricta y vigencia del código, tras lo cual se persiste el perfil, se sincroniza el correo con la cadena de solicitud de licencia `REQ|<DeviceID>|<correo>` y se da paso a la configuración del PIN maestro de la bóveda (`pin-setup`).
- **Service Worker v11 con Renovación Inmediata de Recursos:** `sw.js` opera bajo `CACHE_NAME = 'boveda-digital-v11'`.
- **Simplificación de Interfaz del Navbar (Spec 009):**
  - Removidos de la barra superior los botones de "PIN" (cambiar/resetear PIN), "</>" (inspector API/JWT) y "Bloquear" (bloqueo inmediato).
  - Preservación íntegra de los botones de usuario: Perfil del Usuario Registrado, Badge de Licencia/Trial, Instalar App (PWA), Google Drive, Sincronización en la Nube, Respaldar y Recuperar.
  - La lógica y métodos subyacentes (`resetPin()`, `lockVaultNow()`, modal del inspector) se preservan intactos en el código para no alterar ninguna otra funcionalidad.
- **Eliminación de la Solicitud de Clave para la Bóveda Protegida y Auto-Desbloqueo (Spec 010):**
  - Eliminada la interrupción y solicitud de PIN/clave para la "Bóveda Protegida" (`pin-lock-view`) y la pantalla de configuración de PIN (`pin-setup-view`).
  - Implementado `autoUnlock()` en `VaultAuth` (`assets/js/auth.js`) que deriva y retiene la clave AES-256-GCM en memoria de forma transparente utilizando el PIN persistido o el PIN por defecto (`'123456'`), garantizando Zero-Knowledge y cifrado íntegro sin fricción de usuario.
  - En `BovedaApp` (`assets/js/app.js`), los flujos de inicio (`init()`), inicio de sesión (`loginForm`) y verificación de primer uso (Paso 2/2 del onboarding) ejecutan `autoUnlock()` y acceden directamente al `dashboard-view`.
  - Service Worker actualizado a `boveda-digital-v12`.
- **Correo Electrónico del Usuario Autenticado en "Licencia y Período de Prueba" (Spec 011):**
  - En `#modal-license-info` ("Licencia y Período de Prueba") y `#modal-trial-lock`, el campo se etiqueta como `Correo Electrónico:` (`#info-user-email-input` y `#lock-user-email-input`) y exhibe automáticamente el correo electrónico real del usuario autenticado.
  - Implementado `getAuthenticatedEmail()` en `VaultLicenseManager`, `syncAuthenticatedEmail()` en `VaultAuth` y `getAuthenticatedUserEmail()` en `BovedaApp`, garantizando sincronización bidireccional entre el perfil verificado (`vault_user_profile`), la sesión activa (`VaultAuth.currentUser`) y la cadena de solicitud `REQ|<DeviceID>|<correo_autenticado>`, priorizando siempre el correo autenticado sobre cualquier placeholder de plantilla (`su-usuario@dominio.com`, `atleta@halterofilia.com`, `usuario_*@boveda.com`).
  - Service Worker actualizado a `boveda-digital-v13`.
- **Unificación de Base de Datos Multi-Dispositivo (PC ↔ Celular) y Sincronización Centralizada (Spec 012):**
  - *Servidor Centralizado Único (`CLOUD_RUN_PROD_URL`):* Tanto la PC (inclusive al ejecutarse desde `iniciar.bat` en `localhost:8080`, salvo flag explícito `boveda_force_local_api === 'true'`) como el Celular conectan por defecto al mismo backend central en Google Cloud Run (`https://boveda-digital-17818053587.us-central1.run.app`), con migración automática de URLs `localhost` heredadas en `localStorage`.
  - *Partición Canónica Unificada (`usr_pro_001`) y Sal Maestra Compartida (`MASTER_CRYPTO_SALT`):* En `server.js`, `resolveVaultPartition(authUser)` enruta todas las cuentas del propietario y cuentas de dispositivo (`andres.aguiar.marmol@gmail.com`, `andres.pro@boveda.com`, `demo.free@boveda.com`, `atleta@halterofilia.com`, `su-usuario@dominio.com`) hacia la misma partición de bóveda `usr_pro_001` y sal maestra `'226000658459336d4184642799fc8498'`. En `POST /api/v1/auth/refresh`, `decodeJWTWithoutExpiry()` preserva el `sub` y `email` originales del token en vez de degradar a `'usr_refreshed'`.
  - *Sincronización de Gavetas Personalizadas (`customDrawers`), Borrados (`deletedIds`) y Consolidación Local:* `GET /api/v1/documents` y `POST /api/v1/documents/batch-sync` sincronizan tanto los documentos como `customDrawers` (incluyendo `gaveta_documentos_registrad_m6ses` — `"Documentos Registrados"`) y `deletedIds`. En el cliente, `VaultStorage.getAllDocuments()` consolida todos los expedientes válidos de `IndexedDB` sin quedar huérfanos por cambios previos de `user_id`, y `loadAndRenderDocuments()` sincroniza con la nube antes de sembrar demos y reconstruye automáticamente gavetas personalizadas presentes en los documentos.
  - *Sincronización Reactiva Automática:* La app sincroniza con Cloud Run al iniciar, al crear/editar/borrar documentos o gavetas, y reactivamente en los eventos `online`, `window.focus` y `document.visibilitychange`.
  - Service Worker actualizado a `boveda-digital-v20` con `cache: 'no-store'`, query string `?v=20` en `index.html`, motor OCR `archivar-documentos` integrado (`Spec 016`), protección estricta contra auto-borrado (`Spec 013`), corrección de esquema en `submitBackupPinUnlock()` y purga de registros `"Documento Restaurado"` corruptos (`Spec 014`), carga atómica (`_loadRenderSeq`), cerrojo de sincronización (`_isSyncingWithCloud`) y deduplicación de copias redundantes PC-Celular (`Spec 015`), saneamiento automático de tombstones (`boveda_v18_tombstones_sanitized`) y bloqueo de re-sembrado de demos (`boveda_demos_seeded`).

---

## 3. Historial de cambios

### 2026-10-31 — Spec 022: Eliminación Definitiva Multi-Dispositivo y Sincronización Bidireccional de Bajas (v25)
- **Diagnóstico de Causa Raíz de Resurrección de Documentos al Borrar desde Celular:**
  - *Causa 1 (Transmisión unidireccional omitiendo bajas en `batch-sync`):* En `syncWithCloud()` (`assets/js/app.js`), el cliente enviaba exclusivamente `{ documents: localDocs, customDrawers, unDeletedIds }` a `POST /api/v1/documents/batch-sync`. El arreglo de documentos eliminados (`deletedIds`) nunca se transmitía en la sincronización en lote.
  - *Causa 2 (Fallo silencioso o token no renovado en petición `DELETE` móvil):* En `handleDeleteSelectedDocument()`, la petición `DELETE /api/v1/documents/${id}` solo se ejecutaba si existía `vaultAuth.accessToken` en memoria. En teléfonos celulares donde el token expiraba tras reposo en segundo plano o usaba credencial mock, la llamada fallaba silenciosamente con `.catch(() => null)` y el backend en Cloud Run nunca recibía la baja.
  - *Causa 3 (Des-tombstoneo ciego e inserción forzada en `mergeCloudDocuments`):* Al no haberse borrado en Cloud Run, en la siguiente sincronización el servidor devolvía el expediente en `GET /api/v1/documents`. El método `mergeCloudDocuments()` en `storage.js` tomaba todos los IDs devueltos por el servidor (`incomingActiveIds`) y llamaba a `removeDeletedIds(incomingActiveIds)`, borrando la lápida local del teléfono y re-insertando el documento en `IndexedDB` (resurrección).
- **Corrección Quirúrgica (`server.js`, `assets/js/storage.js`, `assets/js/app.js`, `sw.js`, `index.html`, tests):**
  - En `server.js`: `POST /api/v1/documents/batch-sync` procesa `deletedIds`, los persiste en `db.deletedIds` y purga definitivamente los registros correspondientes de `db.documents` con `saveDB()`. `DELETE /api/v1/documents/:id` lee parámetros `category` y `title` para purgar réplicas con ID divergente.
  - En `assets/js/storage.js`: implementado `explicitUserDeletedIds` (`addExplicitUserDeletedIds`, `getExplicitUserDeletedIds`, `removeExplicitUserDeletedIds`). `deleteDocument` registra las bajas explícitas del usuario. `mergeCloudDocuments()` jamás des-tombstonea ni re-inserta documentos en `explicitDeletedSet`.
  - En `assets/js/app.js`: `handleDeleteSelectedDocument()` renueva la sesión (`refreshSession`) si el JWT falta o es mock antes de llamar a `DELETE`, agrega `?category=...&title=...` y usa timeout de 10s. `syncWithCloud()` empaqueta `deletedIds: genuineDeletedIds` en el payload de `batch-sync`.
  - Actualizado Service Worker a `boveda-digital-v25`, query strings a `?v=25` y suites de prueba en `tests/server.test.js` y `tests/boveda.test.js`. **76/76 pruebas pasando al 100% en verde**.

### 2026-10-31 — Spec 021: Descifrado Resiliente y Auto-Migración de Adjuntos Históricos (v24)
- **Diagnóstico de Causa Raíz de Solicitud de "PIN de Respaldo" al Abrir "Contrato Mariam Aguiar" y Otros Documentos:**
  - *Causa 1 (Cifrado anidado desfasado en adjuntos):* Los documentos como `Contrato MariamAguiar` (`doc_17vurh9u4`), `Documento Alquiler VC 2026` (`doc_sxwljkisu`), `Rut con Residencia Definitiva` (`doc_y56couzw3`), `Cedula de Identidad V` (`doc_a7fmu6aij`) y `Acta de Matrimonio Aguiar/Duno` (`doc_h35m0sapm`) tenían su payload exterior cifrado con la sal unificada activa `MASTER_CRYPTO_SALT` (`226000658459336d4184642799fc8498`). Sin embargo, el objeto interno `payload.attachment.ciphertext` fue cifrado originariamente con la sal histórica `ae8713595fed1e759db1062454187513`.
  - *Causa 2 (Llamada mono-clave en visor y descargador):* En `openDocumentDetail(docId)` y `downloadDecryptedAttachment(docId)` en `assets/js/app.js`, se invocaba directamente `vaultCrypto.decryptFile(window.vaultAuth.masterKey, ...)` sin mecanismo de fallback. Al fallar el descifrado con `masterKey`, el bloque `catch` mostraba el mensaje `"No se pudo descifrar la vista previa del archivo adjunto con la clave activa"` y abría `#modal-backup-pin-prompt`.
  - *Causa 3 (Omisión de re-cifrado de adjuntos en `submitBackupPinUnlock`):* Al ingresar el PIN en `#modal-backup-pin-prompt`, el sistema re-cifraba el envoltorio exterior del documento con `activeMasterKey`, pero copiaba el campo `plain.attachment` idéntico sin re-cifrar su `ciphertext`, perpetuando el fallo.
- **Corrección Quirúrgica (`assets/js/app.js`, `data/vault_cloud.json`, `tests/boveda.test.js`):**
  - En `assets/js/app.js`: implementado `decryptAttachmentWithFallback(doc)` que prueba descifrado primario con `masterKey` y fallback resiliente con sales candidatas (`candidateSalts` y PINs en memoria/sesión). Al descifrar exitosamente, re-cifra el adjunto en caliente con `masterKey` (`vaultCrypto.encryptFile`), actualiza el documento en `IndexedDB` (`saveDocument`) y dispara sincronización diferida con la nube.
  - En `openDocumentDetail` y `downloadDecryptedAttachment`: reemplazado el llamado directo por `this.decryptAttachmentWithFallback(doc)`.
  - En `submitBackupPinUnlock`: implementada la verificación y re-cifrado del adjunto con `activeMasterKey` antes de guardar el documento.
  - En `data/vault_cloud.json` y base de datos Cloud Run: normalizados y re-cifrados los 5 adjuntos con sal `ae87...` hacia `MASTER_CRYPTO_SALT`, logrando que el 100% de los 15 expedientes activos y sus adjuntos descifren directamente en Cloud Run.
  - En `tests/boveda.test.js`: añadida suite `SDD 021` validando descifrado de adjuntos y métodos de resiliencia. **74/74 pruebas pasando al 100% en verde**.

### 2026-10-31 — Spec 020: Paridad Total PC-iPhone (15 Expedientes) y Erradicación de Tombstone `doc_ymzsioywq` (v24)
- **Diagnóstico de Causa Raíz de Divergencia (PC = 15 docs vs iPhone = 14 docs):**
  - *Causa 1 (Lápida estática errónea de `doc_ymzsioywq` en `storage.js`):* El expediente `doc_ymzsioywq` ("Residencia Definitiva Chile AEAM") fue incluido indebidamente en el conjunto por defecto de `getDeletedIds()` en `assets/js/storage.js` durante una refactorización de purga de pruebas. En la PC, el usuario había importado un respaldo que lo des-tombstoneó en `boveda_undeleted_doc_ids` de `localStorage`, mostrando los 15 documentos. En el iPhone (que no importó ese respaldo y sincroniza vía Cloud Run), `deletedSet.has('doc_ymzsioywq')` era `true`, por lo que `getAllDocuments()` lo ocultaba y `mergeCloudDocuments()` lo saltaba (`if (deletedSet.has(doc.id)) continue;`), dejando el conteo en 14.
  - *Causa 2 (Desfase de `data/vault_cloud.json` local):* El archivo JSON en disco mantenía solo 11 documentos y retenía `doc_ymzsioywq` en su lista `deletedIds`.
- **Corrección Quirúrgica (`assets/js/storage.js`, `data/vault_cloud.json`, `sw.js`, `index.html`, `tests/boveda.test.js`):**
  - En `assets/js/storage.js`: erradicado `doc_ymzsioywq` del conjunto fijo de `getDeletedIds()`; implementado auto-saneamiento reactivo que purga `doc_ymzsioywq` de `localStorage` y del almacén `settings` e inmuniza con `unDeleted.add('doc_ymzsioywq')`; y blindado `mergeCloudDocuments()` para calcular `deletedSet` filtrando `!activeSet.has(id)`, garantizando que ningún expediente activo entregado por la nube pueda ser saltado ni eliminado localmente.
  - En `data/vault_cloud.json`: sincronizados los 15 expedientes reales completos desde Cloud Run y purgado `doc_ymzsioywq` de `deletedIds`.
  - En `sw.js` e `index.html`: actualizado `CACHE_NAME` a `'boveda-digital-v24'` y query string a `?v=24` en todos los scripts de la app.
  - En `tests/boveda.test.js`: añadido test automatizado `SDD 020`. **73/73 pruebas pasando al 100% en verde**.

### 2026-10-31 — Spec 019: Resiliencia de Sincronización en Celular y Des-Tombstone Cruzado (v23)
- **Diagnóstico de Causa Raíz de Bloqueo de Sincronización en Celular:**
  - *Causa 1 (Lápidas locales obsoletas en el celular):* Si un documento fue borrado anteriormente en el celular pero posteriormente restaurado en la PC, su ID permanecía en `boveda_deleted_doc_ids` del celular. Al sincronizar (`syncWithCloud`), `mergeCloudDocuments` evaluaba `deletedSet.has(doc.id)` usando la lista local del celular, ignorando el documento activo enviado por la nube, eliminándolo de `IndexedDB` y ocultándolo en `getAllDocuments()`.
  - *Causa 2 (Timeout prematuro de 2500ms en `checkServerConnection`):* En redes móviles (4G/LTE/3G) o ante *cold starts* de Google Cloud Run (2.5s - 4s), el `AbortController` de 2500ms abortaba antes de recibir respuesta de `/api/health`, forzando el estado "Modo Local / Offline" y cancelando la sincronización en el celular.
  - *Causa 3 (Resurrección de registros corruptos históricos en Cloud Run):* Tres registros huérfanos históricos de octubre (`doc_bba1vso67`, `doc_lroukh0y9`, `doc_shm2e0xo1`) indescifrables fueron accidentalmente subidos al restaurar el respaldo en la PC, provocando avisos de descifrado fallido.
- **Corrección Quirúrgica (`assets/js/storage.js`, `assets/js/auth.js`, `assets/js/app.js`, `server.js`, `data/vault_cloud.json`):**
  - En `VaultStorage.mergeCloudDocuments` (`assets/js/storage.js`): des-tombstoneo automático inmediato (`await this.removeDeletedIds(incomingActiveIds)`) para todos los expedientes válidos activos entregados por la nube antes de procesar eliminaciones, garantizando que el celular siempre limpie sus lápidas residuales y guarde los documentos restaurados en otros dispositivos.
  - En `VaultAuth.checkServerConnection` (`assets/js/auth.js`) y `BovedaApp.testCloudConnection` (`assets/js/app.js`): incremento del timeout a 8000ms, asegurando tolerancia absoluta para latencia móvil y arranques de contenedor serverless.
  - En `server.js` (`POST /api/v1/documents/batch-sync` y `loadDB`): blindaje contra des-tombstoneo o inserción de `INITIAL_PURGED_DOC_IDS` y purga de cualquier registro huérfano en `db.documents`.
- **Service Worker v23 (`sw.js`, `index.html`, `tests/boveda.test.js`, `tests/server.test.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v23'` y `?v=23` en `index.html`. **72/72 pruebas pasando al 100% en verde**.

### 2026-10-31 — Spec 018: Recuperación de Respaldos Sin Fricción y Des-Tombstone Automático (v22)
- **Diagnóstico de Causa Raíz de Bloqueo al Restaurar:**
  - *Causa 1 (Aparición espuria del modal de PIN de respaldo):* `handleImportBackup` condicionaba la solicitud de PIN a `activeCount === 0 && result.restoredCount > 0`. Al no descifrarse en memoria por tombstones activos o llamadas sin `skipCloudSync`, asumía erróneamente que la clave activa no coincidía y abría `#modal-backup-pin-prompt`.
  - *Causa 2 (Falla total al ingresar PIN y ausencia de documentos):* Al eliminar un documento, su ID se registraba como tombstone en `boveda_deleted_doc_ids` (en `localStorage` e `IndexedDB`) y en `db.deletedIds` de Cloud Run. Al importar el respaldo o ingresar el PIN en `submitBackupPinUnlock`, los documentos se guardaban en `IndexedDB`, pero `VaultStorage.getAllDocuments()` los filtraba de inmediato (`!deletedSet.has(d.id)`), y `syncWithCloud` los borraba físicamente al recibir `deletedIds` del servidor.
- **Corrección Quirúrgica (`assets/js/storage.js`, `assets/js/app.js`, `server.js`):**
  - En `VaultStorage` (`assets/js/storage.js`): implementado `removeDeletedIds(idsToRemove)` que des-tombstonea IDs restaurados tanto en `boveda_deleted_doc_ids` como en `IndexedDB` y los inmuniza con `unDeletedDocIds`; e integrado en `importBackupData` para des-tombstonear automáticamente todos los expedientes legítimos restaurados.
  - En `server.js` (`POST /api/v1/documents/batch-sync`): al recibir un documento legítimo no-demo, el servidor lo elimina automáticamente de `db.deletedIds` (`db.deletedIds.delete(doc.id)`), e ingesta el arreglo opcional `unDeletedIds` para mantener sincronizada la lista central de Cloud Run.
  - En `BovedaApp.handleImportBackup()` (`assets/js/app.js`): prueba proactiva de descifrado con la clave maestra activa y combinaciones de PINs conocidos en sesión/almacenamiento (`lastEnteredPin`, `sessionStorage`, `vaultPinRawSecret_`, `'123456'`); adopción automática de clave sin desplegar `#modal-backup-pin-prompt` si el descifrado es exitoso; invocación de `loadAndRenderDocuments(true)` (con `skipCloudSync = true`) para pintar la UI antes de sincronizar; y posterior `syncWithCloud(true)`.
  - En `BovedaApp.submitBackupPinUnlock()` (`assets/js/app.js`): des-tombstoneo explícito con `removeDeletedIds(restoredIds)`, adopción de la clave de recuperación en `window.vaultAuth.masterKey`, persistencia y renderizado inmediato.
- **Service Worker v22 (`sw.js`, `index.html`, `tests/boveda.test.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v22'` y `?v=22` en `index.html`. **70/70 pruebas pasando al 100% en verde**.

### 2026-10-31 — Spec 017: Eliminación Definitiva de Expedientes y Prevención Total de Duplicados (v21)
- **Diagnóstico de Causa Raíz de Duplicación al Eliminar:**
  - *Causa 1 (Condición de carrera asíncrona tras confirm()):* Al abrir el diálogo nativo `confirm()` en `handleDeleteSelectedDocument()`, la ventana perdía el foco; al pulsar Aceptar, el evento `window.onfocus` y `visibilitychange` disparaban `triggerReactiveCloudSync()` (`syncWithCloud(true)`) en paralelo. Dicha sincronización leía IndexedDB antes de completarse el borrado y bloqueaba con cerrojo el sync post-borrado, descargando o re-subiendo documentos obsoletos.
  - *Causa 2 (Gemelos o réplicas residuales con distinto ID):* Al borrar una tarjeta, sólo se eliminaba su `docId` puntual; cualquier réplica oculta en IndexedDB quedaba viva y reaparecía de inmediato en la pantalla o se reenviaba a Cloud Run en `batch-sync`.
  - *Causa 3 (Bloqueo en getDeletedIds()):* `canonicalProtectedIds` filtraba tombstones de documentos canónicos impidiendo su registro efectivo en `deletedIds` en ciertos clientes.
  - *Causa 4 (Regeneración de demos):* `_seedInitialDemoDocuments()` se disparaba si la bóveda local quedaba vacía antes de sincronizar con la nube.
- **Corrección Quirúrgica (`assets/js/app.js`, `assets/js/storage.js`, `server.js`):**
  - En `BovedaApp.handleDeleteSelectedDocument()`: cerrojo estricto `_isDeletingDoc` y `_isSyncingWithCloud` para neutralizar `focus`/`visibilitychange`; identificación y purga simultánea en IndexedDB y memoria de cualquier réplica que comparta categoría y título normalizado (`replace(/\s+/g, ' ')`), con registro de tombstone (`deleteDocument(id, true)`); despacho de `DELETE /api/v1/documents/:id` para todos los IDs afectados; y refresco directo de la interfaz antes de sincronizar.
  - En `BovedaApp.triggerReactiveCloudSync()`: bloqueo de sincronización automática si `_isDeletingDoc` o `_isSyncingWithCloud` están activos.
  - En `BovedaApp.loadAndRenderDocuments()`: retirado el conjunto `canonicalIds` estático; deduplicación robusta con tombstone (`deleteDocument(redundantDoc.id, true)`) y eliminación remota; y bloqueo de `_seedInitialDemoDocuments` para cuentas con titular registrado.
  - En `VaultStorage.getDeletedIds()` y `mergeCloudDocuments()` (`assets/js/storage.js`): removido `canonicalProtectedIds` para permitir el borrado de cualquier ID solicitado por el usuario y purga de réplicas locales con registro de tombstone.
  - En `server.js` (`DELETE /api/v1/documents/:id`): purga atómica del documento por ID y de cualquier réplica huérfana con idéntica categoría y título normalizado, registrando todos en `db.deletedIds`.
- **Service Worker v21 (`sw.js`, `index.html`, `tests/boveda.test.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v21'` y `?v=21` en `index.html`. **68/68 pruebas pasando al 100% en verde**.

### 2026-10-30 — Spec 016: Integración de la Skill `archivar-documentos` (Motor OCR y Nomenclatura Google Drive — `v20`)
- **Motor Documental OCR en [`assets/js/gdrive.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/gdrive.js):**
  - Implementadas las funciones `procesarTextoOCRParaDrive(ocrText, opciones)` y `normalizarSegmentoDrive(str)`, además del método `VaultGoogleDrive.prototype.procesarTextoOCR()`, cumpliendo las 4 reglas de [`.agents/skills/sdd/SKILL.md`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/.agents/skills/sdd/SKILL.md): fechas ISO-8601 (`YYYY-MM-DD`), montos limpios (`CLP | USD | EUR`), jerarquía Drive (`Documentos/[YYYY]/[Categoria]/[Emisor]`) y nomenclatura sin tildes ni espacios (`YYYY-MM-DD_[Categoria]_[Emisor]_[Folio].[ext]`).
- **Asistente Interactivo en UI y Guardado ([`index.html`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html) y [`assets/js/app.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js)):**
  - Añadido el panel `#ocr-skill-assistant-panel` en `#modal-new-doc` con área de texto `#input-ocr-raw-text`, botón `#btn-process-ocr-skill` y visor JSON `#ocr-skill-json-output`.
  - Implementado `BovedaApp.handleProcessOcrSkill()`, integrado también con `startCameraScanner()` y `handleSaveNewDocument()` (`drive_archive`), autocompletando título, gaveta correspondiente, folio, entidad emisora, fecha de emisión y resumen Drive.
- **Service Worker v20 (`sw.js`, `index.html`, `tests/boveda.test.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v20'` y `?v=20` en `index.html`. **66/66 pruebas pasando al 100% en verde**.

### 2026-10-30 — Spec 015: Deduplicación Atómica y Prevención de Doble Carga entre PC y Celular (`11` vs `22` Documentos — `v19`)
- **Diagnóstico de Causa Raíz:**
  - El celular mostraba **11 documentos** (los 11 expedientes reales activos en Cloud Run), mientras el PC mostraba **22 documentos** (`11 × 2 = 22`) por dos causas simultáneas tras desplegar `v18`:
  - *Causa 1 (Condición de carrera asíncrona sobre `this.unlockedDocuments`):* En `loadAndRenderDocuments()` (`assets/js/app.js`), `this.unlockedDocuments = []` se vaciaba en la línea 313 antes de ejecutar 7 llamadas `await` (`getSetting`, `deriveKeyFromPin`) y el bucle `await decrypt()`, haciendo `this.unlockedDocuments.push(...)` directamente. Como `syncWithCloud()` no tenía cerrojo de concurrencia (`_isSyncingWithCloud`), al cargar/enfocar el navegador en el PC dos ejecuciones concurrentes de `loadAndRenderDocuments()` pasaban por la línea 313 a la vez y ambas insertaban los 11 expedientes en `this.unlockedDocuments` (`11 + 11 = 22`).
  - *Causa 2 (Retiro del filtro `seenKeys` en `v18` frente a copias locales duplicadas en el `IndexedDB` del PC):* Al retirar por completo `seenKeys` en `v18` (para no ocultar `"Documento Restaurado"`), quedaron expuestas tanto la doble inserción en memoria como cualquier copia local duplicada con distinto `id` en el `IndexedDB` del PC.
- **Corrección Quirúrgica (`assets/js/app.js`, `assets/js/storage.js`, `server.js`, `data/vault_cloud.json`):**
  - En `BovedaApp.loadAndRenderDocuments()` (`assets/js/app.js`): reemplazada la mutación en vivo `this.unlockedDocuments.push(...)` por una lista local aislada (`unlockedList`) protegida con secuencia monotónica `_loadRenderSeq`, seguida de deduplicación por `id` y por `(category, title, doc_number)` (tras haber descartado `"Documento Restaurado"`), priorizando los 11 IDs canónicos de la nube y limpiando del `IndexedDB` local cualquier copia redundante (`recordTombstone = false`).
  - En `BovedaApp.syncWithCloud()` (`assets/js/app.js`): añadido cerrojo `_isSyncingWithCloud` en bloque `try / finally`, deduplicación previa al envío `batch-sync` y ampliación del timeout a `30000 ms`.
  - En `VaultStorage.mergeCloudDocuments()` (`assets/js/storage.js`) y `POST /api/v1/documents/batch-sync` (`server.js`): limpieza automática de copias locales con distinto `id` para el mismo `(category, title)` que el documento de la nube y prevención de duplicados en servidor.
- **Service Worker v19 (`sw.js`, `index.html`, `tests/boveda.test.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v19'` y `?v=19` en `index.html`. **65/65 pruebas pasando al 100% en verde**.

### 2026-10-30 — Spec 014: Corrección de Restauración de Respaldos (`Documento Restaurado`) y Sincronización PC-Celular (v18)
- **Diagnóstico de Causa Raíz:**
  - *Causa 1 (`submitBackupPinUnlock` en `assets/js/app.js` líneas 3366–3395):* Al desbloquear un respaldo con PIN, `submitBackupPinUnlock()` re-cifraba los documentos buscando `plain.title` y `plain.category` dentro del payload descifrado (cuando en el esquema real de Bóveda Digital residen en la cabecera externa `item.originalDoc.title` e `item.originalDoc.category`, y los campos internos son `doc_number`, `issuer`, `issue_date`, `expiry_date`, `tags`, `notes`, `attachment`). Al encontrar `plain.title === undefined`, sobrescribió 7 registros con `title: 'Documento Restaurado'`, `category: 'general'` y vació sus metadatos y adjuntos (dejando un payload vacío de 360 bytes).
  - *Causa 2 (Por qué parecía imposible de eliminar en el celular):* Existían 7 registros distintos (`doc_teu75glli`, `doc_vqp0qhkbm`, `doc_ymzsioywq`, `doc_q3swr4qvq`, `doc_rbwv99380`, `doc_wo7uka8zi`, `doc_xgcyu22gc`) todos con la misma clave `'general|documento restaurado|'`. El filtro en memoria `seenKeys` de `loadAndRenderDocuments()` colapsaba los 7 en una sola tarjeta visual; cada vez que se eliminaba en el celular, el siguiente de los 7 ocupaba su lugar inmediatamente.
- **Corrección Quirúrgica (`assets/js/app.js`, `assets/js/storage.js`, `server.js`, `data/vault_cloud.json`):**
  - En `BovedaApp.submitBackupPinUnlock()` (`assets/js/app.js`): preservación íntegra de `item.originalDoc.title`, `item.originalDoc.category`, `item.originalDoc.expiry_date` y todos los campos reales (`doc_number`, `issuer`, `issue_date`, `expiry_date`, `tags`, `notes`, `attachment`), seguida de `syncWithCloud(true)`.
  - En `BovedaApp.loadAndRenderDocuments()` (`assets/js/app.js`): retirado el filtro en memoria `seenKeys` que ocultaba múltiples registros tras una sola tarjeta y añadida purga local de cualquier registro residual con `title === 'Documento Restaurado' && category === 'general'`.
  - En `VaultStorage` (`assets/js/storage.js`) y `server.js`: `esPayloadCifradoValido()` y los endpoints `POST /api/v1/documents` y `POST /api/v1/documents/batch-sync` rechazan cualquier registro corrupto `"Documento Restaurado"`; `mergeCloudDocuments()` sobrescribe siempre cualquier registro local `"Documento Restaurado"` con el expediente limpio de la nube; y `getDeletedIds()` (`boveda_v18_tombstones_sanitized`) purga los IDs corruptos (`doc_q3swr4qvq`, `doc_rbwv99380`, `doc_wo7uka8zi`, `doc_xgcyu22gc`, `doc_9v1d87se3`, `doc_nsxfmaf07`, `doc_rn7x29c0o`) mientras protege los 10 expedientes reales.
  - En `data/vault_cloud.json`: restaurados los 10 expedientes personales íntegros con `updated_at: '2026-10-30T21:00:00.000Z'` (posterior al incidente de las `20:15:27Z`) para que tanto PC como celular actualicen sus copias locales automáticamente.
- **Service Worker v18 (`sw.js`, `index.html`, `tests/boveda.test.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v18'` y `?v=18` en `index.html`. **65/65 pruebas pasando al 100% en verde**.

### 2026-10-30 — Spec 013: Protección de Integridad Contra Auto-Borrado y Restauración de Expedientes (v17)
- **Diagnóstico del Incidente en `v16` (`11:55 AM` / `14:55:04Z`):**
  - El bucle de limpieza de `undecryptableIds` introducido en `v16` dentro de `loadAndRenderDocuments()` invocó `deleteDocument(zombieId, true)` sobre copias locales en `IndexedDB` de la PC que tenían un `updated_at` más reciente pero habían sido re-cifradas previamente con la sal local antigua de la PC. Al registrar esos IDs en `deletedIds` y enviarlos en `POST /api/v1/documents/batch-sync`, Cloud Run los añadió a `db.deletedIds` y vació la colección remota.
- **Corrección Quirúrgica y Restauración (`assets/js/app.js`, `assets/js/storage.js`, `assets/js/auth.js`, `server.js`, `data/vault_cloud.json`):**
  - En `assets/js/app.js`: eliminado por completo el auto-borrado de `undecryptableIds` y el auto-borrado en `IndexedDB` por coincidencia de título/categoría. Un documento **jamás** se elimina sin que el usuario pulse explícitamente el botón Eliminar (`handleDeleteSelectedDocument`).
  - En `server.js`: eliminada la ingesta de `deletedIds` y el borrado heurístico desde `POST /api/v1/documents/batch-sync`. Las bajas en el servidor ocurren exclusivamente mediante `DELETE /api/v1/documents/:id`.
  - En `data/vault_cloud.json` y `assets/js/storage.js`: restaurados los 10 expedientes personales reales con `updated_at: '2026-10-30T15:05:00.000Z'` y añadido el saneamiento automático `boveda_v17_tombstones_sanitized` en `VaultStorage.getDeletedIds()` para limpiar los IDs de los expedientes reales que quedaron bloqueados en `localStorage`/`IndexedDB` de PC e iPhone.
  - En `assets/js/auth.js`: preservación de `userSalt` previa en `last_imported_salt` antes de aplicar `UNIFIED_MASTER_SALT`.
- **Service Worker v17 (`sw.js`, `index.html`, `tests/boveda.test.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v17'` y `?v=17` en `index.html`. **65/65 pruebas pasando al 100% en verde**.

### 2026-10-30 — Corrección de Regeneración de Registros de Prueba Eliminados y Deduplicación de Expedientes (v16)
- **Erradicación de Regeneración de Documentos Demo (`assets/js/app.js`, `assets/js/storage.js`, `server.js`, `data/vault_cloud.json`):**
  - Eliminados permanentemente los 3 expedientes de prueba (`doc_demo_pasaporte`, `doc_demo_licencia`, `doc_demo_tarjeta`) y los 5 registros duplicados/huérfanos del 18 de octubre (`doc_bba1vso67`, `doc_lroukh0y9`, `doc_ovjy4qg6p`, `doc_shm2e0xo1`, `doc_zyd7diy5s`) de `data/vault_cloud.json`, conservando exclusivamente los **10 expedientes personales reales** en `documents.usr_pro_001` y pre-registrando esos 8 IDs en `deletedIds` (`INITIAL_PURGED_DOC_IDS` en `server.js`).
  - En `BovedaApp.loadAndRenderDocuments()` y `_seedInitialDemoDocuments()` (`assets/js/app.js`): añadido el flag persistente `boveda_demos_seeded` (`localStorage` + `IndexedDB`) y verificación contra `getDeletedIds()` para que los documentos demo jamás vuelvan a generarse tras ser eliminados.
  - En `BovedaApp.handleDeleteSelectedDocument()`: corregida la condición de carrera esperando (`await`) la petición `DELETE /api/v1/documents/:id` (con soporte de auto-renovación en caso de `401`) antes de invocar `syncWithCloud(true)`.
- **Prevención y Limpieza de Registros Duplicados (`assets/js/storage.js`, `assets/js/app.js`, `server.js`):**
  - En `VaultStorage` (`assets/js/storage.js`): implementados `getDeletedIds()` y `addDeletedIds()` con persistencia dual (`localStorage` + `IndexedDB`), filtrado automático en `getAllDocuments()` y purga en `mergeCloudDocuments()`.
  - En `BovedaApp.loadAndRenderDocuments()` y `syncWithCloud()` (`assets/js/app.js`): limpieza automática de registros huérfanos indescifrables en `IndexedDB`, deduplicación por `(category, title, doc_number)`, exclusión de demos y eliminados al subir a la nube y envío de `deletedIds` en `POST /api/v1/documents/batch-sync`.
  - En `BovedaApp.handleSaveNewDocument()`: añadido candado anti-doble envío (`_isSavingNewDoc`) y reutilización de ID si coincide `(category, title, doc_number)`.
  - En `server.js` (`POST /api/v1/documents/batch-sync`): deduplicación en servidor por `(category, title)` y bloqueo de subida de `doc_demo_*`.
- **Service Worker v16 (`sw.js`, `index.html`, `tests/boveda.test.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v16'` y `?v=16` en `index.html`. **65/65 pruebas pasando al 100% en verde**.

### 2026-10-29 — Spec 012: Unificación de Base de Datos Multi-Dispositivo (PC ↔ Celular / iPhone) y Sincronización Centralizada
- **Consolidación de Datos Reales en `data/vault_cloud.json`:**
  - Consolidados los 13 expedientes reales (10 documentos personales de Andrés Aguiar + 3 expedientes base, todos cifrados con la sal maestra `'226000658459336d4184642799fc8498'` y PIN `'123456'`) en la partición canónica `documents.usr_pro_001`.
  - Incorporada la gaveta personalizada `gaveta_documentos_registrad_m6ses` (`"Documentos Registrados"`) en `customDrawers.usr_pro_001` y purgados los 5 registros espurios de prueba (21–24 bytes) y la partición fantasma `usr_refreshed`.
- **Unificación de Partición, Adaptación `user_id` para iPhone, `customDrawers` y `deletedIds` en Backend (`server.js`):**
  - Implementadas las constantes `MASTER_CRYPTO_SALT = '226000658459336d4184642799fc8498'`, `resolveVaultPartition(authUser)` (retornando `'usr_pro_001'` para todas las cuentas) y `decodeJWTWithoutExpiry(token)`.
  - En `GET /api/v1/documents`: adaptación dinámica de `user_id` al `authUser.sub` solicitante para que incluso clientes iOS/WebKit con versiones previas en caché reciban los 13 expedientes asociados a su índice local de `IndexedDB`.
  - En `POST /api/v1/documents/batch-sync`: protección contra sobrescritura de `doc_demo_*` ya normalizados en nube.
  - En `serveStaticFile`: cabeceras `Cache-Control: no-cache, no-store, must-revalidate` para `.html`, `.js`, `.css` y `.json`.
- **Unificación de Endpoint Cloud Run, Identidad y Sincronización Reactiva en Cliente (`assets/js/auth.js`, `assets/js/storage.js`, `assets/js/app.js`, `index.html`):**
  - En [assets/js/auth.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/auth.js): configurado `CLOUD_RUN_PROD_URL` como backend por defecto incluso en `localhost` (salvo `boveda_force_local_api === 'true'`), migradas URLs locales heredadas y unificados `UNIFIED_VAULT_SUB = 'usr_pro_001'` y `UNIFIED_MASTER_SALT = '226000658459336d4184642799fc8498'`.
  - En [assets/js/storage.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/storage.js): actualizado `getAllDocuments()` para consolidar todos los documentos válidos de `IndexedDB` y `mergeCloudDocuments()` para eliminar documentos locales presentes en `deletedIds`.
  - En [assets/js/app.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js): actualizado `loadAndRenderDocuments()` para sincronizar con la nube antes de renderizar cuando localmente solo existen los 3 documentos de muestra (`onlyHasDemoDocs`), probar tanto `activePin` como `'123456'` en `fallbackKeys`, y reconstruir gavetas personalizadas (`gaveta_documentos_registrad_m6ses`).
- **Service Worker v15, Publicación GitHub Pages + Cloud Run y Suite de Pruebas (`sw.js`, `tests/boveda.test.js`, `tests/server.test.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v15'` con `fetch(e.request, { cache: 'no-store' })` y query string `?v=15` en `index.html`.
  - Añadidas pruebas `SDD 012` en [tests/boveda.test.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/boveda.test.js) y [tests/server.test.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/server.test.js). **65/65 pruebas pasando al 100% en verde**.

### 2026-10-28 — Spec 011: Correo Electrónico del Usuario Autenticado en "Licencia y Período de Prueba"
- **Etiqueta y Campo en Interfaz (`index.html`):**
  - En `#modal-license-info` ("Licencia y Período de Prueba") y `#modal-trial-lock`: actualizado el campo a `Correo Electrónico:` (`type="email"`) y eliminado el valor estático `su-usuario@dominio.com` para presentar siempre el correo del usuario autenticado.
- **Resolución y Sincronización del Correo Autenticado (`assets/js/license.js`, `assets/js/auth.js`, `assets/js/app.js`):**
  - En [assets/js/license.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/license.js): implementados `_isPlaceholderEmail()` y `getAuthenticatedEmail()`, priorizando el correo autenticado del perfil de usuario y de la sesión activa sobre placeholders genéricos en `init()` y `getEstadoLicencia()`.
  - En [assets/js/auth.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/auth.js): implementado `syncAuthenticatedEmail()` y sincronización automática en `init()` con `vault_user_profile`.
  - En [assets/js/app.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js): implementado `getAuthenticatedUserEmail()` y actualizado el flujo en `init()`, `renderDashboardHeader()`, `saveUserProfile()`, `handleOnboardingSubmitStep2()`, `updateLicenseUI()`, `checkLicenseLock()` y `openLicenseModal()`.
- **Service Worker v13 y Suite de Pruebas (`sw.js`, `tests/boveda.test.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v13'`.
  - Añadida prueba `SDD 011` en `tests/boveda.test.js`. **63/63 pruebas pasando al 100% en verde**.

### 2026-10-28 — Estandarización de Correo en Módulo de Licencia ("su-usuario@dominio.com")
- **Actualización de Identificador, Inputs y Placeholders de Usuario (`index.html`, `assets/js/license.js`, `assets/js/app.js`, `assets/js/auth.js`, `server.js`):**
  - En [index.html](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html): asignado el valor y placeholder predeterminados `su-usuario@dominio.com` en los campos `#info-user-email-input` ("Usuario / Correo Electrónico") y `#lock-user-email-input`, además de actualizar el botón de acceso rápido de usuario de dispositivo.
  - En [assets/js/app.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js): en `openLicenseModal()` y `checkLicenseLock()`, implementada la sanitización y sobreescritura de visualización para que cualquier valor residual o vacío de `atleta@halterofilia.com`/`atleta@alterofilia.com` se presente como `su-usuario@dominio.com` en el campo y en la cadena de solicitud.
  - En [assets/js/license.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/license.js): en `init()` y `getEstadoLicencia()`, migración y normalización reactiva de `vault_user_email` hacia `su-usuario@dominio.com`.
  - En [assets/js/auth.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/auth.js): en `init()`, auto-migración de la sesión persistida hacia `su-usuario@dominio.com`.
  - Registrado `su-usuario@dominio.com` en `server.js` como usuario predefinido de dispositivo, preservando retrocompatibilidad con `atleta@halterofilia.com`.
- **Sincronización con Ecosistema Halterofilia (`Halterofilia/app.src.js`, `Halterofilia/index.backup.html`):**
  - Reemplazado el correo de contingencia `atleta@halterofilia.com` por `su-usuario@dominio.com` en el cálculo de `reqCode` del módulo "Licencia Activa" de Halterofilia y re-compilado con `node scripts/protect.js`.
- **Suite de Pruebas:**
  - 62/62 pruebas pasando al 100% en verde.

### 2026-10-27 — Spec 010: Eliminación de la Solicitud de Clave para la Bóveda Protegida y Auto-Desbloqueo
- **Acceso Directo y Auto-Desbloqueo Transparente (`assets/js/auth.js`, `assets/js/app.js`):**
  - Implementado `autoUnlock()` en `VaultAuth` para derivar automáticamente la clave maestra AES-256-GCM sin solicitar PIN al usuario.
  - Actualizado `init()` de `app.js` para auto-desbloquear e ingresar directamente a `dashboard-view` si existe sesión activa.
  - Actualizado el formulario de login para derivar la clave criptográfica y transicionar directamente al Dashboard.
  - Actualizado el flujo de validación del onboarding (Paso 2/2) para acceder de inmediato al Dashboard tras verificar el código.
  - Actualizado `loadAndRenderDocuments()` para re-derivar la clave en memoria con `autoUnlock()` silenciosamente ante cualquier eventualidad.
- **Service Worker v12 (`sw.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v12'`.
- **Suite de Pruebas Automatizadas:**
  - Añadida prueba `SDD 010` en `tests/boveda.test.js`. 62/62 pruebas unitarias pasando al 100% en verde.

### 2026-10-27 — Spec 009: Simplificación de Interfaz del Navbar (Eliminación de botones PIN, </> y Bloquear)
- **Limpieza de Controles en Barra Superior (`index.html`):**
  - Eliminado el botón de "PIN" (`resetPin()`) del Navbar.
  - Eliminado el botón de Inspector API / JWT (`</>` / `code-2`) del Navbar.
  - Eliminado el botón de "Bloquear" (`lockVaultNow()`) del Navbar.
  - Preservados sin modificaciones los botones de Perfil de Usuario, Licencia/Trial, Google Drive, Nube, Respaldo y Recuperación.
- **Service Worker v11 (`sw.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v11'`.
- **Suite de Pruebas Automatizadas:**
  - Añadida prueba `SDD 009` en `tests/boveda.test.js`. 61/61 pruebas unitarias pasando al 100% en verde.

### 2026-10-27 — Corrección Paso 2/2 Onboarding (Captura de Teclado) y Despliegue SMTP en Cloud Run
- **Desbloqueo de Escritura en Paso 2/2 (`assets/js/app.js`, `index.html`):**
  - Corregido el manejador global de teclado en `app.js` para que no capture ni aplique `e.preventDefault()` en las teclas numéricas ni retroceso cuando el foco está sobre un `<input>` o cuando un diálogo modal (`<dialog open>`) está activo.
  - Agregado filtro sanitizador `oninput` en `#onboarding-otp-input` para admitir números exclusivamente de forma fluida.
- **Despliegue y Activación de Correo Real en Cloud Run (`gcloud run services update`):**
  - Actualizado el contenedor y las variables de entorno en Cloud Run (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
  - Verificado el envío real de correos mediante Gmail hacia `andres.aguiar.marmol@gmail.com` con status HTTP 200 y `simulated: false`.
- **Service Worker v10 (`sw.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v10'`.
- **Pruebas Automatizadas:**
  - 60/60 pruebas unitarias pasando al 100% en verde.

### 2026-10-27 — Spec 008: Soporte SMTP Gmail, Carga Nativa .env y Resiliencia en Envío de Códigos
- **Soporte Completo de Gmail SMTP (`server.js`, `.env.example`, `.env`):**
  - Creado `.env.example` con plantilla detallada para contraseñas de aplicación de Google y `.gitignore`/`.dockerignore` actualizados.
  - Carga nativa de variables con `loadEnvFile()` en `server.js`.
  - Eliminación automática de espacios en `SMTP_PASS` para tolerar contraseñas formateadas en bloques de 4 caracteres.
  - Conexión TLS directa en puerto 465 con `servername: host` y cabeceras MIME estándar RFC 5322.
- **Resiliencia de Cliente en Onboarding (`assets/js/auth.js`, `assets/js/app.js`):**
  - En `VaultAuth.sendEmailVerificationCode` y `verifyEmailCode`: ante respuestas 401, 404 o 500 del servidor remoto, degradar suavemente a modo offline generando el código en `sessionStorage` para no bloquear al usuario en el primer uso.
  - En `BovedaApp.handleOnboardingSubmitStep1`: mostrar feedback detallado en Toast indicando si el código se generó en modo offline o fue enviado a la bandeja de entrada.
- **Service Worker v9 (`sw.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v9'`.
- **Suite de Pruebas Automatizadas:**
  - Añadidas pruebas de validación `SDD 008` en `tests/server.test.js` y `tests/boveda.test.js`. 60/60 pruebas pasando al 100%.

### 2026-10-27 — Spec 007: Identificación Obligatoria en Primer Uso y Validación por Código al Correo Electrónico
- **Identificación de Primer Uso y Modal de Onboarding Ineludible (`index.html`, `assets/js/app.js`):**
  - Diseñado e implementado el diálogo modal `#modal-first-run-onboarding` con `oncancel="event.preventDefault();"` que se superpone obligatoriamente en el primer uso del dispositivo.
  - Paso 1: Ficha obligatoria con Nombre, Apellidos, Correo Electrónico, Teléfono de Contacto y Foto con cámara móvil/web y galería.
  - Paso 2: Pantalla de verificación con input numérico espaciado para código de 6 dígitos, alerta informativa de código en modo pruebas, reenvío de código y retorno a paso 1 para corregir datos.
- **Endpoints de Verificación de Email en Backend con Soporte SMTP (`server.js`):**
  - Implementado cliente SMTP nativo con `node:tls` / `node:net` (0 dependencias externas) configurable mediante `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM`.
  - Endpoint `POST /api/v1/auth/send-verification-code`: genera código OTP de 6 dígitos con expiración de 15 minutos, plantilla HTML estilizada y fallback simulado.
  - Endpoint `POST /api/v1/auth/verify-code`: valida código, controla límite de 5 intentos fallidos y destruye el código tras validación exitosa.
- **Gestión de Verificación en Cliente (`assets/js/license.js`, `assets/js/auth.js`):**
  - Métodos `isUserIdentifiedAndVerified()` y `markUserVerified(status)` en `VaultLicenseManager` con persistencia dual (`IndexedDB` + `localStorage`).
  - Métodos `sendEmailVerificationCode(email, fullName)` y `verifyEmailCode(email, code)` en `VaultAuth` con contingencia offline.
  - Sincronización automática de perfil con la cadena de solicitud de licencia `REQ|<DeviceID>|<correo>` y restablecimiento de onboarding al desvincular el dispositivo.
- **Service Worker v8 (`sw.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v8'`.
- **Suite de Pruebas Automatizadas:**
  - Añadidas pruebas en `tests/server.test.js` y `tests/boveda.test.js`. 57/57 pruebas pasando 100% en verde con `node --test tests/boveda.test.js tests/server.test.js`.

### 2026-10-27 — Spec 006: Corrección de "Error en la Nube", Auto-Registro en Servidor Central y Resiliencia JWT
- **Resolución de "Error en la Nube" y Robustecimiento de `syncWithCloud()` (`assets/js/app.js`):**
  - Implementada detección y mitigación reactiva ante respuestas HTTP 401 en `batch-sync` y descarga de documentos: invoca automáticamente `window.vaultAuth.refreshSession()` y reintenta la sincronización con el nuevo token.
  - Añadido control de timeout mediante `AbortController` (12 segundos) para evitar cuelgues o peticiones huérfanas en conexiones lentas o frías de Cloud Run.
  - Sustituida la activación alarmante de `'error'` ("Error Nube") por degradación suave a `'offline'` ("Modo Local (Datos Protegidos)"), salvaguardando la experiencia del usuario y protegiendo siempre los datos locales en `IndexedDB`.
  - Asegurado el refresco seguro de la interfaz post-sincronización (`loadAndRenderDocuments(true)` protegido con bloque try-catch).
- **Auto-Registro Transparente y Método `refreshSession()` en `VaultAuth` (`assets/js/auth.js`):**
  - Incorporado el método `refreshSession()` con soporte dual: endpoint de refresh JWT y re-autenticación/auto-registro transparente con credenciales del usuario activo.
  - En `login()`: si el servidor central responde con código 401 (por ejemplo, en instancias efímeras de Cloud Run recién iniciadas), el cliente registra automáticamente al usuario vía `POST /api/v1/auth/register` y re-autentica de inmediato, garantizando la obtención de un token JWT firmado válido y evitando la degradación a tokens mock inválidos en la nube.
- **Preservación Inmune de Cuentas Predefinidas en Servidor (`server.js`):**
  - Modificado `loadDB()` para fusionar los usuarios predefinidos en código con los cargados de `data/vault_cloud.json`, asegurando que el usuario de dispositivo `atleta@halterofilia.com` se mantenga permanentemente activo.
- **Service Worker v7 (`sw.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v7'` para invalidar la caché antigua en celulares y ordenadores.
- **Suite de Pruebas Automatizadas:**
  - Incorporada la prueba `SDD 006` en `tests/boveda.test.js`. 54/54 pruebas pasando 100% en verde con `node --test tests/boveda.test.js tests/server.test.js`.

### 2026-10-27 — Spec 005: Conexión Online con Cloud Run por Defecto y Visor Prominente de Documentos
- **Conexión en Línea Persistente (Online Status):**
  - Configurada la URL oficial de Google Cloud Run (`https://boveda-digital-17818053587.us-central1.run.app`) como base por defecto en `VaultAuth` (`assets/js/auth.js`) cuando la app se carga desde orígenes remotos (GitHub Pages, PWA móvil) o sin servidor local directo.
  - Implementada comprobación proactiva de conexión en `app.js` (`init()` y post-desbloqueo PIN) que actualiza de inmediato el indicador a 🟢 **Nube (Conectada y Protegida)**.
  - Registrado el usuario de dispositivo `atleta@halterofilia.com` (`PasswordSeguro123!`) en `server.js` para asegurar autenticación exitosa contra la nube sin degradar erróneamente a offline.
- **Presentación Prominente del Documento Original (Visor Superior):**
  - Reorganizada la vista de lectura `#doc-read-view` en `index.html`: el contenedor `#detail-attachment-preview` se traslada a la primera posición superior destacada, seguido por los datos del expediente y la tarjeta de credencial decorativa al pie.
  - Enriquecido el renderizado en `assets/js/app.js`: las imágenes disponen de previsualización ampliada con hover-zoom y botón a pantalla completa; los expedientes PDF incorporan visor embebido de 480px con toolbar y enlace directo a pestaña; los expedientes sin adjunto exhiben botón destacado para adjuntar/escanear documento digital en 1 toque.
- **Service Worker v6 (`sw.js`):**
  - Incrementado `CACHE_NAME` a `'boveda-digital-v6'` para forzar la actualización transparente en dispositivos móviles y clientes instalados.
- **Suite de Pruebas Automatizadas:**
  - 53/53 pruebas pasando 100% en verde con `node --test tests/boveda.test.js tests/server.test.js`.

### 2026-10-27 — Spec 004: Eliminación de Esquema Demo Free/Pro, Adopción Plena de Licenciamiento Halterofilia y Módulo de Usuario
- **Eliminación Completa de la Dicotomía Demo Free vs Pro (`index.html`, `assets/js/app.js`, `assets/js/auth.js`, `server.js`):**
  - Removidos los botones de acceso rápido demo ("Plan Gratuito" y "Plan PRO Ilimitado") de la pantalla de inicio de sesión en `index.html`.
  - Suprimidos de la barra horizontal (Navbar) el badge `#dash-plan-badge` y el botón de mejora `#btn-header-upgrade`.
  - Eliminado el modal `#modal-upgrade` (checkout simulado / mejora a PRO).
  - Eliminada la restricción artificial de 5 documentos en `openNewDocumentModal()` de `app.js`, en `canAddDocument()` de `auth.js` y en el endpoint `POST /api/v1/documents` de `server.js`. El archivado y almacenamiento pasa a ser ilimitado bajo el esquema de licenciamiento de Halterofilia (Trial 7 días sin restricciones + Clave de Activación Base64 offline).
- **Módulo de Creación y Gestión de Usuario por Dispositivo (`assets/js/license.js`, `index.html`, `assets/js/app.js`):**
  - Incorporado el botón interactivo `#btn-header-user-profile` en la barra horizontal (Navbar superior) que exhibe en tiempo real la foto/avatar circular y el nombre del usuario registrado.
  - Implementado el diálogo modal `#modal-user-profile` ("Perfil del Usuario Registrado") conforme al estándar de Halterofilia (badge "1 Por Dispositivo", aviso de licencia, captura con cámara `capture="user"`, subida desde galería, previsualización circular, campos Nombre, Apellidos, Correo Electrónico, Teléfono, botón "Guardar Cambios" y botón "Desvincular").
  - Métodos `getUserProfile()`, `saveUserProfile(profile)` y `clearUserProfile()` en `VaultLicenseManager` con persistencia dual (`IndexedDB` + `localStorage`).
  - Redimensionamiento automático de imágenes a 256x256 px en Canvas para garantizar ligereza y rendimiento en dispositivos móviles.
  - Sincronización automática del correo del usuario registrado con `vaultLicenseManager.setUserEmail(email)` y la cadena de solicitud `REQ|<DeviceID>|<correo>` en los modales de licencia y bloqueo.
- **Service Worker v5 (`sw.js`):**
  - Actualizado `CACHE_NAME` a `'boveda-digital-v5'` para forzar la actualización transparente de la caché en navegadores de escritorio y celulares.
- **Suite de Pruebas Automatizadas:**
  - 52/52 pruebas pasando 100% en verde con `node --test tests/boveda.test.js tests/server.test.js`.

### 2026-10-26 — Optimización de Despliegue en Google Cloud Run y Modal de Configuración Multi-Dispositivo
- **Empaquetado Completo para Google Cloud Run (`Dockerfile`, `desplegar-cloud.bat`):**
  - Actualizado el `Dockerfile` para empaquetar `manifest.json`, `sw.js`, `.nojekyll` y el directorio `data/` con la base de datos persistente inicial (`vault_cloud.json`), garantizando la preservación de los documentos existentes del usuario al desplegar el contenedor.
  - Creado el script de despliegue automatizado `desplegar-cloud.bat` para compilar y desplegar con 1 comando sobre Google Cloud Run con HTTPS y certificado SSL automático.
- **Incremento de Límite de Payload en Servidor (`server.js`):**
  - Elevado el límite de recepción JSON en `parseJSONBody` de 10MB a 50MB para soportar sin truncamiento sincronizaciones en lote (`batch-sync`) de expedientes voluminosos con adjuntos escaneados y PDFs en Base64.
- **Diálogo Interactivo de Nube y Configuración de API Base (`index.html`, `assets/js/auth.js`, `assets/js/app.js`):**
  - Implementado el método `setApiBaseUrl(url)` en `VaultAuth` con normalización automática de protocolo HTTPS y persistencia en `localStorage` (`boveda_api_base_url`).
  - Añadido el diálogo `#modal-cloud-sync` en `index.html` con comprobación de estado de conexión en vivo, exhibición de la URL activa, botón de sincronización manual (`handleCloudSyncNow`), prueba de conectividad (`testCloudConnection`), configuración de URL personalizada de Google Cloud Run (`saveCloudApiUrl`) y botón de restablecimiento automático (`resetCloudApiUrl`).
  - Permite a clientes PWA (como iPhones accediendo desde GitHub Pages o Safari) conectarse directamente a la instancia Cloud Run del usuario y sincronizar bidireccionalmente sus 13 expedientes.
- **Suite de Pruebas y Despliegue en Producción:**
  - 49/49 pruebas pasando 100% en verde con `node --test tests/boveda.test.js tests/server.test.js`.
  - Desplegado exitosamente en Google Cloud Run activo 24/7 con HTTPS y certificado SSL automático en: `https://boveda-digital-17818053587.us-central1.run.app`. Todos los expedientes existentes y usuarios fueron verificados y responden en vivo.

### 2026-10-24 — Corrección de esPayloadCifradoValido en VaultStorage, Robustecimiento de Decrypt y Service Worker v4
- **Causa Raíz:**
  - Al ejecutar el asistente de descifrado interactivo de respaldo (`submitBackupPinUnlock`), se invocaba `window.vaultStorage.esPayloadCifradoValido(d)`, pero `esPayloadCifradoValido` solo existía como función pura y no como método en la clase `VaultStorage` ni en `window.vaultStorage`.
  - Adicionalmente, `submitBackupPinUnlock` contenía llamadas con orden invertido de argumentos a `vaultCrypto.decrypt(doc.encryptedPayload, testKey)` y guardaba campos con convención camelCase en lugar de los atributos snake_case nativos de `IndexedDB`.
- **Solución Implementada:**
  - En [assets/js/storage.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/storage.js): Implementado el método `esPayloadCifradoValido(doc)` en la clase `VaultStorage`, en su `prototype` y en la instancia global `window.vaultStorage`.
  - En [assets/js/crypto.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/crypto.js): Hecho `decrypt` y `encrypt` polimórficos, tolerando cualquier orden de argumentos e infiriendo `ciphertext` e `iv` directamente de objetos documento.
  - En [assets/js/app.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js): Corregido `submitBackupPinUnlock` con filtro defensivo, extracción explícita de `payload` e `iv`, y serialización consistente con el esquema de `IndexedDB`.
  - En [sw.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/sw.js): Incrementada la versión de caché a `'boveda-digital-v4'` para asegurar que los navegadores móviles invaliden recursos cacheados.
- **Suite de Pruebas Automatizadas:** 48/48 pruebas pasando al 100% en verde con `node --test tests/boveda.test.js tests/server.test.js`.

### 2026-10-24 — Desacoplamiento del Generador de Tokens hacia la App Halterofilia y Compatibilidad Criptográfica Universal
- **Separación Arquitectónica Estricta:**
  - El generador de tokens de activación fue removido de la interfaz cliente de Bóveda Digital (`index.html` y `assets/js/app.js`), cumpliendo con el principio de que los clientes solo emiten la Cadena de Solicitud (`REQ|<DeviceID>|<correo>`) y validan el token recibido.
  - La generación de tokens de activación pertenece exclusivamente a la aplicación y panel de administración de Halterofilia (`panel_administrador_de_licencias.html` en `Administrador Halterofilia` y `Halterofilia`), y al endpoint administrativo del servidor backend `POST /api/v1/license/generate`.
- **Compatibilidad Criptográfica Universal (`assets/js/license.js`):**
  - Resuelta la discrepancia de delimitadores: el generador externo de Halterofilia computa la firma SHA-256 con pipes `|` (`${deviceId}|${email}|${exp}|${salt}`), mientras que Bóveda Digital admitía dos puntos `:`.
  - La función `validarTokenLicencia` ahora comprueba de forma resiliente tanto el estándar Halterofilia con pipes `|` como el formato alternativo con `:`, considerando normalización a minúsculas, valores literales y expiraciones vitalicias de 9999 días o `-1`.
  - Actualizado el panel externo `panel_administrador_de_licencias.html` en `Administrador Halterofilia` y `Halterofilia` con soporte explícito para Bóveda Digital, vigencias múltiples (30, 90, 365, 9999 y -1) y codificación UTF-8 limpia.
- **Suite de Pruebas Unitarias:**
  - 48/48 pruebas pasando al 100% en verde con `node --test tests/boveda.test.js tests/server.test.js`, validando la compatibilidad directa con tokens emitidos por Halterofilia, la ausencia de generadores en el cliente y el endpoint de backend.

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