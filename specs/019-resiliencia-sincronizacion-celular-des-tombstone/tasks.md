# Tareas de Implementación — Especificación 019: Resiliencia de Sincronización en Celular y Des-Tombstone Cruzado

- [x] 1. Modificar `assets/js/storage.js` en `mergeCloudDocuments` para invocar `removeDeletedIds` sobre todos los documentos activos recibidos de la nube y evitar filtrado erróneo por lápidas locales obsoletas.
- [x] 2. Ajustar `assets/js/auth.js` en `checkServerConnection` para aumentar el timeout a 8000 ms, tolerando latencia celular y cold starts de Cloud Run.
- [x] 3. Ajustar `assets/js/app.js` en `testCloudConnection` aumentando el timeout a 8000 ms y verificar resiliencia en `syncWithCloud`.
- [x] 4. Modificar `server.js` para blindar `POST /api/v1/documents/batch-sync` contra des-tombstoneo de `INITIAL_PURGED_DOC_IDS` y purgar registros residuales de `db.documents`.
- [x] 5. Actualizar `data/vault_cloud.json` garantizando que solo residan los expedientes reales y limpios.
- [x] 6. Actualizar `sw.js` a `boveda-digital-v23` e `index.html` con `?v=23`.
- [x] 7. Agregar pruebas automatizadas en `tests/boveda.test.js` y `tests/server.test.js` para verificar la resiliencia en celular y des-tombstoneo en `mergeCloudDocuments`.
- [x] 8. Ejecutar suite de pruebas completa y verificar 100% de éxito.
- [x] 9. Actualizar `memory.md` documentando la especificación 019.
- [x] 10. Commit, push a GitHub (`main`) y despliegue a Google Cloud Run.
