# Lista de Tareas (Spec 012): Unificación de Base de Datos Multi-Dispositivo (PC ↔ Celular)

- [x] **T1:** Crear artefactos SDD (`spec.md`, `plan.md`, `tasks.md`) en `specs/012-unificacion-bd-multidispositivo/`.
- [x] **T2:** Limpiar y consolidar `data/vault_cloud.json` con los 13 expedientes reales bajo la partición unificada y la sal maestra `'226000658459336d4184642799fc8498'`.
- [x] **T3:** Actualizar `server.js` con partición canónica de bóveda (`resolveVaultPartition`), registro determinista, `POST /api/v1/auth/refresh` sin pérdida de `sub` y propagación de `deletedIds`.
- [x] **T4:** Actualizar `assets/js/auth.js` para usar `CLOUD_RUN_PROD_URL` por defecto en todos los dispositivos (incluyendo PC en `localhost`), migrar URLs locales heredadas y unificar `sub` y `crypto_salt`.
- [x] **T5:** Actualizar `assets/js/storage.js` y `assets/js/app.js` para consolidar documentos locales de `IndexedDB` sin importar el `user_id` previo, procesar `deletedIds` de la nube y sincronizar automáticamente al enfocar/conectar el dispositivo.
- [x] **T6:** Prevenir regeneración de registros demo eliminados (`boveda_demos_seeded` + `INITIAL_PURGED_DOC_IDS`) y deduplicar expedientes en cliente y servidor (`v16`).
- [x] **T7:** Actualizar `sw.js` a `boveda-digital-v16`, agregar pruebas unitarias `SDD 012` en `tests/boveda.test.js` y `tests/server.test.js`, actualizar `memory.md`, publicar en GitHub (`origin/main`) y desplegar en Google Cloud Run.
