# Spec 002 — Restauración de Respaldo Multi-Dispositivo, Portabilidad Criptográfica y Limpieza de Datos

Estado: implementada

## Contexto y objetivo
Al exportar una copia de respaldo en una computadora de escritorio e importarla en un dispositivo móvil (teléfono celular), el sistema notifica: *"Recuperación exitosa: 28 expedientes restaurados"*, pero el archivador del celular permanece en blanco mostrando 0 documentos visibles.

### Diagnóstico de Causas Raíz Identificadas:
1. **Contaminación de Datos por Pruebas Automatizadas:** La suite de pruebas de backend (`tests/server.test.js`) inyectaba documentos ficticios (`encrypted_payload: 'U2FsdGVkX1+payload...'`) sin aislar la persistencia en disco (`NO_DISK_PERSIST`). El servidor los persistió en `data/vault_cloud.json`, la sincronización de nube los propagó a `IndexedDB` y el respaldo exportó 24 registros espurios imposibles de descifrar por cualquier algoritmo AES-GCM.
2. **Caché Obsoleta de Service Worker en el Celular:** El Service Worker (`sw.js`) mantenía la versión estática `boveda-digital-v1` con estrategia *Cache-First*, impidiendo que los navegadores móviles descargaran las mejoras criptográficas de descifrado resiliente y multi-salt.
3. **Desalineación de PIN/Salt entre Dispositivos:** Cuando un usuario configura o desbloquea la app en el celular con un PIN o Salt local distinto al del archivo de respaldo, la clave derivada activa no puede autenticar los tags AES-256-GCM. El sistema no ofrecía un mecanismo para que el usuario introdujera el PIN original del respaldo para descifrar y migrar los expedientes a la clave del celular.
4. **Pérdida de PIN en Memoria Volátil de Sesión:** `lastEnteredPin` residía únicamente en memoria volátil de JavaScript (`this.lastEnteredPin`), perdiéndose tras cualquier refresco o cambio de vista en el navegador móvil, imposibilitando los intentos de descifrado con sales secundarias.

El objetivo de esta especificación es resolver integralmente la migración de expedientes entre dispositivos heterogéneos (PC ↔ Celular), depurar los almacenes de datos, renovar el ciclo de vida del Service Worker y proveer un asistente interactivo de recuperación de PIN que garantice el 100% de visibilidad de los expedientes legítimos.

---

## Usuarios
- **Usuario Multi-Dispositivo:** Crea y gestiona documentos en su computadora personal y desea consultar y mantener su bóveda sincronizada en su teléfono móvil mediante respaldos JSON o Google Drive.
- **Usuario que Cambia de PIN:** Importa un respaldo antiguo o proveniente de otro dispositivo donde tenía configurado un PIN maestro diferente.

---

## Historias de usuario
- **HU-1:** Como usuario que descarga su respaldo en el celular, quiero que todos mis expedientes válidos aparezcan visibles de inmediato en sus gavetas correspondientes.
- **HU-2:** Como usuario, si mi respaldo fue creado con un PIN diferente al que tengo actualmente en mi celular, quiero que la aplicación me solicite el PIN del respaldo para descifrarlo e integrarlo a mi PIN actual sin complicaciones.
- **HU-3:** Como usuario, quiero que el archivo de respaldo contenga únicamente documentos válidos y legibles, descartando automáticamente entradas corruptas o de prueba técnica.
- **HU-4:** Como usuario de la versión móvil/PWA, quiero recibir inmediatamente las actualizaciones del sistema sin quedar bloqueado por versiones antiguas cacheadas en el navegador.

---

## Definiciones
- **Expediente Criptográficamente Válido:** Registro que contiene un payload cifrado AES-256-GCM real con longitud, padding y autenticación de integridad (tag de 16 bytes) verificables.
- **Registro Espurio / Mock:** Documento ficticio de pruebas unitarias cuyo payload no corresponde a un cifrado AES-GCM válido.
- **Asistente de Desbloqueo de Respaldo:** Modal interactivo que solicita el PIN maestro con el que fue generado el respaldo cuando la clave activa del dispositivo no logra descifrarlo.
- **Re-cifrado de Migración en Caliente:** Proceso donde los documentos descifrados con la clave del respaldo son inmediatamente cifrados con la clave maestra activa del dispositivo receptor y guardados en `IndexedDB`.

---

## Requisitos funcionales (EARS)

### Sanitización y Calidad de Datos
- **RF-1:** EL SISTEMA validará rigurosamente el formato y longitud criptográfica de cada documento antes de incluirlo en una exportación o procesarlo en una importación, filtrando y purgando registros ficticios o corruptos (`'U2FsdGVkX1+payload...'`).
- **RF-2:** MIENTRAS se ejecuten pruebas automatizadas en `tests/server.test.js`, EL SISTEMA activará obligatoriamente la bandera `NO_DISK_PERSIST=true` para garantizar que ninguna petición de prueba contamine `data/vault_cloud.json` ni la base de datos de producción.

