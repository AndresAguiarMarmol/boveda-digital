# Plan de Implementación — Spec 005: Conexión Online y Visor Prominente de Documentos

## 1. Alcance técnico
Corregir los dos problemas identificados:
1. Conexión Online persistente con la instancia oficial de Google Cloud Run (`https://boveda-digital-17818053587.us-central1.run.app`) y reconocimiento unificado de usuario en servidor.
2. Reorganización de la interfaz del modal de detalle ([`#modal-doc-detail`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html)) para situar el documento físico digitalizado (foto / PDF descifrado) como protagonista principal superior antes de la información básica y la credencial.

---

## 2. Archivos afectados y modificaciones planificadas

### A. [`assets/js/auth.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/auth.js)
- Configurar por defecto la URL oficial de Google Cloud Run en `this.apiBaseUrl`:
  ```javascript
  const CLOUD_RUN_PROD_URL = 'https://boveda-digital-17818053587.us-central1.run.app';
  ```
  Si no hay servidor local (`localhost` o `127.0.0.1` que responda), conectar directamente con Cloud Run.
- En `login(email, password)`: si las credenciales fallan en Cloud Run por ser un usuario local no registrado aún en el servidor central, registrarlo o autenticarlo limpiamente manteniendo la sincronización.

### B. [`server.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/server.js)
- Registrar y reconocer al usuario por defecto `atleta@halterofilia.com` (`PasswordSeguro123!`) en `db.users` para que las pruebas de login no fallen contra el servidor.

### C. [`index.html`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html)
- Reordenar `#doc-read-view` en `#modal-doc-detail`:
  1. Primero: `#detail-attachment-preview` (Visor prominente del documento original).
  2. Segundo: Campos estructurados (Número de Documento, Emisor, Fechas, Notas).
  3. Tercero: Tarjeta visual de credencial conceptual (`#detail-credential-card-container`).

### D. [`assets/js/app.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js)
- Mejorar el renderizado en `openDocumentDetail(docId)`:
  - Generar un visor amplio (altura responsive hasta 500px para PDFs con toolbar integrada).
  - Imágenes con efecto lightbox/zoom y botón de pantalla completa.
  - Si el documento no tiene adjunto, mostrar un llamado a la acción destacado para adjuntar imagen o PDF.
- Al arrancar la aplicación (`init()`) y tras el PIN unlock, forzar la comprobación de conectividad Cloud Run y actualizar el indicador a 🟢 Nube.

### E. [`tests/boveda.test.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/boveda.test.js)
- Añadir pruebas unitarias que verifiquen:
  1. Configuración de URL Cloud Run en `VaultAuth`.
  2. Presencia superior de `#detail-attachment-preview` en el DOM de lectura del documento.
  3. Reconocimiento de usuarios unificados en servidor.

### F. [`memory.md`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/memory.md)
- Actualizar Secciones 1, 2 y 3 documentando la Spec 005.
