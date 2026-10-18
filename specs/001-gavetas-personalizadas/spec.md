# Spec 001 — Gavetas Personalizadas y Código Cromático
 
Estado: implementada

## Contexto y objetivo
En la metáfora del archivador de seguridad de Bóveda Digital, los usuarios organizan sus expedientes en gavetas temáticas. Para facilitar la identificación visual inmediata de cada categoría y permitir la adaptación a necesidades específicas de cada usuario (por ejemplo, documentos académicos, criptoactivos, certificados o garantías comerciales), el sistema debe dotar a cada gaveta de una identidad cromática diferenciada e incorporar la capacidad de crear, utilizar y gestionar gavetas personalizadas con conceptos definidos por el usuario.

## Usuarios
- **Usuario de Bóveda Personal:** Desea distinguir de un vistazo en qué gaveta se encuentran sus documentos gracias a un código visual de colores y luces LED.
- **Usuario con Necesidades Específicas:** Requiere crear archivadores adicionales para conceptos no contemplados en las 5 gavetas predeterminadas (ej. títulos universitarios, contratos de alquiler, activos digitales).

## Historias de usuario
- **HU-1:** Como usuario de la bóveda, quiero que cada gaveta tenga un color y resplandor distintivo para reconocer visualmente el tipo de expediente sin necesidad de leer todo el texto.
- **HU-2:** Como usuario, quiero poder agregar nuevas gavetas con su propio nombre, descripción, icono y color para clasificar documentos de conceptos específicos.
- **HU-3:** Como usuario, quiero poder clasificar nuevos documentos o reasignar existentes hacia mis gavetas personalizadas.
- **HU-4:** Como usuario, quiero poder eliminar una gaveta personalizada cuando ya no la necesite, siempre que no contenga documentos que puedan perderse.

## Definiciones
- **Gaveta del Sistema (Predeterminada):** Una de las 5 gavetas centrales provistas por el sistema (`identidad`, `vehiculos`, `finanzas`, `residencia`, `salud`), inmutables y no eliminables.
- **Gaveta Personalizada:** Archivador creado por el usuario con clave única, etiqueta personalizada, subtítulo, color seleccionado y un icono representativo.
- **Credencial Digital Visual:** Ficha gráfica estilo tarjeta inteligente con microchip, franja holográfica y banda OCR que representa el expediente y adopta el color de la gaveta asignada.

