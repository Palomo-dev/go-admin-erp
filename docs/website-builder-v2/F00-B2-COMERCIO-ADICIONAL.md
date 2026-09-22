# F00-B2c — All Natural, Ecom y Leafore

Inspección visual complementaria del 2026-09-19, hora local; capturas registradas en UTC el 2026-09-20. Builder: coordinador. Tester y QA independientes pendientes al entregar este documento. No es aprobación de F00 ni implementación de componentes.

## Método y evidencia

Se usó agent-browser 0.27.0 con Chrome ya instalado por Puppeteer, sesión `f00b2-root-commerce` y perfil propio en TEMP. Se abrieron únicamente estas referencias públicas. No se accedió a perfiles del usuario, GoAdmin o Supabase, ni se enviaron formularios o ejecutaron compras. La sesión se cerró con confirmación de la herramienta.

El manifiesto local `C:/Users/USUARIO/AppData/Local/Temp/goadmin-f00-b2-root-commerce/manifest-final.json` registra **31 capturas vistas por el builder**, sus URL, acciones, observaciones, tamaños PNG, SHA256 y hora. Tamaños aplicados: 390 × 844 y 1440 × 900; no representan dispositivos físicos. El comando de viewport devolvió EOF, pero las capturas tienen las dimensiones solicitadas. No se incluyen perfiles ni cookies en la evidencia.

Algunas tomas iniciales estaban cubiertas por promociones. Sus nombres de archivo no se usan para afirmar que mostraban un footer: las tomas terminadas en `clear` documentan el estado posterior al cierre. Una captura de menú de All Natural se reemplazó tras corregir un ref mal pasado a PowerShell, antes de entregar el manifiesto al tester; no se afirma conservar aquella toma fallida. Los archivos del manifiesto final no se sobrescriben para corregir observaciones: una nueva captura debe recibir otro nombre.

## Observaciones verificadas

| Referencia y fuentes | Cobertura y acción comprobada | Consecuencia para el diseño de GoAdmin |
|---|---|---|
| [All Natural](https://all-natural.framer.website/) · [detalle](https://all-natural.framer.website/shop/hair-hydrator) | Home y footer en ambos tamaños; menú móvil abierto, segundo nivel de productos y cierre; detalle en ambos tamaños; cambio de la primera imagen a la segunda. Header transparente en portada de escritorio y blanco en el detalle. Footer con grupos, redes, newsletter y pagos. | H02/H06/H08, HR07, F05/F06, G04 y E05: navegación jerárquica, apariencia de header por página/estado y galería responsive. Aplicar en F05/F09/F12; contenido comercial propio. |
| [Ecom](https://ecom-template.framer.ai/) · [catálogo](https://ecom-template.framer.ai/shop/category/all) | Home/footer en ambos tamaños; menú móvil con segundo nivel y cierre real mediante Escape. En escritorio, marcar Men cambia contador, controles y productos visibles; la URL incorpora `collection=Men`. La captura móvil posterior muestra tarjetas en una columna. | H06/H08, HR07/HR10, F04/F05/F06 y E01/E02: franja promocional independiente, footer con marca grande, filtros serializables y estados por dispositivo. Conectar F12 a consultas existentes; no duplicar precios o inventario. |
| [Leafore](https://leafore.framer.website/) · [detalle](https://leafore.framer.website/shop/argan-oil-lavender-conditioner-30-ml) | Home/footer y detalle en ambos tamaños; menú móvil translúcido; Escape no lo cierra en esta sesión y el clic en X sí. Galería móvil cambia de envase a retrato. Footer sobre fotografía vegetal con panel translúcido; hero de escritorio en dos mitades y recorte móvil distinto. | H02/H08, HR01/HR03, F05/F06, G04 y E05: fondo exterior y superficie interior independientes, control de media por dispositivo y adaptación de marca en el header del detalle. El renderer propio debe definir cierre/foco accesibles. |

Los IDs corresponden al [catálogo propuesto](CATALOGO-COMPOSICIONES.md); esta inspección no añade tipos de sección implementados. Las ventanas promocionales observadas son candidatas de composición, no autorización para activar suscripciones, cambiar moneda, copiar promociones o conectar proveedores de terceros en GoAdmin.

## Límites por referencia

- All Natural: el footer móvil se captura por su parte inferior; los grupos superiores quedan fuera del recorte. No se probó el retorno del segundo nivel mediante Back, navegación de escritorio desplegada, acordeones del producto ni todas las categorías. Al cambiar a escritorio la galería volvió a su primera imagen; el cambio no se atribuye a una acción de compra.
- Ecom: el filtro de escritorio sí produjo un resultado visible y URL verificable; no se probaron filtros móviles, Clear, todas las combinaciones ni el foco después de Escape. La parte superior de grupos del footer móvil queda fuera del recorte; el footer de escritorio sí los muestra. No se revisó aquí un detalle individual: la interna de este bloque es el catálogo.
- Leafore: el detalle añade automáticamente variante y hash a la URL. Después de cambiar la imagen, el hash observado siguió siendo `#image-1`; no se presume sincronización entre hash e imagen. Escape no cerró el menú; no se presenta como aprobación de accesibilidad. No se probaron tamaños, acordeones, compra, todas las rutas ni el menú desplegado de escritorio.
- En los tres sitios: las galerías/interacciones comprobadas son estados de interfaz. No acreditan servicios de venta, formularios, pagos, stock, accesibilidad completa, responsive en tablet ni la calidad de todas las animaciones. No se copiaron assets o código de las referencias al producto.

La cobertura global y las calificaciones se registran en [PROGRESS.md](../../PROGRESS.md) tras tester y QA. Este documento complementa [B1](F00-FICHAS-REFERENCIAS.md), la [ampliación B2](F00-COBERTURA-VISUAL-AMPLIADA.md) y el [reporte del tester](F00-REPORTE-TESTER.md), sin elevar las muestras a una revisión exhaustiva de las 32 referencias.
