# Tareas de Implementación — Spec 001 (Gavetas Personalizadas y Código Cromático)

- [x] **T1. Código cromático y estilos CSS dinámicos en el mueble archivador.** RF-1, RF-6
  - Hecho cuando: Las clases `.drawer-unit`, `.drawer-front`, `.drawer-handle`, `.drawer-led` y `.folder-rail` en `assets/css/vault.css` consumen la variable `--drawer-color`, y `.credential-card.theme-custom` está definida.

- [x] **T2. Interfaz y modal accesible para crear nueva gaveta.** RF-2
  - Hecho cuando: El botón "Nueva Gaveta" se ubica en el archivador y el diálogo `<dialog id="modal-new-drawer">` en `index.html` cuenta con campos de texto, paleta de 10 colores y selector de 10 iconos Lucide.

- [x] **T3. Inicialización cromática y persistencia en `IndexedDB`.** RF-1, RF-4, RNF-1
  - Hecho cuando: `app.js` inicializa las 5 gavetas del sistema con sus colores base y carga/guarda gavetas personalizadas en el almacén `settings` de `IndexedDB` bajo la clave `customDrawers_<userId>`.

- [x] **T4. Sincronización reactiva de selectores de categoría.** RF-5
  - Hecho cuando: El método `updateCategoryDropdowns()` puebla `#new-doc-category-select` y `#edit-category` con todas las gavetas disponibles (sistema y personalizadas).

- [x] **T5. Renderizado dinámico de la Credencial Digital Visual según gaveta.** RF-6
  - Hecho cuando: `renderCredentialCardHTML` en `app.js` aplica el tema `theme-custom` y estilos inline con el color HEX de la gaveta cuando el expediente pertenece a una gaveta personalizada.

- [x] **T6. Validación y flujo de eliminación segura de gavetas personalizadas.** RF-3, RF-7, RF-8, RF-9
  - Hecho cuando: `handleSaveNewDrawer` valida nombres únicos y `deleteCustomDrawer` bloquea el borrado si la gaveta contiene expedientes o si es una gaveta del sistema.

- [x] **T7. Suite de pruebas unitarias automatizadas.** RF-1 a RF-9
  - Hecho cuando: `node --test tests/boveda.test.js` ejecuta y aprueba las pruebas de clasificación por gavetas, temas de credencial, validación de clave y reglas de eliminación con 0 fallos.
