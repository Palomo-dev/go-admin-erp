/**
 * Bloque «Celular» del panel Encabezado: una opción por función, con lo de hoy por defecto.
 *
 * - Menú: `mobile_menu_style`. «Cajón derecho» es el `drawer` de siempre (la tienda lo abre a la
 *   derecha), así que elegirlo no cambia el aspecto; `drawer_right` guardado se lee igual.
 * - Logo y orden de logo/íconos: si el celular ya usa el encabezado configurable
 *   (`mobile_header.layout`), se escribe ahí; si no, el logo va a `mobile_logo_position`, que el
 *   encabezado de hoy ya pinta. Elegir el valor de siempre quita la clave en vez de guardarlo.
 * - Menú inferior tipo app: `mobile_header.bottom_nav` (apagado = `enabled` false o ausente).
 *   Encenderlo no cambia el encabezado (la tienda lo pone sobre el de hoy).
 */
import { ANIMACIONES, FONDOS_PANEL, GLIFOS_MENU, ICONOS_ITEM, ITEMS_BARRA_INICIALES, LISTAS_CATEGORIA, TIPOS_ITEM, leerBarra, type ItemBarra } from '@/lib/website/menuMovil';

export const MENUS_CELULAR = ['drawer', 'drawer_left', 'bottom_sheet', 'top_dropdown', 'fullscreen', 'tabs', 'none'] as const;
export type MenuCelular = (typeof MENUS_CELULAR)[number];
export const LOGOS_CELULAR = ['inherit', 'left', 'center', 'right'] as const;
export const ORDENES_CELULAR = ['logo-acciones-menu', 'menu-logo-acciones', 'logo-sobre-acciones', 'acciones-sobre-logo'] as const;
export { ANIMACIONES, FONDOS_PANEL, GLIFOS_MENU, ICONOS_ITEM, LISTAS_CATEGORIA, TIPOS_ITEM };

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const en = <T extends string>(l: readonly T[], v: unknown): T | undefined => (typeof v === 'string' && (l as readonly string[]).includes(v) ? (v as T) : undefined);

export function menuCelular(a: Record<string, unknown>): MenuCelular {
  const v = a.mobile_menu_style;
  if (v === 'drawer_right' || v === 'drawer' || v == null || v === '') return 'drawer';
  return en(MENUS_CELULAR, v) ?? 'drawer';
}

export function cambioMenuCelular(a: Record<string, unknown>, v: MenuCelular): Record<string, unknown> {
  if (menuCelular(a) === v) return {};
  return { mobile_menu_style: v };
}

function layout(a: Record<string, unknown>) {
  const h = objeto(a.mobile_header);
  return { h, l: objeto(h?.layout) };
}

function conLayout(a: Record<string, unknown>, parche: Record<string, unknown>): Record<string, unknown> {
  const { h, l } = layout(a);
  const nuevo: Record<string, unknown> = { ...(l ?? {}) };
  for (const [k, v] of Object.entries(parche)) {
    if (v === undefined) delete nuevo[k];
    else nuevo[k] = v;
  }
  const cabecera: Record<string, unknown> = { ...(h ?? {}) };
  if (Object.keys(nuevo).length) cabecera.layout = nuevo;
  else delete cabecera.layout;
  return { mobile_header: Object.keys(cabecera).length ? cabecera : null };
}

export function logoCelular(a: Record<string, unknown>): (typeof LOGOS_CELULAR)[number] {
  const { l } = layout(a);
  const nuevo = en(LOGOS_CELULAR, l?.logo);
  if (nuevo && nuevo !== 'inherit') return nuevo;
  return en(LOGOS_CELULAR, a.mobile_logo_position) ?? 'inherit';
}

export function cambioLogoCelular(a: Record<string, unknown>, v: (typeof LOGOS_CELULAR)[number]): Record<string, unknown> {
  const { l } = layout(a);
  if (l) {
    // Ya lo pinta el encabezado configurable: se cambia ahí (y la clave vieja se iguala).
    return { ...conLayout(a, { logo: v === 'inherit' ? undefined : v }), mobile_logo_position: v === 'inherit' ? null : v };
  }
  return { mobile_logo_position: v === 'inherit' ? null : v };
}

