# Plan de Implementación SDD 022

## Fases
1. **Fase 1: Servidor (`server.js`)**
   - Actualizar `DELETE /api/v1/documents/:id` para aceptar parámetros query o body (`category`, `title`) y purgar documentos por ID o coincidencia de categoría y título.
   - Actualizar `POST /api/v1/documents/batch-sync` para ingerir `deletedIds`, registrarlos en `db.deletedIds`, purgar de `userDocs` y persistir en disco.
2. **Fase 2: Cliente Storage (`assets/js/storage.js`)**
   - Implementar soporte para `explicitUserDeletedIds` (almacén `settings` y `localStorage`).
   - Ajustar `deleteDocument` para registrar en `explicitUserDeletedIds`.
   - Modificar `mergeCloudDocuments` para que nunca des-tombstonee expedientes presentes en `explicitUserDeletedIds`.
3. **Fase 3: Cliente UI y Sincronización (`assets/js/app.js`)**
   - Fortalecer `handleDeleteSelectedDocument`:
     - Asegurar token válido con `refreshSession()` si es necesario.
     - Invocar `DELETE` con `category` y `title`.
   - En `syncWithCloud`:
     - Enviar `deletedIds` legítimos en el cuerpo de `POST /api/v1/documents/batch-sync`.
4. **Fase 4: Pruebas y Despliegue**
   - Agregar pruebas unitarias en `tests/server.test.js` y `tests/boveda.test.js`.
   - Actualizar versión de Service Worker a `v25` en `sw.js` e `index.html`.
   - Ejecutar suite de pruebas (100% éxito).
   - Actualizar `memory.md`.
   - Commit y push a GitHub.
   - Desplegar en Google Cloud Run.
