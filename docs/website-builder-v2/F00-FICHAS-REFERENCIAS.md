# F00-B — Fichas de las 32 referencias públicas

Ronda 1 de construcción. Inspección: 2026-09-19, mediante navegador y lectura del DOM público. Este documento amplía la [matriz de referencias](MATRIZ-32-REFERENCIAS.md) y el [catálogo de composiciones](CATALOGO-COMPOSICIONES.md). No implementa plantillas ni modifica GoAdmin, sus sitios o Supabase. El builder entrega evidencia y pendientes; la aprobación corresponde a tester y QA.

## Cómo interpretar la evidencia

- **DOM**: estructura, textos, controles y destinos de enlaces leídos en la página cargada. Confirma presencia, no funcionamiento del backend.
- **Visual móvil**: captura inspeccionada con viewport solicitado de 390 × 844. La barra de desplazamiento reduce el ancho útil. No equivale a prueba en dispositivo físico ni certifica otros tamaños.
- **Visual escritorio**: captura inspeccionada a 1440 × 900 donde se indica. La revisión visual anterior está en [referencias de diseño](../multi-outlet/REFERENCIAS-DISENO-2026-09-19.md).
- **Interacción comprobada**: acción local concreta seguida de lectura del resultado. No se enviaron formularios, añadieron productos a carritos, compraron entradas ni hicieron reservas.
- **Pendiente**: no se observó suficientemente; no debe convertirse en un requisito supuestamente probado. Varios sitios muestran animaciones de entrada: una captura inicial vacía no demuestra un fallo permanente.

Las 32 referencias se abrieron en navegador, se revisaron sus enlaces y contenido final del DOM, y se tomó una captura móvil de portada o página interna. Se ampliaron con rutas internas o anclas indicadas en cada ficha. **No se inspeccionaron todas las rutas, todos los menús abiertos ni todos los footers visualmente**. Las capturas se examinaron en la sesión de herramientas; no se archivaron imágenes de terceros en el repositorio. Las fuentes y pasos permiten repetir la observación.

La fuente de cada ficha es el sitio enlazado. Los patrones, nombres de componentes y decisiones para GoAdmin son propuestas propias, no código extraído de esas plantillas. Los contenidos comerciales, precios, reseñas, derechos, integraciones y promesas de las demos no se trasladan a presets de clientes.

## 01 — Qitchen

