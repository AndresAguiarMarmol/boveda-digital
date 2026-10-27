# Spec 004 — Eliminación de Esquema Demo Free/Pro, Adopción Plena de Licenciamiento Halterofilia y Módulo de Usuario Registrado

Estado: implementada

## Contexto y objetivo
Actualmente, Bóveda Digital conserva residuos de una división artificial de planes comerciales ("Plan Gratuito limitado a 5 documentos" vs "Plan PRO Ilimitado" con modal de checkout y botones demo en login), a pesar de que ya cuenta con la infraestructura del **Sistema de Licenciamiento Offline de Halterofilia** (Spec 003: 7 días de prueba, Device ID, tokens firmados con SHA-256 y `"Halterofilia-SuperSecret-Salt-2026"`, y bloqueo no eludible al expirar).

El objetivo de esta especificación bajo el esquema de Control de Cambios (MCC / SDD) es:
1. **Eliminar completamente la dicotomía demo-free / demo-pro**, suprimiendo el límite arbitrario de 5 documentos, los modales de upgrade/checkout y los botones demo, dejando como único modelo rector el **esquema de licenciamiento de Halterofilia** (7 días de trial completo e ilimitado por dispositivo, activación con token firmado offline, bloqueo al vencer).
2. **Crear el módulo de gestión de usuario idéntico al de Halterofilia** (1 usuario por dispositivo con Nombre, Apellidos, Correo, Teléfono, Foto de perfil con cámara/galería/previsualización, Guardar y Desvincular) y **colocar el botón de acceso en la barra horizontal** (Navbar) exhibiendo avatar y nombre en tiempo real.

---

## Usuarios
- **Usuario de Dispositivo (Nuevo o en Evaluación):** Al iniciar la app, cuenta con 7 días de prueba completa y sin restricciones de documentos ni gavetas. Puede registrar y editar su perfil con foto, nombre, teléfono y correo desde la barra horizontal.
- **Usuario con Período Expirado:** Superados los 7 días sin token de activación, el overlay `#modal-trial-lock` bloquea la interacción mostrando sus datos de usuario registrado, cadena `REQ|<DeviceID>|<correo>` y WhatsApp `+56933395447`.
- **Usuario Licenciado / Activado:** Ingresa el token emitido por el ecosistema Halterofilia y desbloquea el uso ilimitado y permanente de la billetera.

---

## Historias de usuario
- **HU-1 (Almacenamiento Ilimitado en Trial y con Licencia):** Como usuario de la billetera, quiero archivar todos los documentos que necesite sin alertas ni bloqueos artificiales de "5 documentos máximos", rigiéndome exclusivamente por la vigencia de mi licencia o trial.
- **HU-2 (Acceso al Perfil desde la Barra Horizontal):** Como usuario, quiero ver un botón en la barra horizontal superior con mi avatar y nombre que, al pulsarlo, abra mi ficha de usuario registrado.
- **HU-3 (Gestión de Perfil Completa con Foto):** Como usuario, quiero registrar y actualizar mi Nombre, Apellidos, Correo Electrónico, Teléfono de Contacto, y capturar o cargar mi Foto de Perfil desde la cámara o galería.
- **HU-4 (Sincronización con la Cadena de Solicitud):** Como usuario, al actualizar mi correo o datos en mi perfil, quiero que la cadena `REQ|<DeviceID>|<correo>` se sincronice reactivamente para solicitar mi token de activación a soporte.
- **HU-5 (Desvinculación Segura):** Como usuario que transfiere o reconfigura el dispositivo, quiero contar con la opción "Desvincular" para limpiar el perfil registrado y registrar uno nuevo.

---

## Requisitos Funcionales (EARS)

### 1. Eliminación de Demo Free / Pro y Adopción del Esquema Halterofilia
- **RF-1 (Archivado Ilimitado):** El sistema DEBE permitir la creación y archivado de documentos ilimitados en todas las gavetas sin restringir la cuota a 5 documentos, mientras el período de prueba esté vigente o la licencia esté activa.
- **RF-2 (Eliminación de Elementos Free / Pro):** El sistema DEBE eliminar de la interfaz visual los botones de login "Plan Gratuito" y "Plan PRO Ilimitado", el badge `dash-plan-badge` ("Plan Gratuito"), el botón `btn-header-upgrade` ("Mejorar a PRO"), el modal de checkout `modal-upgrade-pro` y los mensajes de límite de 5 documentos.
- **RF-3 (Preservación del Licenciamiento Halterofilia):** El sistema DEBE mantener intacto el sistema de licenciamiento offline de Halterofilia:
  - 7 días de prueba continua desde el primer arranque (`trial_start_date`).
  - Identificador único `Device ID` (`dev_<uuid>`).
  - Cadena de solicitud estandarizada `REQ|<DeviceID>|<correo>`.
  - Token de activación Base64 validado con firma SHA-256 y sal fija `"Halterofilia-SuperSecret-Salt-2026"`.
  - Bloqueo estricto no eludible `#modal-trial-lock` al expirar los 7 días sin token.
  - Badge indicador en cabecera `#badge-license-status` ("Trial: Xd restantes" o "Licencia Activa").
  - Diálogo informativo `#modal-license-info` accesible desde el badge.

