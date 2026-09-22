# Catálogo propuesto de composiciones y formas

Estado: **diseño del alcance, no catálogo implementado**. Fuente: [32 referencias](MATRIZ-32-REFERENCIAS.md) y biblioteca existente. Ampliado el 2026-09-21 por [ADR-002 D5](ADR-002-DECISIONES-Y-SECUENCIA.md): plantillas de página (T), página con barra lateral (P07), beneficios (C24), listado de categoría (E13) y giros operativos existentes (V). Los 65 tipos actuales tienen destino en [MAPEO-TIPOS-LEGACY.md](MAPEO-TIPOS-LEGACY.md). F00 completa las páginas internas y añade patrones que no quedaron visibles en el análisis inicial. Ningún conteo de esta lista prueba cobertura total de las plantillas originales.

Los identificadores son de planificación. Al implementar, mapearlos a tipos/variantes existentes cuando sea posible. No crear un componente duplicado ni una nueva tabla por cada fila. Una sección puede combinar composición, tema y decoración sin multiplicar tipos.

## Contrato obligatorio para cada patrón

Ficha: ID, fuente y página observada, propósito, esquema/versionado, campos, variantes, datos, límites, acciones, estados, recursos iniciales, reglas responsive y accesibilidad. Entregables: renderer, inspector, miniatura, preset, escena de prueba y prueba de la acción cuando exista. Registrar el archivo final y evidencia en la matriz antes de marcarlo completo.

Controles comunes: ancho, padding/gap, fondo/superficie, tipografía semántica, alineación, borde/radio, visibilidad, foco/recorte y orden por dispositivo. Cada patrón declara el subconjunto que soporta. Encabezados semánticos coherentes aunque la tipografía cambie de tamaño; IDs de ancla únicos por instancia.

## P — Composición de página (F09; integración F05)

| ID | Forma | Comportamiento |
|---|---|---|
| P01 | Documento vertical | Secciones en orden, ancho contenido o completo |
| P02 | Panel visual y contenido | Imagen/header en un panel, carta/formulario en otro; apilado móvil |
| P03 | Grilla editorial | Ranuras de tamaños diferentes con orden de lectura declarado |
| P04 | Página compacta tipo recibo | Contenedor estrecho, información y desplegables sobre fondo |
| P05 | Carta QR | Acceso rápido a categorías, búsqueda cuando corresponda, horarios y CTA |
| P06 | Landing simplificada | Header/footer mínimos para campaña o formulario; conserva contexto |
| P07 | Página con barra lateral | Ranura lateral fija (filtros, índice de carta, navegación de documento) y ranura de contenido; la barra se convierte en desplegable o pestaña en móvil |

## T — Plantillas de página (F09; contenido por giro en F10–F12)

Punto de partida al crear una página: composición + secciones con contenido y recursos iniciales reemplazables. «Crear desde cero» usa la misma biblioteca sin preset. Una plantilla declara los giros para los que se recomienda; no se prohíbe en los demás.

| ID | Plantilla | Composición base | Secciones típicas |
|---|---|---|---|
| T01 | Inicio | P01 | HR + C01/C24 + colección del giro + C10 + C16 |
| T02 | Nosotros / historia | P01 o P03 | C01, C02, C03, C05, C06, C22 |
| T03 | Contacto | P01 | C13, C14, C15, C09 |
| T04 | Carta | P01, P02 o P07 | R01/R02/R03, R09, R13, R06 |
| T05 | Reserva | P01 o P02 | R06 o A08, C15, C09 |
| T06 | Habitaciones (listado) | P01 | A01, A03, A07, C10 |
| T07 | Detalle de habitación | P01 | A02 (bloques), G05, A03, A08, A01 relacionadas |
| T08 | Galería | P01 | G01–G07 |
| T09 | Eventos / experiencias | P01 | C17, A04 o R08, C13 |
| T10 | Listado de productos / categoría | P07 | E13 (bloques), E01, E02, C08 |
| T11 | Detalle de producto | P01 | E05 (bloques `product_*`), C10, E01 relacionados |
| T12 | Carrito / checkout / confirmación | P06 | Solo presentación: tokens, header/footer mínimos, textos. La lógica no se toca |
| T13 | Políticas / legal | P01 o P07 | C02, C09 |
| T14 | Carta QR | P05 | R12, R02, C15, C13 |
| T15 | Landing de campaña | P06 | HR, C24, C16, C12 |
| T16 | Servicios | P01 | C23, C04, C20, C10, C16 |
| T17 | Planes / precios | P01 | C20, C19, C09 |
| T18 | Preguntas frecuentes | P01 o P07 | C09 |
| T19 | Journal / artículos | P01 o P03 | C11 |
| T20 | Sedes / ubicaciones | P01 | E11, C14, C15 |