Fuentes: [inicio](https://qitchen-template.framer.website/), [historia](https://qitchen-template.framer.website/about). Carta y reserva tienen revisión previa enlazada arriba.

- **Observado:** la historia mantiene marco oscuro, fotografía, texto editorial, carruseles y reconocimientos. Footer de autor/licencia, distinto del contenido gastronómico.
- **Móvil:** imagen y narrativa se apilan; header dentro del panel, CTA de reserva y hamburguesa conservados. Abrir la hamburguesa mostró overlay completo con carta, reserva, historia, contacto y blog: estas dos últimas rutas no aparecen en el header reducido.
- **Reutilización:** P02, H07/H08, C01/C06, G04, F01; `PageComposition` con panel visual y `SiteHeader` con menú expandido. Contenido: imagen, título, relato, reconocimientos; acción: navegación contextual. F05/F09/F11.
- **Pendiente:** Escape, foco atrapado/restaurado, carruseles por teclado y rutas blog/contacto. El footer de licencia de la demo no constituye el footer comercial del cliente.

## 02 — Bramble

Fuentes: [inicio](https://bramble.framer.website/), [reserva](https://bramble.framer.website/Reserve-table).

- **Observado:** portada con fotografía y marca grande; horarios diferentes para bar, cocina y almuerzo; cartas enlazadas a documento externo; tarjetas regalo externas; contacto y newsletter al final. La ruta de reserva contiene iframe, con carga visual incompleta en esta ronda.
- **Móvil:** CTA de reserva arriba a la izquierda, hamburguesa a la derecha y bloque de presentación centrado debajo de la fotografía.
- **Reutilización:** H04, C15, R06/R09, C12 y E10 ya incluido en catálogo; `BusinessHours` debe soportar servicios por día, no una sola franja. `ExternalMenuLink` y `ReservationAction` diferencian documento, proveedor y formulario. F05/F09/F11/F12.
- **Pendiente:** menú abierto, fallback del iframe y footer visual. No inferir disponibilidad ni confirmación por existir el widget.

## 03 — Scalable

Fuentes: [inicio](https://scalable.framer.website/), [historia](https://scalable.framer.website/about).

- **Observado:** navegación a historia/blog/contacto y ancla de precios; cierre con CTA y navegación reducida. La interna alterna fotografía y bloques de valores personales/profesionales; conserva shell oscuro. Captura de escritorio de la interna verificada.
- **Móvil:** marca, hamburguesa y CTA centrales visibles; la primera captura de portada aún tenía contenidos en transición.
- **Reutilización:** H01, C01/C04/C07/C08/C09/C20/C21; `StorySplit`, `PricingCards` y `IntegrationGrid`. Datos editoriales y enlaces, sin simular reportes reales del ERP. F09/F12.
- **Pendiente:** desplegable Pages, precios con teclado, blog/detalle y footer móvil visual. El destino de algunas acciones es una demo externa; no demuestra contratación funcional.

## 04 — PayGin

Fuentes: [inicio](https://paygin.framer.website/), [contacto](https://paygin.framer.website/contact).

- **Observado:** anclas de funcionalidades, historia y proceso; CTA a tienda de aplicaciones. Contacto presenta nombre, correo, teléfono y mensaje; FAQ y footer con enlaces/redes. Escritorio del formulario verificado.
- **Móvil:** captura inicial de portada negra durante carga; no se valida su composición final móvil con esa evidencia. El navegador sí permitió leer el contenido aunque la herramienta de extracción web falló.
- **Reutilización:** HR06, C04/C07/C10/C13; `ContactForm` con campos declarados y destino propio. F09/F12.
- **Pendiente:** portada final móvil, menú abierto y envío en entorno propio. Se observó que el correo visible y el destino del enlace no coinciden; los presets deben validar destinatarios y no copiar estos datos.

## 05 — Nestria

Fuentes: [inicio](https://nestria-preview.framer.website/), [detalle de lámpara](https://nestria-preview.framer.website/products/luma-dome-table-lamp).

- **Observado:** portada comercial; detalle con miniaturas, precio, etiqueta, cantidad, especificaciones y productos relacionados; newsletter/footer por grupos. Al seleccionar Specification apareció una lista de dimensiones. Detalle en escritorio verificado después de la interacción.
- **Móvil:** marca, búsqueda y botón Menu sobre fotografía; tarjeta de producto superpuesta con miniatura y enlace.
- **Reutilización:** H06, E03/E05, G04; `ProductDetail` con ranuras de galería, datos comerciales y paneles editoriales; `ProductHotspot`. F05/F12.
- **Pendiente:** menú abierto, galería móvil, stock/variantes y compra. En el DOM, Add to Cart y Buy Now enlazan a la portada; no tratarlos como ejemplo de venta funcional.

## 06 — Volt

Fuentes: [inicio](https://volt-ecommerce.framer.website/), [producto](https://volt-ecommerce.framer.website/combos/urban-utility-oversized-tee).

- **Observado:** categorías por público, combos y campañas; detalle con cantidad, descuentos, cupón, tabla de especificaciones, reseñas y relacionados. Footer con categorías, políticas y newsletter.
- **Móvil:** franja de sedes/contacto; header con menú, marca y utilidades comerciales; hero fotográfico y flecha de carrusel.
- **Reutilización:** H06, HR07, E01/E06/E08/E09/E12; `ProductDetail`, `PromotionBanner` y `ProductSpecifications`. F05/F12.
- **Pendiente:** menú, carrusel, cupones y reseñas enviados. Cantidad y CTA se observaron sin ejecutarlos. Los descuentos de la demo no validan cálculo; en GoAdmin precio y promoción deben proceder de la operación existente.

## 07 — Elian Valen

Fuentes: [inicio](https://elianvalen.framer.website/), [conjunto de prendas](https://elianvalen.framer.website/products/polo-style).

- **Observado:** colección editorial; detalle de conjunto con talla independiente para dos prendas, cantidad, cuidados, FAQ y relacionados. Footer con disponibilidad, contacto y políticas.
- **Móvil:** marca y carrito en una fila; enlaces de navegación en otra. La imagen de portada no había terminado de aparecer en la captura inicial.
- **Reutilización:** P03, HR04, E04/E05/E09; `ProductBundleOptions` debe consumir variantes reales, no construir combinaciones de precio dentro de la sección. F12.
- **Pendiente:** selector de tallas, combinaciones agotadas, carrito y footer visual. Hay un correo enlazado como dirección HTTPS en la demo: validar tipo de enlace en el editor.

## 08 — Arum

Fuentes: [inicio](https://arum.framer.wiki/), [detalle de fragancia](https://arum.framer.wiki/fc-products/arum-for-subh).

- **Observado:** navegación de colecciones, productos y marca; historia/tiendas/journal; detalle con perfil aromático, ingredientes, envío, testimonios y relacionados. Footer extenso por productos/categorías/ayuda y métodos de pago.
- **Móvil:** marca centrada entre Menu y carrito; fotografía a todo ancho con título, CTA y tarjeta de producto abajo.
- **Reutilización:** H02/H04, E03/E05/E10/E11, C02; `ProductDetail` con información editorial estructurada y `StoreDirectory`. F05/F12.
- **Pendiente:** menú expandido, variantes, precios tras integración comercial y carrusel. No se importaron recursos ni afirmaciones cosméticas del sitio.

## 09 — All Natural

Fuentes: [inicio](https://all-natural.framer.website/), [detalle de crema](https://all-natural.framer.website/shop/body-cream).

- **Observado:** colecciones, kits, tarjetas regalo, tiendas, distribuidores y journal; detalle con beneficios, ingredientes, uso, textura y productos relacionados. Footer separa tienda, compañía, ayuda y legal.
- **Móvil:** marca entre Menu y bolsa; indicadores de slider visibles. Primera captura del hero incompleta por carga.
- **Reutilización:** H06, E02/E05/E09/E10/E11, C11/C18; `ProductInformationPanels` y `BenefitsGrid`. F05/F12.
- **Pendiente:** final del slider móvil, mega menú, favoritos, account externo y compra. No inferir que cuenta/carrito pertenecen al mismo origen; el editor debe distinguir enlaces externos y rutas locales.

## 10 — Ecom

Fuentes: [inicio](https://ecom-template.framer.ai/), [catálogo](https://ecom-template.framer.ai/shop/category/all).

- **Observado:** categorías/colecciones diferentes, campañas y journal. Catálogo presenta filtros por colección, talla, color y precio, búsqueda y orden; footer contiene políticas específicas y newsletter.
- **Móvil:** marca, búsqueda, cuenta, carrito y hamburguesa sobre fotografía; indicadores de slider. Texto animado de portada parcial.
- **Reutilización:** E01/E02/E08/E12, H06; `CatalogFilters` separado del layout del listado. F12.
- **Pendiente:** resultados de filtros y orden, contador, estados vacíos, navegación de páginas. En la lectura inicial no se cargaron tarjetas de catálogo; no concluir que el catálogo siempre esté vacío. Las dos newsletters requieren un destino y consentimiento definidos.

## 11 — Leafore

Fuentes: [inicio](https://leafore.framer.website/), [detalle de producto](https://leafore.framer.website/shop/argan-oil-lavender-conditioner-30-ml).

- **Observado:** detalle con galería de cuatro controles, información de uso, entrega/devoluciones, tabla de ingredientes y relacionados. Footer con enlaces de compañía, políticas y newsletter.
- **Móvil:** marca centrada, menú a la izquierda y utilidades a la derecha. Portada incompleta en la primera captura.
- **Reutilización:** HR03, E05, C06/C10/C11; `DetailAttributeTable`, `ProductInformationPanels` y galería reutilizada. F09/F12.
- **Pendiente:** transición final del hero, galería, variantes y compra. La estructura editorial es útil; el contenido de ejemplo mezcla categorías y no debe alimentar datos operativos ni recomendaciones sobre salud.

## 12 — Latte

Fuentes: [inicio](https://lattetemplate.framer.website/), [artículo](https://lattetemplate.framer.website/news/exploring-the-world-of-coffee-origins).

- **Observado:** carta agrupada en café, lattes, otras bebidas y panadería; precios y descripciones en filas; noticias; footer con relato, ubicación y enlace a carta. Artículo con fecha, imagen, cuerpo y shell reducido.
- **Móvil:** fondo crema, reseña destacada, título y CTA redondeado. Parte del header/imagen no quedó visible en la captura inicial.
- **Reutilización:** R01/R10, C11/C14/C15, F06; `MenuList`, `ArticleDetail` y footer editorial. F05/F09/F11.
- **Pendiente:** artículo visual completo y mapa. Los enlaces legales conducen a Framer; cada cliente necesita sus propios documentos, no esos enlaces de la demo.

## 13 — Riteora

Fuentes: [inicio](https://riteora.framer.website/), [carta](https://riteora.framer.website/menu).

- **Observado:** carta breve de bebidas con precios, testimonios y cierre de marca grande; footer con ubicación, contacto y páginas.
- **Móvil:** header con marca y CTA de pedido; fondo verde, acento lima y bebida recortada con sello. Título aún en transición inicial.
- **Reutilización:** HR06, D04/D05/D06, R04/R09; `FeaturedMenuItems` con assets reemplazables y decoración separada del producto. F09/F11.
- **Pendiente:** entrada final móvil, navegación alternativa al header reducido, reserva y pedido. La ruta de carta no aporta evidencia de un carrito; un CTA visual no basta para declarar venta habilitada.

## 14 — Coffee GR8R

Fuentes: [inicio](https://coffee-gr8r.framer.website/), [sedes](https://coffee-gr8r.framer.website/branch).

- **Observado:** seis sedes con nombre, dirección, horario y enlace a mapa; reseñas y FAQ. Footer de navegación/redes/legal.
- **Móvil:** header marrón con marca y hamburguesa; imagen recortada de café. Texto de entrada parcial.
- **Reutilización:** E11, C14/C15, R10; `BranchDirectory` debe poder enlazar al sitio propio de la sucursal además de dar direcciones. Datos: sucursal publicada, contacto y horario efectivo. F02/F05/F11/F12.
- **Pendiente:** menú abierto, carrusel de sedes y precisión de mapas. Directorio de locales no implica que cada local tenga identidad/páginas independientes; esa capacidad es una mejora propia de GoAdmin.

## 15 — Deux Bakery

Fuentes: [inicio](https://deuxbakery.framer.website/), [detalle de pan](https://deuxbakery.framer.website/menu/olive-ciabatta).

- **Observado:** detalle con precio/unidad, peso, preparación, textura, ingredientes y productos relacionados. Footer con navegación, newsletter y contacto; CTA de sede.
- **Móvil:** marca y hamburguesa; marco crema redondeado sobre fondo de franjas y decoración. La entrada inicial no mostró todo el contenido.
- **Reutilización:** D01/D02/D05, R11/R13, E05; `MenuItemDetail` comparte slots con producto y declara unidad/precio/ingredientes. F09/F11/F12.
- **Pendiente:** menú abierto, acción Shop y catálogo final móvil. El detalle mezcla nombre de pan e ingredientes de otra preparación; la migración/preset requiere coherencia de contenido y no debe copiar esos datos.

## 16 — Matchioo

Fuentes: [inicio](https://matchioo.framer.website/), [ancla de carta](https://matchioo.framer.website/#menu).

- **Observado:** una página con historia, bebidas, equipo, eventos de apariencia social, ubicación y FAQ. Carta con seis bebidas y control Load More. Footer con navegación a anclas, contacto y volver arriba.
- **Móvil:** fotografía vertical, bebidas e ilustraciones manuales; hamburguesa clara sobre fondo.
- **Reutilización:** R10, C05/C17/C18, D04/D05; `EventCards` y `TeamGrid`; distinguir tarjetas editoriales de un feed conectado. F09/F11.
- **Pendiente:** Load More, menú abierto, eventos interactivos y contenido expandido. El CTA Locate enlaza a un proveedor de pedidos; no usar la etiqueta visual para inferir el destino real.

## 17 — Chowk House

Fuentes: [inicio](https://exquisite-operator-855127.framer.app/), [visita](https://exquisite-operator-855127.framer.app/#visit).

- **Observado:** página narrativa, carta en filas, bar, reconocimientos, comedor privado y contacto por teléfono/correo. Footer con newsletter y enlaces de prensa/contacto.
- **Móvil:** marca centrada, fotografía con arco y texto apilado sobre verde oscuro. La fotografía mantiene marco propio en vez de recortarse como hero horizontal.
- **Reutilización:** HR09, D03, C01/C06/C15, R01/R08/R09; `PrivateDining` como servicio con acción declarada y `MediaMask`. F09/F11.
- **Pendiente:** destino real de Full Menu y otros textos sin enlace en el DOM; newsletter y reservas. No inventar una ruta secundaria ni una reserva automática donde solo se observó contacto.

## 18 — BetheWind

Fuentes: [inicio](https://bethewind.framer.website/), [solicitud](https://bethewind.framer.website/#booking).

- **Observado:** habitaciones, comodidades, experiencias y solicitud con nombre, teléfono, correo, huéspedes, entrada/salida y preferencia. El texto distingue solicitud y confirmación posterior. Footer con canales de contacto y legal.
- **Móvil:** hero con CTAs apilados; en ancla de solicitud, tarjeta crema sobre verde con canales de contacto apilados. No se capturó el formulario completo en una sola imagen.
- **Reutilización:** A01/A03/A04/A08, HR08, C13; `AvailabilityInquiry` separado de `BookingSearch` y `BookingConfirmation`. F10.
- **Pendiente:** calendario, orden de fechas, accesibilidad del formulario y backend. Nunca mostrar disponibilidad confirmada basándose solamente en una solicitud enviada.

## 19 — Mariven

Fuentes: [inicio](https://mariven.framer.website/), [suite](https://mariven.framer.website/rooms/ocean-view-king-suite).

- **Observado:** detalle con galería, área, cama, capacidad, precio desde, amenidades, políticas/check-in, FAQ y otras habitaciones. Footer conserva navegación, grupos de páginas y newsletter.
- **Móvil:** primera captura quedó en pantalla de entrada; no certifica el layout final.
- **Reutilización:** A01/A02/A03, G04, C09; `RoomDetailTemplate` con bloques editoriales y adaptador PMS para tarifa/disponibilidad. F10.
- **Pendiente:** entrada final móvil, políticas desplegadas, Book a Stay y galería. Tarifa desde no debe confundirse con precio cotizado para fechas/ocupación; mantener esa distinción en contrato e inspector.

## 20 — Tidehouse

Fuentes: [inicio](https://tidehouse.framer.website/), [gastronomía](https://tidehouse.framer.website/dining).

- **Observado:** rutas de alojamiento, rituales, dining, wellness, lugar y disponibilidad. Dining organiza la experiencia por momentos del día y necesidades dietarias, con solicitud; footer interno reducido respecto al inicio.
- **Móvil:** header pasa a varias filas, enlaces permanecen visibles y CTA ocupa el ancho; imagen del hero antes del bloque oscuro de relato.
- **Reutilización:** HR03, A04/A05/A06, C04/C15; `ServiceTimeline` y excepciones explícitas de shell por página. F05/F10/F11.
- **Pendiente:** cotización/reserva, detalles de rituales y footer móvil interno. No confundir una landing de gastronomía del hotel con un restaurante que ya tenga sitio independiente.

## 21 — Hotellia

Fuentes: [inicio](https://hotellia.framer.website/), [carta restaurante](https://hotellia.framer.website/restaurant-menu); habitación revisada previamente.

- **Observado:** hotel enlaza bar y restaurante con nombres propios; carta con categorías, descripciones y marcas dietarias. Shell de carta sigue siendo Hotellia.
- **Móvil:** portada fotográfica y marca grande; carta en filas con precio a la derecha. Footer verificado visualmente: frase, contactos, enlaces, legal y marca se apilan sobre verde.
- **Reutilización:** A05, R01/R13, F02/F03; `RelatedSites`, `MenuList` y `SiteShell` independiente por outlet. F02/F04/F05/F10/F11.
- **Pendiente:** menú expandido, alérgenos con semántica real, reserva y galería. La independencia de marca del restaurante debe agregarse en GoAdmin; esta referencia solo demuestra relación entre páginas bajo una marca.

## 22 — Karaya

Fuentes: [inicio](https://karaya.framer.website/), [villa](https://karaya.framer.website/the-villa).

- **Observado:** villa completa con capacidades, superficie, filosofía de diseño, especificaciones y recorrido por espacios; formulario de consulta. Footer incluye contacto, páginas y FAQ.
- **Móvil:** fotografía contenida con esquinas inferiores grandes; header superpuesto con marca y menú.
- **Reutilización:** A09/A03/A04/A08, HR01; `PropertyDetail` y `PropertyTour` deben declarar si se reserva inmueble completo o unidad. F10.
- **Pendiente:** menú abierto, recorrido móvil, consulta y reglas reales de capacidad. No crear habitaciones reservables por cada tarjeta de un espacio común de la villa.

## 23 — Constellare

Fuentes: [inicio](https://constellare.framer.website/), [suite](https://constellare.framer.website/rooms/vega-suite).

- **Observado:** detalle editorial largo, amenidades, preguntas y tarifa. Footer separa explorar/legal/redes/recepción e incluye check-in/out.
- **Móvil:** fotografía vertical con reseña superpuesta y relato inferior; header no quedó completo en la captura de entrada.
- **Reutilización:** H05, A02/A03, C09/C10, F02; `RoomDetailTemplate`, `ReceptionDetails` y `ReviewBadge`. F05/F10.
- **Pendiente:** cápsula móvil final, reserva y FAQ interactiva. Reseñas y políticas de la demo no son datos iniciales autorizados; cada sitio debe aportar sus fuentes y condiciones.

## 24 — Rumaya

Fuentes: [inicio](https://rumaya.framer.ai/), [gastronomía](https://rumaya.framer.ai/dining).

- **Observado:** rutas diferenciadas para suites, rooms, dining, wellness, experiencias y reuniones. Dining presenta cuatro espacios gastronómicos, narrativa por servicios y preguntas de visita. Footer reúne contacto, descubrimiento, estancia y redes.
- **Móvil:** fotografía vertical, textos editoriales en columnas pequeñas y gran titular sobre imagen; menú superior no quedó completo en esa captura.
- **Reutilización:** P03, HR04/05, A05, C04/C09; `VenueCollection` enlaza al detalle o sitio efectivo del outlet. F05/F09/F10/F11.
- **Pendiente:** menú expandido, destinos de cada Explore e identidad del detalle. No atribuir autonomía de restaurante solo por mostrar cuatro tarjetas.

## 25 — Aurelia

Fuentes: [inicio](https://aurelia-template.framer.website/), [villa con piscina](https://aurelia-template.framer.website/rooms/infinity-pool-villa).

- **Observado:** detalle con formulario de solicitud: nombre, correo, tipo, fechas, adultos y niños; área, cama, huéspedes, amenidades y otras habitaciones. Footer de contacto/redes/páginas.
- **Móvil:** marca y menú circular sobre hero; título multilineal y fotografía vertical.
- **Reutilización:** HR08, A02/A03/A08; `RoomInquiryForm` con tipo preseleccionado por contexto, límites de huéspedes y estados. F10.
- **Pendiente:** preselección y envío, correspondencia de textos/datos del detalle, menú abierto. Se observaron enlaces de contacto de muestra sin destino válido; validarlos antes de publicar en GoAdmin.

## 26 — Slice Town

Fuentes: [pizza](https://slice-town-wbs.framer.website/), [hamburguesa](https://slice-town-wbs.framer.website/home-burger#hero).

- **Observado:** dos portadas temáticas, carta con columnas de tamaño/precio, adicionales, promociones, formulario de mesa y directorio de dos sedes. CTA de pedidos a proveedor externo; footer con reserva, carta y redes.
- **Móvil:** marca, menú, producto recortado y CTA fijo de pedido; separador gráfico entre superficies.
- **Reutilización:** R01/R03/R04/R06/R07, E06/E11, D04; `MenuPriceColumns` y `AddonList` consumen variantes/precios operativos. F09/F11.
- **Pendiente:** pestañas, cambio de tamaño, reserva y pedido. Dos home dentro de un template no prueban resolución multi-outlet; GoAdmin debe conservar contexto de sucursal al navegar y comprar.

## 27 — ScanEats

Fuentes: [inicio](https://scaneats.framer.website/), [carta completa](https://scaneats.framer.website/All-menu).

- **Observado:** carta con categorías, imágenes y precios; ubicación/horarios, reserva, newsletter y footer con páginas/utilidades. Rutas de reserva, FAQ y contacto/feedback detectadas.
- **Móvil:** marco estrecho sobre fondo ilustrado, header blanco contenido con marca y menú. La captura inicial presentó un área con desplazamiento interno; no se valida como comportamiento deseado.
- **Reutilización:** P05, R02/R12, C14/C15, F01; `QrMenuLayout` con navegación rápida y tamaño táctil. F05/F11.
- **Pendiente:** filtros, scroll anidado, anclas y reserva. Preservar mayúsculas de rutas observadas; no deducir URLs por etiquetas ni convertir las acciones de demo en pedidos reales.

## 28 — Camino

Fuentes: [inicio](https://camino-template.framer.website/), [carta](https://camino-template.framer.website/menu).

- **Observado:** carta por grupos con etiquetas dietarias y selector de bebidas. Clic en Drinks mostró categorías de vino/cerveza en captura; la transición y cambio de viewport impiden certificar su layout estable. Footer móvil verificado: enlaces agrupados, marca, volver arriba y reserva fija.
- **Móvil:** tipografía muy grande; la carta exige reglas específicas para columnas y títulos, no solo encoger escritorio.
- **Reutilización:** H08, P03, R01/R03/R13, F04; `MenuTabs`, `DietaryBadges` y `BackToTop`. F05/F09/F11.
- **Pendiente:** layout estable de bebidas y navegación por teclado. La reserva conduce a OpenTable genérico; el patrón exige proveedor/sede correctos antes de habilitarlo.

## 29 — Luna Rossa

Fuentes: [inicio](https://lunarossa.framer.website/), [servicio](https://lunarossa.framer.website/service/artisan-baking).

- **Observado:** catálogo y detalles, servicios y sus detalles, reseñas, galería y artículos. Servicio narra proceso, alcance y pasos; footer incluye artículos recientes y contacto.
- **Móvil:** collage de ingredientes/pan sobre superficie cálida; header/título de entrada no quedaron completos.
- **Reutilización:** R11, C04/C11/C23, F06; `ServiceDetailTemplate` y ranura de artículos en footer. F05/F09/F11/F12.
- **Pendiente:** menú expandido, carrusel, solicitud de servicio y detalle de producto. Mantener separado contenido editorial de un servicio y capacidad operativa para contratarlo.

## 30 — Umami

Fuentes: [inicio](https://umami-template.framer.website/), [evento](https://umami-template.framer.website/event/curated-flavors-smooth-jazz-evenings).

- **Observado:** evento con fecha, tarifa de entrada, hora, duración, capacidad y contenido; formulario de mesa incorporado. Footer con horarios, redes, newsletter y legal.
- **Móvil:** menú circular, marca, fotografía, sello y borde ondulado; entrada del titular parcial.
- **Reutilización:** C17, R06/R08, D01/D05; `EventDetailTemplate` y `ReservationAction`. F09/F11.
- **Pendiente:** menú abierto, calendario y si el formulario de mesa reserva también cupo del evento. Esa relación no se puede inferir: el backend debe declarar capacidad y tipo de confirmación.

## 31 — MĒR

Fuentes: [inicio](https://mer.framer.website/), [carta](https://mer.framer.website/menu).

- **Observado:** inicio compacto tipo recibo; internas de carta, historia, eventos y reserva. Carta tiene dos niveles de navegación: servicio y subcategoría. Clic en drinks cambió platos por bebidas y cambió el texto de horario.
- **Móvil:** carta verificada con header mínimo, tres pestañas anchas, filtros que saltan de línea y filas legibles con precio; contraste crema/marrón y tipografía monoespaciada. La captura inicial de portada quedó en entrada, no se considera evidencia final.
- **Reutilización:** P04, R01/R02/R03/R09, F01; `CompactMenuLayout` y `MenuServiceTabs`. F05/F09/F11.
- **Pendiente:** subfiltros, teclado y reserva; no copiar encabezados usados como botones sin añadir semántica accesible.

## 32 — Fusion AI

Fuentes: [inicio](https://fusionai.framer.website/), [precios](https://fusionai.framer.website/pricing).

- **Observado:** planes, integración, blog/contacto/lista de espera; footer con navegación principal, accesos y legal. Clic en Yearly cambió importes de los planes: se verificó conmutación, no exactitud comercial ni cobro.
- **Móvil:** header contenido con menú, título, descripción y dos CTAs apilados; bordes luminosos y fondo oscuro.
- **Reutilización:** H05, C20/C21, C04/C09, F05; `PricingCards` con periodo y fórmula definida por el producto real. F09/F12.
- **Pendiente:** menú, plan seleccionado persistente y contratación. El CTA va a contacto; no demuestra suscripción. Es referencia de composición para servicios, no justificación para modificar facturación de GoAdmin.

## Ajustes de alcance derivados de la inspección

Estas decisiones amplían variantes/contratos existentes del catálogo; no añaden tablas ni cambian datos productivos en F00.

| Patrón / fuentes | Diferencia que debe conservarse | Componente propuesto y controles UX | Datos / acción | Fase |
|---|---|---|---|---|
| E05 — Nestria, Leafore, Arum | Paneles, tabla de atributos e ingredientes tienen estructura diferente del relato | `ProductInformationPanels`, `DetailAttributeTable`; paneles ordenables, título y columnas | Editorial validado; SKU/precio/stock desde adaptador existente | F12 |
| E09 — Elian Valen | Conjunto con opciones por cada prenda | `ProductBundleOptions`; mostrar unidades y variantes disponibles | No calcular bundles nuevos en el renderer; exigir soporte del dominio | F12 |
| R01/R03 — Slice Town | Una fila puede tener varios precios por tamaño y adicionales | `MenuPriceColumns`; encabezados/unidades, máximo de columnas, variante móvil | Variante/precio real por sucursal; adicionales según operación | F11 |
| R02/R03 — MĒR | Servicio y subcategoría son filtros distintos; horario cambia con servicio | `MenuServiceTabs`; selección inicial y estado vacío explícitos | Carta segmentada; no convertir horario editorial en disponibilidad | F11 |
| A08/R06 — BetheWind, Aurelia, Umami | Solicitud, disponibilidad, reserva y cupo de evento son acciones distintas | Inspector muestra tipo y proveedor; etiquetas coherentes con resultado | Servicios existentes; idempotencia y validación en backend según fase | F10/F11 |
| A05/E11 — Hotellia, Rumaya, Coffee GR8R | Directorio, detalle editorial y sitio independiente no equivalen | `RelatedSites`/`VenueCollection`; elegir destino y previsualizar alcance | Resolver sucursal publicada y URL efectiva, preservar contexto | F02/F05/F10/F11 |
| C11/C23/F06 — Latte, Luna Rossa | Artículo y servicio tienen detalle; footer puede contener colección | Plantillas dinámicas, fuente y límite de registros | Colección paginada/acotada; navegación completa a detalles | F05/F09/F12 |
| C15 — Bramble, MĒR | Horario por servicio, día y excepción | Inspector con filas por servicio, zona del sitio y excepciones | Mostrar desde fuente adecuada; no duplicar reglas de reserva | F09/F11 |

## Reglas para convertir referencia en una función real

1. Cada control debe tener destino, estado y capacidad verificables. Los enlaces de compra de Nestria, teléfonos/correos de muestra y CTAs a proveedores genéricos evidencian por qué no se debe copiar la función por su apariencia.
2. Las plantillas se agregan como opciones. No se reemplazan automáticamente headers, footers, rutas, textos ni secciones de los sitios actuales; la equivalencia visual del legado se valida antes de adoptar V2.
3. Los detalles dinámicos necesitan contrato propio. Un artículo, habitación, plato, producto, experiencia o evento no debe ser una copia manual de su registro operativo.
4. Móvil requiere variante declarada: paneles apilados, filtros que saltan de línea, tablas legibles, foco y teclado. No reproducir desbordamientos o transiciones parciales observados en demos.
5. Header/footer toman identidad y contexto del sitio seleccionado. Las referencias hoteleras conservan marca de hotel en internas; la autonomía total del restaurante es un requisito adicional del usuario.
6. El preview debe interceptar compras, reservas, mensajes y analítica. Las mismas acciones pueden renderizarse en modo demostración sin ejecutar operaciones de producción.

## Cobertura pendiente y siguiente evidencia necesaria

| Grupo | Cobertura conseguida | Pendiente antes de congelar fidelidad visual |
|---|---|---|
| Fuentes | 32/32 visitadas; rutas o anclas explícitas por ficha | Inventario exhaustivo de rutas de cada demo no realizado |
| Móvil | 390 × 844 inspeccionado; detalle de qué fue visible en cada ficha | Capturas estables donde hubo animaciones; 360/768/1280 y otros tamaños |
| Header | Estructura/link destinos; overlay de Qitchen abierto | Menús abiertos restantes, teclado, Escape, scroll y retorno de foco |
| Footer | Contenido/destinos leídos; Hotellia y Camino vistos en móvil | Capturas visuales de otros footers y variantes de páginas internas |
| Interacción | Qitchen overlay, Nestria especificaciones, MĒR bebidas, Fusion periodo; transición de Camino observada con límite | Carruseles, filtros, búsquedas y estados vacíos; envíos solo en implementación propia de prueba |
| Operación | Ninguna reserva, compra ni envío provocado | Integraciones, disponibilidad, pago y concurrencia se prueban en fases operativas, no sobre demos ajenas |

Prioridad de cierre visual: primero Qitchen/Hotellia/MĒR como composiciones hotel/restaurante/compacta; después familias gráficas y comercio. Los pendientes no eliminan ninguna de las 32 referencias del alcance ni autorizan declarar 105 patrones implementados. Al construir cada familia, añadir evidencia estable y resultados funcionales al expediente de su fase.