### 2. Módulo de Creación y Gestión de Usuario (Estándar Halterofilia)
- **RF-4 (Botón en Barra Horizontal):** El sistema DEBE incluir un botón interactivo `#btn-header-user-profile` en la barra horizontal (Navbar superior) que muestre:
  - Miniatura circular del avatar/foto (o icono `user` si no tiene foto).
  - Nombre del usuario registrado (ej. "Andres Aguiar" o "Registrar Usuario" si no existe).
- **RF-5 (Diálogo de Perfil de Usuario):** Al pulsar `#btn-header-user-profile`, el sistema DEBE abrir el modal `#modal-user-profile` ("Perfil del Usuario Registrado"), con estilo coherente y badge "1 Por Dispositivo - Licencia de Dispositivo: 1 usuario registrado por dispositivo".
- **RF-6 (Captura y Subida de Foto de Perfil):** El modal de usuario DEBE incorporar:
  - Previsualización circular del avatar (`athlete-avatar-preview` o equivalente).
  - Botón "Tomar Foto" con acceso directo a cámara (`capture="user"` o WebRTC stream).
  - Botón "Galería" para seleccionar imagen desde almacenamiento local (`accept="image/*"`).
  - Botón "Quitar Foto" para restablecer el avatar por defecto.
- **RF-7 (Campos de Datos de Usuario):** El modal de usuario DEBE contener campos estructurados editables:
  - Nombre (`input-user-first-name`)
  - Apellidos (`input-user-last-name`)
  - Correo Electrónico (`input-user-email`)
  - Teléfono de Contacto (`input-user-phone`)
- **RF-8 (Persistencia y Sincronización Reactiva):** Al pulsar "Guardar Cambios":
  - Los datos del usuario DEBEN persistirse en `IndexedDB` (`settings`) y `localStorage` (`vault_user_profile`).
  - El correo registrado DEBE actualizar automáticamente `vaultLicenseManager.setUserEmail(email)` y propagarse a la cadena `REQ|<DeviceID>|<correo>` en los modales de licencia y bloqueo trial.
  - El botón de la barra horizontal DEBE refrescarse inmediatamente con el nuevo nombre y foto.
- **RF-9 (Desvinculación de Usuario):** El modal DEBE incluir el botón "Desvincular" (con confirmación de seguridad) para restablecer los datos del usuario registrado y permitir el registro de un nuevo usuario en el dispositivo.

---

## Requisitos No Funcionales (RNF)
- **RNF-1 (Offline-First):** La gestión del usuario, foto y licenciamiento opera 100% offline sin necesidad de conexión externa.
- **RNF-2 (Almacenamiento Eficiente de Fotos):** Las imágenes de avatar capturadas o cargadas deben comprimirse/redimensionarse en cliente (máximo 256x256 px en formato JPEG/PNG Base64) para evitar sobrecargar `IndexedDB` o `localStorage`.
- **RNF-3 (Compatibilidad y Cero Regresiones):** No debe romperse el flujo de descifrado Zero-Knowledge, la cinemática de gavetas ni la sincronización con Google Drive o Google Cloud Run.
- **RNF-4 (Test Suite en Verde):** Todos los tests unitarios automatizados (`node --test tests/boveda.test.js tests/server.test.js`) deben pasar al 100%.

---

## Casos Límite
- Dispositivo sin foto de perfil: muestra icono semántico de usuario con iniciales o silueta.
- Correo inválido en formulario de usuario: validación visual nativa HTML5 antes de guardar.
- Dispositivo con sesión iniciada previamente en servidor: sincroniza los datos del perfil localmente preservando la identidad.
- Desvinculación de usuario: limpia el perfil sin borrar los documentos cifrados en la bóveda (los documentos permanecen protegidos bajo el PIN maestro).

---

## Fuera de Alcance
- Integración de pasarelas de pago externas (Stripe, MercadoPago, etc.) — el modelo se rige por emisión y validación de tokens Halterofilia.
- Múltiples perfiles de usuario simultáneos en el mismo dispositivo (se mantiene la regla de negocio de 1 usuario registrado por dispositivo).
