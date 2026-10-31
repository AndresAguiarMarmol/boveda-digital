# Spec 017: Eliminación Definitiva de Expedientes y Prevención Total de Duplicados (v21)

## 1. Problema y Diagnóstico

### Síntoma Reportado por el Usuario
"Me sigue duplicando registros al eliminar alguno. Revisa y corriges definitivamente."
Al eliminar un expediente (o registros de prueba demo), el sistema duplica registros existentes o regenera el registro eliminado en lugar de erradicarlo permanentemente entre PC y celular.

### Diagnóstico de Causa Raíz
1. **Condición de carrera por eventos `focus` y `visibilitychange` tras `confirm()` en `handleDeleteSelectedDocument()` (`assets/js/app.js`):**
   - Cuando el usuario pulsa "Eliminar", se abre el diálogo nativo `confirm()`.
   - La ventana pierde el foco. Al pulsar "Aceptar", la ventana recupera el foco inmediatamente, disparando `window.onfocus` y `visibilitychange`.
   - El listener `triggerReactiveCloudSync()` invoca `this.syncWithCloud(true)` inmediatamente en segundo plano, activando `this._isSyncingWithCloud = true`.
   - Dicha sincronización concurrente lee los documentos locales en IndexedDB y consulta la nube *antes* de que la petición `DELETE` de `handleDeleteSelectedDocument()` se complete.
   - En consecuencia, la llamada a `this.syncWithCloud(true)` al final de `handleDeleteSelectedDocument()` es ignorada (por el cerrojo), mientras que la sincronización concurrente prematura vuelve a descargar o re-insertar el documento en proceso de borrado.
2. **Preservación residual de gemelos/réplicas locales con distinto ID:**
   - Si existían copias redundantes con distinto ID o ligeras variaciones de título/espacios, `handleDeleteSelectedDocument()` borraba únicamente el ID específico de la tarjeta seleccionada (`docId`), dejando la réplica en IndexedDB.
   - Al borrarse la tarjeta activa, la réplica que estaba oculta en memoria por el agrupador pasaba a ser visible, simulando duplicación o no-eliminación.
3. **Bloqueo de eliminación en `getDeletedIds()` y `loadAndRenderDocuments()` por IDs canónicos fijos:**
   - En `assets/js/storage.js`, `getDeletedIds()` contenía `canonicalProtectedIds` que filtraba y descartaba IDs legítimos de la lista de tombstones.
   - En `assets/js/app.js`, `loadAndRenderDocuments()` evitaba llamar `deleteDocument(redundantDoc.id)` si el ID estaba en `canonicalIds`, y cuando borraba réplicas pasaba `recordTombstone = false`, impidiendo que el borrado se propagara a la nube.
4. **Regeneración de expedientes de prueba si la lista local se vacía:**
   - En `loadAndRenderDocuments()`, si `rawDocs.length === 0`, existía una comprobación permisiva que volvía a sembrar los 3 documentos demo (`_seedInitialDemoDocuments`) si el dispositivo no tenía el flag `boveda_demos_seeded`.

---

## 2. Solución Arquitectónica

1. **Cerrojo atómico anti-concurrencia durante la eliminación (`assets/js/app.js`):**
   - En `handleDeleteSelectedDocument()`: activar `this._isDeletingDoc = true` y `this._isSyncingWithCloud = true` para bloquear la re-entrada de `focus`, `online` o `visibilitychange` mientras se procesa la eliminación.
   - Identificar no sólo el `docId` seleccionado, sino cualquier réplica local o en memoria que comparta la misma categoría y título normalizado (sin espacios extra, minúsculas).
   - Eliminar todos los IDs coincidentes de `IndexedDB` con registro de tombstone (`deleteDocument(id, true)`).
   - Eliminar inmediatamente del array en memoria `this.unlockedDocuments` y refrescar la interfaz (`renderMetrics()`, `renderCabinet()`) sin re-descargas que compitan.
   - Enviar `DELETE /api/v1/documents/:id` al backend para cada uno de los IDs eliminados.
   - Liberar cerrojos e invocar `syncWithCloud(true)` limpiamente.
2. **Erradicación definitiva de listas de protección fija (`assets/js/storage.js`, `assets/js/app.js`):**
   - Eliminar `canonicalProtectedIds` de `getDeletedIds()` para que cualquier documento eliminado por el usuario permanezca eliminado permanentemente.
   - En `loadAndRenderDocuments()`, eliminar la restricción `canonicalIds` para que cualquier copia redundante detectada se elimine con tombstone (`deleteDocument(redundantDoc.id, true)`).
3. **Deduplicación estricta y normalización de títulos (`assets/js/app.js`, `server.js`):**
   - Normalizar títulos y categorías colapsando espacios múltiples y recortando bordes (`trim().toLowerCase().replace(/\s+/g, ' ')`).
   - En `server.js` (`DELETE /api/v1/documents/:id`), al eliminar un documento, añadir su ID a `db.deletedIds` y purgar también cualquier registro huérfano con la misma categoría y título normalizado.
4. **Bloqueo definitivo de regeneración de demos:**
   - Asegurar que una vez inicializada la cuenta o sincronizada con la nube, los documentos demo jamás se vuelvan a sembrar.
5. **Actualización de Service Worker y Versión de Caché:**
   - Incrementar Service Worker a `boveda-digital-v21` (`sw.js` e `index.html?v=21`).

---

## 3. Criterios de Aceptación
1. Al eliminar cualquier documento desde la interfaz, este desaparece inmediatamente y de forma permanente de la pantalla, de `IndexedDB` y de Cloud Run.
2. Ningún otro expediente se duplica tras la eliminación.
3. El evento `focus` tras cerrar el diálogo `confirm()` no dispara sincronizaciones prematuras concurrentes.
4. Todas las 66 pruebas automatizadas existentes siguen pasando al 100% en verde.
5. Se agregan pruebas unitarias específicas para Spec 017 verificando eliminación limpia, propagación de tombstones y no-duplicación.
