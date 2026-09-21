# F00-B2 — Ampliación visual de referencias públicas

**Estado de construcción actualizado:** se recuperó la inspección mediante una sesión aislada de agent-browser. La [continuación visual B2a](#continuación-visual-b2a-con-agent-browser) documenta muestras reales de 15 referencias, con 95 capturas y pendientes explícitos. Las muestras de las otras referencias se entregan en expedientes independientes. Esta entrega requiere tester y QA; no aprueba F00 ni certifica todas las rutas o la compatibilidad de producción.

**Registro inicial histórico:** ronda iniciada el 2026-09-19, bloqueada por herramienta y con cobertura visual nueva igual a cero en ese momento. Se conservan a continuación esos intentos y su cola original; su estado fue posteriormente actualizado por la continuación visual al final del documento. No sustituye ni modifica las [fichas F00-B1](F00-FICHAS-REFERENCIAS.md).

## Alcance y bloqueo comprobado

La tarea era completar primero PayGin, Latte, ScanEats y Luna Rossa; después, revisar menús abiertos y footers representativos en móvil y escritorio. Los tamaños previstos eran 390 × 844 y 1440 × 900. **No se logró aplicar ningún viewport en B2**, abrir una página en navegador, tomar una captura ni ejecutar una interacción visual.

| Paso de herramienta | Resultado | Qué permite concluir |
|---|---|---|
| Crear pestaña temporal de PayGin mediante CUA, en segundo plano | `Browser is not available: iab` | Ese navegador no estaba disponible para la herramienta |
| Inventariar superficies con `cua.getState()` | `{"apps":[],"browsers":[]}` | No había superficies controlables expuestas |
| Apertura auxiliar mediante `open_in_codex`, reportada por el coordinador | `queued` | La solicitud quedó en cola; no confirma una página abierta |
| Comprobación final única con `cua.getState()` después del intento auxiliar | `{"apps":[],"browsers":[]}` | El bloqueo continuaba y no permitía inspección visual |

La documentación de CUA conserva una referencia al navegador seleccionado en B1; esa referencia no demuestra disponibilidad actual. El inventario operativo final seguía vacío. Esto **no demuestra que las cuatro páginas estén caídas**. En B1 se habían podido abrir las 32 referencias en navegador, con los límites visuales consignados entonces.

Al terminar B1 se restableció el viewport y se cerró exclusivamente la pestaña temporal propia. B2 no creó una pestaña nueva ni cerró pestañas del usuario. No se accedió a páginas de clientes, no se enviaron formularios y no se ejecutaron compras, reservas ni cambios de Supabase o de código de producto.

## Lecturas auxiliares que no constituyen evidencia visual

Mientras se comprobaba la disponibilidad se consultaron las siguientes fuentes mediante extracción web. Se conserva su resultado para evitar repetir trabajo, pero **no se usa para cerrar ninguna captura, comportamiento responsive, menú, footer o interacción**. La antigüedad es la que informó la herramienta; no se interpreta como una comprobación en vivo.

| Fuente consultada | Respuesta de extracción | Información textual recuperada | Límite |
|---|---|---|---|
| [PayGin inicio](https://paygin.framer.website/) | Error interno de acceso | Ninguna | No permite concluir disponibilidad del sitio |
| [PayGin contacto](https://paygin.framer.website/contact) | Error interno de acceso | Ninguna | El formulario de escritorio observado en B1 no se volvió a verificar |
| [Latte inicio](https://lattetemplate.framer.website/) | Contenido, rastreado «hoy» | Carta por cuatro grupos, noticias, relato final, horarios, contacto y mapa incrustado | No muestra estado final del header, mapa ni distribución visual |
| [Latte noticias](https://lattetemplate.framer.website/news) | Contenido, rastreado hace cinco meses | Listado de artículos, controles anterior/siguiente representados como imágenes y footer de horarios/contacto | No se accionó carrusel ni se verificó su semántica o funcionamiento actual |
| [ScanEats inicio](https://scaneats.framer.website/) | Contenido, rastreado hace 1,1 años | Carta destacada, categorías, ubicación, horarios, reserva, newsletter y enlaces finales | Fuente antigua; no verifica la versión actual |
| [ScanEats carta](https://scaneats.framer.website/All-menu) | Contenido, rastreado hace cinco meses | Categorías All Menu/Pizza/Pasta/Drink, productos con precios y bloques finales | No se seleccionaron categorías ni se verificó el scroll |
| [Luna Rossa inicio](https://lunarossa.framer.website/) | Error interno de acceso | Ninguna | No permite concluir disponibilidad del sitio |
| [Luna Rossa servicio](https://lunarossa.framer.website/service/artisan-baking) | Error interno de acceso | Ninguna | La estructura editorial de B1 no se volvió a verificar |

No se derivan nuevas composiciones del texto recuperado. Las propuestas de componentes y contratos permanecen en las fichas B1 y en el [catálogo](CATALOGO-COMPOSICIONES.md).

## Casos prioritarios para reanudar

Cada fila sigue **pendiente**. El origen de su estado anterior es la ficha B1 correspondiente, no una nueva observación de B2.

| Caso | URL conocida | Evidencia previa y problema por resolver | Inspección necesaria al recuperar navegador |
|---|---|---|---|
| B2-01 PayGin | [Inicio](https://paygin.framer.website/) y [contacto](https://paygin.framer.website/contact) | Portada móvil negra durante carga; contacto de escritorio visto en B1 | Captura estable de inicio móvil, header cerrado/abierto si existe control, cierre del menú y footer en ambos tamaños; comparar shell del contacto sin enviar |
| B2-02 Latte | [Inicio](https://lattetemplate.framer.website/) y [artículo](https://lattetemplate.framer.website/news/exploring-the-world-of-coffee-origins) | Header/imagen inicial parciales; artículo leído en DOM | Header y portada completos, navegación que exista en cada tamaño, cierre editorial/mapa/footer; interna de artículo para comprobar cambio de shell |
| B2-03 ScanEats | [Inicio](https://scaneats.framer.website/) y [carta](https://scaneats.framer.website/All-menu) | Posible área de scroll interno en captura inicial; categorías solo leídas | Estado estable del marco móvil y scroll hasta footer, menú abierto, selección real de una categoría y retorno; escritorio para comparar estructura |
| B2-04 Luna Rossa | [Inicio](https://lunarossa.framer.website/) y [servicio](https://lunarossa.framer.website/service/artisan-baking) | Collage visible, header/título iniciales incompletos; servicio leído en DOM | Entrada estable, menú abierto/cerrado, footer con artículos en ambos tamaños y composición representativa del servicio |

La selección de categorías, pestañas o menús locales está dentro de la inspección. Las acciones de enviar, reservar, comprar, añadir al carrito o contactar terceros quedan fuera: no son necesarias para identificar estas composiciones.

## Cola visual de las otras 28 referencias

Esta tabla organiza los pendientes de B1; no declara que sus menús o footers tengan fallos. Cuando no se había observado un menú expandible, primero debe comprobarse si existe. No se inventan controles ni rutas a partir de etiquetas.

| Referencia | Siguiente muestra representativa |
|---|---|
| Qitchen | Overlay ya abierto en B1: cierre, Escape y retorno de foco; footer de historia en móvil/escritorio |
| Bramble | Menú expandido y footer; estado/fallback visible del iframe de reserva, sin usarlo |
| Scalable | Desplegable Pages, portada móvil asentada y footer móvil/escritorio |
| Nestria | Menú y footer; galería móvil del producto cuyo panel Specification ya respondió en B1 |
| Volt | Menú, footer y cambio de imagen de hero por control local |
| Elian Valen | Portada asentada, footer y estructura del selector de tallas sin carrito |
| Arum | Menú expandido, footer extenso y galería local del detalle |
| All Natural | Hero móvil asentado, menú y footer comercial por grupos |
| Ecom | Hero asentado, menú/footer y filtro local con estado de resultados verificable |
| Leafore | Hero asentado, menú/footer y galería del producto |
| Riteora | Entrada final, navegación disponible y footer de carta |
| Coffee GR8R | Menú, footer y disposición visual del directorio de sedes |
| Deux Bakery | Menú, footer y detalle de carta estable |
| Matchioo | Menú, footer y Load More, si sigue presente y solo amplía contenido |
| Chowk House | Header y footer completos; aclarar mediante UI si Full Menu tiene destino navegable |
| BetheWind | Header/footer y composición completa de la solicitud, sin introducir datos |
| Mariven | Salida de la pantalla de entrada móvil, menú/footer y galería local de suite |
| Tidehouse | Header de varias filas y footer de dining en ambos tamaños |
| Hotellia | Menú abierto y footer de escritorio; footer móvil de carta ya visto en B1 |
| Karaya | Menú/footer y recorrido por espacios de villa, sin consulta |
| Constellare | Cápsula/header final móvil, footer y FAQ de suite |
| Rumaya | Menú/footer y destino visible de Explore en una tarjeta gastronómica |
| Aurelia | Menú/footer y composición de solicitud vinculada a habitación, sin enviar |
| Slice Town | Menú/footer y pestañas de carta, sin pedido ni reserva |
| Camino | Layout estable después de Drinks, teclado y footer de escritorio; móvil ya visto con límites en B1 |
| Umami | Menú/footer y composición de la interna de evento, sin reserva |
| MĒR | Portada después de entrada, navegación/footer y subcategoría de carta; cambio a drinks ya comprobado en B1 |
| Fusion AI | Menú/footer y disposición móvil de planes; conmutación Yearly ya comprobada en B1 |

## Evidencia exigida para cerrar cada caso

1. Registrar URL final, viewport realmente aplicado y pantalla inspeccionada. Una captura del primer fotograma de entrada no cierra el caso si aún oculta su composición.
2. Para un menú, registrar control utilizado, opciones visibles, forma de cierre y resultado. Para footer, llegar al final mediante UI y capturar los grupos y acciones; leer sus textos en DOM no sustituye la captura.
3. Tras cada interacción local, comprobar el resultado visible. Si una transición sigue incompleta, indicar el límite sin transformarlo en un defecto permanente.
4. Mantener una sola pestaña temporal y alternar los dos tamaños. Documentar el ancho útil si difiere del viewport; no afirmar prueba en dispositivo físico.
5. Guardar la diferencia entre observación, interpretación y decisión para GoAdmin. Los assets de terceros, destinatarios de formularios y textos comerciales no se convierten en contenido inicial de clientes.
6. Entregar al tester y al QA la cobertura obtenida y sus pendientes. El builder no se asigna calificación ni aprueba su propia ronda.

**Resultado de la entrega inicial histórica:** registro reproducible del bloqueo y cola de continuación. B2 permanecía sin ejecutar en ese momento. La reanudación siguiente sustituye ese estado, conservando los límites individuales de las muestras.

## Continuación visual B2a con agent-browser

La inspección se reanudó el 2026-09-19/20, según zona horaria y timestamp UTC de cada archivo. Se verificaron ayuda y versión de **agent-browser 0.27.0**, ejecutado desde caché de npm, y se reutilizó Chrome **138.0.7204.168**, previamente instalado por Puppeteer. No se instalaron componentes globales ni se modificaron package/lockfiles del ERP. La sesión `f00b2-public-references` usó configuración vacía y perfil propio en TEMP; no se leyeron perfiles ni cookies del usuario.

Se mantuvo una pestaña propia, alternando **390 × 844** y **1440 × 900**. Son viewports de navegador headless, no pruebas en teléfonos físicos. El comando de cambio de tamaño reportó `EOF` aunque aplicaba el viewport; por eso se comprobaron las dimensiones reales de cada PNG. Los 95 archivos del manifiesto total coinciden con los tamaños solicitados. El ancho útil puede ser menor por las barras de desplazamiento.

Durante Arum y Matchioo hubo dos fallos del daemon: después de un reintento de lectura fallido, se verificó el PID de esta sesión y se cerraron solamente ese proceso y los Chrome cuya línea de comando contenía el perfil TEMP propio. Se reabrió la misma referencia con ese perfil. Las sesiones de otros agentes y las pestañas del usuario no se tocaron. El cierre final devolvió `Browser closed`.

Las capturas se abrieron y se inspeccionaron realmente. Los snapshots del DOM sirvieron para encontrar controles y rutas, no para certificar su aspecto. Las esperas breves se usaron después de transiciones que dejaban contenido invisible; una imagen aún incompleta queda identificada como tal. No se enviaron formularios ni se ejecutaron compras, reservas, carrito, favoritos o acciones sociales. No se accedió a GoAdmin, sitios de clientes ni Supabase.

### Evidencia entregada

Directorio de evidencia local: `C:/Users/USUARIO/AppData/Local/Temp/goadmin-f00-b2-agent-browser/`. Los PNG y manifiestos permanecen allí para revisión; **TEMP es temporal y no constituye archivo permanente del repositorio**.

| Manifiesto | Cobertura propia | Archivos |
|---|---|---:|
| [manifest-prioridades.json](C:/Users/USUARIO/AppData/Local/Temp/goadmin-f00-b2-agent-browser/manifest-prioridades.json) | PayGin, Latte, ScanEats, Luna Rossa | 27 |
| [manifest-comercio-parcial.json](C:/Users/USUARIO/AppData/Local/Temp/goadmin-f00-b2-agent-browser/manifest-comercio-parcial.json) | Nestria, Volt, Elian Valen | 20 |
| [manifest-complementarias.json](C:/Users/USUARIO/AppData/Local/Temp/goadmin-f00-b2-agent-browser/manifest-complementarias.json) | Arum, Qitchen, Bramble, Scalable, Riteora, Coffee GR8R, Deux Bakery, Matchioo | 48 |
| [manifest-total-builder-b2.json](C:/Users/USUARIO/AppData/Local/Temp/goadmin-f00-b2-agent-browser/manifest-total-builder-b2.json) | Unión de los tres manifiestos anteriores; no añade inspecciones | 95 |

Cada registro contiene referencia, URL final, ruta absoluta, viewport solicitado, dimensiones PNG, acción, observación y límite, SHA-256 y fecha de modificación UTC. `viewedByBuilder` identifica inspección del constructor, no aprobación independiente. Las recapturas usan nombres diferentes; se conservan las capturas iniciales parciales sin presentarlas como resultados corregidos. Los archivos sueltos no incluidos en manifiestos no sustentan conclusiones de esta entrega.

Las otras muestras se coordinan en el expediente B2b hotel/restaurante, previsto como `F00-B2-HOTEL-Y-RESTAURANTE.md`, y en [B2c comercio adicional](F00-B2-COMERCIO-ADICIONAL.md). B2b seguía en preparación al escribir esta entrega. Este documento no revalida ni contabiliza sus resultados como inspecciones propias. El conjunto se debe reconciliar contra las 32 fichas B1; ninguna tabla implica que se hayan abierto todas las páginas CMS.

### Cobertura observada por referencia

En las siguientes fichas abreviadas, cada prefijo corresponde a archivos del manifiesto. Una captura del footer puede incluir solamente su porción inferior: se indica expresamente cuando ocurre. Las rutas internas son muestras representativas, no inventarios exhaustivos.

**PayGin — `paygin-*`.** Fuentes: [inicio](https://paygin.framer.website/) y [contacto](https://paygin.framer.website/contact). La portada antes negra ahora muestra en ambos tamaños el fondo, titular, campo de correo y composición de teléfonos. El footer pasa de cuatro columnas en escritorio a grupos apilados en móvil; la porción superior de marca no cabe en la captura móvil. **El header del inicio no apareció**, incluso en scroll inicial: un control del DOM estaba fuera del viewport. No se declara menú probado. En `/contact` sí se ve el header horizontal, CTA y formulario de líneas largas, sin introducir datos. La diferencia de header entre ambas rutas sigue pendiente de aclaración externa.

**Latte — `latte-*`.** Fuentes: [inicio](https://lattetemplate.framer.website/) y [artículo](https://lattetemplate.framer.website/news/exploring-the-world-of-coffee-origins). La entrada crema, tipografía grande, reseña, CTA y fila de tres imágenes se asentó en escritorio. En móvil, hamburguesa → panel claro de dos enlaces y datos de contacto → cierre real. El footer muestra horarios/contacto y mapa; el mapa se cargó en la captura móvil, pero seguía gris en la captura de escritorio. La captura `mobile-footer-contact` muestra el panel cerrado y el contacto, con parte del título tapada por el header fijo. La interna evidencia foto, fecha y título, sin cubrir todo el cuerpo del artículo ni comprobar el carrusel.

**ScanEats — `scaneats-*`.** Fuentes: [inicio](https://scaneats.framer.website/), [carta](https://scaneats.framer.website/All-menu) y [bebidas](https://scaneats.framer.website/All-menu/drink). Menú abierto blanco → selección All Menu → panel cerrado en la carta → selección Drink con dos bebidas y categoría resaltada. Esta interacción sí produjo resultados visibles y rutas distintas. Persisten barras de scroll anidadas en la portada móvil. La carta de escritorio mantiene un contenedor estrecho centrado, en vez de ocupar todo el ancho. Footer negro con newsletter, enlaces y legal en ambos tamaños, conservando esa columna estrecha en escritorio. No se probó reserva ni envío de newsletter.

**Luna Rossa — `lunarossa-*`.** Fuentes: [inicio](https://lunarossa.framer.website/) y [servicio](https://lunarossa.framer.website/service/artisan-baking). Portada crema con collage, gran titular y navegación de escritorio; móvil con header café contenido. El menú abre un panel de enlaces dentro del header, dejando contenido visible debajo. El segundo click redujo el panel, pero `mobile-menu-closed` conserva un fragmento de HOMEPAGE: **cierre completamente asentado pendiente**, no éxito sin reservas. Footer de escritorio con navegación, artículos recientes y contacto/mapa; las dos capturas móviles cubren porciones complementarias del cierre editorial. La interna muestra el hero del servicio, no todo su proceso.

**Nestria — `nestria-*`.** Fuentes: [inicio](https://nestria-preview.framer.website/) y [lámpara](https://nestria-preview.framer.website/products/luma-dome-table-lamp). Menu → panel claro con cinco opciones → Close devuelve el hero. Footer móvil apilado, escritorio en grupos horizontales, ambos con marca sobredimensionada. En el producto se observa galería lateral y panel de detalle en escritorio; el click en Specification activa la pestaña y muestra dimensiones. La captura `desktop-product` anterior a esa interacción es parcial por opacidad de entrada. En móvil se comprueba la galería con miniaturas arriba, sin capturar todos los detalles comerciales inferiores. Ninguna compra o favorito se accionó.

**Volt — `volt-*`.** Fuentes: [inicio](https://volt-ecommerce.framer.website/) y [producto](https://volt-ecommerce.framer.website/combos/urban-utility-oversized-tee). Header móvil de utilidades en dos filas sobre tema oscuro; hamburguesa abre categorías por género/tipo y vuelve a cerrar. El footer móvil muestra su parte final; el de escritorio incluye newsletter, cinco grupos y tarjetas de ventajas encima, con badges externos que cubren un extremo. En el detalle móvil, pulsar la segunda miniatura cambia de foto frontal a lateral y resalta el control. Esto prueba una galería local del producto, **no** cambio de imagen del hero ni compra. No se seleccionaron variantes.

**Elian Valen — `elian-*`.** Fuentes: [inicio](https://elianvalen.framer.website/) y [conjunto](https://elianvalen.framer.website/products/polo-style). Entrada móvil asentada y navegación distribuida en filas de marca/carrito, enlaces y país/moneda. No se observó hamburguesa; no se inventa un estado de menú expandido. Footer móvil con contacto/horarios/social/legal, y escritorio con gran marca, newsletter y datos horizontales. En la ficha móvil se observaron galería, miniaturas y controles separados para tallas de polo/pantalón, cantidad y preguntas. Se inspeccionó su estructura, **sin seleccionar opciones ni comprobar efectos de stock/precio**.

**Arum — `arum-*`.** Fuentes: [inicio](https://arum.framer.wiki/) y [producto](https://arum.framer.wiki/fc-products/arum-for-subh). Hero fotográfico editorial y header Menu/Cart. Menú crema abierto con grupos principales, Other/Help Center e imagen inferior; cierre retorna al hero. Footer en dos columnas móviles frente a cuatro grupos de escritorio, con selector de país y pagos al final. La ficha de escritorio muestra foto grande, precio, tres tamaños y acordeones. No se accionaron tamaños, acordeones ni galería: la inspección es de composición. El primer fallo del daemon se resolvió sin modificar perfiles ajenos.

**Qitchen — `qitchen-*`.** Fuente: [historia](https://qitchen-template.framer.website/about). En móvil, header dentro del panel fotográfico y relato apilado; hamburguesa abre overlay oscuro con cinco enlaces. Escape lo cierra y la captura muestra contorno de foco en la hamburguesa. Ese caso no sustituye una prueba completa de orden de foco, atrapamiento o lector de pantalla. El footer móvil comparte encuadre con relato y badges; el header fijo pisa parte del texto. En escritorio se ve el panel fotográfico izquierdo y mosaico editorial derecho con barra final: útil para modelar un shell dividido por columnas, diferente del flujo móvil.

**Bramble — `bramble-*`.** Fuentes: [inicio](https://bramble.framer.website/) y [reserva](https://bramble.framer.website/Reserve-table). Hero fotográfico con marca grande; apertura y cierre del overlay oscuro observados. El footer móvil combina newsletter, contacto parcial, ilustraciones de platos y legal. La captura de escritorio abarca **solo la porción inferior** de platos/marca/legal; no prueba sus grupos superiores. La interna de reserva muestra un rectángulo gris con icono de iframe fallido mientras el shell sí carga. Se registra como dependencia externa no cargada en esta sesión; no se hizo una reserva ni se concluye que falle para todos los visitantes.

**Scalable — `scalable-*`.** Fuentes: [inicio](https://scalable.framer.website/) y [About](https://scalable.framer.website/about). Hero SaaS negro/morado con CTA y panel ilustrado. Menú móvil abre un bloque de enlaces y CTA bajo el header, manteniendo parte de la página a la vista; segundo click lo cierra. Footer móvil incluye cola FAQ/marca/CTA/navegación/legal; escritorio con CTA amplia y barra final. La interna muestra hero y comienzo de relato con imagen. **Pages de escritorio no se desplegó**, y no se verificaron todas sus opciones.

**Riteora — `riteora-*`.** Fuentes: [inicio](https://riteora.framer.website/) y [carta](https://riteora.framer.website/menu). Hero verde, lima y rosa, con logo y ORDER NOW. No se observó hamburguesa y no se accionó el CTA comercial. El enlace Explore the Menu sí llevó a `/menu`, donde se capturó título e imagen inicial; es navegación entre páginas, no un menú overlay. El footer móvil muestra grupos finales y marca/legal; escritorio muestra contacto, navegación y social en tres grupos. No se prueba pedido ni integración comercial.

**Coffee GR8R — `coffee-*`.** Fuentes: [inicio](https://coffee-gr8r.framer.website/) y [sedes](https://coffee-gr8r.framer.website/branch). Hero crema/café con vasos. Hamburguesa → panel de cinco enlaces y CTA de reserva → cierre; CTA no accionado. Footer móvil de dos columnas con taza, legal y marca. En escritorio la captura es **solo la porción inferior**, con navegación parcial arriba. `/branch` muestra titular e ilustración del directorio; las tarjetas de sedes quedan fuera del encuadre. La existencia textual de sedes descrita en B1 no se eleva aquí a verificación visual de todas sus tarjetas.

**Deux Bakery — `deux-*`.** Fuentes: [inicio](https://deuxbakery.framer.website/) y [producto de carta](https://deuxbakery.framer.website/menu/olive-ciabatta). Fondo a rayas, panel crema redondeado e ilustraciones. El control de navegación aparece como checkbox en la herramienta: check abre panel café y uncheck lo cierra. Se documenta el mecanismo observado, no se recomienda replicar su semántica. Footer móvil de newsletter/enlaces/contacto/marca, con título parcialmente bajo header; escritorio en tres grupos y sello decorativo. La interna separa foto y ficha con precio/unidad, peso, horneado, textura e ingredientes. El texto de la demo mezcla características de otro producto: sirve la estructura, no ese contenido.

**Matchioo — `matchioo-*`.** Fuentes: [inicio](https://matchioo.framer.website/) y [ancla carta](https://matchioo.framer.website/#menu), cuyo destino se leyó en el enlace real. Hero fotográfico con lettering/dibujos; apertura y cierre del panel móvil de cuatro enlaces comprobados, con recaptura después del segundo fallo del daemon. Los clicks móviles en Menu y Load More no produjeron desplazamiento o ampliación verificables: las capturas siguieron en el hero. **Ambos resultados móviles quedan pendientes**; no se infiere éxito del mensaje `Done`. Abrir directamente el destino observado `/#menu` en escritorio sí muestra seis bebidas en dos filas de tres. Footer móvil con nav/contacto en dos columnas, social/legal y partición de líneas largas; escritorio expande esos grupos sobre el mismo fondo celeste. No se accionaron likes, valoraciones ni eventos sociales.

### Propuestas derivadas para fases posteriores

Son requisitos candidatos; no modifican el catálogo aprobado, el contrato de secciones, código, backend ni BD en esta ronda.

| Evidencia | Propuesta aditiva | Condición para implementación |
|---|---|---|
| Menús fullscreen, panel contenido y expansión debajo del header | Variantes explícitas de navegación por sitio/outlet y por breakpoint; estado de edición y preview controlado | Botón accesible con nombre y `aria-expanded`, Escape, foco y scroll bloqueado cuando corresponda; no copiar un checkbox oculto como contrato universal |
| Headers transparentes, de varias filas y shell dividido | Tokens independientes de fondo, contraste, altura, posición y ancho del header; herencia org/outlet explícita | Resolver sin cambiar el header legacy mientras el sitio no active V2; distinguir transparencia sobre hero de fondo de páginas internas |
| Footers apilados, de dos/cuatro/cinco grupos, marca grande y bloque editorial | Composiciones con orden móvil, límite de columnas y separación de marca/contacto/legal | Contenido legal/contacto de cada negocio, no de la demo; evitar que header fijo tape títulos o anclas |
| Productos con galería, tabs, tallas y ficha gastronómica | Bloques visuales enlazados a datos existentes y presets por vertical | Precios, variantes, stock, carrito y pedidos siguen en los servicios actuales; no crear otra lógica de ventas en el editor |
| ScanEats estrecho y Qitchen dividido frente a layouts de ancho completo | Opciones de ancho contenido, ancho completo y columnas con comportamiento móvil definido | Probar scroll, altura y overflow en preview y web publicada; no fijar indiscriminadamente un ancho de teléfono en escritorio |
| Iframe de Bramble y mapa incompleto de Latte | Estado cargando/error/fallback para incrustaciones y alternativa de enlace | El preview debe permitir ver composición sin efectuar reservas ni envíos; observar errores de terceros sin atribuirlos a GoAdmin |
| Grandes imágenes, collage, lettering y fondos continuos | Presets de composición con assets propios o licenciados, focal point móvil/escritorio y texto editable | Las fotografías, logos, contactos, reviews y claims de las referencias no se copian como contenido comercial de clientes |
| Capturas con animación inicial o header fuera de encuadre | Preview determinista con contenido visible y controles para previsualizar animaciones por separado | Respetar movimiento reducido, fallback de vídeo y estados de carga; una pantalla negra no puede presentarse como resultado final del editor |

### Pendientes y entrega al ciclo /loop

Quedan pendientes específicos: header de inicio de PayGin; cierre asentado de Luna Rossa; mapa de escritorio de Latte; embed externo de Bramble; Pages de Scalable; composición visual de tarjetas de sedes de Coffee GR8R; ampliación y click de ancla móviles de Matchioo; porciones superiores de algunos footers de escritorio. No se probaron todos los accordions, todas las rutas CMS, todos los breakpoints, lectores de pantalla, navegación completa de teclado ni carga real de medios en toda condición de red.

El tester recibió los manifiestos por bloques y reportó primero 191/191 comprobaciones de metadatos sobre las 27 capturas prioritarias y una muestra visual de 14, luego 142/142 sobre 20 de comercio y una muestra visual de 13. Eso no significa que haya visto todas las imágenes ni que apruebe los sitios. El tercer bloque de 48 capturas se entregó para su evaluación independiente; el informe definitivo y el veredicto pertenecen al tester/QA y al registro de PROGRESS mantenido por el coordinador.

**Entrega del builder:** evidencia de muestras reales, diferencias responsive observadas, interacciones comprobadas y resultados pendientes separados. No hay auto-calificación. Esta documentación no garantiza compatibilidad de GoAdmin ni autoriza publicar cambios: conservar ventas exige implementar y probar de forma aditiva las fases técnicas, con sus controles y evidencias independientes.
