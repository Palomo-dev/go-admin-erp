/**
 * Mapeo único entre columnas de `website_settings` y el documento de sitio V2.
 *
 * Lo usan el importador legacy → documento (lectura única al crear el sitio) y el adaptador del
 * editor (cambios del inspector → documento). Una sola tabla para los dos sentidos: si una
 * columna cambia de destino, cambia aquí y en ningún otro sitio.
 *
 * Fuente: docs/website-builder-v2/D12-CLASIFICACION-COLUMNAS.md. Decisión aprobada el 2026-10-05:
 * las 15 columnas sin efecto en el sitio público (`background_color`, `text_color`,
 * `font_heading`, `font_body`, los seis `enable_*`, `tax_rate`, `tax_name`, `menu_position`,
 * `categories_menu_style`, `mobile_sticky_header`) NO se importan (`mobile_sticky_header` y
 * `mobile_breakpoint` viven ahora como opciones nuevas del documento, apartado Celular). Tampoco comercio,
 * integraciones, metadatos ni obsoletas: siguen en la fila legacy (operación, D12).
 *
 * Defaults verificados por MCP (`information_schema.columns`) el 2026-10-05.
 *
 * Horario único (plan de restaurante, paquete F; 2026-10-06): `business_hours` YA NO se mapea al
 * documento. El horario que pinta la web es el de la sede (`branches.opening_hours`, Sucursales);
 * `website_settings.business_hours` queda en la fila legacy solo como respaldo de sitios sin sede
 * revisada. `contenido.horarios` sigue en el contrato (documentos viejos lo traen) pero nadie lo
 * escribe ni lo lee.
 *
 * Encabezado y pie por plantilla (2026-10-06): opciones nuevas (`nueva: true`) con su regla,
 * `header_style` 'transparent' y `footer_background` 'tema'. En V2 viven en `shell.*.opciones`;
 * en legacy, columnas aditivas de las migraciones `sitio_encabezado_pie_v2` (14) y
 * `sitio_encabezado_pie_v2_panel` (moneda, colores de texto, fijo al bajar, separadores). Quien
 * las lee usa `normalizarOpcionShell`: ausente o inválida = default = el sitio de hoy.
 *
 * goadmin-websites guarda una copia IDÉNTICA en `lib/website/v2/mapeoAjustes.ts`
 * (`npm run verify:copias` allá compara las dos): si cambias este archivo, cópialo tal cual.
 */

/** Ruta de un campo heredable (`{mode}`) dentro del documento. */
export type RutaHeredable =
  | ['identidad', 'faviconUrl' | 'alturaLogo']
  | ['tema', 'plantillaBase' | 'modo']
  | ['tema', 'colores', 'primario' | 'secundario' | 'acento']
  | ['seo', 'titulo' | 'descripcion' | 'palabrasClave' | 'imagenOgUrl']
  | ['contenido', 'redesSociales' | 'textoPie'];

export interface CampoHeredableMapeado {
  columna: string;
  ruta: RutaHeredable;
  etiqueta: string;
  grupo: 'Identidad' | 'Tema' | 'SEO' | 'Contenido';
  /** Valor que muestra el editor cuando el documento no tiene ninguno (columnas NOT NULL). */
  porDefecto?: unknown;
}

/** Columnas con destino en un campo heredable del documento (grupos tema, SEO y contenido de D12). */
export const CAMPOS_HEREDABLES: readonly CampoHeredableMapeado[] = [
  { columna: 'template_id', ruta: ['tema', 'plantillaBase'], etiqueta: 'Plantilla base', grupo: 'Tema', porDefecto: 'modern' },
  { columna: 'theme_mode', ruta: ['tema', 'modo'], etiqueta: 'Modo claro / oscuro', grupo: 'Tema', porDefecto: 'light' },
  { columna: 'primary_color', ruta: ['tema', 'colores', 'primario'], etiqueta: 'Color primario', grupo: 'Tema' },
  { columna: 'secondary_color', ruta: ['tema', 'colores', 'secundario'], etiqueta: 'Color secundario', grupo: 'Tema' },
  { columna: 'accent_color', ruta: ['tema', 'colores', 'acento'], etiqueta: 'Color de acento', grupo: 'Tema' },
  { columna: 'favicon_url', ruta: ['identidad', 'faviconUrl'], etiqueta: 'Favicon', grupo: 'Identidad' },
  { columna: 'logo_height', ruta: ['identidad', 'alturaLogo'], etiqueta: 'Altura del logo', grupo: 'Identidad', porDefecto: 48 },
  { columna: 'meta_title', ruta: ['seo', 'titulo'], etiqueta: 'Título SEO', grupo: 'SEO' },
  { columna: 'meta_description', ruta: ['seo', 'descripcion'], etiqueta: 'Descripción SEO', grupo: 'SEO' },
  { columna: 'meta_keywords', ruta: ['seo', 'palabrasClave'], etiqueta: 'Palabras clave', grupo: 'SEO' },
  { columna: 'og_image_url', ruta: ['seo', 'imagenOgUrl'], etiqueta: 'Imagen para redes', grupo: 'SEO' },
  { columna: 'social_links', ruta: ['contenido', 'redesSociales'], etiqueta: 'Redes sociales', grupo: 'Contenido' },
  { columna: 'footer_text', ruta: ['contenido', 'textoPie'], etiqueta: 'Texto del pie', grupo: 'Contenido' },
];

/**
 * Tipo y regla de validación de una opción del shell. Lo que no cumple vale el `porDefecto`
 * (nunca un valor a medias): ver {@link normalizarOpcionShell}.
 */
