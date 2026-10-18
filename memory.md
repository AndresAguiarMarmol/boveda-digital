# memory.md — Memoria del proyecto Bóveda Digital

Registro de todo lo que debe preservarse entre sesiones de trabajo: arquitectura de datos, decisiones técnicas tomadas e historial de cambios.
**Los agentes deben leer este archivo antes de empezar y actualizarlo al terminar cada tarea** (ver `AGENTS.md`).

---

## 1. Estructura de datos y persistencia

### A. Persistencia Local en `IndexedDB` (`BovedaDigitalDB`, versión 1)
- **Almacén `documents` (KeyPath: `id`):**
  - `id`: Identificador único UUID (`doc_xxxxxxxxx`).
  - `user_id`: ID del usuario propietario asociado en el backend.
  - `category`: Categoría funcional (`identidad`, `vehiculos`, `finanzas`, `residencia`, `salud`).
  - `title`: Título legible del documento.
  - `encrypted_payload`: Texto cifrado en Base64 con AES-256-GCM (contiene número de documento, emisor, fechas, notas y adjunto).
  - `iv`: Vector de inicialización de 12 bytes en Base64.
  - `checksum`: Hash SHA-256 de integridad criptográfica.
  - `expiry_date`: Fecha ISO de vencimiento (para consultas rápidas de alertas).
  - `is_synced`: Booleano de estado de sincronización con la nube.
  - `created_at` / `updated_at`: Marcas temporales ISO 8601.

- **Almacén `settings` (KeyPath: `key`):**
  - `currentUser`: Perfil del usuario autenticado con datos de licencia y suscripción.
  - `accessToken` / `refreshToken`: Tokens JWT emitidos por el backend.
  - `userSalt`: Salt criptográfico único para derivar la clave maestra local.
  - `vaultPinHash_<email>`: Hash SHA-256 del PIN + Salt para validación de desbloqueo.
  - `customDrawers_<userId>`: Diccionario de gavetas personalizadas creadas por el usuario (`label`, `subtitle`, `color`, `icon`, `isCustom`, `drawerNumber`).

- **Almacén `audit_log` (KeyPath: `id` auto-incremental):**
  - Registro de eventos (`LOGIN_SUCCESS`, `VAULT_UNLOCKED`, `DOC_CREATED`, `DOC_VIEWED`, `DOC_DELETED`, etc.).

### B. Estructura del Token JWT y Claims de Suscripción
Compatible con el backend centralizado de la app de Halterofilia:
```json
{
  "sub": "usr_9b1deb4d-3b7d",
  "email": "usuario@ejemplo.com",
  "apps": ["halterofilia", "boveda_digital"],
  "subscription": {
    "plan": "free" | "pro",
    "status": "active",
    "max_docs": 5,
    "cloud_sync_enabled": false
  }
}
```

---

## 2. Decisiones vigentes

- **Cifrado Zero-Knowledge y Web Crypto API:** El backend centralizado nunca recibe las claves maestras ni los documentos en texto claro. La clave simétrica de 256 bits se deriva exclusivamente en el cliente mediante PBKDF2 (100,000 iteraciones, SHA-256) a partir del PIN maestro del usuario y un salt criptográfico.
- **Acceso 100% Offline:** Toda la información cifrada reside en `IndexedDB`, permitiendo consultar y crear documentos sin conexión a internet.
- **Compatibilidad con Backend Existente (Halterofilia):** Utiliza autenticación REST sobre HTTPS con tokens JWT / OAuth2, refresh tokens rotativos y sesiones administradas en servidor.
- **Modelo de Licenciamiento:**
  - *Plan Gratuito:* Limitado a un máximo de 5 documentos y almacenamiento local.
  - *Plan PRO:* Almacenamiento ilimitado, alertas de vencimiento, copias de seguridad cifradas en la nube y exportación avanzada.
- **Metáfora Visual de Mueble Gavetero (Filing Cabinet) Cromático y Extensible:** La organización de documentos se estructura en un archivador blindado donde cada gaveta cuenta con una identidad cromática única (LED, reflejo de tirador, bordes, riel y credencial visual). El sistema incluye 5 gavetas base (`identidad` Cyan, `vehiculos` Esmeralda, `finanzas` Ámbar, `residencia` Púrpura, `salud` Rosa) y permite al usuario crear gavetas personalizadas con nuevos conceptos, selector de color HSL/Hex y selector de iconos Lucide, con persistencia offline en `IndexedDB`. Los documentos cuentan con soporte completo de ciclo de vida: lectura descifrada, impresión limpia (`window.print()`), modificación con re-cifrado AES-256-GCM y eliminación.

