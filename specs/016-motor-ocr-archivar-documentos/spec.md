# Especificación 016: Integración de la Skill `archivar-documentos` (Motor OCR y Nomenclatura Google Drive)

## 1. Objetivo
Integrar en el código de **Bóveda Digital** ([`assets/js/gdrive.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/gdrive.js), [`assets/js/app.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js) e [`index.html`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html)) las reglas de extracción, normalización de nomenclatura y jerarquía de carpetas de Google Drive definidas en [`.agents/skills/sdd/SKILL.md`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/.agents/skills/sdd/SKILL.md) (`archivar-documentos` v1.0.0), sin alterar ninguna funcionalidad existente.

---

## 2. Reglas de Negocio de la Skill (`SKILL.md`)

1. **Fechas (`fecha_emision`):** Formato estricto ISO-8601 (`YYYY-MM-DD`), priorizando la fecha de emisión detectada en el texto OCR (soportando formatos `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY` y fechas en español como `"28 de Octubre de 2026"`).
2. **Montos y Moneda (`monto_total`, `moneda`):** Número limpio (`float`/`number`) sin separadores de miles engañosos (ej. `$ 42.850` en `CLP` → `42850`), y moneda en código ISO (`CLP`, `USD`, `EUR`).
3. **Jerarquía Drive (`ruta_drive`):** `Documentos/[YYYY]/[Categoria]/[Emisor]` (sin tildes y con espacios sustituidos por guiones bajos en los segmentos de carpeta).
4. **Nomenclatura (`nombre_archivo`):** `YYYY-MM-DD_[Categoria]_[Emisor]_[Folio].[ext]` (sin tildes, espacios sustituidos por guiones bajos `_`).
5. **Esquema de Salida Requerido:**
   ```json
   {
     "tipo_documento": "factura | boleta | contrato | comprobante | otro",
     "categoria": "servicios | salud | finanzas | compras | vehiculo | hogar | impuestos",
     "emisor": "Nombre entidad",
     "fecha_emision": "YYYY-MM-DD",
     "monto_total": 0.0,
     "moneda": "CLP | USD | EUR",
     "folio": "string o null",
     "nombre_archivo": "YYYY-MM-DD_Categoria_Emisor_Folio.pdf",
     "ruta_drive": "Documentos/YYYY/Categoria/Emisor"
   }
   ```

---

## 3. Requerimientos Funcionales (SDD)

- **RF-01 (Motor Puro en `assets/js/gdrive.js`):** Implementar y exportar `procesarTextoOCRParaDrive(ocrText, opciones)` e integrarlo en `VaultGoogleDrive.prototype.procesarTextoOCR(ocrText, opciones)`.
- **RF-02 (Asistente Interactivo en `#modal-new-doc`):** Incorporar en el modal de Nuevo Documento un bloque de extracción OCR (`#input-ocr-raw-text`, `#btn-process-ocr-skill` y visor `#ocr-skill-json-output`) que procese cualquier texto OCR o resultado del escáner de cámara, muestre el JSON normalizado de la skill y autocompleta automáticamente los campos del formulario (`title`, `category`, `doc_number`, `issuer`, `issue_date`, `notes`).
- **RF-03 (Metadatos Drive en Guardado y Respaldo):** Al guardar un documento en `handleSaveNewDocument()`, incluir automáticamente el bloque normalizado `drive_archive` (`nombre_archivo` y `ruta_drive` según `SKILL.md`) en el payload cifrado y renombrar el archivo adjunto con la nomenclatura estandarizada cuando provenga del asistente OCR.
