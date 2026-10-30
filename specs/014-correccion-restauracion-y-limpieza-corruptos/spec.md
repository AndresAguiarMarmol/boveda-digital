# Especificación 014: Corrección de Restauración de Respaldos (`Documento Restaurado`) y Sincronización PC-Celular

## 1. Diagnóstico de Causa Raíz

Al auditar el estado en vivo de Cloud Run (`GET /api/v1/documents`) y el flujo de respaldo/restauración en [`assets/js/app.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js), se identificaron dos fallos combinados que provocaron la divergencia entre el PC y el celular y la aparición del registro **"Documento Restaurado"** vacío e "imborrable":

### Causa 1: Sobrescritura destructiva en `submitBackupPinUnlock()` (`assets/js/app.js` líneas 3366–3395)
- Cuando se importa o desbloquea un respaldo con PIN mediante `#modal-backup-pin-prompt`, la función [`submitBackupPinUnlock()`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js#L3338-L3415) descifra el contenido (`plain = item.decryptedData`) y vuelve a cifrarlo con el PIN activo.
- Sin embargo, `submitBackupPinUnlock()` construía el nuevo objeto usando nombres de propiedades de un esquema antiguo (`plain.title`, `plain.category`, `plain.documentNumber`, `plain.expirationDate`, `plain.fileData`), cuando en el esquema real de Bóveda Digital:
  - `title` y `category` viven en la cabecera externa del documento (`item.originalDoc.title` y `item.originalDoc.category`), **no** dentro del payload cifrado `plain`.
  - Los campos internos reales son `doc_number`, `issuer`, `issue_date`, `expiry_date`, `tags`, `notes` y `attachment`.
- Como resultado, `plain.title` era `undefined` y la función sobrescribió 7 documentos con:
  - `title: 'Documento Restaurado'`
  - `category: 'general'`
  - Y descartó `doc_number`, `issuer`, `issue_date`, `expiry_date` y `attachment`, dejando un payload vacío de solo 360 bytes.

### Causa 2: Por qué "Documento Restaurado" parecía imposible de eliminar en el celular (`loadAndRenderDocuments` líneas 407–416)
- En la base de datos existían **7 registros distintos** (`doc_teu75glli`, `doc_vqp0qhkbm`, `doc_ymzsioywq`, `doc_q3swr4qvq`, `doc_rbwv99380`, `doc_wo7uka8zi`, `doc_xgcyu22gc`) todos con el mismo título `'Documento Restaurado'`, categoría `'general'` y número de documento vacío.
- El filtro en memoria `seenKeys` dentro de [`loadAndRenderDocuments()`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js#L407-L416) agrupaba los 7 registros bajo la misma clave `'general|documento restaurado|'` y mostraba **una sola tarjeta** en pantalla.
- Cada vez que el usuario eliminaba esa tarjeta en el celular, se borraba 1 de los 7 registros, pero al recargar la vista aparecía inmediatamente el siguiente de los 7 registros con el mismo nombre `"Documento Restaurado"`, dando la impresión de que el registro jamás se eliminaba.
- Además, durante los intentos de limpieza y sincronización entre ambos equipos, 4 de los 10 expedientes reales (`doc_ekd0onmfw`, `doc_ps25oua80`, `doc_huzcvq2ff`, `doc_kzs5fj88v`) terminaron agregados a `deletedIds` en el servidor y 3 (`doc_teu75glli`, `doc_vqp0qhkbm`, `doc_ymzsioywq`) quedaron sobrescritos como `"Documento Restaurado"`.

---

## 2. Requerimientos Funcionales (SDD)

- **RF-01 (Reparación de `submitBackupPinUnlock`):** Al re-cifrar documentos desde el desbloqueo de respaldo por PIN, preservar íntegramente `item.originalDoc.title`, `item.originalDoc.category`, `item.originalDoc.expiry_date` y todos los campos reales del payload (`doc_number`, `issuer`, `issue_date`, `expiry_date`, `tags`, `notes`, `attachment`), sincronizando luego con la nube.
- **RF-02 (Eliminación del enmascaramiento en UI y purga automática de `"Documento Restaurado"`):**
  - Eliminar la ocultación silenciosa en memoria (`seenKeys`) en `loadAndRenderDocuments()` para que la interfaz refleje siempre los registros reales por `id`.
  - Marcar como inválido en `esPayloadCifradoValido()` cualquier registro corrupto con `title === 'Documento Restaurado' && category === 'general'`, purgándolo de `IndexedDB` y bloqueando su subida al servidor.
- **RF-03 (Restauración íntegra de los 10 documentos personales y purga de los registros fantasma):**
  - Restaurar en `data/vault_cloud.json` los 10 expedientes originales íntegros con `updated_at: '2026-10-30T21:00:00.000Z'` (posterior a la corrupción de las `20:15:27Z`) para que tanto el PC como el celular reemplacen automáticamente cualquier copia local corrupta de `doc_teu75glli`, `doc_vqp0qhkbm` y `doc_ymzsioywq`.
  - Purgar mediante `INITIAL_PURGED_DOC_IDS` los IDs corruptos generados (`doc_q3swr4qvq`, `doc_rbwv99380`, `doc_wo7uka8zi`, `doc_xgcyu22gc`, `doc_9v1d87se3`, `doc_nsxfmaf07`, `doc_rn7x29c0o`) para que desaparezcan definitivamente del celular y del PC.
  - Garantizar en `mergeCloudDocuments()` que si un registro local tiene `title === 'Documento Restaurado'` y el servidor trae el título real del documento, siempre se sobrescriba el registro local corrupto.
- **RF-04 (Actualización de Caché PWA `v18`):** Actualizar `sw.js` a `boveda-digital-v18` e `index.html` a `?v=18` para forzar la actualización inmediata en PC y celular.

