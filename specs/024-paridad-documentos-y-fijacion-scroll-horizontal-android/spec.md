# SDD 024 — Paridad de Documentos PC-Celular (15 Expedientes) y Fijación de Scroll Horizontal en Android

## 1. Contexto y Problema
El usuario reporta dos fallas puntuales:
> *"coordinator 1.- Tengo problemas con la sincronizacion de los documentos : En la PC aparecen 16 , en el telefono aparecen 15.   2.- La Pantalla de la app se desplaza en un telefono android con SO Ultima version (La pantalla se mueve hacia los lados) .Por  por favor corregir ambos errores , sin modificar el resto de las funcionalidades . Aplica la metodologia sdd. Pregunta lo menos posible"*

### Diagnóstico de Causa Raíz

#### Problema 1: Desincronización y discrepancia de conteo (PC: 16 vs Celular: 15)
1. **La verdad canónica en la nube (Cloud Run) tiene exactamente 15 documentos:**
   - La base de datos central en Cloud Run contiene 15 expedientes legítimos (con la incorporación reciente de `doc_oimmuw6lp` "Póliza Seguto Vehículo /Santander Seguros" y `doc_roj8pgj1i` "Certificado Revisión Técnica Honda City").
   - El celular está perfectamente sincronizado con la nube y muestra 15 documentos.
2. **Causa del 16º documento en la PC:**
   - **Clave de deduplicación con número de documento en `loadAndRenderDocuments` (`assets/js/app.js`):**
     La línea 428 contenía:
     `const dedupKey = normDocNum ? `${normCat}|${normTitle}|${normDocNum}` : `${normCat}|${normTitle}`;`
     Si en `IndexedDB` de la PC existía una copia previa de un documento sin número (o con número ligeramente diferente), la clave de deduplicación no coincidía y se mostraban ambas copias en pantalla. Sin embargo, al sincronizar (`syncWithCloud`), se filtraba por `(category, title)`, subiendo solo una versión a la nube.
   - **Persistencia de huérfanos/fantasmas locales en `mergeCloudDocuments` (`assets/js/storage.js`):**
     `mergeCloudDocuments` iteraba exclusivamente sobre los documentos devueltos por la nube. Si un documento local con `is_synced: true` había sido eliminado remotamente desde el celular, pero su ID específico no estaba en la lista en memoria `deletedIds` (por ejemplo, eliminado por coincidencia de categoría/título o generado con ID local previo en la PC), `mergeCloudDocuments` no lo borraba de `IndexedDB`.
   - **Diferencias tipográficas en títulos:**
     La normalización no eliminaba tildes ni acentos diacríticos (`.normalize('NFD')`), por lo que variaciones como "Revisión" vs "Revision" eran tratadas como registros distintos.

#### Problema 2: Desplazamiento lateral / pantalla suelta en Android último SO
1. **Desbordamiento horizontal en el Navbar Superior (`header`):**
   - El contenedor flexible de acciones del encabezado (`#btn-header-user-profile`, `#badge-license-status`, `#btn-gdrive-sync`, `#btn-cloud-sync`, `#btn-backup-vault`, `#btn-restore-vault`) mantenía todos los botones y etiquetas de texto en una sola línea fija horizontal sin `flex-wrap` ni colapso responsive, sumando más de 720px de ancho mínimo sobre pantallas móviles de 360–412px (Android 14/15 en Galaxy S24, Pixel 8, etc.).
2. **Ausencia de directivas CSS anti-scroll horizontal en `html` y `body`:**
   - `assets/css/vault.css` no declaraba `overflow-x: hidden !important;`, `width: 100% !important;`, `max-width: 100vw !important;`, `overscroll-behavior-x: none;` ni `touch-action: pan-y pinch-zoom;`.
   - Como resultado, el navegador Chrome/WebView en Android permitía al usuario arrastrar y mover la pantalla hacia los lados (horizontal sway).
3. **Efecto cinemático 3D de cajón abierto:**
   - `.drawer-unit.is-open` aplicaba `transform: translateY(-4px) scale(1.008);`. En teléfonos móviles, ese `scale(1.008)` ensanchaba la gaveta más allá del ancho de la pantalla, provocando desbordamiento y saltos al abrir cajones.
4. **Etiqueta Viewport sin `viewport-fit=cover`:**
   - Faltaba configuración para asegurar un viewport estricto en pantallas modernas con notch o barras de gestos Android.

---

## 2. Requisitos de la Solución

### A. Paridad Total de Documentos (15 Expedientes)
1. **Deduplicación estricta por `(normCat, normTitle)`:**
   - En `loadAndRenderDocuments()` (`assets/js/app.js`), la clave de deduplicación debe ser estrictamente `${normCat}|${normTitle}`, normalizando espacios y diacríticos.
   - En caso de duplicados locales, conservar la versión más reciente o más completa, purgar el duplicado de `IndexedDB` y registrar el tombstone correspondiente.
2. **Purga de documentos huérfanos locales en `mergeCloudDocuments`:**
   - En `mergeCloudDocuments()` (`assets/js/storage.js`), si un documento local en `IndexedDB` ya fue sincronizado previamente (`is_synced: true`) o existe como réplica de categoría/título, pero no figura en los documentos activos de la nube (`cloudDocs`), purgarlo de `IndexedDB`.
3. **Sincronización de `data/vault_cloud.json`:**
   - Actualizar el archivo local `data/vault_cloud.json` con los 15 documentos vigentes en Cloud Run.

### B. Fijación Absoluta del Scroll Horizontal en Android
1. **Reglas CSS en `assets/css/vault.css`:**
   - `html, body`:
     ```css
     html, body {
       overflow-x: hidden !important;
       max-width: 100vw !important;
       width: 100% !important;
       position: relative;
       touch-action: pan-y pinch-zoom;
       overscroll-behavior-x: none;
       -webkit-overflow-scrolling: touch;
     }
     ```
   - `@media (max-width: 768px)`:
     - `.drawer-unit.is-open`: desactivar `scale(1.008)` usando únicamente `transform: translateY(-2px);`.
   - `.app-static-header`, `.app-static-footer`:
     - Asegurar `overflow: hidden; max-width: 100vw; text-overflow: ellipsis;`.
2. **Optimización Responsive del Navbar en `index.html`:**
   - `#header-user-name`: `hidden md:inline` (en móvil se muestra el avatar circular con anillo de estado).
   - `#text-license-badge`: `hidden sm:inline` (en móvil se muestra el badge con icono y color de estado).
   - Espaciado compacto en móvil (`gap-1 sm:gap-2.5`, padding `p-1.5 sm:p-2` en botones de acción).
   - Contenedor con `w-full max-w-full overflow-hidden`.
3. **Viewport en `index.html`:**
   - `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover">`.

### C. Mantenimiento del Sistema
1. **Service Worker v27:**
   - Actualizar `sw.js` a `boveda-digital-v27` y versionar scripts a `?v=27` en `index.html`.
2. **Pruebas Automatizadas:**
   - Añadir tests para paridad de 15 documentos y reglas CSS anti-desbordamiento lateral.
   - 100% de la suite de pruebas pasando.
