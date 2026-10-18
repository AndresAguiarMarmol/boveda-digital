# Plan de Implementación — Spec 001 (Gavetas Personalizadas y Código Cromático)

## Archivos y Responsabilidades
- **`assets/css/vault.css`:**
  - Definición de estilos CSS basados en la variable `--drawer-color` sobre `.drawer-unit`.
  - Estilizado de LEDs indicadores, reflejo del tirador de acero, bordes de apertura de riel y pestañas de carpetas.
  - Clase `.credential-card.theme-custom` para soporte de temas personalizados.
  - *Cubre: RF-1, RF-6.*
- **`index.html`:**
  - Botón "Nueva Gaveta" en el encabezado de control del archivador.
  - Estructura del modal accesible `<dialog id="modal-new-drawer">` con selectores de color e iconos y formulario de creación.
  - *Cubre: RF-2.*
- **`assets/js/app.js`:**
  - Asignación de paleta cromática por defecto a las 5 categorías centrales.
  - Carga y fusión reactiva de gavetas personalizadas (`loadAndRenderDocuments`, `updateCategoryDropdowns`).
  - Lógica de apertura, selección y guardado de gavetas (`openNewDrawerModal`, `handleSaveNewDrawer`, `deleteCustomDrawer`).
  - Renderizado dinámico de la tarjeta de credencial con color personalizado (`renderCredentialCardHTML`).
  - *Cubre: RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7, RF-8, RF-9.*
- **`assets/js/storage.js`:**
  - Almacén de configuración `settings` en `IndexedDB` (`BovedaDigitalDB`) para persistir `customDrawers_<userId>`.
  - *Cubre: RF-4, RF-9, RNF-1.*
- **`tests/boveda.test.js`:**
  - Suite de pruebas unitarias puras sin dependencias DOM para clasificación, formateo y reglas de validación.
  - *Cubre: RF-3, RF-5, RF-6, RF-7, RF-8.*

---

## Funciones Puras para Validación y Clasificación

### 1. `validarNuevaGaveta(label, categoriasExistentes)`
Valida que la etiqueta no esté vacía, no coincida con categorías del sistema ni con gavetas ya creadas, y genera una clave normalizada.
- *Entrada:* `label: string`, `categoriasExistentes: Object`
- *Salida:* `{ valido: boolean, key?: string, error?: string }`

### 2. `validarEliminarGaveta(key, categoriasExistentes, documentos)`
Valida que la gaveta exista, sea de tipo personalizado (`isCustom: true`) y no contenga documentos asociados en memoria.
- *Entrada:* `key: string`, `categoriasExistentes: Object`, `documentos: Array`
- *Salida:* `{ permitido: boolean, error?: string }`

### 3. `agruparPorGaveta(documentos, categoriasDisponibles)`
Distribuye una lista de expedientes entre las gavetas del sistema y las gavetas personalizadas registradas.
- *Entrada:* `documentos: Array`, `categoriasDisponibles: Object`
- *Salida:* `Object` con arrays de documentos por cada clave de gaveta.

### 4. `formatearCredencialVisual(doc, catInfo)`
Calcula la clase CSS de tema, el color de borde/fondo dinámico y genera las dos líneas OCR/MRZ estandarizadas de 40 caracteres.
- *Entrada:* `doc: Object`, `catInfo: Object`
- *Salida:* `{ themeClass: string, customColor: string|null, mrzLine1: string, mrzLine2: string, hasEmvChip: boolean, hasBiometricPhoto: boolean }`

---

## Algoritmo en Pseudocódigo

### Creación de Gaveta (`handleSaveNewDrawer`)
```text
1. Leer etiqueta de texto y subtítulo del formulario.
2. Si la etiqueta está vacía o es solo espacios:
     Mostrar error y abortar.
3. Normalizar clave interna:
     clave = "custom_" + normalizar_slug(etiqueta)
4. Si clave ya existe en this.categories:
     Mostrar error de gaveta duplicada y abortar.
5. Crear objeto de gaveta:
     nuevaGaveta = {
       label: etiqueta,
       subtitle: subtítulo,
       color: colorSeleccionado,
       icon: iconoSeleccionado,
       isCustom: true,
       drawerNumber: número_siguiente
     }
6. Guardar en IndexedDB en almacén "settings" bajo clave `customDrawers_${userId}`.
7. Actualizar this.categories en memoria.
8. Llamar a updateCategoryDropdowns() para actualizar selects de formularios.
9. Re-renderizar archivador con renderCabinet().
10. Cerrar diálogo modal y notificar al usuario.
```

### Eliminación de Gaveta (`deleteCustomDrawer`)
```text
1. Verificar si this.categories[key].isCustom es verdadero. Si no, rechazar.
2. Contar documentos donde doc.category == key.
3. Si conteo > 0:
     Alertar al usuario que la gaveta contiene expedientes y bloquear eliminación.
4. Si conteo == 0:
     Pedir confirmación al usuario.
     Si confirma:
       Eliminar key del objeto customDrawers.
       Guardar objeto actualizado en IndexedDB.
       Eliminar key de this.categories.
       Llamar a updateCategoryDropdowns().
       Re-renderizar archivador con renderCabinet().
```

---

## Decisiones Justificadas y Alternativas Descartadas

1. **Almacenamiento en el store `settings` de `IndexedDB` vs. Modificar esquema de BD (Versión 2):**
   - *Decisión:* Guardar el mapa de gavetas personalizadas bajo la clave `customDrawers_<userId>` en el almacén clave-valor `settings`.
   - *Razón:* Evita requerir una migración destructiva o cambio de versión de `IndexedDB` (`version 1`), preservando intactos los documentos existentes y permitiendo persistencia 100% offline por usuario.
   - *Alternativa descartada:* Crear un nuevo ObjectStore `categories` con migración de versión de base de datos. Se descartó por complejidad innecesaria para metadatos de configuración de interfaz.

2. **Propiedad CSS personalizada `--drawer-color` vs. Clases de utilidad Tailwind por color:**
   - *Decisión:* Asignar `--drawer-color: ${cat.color}` a nivel de `.drawer-unit` en línea.
   - *Razón:* Permite que cualquier color arbitrario (sea de los 5 iniciales o de la paleta de 10 colores de gavetas personalizadas) se propague en cascada limpia a los LEDs (`box-shadow`), tiradores metálicos, bordes y badges sin inflar el CSS con cientos de clases estáticas.
   - *Alternativa descartada:* Generar decenas de selectores estáticos `.drawer-cyan`, `.drawer-pink`, etc.

---

## Estrategia de Tests con `node --test`
Ejecutar la suite automatizada en [tests/boveda.test.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/boveda.test.js) validando:
1. `agruparPorGaveta`: verificación de expedientes en gavetas predeterminadas y gavetas personalizadas dinámicas.
2. `formatearCredencialVisual`: asignación correcta de `theme-custom` y color dinámico HEX.
3. `validarNuevaGaveta`: prevención de nombres duplicados, claves del sistema y etiquetas vacías.
4. `validarEliminarGaveta`: bloqueo de eliminación en gavetas del sistema y en gavetas personalizadas que albergan documentos.
