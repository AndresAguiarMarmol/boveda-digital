# Spec 003 — Sistema de Licenciamiento y Seguridad Offline (Período de Prueba 7 Días y Activación Criptográfica)

Estado: implementada

## Contexto y objetivo
Conforme a la sección 4 de `AGENTS.md`, Bóveda Digital debe contar con un modelo de seguridad y licenciamiento 100% offline basado en un período de prueba gratuito de 7 días continuos desde la primera inicialización en el dispositivo, seguido de un bloqueo estricto no eludible al expirar, el cual solo puede desbloquearse mediante un Token de Activación criptográfico validado localmente con `crypto.subtle`.

El sistema debe operar de forma totalmente autónoma (Zero-Knowledge y sin requerir conexión a internet obligatoria), identificando cada dispositivo mediante un `Device ID` único y validando tokens firmados con SHA-256 y la sal maestra `"Halterofilia-SuperSecret-Salt-2026"`.

---

## Usuarios
- **Usuario en Período de Prueba (Trial):** Instala o accede a la app por primera vez y dispone de 7 días completos de acceso ilimitado para evaluar la billetera.
- **Usuario con Período Expirado:** Superados los 7 días sin activar licencia, visualiza un overlay no eludible con su cadena de solicitud (`REQ|<DeviceID>|<correo>`) y canal de contacto de WhatsApp (`+56933395447`) para solicitar su clave de activación.
- **Usuario Licenciado / Activado:** Ingresa el token de activación proporcionado y desbloquea el acceso permanente u offline a sus expedientes.

---

## Historias de usuario
- **HU-1 (Arranque de Trial):** Como nuevo usuario, al abrir la aplicación por primera vez quiero que se inicie automáticamente mi período de prueba de 7 días sin configuraciones complejas.
- **HU-2 (Monitoreo de Vigencia):** Como usuario en período de prueba, quiero conocer cuántos días u horas me restan de evaluación en el dashboard.
- **HU-3 (Generación de Solicitud de Licencia):** Como usuario cuyo período expiró (o que desea activar anticipadamente), quiero generar y copiar en 1 toque mi cadena `REQ|<DeviceID>|<correo>` y contactar directamente a soporte vía WhatsApp.
- **HU-4 (Validación de Token Offline):** Como usuario con token de activación, quiero ingresarlo en la app y que se verifique de inmediato de forma 100% offline mediante Web Crypto API.
- **HU-5 (Bloqueo Estricto No Eludible):** Como administrador del producto, cuando el trial de un usuario expire sin activación válida, la aplicación debe superponer una pantalla de bloqueo no evadible que impida acceder o manipular los documentos hasta ingresar un token auténtico.

---

## Requisitos Funcionales (EARS)

- **RF-1 (Inicialización de Trial):** Cuando la aplicación se inicializa por primera vez en un dispositivo y no exista registro previo de inicio de trial, el sistema DEBE registrar en el almacenamiento persistente (`settings` en `IndexedDB` y `localStorage` como respaldo) la marca temporal de inicio `trial_start_date = Date.now()` y generar un `Device ID` persistente con formato `dev_<uuid>`.
- **RF-2 (Cálculo de Vigencia):** Mientras el usuario interactúa con la aplicación, el sistema DEBE evaluar continuamente si `(Date.now() - trial_start_date) < 604800000 ms (7 días)` o si existe una licencia activa verificada.
- **RF-3 (Cadena de Solicitud):** Cuando el usuario consulta su estado de licencia o su trial ha expirado, el sistema DEBE generar y mostrar la cadena estandarizada `REQ|<DeviceID>|<correo>` con botón de copiado rápido al portapapeles y enlace `https://wa.me/56933395447?text=...`.
- **RF-4 (Estructura del Token de Activación):** El Token de Activación DEBE ser una cadena codificada en Base64 que contiene un objeto JSON con los campos:
  ```json
  {
    "deviceId": "<DeviceID>",
    "email": "<correo>",
    "exp": <timestamp_milisegundos_o_menos1_para_perpetuo>,
    "signature": "<hash_sha256_hex>"
  }
  ```
- **RF-5 (Firma Criptográfica SHA-256):** La firma del token DEBE generarse y validarse computando el hash SHA-256 sobre la concatenación canónica:
  `SHA-256("${deviceId}:${email}:${exp}:${SALT}")`
  donde `SALT` es estrictamente `"Halterofilia-SuperSecret-Salt-2026"`.
- **RF-6 (Validación Criptográfica Offline):** Cuando el usuario ingresa un Token de Activación, el sistema DEBE decodificar el payload en Base64, comprobar que `deviceId` coincide con el dispositivo actual, validar que `exp` no haya expirado (o sea `-1`), y recalcular la firma mediante `crypto.subtle.digest('SHA-256', ...)`. Si coincide, DEBE persistir la activación y liberar la bóveda.
- **RF-7 (Bloqueo no eludible al expirar):** Si el período de prueba ha expirado (`> 7 días`) y no existe una licencia válida activa, el sistema DEBE montar un overlay modal `#modal-trial-lock` no eludible (sin tecla Escape, sin clic de fondo, sin scroll detrás) que bloquee el acceso al dashboard y los modales de documentos.
- **RF-8 (Indicador de Estado en Dashboard):** Mientras la licencia o trial esté activo, la barra superior DEBE exhibir un badge de estado (ej. `Trial: 5d restantes` o `Licencia Offline Activa`).
- **RF-9 (Herramienta de Emisión Administrativa):** El sistema DEBE incluir una utilidad (módulo/script y función en consola o servidor) `generarTokenActivacion(deviceId, email, diasValidez)` para que el administrador pueda emitir tokens válidos a los clientes que envíen su código de solicitud.

---

## Requisitos No Funcionales (RNF)

- **RNF-1 (Zero-Knowledge y Operatividad Offline):** La verificación de licencias DEBE funcionar 100% offline mediante Web Crypto API (`crypto.subtle`), sin enviar el Device ID ni tokens a servidores de terceros obligatoriamente.
- **RNF-2 (Persistencia Dual):** Los datos de licenciamiento (`trial_start_date`, `device_id`, `license_token`) DEBEN sincronizarse entre `IndexedDB` y `localStorage` para proteger la vigencia ante limpiezas parciales de caché.
- **RNF-3 (Protección contra Manipulación de Fecha):** Si la hora actual del sistema resulta anterior a `trial_start_date` o a la última hora registrada de uso, el sistema DEBE detectar la inconsistencia de reloj y mantener el bloqueo.
- **RNF-4 (Accesibilidad y Responsive):** El diálogo de bloqueo y los formularios de activación DEBEN ser 100% accesibles en dispositivos móviles y de escritorio.

---

## Criterios de Aceptación
1. Un dispositivo recién inicializado registra `trial_start_date` y muestra 7 días restantes.
2. Si se adelanta la fecha del trial a 8 días, la aplicación muestra inmediatamente el bloqueo no eludible con el contacto `+56933395447` y la cadena `REQ|<DeviceID>|<correo>`.
3. Al ingresar un token firmado con `"Halterofilia-SuperSecret-Salt-2026"` para ese Device ID y correo, la aplicación valida la firma con `crypto.subtle`, quita el bloqueo y activa la licencia.
4. Si se ingresa un token manipulado, con firma inválida o emitido para otro Device ID, el sistema rechaza la activación y mantiene el bloqueo.
5. Las pruebas automatizadas con Node.js validan la generación y validación de tokens y el ciclo de vida del trial al 100%.
