# Plan Técnico — Spec 004: Eliminación de Demo Free/Pro, Adopción Plena de Licenciamiento Halterofilia y Módulo de Usuario

## Archivos y Responsabilidades
1. `index.html`:
   - Eliminar los botones demo "Plan Gratuito" y "Plan PRO Ilimitado" del formulario de login.
   - En la barra horizontal (Navbar superior), retirar `#dash-plan-badge` y `#btn-header-upgrade`.
   - Agregar en la barra horizontal el botón `#btn-header-user-profile` con avatar circular y nombre del usuario registrado.
   - Eliminar el modal `#modal-upgrade-pro`.
   - Incorporar el diálogo modal `#modal-user-profile` ("Perfil del Usuario Registrado") con previsualización de foto, botones de cámara / galería / quitar foto, campos Nombre, Apellidos, Correo, Teléfono, y acciones Guardar y Desvincular.
2. `assets/js/license.js`:
   - Extender `VaultLicenseManager` para gestionar el perfil del usuario de dispositivo (`getUserProfile()`, `saveUserProfile(profile)`, `clearUserProfile()`), persistido en `IndexedDB` (`settings`) y `localStorage` (`vault_user_profile`).
   - Sincronizar reactivamente el correo del perfil con `setUserEmail(email)` y la cadena de solicitud `REQ`.
3. `assets/js/app.js`:
   - Suprimir `openUpgradeModal()` y las verificaciones restrictivas de límite de 5 documentos en `handleSaveNewDocument()` y `renderDashboardMetrics()`.
   - Implementar los métodos de gestión de usuario en `BovedaApp`:
     - `openUserProfileModal()`: carga los datos actuales y abre el modal.
     - `closeUserProfileModal()`: cierra el modal.
     - `handleUserPhotoCapture(file)`: procesa y redimensiona la imagen a 256x256 px en Canvas Base64.
     - `removeUserPhoto()`: elimina la foto y restablece el placeholder.
     - `saveUserProfile()`: valida y guarda los campos en el almacenamiento local, refresca la barra horizontal y actualiza la cadena de solicitud en los modales de licencia/bloqueo.
     - `unlinkUserProfile()`: solicita confirmación y desvincula el usuario actual.
     - `renderHeaderUserProfile()`: actualiza el botón en la barra horizontal con foto/iniciales y nombre.
4. `assets/css/vault.css`:
   - Estilos para la previsualización del avatar de usuario (`.user-avatar-preview`, `.user-avatar-img`), controles de cámara/galería y botón del navbar con miniatura circular (`.btn-header-user`).
5. `tests/boveda.test.js`:
   - Pruebas unitarias para:
     - Ausencia de límites demo-free / demo-pro (documentos ilimitados).
     - Almacenamiento, actualización y desvinculación del perfil de usuario (nombre, apellidos, correo, teléfono, foto).
     - Sincronización automática del correo de usuario con la cadena `REQ|<DeviceID>|<correo>`.
     - Presencia y estructura del botón en la barra horizontal y del modal de usuario en `index.html`.

## Algoritmo de Procesamiento de Foto (Cámara / Galería)
```javascript
function procesarFotoPerfil(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 256;
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
```

## Decisiones Justificadas
- **Eliminación de Demo Free vs Pro:** Bóveda Digital pasa a compartir exactamente el modelo de negocio de Halterofilia: 7 días de trial para evaluación completa sin límites de documentos, y activación con clave Base64 emitida por el ecosistema administrativo.
- **Redimensionamiento en Canvas a 256x256 px:** Evita inflar `IndexedDB` y `localStorage` con fotos de cámaras de 12-48 megapíxeles, asegurando rendimiento fluido incluso en dispositivos de gama baja.
- **Sincronización Inmediata con `license.js`:** Al guardar el perfil, el correo se transfiere de inmediato a `setUserEmail(email)`, asegurando que cualquier consulta de licencia o pantalla de bloqueo refleje de inmediato el correo del usuario registrado.