export function ordenCelular(a: Record<string, unknown>): (typeof ORDENES_CELULAR)[number] {
  return en(ORDENES_CELULAR, layout(a).l?.arrangement) ?? 'logo-acciones-menu';
}

export function cambioOrdenCelular(a: Record<string, unknown>, v: (typeof ORDENES_CELULAR)[number]): Record<string, unknown> {
  if (ordenCelular(a) === v) return {};
  // El orden de siempre no se guarda: así el celular sigue con el encabezado de hoy.
  return conLayout(a, { arrangement: v === 'logo-acciones-menu' ? undefined : v });
}

/** Ítem guardado en la forma de la tienda (`show_label`). */
export interface ItemMenuInferior {
  id: string;
  kind: (typeof TIPOS_ITEM)[number];
  label: string;
  icon: string;
  show_label: boolean;
  action: ItemBarra['action'];
  href?: string;
}

const aGuardado = (it: ItemBarra): ItemMenuInferior => ({
  id: it.id,
  kind: it.kind,
  label: it.label,
  icon: it.icon,
  show_label: it.showLabel,
  action: it.action,
  ...(it.href ? { href: it.href } : {}),
});

export function menuInferior(a: Record<string, unknown>): { activo: boolean; items: ItemMenuInferior[] } {
  const b = objeto(objeto(a.mobile_header)?.bottom_nav);
  const leida = leerBarra(b ? { ...b, enabled: true } : { enabled: true });
  return { activo: b?.enabled === true, items: (leida?.items ?? ITEMS_BARRA_INICIALES).map(aGuardado) };
}

function conBarra(a: Record<string, unknown>, parche: Record<string, unknown>): Record<string, unknown> {
  const h = objeto(a.mobile_header) ?? {};
  const b = objeto(h.bottom_nav) ?? {};
  return { mobile_header: { ...h, bottom_nav: { ...b, ...parche } } };
}

export function cambioMenuInferiorActivo(a: Record<string, unknown>, activo: boolean): Record<string, unknown> {
  const { items } = menuInferior(a);
  return conBarra(a, activo ? { enabled: true, items } : { enabled: false });
}

export const MIN_ITEMS = 3;
export const MAX_ITEMS = 5;

export function cambioItemsMenuInferior(a: Record<string, unknown>, items: ItemMenuInferior[]): Record<string, unknown> {
  const lista = items.slice(0, MAX_ITEMS).map((it) => ({ ...it, label: it.label.slice(0, 24), ...(it.href != null ? { href: it.href.trim().slice(0, 300) } : {}) }));
  return conBarra(a, { items: lista });
}

export function itemNuevo(items: readonly ItemMenuInferior[]): ItemMenuInferior {
  const usados = new Set(items.map((i) => i.kind));
  const kind = (['home', 'categories', 'search', 'cart', 'account', 'favorites', 'offers'] as const).find((k) => !usados.has(k)) ?? 'custom';
  const base = leerBarra({ enabled: true, items: [{ kind }, { kind: 'home' }, { kind: 'home' }] })!.items[0];
  let id = kind as string;
  for (let n = 2; items.some((i) => i.id === id); n++) id = `${kind}-${n}`;
  return { ...aGuardado(base), id };
}

/** Cambiar el tipo trae su texto, ícono, acción y enlace de siempre. */
export function itemConTipo(it: ItemMenuInferior, kind: (typeof TIPOS_ITEM)[number]): ItemMenuInferior {
  const base = leerBarra({ enabled: true, items: [{ kind }, { kind: 'home' }, { kind: 'home' }] })!.items[0];
  return { ...aGuardado(base), id: it.id, show_label: it.show_label };
}

// ─── Tarjetas del menú (Figma 1787:903064): «Cajón lateral» con su lado aparte ───────────────────