export type ReglaOpcionShell =
  | { tipo: 'booleano' }
  | { tipo: 'texto'; max: number }
  /** Ruta propia (`/reservas`), `https://`, `tel:`, `mailto:` o un destino especial. */
  | { tipo: 'enlace'; especiales: readonly string[] }
  | { tipo: 'opcion'; valores: readonly string[] }
  /** Lista sin repetidos de valores permitidos, `min`–`max` elementos. */
  | { tipo: 'lista'; valores: readonly string[]; min: number; max: number }
  /** Color fijo «#RGB» o «#RRGGBB». */
  | { tipo: 'color' }
  /** Uno de `valores` o una lista de `acciones` (texto «a,b» en la columna legacy). */
  | { tipo: 'opcionOLista'; valores: readonly string[]; acciones: readonly string[]; max: number }
  /** Entero inclusive. */
  | { tipo: 'entero'; min: number; max: number }
  /** Imagen: `https://` o ruta propia (`/img/x.png`), hasta 2048 caracteres y sin espacios. */
  | { tipo: 'imagen' }
  /** Lista de textos libres sin repetir: 1–`max` elementos de 1–`largo` caracteres (sin espacios de más). */
  | { tipo: 'listaTextos'; max: number; largo: number };

export interface OpcionShell {
  zona: 'header' | 'footer';
  porDefecto: unknown;
  /** Regla de validación. Las opciones anteriores a 2026-10-06 no la declaran (se aceptan tal cual). */
  regla?: ReglaOpcionShell;
  /**
   * Columna legacy que llega con las migraciones `sitio_encabezado_pie_v2*`. Mientras no esté
   * aplicada, un `select` que la nombre falla: por eso NO entra en {@link COLUMNAS_IMPORTADAS}.
   * En V2 vive en `opciones` y no necesita migración.
   */
  nueva?: true;
}

/** Composición explícita. Ausente: se sigue usando `header_style`. */
export const LAYOUTS_ENCABEZADO = [
  'clasico',
  'logo_centro',
  'logo_centro_menu_abajo',
  'menu_abajo',
  'comercio',
  'minimo',
  'mega',
  'solido_negro_menu_centro',
  'transparente_centrado',
] as const;
export const SCROLL_ENCABEZADO = ['fijo', 'ocultar_al_bajar', 'encoger', 'ocultar_y_encoger'] as const;

/**
 * Composiciones del encabezado que pinta el sitio (`header_style` / `shell.header.composicion`).
 * `pill` (plantilla «Café de especialidad», Figma 2223:46106 lámina 11): logo a la izquierda, el
 * menú en una píldora flotante centrada y el botón a la derecha; transparente sobre la portada
 * con `header_transparent_over_hero`.
 */
export const COMPOSICIONES_HEADER = ['default', 'centered', 'split', 'minimal', 'mega', 'transparent', 'pill'] as const;
/** Composiciones del pie (`footer_style` / `shell.footer.composicion`). */
export const COMPOSICIONES_FOOTER = ['default', 'minimal', 'centered', 'three_columns', 'split'] as const;
/** Fondos del pie. `tema`: el fondo y el texto del tema del sitio. */
export const FONDOS_PIE = ['dark', 'light', 'primary', 'custom', 'tema'] as const;
/** Destinos especiales de los botones del encabezado: WhatsApp del sitio y «Cómo llegar» de la sede. */
export const ENLACES_ESPECIALES = ['whatsapp', 'maps'] as const;
/** Idiomas del selector (`site_locale` admite los mismos: CHECK `website_settings_site_locale_valido`). */
export const IDIOMAS_SHELL = ['es-CO', 'en', 'fr', 'pt'] as const;
/** De dónde sale el menú principal: el menú del sitio o las categorías de la carta (Carta QR). */
export const FUENTES_MENU = ['menu', 'categorias_carta'] as const;
/**
 * Barra fija del celular:
 * - `auto`: lo de hoy (solo restaurantes: Reservar · Llamar · Cómo llegar · Pedir, las que apliquen);
 * - `ninguna`: sin barra;
 * - lista de acciones, en orden (cualquier giro). Las que no aplican en el sitio no salen.
 */
export const MODOS_BARRA_MOVIL = ['auto', 'ninguna'] as const;
export const ACCIONES_BARRA_MOVIL = ['pedir', 'reservar', 'agendar', 'prueba', 'llamar', 'whatsapp', 'como_llegar'] as const;
/** Trazo de moneda, carrito y cuenta. */
export const PESO_ICONO_ENCABEZADO = ['contorno', 'relleno'] as const;
/** Forma del carrito. El default `null` no pisa `cart_icon`. */
export const FORMA_CARRITO_ENCABEZADO = ['bolsa', 'carrito'] as const;
/**
 * Forma del botón principal del encabezado (Figma «Editor · Encabezado píldora…» P2, 2026-11-07).
 * Sin la clave: el botón de hoy (radio `cta_border_radius`, 8 por defecto). `pill` = píldora de
 * verdad (radio total), `rounded` = 12 px, `square` = esquinas rectas, `circle` = círculo con el
 * texto dentro (el «Reservar» del café en su primera versión).
 */
export const FORMAS_BOTON_ENCABEZADO = ['pill', 'circle', 'rounded', 'square'] as const;
/** Tamaño del botón principal: alto 36 / 44 / 50 px con su relleno. Sin la clave, el de hoy. */
export const TAMANOS_BOTON_ENCABEZADO = ['sm', 'md', 'lg'] as const;
/**
 * Estilo del botón principal. `tema` = el estilo de botón del sitio (tema.tokens.estiloBoton);
 * `solido` = relleno con `cta_bg_color` (el de hoy, sin la clave); `contorno`; `vidrio` = blanco
 * translúcido con desenfoque; `texto` = solo el texto subrayado al pasar.
 */