## H — Header y navegación (F05)

| ID | Forma | Opciones principales |
|---|---|---|
| H01 | Clásico | Logo izquierdo, enlaces y CTA |
| H02 | Marca centrada | Logo central y acciones laterales |
| H03 | Navegación dividida | Enlaces repartidos alrededor del logo |
| H04 | Mínimo | Menú, marca y acción principal; superposición opcional |
| H05 | Cápsula flotante | Ancho contenido, fondo/radio y transición al desplazarse |
| H06 | Comercial | Búsqueda, categorías, cuenta, favoritos/carrito según capacidad |
| H07 | Dentro de panel | Navegación integrada a P02 con adaptación móvil |
| H08 | Menú expandido | Pantalla completa, panel lateral, mega menú o sheet según variante |

La franja promocional es opcional e independiente. Todos declaran versiones de contraste, sticky cuando sea compatible, foco, Escape y CTA móvil. H03 no equivale a P02.

## F — Footer (F05)

| ID | Forma | Contenido |
|---|---|---|
| F01 | Mínimo | Marca, legal y redes |
| F02 | Hospitalidad | Recepción, ubicación, horarios de llegada/salida, reserva y navegación |
| F03 | Gastronomía | Servicios/horarios, carta, reservas, contacto y redes |
| F04 | Editorial | Marca de gran escala, manifiesto breve y navegación reducida |
| F05 | Comercio | Categorías, ayuda, políticas y medios de pago reales |
| F06 | Contacto ampliado | Newsletter, mapa y columnas opcionales; acordeón móvil |

## HR — Portadas (F09; datos en F10–F12)

| ID | Forma | Particularidad |
|---|---|---|
| HR01 | Imagen completa | Título/CTA sobre fotografía con contraste y foco |
| HR02 | Video inmersivo | Poster, reproducción permitida y alternativa estática |
| HR03 | Dividido | Texto y media separados, orden configurable |
| HR04 | Editorial asimétrico | Titular, notas breves y media en ranuras |
| HR05 | Tipográfico con collage | Marca/título protagonista e imágenes auxiliares |
| HR06 | Producto recortado | Media transparente y capas decorativas limitadas |
| HR07 | Carrusel de campañas | Slides con navegación, pausa y acciones independientes |
| HR08 | Disponibilidad/solicitud | Formulario real asociado a la capacidad correcta |
| HR09 | Fotografía en arco | Máscara y marco, texto y CTA fuera de la imagen |
| HR10 | Portada con tarjetas | Hero y accesos/destacados contextuales |

## C — Contenido, confianza y conversión (F09; operación F10–F12)

