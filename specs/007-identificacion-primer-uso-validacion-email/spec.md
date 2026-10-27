# Spec 007 — Identificación Obligatoria en Primer Uso y Validación por Código al Correo Electrónico

Estado: implementada

## Contexto y objetivo
Para garantizar la autenticidad del usuario y vincular de forma fidedigna el perfil del dispositivo con el ecosistema de Halterofilia y la billetera segura, se requiere que la primera vez que se utilice la aplicación en cualquier dispositivo:
1. El usuario sea obligado a identificarse completando la ficha de registro con todos sus campos (Nombre, Apellidos, Correo Electrónico, Teléfono de Contacto, y Foto opcional pero recomendada).
2. Se valide la identidad del usuario mediante un código de seguridad de un solo uso (OTP de 6 dígitos) enviado directamente a su correo electrónico.
3. Se preserve la arquitectura Zero-Knowledge y la lógica central de la app, sin romper el flujo de derivación de claves maestras con PIN ni la compatibilidad con el backend centralizado.

---

## Usuarios
- **Usuario Nuevo (Primer Uso):** Al abrir la app por primera vez en un dispositivo sin usuario verificado, se le presenta de manera obligatoria e ineludible la pantalla de identificación y validación por correo. Solo tras validar el código se habilita la creación del PIN maestro y el acceso a la bóveda.
- **Usuario Identificado y Verificado:** En aperturas posteriores, la app no vuelve a solicitar la validación inicial y procede directamente a la pantalla de desbloqueo táctil por PIN o biometría. Puede consultar y editar su ficha en cualquier momento desde el botón de perfil en el Navbar superior.

---

## Historias de usuario
- **HU-1 (Identificación Obligatoria Inicial):** Como nuevo usuario de Bóveda Digital, al abrir la app por primera vez, debo completar obligatoriamente mis datos (Nombre, Apellidos, Correo y Teléfono) para poder inicializar mi cuenta en este dispositivo.
- **HU-2 (Envío de Código Validador al Correo):** Como usuario que ingresó sus datos, quiero recibir un correo electrónico con un código numérico de 6 dígitos para comprobar que soy el legítimo dueño de la cuenta de correo.
- **HU-3 (Validación e Ingreso al Sistema):** Como usuario, al ingresar el código correcto recibido en mi correo, la app debe validar mi perfil, guardarlo en el dispositivo y permitirme configurar mi PIN maestro para comenzar a usar la bóveda.
- **HU-4 (Reenvío y Corrección de Correo):** Si me equivoqué al escribir mi correo o el código no llega en el tiempo esperado, debo poder corregir el correo o solicitar un nuevo código sin reiniciar el proceso.

---

## Requisitos Funcionales (EARS)

### 1. Detección de Primer Uso y Bloqueo Ineludible
- **RF-1 (Detección de Primer Uso):** El sistema DEBE comprobar al arrancar (`init()`) si el dispositivo cuenta con un perfil de usuario registrado y verificado (`vault_user_verified`).
- **RF-2 (Modal Ineludible de Onboarding):** Si el dispositivo NO cuenta con un perfil verificado, el sistema DEBE desplegar inmediatamente el modal `#modal-first-run-onboarding` impidiendo eludir la pantalla (sin botones de cierre, ni cierre por tecla Escape o clic fuera).

### 2. Ficha de Identificación Obligatoria
- **RF-3 (Campos Obligatorios de la Ficha):** El formulario de registro del Paso 1 DEBE exigir de forma obligatoria los campos:
  - Nombre (`onboarding-first-name`)
  - Apellidos (`onboarding-last-name`)
  - Correo Electrónico (`onboarding-email`) con validación de sintaxis de email
  - Teléfono de Contacto (`onboarding-phone`)
- **RF-4 (Foto de Perfil):** El usuario PUEDE capturar su foto con la cámara del dispositivo (`capture="user"`) o subirla desde la galería (`accept="image/*"`).

### 3. Generación y Envío de Código de Validación
- **RF-5 (Endpoint de Envío de Código):** El backend DEBE exponer el endpoint `POST /api/v1/auth/send-verification-code` que reciba `{ email, fullName }`, genere un código numérico criptográficamente seguro de 6 dígitos con expiración de 15 minutos, y lo despache al correo electrónico.
- **RF-6 (Soporte SMTP y Modo Fallback Simulado):**
  - Si existen variables de entorno SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`), el servidor DEBE enviar el correo real mediante protocolo SMTP con formato HTML responsivo y texto claro.
  - Si NO existen variables SMTP configuradas, el servidor DEBE registrar el código en consola, simular el despacho y retornar `{ success: true, isSimulated: true, code: ... }`, asegurando la operatividad de desarrollo, pruebas y despliegues sin servidor SMTP saliente.

### 4. Verificación del Código y Transición
- **RF-7 (Endpoint de Verificación):** El backend DEBE exponer el endpoint `POST /api/v1/auth/verify-code` que reciba `{ email, code }` y valide la coincidencia y vigencia del código.
- **RF-8 (Persistencia y Desbloqueo):** Al confirmarse el código:
  - El sistema DEBE guardar el perfil verificado en `IndexedDB` y `localStorage` (`vault_user_profile` y `vault_user_verified = true`).
  - Sincronizar el correo con la cadena de solicitud de licencia `REQ|<DeviceID>|<correo>`.
  - Concluir el onboarding y dar paso inmediatamente a la configuración del PIN maestro de la bóveda (`pin-setup`).