### Portabilidad y Asistente Interactivo de PIN
- **RF-3:** CUANDO el usuario importe un respaldo cuyos expedientes no puedan descifrarse con el PIN activo del dispositivo (o cuyo `pin_hash` no coincida con el PIN actual), EL SISTEMA mostrará un diálogo interactivo solicitando: *"Este respaldo fue protegido con un PIN maestro diferente. Ingrese el PIN del respaldo para descifrar sus expedientes"*.
- **RF-4:** CUANDO el usuario ingrese el PIN correcto del respaldo en el diálogo interactivo, EL SISTEMA descifrará los expedientes con dicho PIN y su salt asociado, los re-cifrará de inmediato con la clave maestra actual del celular y los guardará en `IndexedDB`.
- **RF-5:** SI el usuario introduce un PIN incorrecto en el diálogo de restauración, ENTONCES EL SISTEMA mostrará un mensaje de advertencia permitiendo reintentar o cancelar sin corromper la base de datos local.
- **RF-6:** EL SISTEMA preservará en memoria de sesión segura (`sessionStorage` efímero) el PIN introducido durante el desbloqueo mientras la sesión esté activa, permitiendo derivar sales alternativas sin requerir re-ingresos constantes.

### Gestión de Caché y Service Worker Móvil
- **RF-7:** EL SISTEMA actualizará la versión de caché del Service Worker a `boveda-digital-v2` e implementará una política *Stale-While-Revalidate* o *Network-First* para scripts de aplicación (`app.js`, `storage.js`, `crypto.js`, `auth.js`, `gdrive.js`), garantizando que los celulares reciban las correcciones inmediatamente.
- **RF-8:** CUANDO se detecte un nuevo Service Worker en segundo plano, EL SISTEMA ejecutará `skipWaiting()` y `clients.claim()` para tomar el control sin requerir cierres forzados del navegador.

### Mensajería y Visualización Reactiva
- **RF-9:** CUANDO finalice la restauración, EL SISTEMA notificará el número exacto de expedientes descifrados y visibles en el archivador (ej. *"Recuperación exitosa: 5 expedientes restaurados y listos en el archivador"*).
- **RF-10:** SI existen expedientes en la base de datos que requieran verificación de PIN para ser visualizados, EL SISTEMA mostrará un aviso accesible en la barra superior con un botón directo para resolverlos con el PIN correspondiente.

---

## Requisitos no funcionales
- **RNF-1 (Zero-Knowledge):** Ningún PIN ni clave maestra se envía al servidor ni se almacena en texto claro en `localStorage`. Las claves de migración residen únicamente en la memoria de la sesión activa.
- **RNF-2 (Integridad Criptográfica):** Todo documento restaurado debe validar su tag de autenticación AES-256-GCM y su hash SHA-256 antes de ser expuesto en la interfaz.
- **RNF-3 (Compatibilidad Multiplataforma):** El flujo de restauración debe operar idénticamente en navegadores móviles (Chrome Android, Safari iOS), PWA instalada y navegadores de escritorio.
- **RNF-4 (Rendimiento en Dispositivos Móviles):** El descifrado y re-cifrado de hasta 50 documentos debe completarse en menos de 1.5 segundos en CPUs móviles estándar.

---

## Casos límite
- Respaldo generado con el mismo PIN y mismo Salt: se descifra y carga directamente sin solicitar intervención del usuario.
- Respaldo generado con el mismo PIN pero diferente Salt: el sistema detecta el salt en el archivo o lista de sales candidatas y re-deriva transparentemente la clave.
- Respaldo generado con un PIN totalmente distinto: se activa el modal interactivo de solicitud de PIN de respaldo.
- Archivo de respaldo que mezcla documentos reales con entradas espurias de tests: el sistema filtra las entradas espurias y recupera limpiamente el 100% de los documentos reales.
- Sesión iniciada con biometría: el sistema solicita el PIN del respaldo si se requiere re-derivar claves para expedientes importados.

---

## Criterios de aceptación
1. `data/vault_cloud.json` limpio de registros espurios de test, conteniendo exclusivamente los expedientes legítimos del usuario.
2. `tests/server.test.js` ejecuta todas las pruebas con `NO_DISK_PERSIST=true` sin ensuciar la base de datos persistente.
3. `sw.js` actualizado con `CACHE_NAME = 'boveda-digital-v2'` y refresco proactivo de scripts.
4. Modal interactivo implementado en `index.html` y gestionado en `app.js` para introducir el PIN del respaldo en caso de discrepancia criptográfica.
5. Al importar el respaldo en un celular o navegador limpio, los 5 expedientes reales se descifran, se re-cifran con la clave local y aparecen visibles en el archivador.
6. Suite completa de pruebas automatizadas pasando al 100% en verde con `node --test`.
