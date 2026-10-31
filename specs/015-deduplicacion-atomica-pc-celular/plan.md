# Plan de Implementación 015: Deduplicación Atómica PC-Celular (`v19`)

## 1. Archivos a Modificar (Sin alterar funcionalidad existente)

1. **[`assets/js/app.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js)**:
   - En `loadAndRenderDocuments()`:
     - Reemplazar la mutación directa de `this.unlockedDocuments.push(...)` durante el bucle `async` por un arreglo local `const unlockedList = []` y control de secuencia `this._loadRenderSeq`.
     - Deduplicar `unlockedList` por `id` y por `(category, title, doc_number)`, priorizando los IDs canónicos de la nube y limpiando de `IndexedDB` (con `recordTombstone = false`) cualquier copia duplicada local con ID redundante.
   - En `syncWithCloud()`:
     - Añadir cerrojo `this._isSyncingWithCloud` para evitar llamadas paralelas desde `focus` / `visibilitychange` / `online` / `loadAndRenderDocuments`.
2. **[`assets/js/storage.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/storage.js)**:
   - Actualizar `canonicalProtectedIds` con los 11 expedientes activos del usuario (`doc_huzcvq2ff`, `doc_ekd0onmfw`, `doc_ps25oua80`, `doc_9lskrlugo`, `doc_yjdulku41`, `doc_kzs5fj88v`, `doc_rehd8z4vp`, `doc_teu75glli`, `doc_vqp0qhkbm`, `doc_a7fmu6aij`, `doc_y56couzw3`).
3. **[`server.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/server.js) y [`data/vault_cloud.json`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/data/vault_cloud.json)**:
   - En `POST /api/v1/documents/batch-sync`, evitar la inserción de copias duplicadas con distinto `id` cuando ya existe un expediente con la misma `(category, title)`.
   - Consolidar los 11 expedientes activos en `data/vault_cloud.json`.
4. **[`sw.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/sw.js), [`index.html`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html), [`tests/boveda.test.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/boveda.test.js) y [`memory.md`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/memory.md)**:
   - Actualizar a `boveda-digital-v19` (`?v=19`), actualizar pruebas y documentar en `memory.md`.