export const ESTILOS_BOTON_ENCABEZADO = ['tema', 'solido', 'contorno', 'vidrio', 'texto'] as const;
/** Lado del ícono del botón principal. Sin la clave: izquierda (encima en el círculo). */
export const LADOS_ICONO_BOTON = ['izquierda', 'derecha', 'encima'] as const;
/**
 * Píldora del menú (composición `pill`). Sin la clave, `vidrio`: blanco translúcido con desenfoque
 * sobre la foto (lo que el sitio pinta hoy). `solido` = isla del color del tema con sombra;
 * `contorno` = solo el borde.
 */
export const ESTILOS_PILDORA = ['vidrio', 'solido', 'contorno'] as const;
/** Al bajar: la píldora toma el fondo del tema al 85 % (`fondo_tema`, hoy) o se queda igual. */
export const PILDORA_AL_BAJAR = ['fondo_tema', 'igual'] as const;
/** Letras del menú en la píldora: versalitas espaciadas (hoy) o como se escribieron. */
export const LETRAS_PILDORA = ['versalitas', 'normal'] as const;
/**
 * Dónde va la píldora en el celular: `arriba` = encabezado con logo, píldora «Menú» y botón (hoy
 * con la composición `pill`); `abajo` = menú inferior flotante con los enlaces del menú; `ambas`.
 */
export const POSICIONES_PILDORA = ['arriba', 'abajo', 'ambas'] as const;
/**
 * Marca del pie (plantillas de tienda, 2026-11): `none` = el pie de hoy; `giant` = el nombre de la
 * tienda en grande a todo el ancho (con la figura de `footer_brand_figure_url` encima, si hay).
 */
export const MARCAS_PIE = ['none', 'giant'] as const;
/** Enlaces del pie: `normal` = los de hoy; `display` = en la fuente de títulos y grandes. */
export const ESTILOS_ENLACES_PIE = ['normal', 'display'] as const;

const BOOL: ReglaOpcionShell = { tipo: 'booleano' };

