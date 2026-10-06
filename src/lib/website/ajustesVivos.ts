/**
 * Columnas de `website_settings` del encabezado, del pie y del tema.
 *
 * Las usa el guardado legacy del editor para repartir los cambios entre
 * `updateHeaderConfig`, `updateFooterConfig` y `updateTheme`, y el lienzo para
 * aplicar en vivo (`goadmin:settings`) lo que se está editando sin guardar.
 * Una sola lista: si se añade una columna del encabezado, llega a los dos.
 *
 * Las opciones nuevas del contrato (`COLUMNAS_NUEVAS_SHELL` de `mapeoAjustes.ts`: segundo botón,
 * barra superior, sede, barra de reserva, barra móvil, WhatsApp, mapa y medios de pago del pie)
 * entran desde el contrato: sin ellas el lienzo no las pintaba en vivo.
 */
import { COLUMNAS_NUEVAS_SHELL, OPCIONES_SHELL } from '@/lib/website/v2/mapeoAjustes';

const NUEVAS_ENCABEZADO = COLUMNAS_NUEVAS_SHELL.filter((c) => OPCIONES_SHELL[c]?.zona === 'header');
const NUEVAS_PIE = COLUMNAS_NUEVAS_SHELL.filter((c) => OPCIONES_SHELL[c]?.zona === 'footer');

/** Columnas que guarda `updateHeaderConfig` / `updateFooterConfig` (incluye las del pie). */
export const CLAVES_ENCABEZADO = [
  'header_style', 'footer_style', 'logo_position', 'header_cta_text', 'header_cta_url',
  'show_header_cart', 'show_header_auth', 'show_topbar', 'menu_position', 'search_style',
  'show_categories_in_header', 'categories_menu_style', 'mega_menu_columns',
  'mobile_menu_style', 'mobile_search_style', 'mobile_show_topbar', 'mobile_sticky_header',
  'mobile_breakpoint', 'header_opacity',
  'header_bg_color', 'topbar_bg_color', 'nav_bg_color', 'accent_color',
  'topbar_show_email', 'topbar_show_phone', 'topbar_announcement', 'topbar_contact_position',
  // Fase 12: iconos personalizables y orden de acciones
  'cart_icon', 'search_icon', 'auth_icon', 'currency_icon',
  'minimal_menu_style', 'actions_order',
  // Fase 12C: CTA personalizable
  'cta_padding_x', 'cta_padding_y', 'cta_border_radius', 'cta_border_width',
  'cta_border_color', 'cta_full_width', 'cta_shadow', 'cta_bg_color',
  'cta_text_color', 'cta_margin_top', 'cta_margin_bottom',
  // Footer config (Fase 2)
  'footer_style', 'footer_columns', 'footer_background', 'footer_custom_bg_color',
  'footer_show_contact', 'footer_show_hours', 'footer_show_social', 'footer_show_categories',
  'footer_show_newsletter', 'footer_newsletter_title', 'footer_newsletter_placeholder',
  'footer_newsletter_button_text', 'footer_text', 'show_powered_by',
  'mobile_footer_style', 'mobile_footer_show_social', 'mobile_footer_show_hours',
  'header_menu_id', 'header_mega_menu_id',
  ...NUEVAS_ENCABEZADO, ...NUEVAS_PIE,
] as const;

/** Del bloque anterior, las que guarda `updateFooterConfig`. */
export const CLAVES_PIE = [
  'footer_style', 'footer_columns', 'footer_background', 'footer_custom_bg_color',
  'footer_show_contact', 'footer_show_hours', 'footer_show_social', 'footer_show_categories',
  'footer_show_newsletter', 'footer_newsletter_title', 'footer_newsletter_placeholder',
  'footer_newsletter_button_text', 'footer_text', 'show_powered_by',
  'mobile_footer_style', 'mobile_footer_show_social', 'mobile_footer_show_hours',
  'header_menu_id', 'header_mega_menu_id',
  ...NUEVAS_PIE,
] as const;

/**
 * Columnas del tema y de la marca que pintan el encabezado y el pie (colores, logo,
 * redes, horario). Solo para el lienzo: el guardado del tema no depende de esta lista.
 */
export const CLAVES_TEMA_VIVO = [
  'primary_color', 'secondary_color', 'background_color', 'text_color', 'theme_mode',
  'logo_height', 'logo_url', 'social_links', 'business_hours',
] as const;

/**
 * Columnas que el sitio aplica en vivo en modo preview. `header_menu_id` y
 * `header_mega_menu_id` no van: cambiar de menú exige cargar otro menú, y eso
 * sí necesita guardar.
 */
export const CLAVES_AJUSTES_VIVOS: readonly string[] = Array.from(
  new Set<string>([...CLAVES_ENCABEZADO, ...CLAVES_TEMA_VIVO].filter((c) => c !== 'header_menu_id' && c !== 'header_mega_menu_id')),
);

/** Toma de los ajustes del editor solo las columnas que el lienzo aplica en vivo. */
export function ajustesParaLienzo(ajustes: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const resultado: Record<string, unknown> = {};
  if (!ajustes) return resultado;
  for (const clave of CLAVES_AJUSTES_VIVOS) {
    if (clave in ajustes) resultado[clave] = ajustes[clave];
  }
  return resultado;
}
