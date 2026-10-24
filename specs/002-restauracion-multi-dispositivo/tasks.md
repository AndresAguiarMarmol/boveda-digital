# Tareas de Implementación — Spec 002: Restauración de Respaldo Multi-Dispositivo y Portabilidad Criptográfica

## Lista de Tareas

- [x] **T1. Aislamiento de pruebas y depuración de la base de datos cloud.**
  - Configurar `process.env.NO_DISK_PERSIST = 'true'` en `tests/server.test.js`.
  - Depurar `data/vault_cloud.json` eliminando los 24 documentos espurios de prueba y preservando los 5 documentos legítimos de `usr_pro_001`.
  - Asignar el salt real `'226000658459336d4184642799fc8498'` a `usr_pro_001` en `data/vault_cloud.json` y `server.js`.
  - *Requisitos cubiertos: RF-1, RF-2.*

- [x] **T2. Sanitización y validación de expedientes legítimos en `storage.js`.**
  - Implementar función `esPayloadCifradoValido(doc)` que filtre registros con longitud o IV incorrectos o payloads dummy.
  - Integrar filtro en `validarBackupBoveda`, `serializarBackupBoveda`, `fusionarDocumentosBackup` y `mergeCloudDocuments`.
  - Asegurar que `exportBackupData` exporte el salt real de los documentos y no un salt desfasado.
  - *Requisitos cubiertos: RF-1, RNF-2.*

- [x] **T3. Persistencia segura del PIN en memoria de sesión en `auth.js`.**
  - Gestionar `sessionStorage` para guardar temporalmente el PIN de la sesión activa en `setupPin` y `unlockWithPin`.
  - Recuperar el PIN de `sessionStorage` en `init()` para mantener `this.lastEnteredPin` disponible ante recargas en navegadores móviles.
  - Limpiar `sessionStorage` inmediatamente en `lockVault()` y `logout()`.
  - *Requisitos cubiertos: RF-6, RNF-1.*

- [x] **T4. Interfaz del Asistente de PIN de Respaldo en `index.html`.**
  - Diseñar el diálogo modal accesible `#modal-backup-pin-prompt` con estilo glassmorphism, indicador de seguridad, campo de PIN de 6 dígitos numérico, teclado táctil en pantalla y botones de "Descifrar y Restaurar" y "Cancelar".
  - *Requisitos cubiertos: RF-3, RF-5.*

- [x] **T5. Lógica de recuperación interactiva, re-cifrado en caliente y toasts en `app.js`.**
  - Detectar en `handleImportBackup` y `handleGoogleDriveDownload` si los documentos requieren un PIN alternativo.
  - Abrir `#modal-backup-pin-prompt` cuando la clave local no logre descifrar los documentos del respaldo.
  - Implementar `submitBackupPinUnlock(pin)`: derivar clave con el PIN del respaldo, descifrar los expedientes legítimos, re-cifrarlos inmediatamente con la clave maestra activa del celular y guardarlos en `IndexedDB`.
  - Actualizar toasts y contadores para reflejar exactamente los expedientes descifrados y visibles.
  - *Requisitos cubiertos: RF-3, RF-4, RF-5, RF-9, RF-10.*

- [x] **T6. Actualización de caché y Service Worker en `sw.js`.**
  - Incrementar `CACHE_NAME` a `'boveda-digital-v2'`.
  - Configurar estrategia *Network-First* con fallback a caché para los archivos de script (`app.js`, `storage.js`, `crypto.js`, `auth.js`, `gdrive.js`).
  - *Requisitos cubiertos: RF-7, RF-8, RNF-3.*

- [x] **T7. Suite de pruebas unitarias automatizadas.**
  - Añadir tests en `tests/boveda.test.js` para filtrado de documentos espurios, importación con PIN alternativo y re-cifrado en caliente.
  - Verificar que `node --test tests/boveda.test.js tests/server.test.js` pase al 100% en verde.
  - *Requisitos cubiertos: Criterios de Aceptación.*

- [x] **T8. Registro y actualización obligatoria de `memory.md`.**
  - Documentar en `memory.md` el Asistente de PIN de respaldo, la depuración de datos espurios y la versión v2 del Service Worker.
