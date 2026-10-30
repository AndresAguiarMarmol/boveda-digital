# Especificación Funcional (Spec 013): Protección de Integridad y Restauración de Expedientes de la Base de Datos

**Estado:** Aprobado para Implementación  
**Fecha:** 2026-10-30  
**Esquema:** Spec-Driven Development (SDD)

---

## 1. Diagnóstico y Causa Raíz (¿Qué pasó?)
Hace ~30 minutos (`11:55 AM` hora local / `14:55:04Z`), al abrir la aplicación con la versión `v16`, la base de datos pasó de tener los expedientes disponibles a **0 documentos** por una reacción en cadena provocada por tres mecanismos introducidos en `v16`:

1. **Auto-eliminación errónea de documentos en `loadAndRenderDocuments()` (`assets/js/app.js`):**
   - En `v16` se añadió un bucle que eliminaba automáticamente (`deleteDocument(zombieId, true)`) cualquier documento en `IndexedDB` que no pudiera descifrarse en el primer intento si al menos 1 documento sí se había descifrado (`this.unlockedDocuments.length > 0 && undecryptableIds.length > 0`).
   - En la PC, 9 de los expedientes locales en `IndexedDB` habían sido re-cifrados en una sesión anterior con la sal local previa de la PC y tenían un `updated_at` más reciente que el del servidor (`2026-10-22`), por lo que `mergeCloudDocuments` no los reemplazó con la copia canónica del servidor.
   - Al fallar su descifrado local con la nueva sal unificada mientras otro documento sí abría, el bucle de `v16` los clasificó erróneamente como "huérfanos" y ejecutó `deleteDocument(..., true)` sobre los expedientes reales (`doc_9lskrlugo`, `doc_ekd0onmfw`, `doc_huzcvq2ff`, `doc_kzs5fj88v`, `doc_ps25oua80`, `doc_teu75glli`, `doc_vqp0qhkbm`, `doc_yjdulku41`, `doc_ymzsioywq`, además de `doc_rehd8z4vp`).
2. **Propagación masiva de `deletedIds` hacia Cloud Run en `batch-sync`:**
   - Al marcar esos IDs en `boveda_deleted_doc_ids` local, `syncWithCloud()` envió el arreglo `deletedIds` dentro de `POST /api/v1/documents/batch-sync`.
   - El servidor (`server.js`) aceptó esos `deletedIds` entrantes, los añadió a `db.deletedIds` en Cloud Run y filtró `db.documents`, vaciando los documentos en la nube.
3. **Propagación a los demás dispositivos:**
   - Tres minutos después (`11:58 AM` / `14:58:01Z`), al sincronizar el iPhone con Cloud Run, recibió `documents: []` y `deletedIds` con los IDs de los expedientes, purgándolos también del almacenamiento local.

---

## 2. Requerimientos Funcionales (RF)

### RF-01: Prohibición Estricta de Borrado Automático en Cliente y Servidor
- Ningún proceso de carga (`loadAndRenderDocuments`), descifrado o sincronización (`syncWithCloud`, `batch-sync`) puede invocar `deleteDocument()` ni añadir IDs a `deletedIds` de forma automática.
- Un documento **únicamente** puede ser eliminado cuando el usuario pulsa explícitamente el botón de eliminar documento (`handleDeleteSelectedDocument` -> `DELETE /api/v1/documents/:id`).
- El endpoint `POST /api/v1/documents/batch-sync` en `server.js` no debe aceptar eliminaciones masivas ni marcar documentos como eliminados por heurísticas de título/categoría.

### RF-02: Restauración Íntegra de los Expedientes en `data/vault_cloud.json` y Saneamiento de Tombstones
- Restaurar los expedientes reales cifrados desde `data/vault_cloud.json` actualizando su `updated_at` para que prevalezcan sobre cualquier copia local corrupta en `IndexedDB`.
- Limpiar automáticamente de `boveda_deleted_doc_ids` (`localStorage`) y `deletedDocIds` (`IndexedDB`) los IDs de los expedientes reales (`RESTORED_CANONICAL_IDS`) que fueron añadidos erróneamente por `v16`, conservando en la lista de purga únicamente los 3 documentos demo (`doc_demo_pasaporte`, `doc_demo_licencia`, `doc_demo_tarjeta`) y los 5 registros huérfanos del 18 de octubre (`doc_bba1vso67`, `doc_lroukh0y9`, `doc_ovjy4qg6p`, `doc_shm2e0xo1`, `doc_zyd7diy5s`).

### RF-03: Preservación de Sal Local Previa al Unificar (`VaultAuth.init`)
- En `assets/js/auth.js`, si el dispositivo tenía una `userSalt` previa distinta de `UNIFIED_MASTER_SALT`, preservarla en `last_imported_salt` antes de asignar `UNIFIED_MASTER_SALT`, garantizando que `fallbackKeys` pueda descifrar cualquier documento creado localmente.

---

## 3. Criterios de Aceptación (CA)
- **CA-01:** El servidor Cloud Run y `data/vault_cloud.json` restauran inmediatamente los expedientes reales del usuario y los sirven en `GET /api/v1/documents`.
- **CA-02:** Tanto en PC como en iPhone, al abrir o recargar la app (`v17`), se sanean los tombstones locales envenenados por `v16` y reaparecen todos los expedientes reales descifrados en sus gavetas.
- **CA-03:** No se modifica ninguna funcionalidad existente que ya opera correctamente (autenticación, licencias, gavetas personalizadas, creación/edición/borrado manual de documentos).
