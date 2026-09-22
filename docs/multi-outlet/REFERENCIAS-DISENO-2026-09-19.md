# Referencias visuales para sitios independientes

Revisión: 2026-09-19. Complemento del [diagnóstico de los dos proyectos](ANALISIS-BRANDING-Y-SITIOS-2026-09-19.md).

## Resultado de la comparación

Las 32 referencias apuntan a un sistema de composición, además de una biblioteca de secciones. Su variedad viene de la combinación de identidad, estructura de página, fotografía, jerarquía tipográfica, navegación y ritmo entre bloques. Aumentar el número de secciones sin resolver esas capas produciría más opciones con una apariencia demasiado similar.

Para el caso hotel/restaurante propongo dos sitios completos con personalidades distintas, administrados desde la misma organización. El hotel puede presentar sus restaurantes y enlazarlos; cada restaurante debe poder mantener su propia identidad durante todo el recorrido, incluida la carta, la reserva y el footer.

Las recomendaciones son una síntesis de los patrones observados, no diseños aprobados ni una propuesta de reproducir las plantillas literalmente.

## Cobertura y límites

Se abrieron las 32 URLs en navegador y se leyeron sus estructuras, enlaces, secciones y contenido de footer disponible en el DOM. Se inspeccionaron capturas de las 32 páginas, con distinta profundidad visual: portadas de la mayoría, páginas completas seleccionadas y algunos estados inferiores. Latte, Luna Rossa y ScanEats presentaron capturas parciales o elementos que dependían del desplazamiento/carga; sus observaciones se limitan a lo efectivamente visible y a su estructura textual.

Se profundizó en la carta y reserva de Qitchen, la reserva de Bramble, y la carta del restaurante y detalle de habitación de Hotellia. Se comprobó una muestra a 390 px: reserva de Qitchen y detalle de habitación de Hotellia. Esto no equivale a auditar todas las páginas, animaciones, accesibilidad o tamaños de pantalla de las 32 plantillas. No se enviaron formularios, reservas ni compras.

Algunas URLs no respondieron al extractor de texto web, pero sí cargaron en el navegador. No se clasificaron como sitios caídos por ese motivo. Las plantillas son fuentes visuales: los datos de ejemplo, reseñas, precios y enlaces de demostración no son requisitos funcionales del ERP.

## Matriz de las 32 referencias

La columna final expresa una recomendación para el producto. La primera columna enlaza la fuente observada.

