# Spec 011 — Correo Electrónico del Usuario Autenticado en "Licencia y Período de Prueba"

Estado: implementada

## Contexto y objetivo
En el diálogo modal **"Licencia y Período de Prueba"** (`#modal-license-info`) y en el modal de bloqueo por expiración de prueba (`#modal-trial-lock`), el campo de correo electrónico mostraba un valor genérico estático (`su-usuario@dominio.com`) o el usuario predeterminado de demostración (`andres.pro@boveda.com`), debido a que al recargar la aplicación o al renderizar el encabezado del Dashboard se sobrescribía el correo verificado del perfil con el correo por defecto de la sesión previa.

El objetivo de esta especificación es cambiar el campo en **"Licencia y Período de Prueba"** a **"Correo Electrónico:"** y garantizar que siempre muestre automáticamente el **correo electrónico real del usuario autenticado** (ya sea autenticado mediante el flujo de identificación/verificación por código OTP, el perfil del usuario registrado o el inicio de sesión activo), actualizando también en consecuencia la **Cadena de Solicitud para Activación** (`REQ|<DeviceID>|<correo_autenticado>`).

## Usuarios
- Usuarios autenticados de Bóveda Digital que consultan el estado de su licencia o período de prueba, o que solicitan su Token de Activación offline.

## Historias de usuario
- **HU-1.** Como usuario autenticado de Bóveda Digital, quiero que al abrir la ventana **"Licencia y Período de Prueba"** el campo **Correo Electrónico** contenga automáticamente mi correo electrónico autenticado, para no tener que escribirlo manualmente ni enviar por error un correo genérico en mi cadena de solicitud de licencia.

## Requisitos funcionales (EARS)
- **RF-1:** EL SISTEMA deberá etiquetar el campo de correo en el modal **"Licencia y Período de Prueba"** (`#modal-license-info`) como `Correo Electrónico:` (`#info-user-email-input`) sin valores estáticos genéricos (`su-usuario@dominio.com`) predefinidos en el HTML.
- **RF-2:** CUANDO el usuario se identifique y verifique su correo electrónico en el Onboarding inicial (Paso 2/2) o actualice su ficha en el Perfil de Usuario, EL SISTEMA deberá sincronizar dicho correo electrónico tanto en el perfil de licencia (`VaultLicenseManager`) como en la sesión activa del usuario autenticado (`VaultAuth.currentUser`).
- **RF-3:** CUANDO se inicialice la aplicación (`init()`) o se actualice el encabezado del Dashboard (`renderDashboardHeader()`), EL SISTEMA deberá resolver el correo del usuario autenticado priorizando el correo verificado del perfil del usuario y de la sesión autenticada sobre cualquier identificador genérico o de plantilla (`su-usuario@dominio.com`, `atleta@halterofilia.com`, `usuario_*@boveda.com`).
- **RF-4:** CUANDO el usuario abra el modal **"Licencia y Período de Prueba"** (`openLicenseModal()`) o se despliegue el modal de período de prueba expirado (`checkLicenseLock()`), EL SISTEMA deberá colocar automáticamente en el campo **Correo Electrónico** (`#info-user-email-input` y `#lock-user-email-input`) el correo electrónico del usuario autenticado y generar la **Cadena de Solicitud** (`REQ|<DeviceID>|<correo_autenticado>`) con dicho correo.
- **RF-5:** MIENTRAS el usuario edite manualmente el campo **Correo Electrónico** en el modal de licencia, EL SISTEMA deberá actualizar reactivamente la cadena de solicitud `REQ|<DeviceID>|<correo>` y el enlace de WhatsApp.

## Requisitos no funcionales
- **RNF-1:** Preservación íntegra de la arquitectura Zero-Knowledge, cifrado AES-256-GCM y compatibilidad offline del token de licencia SHA-256.
- **RNF-2:** Actualización de la caché del Service Worker a `boveda-digital-v13` para asegurar la disponibilidad inmediata del cambio en todos los navegadores y clientes PWA.

## Casos límite
- Si en el almacenamiento local existía previamente `su-usuario@dominio.com` o `atleta@halterofilia.com` en `currentUser`, pero el usuario ya registró su correo real en `vault_user_profile`, el sistema debe adoptar y mostrar el correo real del usuario autenticado.
- Si el usuario aún no se ha autenticado ni registrado ningún correo real, el sistema usará el correo de la sesión autenticada activa.

## Fuera de alcance
- Modificar el algoritmo criptográfico de validación de tokens SHA-256 o la duración de 7 días del período de prueba.

## Criterios de finalización
- [x] El modal "Licencia y Período de Prueba" muestra la etiqueta `Correo Electrónico:` y rellena `#info-user-email-input` con el correo del usuario autenticado.
- [x] La cadena de solicitud `#info-cadena-solicitud` se genera con `REQ|<DeviceID>|<correo_autenticado>`.
- [x] El 100% de la suite de pruebas automatizadas (`node --test tests/boveda.test.js tests/server.test.js`) pasa en verde.
- [x] `memory.md` actualizado con la decisión y el registro en el historial de cambios.

