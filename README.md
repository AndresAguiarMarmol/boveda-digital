# Bóveda Digital — Wallet de Documentos Segura

Aplicación web securizada diseñada para que los usuarios almacenen, organicen y consulten documentos importantes (cédulas, pasaportes, licencias de conducir, tarjetas bancarias, cartas de residencia, pólizas y títulos de vehículos) con **acceso 100% offline**, **cifrado local AES-256-GCM** y arquitectura **Zero-Knowledge**.

---

## 🔒 Características Principales

1. **Autenticación Unificada Compatible:**
   - 100% compatible con la arquitectura del backend existente de la app de Halterofilia (API REST sobre HTTPS, tokens JWT / OAuth2, refresh tokens rotativos y control de sesiones en servidor).
2. **Cifrado Local Zero-Knowledge:**
   - Utiliza la **Web Crypto API** nativa del navegador.
   - Derivación de claves con **PBKDF2** (100,000 iteraciones, HMAC-SHA256) a partir del PIN maestro del usuario.
   - Cifrado simétrico **AES-GCM (256 bits)** para cada documento y archivo adjunto. El backend nunca recibe ni almacena claves o documentos sin cifrar.
3. **Persistencia 100% Offline:**
   - Almacenamiento local mediante **IndexedDB** (`BovedaDigitalDB`).
4. **Monetización y Planes de Suscripción:**
   - **Plan Gratuito / Básico:** Hasta 5 documentos y almacenamiento local.
   - **Plan PRO:** Documentos ilimitados, alertas automáticas de vencimiento, copias de seguridad cifradas en la nube y pasarelas de pago preparadas (Stripe, In-App Purchases).
5. **Gestión Integral de Documentos:**
   - Categorías: *Identidad*, *Vehículos*, *Finanzas*, *Residencia*, *Salud y Viajes*.
   - Simulador de escáner con cámara, ajuste de bordes y lectura automática de campos estructurados (OCR).
   - Copia rápida de números de documento con un solo clic.
   - Generación de enlaces temporales seguros con clave efímera para compartir con autoridades o gestores.

---

## 🚀 Cómo Visualizar y Probar la Aplicación

No requiere instalaciones pesadas ni compilación.

### Opción 1: Ejecutar el Servidor Full-Stack Integrado (Recomendado)
Incluye servidor web estático y API REST compatible con JWT de Halterofilia (0 dependencias):
```bash
node server.js
```
Luego abre `http://localhost:3000` en tu navegador.

### Opción 2: Abrir directamente en el navegador (100% Offline)
Haz doble clic sobre el archivo `index.html` o arrástralo a tu navegador (Chrome, Edge, Firefox, Safari).

### Opción 3: Usar cualquier servidor web estático
Desde PowerShell o terminal:
```bash
# Con Python
python -m http.server 8000

# Con Node.js
npx serve .
```
Luego abre `http://localhost:8000`.

---

## 🔑 Credenciales Rápidas para Pruebas (Modo Demo)

| Plan | Correo Electrónico | Contraseña | PIN de Bóveda |
|---|---|---|---|
| **Plan PRO Ilimitado** | `andres.pro@boveda.com` | `PasswordSeguro123!` | Configurable o `123456` |
| **Plan Gratuito (5 docs)**| `demo.free@boveda.com` | `PasswordSeguro123!` | Configurable o `123456` |

---

## 📁 Estructura del Proyecto

- `index.html`: Interfaz SPA completa con vistas de login, teclado PIN, dashboard y modales interactivos.
- `docs/architecture.md`: Especificación técnica exhaustiva (diagrama secuencial Mermaid, esquema SQL de PostgreSQL y matriz de endpoints REST).
- `assets/css/vault.css`: Sistema de diseño suizo y ciberseguridad con paleta obsidian, gavetas con colores dinámicos y glassmorphism.
- `assets/js/crypto.js`: Motor criptográfico Web Crypto API (AES-256-GCM y PBKDF2).
- `assets/js/storage.js`: Capa de persistencia offline en IndexedDB.
- `assets/js/auth.js`: Controlador de autenticación JWT y licencias.
- `assets/js/app.js`: Orquestador de archivador gavetero, gavetas personalizadas, escáner, alertas y credenciales visuales.
- `specs/001-gavetas-personalizadas/`: Especificación formal, plan y desglose de tareas bajo metodología SDD.
- `tests/boveda.test.js`: Suite de pruebas unitarias automatizadas (`node --test tests/boveda.test.js`).
- `memory.md`: Memoria de decisiones técnicas y registro de cambios.