/** Columnas del shell que van a `shell.<zona>.opciones[columna]` solo si difieren del default. */
export const OPCIONES_SHELL: Readonly<Record<string, OpcionShell>> = {
  // Encabezado
  logo_position: { zona: 'header', porDefecto: 'left' },
  /** Lado del logo en el celular. `inherit` = el de `logo_position` (y, si esa falta, centro en centered/split). */
  mobile_logo_position: { zona: 'header', porDefecto: 'inherit', regla: { tipo: 'opcion', valores: ['inherit', 'left', 'center', 'right'] }, nueva: true },
  header_cta_text: { zona: 'header', porDefecto: null },
  header_cta_url: { zona: 'header', porDefecto: null },
  /**
   * Forma del botón principal (FORMAS_BOTON_ENCABEZADO). Sin la clave, el botón de hoy. Antes el
   * default era `pill` y significaba «el de hoy»: ningún sitio guardó `pill` (solo la org 374 guarda
   * `circle`, SQL 2026-11-07), así que `pill` pasa a ser la píldora de verdad sin cambiar a nadie.
   */
  header_cta_shape: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: FORMAS_BOTON_ENCABEZADO }, nueva: true },
  /** Tamaño del botón principal (TAMANOS_BOTON_ENCABEZADO). Sin la clave, el relleno de hoy. */
  header_cta_size: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: TAMANOS_BOTON_ENCABEZADO }, nueva: true },
  /** Ancho fijo del botón principal en px. Sin la clave, automático (el texto manda). */
  header_cta_width: { zona: 'header', porDefecto: null, regla: { tipo: 'entero', min: 60, max: 280 }, nueva: true },
  /** Alto del botón principal en px (manda sobre el del tamaño). Sin la clave, el del tamaño o el de hoy. */
  header_cta_height: { zona: 'header', porDefecto: null, regla: { tipo: 'entero', min: 28, max: 80 }, nueva: true },
  /** Estilo del botón principal (ESTILOS_BOTON_ENCABEZADO). Sin la clave, relleno con cta_bg_color (hoy). */
  header_cta_style: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: ESTILOS_BOTON_ENCABEZADO }, nueva: true },
  /** Ícono del botón principal (nombre de lucide en kebab-case, como header_icons). Sin la clave, sin ícono (el círculo que lleva a reservas pone el calendario). */
  header_cta_icon: { zona: 'header', porDefecto: null, regla: { tipo: 'texto', max: 40 }, nueva: true },
  /** Lado del ícono (LADOS_ICONO_BOTON). */
  header_cta_icon_side: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: LADOS_ICONO_BOTON }, nueva: true },
  /** Mayúsculas en el botón principal. Sin la clave, lo de hoy (buttons_uppercase_active del sitio). */
  header_cta_uppercase: { zona: 'header', porDefecto: null, regla: BOOL, nueva: true },
  /**
   * Segundo botón del encabezado (header_cta2_*), con el mismo control que el principal (Figma
   * 2392:55484, nota «el mismo control sirve para el segundo botón»). Sin la clave, el de hoy.
   */
  header_cta2_shape: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: FORMAS_BOTON_ENCABEZADO }, nueva: true },
  header_cta2_size: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: TAMANOS_BOTON_ENCABEZADO }, nueva: true },
  header_cta2_style: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: ESTILOS_BOTON_ENCABEZADO }, nueva: true },
  header_cta2_icon: { zona: 'header', porDefecto: null, regla: { tipo: 'texto', max: 40 }, nueva: true },
  header_cta2_icon_side: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: LADOS_ICONO_BOTON }, nueva: true },
  header_cta2_uppercase: { zona: 'header', porDefecto: null, regla: BOOL, nueva: true },
  /**
   * Pinta la forma, el relleno y el tamaño de `tema.tokens.boton` en los botones de las secciones
   * (vive en el shell por la misma razón que buttons_uppercase_active). `false` = lo de hoy: 9 de
   * los 15 sitios V2 publicados ya guardan `tokens.boton` por un preset y hoy no se pinta (SQL
   * 2026-11-07); no deben cambiar solos. Lo escribe el editor cuando el dueño toca «Botones».
   */
  buttons_theme_active: { zona: 'header', porDefecto: false, regla: BOOL, nueva: true },
  /** Píldora del menú (composición `pill`): estilo (ESTILOS_PILDORA). Sin la clave, `vidrio`. */
  header_pill_style: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: ESTILOS_PILDORA }, nueva: true },
  /** Opacidad del blanco del vidrio sobre la foto, en %. Sin la clave, 10. */
  header_pill_glass_opacity: { zona: 'header', porDefecto: null, regla: { tipo: 'entero', min: 0, max: 40 }, nueva: true },
  /** Desenfoque del vidrio en px. Sin la clave, 24. */
  header_pill_blur: { zona: 'header', porDefecto: null, regla: { tipo: 'entero', min: 0, max: 32 }, nueva: true },
  /** Borde suave de la píldora. Sin la clave, sí. */
  header_pill_border: { zona: 'header', porDefecto: null, regla: BOOL, nueva: true },
  /** Al bajar (PILDORA_AL_BAJAR). Sin la clave, `fondo_tema`. */
  header_pill_on_scroll: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: PILDORA_AL_BAJAR }, nueva: true },
  /** Letras del menú en la píldora (LETRAS_PILDORA). Sin la clave, versalitas. */
  header_pill_text_case: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: LETRAS_PILDORA }, nueva: true },
  /** Separación del encabezado píldora con el borde superior, en px. Sin la clave, la de hoy. */
  header_float_offset: { zona: 'header', porDefecto: null, regla: { tipo: 'entero', min: 0, max: 32 }, nueva: true },
  /** Dónde va la píldora en el celular (POSICIONES_PILDORA). Sin la clave, `arriba`. */
  header_pill_position: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: POSICIONES_PILDORA }, nueva: true },
  show_header_cart: { zona: 'header', porDefecto: true },
  show_header_auth: { zona: 'header', porDefecto: true },
  show_topbar: { zona: 'header', porDefecto: false },
  search_style: { zona: 'header', porDefecto: 'icon' },
  show_categories_in_header: { zona: 'header', porDefecto: false },
  mega_menu_columns: { zona: 'header', porDefecto: 4 },
  mobile_menu_style: { zona: 'header', porDefecto: 'drawer' },
  mobile_search_style: { zona: 'header', porDefecto: 'icon' },
  /** Desplegable de categorías en la barra de búsqueda del celular (BuscadorCromoCompacto). false = la barra de siempre. */
  /**
   * Búsquedas populares del buscador (chips «Populares» al abrirlo vacío). Lista de textos; sin
   * valor, la tienda usa las primeras categorías del menú (nunca una lista genérica).
   */
  search_popular: { zona: 'header', porDefecto: null, regla: { tipo: 'listaTextos', max: 8, largo: 30 }, nueva: true },
  mobile_search_same_as_desktop: { zona: 'header', porDefecto: false, regla: BOOL, nueva: true },
  mobile_show_topbar: { zona: 'header', porDefecto: false },
  header_opacity: { zona: 'header', porDefecto: 95 },
  header_bg_color: { zona: 'header', porDefecto: null },
  topbar_bg_color: { zona: 'header', porDefecto: null },
  nav_bg_color: { zona: 'header', porDefecto: null },
  topbar_show_email: { zona: 'header', porDefecto: true },
  topbar_show_phone: { zona: 'header', porDefecto: true },
  topbar_announcement: { zona: 'header', porDefecto: null },
  topbar_contact_position: { zona: 'header', porDefecto: 'left' },
  minimal_menu_style: { zona: 'header', porDefecto: 'drawer' },
  cart_icon: { zona: 'header', porDefecto: 'shopping-bag' },
  search_icon: { zona: 'header', porDefecto: 'search' },
  auth_icon: { zona: 'header', porDefecto: 'user' },
  currency_icon: { zona: 'header', porDefecto: 'globe' },
  actions_order: { zona: 'header', porDefecto: ['search', 'currency', 'cart', 'auth'] },
  cta_padding_x: { zona: 'header', porDefecto: 16 },
  cta_padding_y: { zona: 'header', porDefecto: 8 },
  cta_border_radius: { zona: 'header', porDefecto: 8 },
  cta_full_width: { zona: 'header', porDefecto: false },
  cta_border_width: { zona: 'header', porDefecto: 0 },
  cta_border_color: { zona: 'header', porDefecto: null },
  cta_shadow: { zona: 'header', porDefecto: 'none' },
  cta_bg_color: { zona: 'header', porDefecto: null },
  cta_text_color: { zona: 'header', porDefecto: null },
  cta_margin_top: { zona: 'header', porDefecto: 0 },
  cta_margin_bottom: { zona: 'header', porDefecto: 0 },
  // Encabezado y pie por plantilla (Figma «16 Sitio web» 2028:38223, aprobado el 2026-10-06).
  // Defaults = el sitio de hoy: con ninguna de estas opciones un sitio se ve igual que antes.
  /** Segundo botón (contorno). Sin texto o sin enlace no se pinta. */
  header_cta2_text: { zona: 'header', porDefecto: null, regla: { tipo: 'texto', max: 40 }, nueva: true },
  header_cta2_url: { zona: 'header', porDefecto: null, regla: { tipo: 'enlace', especiales: ENLACES_ESPECIALES }, nueva: true },
  /**
   * Botones 3 a 6 del encabezado (antes solo el Constructor tenía más de 2). Mismo estilo que el
   * segundo; sin texto o sin enlace no se pintan. Sin valor, ninguna tienda cambia.
   */
  header_cta3_text: { zona: 'header', porDefecto: null, regla: { tipo: 'texto', max: 40 }, nueva: true },
  header_cta3_url: { zona: 'header', porDefecto: null, regla: { tipo: 'enlace', especiales: ENLACES_ESPECIALES }, nueva: true },
  header_cta4_text: { zona: 'header', porDefecto: null, regla: { tipo: 'texto', max: 40 }, nueva: true },
  header_cta4_url: { zona: 'header', porDefecto: null, regla: { tipo: 'enlace', especiales: ENLACES_ESPECIALES }, nueva: true },
  header_cta5_text: { zona: 'header', porDefecto: null, regla: { tipo: 'texto', max: 40 }, nueva: true },
  header_cta5_url: { zona: 'header', porDefecto: null, regla: { tipo: 'enlace', especiales: ENLACES_ESPECIALES }, nueva: true },
  header_cta6_text: { zona: 'header', porDefecto: null, regla: { tipo: 'texto', max: 40 }, nueva: true },
  header_cta6_url: { zona: 'header', porDefecto: null, regla: { tipo: 'enlace', especiales: ENLACES_ESPECIALES }, nueva: true },
  /** Estilo de los botones 3 a 6: sin valor (null) = «Con borde», como hasta ahora (Figma 2292:51519). */
  header_extra_buttons_style: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: ['outline', 'solid', 'text'] }, nueva: true },
  /**
   * Menús adicionales del encabezado (antes en el Constructor): nombre + enlaces `{ label, href }`.
   * Se pintan como desplegables después del menú principal. Sin valor, nada cambia.
   */
  header_menu2_label: { zona: 'header', porDefecto: null, regla: { tipo: 'texto', max: 40 }, nueva: true },
  header_menu2_links: { zona: 'header', porDefecto: null, nueva: true },
  header_menu3_label: { zona: 'header', porDefecto: null, regla: { tipo: 'texto', max: 40 }, nueva: true },
  header_menu3_links: { zona: 'header', porDefecto: null, nueva: true },
  header_menu4_label: { zona: 'header', porDefecto: null, regla: { tipo: 'texto', max: 40 }, nueva: true },
  header_menu4_links: { zona: 'header', porDefecto: null, nueva: true },
  /** Barra superior: sede y «Abierto ahora · Cierra a las…» con el horario de la sede. */
  topbar_show_branch_status: { zona: 'header', porDefecto: false, regla: BOOL, nueva: true },
  /** Barra superior: «Envío gratis desde $…» (`free_shipping_threshold`). */
  topbar_show_free_shipping: { zona: 'header', porDefecto: false, regla: BOOL, nueva: true },
  /** Barra superior: cupos libres del parqueadero. */
  topbar_show_availability: { zona: 'header', porDefecto: false, regla: BOOL, nueva: true },
  /**
   * Selector de sede DENTRO del encabezado. `false` (hoy): franja propia bajo el encabezado.
   * En los dos casos solo se pinta con 2 o más sedes publicadas.
   */
  header_show_branch_selector: { zona: 'header', porDefecto: false, regla: BOOL, nueva: true },
  /** Selector de idioma en el encabezado, con los idiomas de `site_locales`. */
  header_show_language: { zona: 'header', porDefecto: false, regla: BOOL, nueva: true },
  site_locales: { zona: 'header', porDefecto: ['es-CO'], regla: { tipo: 'lista', valores: IDIOMAS_SHELL, min: 1, max: 4 }, nueva: true },
  /** Hotel: barra de reserva con fechas bajo el encabezado. */
  header_booking_bar: { zona: 'header', porDefecto: false, regla: BOOL, nueva: true },
  header_menu_source: { zona: 'header', porDefecto: 'menu', regla: { tipo: 'opcion', valores: FUENTES_MENU }, nueva: true },
  mobile_bottom_bar: {
    zona: 'header',
    porDefecto: 'auto',
    regla: { tipo: 'opcionOLista', valores: MODOS_BARRA_MOVIL, acciones: ACCIONES_BARRA_MOVIL, max: 4 },
    nueva: true,
  },
  // Panel del editor «Encabezado» (2026-10-06, segunda tanda): moneda, color de texto y fijo al bajar.
  /** Selector de moneda en el encabezado (solo sale con 2 o más monedas, como hoy). */
  header_show_currency: { zona: 'header', porDefecto: true, regla: BOOL, nueva: true },
  /** Texto y enlaces del encabezado: `null` = siguen el tema (lo de hoy); un color = fijo. */
  header_text_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  /** Fijo al bajar (sticky). `true` = lo de hoy. */
  header_sticky: { zona: 'header', porDefecto: true, regla: BOOL, nueva: true },
  /** «Fijo al desplazar» solo en el celular (apartado Celular). `null` = sigue `header_sticky` (lo de hoy). */
  mobile_sticky_header: { zona: 'header', porDefecto: null, regla: BOOL, nueva: true },
  /** «Diseño de celular por debajo de» (px). 1024 = lo de hoy en las tiendas v2. */
  mobile_breakpoint: { zona: 'header', porDefecto: null, regla: { tipo: 'entero', min: 640, max: 1024 }, nueva: true },
  /**
   * Línea entre el logo y el menú. `true` = visible (lo de hoy, con el lavado del fondo).
   * `false` quita el borde.
   */
  header_divider: { zona: 'header', porDefecto: true, regla: BOOL, nueva: true },
  /** Color de esa línea. `null` = rgba blanco 0.1 sobre fondo oscuro y negro 0.08 sobre claro. */
  header_divider_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  /** Hover de los íconos del encabezado. `null` = el mismo lavado que el divisor. */
  header_hover_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  /** Contorno o relleno de moneda, carrito y cuenta. */
  header_icons_weight: { zona: 'header', porDefecto: 'contorno', regla: { tipo: 'opcion', valores: PESO_ICONO_ENCABEZADO }, nueva: true },
  /** Bolsa o carrito. `null` deja el `cart_icon` que ya tenía el sitio (paquete, regalo…). */
  header_cart_glyph: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: FORMA_CARRITO_ENCABEZADO }, nueva: true },
  /** Círculo del color de la marca detrás de moneda, carrito y cuenta. */
  header_icons_circle: { zona: 'header', porDefecto: false, regla: BOOL, nueva: true },
  /** Fondo del «Círculo acento». `null` = el color de la marca (lo de hoy). */
  header_icons_circle_bg: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  /** Color del ícono en el círculo. `null` = automático (blanco sobre oscuro/saturado, oscuro sobre claro). */
  header_icons_circle_fg: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  /**
   * Caja de los íconos del encabezado (forma, tamaño, degradado, sombra, hover). Mismo formato que
   * el `icon_container` del Constructor, que se sigue leyendo si esta no tiene valor.
   */
  header_icons_box: { zona: 'header', porDefecto: null, nueva: true },
  /**
   * Menú del celular (cajón, hoja, pantalla completa y pestañas). `null` = automático:
   * hereda el encabezado y, si hace falta, el contraste del fondo. No pisa lo ya guardado.
   */
  mobile_menu_bg_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  mobile_menu_text_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  mobile_menu_link_hover_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  mobile_menu_link_active_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  mobile_menu_title_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  mobile_menu_divider_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  mobile_menu_currency_text_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  mobile_menu_currency_border_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  mobile_menu_currency_bg_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  mobile_menu_login_bg_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  mobile_menu_login_text_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  mobile_menu_register_border_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  mobile_menu_register_text_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  mobile_menu_logout_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  /** Hamburguesa, búsqueda, carrito, cuenta y moneda de la barra del celular. `null` = texto del encabezado o contraste. */
  header_mobile_icon_color: { zona: 'header', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  /** Si falta, el encabezado sigue el `header_style` de hoy. */
  header_layout: { zona: 'header', porDefecto: null, regla: { tipo: 'opcion', valores: LAYOUTS_ENCABEZADO }, nueva: true },
  /** `fijo` es lo de hoy: el encabezado no se esconde ni se encoge. */
  header_scroll: { zona: 'header', porDefecto: 'fijo', regla: { tipo: 'opcion', valores: SCROLL_ENCABEZADO }, nueva: true },
  header_actions_style: { zona: 'header', porDefecto: 'icono', regla: { tipo: 'opcion', valores: ['icono', 'icono_texto', 'pildora', 'texto'] }, nueva: true },
  /**
   * Menú móvil nuevo, barra inferior tipo app y disposición del header en celular.
   * `null` (hoy): sigue la variante de `mobile_menu_style` (drawer, fullscreen, bottom_sheet, tabs).
   * Vive solo en el JSON del documento. No hay columna ni migración.
   */
  mobile_header: { zona: 'header', porDefecto: null, nueva: true },
  /**
   * Constructor del encabezado: zonas, íconos, botones, mega menú y cromo del buscador.
   * `null` = el header de hoy. Vive en el JSON del documento. No hay columna ni migración.
   */
  header_builder: { zona: 'header', porDefecto: null, nueva: true },
  /**
   * Header transparente, fijo, encima del hero. `null` = no (el header sigue
   * opaco y el hero debajo). `false` guardado apaga también el alias
   * `overlap_header`. La variante `header_style: transparent` sigue solapando
   * salvo este `false`.
   */
  header_transparent_over_hero: { zona: 'header', porDefecto: null, regla: BOOL, nueva: true },
  /** Hueco en px entre el encabezado y la primera sección. 0 = pegadas. */
  first_section_offset_px: { zona: 'header', porDefecto: 0, regla: { tipo: 'entero', min: 0, max: 240 }, nueva: true },
  /**
   * Plantillas de tienda (2026-11): pinta las mayúsculas espaciadas de `tema.tokens.boton.mayusculas`
   * en los botones de TODO el sitio (vive en `shell.header.opciones` porque el esquema solo acepta
   * claves libres ahí; no es del encabezado). `false` = lo de hoy: hay sitios publicados que ya
   * guardan `mayusculas: true` por un preset y su botón no debe cambiar. Lo escribe «Plantilla
   * completa» de las plantillas nuevas que piden mayúsculas, y el editor cuando el dueño las prende.
   */
  buttons_uppercase_active: { zona: 'header', porDefecto: false, regla: BOOL, nueva: true },
  // Pie
  show_powered_by: { zona: 'footer', porDefecto: true },
  mobile_footer_style: { zona: 'footer', porDefecto: 'accordion' },
  mobile_footer_show_social: { zona: 'footer', porDefecto: true },
  mobile_footer_show_hours: { zona: 'footer', porDefecto: false },
  footer_show_categories: { zona: 'footer', porDefecto: false },
  footer_columns: { zona: 'footer', porDefecto: 4 },
  footer_background: { zona: 'footer', porDefecto: 'dark' },
  footer_custom_bg_color: { zona: 'footer', porDefecto: null },
  footer_show_contact: { zona: 'footer', porDefecto: true },
  footer_show_hours: { zona: 'footer', porDefecto: true },
  footer_show_social: { zona: 'footer', porDefecto: true },
  footer_show_newsletter: { zona: 'footer', porDefecto: false },
  footer_newsletter_title: { zona: 'footer', porDefecto: null },
  footer_newsletter_placeholder: { zona: 'footer', porDefecto: null },
  footer_newsletter_button_text: { zona: 'footer', porDefecto: null },
  /** Bloque «Escríbenos por WhatsApp» con el número del sitio (`whatsapp_number`). */
  footer_show_whatsapp: { zona: 'footer', porDefecto: false, regla: BOOL, nueva: true },
  /** Mapa de la sede con el botón «Cómo llegar». */
  footer_show_map: { zona: 'footer', porDefecto: false, regla: BOOL, nueva: true },
  /** Medios de pago (`organization_payment_methods.show_on_website`). */
  footer_show_payment_methods: { zona: 'footer', porDefecto: false, regla: BOOL, nueva: true },
  /** Texto del pie: `null` = sigue el tema / el fondo elegido (lo de hoy); un color = fijo. */
  footer_text_color: { zona: 'footer', porDefecto: null, regla: { tipo: 'color' }, nueva: true },
  /** Líneas separadoras del pie (bordes entre bloques y sobre el copyright). `true` = lo de hoy. */
  footer_show_dividers: { zona: 'footer', porDefecto: true, regla: BOOL, nueva: true },
  // Plantillas de tienda (2026-11, PLANO §2 ítems 23-25). Defaults = el pie de hoy.
  /** Nombre de la tienda en grande en el pie. `none` = lo de hoy. */
  footer_brand_display: { zona: 'footer', porDefecto: 'none', regla: { tipo: 'opcion', valores: MARCAS_PIE }, nueva: true },
  /** Figura (PNG recortado) sobre la marca gigante. `null` = solo el texto. Sin `giant` no se pinta. */
  footer_brand_figure_url: { zona: 'footer', porDefecto: null, regla: { tipo: 'imagen' }, nueva: true },
  /** Pie como tarjeta con margen de 16 px y el radio del tema. `false` = a todo el ancho (lo de hoy). */
  footer_inset: { zona: 'footer', porDefecto: false, regla: BOOL, nueva: true },
  /** Estilo de los enlaces del pie. `normal` = lo de hoy. */
  footer_links_style: { zona: 'footer', porDefecto: 'normal', regla: { tipo: 'opcion', valores: ESTILOS_ENLACES_PIE }, nueva: true },
};