export const TARJETAS_MENU = ['cajon', 'bottom_sheet', 'fullscreen', 'tabs', 'top_dropdown', 'none'] as const;
export type TarjetaMenu = (typeof TARJETAS_MENU)[number];

export function tarjetaMenu(a: Record<string, unknown>): TarjetaMenu {
  const m = menuCelular(a);
  return m === 'drawer' || m === 'drawer_left' ? 'cajon' : m;
}

export function ladoCajon(a: Record<string, unknown>): 'derecha' | 'izquierda' {
  return menuCelular(a) === 'drawer_left' ? 'izquierda' : 'derecha';
}

export function cambioTarjetaMenu(a: Record<string, unknown>, v: TarjetaMenu): Record<string, unknown> {
  if (v === 'cajon') return tarjetaMenu(a) === 'cajon' ? {} : { mobile_menu_style: 'drawer' };
  return cambioMenuCelular(a, v);
}

export function cambioLadoCajon(a: Record<string, unknown>, lado: 'derecha' | 'izquierda'): Record<string, unknown> {
  return cambioMenuCelular(a, lado === 'izquierda' ? 'drawer_left' : 'drawer');
}

// ─── Panel del menú (`mobile_header.panel`) ───────────────────────────────────────────────────────

/** Valores con los que la tienda pinta el panel cuando no hay nada guardado (`leerPanel`). */
export const PANEL_POR_DEFECTO = { width: 85, background: 'color', overlay: 50, animation: 'slide', show_logo: false, show_search: false, show_social: false, show_contact: false, categories: 'accordion' } as const;
export type ClavePanel = keyof typeof PANEL_POR_DEFECTO | 'color' | 'gradient_1' | 'gradient_2';

export function panelMenu(a: Record<string, unknown>): Record<string, unknown> {
  const p = objeto(objeto(a.mobile_header)?.panel) ?? {};
  return { ...PANEL_POR_DEFECTO, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v != null && v !== '')) };
}

/**
 * Cambia una opción del panel. El valor de siempre no se guarda: con el panel vacío la tienda
 * sigue con el menú de hoy (cualquier clave del panel pasa el celular al encabezado configurable).
 */
export function cambioPanel(a: Record<string, unknown>, clave: ClavePanel, valor: unknown): Record<string, unknown> {
  const h = objeto(a.mobile_header) ?? {};
  const p: Record<string, unknown> = { ...(objeto(h.panel) ?? {}) };
  const def = (PANEL_POR_DEFECTO as Record<string, unknown>)[clave];
  if (valor == null || valor === '' || valor === def) delete p[clave];
  else p[clave] = valor;
  if (clave === 'background' && valor !== 'gradient') {
    delete p.gradient_1;
    delete p.gradient_2;
  }
  const cabecera: Record<string, unknown> = { ...h };
  if (Object.keys(p).length) cabecera.panel = p;
  else delete cabecera.panel;
  return { mobile_header: Object.keys(cabecera).length ? cabecera : null };
}

// ─── Íconos (`mobile_header.icons`) ──────────────────────────────────────────────────────────────

function conIconos(a: Record<string, unknown>, clave: string, valor: unknown): Record<string, unknown> {
  const h = objeto(a.mobile_header) ?? {};
  const i: Record<string, unknown> = { ...(objeto(h.icons) ?? {}) };
  if (valor === undefined) delete i[clave];
  else i[clave] = valor;
  const cabecera: Record<string, unknown> = { ...h };
  if (Object.keys(i).length) cabecera.icons = i;
  else delete cabecera.icons;
  return { mobile_header: Object.keys(cabecera).length ? cabecera : null };
}

export function glifoMenu(a: Record<string, unknown>): (typeof GLIFOS_MENU)[number] {
  return en(GLIFOS_MENU, objeto(objeto(a.mobile_header)?.icons)?.menu) ?? 'lines3';
}