---

## 3. Historial de cambios

### 2026-10-17 — Implementación del Servidor HTTP y API REST Backend (Node.js Nativo)
- **Servidor HTTP y API REST (`server.js`):** Creado servidor nativo Node.js sin dependencias externas (`node:http`, `node:crypto`, `node:fs`) que sirve tanto la SPA de Bóveda Digital como la API REST completa compatible con el ecosistema de Halterofilia.
- **Endpoints Implementados:**
  - `POST /api/v1/auth/login`: Autenticación con verificación de hash SHA-256 y emisión de tokens JWT firmados (HMAC-SHA256).
  - `POST /api/v1/auth/register`: Registro de nuevos usuarios con asignación automática de plan Free.
  - `POST /api/v1/auth/refresh`: Renovación rotativa de tokens de acceso JWT.
  - `GET /api/v1/auth/me`: Inspección del perfil del usuario y claims de aplicaciones (`halterofilia`, `boveda_digital`).
  - `GET /api/v1/subscription/status`: Validación del plan activo y límite de documentos.
  - `POST /api/v1/subscription/checkout`: Simulación de upgrade a suscripción PRO.
  - `GET /api/v1/documents`: Listado de metadatos cifrados en nube.
  - `POST /api/v1/documents`: Subida y validación estricta de cuota de documentos en servidor (Free: máx 5, Pro: ilimitado).
  - `POST /api/v1/documents/batch-sync`: Sincronización en lote Zero-Knowledge (sólo payloads cifrados, IVs y checksums).
  - `POST /api/v1/share/create` y `GET /api/v1/share/:token`: Generación y consulta pública de enlaces temporales seguros.
  - `GET /api/health`: Endpoint de estado y comprobación de compatibilidad.
- **Suite de Pruebas Automatizadas:** 23/23 tests pasando en verde con `node --test tests/boveda.test.js tests/server.test.js`.
- **Limpieza de Archivos Legacy:** Eliminados archivos obsoletos del proyecto anterior (`custom.css`, `data.js`, `i18n.js`, `main.js`, `search.js` y sus tests asociados).

### 2026-10-17 — Gavetas con Colores Diferenciados y Creación de Nuevas Gavetas Personalizadas (SDD Spec 001)
- **Documentación SDD Completa:** Generadas especificación formal [specs/001-gavetas-personalizadas/spec.md](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/specs/001-gavetas-personalizadas/spec.md) con requisitos en formato EARS, plan de implementación [specs/001-gavetas-personalizadas/plan.md](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/specs/001-gavetas-personalizadas/plan.md) y desglose de tareas [specs/001-gavetas-personalizadas/tasks.md](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/specs/001-gavetas-personalizadas/tasks.md).
- **Código Cromático por Gaveta:** Asignado un color y resplandor único a cada gaveta en [assets/css/vault.css](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/css/vault.css) mediante la variable CSS `--drawer-color` (Cyan `#06b6d4`, Esmeralda `#10b981`, Ámbar `#f59e0b`, Púrpura `#8b5cf6`, Rosa `#ec4899`), proyectada dinámicamente en los diodos LED, reflejo del tirador de acero, bordes de apertura activa, acento de carpeta y badge de expedientes.
- **Modal y Creación de Gavetas Personalizadas:**
  - Añadido botón *"Nueva Gaveta"* en la barra de control del archivador de [index.html](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html).
  - Implementado el diálogo interactivo `#modal-new-drawer` con inputs para nombre del concepto, subtítulo descriptivo, paleta de 10 colores vibrantes y selector visual de 10 iconos Lucide (`briefcase`, `graduation-cap`, `gem`, `landmark`, `key`, etc.).
  - Persistencia offline en el almacén `settings` de `IndexedDB` bajo la clave `customDrawers_<userId>`.
  - Actualización reactiva de los menús desplegables de categorías al añadir o editar documentos (`#new-doc-category-select` y `#edit-category`).
- **Eliminación Segura de Gavetas:** Botón de descarte para gavetas personalizadas, validando que no contengan documentos activos antes de permitir el borrado.
- **Credencial Digital Dinámica:** Soporte de fondos degradados y bordes con el color de la gaveta personalizada en [assets/js/app.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js).
- **Pruebas Unitarias:** 14/14 tests pasando en verde en [tests/boveda.test.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/boveda.test.js).

