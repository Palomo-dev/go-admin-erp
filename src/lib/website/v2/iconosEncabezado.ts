/**
 * Icono de una acción del encabezado.
 *
 * Precedencia: icono propio subido, icono nombrado en header_icons, columna
 * legacy (`cart_icon` y compañía), forma del carrito si no pisa un icono distinto,
 * y al final el de hoy.
 */

export type AccionEncabezado = 'search' | 'cart' | 'account' | 'currency';

const POR_DEFECTO: Record<AccionEncabezado, string> = {
  search: 'search',
  cart: 'shopping-bag',
  account: 'user',
  currency: 'globe',
};

const COLUMNA: Record<AccionEncabezado, string> = {
  search: 'search_icon',
  cart: 'cart_icon',
  account: 'auth_icon',
  currency: 'currency_icon',
};

const FORMAS = new Set(['shopping-bag', 'shopping-cart']);

export interface IconoResuelto {
  nombre: string;
  url: string | null;
}

interface AjustesIcono {
  header_icons?: unknown;
  header_cart_glyph?: unknown;
  cart_icon?: unknown;
  search_icon?: unknown;
  auth_icon?: unknown;
  currency_icon?: unknown;
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio ? limpio : null;
}

function propio(ajustes: AjustesIcono, accion: AccionEncabezado): { icono: string | null; url: string | null } {
  const mapa = ajustes.header_icons;
  if (!mapa || typeof mapa !== 'object') return { icono: null, url: null };
  const fila = (mapa as Record<string, unknown>)[accion];
  if (!fila || typeof fila !== 'object') return { icono: null, url: null };
  const f = fila as Record<string, unknown>;
  return { icono: texto(f.icono), url: texto(f.iconoUrl) };
}

export function resolverIconoEncabezado(accion: AccionEncabezado, ajustes: AjustesIcono | null | undefined): IconoResuelto {
  const a = ajustes ?? {};
  const subido = propio(a, accion);
  if (subido.url) return { nombre: subido.icono ?? POR_DEFECTO[accion], url: subido.url };
  if (subido.icono) return { nombre: subido.icono, url: null };
  const legacy = texto(a[COLUMNA[accion] as keyof AjustesIcono]);
  if (accion === 'cart' && (a.header_cart_glyph === 'carrito' || a.header_cart_glyph === 'bolsa')) {
    const forma = a.header_cart_glyph === 'carrito' ? 'shopping-cart' : 'shopping-bag';
    if (legacy && !FORMAS.has(legacy)) return { nombre: legacy, url: null };
    return { nombre: forma, url: null };
  }
  if (legacy) return { nombre: legacy, url: null };
  return { nombre: POR_DEFECTO[accion], url: null };
}