/** Tres líneas es el ícono de siempre: elegirlo quita la clave. */
export function cambioGlifoMenu(a: Record<string, unknown>, v: (typeof GLIFOS_MENU)[number]): Record<string, unknown> {
  if (glifoMenu(a) === v) return {};
  return conIconos(a, 'menu', v === 'lines3' ? undefined : v);
}

/**
 * Estilo de los íconos del celular. El círculo se elige en «Círculo acento» (una opción para
 * computador y celular); aquí queda «Como en computador» o «Con borde».
 */
export function bordeIconos(a: Record<string, unknown>): boolean {
  return objeto(objeto(a.mobile_header)?.icons)?.style === 'border';
}

export function cambioBordeIconos(a: Record<string, unknown>, borde: boolean): Record<string, unknown> {
  if (bordeIconos(a) === borde) return {};
  return conIconos(a, 'style', borde ? 'border' : undefined);
}

// ─── Buscador del celular (`mobile_header.search`) ───────────────────────────────────────────────

/** El estilo (ícono, barra, oculto) es la opción única «Buscador»; aquí solo cómo abre el ícono. */
export function buscadorPantallaCompleta(a: Record<string, unknown>): boolean {
  return objeto(a.mobile_header)?.search === 'fullscreen';
}

export function muestraBuscadorPantallaCompleta(a: Record<string, unknown>): boolean {
  const s = objeto(a.mobile_header)?.search;
  if (s === 'fullscreen' || s === 'icon') return true;
  if (s === 'bar') return false;
  // Igual que `buscadorMovil` de la tienda (lib/website/opcionUnica.ts).
  const propio = a.mobile_search_style;
  if (propio === 'icon' || propio === 'bar' || propio === 'hidden') return propio === 'icon';
  if (propio === null) return (a.search_style ?? 'icon') === 'icon';
  return true;
}

export function cambioBuscadorPantallaCompleta(a: Record<string, unknown>, si: boolean): Record<string, unknown> {
  const h = objeto(a.mobile_header) ?? {};
  const cabecera: Record<string, unknown> = { ...h };
  if (si) cabecera.search = 'fullscreen';
  else delete cabecera.search;
  return { mobile_header: Object.keys(cabecera).length ? cabecera : null };
}

// ─── Medidas, fijo, breakpoint e íconos (antes solo en «anteriores») ─────────────────────────────

export const BREAKPOINTS_CELULAR = [640, 768, 1024] as const;
/** 1024 es lo de hoy (la tienda usa `mobile_breakpoint || 1024`): elegirlo guarda `null`. */
export function breakpointCelular(a: Record<string, unknown>): (typeof BREAKPOINTS_CELULAR)[number] {
  const v = a.mobile_breakpoint;
  return (BREAKPOINTS_CELULAR as readonly unknown[]).includes(v) ? (v as (typeof BREAKPOINTS_CELULAR)[number]) : 1024;
}

export function cambioBreakpointCelular(a: Record<string, unknown>, v: (typeof BREAKPOINTS_CELULAR)[number]): Record<string, unknown> {
  if (breakpointCelular(a) === v && (v !== 1024 || a.mobile_breakpoint == null)) return {};
  return { mobile_breakpoint: v === 1024 ? null : v };
}

type MedidaLayout = 'logo_size' | 'header_height';
const RANGO_MEDIDA: Record<MedidaLayout, [number, number]> = { logo_size: [24, 96], header_height: [48, 120] };

/** Tamaño del logo y alto del encabezado (px). `null` = automático, lo de hoy. */
export function medidaCelular(a: Record<string, unknown>, k: MedidaLayout): number | null {
  const v = layout(a).l?.[k];
  const [min, max] = RANGO_MEDIDA[k];
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null;
}

export function cambioMedidaCelular(a: Record<string, unknown>, k: MedidaLayout, v: number | null): Record<string, unknown> {
  const [min, max] = RANGO_MEDIDA[k];
  // Fuera del rango no se guarda (se está escribiendo, p. ej. «6» camino a «64»).
  if (v != null && (!Number.isFinite(v) || v < min || v > max)) return {};
  const valor = v == null ? undefined : Math.round(v);
  if ((valor ?? null) === medidaCelular(a, k)) return {};
  return conLayout(a, { [k]: valor });
}

