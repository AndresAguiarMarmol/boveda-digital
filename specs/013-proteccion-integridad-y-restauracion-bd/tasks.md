# Lista de Tareas (Spec 013): Protección de Integridad y Restauración de Expedientes

- [x] **T1:** Diagnosticar en logs de Cloud Run la causa exacta de la desaparición de los documentos en `v16` y documentar `spec.md`, `plan.md` y `tasks.md` en `specs/013-proteccion-integridad-y-restauracion-bd/`.
- [x] **T2:** Actualizar `data/vault_cloud.json` con `updated_at` renovado en los expedientes reales y `deletedIds` limpio.
- [x] **T3:** Eliminar en `server.js` (`POST /api/v1/documents/batch-sync`) la propagación de `deletedIds` por lote y la heurística de borrado por título/categoría.
- [x] **T4:** Eliminar en `assets/js/app.js` (`loadAndRenderDocuments`) el auto-borrado de `undecryptableIds` y el auto-borrado por `dedupKey`, y sanear tombstones envenenados en `assets/js/storage.js`.
- [x] **T5:** Preservar `userSalt` local anterior en `last_imported_salt` dentro de `assets/js/auth.js`.
- [x] **T6:** Actualizar `sw.js` a `boveda-digital-v17` (`?v=17` en `index.html`), ejecutar suite de pruebas (`tests/boveda.test.js` y `tests/server.test.js`), actualizar `memory.md`, subir a GitHub y desplegar en Google Cloud Run.
