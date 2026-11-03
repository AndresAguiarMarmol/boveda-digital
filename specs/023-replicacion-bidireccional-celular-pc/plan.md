# Plan de Implementación SDD 023

## 1. Actualización en Servidor (`server.js`)
- En `POST /api/v1/documents/batch-sync`:
  - Cuando `dupIdx >= 0` (misma categoría y título pero distinto ID), evaluar marcas temporales: si `incomingTime >= existingTime`, actualizar `userDocs[dupIdx]` con el payload más reciente.
  - Si el documento entrante está en `db.deletedIds`, removerlo de `deletedIds` para permitir su actualización / des-tombstoneo legítimo.
  - Asegurar que `POST /api/v1/documents` registre inmediatamente el nuevo documento y limpie cualquier lápida residual.

## 2. Actualización en Cliente de Autenticación (`assets/js/auth.js`)
- En `checkServerConnection()`:
  - Incrementar timeout de `AbortController` de 4000ms a 8000ms para tolerar arranques en frío (cold starts) de Google Cloud Run desde redes móviles con latencia transcontinental.

## 3. Actualización en Motor de la Aplicación (`assets/js/app.js`)
- En `handleSaveNewDocument(formData)`:
  - Optimizar adjuntos de imagen mediante Canvas (máx. 1600px, JPEG 82%) antes de cifrar, agilizando el guardado y la subida en redes móviles.
  - Asegurar token JWT válido (renovando con `refreshSession()` si está ausente o expirado).
  - Enviar directamente el documento nuevo mediante `POST /api/v1/documents` con timeout de 15s.
  - Ejecutar `await this.syncWithCloud(true)`.
- En `syncWithCloud(silent)`:
  - Garantizar token válido antes de iniciar `batch-sync`.
  - Ordenar documentos locales por `updated_at` descendente antes de deduplicar para preservar siempre el expediente más reciente.
- Temporizador Periódico de Sincronización en Tiempo Real (`autoSyncInterval`):
  - Iniciar un intervalo cada 25 segundos en segundo plano mientras el usuario esté en el dashboard.
  - No interferir con acciones en curso (`_isSyncingWithCloud`, `_isDeletingDoc`, `_isSavingNewDoc`).

## 4. Actualización de Versión y Cache PWA
- En `sw.js`: Elevar versión de cache a `boveda-digital-v26`.
- En `index.html`: Actualizar query string a `?v=26` en todos los scripts locales.

## 5. Pruebas Automatizadas
- Añadir tests unitarios en `tests/server.test.js` y `tests/boveda.test.js`.
- Verificar que las pruebas pasen al 100% (77+ pruebas).

## 6. Documentación, Git y Despliegue
- Actualizar `memory.md` (Secciones 1, 2 y 3).
- Commit y push a GitHub (`main`).
- Desplegar en Google Cloud Run (`gcloud run deploy`).

