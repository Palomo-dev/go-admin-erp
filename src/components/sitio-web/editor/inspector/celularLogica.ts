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
import { ICONOS_ITEM, ITEMS_BARRA_INICIALES, TIPOS_ITEM, leerBarra, type ItemBarra } from '@/lib/website/menuMovil';

export const MENUS_CELULAR = ['drawer', 'drawer_left', 'bottom_sheet', 'top_dropdown', 'fullscreen', 'tabs', 'none'] as const;
export type MenuCelular = (typeof MENUS_CELULAR)[number];
export const LOGOS_CELULAR = ['inherit', 'left', 'center', 'right'] as const;
export const ORDENES_CELULAR = ['logo-acciones-menu', 'menu-logo-acciones', 'logo-sobre-acciones', 'acciones-sobre-logo'] as const;
export { ICONOS_ITEM, TIPOS_ITEM };

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
