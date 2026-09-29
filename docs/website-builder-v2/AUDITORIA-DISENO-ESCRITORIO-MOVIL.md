# Auditoría previa al diseño: escritorio, móvil y operación

Fecha de revisión: 2026-09-22. Estado: evidencia y decisiones de diseño; **no certifica implementación, publicación ni pruebas operativas completas**.

Esta revisión corrige el punto de partida de Figma: el editor debe usar el manual de GO Admin y las páginas públicas deben conservar la identidad de cada organización. Las propuestas anteriores que redujeron controles, cambiaron arbitrariamente la marca o simplificaron las secciones existentes no son la referencia aprobada.

## Fuentes y límites

- Plan maestro, ADR-001/002, fases 00–13, catálogo, matriz UI/backend/BD y mapeo de los 65 tipos existentes.
- Código local del ERP y de `goadmin-websites`: editor, renderers, estilos responsive, navegación, formularios, endpoints y servicios relacionados.
- Manual, variables y componentes originales del archivo GO Admin en Figma. Se reutilizan mediante instancias; las propuestas se construyen en la página del editor.
- Los tres sitios públicos indicados por el usuario: dos comercios y un restaurante. Revisión visual de escritorio y navegación móvil a 390 px; no se enviaron pedidos, reservas, pagos ni formularios.
- Las 32 referencias: revisión de portadas en navegador y revisión adicional de capturas móviles B2. Se observaron además muestras de menús, productos, habitaciones y footers. **No se han probado todas las rutas ni todas las interacciones de las 32 referencias.** Los límites originales de B2 siguen vigentes.
- Supabase mediante MCP, exclusivamente en lectura: esquema, políticas, permisos, funciones y agregados de configuración. No se copiaron registros privados de clientes a este documento.

Expedientes de evidencia: [matriz de referencias](MATRIZ-32-REFERENCIAS.md), [B2 general](F00-COBERTURA-VISUAL-AMPLIADA.md), [B2 hotel/restaurante](F00-B2-HOTEL-Y-RESTAURANTE.md), [B2 comercio](F00-B2-COMERCIO-ADICIONAL.md), [esquema y recuperación](F00-ESQUEMA-Y-RECUPERACION.md).

Las capturas de B2 están en directorios locales temporales `goadmin-f00-b2-agent-browser`, `goadmin-f00-b2-hotel` y `goadmin-f00-b2-root-commerce`. Son evidencia de la observación, no recursos de un preset distribuible. Antes de una entrega definitiva, conservar la evidencia necesaria fuera de una carpeta temporal.

## Dos sistemas visuales y dos usos de móvil

| Superficie | Fuente visual | Regla |
|---|---|---|
| Editor de GO Admin | Manual y componentes originales de GO Admin | Inter, colores semánticos, tamaños, radios, elevaciones y estados del manual. No reconstruir botones como rectángulos independientes |
| Sitio público principal | Identidad y configuración de ese sitio | Conservar contenido y capacidad existentes; ampliar composiciones sin imponer marca GO Admin |
| Sitio de un outlet | Identidad propia o herencia explícita | Puede usar otro fondo, tipografía, header, footer, navegación, portada y páginas |
| Editor usado desde un teléfono | Componentes móviles GO Admin | Flujo de pantallas/paneles, objetivos táctiles y acciones accesibles; no encoger tres columnas |
| Vista previa móvil del sitio | Renderer público a ancho lógico móvil | El zoom visual no altera el breakpoint ni sustituye la adaptación responsive |

El manual observado define Inter 400/500/600/700; cuerpo 14/20, texto pequeño 13/18 y etiqueta 12/16. Botones md de 40 px, sm de 32 px y lg de 48 px. Colores: identidad `brand/primary`, acción `brand/action`, tinta `brand/deep`, superficie tenue `brand/tint` y colores de texto/superficie correspondientes. En móvil se usan controles de 48 px o áreas táctiles envolventes suficientes sin modificar los maestros originales.

La interfaz actual del editor conserva funciones y vocabulario útiles: página, contexto global/sucursal, dispositivos, tema, SEO, menú, footer, layout, búsqueda de secciones, visibilidad, orden y agregar sección. La propuesta mantiene esas capacidades y mejora jerarquía y espacio disponible.

