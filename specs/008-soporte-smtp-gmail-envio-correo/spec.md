# Spec 008 — Soporte SMTP Gmail para Envío Real de Códigos y Resiliencia de Validación

Estado: en progreso

## Contexto y objetivo
En la Spec 007 se implementó el flujo de identificación obligatoria y validación por correo electrónico. Sin embargo, al pulsar "Continuar y enviar el Código Validador", el correo no llegaba a la bandeja de entrada del usuario debido a:
1. Ausencia de archivo de configuración `.env` con credenciales SMTP activas para el despacho hacia servidores de correo en Internet.
2. Formato de contraseñas de aplicación de Google (que contienen espacios entre bloques de 4 caracteres) requiriendo sanitización automática.
3. Necesidad de robustecer el protocolo SMTP nativo en Node.js para soportar TLS directo (puerto 465) con respuestas multilínea de Gmail y códigos de error (>= 400).
4. Ausencia de contingencia elegante en el cliente si la instancia en la nube responde con error o no ha sido sincronizada.

El objetivo de esta especificación es:
1. Implementar la carga automática de variables de entorno desde `.env` en `server.js` (con plantilla `.env.example` y protección en `.gitignore`).
2. Robustecer el cliente SMTP nativo en `server.js` con soporte optimizado para Gmail (puerto 465, sanitización de espacios en la contraseña de aplicación, cabeceras MIME estándar RFC 5322).
3. Asegurar que si las credenciales de correo no están configuradas o el correo falla, el sistema provea un respaldo visible inmediato en pantalla (alerta y toast) con el código para que el usuario nunca quede atrapado.
4. Dotar al cliente `VaultAuth` de tolerancia ante fallos de conexión o servidores remotos desactualizados.

---

## Requisitos Funcionales (EARS)

### 1. Gestión de Variables de Entorno y Credenciales
- **RF-1 (.env y .env.example):** El sistema DEBE cargar automáticamente variables de entorno desde el archivo `.env` en la raíz del proyecto al arrancar `server.js`.
- **RF-2 (Protección de Credenciales):** El archivo `.env` DEBE estar estrictamente listado en `.gitignore` para no filtrar contraseñas de aplicación en GitHub.
- **RF-3 (Plantilla de Configuración):** El repositorio DEBE incluir `.env.example` con instrucciones claras para configurar una cuenta de Gmail (`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).

### 2. Protocolo SMTP Robusto para Gmail
- **RF-4 (Sanitización de Contraseña):** El despachador SMTP DEBE eliminar automáticamente los espacios de la contraseña de aplicación de Google (`pass.replace(/\s+/g, '')`).
- **RF-5 (Respuestas Multilínea y Códigos de Error):** El cliente SMTP DEBE procesar adecuadamente respuestas multilínea (código seguido de guion `-`) y capturar códigos de error (códigos >= 400) devolviendo el mensaje descriptivo exacto devuelto por el servidor de correo.
- **RF-6 (Cabeceras MIME Estándar):** El correo enviado DEBE incluir cabeceras estándar RFC 5322 (`From`, `To`, `Subject` con codificación Base64 UTF-8, `Date`, `Message-ID` y `Content-Type: text/html; charset=UTF-8`).

### 3. Resiliencia y Experiencia de Usuario
- **RF-7 (Respaldo en Pantalla):** Si el servidor se encuentra en modo simulado o no cuenta con credenciales SMTP, DEBE retornar el código para que el cliente lo presente en el banner de pruebas de `#modal-first-run-onboarding` y en un Toast explicativo.
- **RF-8 (Contingencia en Cliente):** Si el backend remoto no responde o rechaza la petición, `VaultAuth.sendEmailVerificationCode` DEBE generar el código en `sessionStorage` y permitir al usuario validar su cuenta sin quedar bloqueado.
