# Especificación Funcional (Spec 020): Paridad Total PC-iPhone (15 Expedientes) y Erradicación de Tombstone `doc_ymzsioywq`

**Estado:** Aprobado e Implementado  
**Fecha:** 2026-10-31  
**Esquema:** Spec-Driven Development (SDD)

---

## 1. Diagnóstico de Causa Raíz

Al analizar por qué la PC exhibía 15 documentos mientras el iPhone mostraba 14 expedientes conectados a la misma base de datos, se identificaron los siguientes hechos y mecanismos:

### Causa 1: Inclusión errónea del expediente legítimo `doc_ymzsioywq` en la lista fija de eliminados en `assets/js/storage.js`
- El expediente `doc_ymzsioywq` corresponde a **"Residencia Definitiva Chile AEAM"** (categoría `gaveta_documentos_registrad_m6ses`, tamaño ~1.3 MB).
- En [`assets/js/storage.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/storage.js#L115), el ID `doc_ymzsioywq` figuraba erróneamente dentro del conjunto `ids` inicial de [`getDeletedIds()`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/storage.js#L98).
- **En la PC:** Previamente se había ejecutado la importación de un respaldo JSON que contenía `doc_ymzsioywq`. Al importar el respaldo en la PC, `removeDeletedIds(['doc_ymzsioywq', ...])` guardó el ID en `boveda_undeleted_doc_ids` del `localStorage` de la PC, neutralizando la lápida y permitiendo que la PC mostrara los 15 expedientes completos.
- **En el iPhone:** El usuario nunca ejecutó la importación manual del respaldo en el iPhone, sino que depende de la sincronización remota con Cloud Run (`syncWithCloud`). Al evaluar [`getDeletedIds()`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/storage.js#L98) en el iPhone sin tener dicho ID en `boveda_undeleted_doc_ids`, `deletedSet.has('doc_ymzsioywq')` era `true`. Por ende:
  1. [`getAllDocuments()`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/storage.js#L252) lo filtraba (`!deletedSet.has(d.id)`), ocultándolo de la vista y dejando el conteo en 14.
  2. En [`mergeCloudDocuments()`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/storage.js#L313), `deletedSet.has(doc.id)` provocaba un `continue;`, omitiendo su guardado en `IndexedDB` o purgándolo.

### Causa 2: Desfase en `deletedSet` dentro de `mergeCloudDocuments`
- Si `allDeleted` contenía algún ID de los expedientes activos entregados por la nube, el bucle de purga local eliminaba el expediente o el bucle de guardado saltaba la inserción con `if (deletedSet.has(doc.id)) continue;`.

---

## 2. Requerimientos Funcionales (RF)

### RF-01: Erradicación Definitiva de `doc_ymzsioywq` de Toda Lista de Tombstones
- Remover `doc_ymzsioywq` del conjunto inicial de `getDeletedIds()` en `assets/js/storage.js`.
- Añadir auto-saneamiento en `getDeletedIds()`: si `doc_ymzsioywq` existe en `localStorage['boveda_deleted_doc_ids']` o en el store `deletedDocIds`, purgarlo automáticamente y registrarlo en `unDeleted`.

### RF-02: Blindaje de Expedientes Activos en `mergeCloudDocuments`
- En `mergeCloudDocuments()` (`assets/js/storage.js`), calcular `deletedSet` excluyendo estrictamente cualquier ID presente en `incomingActiveIds` (`allDeleted.filter(id => id && !activeSet.has(id))`).
- Garantizar que ningún documento legítimo activo entregado por Cloud Run sea eliminado de `IndexedDB` ni omitido durante la sincronización.

### RF-03: Sincronización de Persistencia Local (`data/vault_cloud.json`)
- Actualizar `data/vault_cloud.json` en disco para consolidar los 15 documentos de la partición `usr_pro_001` y purgar `doc_ymzsioywq` de su arreglo `deletedIds`.

### RF-04: Actualización de Caché PWA y Service Worker v24
- Incrementar `CACHE_NAME` en `sw.js` a `'boveda-digital-v24'`.
- Actualizar los tags de script en `index.html` a `?v=24` para forzar la actualización transparente en navegadores móviles (iOS Safari / PWA).