## Hallazgos que condicionan el diseño

Las rutas sin prefijo pertenecen al ERP. Las marcadas `websites:` pertenecen al repositorio público de sitios.

| ID | Evidencia actual | Consecuencia para UI y desarrollo |
|---|---|---|
| A01 | `src/app/organizacion/branding/editor/[pageId]/page.tsx`, `handleSave`: actualiza secciones, página, settings, tema y navegación publicados mediante varias operaciones | «Guardar borrador» no puede ser solamente cambiar la etiqueta de Guardar. Implementar F03 antes de habilitar el nuevo comportamiento |
| A02 | En la misma página, agregar, duplicar y eliminar sección llaman al servicio antes del guardado general | Todas esas acciones deben pasar al documento local/borrador privado en V2; el público conserva su revisión anterior |
| A03 | `websitePageBuilderService.saveDraft` escribe `draft_content`; `publishPage` usa operaciones secuenciales y el snapshot está centrado en secciones | F03 debe incluir tema, shell, páginas, SEO, menús y recursos, control de versión y publicación atómica. El historial actual no acredita recuperación completa de un sitio |
| A04 | Se observaron políticas SELECT permisivas y permisos públicos sobre tablas legacy del sitio | Guardar contenido no publicado en una columna existente no garantiza privacidad. Verificar aislamiento y persistencia privada antes de ofrecer preview compartible |
| A05 | Agregados: 84 configuraciones, todas con menú móvil `drawer`, breakpoint 768 y footer `accordion`; 0 configuraciones y páginas de outlet en la consulta; 0 páginas con borrador activo | La estructura de código permite más posibilidades que la muestra activa. Diseñar pruebas de outlet explícitas: esta muestra no certifica independencia real entre hotel y restaurante |
| A06 | `websiteMenuGroupService.ts`: grupos e ítems por organización, sin alcance de sitio/outlet en su contrato actual | V2 resuelve navegación dentro del documento del sitio, conforme ADR-002. No reutilizar silenciosamente el menú global al editar un outlet |
| A07 | `EditorPreview.tsx`: cuatro anchos de preview; envío `goadmin:preview` centrado en secciones | F07 debe transmitir el documento completo con secuencia, ACK, resincronización y contexto autorizado. Las acciones de compra/reserva en preview se simulan |
| A08 | `EditorSidebar.tsx` y layout del editor: apilado responsive, sin recorrido móvil equivalente a árbol → inspector → preview | Crear un flujo móvil propio con retorno al contexto, panel de edición y acciones visibles; conservar estado al alternar |
| A09 | `websites:components/site/SiteHeader.tsx` admite breakpoint configurable; componentes móviles incluyen `md:hidden` | Unificar breakpoint y reglas CSS. La muestra usa 768; el posible desajuste con otros valores es un hallazgo estático, no un fallo reproducido en un cliente |
| A10 | `websites:lib/sectionStyle.ts`, `resolveResponsive`: cuando falta el valor activo prioriza desktop antes de tablet, incluso para móvil | Acordar y probar la cascada F04. El inspector debe mostrar de dónde viene el valor; no presentar una herencia que el renderer no calcula |
| A11 | `websites:components/sections/products/ProductsGrid.tsx`: `mobile_layout` figura en el tipo, pero la grilla renderizada usa clases fijas | El selector grid/lista/carrusel móvil requiere implementación real. No marcar ese control como disponible por existir una propiedad TypeScript |
| A12 | `websites:components/sections/newsletter/NewsletterSimple.tsx`: botón sin envío; newsletter de footer cancela submit | Mostrar integración requerida en el editor y bloquear la publicación de un formulario sin destino funcional, según C12 |
| A13 | `websites:components/sections/restaurant/MenuPreviewTabs.tsx`: título `truncate`, descripción `line-clamp-1`, impresión directa de `product.description` | La carta móvil observada pierde nombres y presenta HTML literal en algunas descripciones. Definir texto breve saneado, título multilínea y separación de precio sin recortar información esencial |
| A14 | `websites:lib/outlet/theme-merge.ts`: merge de valores no nulos; conserva falsy | No confundir `0`, `false` o cadena vacía con heredar. El contrato V2 debe distinguir heredar/definir/vaciar |
| A15 | `buildButtonStyle` existe como helper; no se encontró adopción general en los renderers inspeccionados | Cambiar el botón global no actualiza hoy todas las acciones. Inventariar consumidores y conectar tokens antes de prometer propagación universal |
| A16 | `websites:app/api/restaurant-reservations/route.ts` toma organización/sucursal del body y llama una RPC con cliente privilegiado cuando existe | Revisar resolución de tenant desde dominio/contexto autorizado y pertenencia de sucursal antes de conectar el nuevo selector de outlet. No se hicieron escrituras para probar este riesgo |

