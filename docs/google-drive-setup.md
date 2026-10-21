# Guía de Configuración: Sincronización Automática con Google Drive (Zero-Knowledge)

Esta guía explica paso a paso cómo obtener tu propio **Google OAuth 2.0 Client ID** en Google Cloud Console para activar la sincronización y respaldo automático en **Bóveda Digital**.

---

## 1. ¿Cómo funciona la Sincronización Zero-Knowledge?

1. **Cifrado en el Cliente:** Antes de salir de tu dispositivo, todos los documentos se cifran con **AES-256-GCM** utilizando la clave derivada exclusivamente de tu PIN maestro.
2. **Privacidad Total (Zero-Knowledge):** Google Drive solo almacena el archivo `boveda_digital_backup.json` que contiene datos cifrados e hashes de integridad SHA-256. Google **nunca tiene acceso a tu PIN ni a tus documentos en texto claro**.
3. **Alcance Mínimo (`drive.file`):** La app solo tiene permiso para ver y modificar el archivo de respaldo que ella misma crea. No puede acceder a tus fotos, documentos personales ni a ningún otro archivo existente en tu Google Drive.
4. **Sincronización Automática:** Cuando la opción está activa, la app sincroniza en segundo plano cada vez que:
   - Desbloqueas tu bóveda.
   - Guardas un nuevo documento.
   - Modificas o re-cifras un documento.
   - Eliminas un documento.
   - Creas o eliminas gavetas personalizadas.

---

## 2. Paso a Paso: Obtener tu Google Client ID

### Paso 1: Ingresar a Google Cloud Console
1. Abre tu navegador e ingresa a [Google Cloud Console](https://console.cloud.google.com/).
2. Inicia sesión con la cuenta de Google (Gmail) donde deseas almacenar tus respaldos.

### Paso 2: Crear un Proyecto
1. En la barra superior, haz clic en el selector de proyectos y pulsa **"Proyecto nuevo"** (New Project).
2. Asigna un nombre (por ejemplo: `Boveda-Digital-Wallet`) y haz clic en **"Crear"**.
3. Asegúrate de tener seleccionado ese nuevo proyecto en el selector superior.

### Paso 3: Habilitar la Google Drive API
1. En el menú de navegación lateral (o en la barra de búsqueda superior), busca **"Google Drive API"**.
2. Selecciona **Google Drive API** y haz clic en el botón azul **"Habilitar"** (Enable).

### Paso 4: Configurar la Pantalla de Consentimiento OAuth
1. En el menú lateral izquierdo, ve a **APIs y servicios** > **Pantalla de consentimiento de OAuth** (OAuth consent screen).
2. Selecciona tipo de usuario: **Externo** (External) y pulsa **Crear**.
3. Completa los campos básicos:
   - **Nombre de la aplicación:** `Bóveda Digital`
   - **Correo de asistencia al usuario:** Tu dirección de correo.
   - **Datos de contacto del desarrollador:** Tu dirección de correo.
4. Haz clic en **Guardar y continuar**.
5. En la sección **Permisos (Scopes)**, haz clic en **"Agregar o quitar permisos"**:
   - Filtra y selecciona: `.../auth/drive.file` (*Ver, crear y modificar archivos que creaste con esta app*).
   - Haz clic en **Actualizar** y luego **Guardar y continuar**.
6. En la sección **Usuarios de prueba (Test users)**:
   - Haz clic en **"Add users"** e ingresa tu propio correo de Gmail.
   - Haz clic en **Guardar y continuar**.

### Paso 5: Crear el ID de Cliente OAuth (Web)
1. En el menú lateral izquierdo, ve a **Credenciales** (Credentials).
2. Haz clic en **+ Crear credenciales** > **ID de cliente de OAuth** (OAuth client ID).
3. En **Tipo de aplicación**, selecciona **Aplicación web** (Web application).
4. Asigna un nombre: `Boveda Digital Web Client`.
5. En **Orígenes autorizados de JavaScript** (Authorized JavaScript origins), haz clic en **+ Agregar URI** y añade las URLs desde donde ejecutas la app:
   - Si la usas localmente:
     - `http://localhost:3000`
     - `http://127.0.0.1:3000`
   - Si la tienes desplegada en GitHub Pages:
     - `https://andresaguiarmarmol.github.io` *(solo el origen, sin la ruta del repositorio)*
   - Si la tienes desplegada en la nube con dominio propio:
     - Tu dominio HTTPS (por ejemplo: `https://mi-boveda-digital.a.run.app`).
6. Haz clic en **Crear**.
7. Aparecerá una ventana con tu **ID de cliente** (con formato similar a: `1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com`).
8. Copia ese ID de cliente.

---

## 3. Configurar en Bóveda Digital

1. Abre **Bóveda Digital** en tu navegador o app PWA instalada.
2. Desbloquea tu bóveda con tu PIN maestro.
3. En la barra superior, haz clic en el botón **"Drive"**.
4. Despliega la sección **"Configuración de Google OAuth Client ID"**.
5. Pega tu Client ID en el campo de texto y haz clic en **"Guardar Client ID"**.
6. Pulsa el botón **"Conectar con Google Drive"**.
7. Selecciona tu cuenta de Google y autoriza el acceso a la app.
8. ¡Listo! Verás el indicador en verde `🟢 Conectado (Auto-Sync)`. Cada cambio que realices se respaldará automáticamente y de forma 100% cifrada en tu Google Drive.
