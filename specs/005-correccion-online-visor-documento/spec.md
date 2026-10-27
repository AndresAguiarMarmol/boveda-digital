# Spec 005 — Corrección de Conexión en Línea (Online Status) y Visor Completo de Documento Adjunto

Estado: implementada

## Contexto y objetivo
Tras la implementación de la Especificación 004 (unificación de licenciamiento Halterofilia y módulo de usuario registrado), el usuario reportó dos comportamientos indeseados:
1. **"Se presenta off-line":** El indicador de nube en la barra horizontal superior y el estado del sistema marcan erróneamente `Offline` / `Modo Local / Offline`, aún teniendo el servidor central activo y desplegado en Google Cloud Run (`https://boveda-digital-17818053587.us-central1.run.app`). Esto ocurre porque si el usuario abre la aplicación en local (`file://` o `localhost`) o sin configurar manualmente la URL de Cloud Run en `localStorage`, la URL de API por defecto fallback a `defaultBaseUrl = window.location.origin` o `'https://api.ecosistema.com'`. Además, al iniciar sesión con el usuario de dispositivo o en contingencia, no se sincroniza ni se enlaza la URL oficial de Cloud Run, dejando al cliente en modo Offline.
2. **"Presenta información básica del expediente, pero el documento como tal no se presenta":** En el modal de detalle del expediente ([`#modal-doc-detail`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html)), lo primero que se ve es la tarjeta conceptual decorativa ("Digital Document Showcase" / credencial con líneas MRZ) y los textos básicos de metadatos (número, emisor, fechas, notas), mientras que el documento real escaneado o digitalizado (la imagen adjunta, el PDF o el archivo) queda relegado al fondo en `#detail-attachment-preview` o debajo del pliegue de scroll. Además, si el expediente carece de adjunto o si fallara la previsualización del PDF en el `iframe`, el usuario solo percibe una tarjeta genérica con datos básicos y no su documento oficial.

El objetivo de esta especificación bajo la Metodología de Control de Cambios (MCC / SDD) es:
1. **Garantizar la conexión en línea (Online)** configurando la URL de producción de Cloud Run como base por defecto cuando no se detecte un backend local en el mismo host, asegurando detección proactiva, reconexión automática y sincronización bidireccional inmediata.
2. **Priorizar y presentar de forma destacada el documento como tal** en el visor del expediente: posicionando el archivo digitalizado (imagen a gran tamaño / visor PDF interactivo con controles de zoom, rotación y descarga directa) en la parte superior del visor como protagonista principal, acompañado de los datos estructurados del expediente y la credencial de forma armónica y legible.

---

## Usuarios e impacto
- **Usuario de la Bóveda:** Al abrir la aplicación o desbloquear el archivador, verá el indicador en verde 🟢 **Nube / En Línea** conectado al servidor central de Cloud Run.
- **Usuario visualizando documentos:** Al pulsar "Extraer Expediente" o hacer clic en cualquier documento del archivador, verá inmediatamente en pantalla su **documento digital real** (foto o PDF) con máxima nitidez, botón de pantalla completa, impresión y descarga, sin tener que hacer scroll ni conformarse solo con la ficha técnica.

---

## Requisitos Funcionales (EARS)

### 1. Detección y Conexión en Línea (Online / Cloud Run)
- **RF-1 (URL de Producción Cloud Run por Defecto):** En [`assets/js/auth.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/auth.js), la URL base por defecto del backend REST DEBE ser la instancia oficial en producción de Google Cloud Run (`https://boveda-digital-17818053587.us-central1.run.app`) cuando se ejecute en GitHub Pages, cliente móvil PWA o entorno sin servidor local dedicado (`localhost:3000`), manteniendo la precedencia si el host actual expone un servidor HTTP con endpoint `/api/health`.
- **RF-2 (Reconexión y Estado en UI):** Al inicializar la app y al desbloquear la bóveda con el PIN maestro, `VaultAuth.checkServerConnection()` y `syncWithCloud()` DEBEN comprobar inmediatamente la conectividad con el servidor central y actualizar el indicador visual a 🟢 **Nube (Conectada y Protegida)**.
- **RF-3 (Credenciales de Servidor Unificadas):** El servidor en [`server.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/server.js) y [`assets/js/auth.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/auth.js) DEBE reconocer tanto al usuario administrador/pro (`andres.pro@boveda.com`) como al usuario registrado de dispositivo (`atleta@halterofilia.com` o el email del perfil activo), permitiendo autenticación exitosa contra el backend en la nube sin degradar a offline por credenciales no encontradas.

### 2. Presentación Prominente del Documento Digital (Visor de Expedientes)
- **RF-4 (Visor de Documento como Protagonista Superior):** En [`index.html`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/index.html) y [`assets/js/app.js`](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/assets/js/app.js), el contenedor `#detail-attachment-preview` DEBE posicionarse en la sección superior de `#doc-read-view`, inmediatamente debajo del encabezado de la ventana modal, para que el documento como tal (imagen o PDF original descifrado) sea lo primero visible para el usuario.
- **RF-5 (Mejora del Visor de Imagen y PDF):**
  - Para imágenes: contenedor expandible de alta definición con soporte de clic para pantalla completa, botón de zoom/expandir y descarga rápida.
  - Para PDFs: visor embebido con altura optimizada (mínimo 420px), enlace de apertura directa en pestaña independiente y botón de descarga descifrada.
  - Para expedientes sin archivo adjunto: tarjeta visual informativa con botón destacado para adjuntar/escanear documento digital en 1 toque.
- **RF-6 (Credencial y Metadatos Complementarios):** Los datos estructurados del expediente (número de documento, entidad emisora, fechas y notas) y la credencial visual se dispondrán de forma secundaria y compacta debajo del documento original, permitiendo consultar los metadatos sin tapar el archivo.

---

## Criterios de Aceptación y Pruebas
1. Al cargar la app en el navegador, el indicador de estado de la nube en la barra superior debe comprobar la URL oficial de Cloud Run y marcar 🟢 **Nube** (Online).
2. El inicio de sesión con el usuario de dispositivo debe autenticar exitosamente contra el servidor central sin degradar a contingencia local offline.
3. Al abrir cualquier expediente en el archivador, el documento escaneado/adjunto (imagen o PDF) debe renderizarse inmediatamente en el tercio superior del diálogo modal a tamaño prominente.
4. Las pruebas automatizadas `tests/boveda.test.js` y `tests/server.test.js` deben pasar al 100%.