/** Reglas de opciones que ya existían y ganan valores nuevos (`transparent`, `tema`). */
export const REGLAS_ESTRUCTURA: Readonly<Record<string, ReglaOpcionShell>> = {
  header_style: { tipo: 'opcion', valores: COMPOSICIONES_HEADER },
  footer_style: { tipo: 'opcion', valores: COMPOSICIONES_FOOTER },
  footer_background: { tipo: 'opcion', valores: FONDOS_PIE },
};

/** Columnas legacy que crea la migración `sitio_encabezado_pie_v2` (fuera del importador hasta aplicarla). */
export const COLUMNAS_NUEVAS_SHELL: readonly string[] = Object.entries(OPCIONES_SHELL)
  .filter(([, def]) => def.nueva)
  .map(([columna]) => columna);

const ENLACE_PROPIO = /^\/(?!\/)[^\s]*$/;
const ENLACE_EXTERNO = /^(https:\/\/[^\s]+|tel:\+?[\d\s()-]{5,}|mailto:[^\s@]+@[^\s@]+)$/i;

/** `valor` cumple la regla. */
export function cumpleRegla(regla: ReglaOpcionShell, valor: unknown): boolean {
  switch (regla.tipo) {
    case 'booleano':
      return typeof valor === 'boolean';
    case 'texto':
      return typeof valor === 'string' && valor.trim() !== '' && valor.length <= regla.max;
    case 'enlace':
      if (typeof valor !== 'string') return false;
      return regla.especiales.includes(valor) || (valor.length <= 500 && (ENLACE_PROPIO.test(valor) || ENLACE_EXTERNO.test(valor)));
    case 'opcion':
      return typeof valor === 'string' && regla.valores.includes(valor);
    case 'color':
      return typeof valor === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(valor);
    case 'lista':
      return (
        Array.isArray(valor) &&
        valor.length >= regla.min &&
        valor.length <= regla.max &&
        new Set(valor).size === valor.length &&
        valor.every((v) => typeof v === 'string' && regla.valores.includes(v))
      );
    case 'listaTextos':
      return (
        Array.isArray(valor) &&
        valor.length >= 1 &&
        valor.length <= regla.max &&
        valor.every((v) => typeof v === 'string' && v.length >= 1 && v.length <= regla.largo) &&
        new Set(valor.map((v) => (v as string).toLowerCase())).size === valor.length
      );
    case 'opcionOLista':
      if (typeof valor === 'string' && regla.valores.includes(valor)) return true;
      return (
        Array.isArray(valor) &&
        valor.length >= 1 &&
        valor.length <= regla.max &&
        new Set(valor).size === valor.length &&
        valor.every((v) => typeof v === 'string' && regla.acciones.includes(v))
      );
    case 'entero':
      return typeof valor === 'number' && Number.isInteger(valor) && valor >= regla.min && valor <= regla.max;
    case 'imagen':
      return typeof valor === 'string' && valor.length <= 2048 && (/^https:\/\/[^\s]+$/i.test(valor) || ENLACE_PROPIO.test(valor));
  }
}

