# Plan de Trabajo (Spec 020): Paridad Total PC-iPhone (15 Expedientes) y Erradicación de Tombstone `doc_ymzsioywq`

**Fecha:** 2026-10-31  
**Estado:** Completado

---

## Fases de Implementación

- [x] **Fase 1: Diagnóstico de discrepancia PC (15) vs iPhone (14)**
  - [x] Inspeccionar el inventario de documentos en Cloud Run (`usr_pro_001` = 15).
  - [x] Verificar el tamaño y títulos de los 15 documentos.
  - [x] Identificar que `doc_ymzsioywq` ("Residencia Definitiva Chile AEAM") estaba indebidamente clasificado como lápida fija en `assets/js/storage.js`.

- [x] **Fase 2: Corrección en `assets/js/storage.js`**
  - [x] Eliminar `doc_ymzsioywq` de la lista inicial de `getDeletedIds()`.
  - [x] Inmunizar `doc_ymzsioywq` en `unDeleted` y purgarlo automáticamente de `localStorage` y `IndexedDB` si estuviera presente.
  - [x] Blindar `mergeCloudDocuments()` para que `deletedSet` excluya cualquier ID activo entrante (`!activeSet.has(id)`).

- [x] **Fase 3: Sincronización y Actualización de Archivos**
  - [x] Actualizar `data/vault_cloud.json` en disco con los 15 expedientes reales y purgar `doc_ymzsioywq` de `deletedIds`.
  - [x] Actualizar `sw.js` a `boveda-digital-v24`.
  - [x] Actualizar `index.html` con `?v=24` en todos los scripts de la app.

- [x] **Fase 4: Verificación y Pruebas Automatizadas**
  - [x] Actualizar suite de pruebas en `tests/boveda.test.js` con el test `SDD 020`.
  - [x] Ejecutar `npm test` y verificar 73/73 pruebas en verde.
  - [x] Desplegar nueva versión a Google Cloud Run.

