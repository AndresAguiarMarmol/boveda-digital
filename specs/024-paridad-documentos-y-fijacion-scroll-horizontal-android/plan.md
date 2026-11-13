# Plan SDD 024 — Paridad de Documentos PC-Celular y Fijación de Scroll Horizontal en Android

## Fase 1: Sincronización de Base de Datos y Deduplicación
1. Actualizar `data/vault_cloud.json` local incorporando los expedientes 14 y 15 (`doc_oimmuw6lp` y `doc_roj8pgj1i`) para paridad con Cloud Run.
2. Actualizar `assets/js/storage.js`:
   - En `mergeCloudDocuments()`: purgar de `IndexedDB` documentos huérfanos que tengan `is_synced: true` o réplicas de categoría/título que no existan en `cloudDocs`.
3. Actualizar `assets/js/app.js`:
   - En `loadAndRenderDocuments()`: normalizar clave de deduplicación a `${normCat}|${normTitle}` eliminando `normDocNum` para impedir duplicados en la PC, con normalización de espacios y acentos.

## Fase 2: Fijación y Bloqueo de Desplazamiento Horizontal en Android
1. Actualizar `assets/css/vault.css`:
   - Configurar `html, body` con `overflow-x: hidden !important;`, `width: 100% !important;`, `max-width: 100vw !important;`, `overscroll-behavior-x: none;` y `touch-action: pan-y pinch-zoom;`.
   - Modificar `.drawer-unit.is-open` bajo `@media (max-width: 768px)` a `transform: translateY(-2px);` sin `scale`.
   - Blindar `.app-static-header` y `.app-static-footer` con `overflow: hidden; max-width: 100vw; text-overflow: ellipsis;`.
2. Actualizar `index.html`:
   - Actualizar meta viewport a `width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover`.
   - Ajustar Navbar superior (`header`): responsive classes (`hidden md:inline` en nombre de usuario, `hidden sm:inline` en texto de licencia, compact gaps y padding).

## Fase 3: Cache Busting, Pruebas y Despliegue
1. Incrementar Service Worker a `boveda-digital-v27` en `sw.js` y versionar scripts a `?v=27` en `index.html`.
2. Actualizar suite de pruebas en `tests/boveda.test.js` y `tests/server.test.js`.
3. Ejecutar pruebas automatizadas (100% verde).
4. Actualizar `memory.md` (Secciones 1, 2 y 3).
5. Commit y push a GitHub (`main`).
6. Desplegar en Google Cloud Run (`gcloud run deploy`).