Estos hallazgos se documentan sin modificar código operativo ni BD. Los que afectan comportamiento son requisitos de implementación y verificación, no soluciones aportadas por un frame de Figma.

## Lo que debe conservarse de los sitios existentes

| Sitio observado | Mantener | Mejorar de forma verificable |
|---|---|---|
| Tienda de calzado | Identidad, búsqueda prominente, carrito/cuenta, franja promocional, campañas y fotos propias; categorías y colecciones existentes | Controles coherentes, categorías configurables, ofertas con vigencia real, títulos completos, filtros accesibles y opciones de tarjeta |
| Tienda de hogar | Identidad, fotografías y catálogo actual, categorías visuales, variantes desktop/móvil de campaña | Legibilidad de categorías, espacio y proporciones, composiciones comerciales/editoriales alternativas |
| Restaurante | Identidad, carta, categorías, precios operativos, fotos, enlaces de pedido/reserva y horarios reales | Carta móvil legible, menos huecos, navegación por categorías, descripciones limpias, variantes con foto/lista/pestañas y acciones con destino correcto |

Se observó uso de imágenes específicas de móvil en campañas de los sitios existentes. Cada slide mantiene imagen de escritorio, imagen móvil opcional, punto focal, alt, contraste, destino y reglas de visibilidad. No reemplazar esa capacidad por un recorte automático obligatorio.

El footer móvil actual ya usa grupos plegables. Debe conservar sus destinos reales y ofrecer variantes apilada/compacta/accordion, con controles y orden legibles. Las acciones flotantes no deben cubrir enlaces, formularios ni la navegación.

## Decisiones responsive por familia

Anchos de revisión visual: 1440/1600 escritorio y 390 móvil; comprobar además 360, 375, 768 y 1024 en implementación. Son tamaños de validación, no nuevos breakpoints arbitrarios. Portátil/tablet siguen disponibles en el editor actual.

| Familia | Escritorio | Móvil | Estados necesarios |
|---|---|---|---|
| Editor | Árbol, lienzo amplio e inspector contextual plegable; sitio/página inequívocos | Árbol, preview e inspector como vistas alternables; panel para cambiar sitio/página; guardar sin perder contexto | Cambios locales, guardando, guardado, error, conflicto, cambio de sitio |
| Header comercial | Búsqueda, acciones, categorías y enlaces/mega menú | Logo/acciones y búsqueda adaptada; drawer, fullscreen, sheet o tabs declarados | Menú abierto/cerrado, submenú, búsqueda, foco y teclado |
| Header editorial/hotel | Marca centrada/dividida/cápsula/superpuesta | Jerarquía simplificada con CTA útil y navegación táctil | Fondo al hacer scroll, contraste sobre foto, apertura/cierre |
| Mega menú | Columnas, títulos, imágenes y destinos tipados | Jerarquía plegable o navegación por niveles | Retorno, ruta actual, ítem sin destino, destino no disponible |
| Hero | Ancho completo/contenido/dividido/collage/carrusel | Imagen y foco propios, reordenar slots, título fluido y CTA alcanzable | Vacío, imagen ausente, pausa de carrusel, reducción de movimiento |
| Productos | Grilla/carrusel/editorial; filtros laterales o superiores | 1–2 columnas, fila o carrusel según variante; filtros en panel | Cargando, sin resultados, agotado, variantes y precio vigente |
| Categorías | Círculos, tarjetas, iconos, collage o lista | Lista, 2 columnas o carrusel; nombre legible y enlace completo | Sin imagen, nombre largo, subcategorías |
| Carta | Lista editorial, tarjetas, categorías por anclas/pestañas | Categorías navegables; título de varias líneas y precio separado | Vacío, sin disponibilidad, alérgenos solo cuando hay datos |
| Habitaciones | Tarjetas, filas editoriales y destacado | Foto + información + acción en orden de lectura | Capacidad, fechas faltantes, sin disponibilidad, tarifa y condiciones |
| Reserva/consulta | Formulario lateral o barra de búsqueda real | Campos apilados; selector de fechas/ocupación; resumen claro | Validación, procesando, sin cupo, solicitud recibida o confirmación real |
| Footer | Columnas, contacto, marca, legal y newsletter si está conectada | Accordion/apilado/compacto; lectura y toque suficientes | Grupos abiertos/cerrados, enlaces y estado de formulario |
| Páginas con sidebar | Índice, filtros o carta lateral | Panel desplegable, pestañas o botón de filtros; no comprimir columnas | Contexto activo y restauración del scroll/filtro |
| Galería/detalle | Grilla, mosaico, imagen principal y miniaturas | Swipe con alternativa por botones, contador y zoom/modal accesible | Imagen fallida, cierre, foco y texto alternativo |

