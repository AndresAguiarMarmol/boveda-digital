# Guía de Despliegue en Google Cloud (Cloud Run)

Esta guía documenta los pasos para desplegar **Bóveda Digital** en la nube de Google utilizando **Google Cloud Run**, el servicio sin servidor (*serverless*) que escala a cero cuando no se usa y cuenta con una capa gratuita mensual permanente de 2 millones de peticiones.

---

## 1. Requisitos Previos

1. Tener una cuenta en [Google Cloud Console](/https://console.cloud.google.com).
2. Instalar el CLI oficial de Google Cloud: [Google Cloud SDK (`gcloud`)](https://cloud.google.com/sdk/docs/install).
3. Iniciar sesión en tu terminal con:
   ```bash
   gcloud auth login
   ```

---

## 2. Configurar el Proyecto en Google Cloud

Selecciona o crea el proyecto donde se alojará la Bóveda:

```bash
# Listar tus proyectos de Google Cloud



# Establecer el proyecto activo (reemplaza TU_PROJECT_ID)



# Habilitar los servicios necesarios (Cloud Run y Cloud Build)
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

---

## 3. Despliegue en Google Cloud Run en 1 Comando

Desde la raíz de la carpeta del proyecto (`Boveda Digital`):

```bash
gcloud run deploy boveda-digital \
  --source . \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated \
  --set-env-vars JWT_SECRET="tu_clave_secreta_super_segura_2026"
```

### ¿Qué hace este comando?
1. Google Cloud Build compila el contenedor automáticamente usando el [Dockerfile](file:///d:/Carpetas/Desarrollos/Desarrollos%20WEB/Boveda%20Digital/Dockerfile).
2. Sube la imagen a Artifact Registry.
3. Despliega la aplicación en Cloud Run con HTTPS y certificado SSL automático gratuito.
4. Al terminar la consola te entregará la URL pública de acceso (ejemplo: `https://boveda-digital-xxxxxx-uc.a.run.app`).

---

## 4. Conectar un Dominio Personalizado

Si deseas usar tu propio dominio (ejemplo: `boveda.tudominio.com`):

1. En la consola de Google Cloud, ve a **Cloud Run** > **Administrar asignaciones de dominios personalizados**.
2. Añade tu dominio o subdominio.
3. Agrega el registro `CNAME` o registros `A`/`AAAA` provistos en tu proveedor de DNS (Cloudflare, GoDaddy, Namecheap, etc.).
4. Google Cloud emitirá y renovará el certificado SSL automáticamente sin costo.

---

## 5. Arquitectura Zero-Knowledge en la Nube

Al estar alojado en Google Cloud Run:
* **El servidor nunca recibe datos en texto claro:** Todo documento subido viaja previamente cifrado desde el navegador del usuario con **AES-256-GCM** mediante la clave derivada de su PIN maestro con **PBKDF2**.
* **Google Cloud solo almacena bloques cifrados:** Si alguien obtuviera acceso indebido a la base de datos o almacenamiento en la nube, solo encontrará payloads cifrados ininteligibles, vectores de inicialización (IVs) y checksums SHA-256.
* **Sincronización multi-dispositivo:** Cualquier cambio realizado en tu computadora de escritorio se sincronizará automáticamente con tu teléfono móvil al abrir la misma URL e iniciar sesión.
