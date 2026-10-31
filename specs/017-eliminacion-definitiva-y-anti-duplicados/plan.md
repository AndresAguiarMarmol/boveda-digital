# Plan de Implementación: Spec 017 — Eliminación Definitiva y Prevención Total de Duplicados

## Fase 1: Diagnóstico y Preparación
- [x] Analizar causas de duplicación al eliminar registros.
- [x] Verificar estado actual de Cloud Run (`11` documentos) y de pruebas unitarias (`66/66` pasando).
- [x] Crear especificación técnica y criterios de aceptación.

## Fase 2: Implementación en Cliente
- [x] **Módulo `assets/js/app.js`:**
  - Blindar `handleDeleteSelectedDocument()` con cerrojo de concurrencia (`_isDeletingDoc` y `_isSyncingWithCloud`) para evitar interferencia de los listeners de `focus` y `visibilitychange`.
  - Encontrar y eliminar cualquier réplica/gemelo que comparta la misma categoría y título normalizado tanto en memoria como en `IndexedDB`.
  - Registrar tombstone (`deleteDocument(id, true)`) para todos los IDs afectados.
  - Purgar de `this.unlockedDocuments` y refrescar métricas y archivador de inmediato.
  - Realizar peticiones `DELETE /api/v1/documents/:id` esperando respuesta antes de liberar el cerrojo.
  - En `loadAndRenderDocuments()`, retirar el conjunto `canonicalIds` restrictivo, normalizar claves de deduplicación y asegurar que cualquier copia redundante se elimine con tombstone.
  - Bloquear definitivamente `_seedInitialDemoDocuments` para cuentas con conexión o datos previos.
- [x] **Módulo `assets/js/storage.js`:**
  - Retirar `canonicalProtectedIds` en `getDeletedIds()` para permitir la eliminación real de cualquier ID que el usuario decida borrar.
  - Asegurar que `mergeCloudDocuments()` elimine copias redundantes con tombstone.

## Fase 3: Implementación en Servidor
- [x] **Módulo `server.js`:**
  - En `DELETE /api/v1/documents/:id`: al eliminar un documento, registrar su ID en `db.deletedIds`, removerlo de `userDocs` y purgar también cualquier registro huérfano con la misma categoría y título normalizado.
  - En `POST /api/v1/documents/batch-sync`: asegurar deduplicación estricta con normalización de espacios y minúsculas.

## Fase 4: Pruebas Automatizadas y Versión
- [x] Agregar pruebas unitarias en `tests/boveda.test.js` y `tests/server.test.js` para Spec 017.
- [x] Incrementar versión de Service Worker a `boveda-digital-v21` (`sw.js` e `index.html?v=21`).
- [x] Ejecutar suite completa `node --test tests/boveda.test.js tests/server.test.js` (68/68 pruebas pasando en verde).

## Fase 5: Actualización de Memoria, Git y Despliegue
- [x] Actualizar `memory.md` con las decisiones y cambios de Spec 017.
- [x] Realizar commit y push a GitHub.
- [x] Desplegar a Google Cloud Run (`boveda-digital-00011-blx`).