No basta con duplicar un frame y cambiar su ancho: cada par tiene composición, orden, densidad, navegación y estados explícitos. Ocultar una sección en móvil conserva su contenido en el árbol y permite recuperarla.

## Revisión móvil de las 32 referencias

Los nombres siguientes son referencias de diseño públicas, no organizaciones clientes. Los números corresponden a la matriz original. La columna de decisión indica qué recoger; no declara el patrón construido.

| # | Referencia | Observación móvil y decisión |
|---|---|---|
| 01 | Qitchen | Menú de pantalla completa y paneles con borde; convertir layout dividido en bloques apilados sin perder acceso a carta/reserva |
| 02 | Bramble | Fotografía protagonista, marca grande y CTA de reserva; controlar contraste y continuidad del texto |
| 03 | Scalable | Titular/CTA centrados, logos y demo debajo; galería horizontal con alternativa de navegación |
| 04 | PayGin | Fondo inmersivo, formulario compacto y media superpuesta; sustituir la acción por una capacidad real del negocio |
| 05 | Nestria | Hero editorial con producto contextual; simplificar overlay y permitir títulos de producto legibles |
| 06 | Volt | Cabecera comercial y campaña de color fuerte; imagen móvil independiente y utilidades sin saturación |
| 07 | Elian Valen | Selectores de talla/cantidad y FAQ de producto; conservar operación y jerarquía del detalle |
| 08 | Arum | Marca centrada, portada fotográfica y tarjeta de producto; superposición configurable con contraste |
| 09 | All Natural | Galería primero, datos y variantes después; indicadores táctiles y estados de producto |
| 10 | Ecom | Catálogo de una columna y tarjetas grandes; selector de densidad como opción real |
| 11 | Leafore | Foto/fondo, título y CTA apilados; footer editorial con grupos y formulario condicionado a integración |
| 12 | Latte | Tipografía protagonista y media debajo; carrusel con recortes y espacio ajustados al teléfono |
| 13 | Riteora | Tipografía expresiva, color y bloques amplios; evitar que los espacios decorativos retrasen la carta |
| 14 | Coffee GR8R | Producto recortado sobre fondo sólido; controlar altura y preservar acción/contenido en móvil |
| 15 | Deux Bakery | Panel sobre fondo con patrón y producto recortado; decoración separada de contenido editable |
| 16 | Matchioo | Foto inmersiva y dibujos; posición responsive de adornos sin interferir con navegación |
| 17 | Chowk House | Imagen en arco y relato apilado; máscara, borde y espacio como opciones de decoración |
| 18 | BetheWind | Portada con CTA de disponibilidad; botones apilados y texto legible sobre foto |
| 19 | Mariven | Marca centrada y título sobre imagen; punto focal móvil y reserva/habitaciones accesibles |
| 20 | Tidehouse | Navegación visible, imagen seguida de texto; variante apilada de hero dividido |
| 21 | Hotellia | Fotografía con marca grande y footer editorial; detalle y FAQ continúan debajo |
| 22 | Karaya | Hero contenido con radios y acciones apiladas; geometría y recorte propios en móvil |
| 23 | Constellare | Prueba social sobre foto y marca; no instalar cifras/reseñas de ejemplo como datos reales |
| 24 | Rumaya | Marca y acciones mínimas sobre imagen; tipografía editorial con orden móvil explícito |
| 25 | Aurelia | Formulario largo apilado en portada/detalle; diseñar búsqueda/solicitud según servicio real, no imitar confirmación |
| 26 | Slice Town | Producto recortado, color y relato; CTA de pedido con destino y capacidad comprobables |
| 27 | ScanEats | Categorías visibles y platos en dos columnas; carta QR con estados y contexto de outlet |
| 28 | Camino | Identidad editorial y CTA inferior; no cubrir contenido ni safe area con la acción fija |
| 29 | Luna Rossa | Header contenido y collage; reorganizar texto/media en vez de reducir la composición completa |
| 30 | Umami | Foto, sello y titular de alto contraste; sellos/reseñas solo con contenido verificable |
| 31 | MĒR | Página tipo recibo, categorías y precios en filas; plantilla compacta distinta de una grilla de cards |
| 32 | Fusion AI | Header en cápsula, titular y CTA apilados; decoraciones independientes de la acción de servicios |

