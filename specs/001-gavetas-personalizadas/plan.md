# Plan de Implementación — Spec 001 (Gavetas Personalizadas y Código Cromático)

## Archivos y Responsabilidades
- **`assets/css/vault.css`:**
  - Definición de estilos CSS basados en la variable `--drawer-color` sobre `.drawer-unit`.
  - Estilizado de LEDs indicadores, reflejo del tirador de acero, bordes de apertura de riel y pestañas de carpetas.
  - Clase `.credential-card.theme-custom` para soporte de temas personalizados.
  - Estilos del Header estático (`.app-static-header`, `fixed top-0 left-0 right-0 z-40`) y Footer estático (`.app-static-footer`, `fixed bottom-0 left-0 right-0 z-40`).
  - Reglas `@media print` para ocultar Header y Footer estáticos.
  - Animaciones cinemáticas de apertura/cierre de gavetas (`.drawer-unit.is-open` con perspectiva 3D, avance de tracción `scale/translateY`, micro-interacción en tirador metálico activo y riel elástico).
  - Soporte de accesibilidad para `@media (prefers-reduced-motion: reduce)`.
  - *Cubre: RF-1, RF-6, RF-10, RF-11, RF-12, RF-16, RF-17, RNF-5, RNF-7.*
- **`index.html`:**
  - Encabezado estático anclado en el top con texto exacto `"Boveda Digital "`.
  - Pie de página estático anclado en la base con texto exacto `"Análisis/Diseño de Andres Aguiar V 1.0 Santiago de Chile octubre 2026 - Contacto +56933395447 - Whatsapp +56933395447"`.
  - Espaciados (`pt-12 pb-14`) en vistas activas para no solapar contenido interactivo.
  - Botones accesibles de "Respaldar" y "Recuperar" en el navbar del Dashboard.
  - Input invisible `<input type="file" id="input-restore-backup" accept=".json">`.
  - Botón "Nueva Gaveta" y estructura del modal `<dialog id="modal-new-drawer">`.
  - *Cubre: RF-2, RF-10, RF-11, RF-12, RF-13, RF-14.*
- **`assets/js/storage.js`:**
  - Método `exportBackupData(userId)`: compila todos los documentos cifrados, gavetas personalizadas y metadatos de configuración en un objeto JSON con checksum.
  - Método `importBackupData(backupData, userId)`: valida integridad e inserta/fusiona expedientes y gavetas en `IndexedDB`.
  - *Cubre: RF-4, RF-9, RF-13, RF-14, RF-15, RNF-1, RNF-6.*
- **`assets/js/app.js`:**
  - Manejadores `handleExportBackup()` y `handleImportBackup(file)` conectados a los botones del navbar.
  - Coordinación cinemática de apertura/cierre de gavetas en `toggleDrawer()` y `renderCabinet()`.
  - *Cubre: RF-1 a RF-17.*
- **`tests/boveda.test.js`:**
  - Suite de pruebas unitarias puras: clasificación, credenciales, validación de respaldo JSON, fusión de expedientes y presencia de constantes requeridas.
  - *Cubre: RF-3, RF-5, RF-6, RF-7, RF-8, RF-10, RF-11, RF-13, RF-14, RF-15, RF-16.*

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

### 5. `serializarBackupBoveda(documentos, customDrawers, userId, fechaISO)`
Genera el paquete serializable de respaldo con formato estandarizado Zero-Knowledge y metadatos de integridad.
- *Entrada:* `documentos: Array`, `customDrawers: Object`, `userId: string`, `fechaISO: string`
- *Salida:* `Object` con `{ app: 'BovedaDigital', version: '1.0', exported_at: string, user_id: string, customDrawers: Object, documents: Array, total_documents: number }`

### 6. `validarBackupBoveda(data)`
Valida que el archivo JSON posea la estructura requerida, contenga un arreglo de documentos y respete la firma de la app.
- *Entrada:* `data: any`
- *Salida:* `{ valido: boolean, error?: string }`

