# Evidencia visual de informes NIIF

Capturas generadas el 24 de octubre de 2026 en Chromium con los componentes React, el kit v2, sus estilos y la tipografía Inter del bundle productivo. Se probaron escritorio de 1440 × 1100 y celular de 390 × 844; las imágenes incluyen el contenido completo de la pantalla.

Los datos son sintéticos y anónimos. La API, los contextos de organización/sucursal/zona horaria, la navegación de Next y el registro en el shell se simulan. No se usó una sesión autenticada del ERP ni datos de clientes. El encabezado móvil del shell completo no forma parte de este harness.

| Pantalla | Escritorio | Celular |
| --- | --- | --- |
| Situación financiera comparativa | [Captura](desktop-situacion-financiera.png) | [Captura](mobile-situacion-financiera.png) |
| Mayor consolidado sin seleccionar cuenta | [Captura](desktop-mayor-consolidado.png) | [Captura](mobile-mayor-consolidado.png) |
| Flujo indirecto y diferencia de conciliación | [Captura](desktop-flujo-indirecto.png) | [Captura](mobile-flujo-indirecto.png) |
| Formulario 300 en borrador | [Captura](desktop-formulario-300.png) | [Captura](mobile-formulario-300.png) |
| Configuración de grupo, notas y firmantes | [Captura](desktop-configuracion.png) | [Captura](mobile-configuracion.png) |
| Restricción del flujo indirecto en grupo 3 | [Captura](desktop-grupo3.png) | [Captura](mobile-grupo3.png) |

La verificación cubre 14 casos: cinco pantallas, la restricción de grupo 3 y la respuesta de acceso denegado en cada tamaño. Comprueba ausencia de errores de página y desbordamiento horizontal, filtros visibles, estado 403 sin falso mensaje de movimientos vacíos y restricción de presentación por grupo. En celular se comprueba además que las cifras comparativas y variaciones permanezcan visibles en las tarjetas.

Estas 12 imágenes y las comprobaciones del harness verifican el render con las respuestas suministradas. El recorrido con autenticación real, permisos reales de navegación, API real y datos contables de una organización sigue siendo una validación separada.
