# Especificación Funcional (Spec 012): Unificación de Base de Datos Multi-Dispositivo (PC ↔ Celular) y Sincronización Centralizada

**Estado:** Aprobado para Implementación  
**Fecha:** 2026-10-29  
**Esquema:** Spec-Driven Development (SDD)

---

## 1. Contexto y Problema
El usuario tiene **Bóveda Digital** instalada en dos dispositivos (**PC** y **Celular**). Aunque ambos deberían operar sobre la misma base de datos y mostrar exactamente los mismos documentos, en la práctica trabajaban de forma independiente por cuatro causas técnicas:
1. **Divergencia de Servidor por Defecto (`localhost` vs `Cloud Run`):** En `assets/js/auth.js`, cuando la app se abría en la PC (`localhost` / `127.0.0.1`), se conectaba al archivo local `http://localhost:3000`, mientras que el Celular se conectaba a Google Cloud Run (`https://boveda-digital-17818053587.us-central1.run.app`).
2. **Fragmentación de Particiones `user_id` (`user.sub`) y Expiración de Refresh Token:**
   - En `data/vault_cloud.json`, los 10 expedientes personales reales del usuario estaban alojados bajo `usr_free_002` (y solo 5 en `usr_pro_001`, 0 en `usr_device_atleta` y 0 en `usr_device_su_usuario`).
   - En `server.js`, el endpoint `POST /api/v1/auth/refresh` asignaba `sub = 'usr_refreshed'` cuando el JWT de 1 hora expiraba, enviando los dispositivos a una partición vacía.
   - El auto-registro (`POST /api/v1/auth/register`) y el modo contingencia offline (`VaultAuth.login`) generaban `id` (`sub`) y `cryptoSalt` aleatorios en cada dispositivo.
3. **Siembra prematura de documentos demo antes de descargar de la nube:** Al abrir un dispositivo nuevo, `loadAndRenderDocuments()` sembraba 3 documentos demo antes de consultar los documentos reales del servidor.
4. **Falta de sincronización reactiva al cambiar entre dispositivos (`visibilitychange` / `online`) y propagación de eliminaciones.**

---

## 2. Requerimientos Funcionales (RF)

### RF-01: Servidor Centralizado Único por Defecto (`CLOUD_RUN_PROD_URL`)
- Tanto en PC (`localhost`, `127.0.0.1`, `file://`) como en Celular (GitHub Pages, PWA, `run.app`), `VaultAuth` debe apuntar por defecto a la base de datos central en Google Cloud Run (`https://boveda-digital-17818053587.us-central1.run.app`), salvo que el usuario active explícitamente el flag `boveda_force_local_api`.
- Si `localStorage` en la PC retiene un valor antiguo `http://localhost:3000` o `http://127.0.0.1:3000` en `boveda_api_base_url`, debe migrarse automáticamente a `CLOUD_RUN_PROD_URL`.

### RF-02: Identidad (`user.sub`), Sal Criptográfica (`crypto_salt`) y Partición de Bóveda Unificadas
- En `server.js` y `VaultAuth`, la generación de `sub` y `crypto_salt` para cualquier cuenta registrada debe ser determinista por correo electrónico, preservando la sal maestra `'226000658459336d4184642799fc8498'` para descifrado Zero-Knowledge transparente entre PC y Celular.
- Consolidar en `data/vault_cloud.json` y `server.js` los 13 expedientes legítimos del usuario (depurando los 5 registros de prueba espurios de 21-24 bytes) para que todas las identidades del titular (`andres.aguiar.marmol@gmail.com`, `andres.pro@boveda.com`, `atleta@halterofilia.com`, `su-usuario@dominio.com`) accedan a la misma bóveda compartida.
- Corregir `POST /api/v1/auth/refresh` en `server.js` para extraer el `sub` y `email` reales del token (incluso si expiró su ventana temporal) sin degradar nunca a `'usr_refreshed'`.

### RF-03: Reconciliación Bidireccional en `IndexedDB` y Nube
- En el cliente (`storage.js` y `app.js`), consolidar todos los documentos locales válidos en `IndexedDB` bajo el `user.sub` activo para rescatar cualquier documento creado previamente en sesiones locales de la PC o del Celular.
- Al iniciar o desbloquear la bóveda, sincronizar primero con la nube antes de decidir si sembrar documentos demo, evitando duplicar demos cuando el usuario ya tiene documentos reales en la base de datos central.
- Propagar eliminaciones entre dispositivos (`deleted_ids` / sincronización autoritativa con la nube) y disparar sincronización automática al volver a enfocar la app (`visibilitychange` / `focus` / `online`).

---

## 3. Criterios de Aceptación (CA)
- **CA-01:** La PC y el Celular apuntan al mismo servidor (`https://boveda-digital-17818053587.us-central1.run.app`) por defecto.
- **CA-02:** Ambos dispositivos muestran exactamente los mismos expedientes descifrados con la misma clave AES-256-GCM derivada de su PIN y sal unificada.
- **CA-03:** Crear, modificar o eliminar un expediente en un dispositivo se refleja automáticamente en el otro dispositivo al sincronizar o al abrir/enfocar la aplicación.
- **CA-04:** El Service Worker se actualiza a `boveda-digital-v14` y toda la suite de pruebas (`tests/boveda.test.js` y `tests/server.test.js`) pasa al 100% en verde.

