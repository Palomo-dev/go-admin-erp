/**
 * Menú inferior del celular v2 en el editor (Encabezado › Celular › Menú inferior). Modelo y
 * lectura en `@/lib/website/menuInferior` (copia idéntica de la tienda).
 *
 * - Sin `v: 2` guardado, el panel muestra los botones que la tienda pinta hoy (`menuInicial`) y no
 *   escribe nada. El primer cambio guarda el menú entero con `v: 2` en `mobile_header.bottom_nav`.
 * - Apagar no borra los botones (`enabled: false`).
 */
import {
  ACCIONES_MENU,
  DEFECTO_ACCION,
  MAX_BOTONES,
  aGuardar,
  menuInicial,
  type AccionMenu,
  type BotonMenu,
  type FuenteMenu,
  type MenuInferior,
  type VarianteMenu,
} from '@/lib/website/menuInferior';

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function menuDelEditor(a: Record<string, unknown>, giro?: string | null): { menu: MenuInferior; fuente: FuenteMenu } {
  return menuInicial(a, { restaurante: giro === 'restaurante' });
}

/** Parche: el menú entero con `v: 2` (las demás claves de `mobile_header` se conservan). */
export function cambioMenuV2(a: Record<string, unknown>, menu: MenuInferior): Record<string, unknown> {
  const h = objeto(a.mobile_header) ?? {};
  return { mobile_header: { ...h, bottom_nav: aGuardar(menu) } };
}

/** «Abrir menú» solo funciona si el encabezado del celular tiene botón de menú. */
export function accionesDisponibles(a: Record<string, unknown>): AccionMenu[] {
  const estilo = typeof a.mobile_menu_style === 'string' ? a.mobile_menu_style : 'drawer';
  const sinMenu = estilo === 'tabs' || estilo === 'none';
  return ACCIONES_MENU.filter((x) => !(x === 'menu' && sinMenu));
}

const ORDEN_NUEVO: readonly AccionMenu[] = ['home', 'categories_modal', 'search', 'cart', 'account', 'whatsapp', 'call', 'location', 'page'];

export function botonNuevo(items: readonly BotonMenu[], disponibles: readonly AccionMenu[] = ACCIONES_MENU): BotonMenu {
  const usadas = new Set(items.map((i) => i.action));
  const action = ORDEN_NUEVO.find((x) => !usadas.has(x) && disponibles.includes(x)) ?? 'page';
  let id: string = action;
  for (let n = 2; items.some((i) => i.id === id); n++) id = `${action}-${n}`;
  return { id, action, ...DEFECTO_ACCION[action], visible: true, ...(action === 'page' ? { target: '/' } : {}) };
}

/** Cambia la acción: texto e ícono pasan a los de la acción nueva si seguían los de la anterior. */
export function botonConAccion(b: BotonMenu, action: AccionMenu): BotonMenu {
  const antes = DEFECTO_ACCION[b.action];
  const ahora = DEFECTO_ACCION[action];
  return {
    id: b.id,
    action,
    label: b.label === antes.label || !b.label.trim() ? ahora.label : b.label,
    icon: b.icon === antes.icon ? ahora.icon : b.icon,
    visible: b.visible,
    ...(action === 'page' ? { target: '/' } : {}),
  };
}

export function mover<T>(lista: readonly T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= lista.length) return [...lista];
  const l = [...lista];
  [l[i], l[j]] = [l[j], l[i]];
  return l;
}

/** Cambiar de variante: si hay más botones que el máximo, se quedan los primeros. */
export function conVariante(m: MenuInferior, variant: VarianteMenu): MenuInferior {
  const items = m.items.slice(0, MAX_BOTONES[variant]);
  const ids = items.map((i) => i.id);
  const style = { ...m.style };
  if (style.centerId && (variant !== 'tabs' || !ids.includes(style.centerId))) delete style.centerId;
  if (style.primaryId && (variant !== 'actions' || !ids.includes(style.primaryId))) delete style.primaryId;
  return { ...m, variant, items, style };
}

/** Qué falta para que el botón se vea en la tienda (null = nada). */
export type AvisoBoton = 'destinoPagina' | 'destinoUrl' | null;
export function avisoBoton(b: BotonMenu): AvisoBoton {
  const t = b.target?.trim() ?? '';
  if (b.action === 'page' && !t.startsWith('/')) return 'destinoPagina';
  if (b.action === 'url' && !/^(https?:\/\/|mailto:|tel:)/i.test(t)) return 'destinoUrl';
  return null;
}

/** Tipo de destino que se escribe en cada acción (null = no lleva). */
export type CampoDestino = 'telefono' | 'whatsapp' | 'direccion' | 'ruta' | 'url' | 'rutaOpcional' | null;
export function campoDestino(action: AccionMenu): CampoDestino {
  switch (action) {
    case 'call': return 'telefono';
    case 'whatsapp': return 'whatsapp';
    case 'location': return 'direccion';
    case 'page': return 'ruta';
    case 'url': return 'url';
    case 'booking': case 'order': case 'account': return 'rutaOpcional';
    default: return null;
  }
}
