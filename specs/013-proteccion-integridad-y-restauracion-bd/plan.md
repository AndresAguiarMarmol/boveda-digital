# Plan de Implementación Técnica (Spec 013): Protección de Integridad y Restauración de Expedientes

## 1. Arquitectura de la Corrección (Quirúrgica, Sin Tocar lo que Funciona)

1. **`data/vault_cloud.json`:**
   - Actualizar `updated_at` de los expedientes reales en `documents.usr_pro_001` a `'2026-10-30T15:05:00.000Z'` para garantizar que `mergeCloudDocuments()` actualice cualquier copia local desfasada en `IndexedDB`.
   - Fijar `deletedIds` estrictamente en los 8 IDs depurados (`['doc_demo_pasaporte', 'doc_demo_licencia', 'doc_demo_tarjeta', 'doc_bba1vso67', 'doc_lroukh0y9', 'doc_ovjy4qg6p', 'doc_shm2e0xo1', 'doc_zyd7diy5s']`).

2. **`server.js`:**
   - En `POST /api/v1/documents/batch-sync`:
     - Eliminar la ingesta de `deletedIds` desde el body de `batch-sync` y eliminar la heurística que añadía supuestos duplicados a `db.deletedIds`.
     - Las eliminaciones en la nube quedan restringidas exclusivamente a `DELETE /api/v1/documents/:id` (acción explícita del usuario).

3. **`assets/js/storage.js` (`VaultStorage`):**
   - Definir `CANONICAL_RESTORED_IDS` con los IDs de los expedientes reales (`doc_huzcvq2ff`, `doc_ekd0onmfw`, `doc_ps25oua80`, `doc_9lskrlugo`, `doc_yjdulku41`, `doc_kzs5fj88v`, `doc_rehd8z4vp`, `doc_teu75glli`, `doc_vqp0qhkbm`, `doc_ymzsioywq`).
   - En Una migración única (`boveda_v17_tombstone_sanitized`), remover esos IDs de `boveda_deleted_doc_ids` (`localStorage`) y `deletedDocIds` (`IndexedDB`) para deshacer el bloqueo local causado por `v16`.

4. **`assets/js/app.js` (`BovedaApp`):**
   - En `loadAndRenderDocuments()`:
     - Eliminar el bloque que borraba `undecryptableIds` (`deleteDocument(zombieId, true)`).
     - Eliminar el bloque que borraba documentos de `IndexedDB` por coincidencia de `dedupKey`.
   - En `syncWithCloud()`:
     - No filtrar `localDocs` contra `this.unlockedDocuments` (para evitar que una sincronización previa al descifrado omita documentos válidos).

5. **`assets/js/auth.js` (`VaultAuth`):**
   - En `init()`: si `userSalt` previa es distinta de `this.UNIFIED_MASTER_SALT`, guardarla en `last_imported_salt` para que `fallbackKeys` siempre la incluya.

6. **`sw.js` e `index.html`:**
   - Actualizar `CACHE_NAME` a `'boveda-digital-v17'` y `?v=17` en `index.html`.
