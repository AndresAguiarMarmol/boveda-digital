# Especificación 015: Deduplicación Atómica y Prevención de Doble Carga entre PC y Celular (11 vs 22 Documentos)

## 1. Diagnóstico de Causa Raíz

El teléfono muestra **11 documentos** (los 11 expedientes reales actualmente activos en Cloud Run) mientras que el PC muestra **22 documentos** (exactamente el doble: `11 × 2 = 22`). Al analizar el comportamiento de `v18` en [`assets/js/app.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js), se identificaron las dos causas exactas de esta duplicación `11 × 2`:

### Causa 1: Condición de carrera asíncrona sobre `this.unlockedDocuments` en `loadAndRenderDocuments()` y `syncWithCloud()`
- En [`loadAndRenderDocuments()`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js#L313-L415), el arreglo compartido `this.unlockedDocuments = []` se vaciaba en la línea 313 **antes** de ejecutar múltiples operaciones `await` (`getSetting`, `deriveKeyFromPin` y `decrypt`), y luego cada iteración hacía `this.unlockedDocuments.push(...)`.
- Adicionalmente, [`syncWithCloud()`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js#L2800-L2952) carecía de cerrojo de concurrencia (`_isSyncingWithCloud`).
- Al iniciar o enfocar la ventana del navegador en el PC (`switchView('dashboard')` + evento `window.focus` / `visibilitychange` + fin de `syncWithCloud`), dos ejecuciones concurrentes de `loadAndRenderDocuments()` pasaban por la línea 313 al mismo tiempo y **ambas insertaban los 11 expedientes en `this.unlockedDocuments` (`11 + 11 = 22`)**.

### Causa 2: Retiro del filtro `seenKeys` en `v18` frente a copias duplicadas en el `IndexedDB` local del PC
- En `v17`, el bucle `seenKeys` al final de `loadAndRenderDocuments()` colapsaba cualquier elemento duplicado por `(category, title, doc_number)`.
- En `v18` se retiró `seenKeys` para que no enmascarara los registros vacíos `"Documento Restaurado"`. Al quitarlo por completo, tanto la condición de carrera en memoria como cualquier copia local duplicada en el `IndexedDB` del PC quedaron expuestas, duplicando los 11 expedientes a 22.

---

## 2. Requerimientos Funcionales (SDD)

- **RF-01 (Construcción Atómica y Cerrojo de Concurrencia):**
  - En `loadAndRenderDocuments()`, construir los expedientes descifrados en una lista local aislada (`const unlockedList = []`) y usar un contador monotónico (`this._loadRenderSeq`) para asignar `this.unlockedDocuments` de forma atómica únicamente al finalizar la ejecución vigente.
  - En `syncWithCloud()`, incorporar el cerrojo `this._isSyncingWithCloud` para impedir ejecuciones paralelas superpuestas.
- **RF-02 (Deduplicación Inteligente de Expedientes Reales y Limpieza de Copias Redundantes en `IndexedDB`):**
  - Una vez descartados los registros `"Documento Restaurado"` vacíos, deduplicar `unlockedList` tanto por `doc.id` como por clave semántica `(category, title, doc_number)` (conservando el ID canónico de Cloud Run y eliminando de `IndexedDB` únicamente la copia local redundante con `recordTombstone = false`).
- **RF-03 (Deduplicación en Servidor `batch-sync`):**
  - En `POST /api/v1/documents/batch-sync` (`server.js`), si llega un documento con distinto `id` pero idéntico `(category, title)` a uno de los 11 expedientes ya existentes en la nube, conservar el ID canónico existente para evitar que se creen duplicados en Cloud Run.
- **RF-04 (Actualización de Caché PWA `v19`):**
  - Actualizar `sw.js` a `boveda-digital-v19` e `index.html` a `?v=19`.

