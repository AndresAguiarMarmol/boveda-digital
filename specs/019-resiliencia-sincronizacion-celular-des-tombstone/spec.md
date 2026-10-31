# Especificación 019: Resiliencia de Sincronización en Celular y Des-Tombstone Cruzado

## 1. Contexto y Problema
El usuario reporta que su teléfono celular no sincroniza con la nube tras haber restaurado expedientes en la PC.

### Diagnóstico de Causa Raíz
1. **Bloqueo por Tombstones Locales Residuales en Celular (`mergeCloudDocuments`):**
   Cuando el usuario borró documentos previamente en el celular (o durante sesiones anteriores), los IDs de dichos documentos quedaron registrados en `boveda_deleted_doc_ids` (`localStorage`) y `deletedDocIds` (`IndexedDB`) locales del celular.
   Posteriormente, al restaurar el respaldo en la PC, los documentos fueron reconstituidos y enviados a Cloud Run mediante `batch-sync`, eliminándolos de `db.deletedIds` en el servidor.
   Sin embargo, cuando el celular ejecuta `syncWithCloud()` y recibe los documentos activos en `GET /api/v1/documents`, el método `mergeCloudDocuments(cloudDocs, deletedIds)` del celular evaluaba `if (deletedSet.has(doc.id)) continue;` usando la lista local de borrados del celular (`allDeleted`). Como el celular aún conservaba los tombstones locales antiguos:
   - El celular omitía e ignoraba los documentos entregados por la nube.
   - El celular eliminaba activamente los expedientes de su base de datos local (`deleteDocument(delId, false)`).
   - El método `getAllDocuments()` del celular continuaba filtrándolos y no los mostraba en pantalla.
2. **Latencia Móvil y Timeout Prematuro en `checkServerConnection()`:**
   En `VaultAuth.checkServerConnection()`, el timeout con `AbortController` estaba configurado en `2500 ms` (2.5 segundos). En redes móviles celulares (4G/LTE/3G) o ante *cold starts* de Google Cloud Run (cuyo arranque en contenedor serverless toma típicamente entre 2.5s y 4.0s), la llamada a `/api/health` superaba los 2.5 segundos. La conexión se abortaba inmediatamente, retornando `false`, haciendo que `syncWithCloud()` cancelara la sincronización y mostrara "Modo Local / Offline" o "Servidor no disponible".
3. **Resurrección Espuria de Registros Corruptos Huérfanos en Cloud Run:**
   Durante la importación del respaldo anterior, tres registros huérfanos históricos de octubre (`doc_bba1vso67`, `doc_lroukh0y9`, `doc_shm2e0xo1`) cuyos payloads cifrados estaban dañados/indescifrables fueron des-tombstoneados y subidos a Cloud Run. Al recibirlos el celular, disparaban errores de descifrado ("expedientes no pudieron descifrarse con el PIN actual") y generaban inconsistencias de estado.

---

## 2. Requisitos del Sistema (EARS)

### Requisito 1: Des-Tombstone Automático al Recibir Documentos de la Nube
**CUANDO** el cliente (celular o PC) reciba documentos activos desde la nube en `mergeCloudDocuments(cloudDocs, deletedIds)`:
**EL SISTEMA DEBE** desmarcar automáticamente (`removeDeletedIds`) todos los IDs de los documentos activos recibidos antes de computar los eliminados, garantizando que ninguna lápida local obsoleta impida la descarga, guardado y visualización de los expedientes en el dispositivo.

### Requisito 2: Tolerancia de Red Móvil y Cold Starts en `checkServerConnection`
**CUANDO** el cliente verifique la conectividad con el servidor Cloud Run en `checkServerConnection()` o `testCloudConnection()`:
**EL SISTEMA DEBE** admitir un margen de espera de al menos 8000 ms (8 segundos) antes de abortar, tolerando la latencia de redes móviles celulares y el tiempo de arranque de contenedores serverless en Google Cloud Run.

### Requisito 3: Purga y Blindaje Permanente de Registros Corruptos en Servidor
**CUANDO** el servidor reciba una petición `POST /api/v1/documents/batch-sync`:
**EL SISTEMA DEBE** rechazar la inserción o des-tombstoneo de cualquier ID perteneciente a `INITIAL_PURGED_DOC_IDS`, asegurando que `db.documents` contenga exclusivamente expedientes íntegros y válidamente descifrables.

### Requisito 4: Integridad de Versión y Actualización Inmediata en Dispositivos Móviles
**CUANDO** se despliegue la versión corregida:
**EL SISTEMA DEBE** actualizar el Service Worker a `v23` y forzar la recarga de scripts para que el navegador móvil (Safari iOS y Chrome Android) adquiera de inmediato la lógica de sincronización resiliente.