/**
 * Valor efectivo de una opción del shell: el propio si cumple su regla; si no (ausente, nulo,
 * de otro tipo, fuera de la lista) el `porDefecto`, que es el comportamiento de hoy.
 * Acepta también las formas de la columna legacy: `site_locales` como `text[]` y
 * `mobile_bottom_bar` como texto `"reservar,llamar"`. Columnas sin regla: el valor tal cual
 * (`null`/`undefined` → default).
 */
export function normalizarOpcionShell(columna: string, valor: unknown): unknown {
  const def = OPCIONES_SHELL[columna];
  const regla = def?.regla ?? REGLAS_ESTRUCTURA[columna];
  const porDefecto = def ? def.porDefecto : COLUMNAS_SHELL_ESTRUCTURA[columna as keyof typeof COLUMNAS_SHELL_ESTRUCTURA]?.porDefecto ?? null;
  if (valor === null || valor === undefined) return porDefecto;
  if (!regla) return valor;
  let candidato = valor;
  // Columna legacy (texto): «a,b» o una sola acción «reservar» son una lista; `auto`/`ninguna`, no.
  if (regla.tipo === 'opcionOLista' && typeof valor === 'string' && !regla.valores.includes(valor)) {
    candidato = valor.split(',').map((v) => v.trim()).filter(Boolean);
  }
  if ((regla.tipo === 'texto' || regla.tipo === 'imagen') && typeof candidato === 'string') candidato = candidato.trim();
  if (regla.tipo === 'listaTextos' && Array.isArray(candidato)) {
    candidato = candidato.map((v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v));
  }
  return cumpleRegla(regla, candidato) ? candidato : porDefecto;
}