### 7. `fusionarDocumentosBackup(docsActuales, docsBackup)`
Aplica estrategia Merge: une documentos del respaldo y actuales sin colisiones, actualizando por ID si ya existe.
- *Entrada:* `docsActuales: Array`, `docsBackup: Array`
- *Salida:* `Array` de documentos consolidados.

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

### Respaldo de Datos (`handleExportBackup`)
```text
1. Obtener lista completa de documentos desde IndexedDB (getDocuments).
2. Obtener gavetas personalizadas activas del usuario (customDrawers).
3. Construir paquete con serializarBackupBoveda(documentos, customDrawers, userId, fechaISO).
4. Crear Blob con tipo application/json y URL de descarga temporal.
5. Crear elemento <a> dinámico con download = "boveda-backup-YYYY-MM-DD.json" y forzar clic.
6. Liberar URL del blob y mostrar toast de respaldo exitoso.
```

### Recuperación de Datos (`handleImportBackup`)
```text
1. Disparar clic en <input type="file" accept=".json">.
2. Al seleccionar archivo, leer texto mediante FileReader.
3. Parsear JSON con bloque try/catch. Si falla sintaxis: mostrar error y abortar.
4. Validar esquema con validarBackupBoveda(data). Si es inválido: mostrar error y abortar.
5. Obtener documentos locales actuales de IndexedDB.
6. Fusionar documentos con fusionarDocumentosBackup(docsActuales, data.documents).
7. Guardar cada documento fusionado en IndexedDB con storage.saveDocument().
8. Si el respaldo contiene customDrawers, guardarlas en settings y fusionarlas con this.categories.
9. Recargar documentos con loadAndRenderDocuments() y actualizar interfaz.
10. Mostrar toast informando cantidad de documentos y gavetas recuperadas.
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

3. **Ubicación de Respaldo y Recuperación en el Navbar vs. Menú contextual oculto:**
   - *Decisión:* Situar los botones en el Navbar principal del Dashboard de la bóveda junto a PIN y Bloqueo.
   - *Razón:* Máxima visibilidad y accesibilidad inmediata para el usuario en cualquier momento sin tener que buscar en submenús.
   - *Alternativa descartada:* Colocarlo al fondo de la página o dentro de un diálogo modal secundario.

4. **Estrategia Merge para Recuperación de Datos vs. Sobrescritura destructiva:**
   - *Decisión:* Combinar los datos del archivo de respaldo con los locales, actualizando registros que coincidan en ID y agregando los faltantes sin vaciar la base de datos existente.
   - *Razón:* Protege al usuario contra pérdida accidental de expedientes creados entre el último respaldo y el momento de restauración.
   - *Alternativa descartada:* Vaciar la base de datos previa a la restauración.

5. **Cinemática puramente CSS con aceleración de GPU vs. Librería externa de física:**
   - *Decisión:* Animación CSS3 en `vault.css` con `transform: translateY/scale`, sombras gaussianas y micro-interacción en tirador metálico.
   - *Razón:* 0 kb de sobrecarga, rendimiento garantizado a 60 fps nativos y compatibilidad con directivas `@media (prefers-reduced-motion)`.
   - *Alternativa descartada:* Depender de librerías JS como Framer Motion o GSAP.

---

## Estrategia de Tests con `node --test`
Ejecutar la suite automatizada en [tests/boveda.test.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/boveda.test.js) validando:
1. `agruparPorGaveta`: verificación de expedientes en gavetas predeterminadas y gavetas personalizadas dinámicas.
2. `formatearCredencialVisual`: asignación correcta de `theme-custom` y color dinámico HEX.
3. `validarNuevaGaveta`: prevención de nombres duplicados, claves del sistema y etiquetas vacías.
4. `validarEliminarGaveta`: bloqueo de eliminación en gavetas del sistema y en gavetas personalizadas que albergan documentos.
5. `serializarBackupBoveda`: estructura JSON, metadatos y preservación de payloads cifrados.
6. `validarBackupBoveda`: rechazo de JSON corrupto, tipos inválidos o esquemas ajenos.
7. `fusionarDocumentosBackup`: combinación no destructiva de expedientes.
8. Verificación estática del texto exacto del Header y Footer en `index.html`.
9. Verificación de reglas cinemáticas de gavetas en `vault.css`.