| ID | Sección | Formas y datos |
|---|---|---|
| C01 | Historia con media | Izquierda/derecha, composición alternada, imagen doble |
| C02 | Manifiesto | Texto amplio, citas, énfasis de palabras |
| C03 | Relato editorial | Capítulos numerados, notas y media contextual |
| C04 | Proceso | Pasos en fila, columna o tarjetas |
| C05 | Equipo | Retrato, rol, biografía y destacado |
| C06 | Reconocimientos | Premios/publicaciones/acreditaciones con contenido verificable |
| C07 | Métricas | Cifras y explicación; sin afirmaciones ficticias del preset |
| C08 | Aliados/logos | Fila, grilla o carrusel accesible |
| C09 | FAQ | Acordeón único/múltiple, categorías opcionales |
| C10 | Reseñas | Cita editorial, tarjetas, carrusel y resumen de fuente |
| C11 | Artículos/journal | Destacado más lista, grilla y carrusel; detalle consistente |
| C12 | Newsletter | Formulario y estados conectado al servicio autorizado |
| C13 | Contacto | Canales, formulario o bloque editorial |
| C14 | Ubicación | Mapa/imagen con enlace, indicaciones y lugares próximos |
| C15 | Horarios | Por día y por servicio; excepciones cuando existan |
| C16 | CTA | Banda, imagen, bloque editorial o cierre compacto |
| C17 | Agenda/eventos | Calendario/lista/tarjetas y detalle |
| C18 | Comunidad/social | Galería curada y enlaces; integración real opcional |
| C19 | Comparación | Tabla accesible o tarjetas con criterios claros |
| C20 | Precios/planes | Planes, periodicidad real y CTA conectado |
| C21 | Integraciones | Logos y fichas, sin implicar conexión activa por mostrarlos |
| C22 | Cronología | Historia/momentos con orden semántico |
| C23 | Servicios | Lista, tarjetas o elemento destacado con descripción/detalle |
| C24 | Beneficios / características | Grilla de iconos, tarjetas o lista con media; fuente manual o de entidad (producto, plan, gimnasio, parqueadero). Absorbe `why_choose_us`, `features_grid`, `gym_features`, `parking_features` |

## G — Galerías y colecciones (F09)

| ID | Forma | Reglas |
|---|---|---|
| G01 | Grilla uniforme | Columnas y proporciones por dispositivo |
| G02 | Mosaico | Tamaños predefinidos, lectura y CLS controlados |
| G03 | Collage | Ranuras editoriales, sin posición libre ilimitada |
| G04 | Carrusel | Teclado, flechas, posición y pausa cuando sea automática |
| G05 | Lightbox | Foco contenido, cerrar/Escape, texto alternativo |
| G06 | Colección horizontal | Scroll táctil y alternativa de navegación |
| G07 | Destacado con secundarios | Una pieza principal y tarjetas relacionadas |

## A — Alojamiento (F10)

| ID | Sección/página | Datos y formas |
|---|---|---|
| A01 | Habitaciones | Tarjetas, listado editorial, carrusel y destacado |
| A02 | Detalle de habitación | Galería, capacidad, tarifa, políticas y reserva |
| A03 | Amenidades | Iconos, lista agrupada y tarjetas con media |
| A04 | Experiencias | Colección y detalle con disponibilidad/solicitud si existe |
| A05 | Restaurantes del hotel | Sitios relacionados con identidad y URL propias |
| A06 | Spa/bienestar | Servicios y consulta/reserva autorizada |
| A07 | Ofertas/paquetes | Vigencia y condiciones reales |
| A08 | Disponibilidad | Fechas/ocupación/resultados; no botón decorativo |
| A09 | Villa y recorrido | Espacios de una propiedad, galería y solicitud |
| A10 | Entorno | Lugares cercanos, distancias declaradas y mapa/enlaces |

## R — Gastronomía (F11)

| ID | Sección/página | Datos y formas |
|---|---|---|
| R01 | Carta editorial | Filas, descripción y precio; imagen opcional |
| R02 | Carta con anclas | Categorías navegables y enlaces profundos |
| R03 | Carta con pestañas | Filtrado visible, foco y carga acotada |
| R04 | Especialidades | Plato destacado, cards y carrusel |
| R05 | Chef | Perfil, historia, firma visual y equipo |
| R06 | Reserva de mesa | Solicitud/confirmación diferenciadas, estados reales |
| R07 | Pedido/domicilio | Acceso a operación existente o canal declarado |
| R08 | Eventos privados | Capacidad/contenido y formulario de consulta |
| R09 | Bebidas/bar | Colecciones por servicio y horarios propios |
| R10 | Café/comunidad | Productos, sedes, equipo y eventos |
| R11 | Panadería/proceso | Productos, elaboración, servicios y preventa si existe |
| R12 | Carta QR | Composición P05, navegación rápida y datos del outlet |
| R13 | Etiquetas de carta | Alérgenos/dieta/variantes solo con datos registrados |

