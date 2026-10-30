# Tareas de Implementación 014

- [x] **T01:** Diagnosticar en Cloud Run y código fuente la causa de `"Documento Restaurado"` y la desincronización entre PC y celular.
- [x] **T02:** Corregir `submitBackupPinUnlock()` y `loadAndRenderDocuments()` en `assets/js/app.js`.
- [x] **T03:** Actualizar `esPayloadCifradoValido()`, `mergeCloudDocuments()` y `boveda_v18_tombstones_sanitized` en `assets/js/storage.js`.
- [x] **T04:** Blindar `server.js` contra registros `"Documento Restaurado"` y restaurar los 10 documentos canónicos en `data/vault_cloud.json` con `updated_at: "2026-10-30T21:00:00.000Z"`.
- [x] **T05:** Actualizar `sw.js` (`v18`), `index.html` (`?v=18`), pruebas automatizadas (`tests/boveda.test.js`) y `memory.md`.
- [x] **T06:** Publicar en GitHub (`origin/main`), desplegar a Google Cloud Run y verificar `GET /api/v1/documents` en producción.
