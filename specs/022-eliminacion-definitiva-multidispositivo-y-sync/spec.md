# SDD 022: Eliminación Definitiva Multi-Dispositivo y Sincronización Bidireccional de Bajas

## 1. Contexto y Diagnóstico del Problema
El usuario reporta:
*"Cuando elimino algun documento desde el celular y luego sincronizo, este aparece de nuevo. Pero si hago lo mismo desde la PC, el documento se mantiene eliminado. En el primer caso, debes corregirlo, por que eliminar deberia ser definitivo para la Base de Datos"*

### Causa Raíz Identificada
1. **Falla Silenciosa o Ausencia de Token en `DELETE` Móvil:**
   - En `handleDeleteSelectedDocument()` (`assets/js/app.js`), la eliminación en Cloud Run dependía de un `fetch` directo condicionado a `if (window.vaultAuth && window.vaultAuth.accessToken)`.
   - En el celular, si la sesión opera con token mock o expirado, no se ejecutaba la renovación previa (`refreshSession()`), a diferencia de `syncWithCloud()` que sí valida y renueva el token.
   - En redes celulares con latencia o desconexión momentánea, el `catch(() => null)` silenciaba el fallo sin reintentar.
2. **Asimetría en la Sincronización en Lote (`batch-sync`):**
   - `syncWithCloud()` enviaba al servidor únicamente `{ documents: localDocs, customDrawers, unDeletedIds }`.
   - Los IDs eliminados (`deletedIds`) **nunca** eran enviados en `batch-sync`. Por lo tanto, si la petición `DELETE` directa no se procesaba en el servidor, este conservaba el documento en su colección persistente.
3. **Resurrección Automática en `mergeCloudDocuments`:**
   - Al sincronizar (`syncWithCloud()`), el cliente descargaba los documentos de la nube (`GET /api/v1/documents`).
   - Al estar aún presente en la nube, `mergeCloudDocuments()` (`assets/js/storage.js`) ejecutaba `removeDeletedIds(incomingActiveIds)`, removiendo la lápida del documento recién borrado y re-guardándolo en `IndexedDB`.
4. **Desconexión por Desfase de Identificador (`docId`):**
   - Si el ID local en el celular no coincidía exactamente con el ID registrado en Cloud Run (por ejemplo réplicas con mismo título y categoría), el endpoint `DELETE /api/v1/documents/:id` no encontraba el registro y retornaba 404, omitiendo la purga por título/categoría.

## 2. Solución Arquitectónica
1. **Garantía de Token y Resiliencia en `handleDeleteSelectedDocument`:**
   - Asegurar token JWT genuino antes de despachar la eliminación (`refreshSession()` si falta o es mock).
   - Enviar a `DELETE /api/v1/documents/:id` los parámetros `category` y `title` para que el servidor purgue réplicas coincidentes aunque el ID difiera.
   - Registrar el ID en `explicitUserDeletedIds` para evitar su resurrección local bajo cualquier circunstancia.
2. **Ingesta de Bajas en `POST /api/v1/documents/batch-sync` (`server.js`):**
   - El endpoint `batch-sync` recibe el arreglo `deletedIds`.
   - Añade los IDs a `db.deletedIds` y purga de forma atómica y permanente los expedientes de `db.documents`.
   - Persiste inmediatamente con `saveDB()`.
3. **Propagación de Bajas en `syncWithCloud()` (`assets/js/app.js`):**
   - Incluir `deletedIds: genuineDeletedIds` en el cuerpo de `batch-sync`.
4. **Protección Contra Resurrección en `mergeCloudDocuments` (`assets/js/storage.js`):**
   - `removeDeletedIds` no debe des-tombstonear expedientes presentes en `explicitUserDeletedIds`.
   - Los documentos marcados como eliminados explícitamente por el usuario son descartados y no reingresan a `IndexedDB`.
