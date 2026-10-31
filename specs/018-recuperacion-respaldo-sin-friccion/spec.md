# SPEC-018: Recuperación de Respaldos Sin Fricción y Des-Tombstone Automático

## 1. Contexto y Problema

Un usuario realiza un respaldo manual mediante la opción "Respaldar" (`boveda-backup-YYYY-MM-DD.json`). Diez minutos después, tras haber realizado operaciones o haber eliminado algún documento, intenta restaurar su respaldo mediante la opción "Recuperar".

Se presentan dos fallas críticas:
1. **Solicitud Espuria del "Pin Maestro de Respaldo" (`modal-backup-pin-prompt`):**
   - Aunque la bóveda ya está abierta y desbloqueada en la misma sesión con la clave simétrica activa y el mismo salt, la aplicación despliega la ventana de *"Desbloqueo de Respaldo"* solicitando un PIN que el usuario no debería tener que ingresar.
   - Causa: `handleImportBackup` determinaba la necesidad de solicitar el PIN evaluando únicamente si `activeCount === 0 && result.restoredCount > 0`. Como `loadAndRenderDocuments()` no lograba renderizar ningún documento restaurado debido al filtrado de tombstones (`deletedIds`), la aplicación asumía erróneamente que la clave activa era incapaz de descifrar el respaldo.
2. **Falla Total en la Recuperación de Información al Ingresar el PIN:**
   - Cuando el usuario ingresa su PIN en la pantalla de "Desbloqueo de Respaldo", el proceso reporta éxito en el descifrado pero **no se visualiza ni recupera ningún documento**.
   - Causa: Los documentos restaurados cuyos IDs o réplicas habían sido eliminados previamente permanecían registrados en `boveda_deleted_doc_ids` (en `localStorage` e `IndexedDB`) y en `db.deletedIds` del servidor Cloud Run. Por consiguiente:
     - `VaultStorage.getAllDocuments()` filtraba y ocultaba inmediatamente los documentos restaurados (`!deletedSet.has(d.id)`).
     - La sincronización reactiva con la nube (`syncWithCloud`) descargaba la lista `deletedIds` y ejecutaba `mergeCloudDocuments`, borrando físicamente de `IndexedDB` los documentos que acababan de ser restaurados.

## 2. Requisitos del Sistema (Formato EARS)

### R1 — Des-Tombstone Automático al Restaurar Respaldos
- **Cuando** el usuario importe un archivo de respaldo válido con expedientes legítimos,
- **el sistema debe** remover automáticamente los IDs de dichos expedientes de la lista de eliminados (`boveda_deleted_doc_ids` en `localStorage`, `deletedDocIds` en `IndexedDB` y `db.deletedIds` en el servidor), permitiendo que los documentos restaurados vuelvan a ser consultados y sincronizados.

### R2 — Verificación Criptográfica Previa Sin Fricción
- **Cuando** se importe un respaldo JSON,
- **el sistema debe** probar en memoria si la clave maestra activa (`masterKey`), el PIN de sesión o el PIN de auto-desbloqueo derivan una clave capaz de descifrar los expedientes del archivo antes de interrumpir al usuario.
- **Si** el descifrado automático es exitoso, **el sistema no debe** mostrar el modal `#modal-backup-pin-prompt` y debe presentar los documentos restaurados de inmediato en el archivador.

### R3 — Aislamiento y Renderizado Directo Post-Restauración
- **Cuando** se complete la importación de expedientes en `IndexedDB`,
- **el sistema debe** invocar `loadAndRenderDocuments(true)` (con `skipCloudSync = true`) para asegurar que la interfaz renderice los documentos descifrados antes de que una sincronización remota pueda interferir.
- **Posteriormente**, `syncWithCloud(true)` sincronizará bidireccionalmente los documentos des-tombstoneados con Cloud Run.

### R4 — Desbloqueo Interactivo Resiliente si el PIN Difiere
- **Si** los expedientes del respaldo proceden de otro origen y no pueden descifrarse con ninguna clave en memoria,
- **el sistema debe** abrir `#modal-backup-pin-prompt`.
- **Al ingresar** el PIN correcto, el sistema debe descifrar los expedientes, re-cifrarlos con la clave maestra activa del dispositivo receptor, eliminar sus tombstones y renderizarlos exitosamente en el archivador.

