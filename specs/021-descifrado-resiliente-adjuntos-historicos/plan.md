# Plan de Implementación SDD 021

## Fases
1. **Fase 1: Motor de Descifrado Resiliente y Auto-Migración de Adjuntos (`assets/js/app.js`)**
   - Implementar método `decryptAttachmentWithFallback(doc)`.
   - Modificar `openDocumentDetail(docId)` para usar el descifrado resiliente.
   - Modificar `downloadDecryptedAttachment(docId)` para usar el descifrado resiliente.
   - Modificar `submitBackupPinUnlock()` para re-cifrar los adjuntos con `activeMasterKey`.
2. **Fase 2: Normalización en Reposo de `data/vault_cloud.json` y Sincronización Server**
   - Ejecutar script de normalización en `data/vault_cloud.json` re-cifrando los 5 adjuntos con sal `ae87...` hacia `MASTER_CRYPTO_SALT` (`2260...`).
   - Sincronizar los 5 documentos re-cifrados directamente hacia el endpoint `/api/v1/documents/batch-sync` de Cloud Run.
3. **Fase 3: Versión de Service Worker y Pruebas Automatizadas**
   - Actualizar `sw.js` a `boveda-digital-v24` y en `index.html`.
   - Actualizar assertions en `tests/boveda.test.js` para aceptar `v24` y agregar caso de prueba para descifrado resiliente de adjuntos.
   - Ejecutar suite `node --test tests/boveda.test.js tests/server.test.js`.
4. **Fase 4: Despliegue en Google Cloud Run y Memoria**
   - Actualizar `memory.md`.
   - Commit y push a GitHub (`main`).
   - Desplegar en Google Cloud Run (`gcloud run deploy`).