/** Forma de `mobile_bottom_bar` para la columna legacy (texto): la lista va como «a,b». */
/**
 * Traduce `header_layout` al `header_style` que ya pinta el sitio.
 * `null` = no hay layout nuevo y manda `header_style`.
 */
export function estiloDeHeaderLayout(layout: unknown): string | null {
  switch (layout) {
    case 'clasico':
    case 'menu_abajo':
    case 'solido_negro_menu_centro':
      return 'default';
    case 'logo_centro':
      return 'split';
    case 'logo_centro_menu_abajo':
      return 'centered';
    case 'comercio':
      return 'comercio';
    case 'minimo':
      return 'minimal';
    case 'mega':
      return 'mega';
    case 'transparente_centrado':
      return 'transparent';
    default:
      return null;
  }
}

export function barraMovilAColumna(valor: unknown): string {
  const v = normalizarOpcionShell('mobile_bottom_bar', valor);
  return Array.isArray(v) ? v.join(',') : String(v);
}

/** Columnas que fijan la composición y los menús del shell (no van a `opciones`). */
export const COLUMNAS_SHELL_ESTRUCTURA = {
  header_style: { porDefecto: 'default' },
  footer_style: { porDefecto: 'default' },
  header_menu_id: { porDefecto: null },
  header_mega_menu_id: { porDefecto: null },
} as const;

