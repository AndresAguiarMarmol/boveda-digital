# Tareas — Spec 004: Eliminación de Demo Free/Pro, Adopción Plena de Licenciamiento Halterofilia y Módulo de Usuario

- [x] **T1. Gestión de Perfil de Usuario en `license.js`.** RF-8, RNF-1
  - Implementar métodos `getUserProfile()`, `saveUserProfile(profile)` y `clearUserProfile()` en `VaultLicenseManager` con persistencia dual (`IndexedDB` + `localStorage`).
  - Sincronizar reactivamente el correo del usuario con `setUserEmail()` para actualizar la cadena de solicitud `REQ`.
  - Hecho cuando: tests unitarios validen guardado, recuperación y limpieza del perfil y su correo asociado.

- [x] **T2. Eliminación de Lógica Demo Free / Pro y Restricción de Cuotas en `app.js` y `server.js`.** RF-1, RF-2
  - Retirar `openUpgradeModal()` y las alertas/bloqueos restrictivos por cuota de 5 documentos.
  - El archivado y guardado en gavetas opera ilimitado durante el Trial y con Licencia Activa.
  - Hecho cuando: un usuario pueda crear más de 5 documentos sin advertencias de upgrade.

- [x] **T3. Interfaz Visual: Limpieza de Elementos Free/Pro y Creación del Modal de Usuario en `index.html` y `vault.css`.** RF-2, RF-4, RF-5, RF-6, RF-7
  - Retirar accesos rápidos demo en el login.
  - Retirar `#dash-plan-badge`, `#btn-header-upgrade` y `#modal-upgrade-pro`.
  - Agregar botón `#btn-header-user-profile` en la barra horizontal (Navbar) con avatar y nombre.
  - Agregar modal `#modal-user-profile` con controles de foto (cámara / galería / quitar), campos Nombre, Apellidos, Correo, Teléfono, botones Guardar y Desvincular.
  - Hecho cuando: la estructura HTML y estilos CSS rendericen correctamente sin artefactos huérfanos.

- [x] **T4. Métodos de Control de Usuario y Foto en `app.js`.** RF-4, RF-6, RF-8, RF-9, RNF-2
  - Implementar `openUserProfileModal()`, `closeUserProfileModal()`, `handleUserPhotoCapture(file)`, `removeUserPhoto()`, `saveUserProfile()`, `unlinkUserProfile()` y `renderHeaderUserProfile()`.
  - Compresión y redimensionamiento en Canvas a 256x256 px.
  - Sincronización con el botón de la barra horizontal y cadena de solicitud.
  - Hecho cuando: al ingresar datos y foto, se actualice el botón del navbar y los modales de licencia.

- [x] **T5. Suite de Pruebas Unitarias Automatizadas en `tests/boveda.test.js`.** RNF-4
  - Pruebas para verificar eliminación de esquemas demo free/pro y archivado ilimitado.
  - Pruebas de persistencia y desvinculación de perfil de usuario.
  - Pruebas de renderizado de elementos en HTML y actualización reactiva de la barra horizontal.
  - Hecho cuando: `node --test tests/boveda.test.js tests/server.test.js` pase al 100% en verde.