## Requisitos funcionales (EARS)
- **RF-1:** EL SISTEMA mostrará cada gaveta con una paleta de color distintiva reflejada en sus indicadores LED, tirador metálico, bordes de apertura y acentos de carpetas.
- **RF-2:** CUANDO el usuario pulse el botón de creación de gaveta, EL SISTEMA desplegará un formulario para ingresar el nombre del concepto, una descripción corta, la selección de un icono y la selección de un color de una paleta predefinida.
- **RF-3:** SI el usuario intenta crear una gaveta sin nombre o con un nombre ya existente, ENTONCES EL SISTEMA rechazará la acción y mostrará un mensaje indicando el error de validación.
- **RF-4:** CUANDO se guarde exitosamente una nueva gaveta, EL SISTEMA la incorporará al mueble archivador y la registrará en el almacenamiento local para que persista entre sesiones y reinicios.
- **RF-5:** CUANDO se agregue o modifique un documento, EL SISTEMA listará en el selector de categorías tanto las gavetas del sistema como las gavetas personalizadas creadas por el usuario.
- **RF-6:** CUANDO el usuario seleccione un documento para su lectura, EL SISTEMA renderizará la credencial digital visual con el color y el icono correspondiente a la gaveta a la que pertenece dicho expediente.
- **RF-7:** SI el usuario solicita eliminar una gaveta personalizada que contiene al menos un expediente, ENTONCES EL SISTEMA bloqueará la eliminación advirtiendo que la gaveta no está vacía.
- **RF-8:** SI el usuario solicita eliminar una gaveta predeterminada del sistema, ENTONCES EL SISTEMA denegará la acción por tratarse de un archivador protegido.
- **RF-9:** CUANDO el usuario confirme la eliminación de una gaveta personalizada vacía, EL SISTEMA la eliminará del mueble y del almacenamiento local.
- **RF-10:** EL SISTEMA mostrará un encabezado (Header) estático anclado en la parte superior (top) de la ventana de visualización, en posición fija (`fixed top-0 left-0 right-0`), z-index elevado y con el texto exacto `"Boveda Digital "` visible permanentemente.
- **RF-11:** EL SISTEMA mostrará un pie de página (Footer) estático anclado en la base (bottom) de la ventana de visualización, en posición fija (`fixed bottom-0 left-0 right-0`), z-index elevado y con el texto exacto `"Análisis/Diseño de Andres Aguiar V 1.0 Santiago de Chile octubre 2026 - Contacto +56933395447 - Whatsapp +56933395447"` visible permanentemente.
- **RF-12:** MIENTRAS el contenido de las pantallas sea desplazable verticalmente, EL SISTEMA mantendrá espaciados internos de resguardo (padding superior e inferior) para evitar que el Header o el Footer estáticos superpongan o bloqueen elementos informativos o botones interactivos.
- **RF-13:** CUANDO el usuario pulse el botón de respaldo de datos, EL SISTEMA generará y descargará un archivo de respaldo seguro en formato JSON (`boveda-backup-YYYY-MM-DD.json`) que incluirá todos los documentos con sus payloads cifrados AES-256-GCM, IVs, checksums, gavetas personalizadas y metadatos de configuración, respetando la arquitectura Zero-Knowledge y sin exponer claves en texto claro.
- **RF-14:** CUANDO el usuario pulse el botón de recuperación de datos y proporcione un archivo de respaldo válido, EL SISTEMA restaurará los documentos y gavetas personalizadas en la base de datos local `IndexedDB`, actualizando reactivamente las gavetas y el contador de expedientes en pantalla.
- **RF-15:** SI el archivo seleccionado para recuperación está corrupto, malformado o no cumple con el esquema de respaldo de la bóveda, ENTONCES EL SISTEMA abortará la restauración, preservará los datos intactos y mostrará una notificación de error explicativa al usuario.
- **RF-16:** CUANDO el usuario presione el frente o tirador de una gaveta para abrirla, EL SISTEMA ejecutará una animación cinemática que simule la apertura física de un cajón de archivador (avance visual con perspectiva 3D/desplazamiento Z, micro-interacción en el tirador de acero, profundización de sombra en el riel y deslizamiento progresivo del interior de carpetas colgantes).
- **RF-17:** CUANDO el usuario vuelva a presionar una gaveta abierta para cerrarla, EL SISTEMA ejecutará la animación cinemática inversa de cierre mecánico, retrayendo las carpetas hacia el interior y alineando el frente del cajón al ras del mueble archivador.

## Requisitos no funcionales
- **RNF-1 (Offline First):** La definición y estado de las gavetas personalizadas debe operar 100% desconectado, persistiendo localmente en el dispositivo.
- **RNF-2 (Rendimiento):** La apertura de una gaveta o el cambio de filtro debe ejecutarse en menos de 100 ms sin bloqueos en la interfaz.
- **RNF-3 (Accesibilidad y Contraste):** Los textos de las etiquetas y badges sobre fondos de color deben cumplir con un ratio de contraste mínimo WCAG AA.
- **RNF-4 (Zero-Knowledge):** La metadata de las gavetas y los archivos de respaldo exportados no comprometen las claves maestras ni alteran el cifrado AES-256-GCM de los expedientes.
- **RNF-5 (Responsividad y No Intrusión):** El Header y Footer estáticos deben adaptarse a pantallas móviles sin provocar desplazamiento horizontal indeseado y preservar la ergonomía visual de alta seguridad.
- **RNF-6 (Integridad de Respaldo y Restauración):** La exportación e importación debe validar la estructura del JSON y verificar checksums antes de sobrescribir o insertar registros en `IndexedDB`.
- **RNF-7 (Fluidez y Rendimiento Visual):** Las animaciones mecánicas de apertura y cierre deben ejecutarse con aceleración por hardware (`transform`, `opacity`) a 60 fps estables y respetar la preferencia `prefers-reduced-motion` del sistema operativo.

