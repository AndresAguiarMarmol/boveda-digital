# Registro de Tareas (Spec 020): Paridad Total PC-iPhone (15 Expedientes)

| # | Tarea | Estado | Archivos Involucrados |
|---|---|---|---|
| 1 | Diagnosticar causa de 14 docs en iPhone vs 15 en PC | Completado | `assets/js/storage.js`, Cloud Run logs |
| 2 | Eliminar `doc_ymzsioywq` de la lista de tombstones fijos en `storage.js` | Completado | `assets/js/storage.js` |
| 3 | Blindar `mergeCloudDocuments` contra omisión de IDs activos | Completado | `assets/js/storage.js` |
| 4 | Actualizar `data/vault_cloud.json` local con los 15 expedientes y limpiar `deletedIds` | Completado | `data/vault_cloud.json` |
| 5 | Incrementar Service Worker a v24 y cache busting en `index.html` | Completado | `sw.js`, `index.html` |
| 6 | Añadir test automatizado `SDD 020` y verificar 73 pruebas al 100% | Completado | `tests/boveda.test.js` |
| 7 | Desplegar a Google Cloud Run y documentar en `memory.md` | Completado | `memory.md` |