| Referencia | Patrón observado | Aplicación al editor |
|---|---|---|
| [Qitchen](https://qitchen-template.framer.website) | Fondo oscuro, panel fotográfico grande, header flotante compacto y tarjetas de navegación laterales. Carta y reserva conservan dos paneles. | Composición de página dividida; carta editorial; navegación dentro del panel; footer mínimo. |
| [Bramble](https://bramble.framer.website) | Fotografía gastronómica a pantalla completa, marca serif grande y header con reserva, ubicación y menú. Horarios separados de bar y cocina. | Hero de marca, horarios por servicio, carta de comidas/bebidas y cierre con contacto. |
| [Scalable](https://scalable.framer.website) | Portada oscura centrada, contraste blanco/violeta, énfasis tipográfico y módulos de producto, precios e integraciones. | Familia universal de beneficios, tarjetas de distintos tamaños, pasos y planes; útil para servicios. |
| [PayGin](https://paygin.framer.website) | Fotografía inmersiva, encabezado grande, formulario compacto y dispositivos superpuestos. | Hero con capas controladas, media destacada y formulario opcional. |
| [Nestria](https://nestria-preview.framer.website) | Interiorismo, franja promocional, marca centrada sobre fotografía y tarjeta de producto sobre la escena. | Hero con llamada contextual sobre imagen; útil para destacar una suite o experiencia. |
| [Volt](https://volt-ecommerce.framer.website) | Tienda de moda con header comercial, azul/lima, letras condensadas y campañas en carrusel. | Plantilla comercial con búsqueda/carrito y promoción; identidad distinta de hotel. |
| [Elian Valen](https://elianvalen.framer.website) | Editorial de moda claro, composición asimétrica, fotografías protagonistas y enlaces discretos. | Hero editorial, grillas asimétricas y campañas con poco texto. |
| [Arum](https://arum.framer.wiki) | Marca centrada, menú mínimo, fotografía cálida, serif y producto contextual. Colecciones, narrativa y tienda física. | Tema editorial cálido, historia de marca, destacados y footer por colecciones. |
| [All Natural](https://all-natural.framer.website) | Navegación comercial sobre hero, producto protagonista, categorías, promociones, journal y tiendas. | Colecciones y campañas reutilizables; separar información editorial de catálogo operativo. |
| [Ecom](https://ecom-template.framer.ai) | Franja de campaña, hero fotográfico, tarjeta superpuesta, novedades, categorías y señales de confianza. | Campañas, listados comerciales, beneficios y footer de soporte. |
| [Leafore](https://leafore.framer.website) | Hero partido entre producto y retrato, logo centrado, tonos naturales; productos, certificaciones y artículos. | Hero dividido real, beneficios y acreditaciones verificables. |
| [Latte](https://lattetemplate.framer.website) | Crema y negro, título centrado, carta por categorías, noticias y cierre con horarios/mapa. | Plantilla sencilla de cafetería; carta legible y footer de visita. Revisión visual parcial. |
| [Riteora](https://riteora.framer.website) | Verde profundo, rosa y acento lima; letras expresivas, CTA rectangular y formas decorativas. | Tema gastronómico gráfico; tipografía y decoraciones controladas por variante. |
| [Coffee GR8R](https://coffee-gr8r.framer.website) | Marrón, crema y amarillo; título condensado, vasos recortados; productos, sucursales, reseñas y FAQ. | Hero con producto recortado, sedes y catálogo de bebidas. |
| [Deux Bakery](https://deuxbakery.framer.website) | Marca centrada, bordes ondulados, fondo a franjas, fotografía recortada y etiquetas decorativas. | Familia artesanal con separadores, fondos y sellos; no limitar la personalización al color. |
| [Matchioo](https://matchioo.framer.website) | Cielo, bebidas, escritura manuscrita y dibujos; menú, equipo y eventos de comunidad. | Hero de campaña con ilustraciones, equipo y agenda social. |
| [Chowk House](https://exquisite-operator-855127.framer.app) | Verde/crema, fotografías en arco, historia pausada, carta en filas, bar, reconocimientos y eventos privados. | Restaurante de autor con narrativa, máscara de imagen y carta editorial. |
| [BetheWind](https://bethewind.framer.website) | Naturaleza, crema/verde, serif grande, habitaciones y experiencias; solicitud de disponibilidad. | Hospedaje cercano; separar consulta de disponibilidad y reserva confirmada. |
| [Mariven](https://mariven.framer.website) | Hotel costero, hero inmersivo con logo centrado, habitaciones, servicios, eventos y journal. | Plantilla hotelera con colección de habitaciones y experiencias. |
| [Tidehouse](https://tidehouse.framer.website) | Hero dividido, verde casi negro, crema y lima; habitaciones, rituales y notas editoriales. | Hotel contemporáneo; alternancia de superficies, experiencias y navegación editorial. |
| [Hotellia](https://hotellia.framer.website) | Fotografía completa y marca enorme; habitaciones, bar, restaurante, ofertas y galería. | Referencia directa para presentar negocios dentro del hotel; permitir después identidad propia por negocio. |
| [Karaya](https://karaya.framer.website) | Fotografía contenida con esquinas grandes, título sans amplio, villa, espacios y experiencias. | Alojamiento completo; distinguir reserva de villa y reserva por habitación. |
| [Constellare](https://constellare.framer.website) | Header flotante en cápsula, fotografía interior, marca serif de gran escala y habitaciones. | Header flotante reutilizable; jerarquía editorial y recepción en footer. |
| [Rumaya](https://rumaya.framer.ai) | Header mínimo con marca centrada, tipografía de alto contraste; suites, dining, wellness y encuentros. | Hotel editorial con páginas de experiencias y distintas categorías de espacios. |
| [Aurelia](https://aurelia-template.framer.website) | Hero fotográfico, serif clara y formulario horizontal de solicitud; habitaciones, spa y gastronomía. | Hero con búsqueda/solicitud y campos definidos por capacidad real. |
| [Slice Town](https://slice-town-wbs.framer.website) | Naranja, botones con contorno/sombra, pizza recortada, ofertas, carta y ubicaciones. | Restaurante informal; variantes de producto, promociones y reserva por sede. |
| [ScanEats](https://scaneats.framer.website) | Columna estrecha sobre fondo ilustrado, carta, precios, horarios y acción de menú. | Plantilla de carta digital para QR, independiente de una portada de presentación. Revisión visual parcial. |
| [Camino](https://camino-template.framer.website) | Verde/crema/dorado, nombre serif enorme, imágenes asimétricas, chef, carta y eventos. | Restaurante de autor; portada editorial y reserva visible. |
| [Luna Rossa](https://lunarossa.framer.website) | Panadería con tonos cálidos, header contenido, productos, proceso y servicios; footer con artículos y mapa. | Servicios gastronómicos y proceso de elaboración. Revisión visual parcial. |
| [Umami](https://umami-template.framer.website) | Fotografía gastronómica, rojo/crema, título expresivo, sellos y bordes ondulados; carta y eventos. | Restaurante informal con header mínimo, platos destacados y agenda. |
| [MĒR](https://mer.framer.website) | Página como recibo sobre fotografía desenfocada, tipografía monoespaciada y opciones desplegables. | Composición compacta de página, carta/horarios/reserva; una alternativa deliberada, no un tema genérico. |
| [Fusion AI](https://fusionai.framer.website) | Oscuro con acentos luminosos, header contenido, beneficios, pasos e integraciones. | Familia de servicios digitales y tarjetas; baja prioridad para hotel/restaurante. |

## Qué revela la comparación con el código actual

### La estructura completa importa tanto como cada sección

Hay al menos cuatro composiciones distintas que conviene modelar: documento vertical, panel visual más contenido, página editorial con grilla y carta compacta. Una variante de hero no resuelve por sí sola las otras tres. En Qitchen, por ejemplo, la imagen y la navegación pertenecen al marco de la página interna; la carta ocupa el otro panel. En MĒR, el contenedor con aspecto de recibo es la estructura principal.

Propuesta: añadir una composición de página con ranuras limitadas y reglas responsive, manteniendo la lista actual de secciones dentro de la ranura de contenido. No requiere ofrecer posicionamiento libre de cada elemento ni un constructor recursivo sin límites.

### El header necesita composición, comportamiento y contenido separados

Ya existen en el sitio público `HeaderClassic`, `HeaderCentered`, `HeaderSplit`, `HeaderMinimal` y `HeaderMega`, además de cuatro familias móviles. Son una base reutilizable, pero el nombre de una variante no demuestra que reproduzca los patrones observados.

| Eje | Opciones a representar |
|---|---|
| Composición | Logo izquierdo, logo centrado, enlaces a ambos lados, mínimo, cápsula flotante |
| Posición | En flujo, sobre hero, fijo, contenido dentro de panel |
| Estado | Fondo/contraste inicial, al desplazarse, con menú abierto y en páginas internas |
| Contenido | Logo claro/oscuro, menú asignado, CTA, idioma, contacto y herramientas comerciales opcionales |
| Móvil | Orden, menú accesible, visibilidad del CTA y altura propia |

No todas las combinaciones deben permitirse: cada composición debe declarar sus opciones compatibles. «Split» de navegación no debe confundirse con una página dividida como Qitchen.

### El footer también necesita familias con identidad

El footer actual dispone de columnas, menús, redes, horarios y opciones móviles. Conviene conservar esas fuentes y ampliar la composición con ranuras ordenables:

| Familia propuesta | Elementos y uso |
|---|---|
| Mínimo | Marca/legal/redes; cartas y páginas compactas |
| Hospitalidad | Dirección, recepción, check-in/out, contacto, navegación y reserva |
| Gastronomía | Horarios por servicio, carta, reserva, ubicación y redes |
| Editorial | Marca grande, frase breve, navegación reducida y CTA |
| Comercio | Colecciones, soporte, políticas, newsletter y medios de pago cuando correspondan |

Header y footer son partes del sitio y se editan desde su contexto. Una página puede seleccionar una excepción explícita, como footer mínimo en reserva. Esa excepción debe verse en el editor y en la vista previa.

### La fotografía y tipografía requieren controles reales

El nivel visual depende de proporción, recorte y espacio, además del contenido de la imagen. Se necesitan punto focal y recorte por dispositivo, proporciones predefinidas, superposición para contraste, imagen/video alternativo y máscaras limitadas. Las fotografías de las plantillas no se convierten automáticamente en recursos autorizados para los sitios de los clientes.

Para títulos: familia/peso, escala fluida, ancho máximo, interlineado, espaciado y énfasis de palabras mediante texto estructurado. Para secciones: ancho, espaciado vertical, superficie, borde y separación. No usar HTML/CSS arbitrario para solucionar cada composición.

## Catálogo propuesto: ampliar por capacidades

La clasificación se apoya en el diagnóstico del código; «base existente» no significa equivalencia visual ni funcionamiento completo.

| Capacidad | Estado de partida | Trabajo recomendado |
|---|---|---|
| Hero vertical, historia, FAQ, reseñas, galería, contacto | Hay familias existentes | Aplicar tokens y crear variantes editoriales coherentes |
| Header centrado, mínimo, clásico y navegación móvil | Componentes existentes | Resolver identidad/enlaces y añadir estados/composiciones que falten |
| Footer por columnas y horarios | Base existente | Alcance por sitio, ranuras y familias visuales |
| Página de dos paneles o carta compacta | La lista vertical no cubre la composición completa | Nueva composición de página con adaptación móvil |
| Carta gastronómica | Familia existente; `MenuPreviewTabs` no implementa pestañas reales | Lista editorial, anclas y pestañas como comportamientos distintos |
| Reserva de habitación/mesa | CTA y formularios visuales parciales | Conectar operaciones reales, sucursal, validación y estados |
| Detalle de habitación | Ruta pública con estructura fija | Plantilla editable compatible con datos del PMS |
| Negocios del hotel | Contexto outlet disponible, independencia incompleta | Colección de sitios relacionados con enlaces conscientes de dominio/ruta |
| Grillas editoriales, collage, fotografías en arco, separadores | Requieren composiciones y opciones específicas | Variantes limitadas y reutilizables, no tipos nuevos para cada adorno |
| Eventos, experiencias y menús por servicio | Requieren precisar fuente y capacidad habilitada | Bloques de presentación más adaptador de datos, sin duplicar lógica del ERP |
| Movimiento | No se auditó de extremo a extremo | Revelado discreto, controles y movimiento reducido; prioridad después de estructura |

Un plato con imagen, nombre, descripción y precio puede presentarse en fila, tarjeta o destacado. No necesita tres copias del catálogo. Lo mismo aplica a una habitación. El precio y la disponibilidad deben proceder de la fuente operativa correspondiente, y el contenido editorial puede complementar esa información.

Las decoraciones, tipografía, espaciado y estados son parte del sistema visual. Añadir un nuevo tipo de sección por cada combinación produciría un catálogo difícil de mantener.

## Propuesta concreta de primeras plantillas

### Hotel editorial

Referencias principales: Hotellia para la relación hotel/gastronomía, Mariven para el recorrido de habitaciones y servicios, y Tidehouse para una alternativa contemporánea. Son criterios de dirección visual; no una mezcla literal de sus páginas.

Páginas: inicio, habitaciones, detalle de habitación, experiencias, detalle de experiencia, restaurantes del hotel, galería, ubicación/contacto y reserva. Cada página conserva la identidad del hotel. Un restaurante relacionado puede enlazar a su sitio propio.

Composición inicial: hero fotográfico, propuesta breve, habitaciones, experiencias, restaurantes relacionados, galería, reseñas, ubicación y CTA final. No es obligatorio mostrar todo: el preset ofrece una secuencia inicial editable.

### Restaurante de autor

Referencias principales: Qitchen para continuidad entre carta/reserva y estructura dividida; Camino y Chowk House para narrativa y jerarquía editorial. Bramble aporta horarios distintos para bar y cocina.

Páginas: inicio, carta, nuestra historia/chef, eventos privados, ubicación/horarios y reserva. Marca, menú, contacto y footer propios. Enlace discreto y configurable al hotel, sin imponer su identidad visual.

Composición inicial: hero, historia, platos seleccionados, carta, ambiente, chef o equipo, eventos y reserva. Elegir entre documento vertical y panel dividido; ambos reutilizan los datos de la carta.

### Cafetería o panadería gráfica

Segunda ampliación, después de validar hotel y restaurante. Deux, Coffee GR8R y Matchioo aportan tipografía expresiva, fotografía recortada, ilustración, comunidad y sedes. Esta familia demuestra que el motor sirve para una identidad distinta, sin forzar a todos los restaurantes a parecer establecimientos de lujo.

La carta QR puede ser una plantilla de página adicional del mismo sitio. Sus necesidades de lectura rápida, categorías y precios difieren de las de una portada de marca.

## Lo que debe verse en el editor

1. Selector persistente de sitio: hotel, restaurante A o restaurante B, incluidos borradores.
2. Identidad y tema con valores propios, heredados y restablecimiento explícito.
3. Header y footer con miniaturas reales y vista previa sobre la página seleccionada.
4. Páginas con tipo, composición, plantilla y estado; separar página informativa, detalle dinámico y flujo operativo.
5. Biblioteca agrupada por propósito: presentar, mostrar colecciones, contar historia, generar confianza y convertir.
6. Sección seleccionada con variante, contenido, fuente de datos y diseño; ocultar controles que esa variante no utiliza.
7. Guardar preset con contenido y estilo; distinguir una copia de una sección compartida vinculada.
8. Previsualizar escritorio y móvil con el contexto y borrador completos, y publicar de forma consistente.

No basta con que el usuario pueda escoger «100 secciones». Debe entender qué cambia, dónde aparece y a cuáles páginas o sitios afecta.

## Verificación visual y funcional propuesta

La muestra móvil de Qitchen transforma los dos paneles en una secuencia vertical y los campos del formulario en una columna. Hotellia ajusta fotografía y título de habitación al ancho móvil. Estas son decisiones de composición que deben formar parte de cada variante, no depender de encoger el escritorio.

Para las futuras plantillas se propone revisar 360, 390, 768, 1280 y 1440 px; textos largos en español; sitio sin logo, sin fotografía o sin datos; menú abierto; navegación por teclado; contraste y movimiento reducido. Las reservas requieren estados de carga, error, éxito y falta de disponibilidad, además de comprobar la sucursal efectiva. Una consulta enviada no debe presentarse como reserva confirmada.

La primera entrega visual debe probar dos identidades completas y al menos portada, listado/carta, detalle y reserva en cada sitio. Solo después conviene multiplicar presets. El [diagnóstico técnico](ANALISIS-BRANDING-Y-SITIOS-2026-09-19.md) detalla los bloqueos que deben corregirse antes de prometer esa independencia.
