# SDD 023 — Replicación Bidireccional Celular ↔ PC y Auto-Sincronización en Tiempo Real

## Contexto y Problema
El usuario reporta:
> *"Cuando cargo un documento en el PC, este se replica en el Celular minutos despues, sinembargo al reves no . Carge un nuevo documento en el Celular, pero este no aparece en el PC. Corroge por favor, sin modificar el resto de las funcionalidades . Aplica la metodologia sdd. Pregunta lo menos posible"*

### Diagnóstico de Causa Raíz
1. **Ausencia de Sincronización Periódica en Pantalla Activa (PC en reposo):**
   - En el Celular, cuando el usuario lo desbloquea o cambia de aplicación minutos después, se disparan los eventos `window.focus` y `document.visibilitychange`, lo que ejecuta `triggerReactiveCloudSync()`. Por ello, los documentos creados en el PC aparecen en el Celular "minutos después".
   - En el PC, la pestaña del navegador permanece abierta y enfocada en pantalla. Como no hay cambios de visibilidad ni foco, y **no existe ningún temporizador periódico de sincronización automática** (`setInterval`), el PC jamás sondea la nube mientras el usuario está sentado frente a él.
2. **Falta de Envío Directo Inmediato en `handleSaveNewDocument`:**
   - Al guardar un nuevo documento en `handleSaveNewDocument`, la UI sólo invoca `syncWithCloud(true)` (en lote masivo `batch-sync`). Si hay microcortes, timeout de 4s en `checkServerConnection` por arranque en frío de Cloud Run, o latencia de red móvil, el guardado local tiene éxito pero la sincronización remota falla silenciosamente.
   - `handleSaveNewDocument` debe enviar inmediatamente el documento al endpoint directo `POST /api/v1/documents` con verificación proactiva de sesión (`refreshSession`), garantizando su propagación instantánea a la nube.
3. **Bloqueo Silencioso por Títulos Duplicados en `server.js`:**
   - En `POST /api/v1/documents/batch-sync`, si `dupIdx >= 0` (mismo `category` y `title`), el servidor descartaba silenciosamente el documento entrante sin actualizarlo ni verificar `updated_at`.
4. **Optimización de Adjuntos de Cámara Móvil:**
   - En móviles, las fotos de cámara superan 8-12 MB. Al cifrarse en Base64 duplican el payload, arriesgando timeouts de subida en redes móviles. Redimensionar imágenes a un estándar de alta definición de documentos (máx. 1600px, JPEG 82%) reduce el peso en un 90% preservando legibilidad perfecta.

## Requisitos de la Solución
1. **Temporizador de Auto-Sincronización Periódica:**
   - Ejecutar una sincronización en segundo plano cada 25 segundos mientras la vista sea `dashboard` y haya un usuario autenticado.
2. **Envío Directo Inmediato en `handleSaveNewDocument`:**
   - Tras persistir en `IndexedDB`, renovar sesión si es necesario y enviar `POST /api/v1/documents` directamente. Luego invocar `syncWithCloud(true)`.
3. **Actualización Resiliente en `server.js`:**
   - Si un documento en `batch-sync` coincide en categoría y título pero tiene `updated_at` más reciente o diferente contenido, actualizar el registro en lugar de descartarlo.
4. **Resiliencia de Conexión:**
   - Elevar timeout de `checkServerConnection` a 8000ms para tolerar arranques en frío de Cloud Run.
5. **Preservación Total de Pruebas y Zero-Knowledge:**
   - Mantener el 100% de las pruebas automatizadas (76/76 o más).
   - Versionar Service Worker a `v26`.

