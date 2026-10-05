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
 */

/** Ruta de un campo heredable (`{mode}`) dentro del documento. */
export type RutaHeredable =
  | ['identidad', 'faviconUrl' | 'alturaLogo']
  | ['tema', 'plantillaBase' | 'modo']
  | ['tema', 'colores', 'primario' | 'secundario' | 'acento']
  | ['seo', 'titulo' | 'descripcion' | 'palabrasClave' | 'imagenOgUrl']
  | ['contenido', 'redesSociales' | 'horarios' | 'textoPie'];

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
  { columna: 'business_hours', ruta: ['contenido', 'horarios'], etiqueta: 'Horarios', grupo: 'Contenido' },
  { columna: 'footer_text', ruta: ['contenido', 'textoPie'], etiqueta: 'Texto del pie', grupo: 'Contenido' },
];

/** Columnas del shell que van a `shell.<zona>.opciones[columna]` solo si difieren del default. */
export const OPCIONES_SHELL: Readonly<Record<string, { zona: 'header' | 'footer'; porDefecto: unknown }>> = {
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
};

/** Columnas que fijan la composición y los menús del shell (no van a `opciones`). */
export const COLUMNAS_SHELL_ESTRUCTURA = {
  header_style: { porDefecto: 'default' },
  footer_style: { porDefecto: 'default' },
  header_menu_id: { porDefecto: null },
  header_mega_menu_id: { porDefecto: null },
} as const;

/** Columnas de `website_settings` que el importador necesita leer. */
export const COLUMNAS_IMPORTADAS: readonly string[] = [
  ...CAMPOS_HEREDABLES.map((c) => c.columna),
  ...Object.keys(OPCIONES_SHELL),
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
