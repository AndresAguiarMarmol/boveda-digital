# SDD 021: Descifrado Resiliente y Auto-Migración de Adjuntos Cifrados con Sales Históricas

## 1. Contexto y Diagnóstico
Al abrir o recuperar ciertos documentos en la Bóveda Digital (específicamente "Contrato Mariam Aguiar", "Documento Alquiler VC 2026", "Rut con Residencia Definitiva", entre otros), la interfaz presentaba el mensaje:
`"No se pudo descifrar la vista previa del archivo adjunto con la clave activa"`
junto a un botón modal `"Ingresar PIN de Respaldo"`.

### Causa Raíz
1. **Desincronización de Cifrado en Profundidad (Cifrado Anidado):**
   - El documento posee un cifrado exterior (`encrypted_payload`) con la sal unificada activa `MASTER_CRYPTO_SALT = '226000658459336d4184642799fc8498'`.
   - Por tanto, el título, categoría y metadatos se descifran sin problemas con `masterKey`.
   - Sin embargo, dentro del JSON descifrado, el objeto `payload.attachment.ciphertext` fue cifrado originariamente con una sal histórica (`ae8713595fed1e759db1062454187513`) y el PIN del usuario.
2. **Ausencia de Fallback en el Visor y Descargador de Adjuntos:**
   - En `openDocumentDetail(docId)` y `downloadDecryptedAttachment(docId)`, la aplicación invocaba exclusivamente `vaultCrypto.decryptFile(window.vaultAuth.masterKey, doc.attachment.ciphertext, ...)`.
   - Al no coincidir la clave derivada de la sal activa con la sal histórica del adjunto, la API Web Crypto lanzaba una excepción de autenticación AES-GCM (`OperationError`).
   - El bloque `catch` mostraba el botón `#modal-backup-pin-prompt`.
3. **Omisión de Re-cifrado de Adjuntos en el Desbloqueo por PIN de Respaldo:**
   - En `submitBackupPinUnlock()`, al ingresar el PIN, el sistema re-cifraba el envoltorio JSON exterior del documento con `activeMasterKey`, pero copiaba el campo `plain.attachment` idéntico (`ciphertext` original sin modificar). Por ende, el adjunto seguía cifrado con la sal antigua indefinidamente.

## 2. Solución Arquitectónica
1. **Descifrado Multi-Sal Resiliente de Adjuntos (`decryptAttachmentWithFallback`):**
   - Intentar descifrado primario con `window.vaultAuth.masterKey`.
   - Si falla, iterar sobre claves candidatas derivadas a partir de los PINs conocidos (`activePin`, `'123456'`) y las sales del sistema (`2260...`, `ae87...`, `5e1f...`, etc.).
   - Al descifrar exitosamente el archivo (Blob), re-cifrar inmediatamente el adjunto con la clave maestra activa (`vaultCrypto.encryptFile`).
   - Actualizar el registro local (`doc.attachment`) en `IndexedDB` y re-sincronizar con el servidor central para consolidar la migración definitiva.
2. **Re-cifrado en Caliente en `submitBackupPinUnlock`:**
   - Al desbloquear con PIN de respaldo, si el documento contiene un adjunto (`plain.attachment.ciphertext`), descifrarlo con la clave exitosa del respaldo y re-cifrarlo con `activeMasterKey`.
3. **Normalización de Base de Datos Cloud:**
   - Re-cifrar los adjuntos con sal histórica (`ae87...`) en `data/vault_cloud.json` y desplegar a Google Cloud Run.
4. **Actualización de Service Worker y Suite de Pruebas:**
   - Elevar Service Worker a `boveda-digital-v24`.
   - Incorporar pruebas unitarias en `tests/boveda.test.js`.
