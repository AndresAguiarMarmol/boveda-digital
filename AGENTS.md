# AGENTS.md — Bóveda Digital (Wallet de Documentos)

Guía para agentes de IA que trabajen en este proyecto.

## Memoria del proyecto (`memory.md`) — OBLIGATORIO
`memory.md` guarda todo lo que debe preservarse entre sesiones: la estructura de los datos, la persistencia local y en servidor, las decisiones de diseño/arquitectura vigentes y el historial de cambios.

1. **Al empezar cualquier tarea:** leer `memory.md` completo antes de tocar código.
2. **Durante la tarea:** respetar la arquitectura Zero-Knowledge, la compatibilidad con el backend de Halterofilia (JWT/OAuth2) y el modelo de datos en `IndexedDB`.
3. **Al terminar cualquier tarea que cambie algo:** actualizar `memory.md`:
   - Sección 1 si cambia el modelo de datos o persistencia.
   - Sección 2 si se toma, cambia o elimina una decisión arquitectónica o de diseño.
   - Sección 3: añadir arriba una entrada con la fecha y un resumen breve del cambio.
4. Si `memory.md` y el código no coinciden, avisar al usuario antes de seguir.

---

## Descripción del proyecto
**Bóveda Digital** es una wallet securizada para almacenamiento, organización y consulta de documentos personales y comerciales (cédulas, pasaportes, licencias de conducir, tarjetas, títulos de vehículos, contratos de residencia y salud) con acceso 100% offline, cifrado local AES-256-GCM y arquitectura Zero-Knowledge.

Cuenta con un sistema de monetización por suscripciones (Plan Gratuito limitado a 5 documentos y Plan PRO ilimitado con alertas y respaldos cifrados en la nube), integrado y 100% compatible con el backend centralizado existente de la app de Halterofilia vía tokens JWT y validación segura en servidor.

---

## Stack y restricciones técnicas
- **HTML5 semántico:** `index.html` estructurado por vistas accesibles (Autenticación, Desbloqueo por PIN, Dashboard de Bóveda y Modales de interacción).
- **Tailwind CSS via CDN:** Configurado con paleta técnica de ciberseguridad y soporte de modo oscuro por clase (`darkMode: 'class'`).
- **CSS personalizado:** `assets/css/vault.css` con variables de diseño, glassmorphism, efectos de escáner láser y reglas críticas de impresión (`@media print`).
- **JavaScript Vanilla puro (sin compilación ni bundlers):**
  - `assets/js/crypto.js`: Web Crypto API nativa (AES-256-GCM, PBKDF2 con 100,000 iteraciones, SHA-256).
  - `assets/js/storage.js`: Motor de base de datos local `IndexedDB` (`BovedaDigitalDB`).
  - `assets/js/auth.js`: Controlador de autenticación unificada compatible con Halterofilia, gestión de tokens JWT y planes Free/Pro.
  - `assets/js/app.js`: Lógica de interfaz, escaneo con cámara, alertas de vencimiento, compartir seguro y checkout simulado.
- **Iconografía:** Lucide Icons cargado vía CDN (`window.lucide.createIcons()`).
- **Compatibilidad directa:** Funciona abriendo `index.html` directamente en el navegador (`file://`) o mediante un servidor estático ligero (`npx serve`, `python -m http.server`).

---

## Estilo de código y buenas prácticas
- **Zero-Knowledge por diseño:** Las claves de cifrado maestras se derivan en el cliente a partir del PIN del usuario y nunca se envían al servidor en texto claro.
- **Separación estricta de responsabilidades:** Criptografía en `crypto.js`, persistencia en `storage.js`, autenticación y licencias en `auth.js`, y UI en `app.js`.
- **Accesibilidad:** Soporte nativo de teclado para el PIN pad, contraste WCAG AA y etiquetas semánticas.
- **Diseño Mobile-First y Responsivo:** Visualización impecable en teléfonos móviles y escritorios.

---

## Cómo probar
1. **Navegación general:** Abrir `index.html` en el navegador y comprobar la ausencia de errores en consola.
2. **Autenticación:** Iniciar sesión con el usuario predeterminado o pulsar "Plan Gratuito" o "Plan PRO".
3. **Desbloqueo de Bóveda:** Introducir el PIN maestro de 6 dígitos configurado o pulsar el botón de biometría.
4. **Gestión de Documentos:** Agregar un nuevo documento mediante formulario manual o probar el simulador de escáner de cámara inteligente.
5. **Alertas de Vencimiento:** Verificar cómo los documentos con fecha próxima muestran badges "Vence en Xd" o "Vencido".
6. **Validación de Licencias:** Probar la cuota de 5 documentos en el Plan Gratuito y el flujo de Upgrade a Pro.
7. **Inspector Técnico:** Abrir el modal de API / JWT para inspeccionar la compatibilidad con el backend de Halterofilia.
