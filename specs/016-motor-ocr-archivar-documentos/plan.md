# Plan de Implementación 016: Motor OCR `archivar-documentos` en Bóveda Digital (`v20`)

## 1. Archivos a Modificar

1. **[`.agents/skills/sdd/SKILL.md`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/.agents/skills/sdd/SKILL.md)**:
   - Cerrar el bloque de código markdown JSON final (` ``` `).
2. **[`assets/js/gdrive.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/gdrive.js)**:
   - Implementar la función pura `procesarTextoOCRParaDrive(textoOCR, opciones)` que cumple las 4 reglas y el esquema JSON de `SKILL.md`.
   - Exponer `procesarTextoOCR(textoOCR, opciones)` en la clase `VaultGoogleDrive` y exportar para Node.js (`module.exports`) y navegador (`window.procesarTextoOCRParaDrive`).
3. **[`index.html`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html)**:
   - Añadir en `#modal-new-doc` el panel **Motor OCR `archivar-documentos` (Google Drive)** con área de texto `#input-ocr-raw-text`, botón `#btn-process-ocr-skill` y previsualización JSON `#ocr-skill-json-output`.
   - Actualizar referencias de scripts a `?v=20`.
4. **[`assets/js/app.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js)**:
   - Implementar `handleProcessOcrSkill(customText)` que ejecuta `procesarTextoOCRParaDrive()`, muestra el JSON normalizado en `#ocr-skill-json-output` y autocompleta el formulario `#form-new-doc` (mapeando la categoría Drive a la gaveta correspondiente de Bóveda Digital).
   - Conectar `startCameraScanner()` con `handleProcessOcrSkill()` y enriquecer `handleSaveNewDocument()` con la nomenclatura y ruta de Google Drive.
5. **[`sw.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/sw.js), [`tests/boveda.test.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/boveda.test.js) y [`memory.md`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/memory.md)**:
   - Actualizar `CACHE_NAME` a `boveda-digital-v20`, añadir pruebas unitarias para `SDD 016` (`procesarTextoOCRParaDrive`) y registrar en `memory.md`.

