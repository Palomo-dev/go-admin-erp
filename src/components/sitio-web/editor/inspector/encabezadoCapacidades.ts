/**
 * Lo que antes solo hacía el Constructor del encabezado, ahora en Encabezado (una opción por
 * función): caja de los íconos (forma, tamaño, degradado, sombra, hover), botones 3 a 6, menús
 * adicionales y los tipos de buscador. Nada se escribe al abrir: sin valor, la tienda no cambia.
 * `header_icons_box` usa el formato de `header_builder.icon_container`, que se sigue leyendo.
 */
import { circuloAcentoActivo, cambioCirculoAcento } from './anterioresLogica';

type Ajustes = Record<string, unknown>;
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Las mismas formas que acepta la tienda (FORMAS_CONTENEDOR en constructorEncabezado.ts). */
export const FORMAS_CAJA = ['none', 'circle', 'square', 'rounded', 'semi', 'squircle'] as const;
export const TAMANOS_ICONO = [20, 22, 28] as const;
export const SOMBRAS_CAJA = ['none', 'sm', 'md', 'lg'] as const;
export const BUSCADORES = ['icon', 'bar', 'mini', 'icon_overlay', 'mega', 'pill_floating', 'hidden'] as const;
export const BOTONES_EXTRA = [3, 4, 5, 6] as const;
export const MENUS_EXTRA = [2, 3, 4] as const;

/** La caja guardada: la de Encabezado o, sin ella, la del Constructor (sin escribir nada). */
export function cajaIconos(a: Ajustes): Record<string, unknown> | null {
  return objeto(a.header_icons_box) ?? objeto(objeto(a.header_builder)?.icon_container);
}

export function formaCaja(a: Ajustes): string {
  const c = cajaIconos(a);
  if (c && typeof c.shape === 'string') return c.shape;
  return circuloAcentoActivo(a) ? 'circle' : 'none';
}

export function tamanoIcono(a: Ajustes): number | null {
  const n = cajaIconos(a)?.icon;
  return typeof n === 'number' ? n : null;
}

/** Base para escribir la caja: la guardada o, desde el «Círculo acento», sus colores. */
function base(a: Ajustes): Record<string, unknown> {
  const c = cajaIconos(a);
  if (c) return { ...c };
  if (circuloAcentoActivo(a)) {
    const b: Record<string, unknown> = { shape: 'circle', scope: 'all', background: (a.header_icons_circle_bg as string) || 'accent' };
    if (a.header_icons_circle_fg) b.icon_color = a.header_icons_circle_fg;
    return b;
  }
  return { shape: 'none', scope: 'all' };
}

/** Cambia una parte de la caja. Pasar de «Círculo acento» a la caja apaga el círculo (no se pintan dos). */
export function cambioCaja(a: Ajustes, parte: Record<string, unknown>): Ajustes {
  const sig = { ...base(a), ...parte };
  for (const k of Object.keys(sig)) if (sig[k] === null || sig[k] === undefined) delete sig[k];
  const cambio: Ajustes = { header_icons_box: sig };
  if (!objeto(a.header_icons_box) && !cajaIconos(a) && circuloAcentoActivo(a)) Object.assign(cambio, cambioCirculoAcento(a, false));
  return cambio;
}

/**
 * Forma: «Círculo» sin caja guardada sigue siendo el «Círculo acento» de siempre; «Sin caja» lo
 * apaga. Cuadrado y redondeado (o cualquier forma con caja guardada) van a la caja.
 */
export function cambioForma(a: Ajustes, forma: string): Ajustes {
  if (!cajaIconos(a) && (forma === 'circle' || forma === 'none')) return cambioCirculoAcento(a, forma === 'circle');
  const actual = base(a);
  // Sin caja: se limpian fondo, degradado, sombra, opacidad, borde y hover (no quedan colores escondidos que vuelvan solos).
  if (forma === 'none') {
    return cambioCaja(a, {
      shape: 'none',
      background: null,
      gradient_1: null,
      gradient_2: null,
      shadow: null,
      shadow_color: null,
      opacity: null,
      border_width: null,
      border_color: null,
      border_style: null,
      hover_background: null,
      hover_scale: null,
    });
  }
  return cambioCaja(a, { shape: forma, background: actual.background ?? 'accent' });
}

export function cambioTamano(a: Ajustes, n: number | null): Ajustes {
  return cambioCaja(a, { icon: n });
}

export interface EnlaceMenu { label: string; href: string }

export function enlacesMenu(a: Ajustes, n: number): EnlaceMenu[] {
  const v = a[`header_menu${n}_links`];
  return Array.isArray(v) ? v.map((x) => objeto(x)).filter((x): x is Record<string, unknown> => !!x).map((x) => ({ label: String(x.label ?? ''), href: String(x.href ?? '') })) : [];
}

/** Menús y botones adicionales con algo guardado (para mostrarlos al abrir). */
export function menusConValor(a: Ajustes): number[] {
  return MENUS_EXTRA.filter((n) => (typeof a[`header_menu${n}_label`] === 'string' && a[`header_menu${n}_label`]) || enlacesMenu(a, n).length > 0);
}
export function botonesConValor(a: Ajustes): number[] {
  return BOTONES_EXTRA.filter((n) => a[`header_cta${n}_text`] || a[`header_cta${n}_url`]);
}

/** Estilo de los botones 3 a 6 (`header_extra_buttons_style`, igual que la tienda): sin valor = «Con borde». */
export const ESTILOS_BOTONES_EXTRA = ['outline', 'solid', 'text'] as const;
export type EstiloBotonesExtra = (typeof ESTILOS_BOTONES_EXTRA)[number];
export function estiloBotonesExtra(a: Record<string, unknown>): EstiloBotonesExtra {
  const v = a.header_extra_buttons_style;
  return v === 'solid' || v === 'text' ? v : 'outline';
}