/**
 * Columnas de `website_settings` que el importador necesita leer. Sin las de
 * {@link COLUMNAS_NUEVAS_SHELL}: hasta que se aplique su migración, nombrarlas en el `select`
 * haría fallar la lectura. Un sitio importado sin ellas queda con sus defaults (lo de hoy).
 */
export const COLUMNAS_IMPORTADAS: readonly string[] = [
  ...CAMPOS_HEREDABLES.map((c) => c.columna),
  ...Object.keys(OPCIONES_SHELL).filter((c) => !OPCIONES_SHELL[c].nueva),
  ...Object.keys(COLUMNAS_SHELL_ESTRUCTURA),
];

const POR_COLUMNA = new Map(CAMPOS_HEREDABLES.map((c) => [c.columna, c]));

export function campoHeredableDeColumna(columna: string): CampoHeredableMapeado | undefined {
  return POR_COLUMNA.get(columna);
}

/** `true` si la columna tiene destino en el documento (heredable, opción o estructura del shell). */
export function columnaVaAlDocumento(columna: string): boolean {
  return POR_COLUMNA.has(columna) || columna in OPCIONES_SHELL || columna in COLUMNAS_SHELL_ESTRUCTURA;
}

/** Vacío para el documento: `null`, `undefined`, texto en blanco, `[]` o `{}`. */
export function esVacio(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === 'string') return valor.trim() === '';
  if (Array.isArray(valor)) return valor.length === 0;
  if (typeof valor === 'object') return Object.keys(valor as Record<string, unknown>).length === 0;
  return false;
}

/** Igualdad estructural (para comparar con el default sin depender del orden de claves). */
export function igualesEstructural(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => igualesEstructural(v, b[i]));
  }
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  return (
    ka.length === kb.length &&
    ka.every((k) => igualesEstructural((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}