## E — Comercio (F12)

| ID | Sección/página | Datos y formas |
|---|---|---|
| E01 | Productos | Grilla, carrusel, novedades y destacados |
| E02 | Categorías | Tarjetas fotográficas, lista y acceso ilustrado |
| E03 | Producto contextual | Tarjeta sobre fotografía y hotspot accesible |
| E04 | Colección editorial | Campaña/look con productos relacionados |
| E05 | Detalle de producto | Media, variantes, precio, disponibilidad y compra |
| E06 | Promociones | Banners, mosaico y campaña de temporada |
| E07 | Oferta temporal | Vigencia y cuenta regresiva con fuente real |
| E08 | Confianza comercial | Envío, devolución, soporte y pago según políticas reales |
| E09 | Bundles | Colección o compra agrupada según capacidad operativa |
| E10 | Tarjeta regalo | Presentación/compra solo si el dominio la soporta |
| E11 | Sedes/tiendas | Ubicación, horarios, contacto y catálogo cuando aplique |
| E12 | Herramientas comerciales | Búsqueda/filtros/cuenta/favoritos/carrito según capacidad |
| E13 | Listado de categoría | Bloques `category_header`, `category_filters`, `category_products`, `category_subcategories`, `category_seo_text` sobre composición P07; paginación acotada |

## V — Giros operativos existentes (F12; datos de sus servicios)

Secciones que ya existen en el código para gimnasio, transporte y parqueadero. Se conservan con su adaptador de datos; ganan tokens, variantes y estados. Ninguna copia disponibilidad, tarifas ni cupos al documento.

| ID | Sección | Tipos actuales | Datos y formas |
|---|---|---|---|
| V01 | Búsqueda y reserva de viaje | `trip_search`, `booking_transport` | Formulario conectado al servicio de transporte; origen/destino/fecha; estados reales |
| V02 | Rutas | `routes` | Lista, mapa o tarjetas; horarios y paradas desde la fuente |
| V03 | Flota | `fleet_showcase` | Colección (G07/E01) con fichas de vehículo |
| V04 | Zonas de parqueo | `parking_zones` | Mapa/lista de zonas con capacidad declarada |
| V05 | Disponibilidad de parqueo | `parking_availability` | Datos vivos; nunca en el snapshot; estado cerrado/lleno/error |
| V06 | Transformación (antes/después) | `transformation` | Comparación de imágenes con control accesible; contenido autorizado |

Gimnasio: `class_schedule` → C17, `trainers` → C05, `gym_features` → C24, `membership_plans` → C20, cada uno con su fuente declarada.

## D — Formas y movimiento (F09; usadas por todas las familias)

| ID | Recurso | Condición |
|---|---|---|
| D01 | Separador ondulado/recortado | Color y altura, sin afectar lectura |
| D02 | Textura/patrón | Contraste, escala y peso acotados |
| D03 | Máscara de media | Arco, redondo, rectángulo o geometría registrada |
| D04 | Imágenes recortadas/capas | Zonas limitadas y orden móvil |
| D05 | Sello/etiqueta | Decorativo o información real; sin bloquear CTA |
| D06 | Marca tipográfica grande | Escala fluida y recorte deliberado |
| D07 | Franja en movimiento | Pausa y alternativa estática accesible |
| D08 | Aparición al desplazarse | Contenido disponible sin animación/JS tardío |
| D09 | Transiciones de navegación | Estado/foco conservados; sin ocultar errores |
| D10 | Movimiento de profundidad | Opcional, discreto, sin scroll forzado y con modo reducido |

## Ampliación y cierre

F00 incorpora hallazgos adicionales con IDs nuevos y fuente verificable. Cada caso nuevo debe decidir si es tipo, variante, tema o decoración. El registro final anota: existente sin cambio, corregido, ampliado o nuevo; archivo; controles; test; preset; estado de móvil; evidencia de operación. Ninguna sección se considera terminada porque solo exista una tarjeta en el selector.
