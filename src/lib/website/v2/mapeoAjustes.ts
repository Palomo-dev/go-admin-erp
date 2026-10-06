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
 * `categories_menu_style`, `mobile_sticky_header`) NO se importan. Tampoco comercio,
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
 * Encabezado y pie por plantilla (2026-10-06): 19 opciones nuevas (`nueva: true`) con su regla,
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
  | { tipo: 'opcionOLista'; valores: readonly string[]; acciones: readonly string[]; max: number };

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

/** Composiciones del encabezado que pinta el sitio (`header_style` / `shell.header.composicion`). */
export const COMPOSICIONES_HEADER = ['default', 'centered', 'split', 'minimal', 'mega', 'transparent'] as const;
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

const BOOL: ReglaOpcionShell = { tipo: 'booleano' };

/** Columnas del shell que van a `shell.<zona>.opciones[columna]` solo si difieren del default. */
export const OPCIONES_SHELL: Readonly<Record<string, OpcionShell>> = {
  // Encabezado
  logo_position: { zona: 'header', porDefecto: 'left' },
  header_cta_text: { zona: 'header', porDefecto: null },
  header_cta_url: { zona: 'header', porDefecto: null },
  show_header_cart: { zona: 'header', porDefecto: true },
  show_header_auth: { zona: 'header', porDefecto: true },
  show_topbar: { zona: 'header', porDefecto: false },
  search_style: { zona: 'header', porDefecto: 'icon' },
  show_categories_in_header: { zona: 'header', porDefecto: false },
  mega_menu_columns: { zona: 'header', porDefecto: 4 },
  mobile_menu_style: { zona: 'header', porDefecto: 'drawer' },
  mobile_search_style: { zona: 'header', porDefecto: 'icon' },
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
    case 'opcionOLista':
      if (typeof valor === 'string' && regla.valores.includes(valor)) return true;
      return (
        Array.isArray(valor) &&
        valor.length >= 1 &&
        valor.length <= regla.max &&
        new Set(valor).size === valor.length &&
        valor.every((v) => typeof v === 'string' && regla.acciones.includes(v))
      );
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
  if (regla.tipo === 'texto' && typeof candidato === 'string') candidato = candidato.trim();
  return cumpleRegla(regla, candidato) ? candidato : porDefecto;
}

/** Forma de `mobile_bottom_bar` para la columna legacy (texto): la lista va como «a,b». */
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