### 2026-10-17 — Visualización Completa del Documento al Seleccionarlo (Credencial Digital y Descifrado Inline)
- Implementada la visualización del documento al seleccionarlo desde cualquier gaveta del archivador en [assets/js/app.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js), [index.html](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html) y [assets/css/vault.css](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/css/vault.css).
- Diseñada la **Credencial Digital de Alta Seguridad** (`.credential-card`) con paleta técnica diferenciada por gaveta (`theme-identidad`, `theme-vehiculos`, `theme-finanzas`, `theme-residencia`, `theme-salud`), microchip EMV dorado, franja de seguridad holográfica, avatar biométrico verificado, número grabado en relieve y banda OCR / MRZ (Machine Readable Zone).
- Implementado el **descifrado en memoria y renderizado inline** de expedientes adjuntos:
  - Imágenes vectoriales y mapas de bits (`image/*`): marco interactivo con zoom a pantalla completa y descarga directa.
  - Documentos PDF (`application/pdf`): visor embebido con controles nativos y apertura en nueva pestaña.
  - Gestión de memoria con revocación automática de URLs temporales (`URL.revokeObjectURL`) al cerrar el diálogo o cambiar de expediente.
- Incorporado el sembrado automático (`_seedInitialDemoDocuments`) con 3 documentos y escaneos vectoriales enriquecidos para que la bóveda siempre cuente con expedientes listos para consultar y probar desde el primer desbloqueo.
- Añadidas pruebas unitarias en [tests/boveda.test.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/boveda.test.js) con 10/10 tests pasando en verde.

### 2026-10-17 — Flujo y Botón de Reseteo de PIN Maestro
- Implementado el método `resetPin()` en [assets/js/auth.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/auth.js) y [assets/js/app.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js) para eliminar los hashes de PIN registrados y redirigir limpiamente a la pantalla de configuración de un nuevo PIN.
- Añadido el botón de acceso directo *"¿Olvidaste tu PIN? Restablecer PIN"* en la pantalla de desbloqueo táctil de [index.html](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html) y acceso rápido *"PIN"* en la barra de navegación del dashboard.
- 22/22 tests unitarios pasando en verde.

### 2026-10-17 — Implementación del Mueble Gavetero y Operaciones de Expedientes (Lectura, Impresión, Modificación y Eliminación)
- Diseñado e implementado el **Mueble Gavetero Blindado** en [index.html](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html) y [assets/css/vault.css](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/css/vault.css) con 5 cajones funcionales, tiradores de acero cepillado, tarjetero porta-etiqueta, LEDs indicadores de estado y apertura animada de riel de carpetas.
- Implementado el índice de expedientes colgantes por gaveta con badges de vigencia, copia rápida de números y botón para archivar directamente en cada gaveta.
- Añadido el control de apertura/cierre de cajones (`toggleDrawer`, `toggleAllDrawers`) y sincronización automática al buscar términos en tiempo real.
- Actualizado el modal de expediente `#modal-doc-detail` con soporte completo para:
  1. **Leerlo:** Vista estructurada con datos oficiales, previsualización y descarga descifrada de adjuntos.
  2. **Imprimirlo:** Generación de ficha imprimible oficial vía `window.print()` con reglas CSS dedicadas `@media print`.
  3. **Modificar sus características:** Modo de edición interactivo con re-cifrado instantáneo AES-256-GCM en IndexedDB.
  4. **Eliminarlo:** Borrado seguro con confirmación y actualización reactiva de los contadores de la gaveta.
- Creada suite de pruebas unitarias en [tests/boveda.test.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/tests/boveda.test.js) con 22/22 tests pasando en verde.

- Diseñada la arquitectura integral y documentación técnica en [docs/architecture.md](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/docs/architecture.md) con diagrama de flujo secuencial Mermaid, esquema SQL de PostgreSQL para usuarios, suscripciones y documentos cifrados, y especificación de endpoints REST.
- Implementado el módulo criptográfico nativo en [assets/js/crypto.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/crypto.js) con Web Crypto API (AES-256-GCM y PBKDF2).
- Creado el motor de almacenamiento offline en [assets/js/storage.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/storage.js) con IndexedDB (`BovedaDigitalDB`) para documentos, adjuntos y registros de auditoría.
- Desarrollado el controlador de autenticación unificada en [assets/js/auth.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/auth.js) compatible con el backend de Halterofilia (JWT, refresh token y verificación de cuotas Free/Pro).
- Diseñado el sistema de interfaz de usuario en [assets/css/vault.css](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/css/vault.css) y [index.html](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html) con vistas de login, teclado de PIN táctil, dashboard, escáner de cámara inteligente, visor de detalles y modal de mejora a PRO.
- Orquestada la lógica de aplicación en [assets/js/app.js](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js) con gestión de estados, alertas de vencimiento, copias rápidas y enlaces compartidos temporales.
- Sintaxis validada al 100% con `node -c`.