## Casos límite
- Usuario sin gavetas personalizadas: el mueble muestra exactamente las 5 gavetas del sistema.
- Usuario que crea múltiples gavetas: el diseño de la gaveta debe mantenerse responsivo y apilarse verticalmente de manera ordenada.
- Caracteres especiales o acentos en el nombre de la gaveta: la clave interna debe normalizarse de forma segura (ej. "Títulos y Grados" -> `custom_titulos_y_grados`).
- Intentar eliminar una gaveta con expedientes archivados: debe requerir vaciarla o reubicar los expedientes primero.
- Dispositivos móviles y pantallas angostas: el texto del Footer (de extensión considerable) debe ajustarse con tamaño tipográfico legible, centrado y soporte multilínea o escala responsiva sin provocar overflow horizontal ni barras de scroll en el eje X.
- Apertura de diálogos modales (`<dialog>`): el z-index de los modales y backdrops debe coordinarse para que no queden bloqueados o desfasados con el Header y Footer estáticos.
- Impresión física de expedientes (`@media print`): el Header y Footer estáticos deben ocultarse durante la impresión para no distorsionar las credenciales o documentos impresos.
- Respaldo con 0 documentos archivados: el sistema genera un respaldo íntegro con arreglo vacío de documentos sin arrojar excepción.
- Recuperación de documentos existentes con el mismo ID: el sistema aplica estrategia de actualización/fusión sin duplicar claves primarias ni generar inconsistencias en `IndexedDB`.
- Archivo seleccionado no es JSON o contiene campos truncados: se rechaza la importación de inmediato con notificación al usuario sin modificar la base de datos existente.
- Usuario con `prefers-reduced-motion` activo: las animaciones cinemáticas mecánicas se desactivan o sustituyen por una transición sutil instantánea sin movimiento tridimensional.
- Múltiples gavetas abiertas a la vez o acción "Expandir todo": cada gaveta proyecta su sombra de profundidad sin solapar erróneamente los frentes de los cajones inferiores.

## Fuera de alcance
- Reordenar arrastrando (drag and drop) la posición física de las gavetas.
- Compartir una gaveta completa como carpeta compartida multiusuario (la compartición es a nivel de documento individual cifrado).
- Botones de acción, enlaces de navegación o componentes interactivos dentro del nuevo Header o Footer estáticos (contienen estrictamente las cadenas de texto solicitadas).
- Animaciones de colapso automático al desplazar el contenido (auto-hide o hide-on-scroll).
- Respaldo automático programado en servicios cloud de terceros (Dropbox, Google Drive) fuera de la exportación/importación local explícita.
- Efectos de sonido analógicos de chasquido de cerradura o deslizamiento metálico (la simulación es puramente visual y cinética).

## Criterios de finalización
- Las 5 gavetas del sistema se visualizan con colores diferenciados (Cyan, Esmeralda, Ámbar, Púrpura, Rosa).
- Posibilidad de crear una gaveta con nombre, subtítulo, icono y color persistiendo en almacenamiento local.
- Menús desplegables de categorías sincronizados con las gavetas activas.
- Visualización de la tarjeta credencial adaptada al color de la gaveta.
- Header estático anclado al top con el texto exacto `"Boveda Digital "`.
- Footer estático anclado al bottom con el texto exacto `"Análisis/Diseño de Andres Aguiar V 1.0 Santiago de Chile octubre 2026 - Contacto +56933395447 - Whatsapp +56933395447"`.
- Adaptabilidad móvil sin scroll horizontal y exclusión en `@media print`.
- Botón accesible de "Respaldo de Datos" que descargue el archivo JSON con los datos y configuraciones cifradas.
- Botón accesible de "Recuperación de Datos" con input file que valide y restaure los expedientes y gavetas en `IndexedDB`.
- Animaciones cinemáticas mecánicas de apertura y cierre de cajón con perspectiva y riel deslizante.
- Suite de pruebas unitarias automatizadas ejecutadas y pasando al 100% con `node --test`.

## Dudas abiertas
*Ninguna (requisitos cinemáticos clarificados).*