En las capturas hay widgets promocionales de las plantillas, animaciones parcialmente asentadas y algunos footers incompletos. No reproducir esos widgets ni convertir esas limitaciones en decisiones del producto. Revisar la ficha de cada referencia antes de cerrar su patrón.

## Datos y acciones: qué puede controlar el diseño

| Capacidad | Fuente/contrato observado | Editable en diseño | Condición funcional |
|---|---|---|---|
| Productos/ofertas | `products`, `product_prices`, `product_images`, categorías y stock por sucursal | Forma, densidad, filtros, estilo de card/botón, selección editorial | Precio vigente y stock provienen de operación; no del texto de Figma o preset |
| Carta | Catálogo y categorías; `MenuPreviewTabs` actual | Lista/cards/anclas/pestañas, miniatura, descripción y jerarquía | Las pestañas deben filtrar; no deducir alérgenos ni disponibilidad por fotografía |
| Contacto | `/api/contact` y RPC `web_capture_lead` | Campos autorizados, presentación y mensaje coherente | Resolver organización en servidor y mostrar resultado real |
| Mesas | `/api/restaurant-reservations`, RPC `create_restaurant_reservation`, `restaurant_reservations` | Formulario y estados por resultado | Validar contexto; distinguir solicitud de confirmación según respuesta/configuración |
| Alojamiento | `space_types`, `spaces`, `reservations`, servicios PMS | Listado, galería, ocupación, fechas y composición | Disponibilidad viva y reserva del servicio existente; no congelarlas en snapshot |
| Servicios | `organization_services`, endpoints de citas/cotización y `calendar_events`/oportunidades | Presentación, filtros, consulta, agenda cuando exista | No marcar cita pendiente como confirmada ni consulta como compra |
| Gimnasio | Renderers existentes de planes, horarios y entrenadores | Presentación y fuentes declaradas | CTA genérico a checkout no acredita compra de membresía conectada; validar adaptador del módulo |
| Transporte | Renderers `TripSearchForm`, rutas, flota y `BookingTransportBanner` | Búsqueda, tarjetas y navegación | Reutilizar servicio de viajes y contexto; la presentación de un formulario no prueba reserva |
| Parqueadero | Renderers de zonas, disponibilidad, tarifas y planes | Grilla, resumen y planes | Disponibilidad viva; CTA genérico a checkout requiere comprobar producto/plan operativo |
| Newsletter | Sección/footer visuales sin envío en los puntos inspeccionados | Diseño y campos previstos | Integración pendiente; no mostrar un éxito ficticio ni publicar formulario desconectado |

Los tres últimos giros conservan sus componentes existentes. La integración completa de cada acción operativa requiere su prueba específica antes de declarar un preset funcional. No se valida una venta/reserva real desde Figma ni desde el preview de edición.

