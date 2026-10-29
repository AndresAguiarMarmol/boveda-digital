# Plan de Implementación Técnica (Spec 012): Unificación de Base de Datos Multi-Dispositivo (PC ↔ Celular)

**Referencia:** `specs/012-unificacion-bd-multidispositivo/spec.md`  
**Fecha:** 2026-10-29

---

## 1. Arquitectura de la Solución

### Fase 1: Consolidación y Partición Canónica en Backend (`server.js` y `data/vault_cloud.json`)
1. **Depuración y Consolidación de `data/vault_cloud.json`:**
   - Eliminar los 5 registros de prueba espurios (`Pasaporte Cifrado` de 21 bytes y `Certificado Médico Cifrado` de 24 bytes) y la partición huérfana `usr_refreshed`.
   - Unificar los 10 expedientes personales reales de Andrés Aguiar + los 3 expedientes demo (13 expedientes en total, todos re-verificados con la sal maestra `'226000658459336d4184642799fc8498'`) bajo la partición principal `usr_pro_001`.
   - Registrar a `andres.aguiar.marmol@gmail.com` en la lista de usuarios base (`db.users`) con `id: 'usr_pro_001'`, `plan: 'pro'` y `cryptoSalt: '226000658459336d4184642799fc8498'`.
2. **Resolución Canónica de Bóveda en `server.js` (`resolveVaultPartition`):**
   - Implementar `resolveVaultPartition(authUser)` en `server.js` para que las cuentas de dispositivo del titular (`usr_pro_001`, `usr_device_atleta`, `usr_device_su_usuario`, `usr_refreshed`, `andres.aguiar.marmol@gmail.com`, `andres.pro@boveda.com`, `atleta@halterofilia.com`, `su-usuario@dominio.com`) operen sobre la misma colección maestra `usr_pro_001` en `db.documents`, manteniendo aislados únicamente los usuarios de pruebas unitarias (`demo.free@boveda.com` / `usr_free_002` en entorno de test).
   - Implementar seguimiento de documentos eliminados (`db.deletedIds`) en `DELETE /api/v1/documents/:id` y devolver `deletedIds` en `GET /api/v1/documents` para que cuando un documento se borre en la PC, el Celular también lo elimine de su `IndexedDB` local al sincronizar.
   - Corregir `POST /api/v1/auth/refresh` con `decodeJWTWithoutExpiry(token)` para conservar siempre el `sub`, `email` y `crypto_salt` originales del usuario.
   - Hacer que `POST /api/v1/auth/register` genere un `id` determinista a partir del email y asigne el `cryptoSalt` maestro `'226000658459336d4184642799fc8498'` para que cualquier dispositivo nuevo derive exactamente la misma clave AES-256-GCM.

### Fase 2: Unificación de Endpoint Cloud y Criptografía Determinista en Cliente (`assets/js/auth.js`)
1. **Conexión Unificada a Cloud Run por Defecto:**
   - En `VaultAuth` (`constructor` y `setApiBaseUrl`), establecer `defaultBaseUrl = CLOUD_RUN_PROD_URL` (`https://boveda-digital-17818053587.us-central1.run.app`) incluso si se ejecuta desde `localhost` o `127.0.0.1` (salvo que `localStorage.getItem('boveda_force_local_api') === 'true'`).
   - Si `localStorage.getItem('boveda_api_base_url')` contiene `http://localhost` o `http://127.0.0.1` sin el flag forzado, migrarlo automáticamente a `CLOUD_RUN_PROD_URL`.
2. **Identidad y Sal Deterministas en Contingencia Offline y `syncAuthenticatedEmail`:**
   - En `VaultAuth.login()` (contingencia local) y `autoUnlock()`, usar siempre la sal unificada `'226000658459336d4184642799fc8498'` y un `sub` determinista (`'usr_pro_001'`), evitando crear particiones aleatorias en `IndexedDB`.
   - En `syncAuthenticatedEmail()`, sincronizar el correo y refrescar la sesión JWT contra el servidor central si está en línea.

### Fase 3: Consolidación de `IndexedDB` y Sincronización Reactiva (`assets/js/storage.js` y `assets/js/app.js`)
1. **Filtro Estricto de Payloads y Consolidación Multi-Partición en `VaultStorage`:**
   - Reforzar `esPayloadCifradoValido(doc)` en `assets/js/storage.js` para descartar payloads de prueba (`U2FsdGVkX1_`, `U2FsdGVkX1+`, longitudes `< 32`).
   - En `getAllDocuments(userId)`: consolidar todos los documentos válidos existentes en el almacén local `documents` de `IndexedDB` (incluso si fueron guardados previamente con otro `user_id` local en ese dispositivo), normalizando su `user_id` para que ningún expediente creado en PC o Celular quede oculto.
   - En `mergeCloudDocuments(cloudDocs, deletedIds)`: aplicar también la eliminación local de cualquier ID presente en `deletedIds`.
2. **Sincronización Reactiva en `BovedaApp` (`assets/js/app.js`):**
   - Evitar que `loadAndRenderDocuments()` siembre los 3 documentos demo antes de la primera sincronización con la nube si el servidor está conectado.
   - Añadir listeners automáticos en `window` (`focus`, `online` y `document.visibilitychange`) con debounce para sincronizar con la nube cada vez que el usuario pasa de la PC al Celular o viceversa.

### Fase 4: Caché PWA, Despliegue en Cloud Run y Suite de Pruebas (`sw.js`, `tests/`)
1. Actualizar `CACHE_NAME` a `'boveda-digital-v14'` en `sw.js`.
2. Añadir pruebas `SDD 012` en `tests/boveda.test.js` y `tests/server.test.js`.
3. Desplegar la actualización en Google Cloud Run (`https://boveda-digital-17818053587.us-central1.run.app`) para que tanto la PC como el Celular reciban de inmediato la base de datos unificada con los 13 expedientes reales.

