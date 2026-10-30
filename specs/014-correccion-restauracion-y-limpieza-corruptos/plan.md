# Plan de Implementación 014: Corrección de Restauración y Limpieza de Registros Corruptos

## 1. Archivos a Modificar (Sin alterar funcionalidad existente)

1. **[`assets/js/app.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js)**:
   - En `submitBackupPinUnlock()` (líneas 3365–3405): preservar `item.originalDoc.title`, `item.originalDoc.category`, `item.originalDoc.expiry_date` y todos los campos del esquema actual (`doc_number`, `issuer`, `issue_date`, `expiry_date`, `tags`, `notes`, `attachment`) al re-cifrar con el PIN maestro actual, e invocar `await this.syncWithCloud(true)`.
   - En `loadAndRenderDocuments()` (líneas 382–420): si se detecta un registro residual corrupto (`raw.title === 'Documento Restaurado' && raw.category === 'general'`) que no sea uno de los 10 IDs canónicos, eliminarlo de `IndexedDB`; además, retirar el filtro en memoria `seenKeys` que ocultaba múltiples copias corruptas detrás de una sola tarjeta.
2. **[`assets/js/storage.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/storage.js)**:
   - En `esPayloadCifradoValido(doc)`: rechazar cualquier documento con `doc.title === 'Documento Restaurado' && doc.category === 'general'`.
   - En `INITIAL_PURGED_IDS` y `getDeletedIds()`: añadir los IDs corruptos (`doc_q3swr4qvq`, `doc_rbwv99380`, `doc_wo7uka8zi`, `doc_xgcyu22gc`, `doc_9v1d87se3`, `doc_nsxfmaf07`, `doc_rn7x29c0o`) y elevar la bandera de saneamiento a `boveda_v18_tombstones_sanitized` para limpiar de `boveda_deleted_doc_ids` los 10 IDs canónicos.
   - En `mergeCloudDocuments(cloudDocs)`: permitir que un documento válido de la nube sobrescriba siempre a un registro local corrupto cuyo `existing.title === 'Documento Restaurado'`.
3. **[`server.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/server.js) y [`data/vault_cloud.json`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/data/vault_cloud.json)**:
   - En `server.js`: añadir los 7 IDs corruptos a `INITIAL_PURGED_DOC_IDS`, y en `esDocumentoCifradoValido(doc)` rechazar cualquier payload corrupto con `doc.title === 'Documento Restaurado' && doc.category === 'general'` para que ningún cliente con caché vieja pueda volver a contaminar la nube.
   - En `data/vault_cloud.json`: fijar `updated_at: "2026-10-30T21:00:00.000Z"` en los 10 documentos canónicos y actualizar `deletedIds` con `INITIAL_PURGED_DOC_IDS`.
4. **[`sw.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/sw.js) y [`index.html`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html)**:
   - Actualizar versión de Service Worker a `boveda-digital-v18` y referencias `?v=18`.
5. **[`tests/boveda.test.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/boveda.test.js) y [`memory.md`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/memory.md)**:
   - Añadir pruebas de regresión para SDD 014 y documentar en `memory.md`.

