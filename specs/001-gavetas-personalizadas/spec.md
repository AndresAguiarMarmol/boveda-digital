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

## Requisitos no funcionales
- **RNF-1 (Offline First):** La definición y estado de las gavetas personalizadas debe operar 100% desconectado, persistiendo localmente en el dispositivo.
- **RNF-2 (Rendimiento):** La apertura de una gaveta o el cambio de filtro debe ejecutarse en menos de 100 ms sin bloqueos en la interfaz.
- **RNF-3 (Accesibilidad y Contraste):** Los textos de las etiquetas y badges sobre fondos de color deben cumplir con un ratio de contraste mínimo WCAG AA.
- **RNF-4 (Zero-Knowledge):** La metadata de las gavetas no compromete las claves maestras ni altera el cifrado AES-256-GCM de los expedientes.

## Casos límite
- Usuario sin gavetas personalizadas: el mueble muestra exactamente las 5 gavetas del sistema.
- Usuario que crea múltiples gavetas: el diseño de la gaveta debe mantenerse responsivo y apilarse verticalmente de manera ordenada.
- Caracteres especiales o acentos en el nombre de la gaveta: la clave interna debe normalizarse de forma segura (ej. "Títulos y Grados" -> `custom_titulos_y_grados`).
- Intentar eliminar una gaveta con expedientes archivados: debe requerir vaciarla o reubicar los expedientes primero.

## Fuera de alcance
- Reordenar arrastrando (drag and drop) la posición física de las gavetas.
- Compartir una gaveta completa como carpeta compartida multiusuario (la compartición es a nivel de documento individual cifrado).

## Criterios de finalización
- Las 5 gavetas del sistema se visualizan con colores diferenciados (Cyan, Esmeralda, Ámbar, Púrpura, Rosa).
- Posibilidad de crear una gaveta con nombre, subtítulo, icono y color persistiendo en almacenamiento local.
- Menús desplegables de categorías sincronizados con las gavetas activas.
- Visualización de la tarjeta credencial adaptada al color de la gaveta.
- Suite de pruebas unitarias automatizadas ejecutadas y pasando al 100% con `node --test`.

## Dudas abiertas
*Ninguna (funcionalidad clarificada y validada).*