## Personalización compartida y excepciones

1. Tokens del sitio: color semántico, tipografía, espaciado, radio, borde, sombra, tamaños y estados de botones/controles.
2. Estilos reutilizables: botón primario/secundario/enlace, card, campo, título, superficie y contenido enriquecido. Una modificación se propaga a los elementos vinculados de ese sitio.
3. Excepción de página/sección/bloque: origen del valor visible, acción «Personalizar aquí» y «Restablecer herencia». Cambiar una excepción no redefine el maestro.
4. Responsive: cada propiedad soportada indica alcance escritorio/tablet/móvil y valor heredado. Las capacidades permitidas proceden del contrato del componente.
5. Outlet: selección explícita entre heredar y personalizar. No propagar cambios a otros sitios salvo edición explícita de una fuente compartida con alcance comprensible.

Ejemplo: cambiar el radio del botón primario del restaurante actualiza sus acciones vinculadas. El hotel mantiene su propio tema. Un botón de campaña con excepción local conserva esa excepción y puede volver a heredar. Los botones conservan acciones/validación de negocio aunque cambie su aspecto.

No crear una variante por cada color. Separar composición, contenido, fuente de datos, estado, tema y decoración evita una biblioteca inmanejable y mantiene opciones realmente distintas.

## Estructura de Figma y cobertura de entrega

Archivo GO Admin: editor en su página específica, usando `01 Sistema` y `02 Componentes` originales. Los componentes de montaje creados para el editor no reemplazan sus maestros.

Archivo de sitios: `01 Sistema`, `02 Componentes`, **`03 Secciones`**, `04 Tiendas`, `05 Restaurantes`, `06 Hoteles`, `07 Servicios`, `08 Gimnasios`, `09 Transporte`, `10 Parqueaderos`, `11 Plantillas` y cobertura/documentación. La numeración incorpora la página independiente de secciones solicitada.

- Componentes: elementos reutilizables y sus estados/propiedades, independientes de la marca GO Admin.
- Secciones: composiciones completas con par escritorio/móvil, fuente y controles; headers y footers con estados de navegación.
- Giros: páginas completas que combinan instancias de esas secciones; diferencias estructurales, no solo recoloración.
- Plantillas: inicio, historia, contacto, carta, reserva, habitación, producto, categoría, legal, campañas y demás T01–T20 del catálogo.
- Cobertura: referencia → patrón → componente/sección → par de frames → contrato/acción → evidencia de QA. «Diseñado», «implementado» y «verificado» son estados diferentes.

El [mapeo legacy](MAPEO-TIPOS-LEGACY.md) cubre 65 tipos: 28 se conservan, 18 se amplían y 19 se fusionan mediante aliases compatibles. **Catorce son bloques de detalle de producto/categoría**, no catorce nuevas secciones universales. Ningún contenido guardado se elimina para simplificar la biblioteca.

## Puerta antes de diseñar y antes de cerrar

Antes de cada familia: consultar componente actual, manual aplicable, referencia desktop/móvil, datos/acción y límites. Se puede diseñar una capacidad futura si queda identificada como propuesta y trazada a su implementación pendiente. No convertir una propiedad sin renderer o un endpoint sin prueba en una capacidad terminada.

Antes de cerrar el diseño de una familia:

- Par escritorio/móvil visible y revisado a escala legible; orden, desbordamientos, controles y texto largo comprobados.
- Instancias, variables, auto layout y propiedades comprobables; imágenes editables y recursos autorizados.
- Estados de interacción y prototipo cuando corresponda; foco/teclado y objetivos táctiles especificados.
- Contrato de datos y destino de acción trazados; estados vacíos/error/carga/éxito honestos.
- Herencia sitio/outlet y responsive explícitas; efectos de cambiar un token demostrados.
- Maestros originales conservados. No publicar cambios operativos ni modificar clientes para validar una propuesta visual.

Antes de declarar implementación completa se exige el circuito de la matriz UI/backend/BD: editar → preview → guardar → recargar → publicar → verificar sitio público → recuperar revisión, además de aislamiento, conflicto y operación por capacidad. Esta auditoría no marca ese circuito como ejecutado.