export const ICONOS_VISIBLES = ['show_menu', 'show_search', 'show_cart', 'show_account'] as const;
export type IconoVisible = (typeof ICONOS_VISIBLES)[number];
/** Mostrar u ocultar cada ícono. Visible es lo de hoy: encenderlo quita la clave. */
export function iconoVisible(a: Record<string, unknown>, k: IconoVisible): boolean {
  const v = objeto(objeto(a.mobile_header)?.icons)?.[k];
  // La cuenta no sale hoy en el encabezado del celular: visible solo si se pidió.
  return k === 'show_account' ? v === true : v !== false;
}
export function cambioIconoVisible(a: Record<string, unknown>, k: IconoVisible, si: boolean): Record<string, unknown> {
  if (iconoVisible(a, k) === si) return {};
  if (k === 'show_account') return conIconos(a, k, si ? true : undefined);
  return conIconos(a, k, si ? undefined : false);
}

/**
 * Color de los íconos del celular. Fuente única: `header_mobile_icon_color` (lo pintan todos los
 * encabezados del celular). El `icons.color` viejo se lee como respaldo y se quita al cambiar.
 */
export function colorIconosCelular(a: Record<string, unknown>): string | null {
  const viejo = objeto(objeto(a.mobile_header)?.icons)?.color;
  if (typeof viejo === 'string' && viejo) return viejo;
  return typeof a.header_mobile_icon_color === 'string' && a.header_mobile_icon_color ? a.header_mobile_icon_color : null;
}
export function cambioColorIconosCelular(a: Record<string, unknown>, color: string | null): Record<string, unknown> {
  const tieneViejo = objeto(objeto(a.mobile_header)?.icons)?.color !== undefined;
  return { ...(tieneViejo ? conIconos(a, 'color', undefined) : {}), header_mobile_icon_color: color };
}

// ─── Una sola opción para computador y celular: «Al bajar» y «Sobre portada» ─────────────────────

/**
 * Ajustes del celular guardados antes con un valor distinto al de computador. La tienda los sigue
 * respetando (nada cambia); el panel no muestra un segundo control, solo un aviso para igualarlos.
 */
export function ajustesDistintosCelular(a: Record<string, unknown>): string[] {
  const { l } = layout(a);
  const fijoPc = a.header_sticky !== false;
  const scroll = typeof a.header_scroll === 'string' ? a.header_scroll : '';
  const ocultaPc = fijoPc && (scroll === 'ocultar_al_bajar' || scroll === 'ocultar_y_encoger');
  const sobrePc = (a.header_style === 'transparent' && a.header_transparent_over_hero !== false) || a.header_transparent_over_hero === true;
  const d: string[] = [];
  if (typeof a.mobile_sticky_header === 'boolean' && a.mobile_sticky_header !== fijoPc) d.push('fijo');
  else if (typeof l?.sticky === 'boolean' && l.sticky !== fijoPc) d.push('fijo');
  if (l?.hide_on_scroll === true && !ocultaPc) d.push('ocultar');
  if (l?.transparent_hero === true && !sobrePc) d.push('transparente');
  return d;
}

/** «Igualar»: el celular vuelve a seguir «Al bajar» y «Sobre portada» de computador. */
export function cambioIgualarCelular(a: Record<string, unknown>): Record<string, unknown> {
  const { l } = layout(a);
  const cambio: Record<string, unknown> = {};
  if (a.mobile_sticky_header != null) cambio.mobile_sticky_header = null;
  if (l && ('sticky' in l || 'hide_on_scroll' in l || 'transparent_hero' in l)) {
    Object.assign(cambio, conLayout(a, { sticky: undefined, hide_on_scroll: undefined, transparent_hero: undefined }));
  }
  return cambio;
}
