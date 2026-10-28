/**
 * Íconos de las acciones del encabezado (buscar, carrito, cuenta, moneda). La tienda ya los lee con
 * `resolverIconoEncabezado` (copia idéntica en goadmin-websites): `header_icons[accion]` (propio) ›
 * columna (`search_icon`, `cart_icon`, `auth_icon`, `currency_icon`) › `header_cart_glyph` › el de hoy.
 * Los nombres son los del `ICON_MAP` de la tienda (HeaderShared): fuera de él, la tienda pinta el de hoy.
 */
import { Banknote, CircleUser, Coins, DollarSign, Gift, Globe, Package, ScanSearch, Search, ShoppingBag, ShoppingCart, User, UserCircle, UserRound, Wallet, type LucideIcon } from 'lucide-react';
import { resolverIconoEncabezado, type AccionEncabezado } from '@/lib/website/v2/iconosEncabezado';

export const ACCIONES_ICONO: readonly AccionEncabezado[] = ['search', 'cart', 'account', 'currency'];

export const OPCIONES_ICONO_ACCION: Record<AccionEncabezado, readonly string[]> = {
  search: ['search', 'scan-search'],
  cart: ['shopping-bag', 'shopping-cart', 'package', 'gift'],
  account: ['user', 'user-circle', 'user-round', 'circle-user'],
  currency: ['globe', 'coins', 'wallet', 'banknote', 'dollar-sign'],
};

export const ICONOS_LUCIDE_ENCABEZADO: Record<string, LucideIcon> = {
  search: Search,
  'search-lg': Search,
  'scan-search': ScanSearch,
  'shopping-bag': ShoppingBag,
  'shopping-cart': ShoppingCart,
  package: Package,
  gift: Gift,
  user: User,
  'user-circle': UserCircle,
  'user-round': UserRound,
  'circle-user': CircleUser,
  globe: Globe,
  coins: Coins,
  wallet: Wallet,
  banknote: Banknote,
  'dollar-sign': DollarSign,
};

const COLUMNA: Record<AccionEncabezado, string> = { search: 'search_icon', cart: 'cart_icon', account: 'auth_icon', currency: 'currency_icon' };

/** El ícono que hoy pinta la tienda para esa acción. */
export function iconoAccionEncabezado(a: Record<string, unknown>, accion: AccionEncabezado): string {
  return resolverIconoEncabezado(accion, a).nombre;
}

/**
 * Elegir un ícono: se escribe la columna de la acción. Lo que tendría prioridad sobre ella se limpia
 * (la fila de `header_icons` de esa acción y, en el carrito, `header_cart_glyph`) para que se vea.
 */
export function cambioIconoAccion(a: Record<string, unknown>, accion: AccionEncabezado, nombre: string): Record<string, unknown> {
  const cambio: Record<string, unknown> = { [COLUMNA[accion]]: nombre };
  if (accion === 'cart' && a.header_cart_glyph != null) cambio.header_cart_glyph = null;
  const mapa = a.header_icons;
  if (mapa && typeof mapa === 'object' && !Array.isArray(mapa) && accion in (mapa as Record<string, unknown>)) {
    const resto = { ...(mapa as Record<string, unknown>) };
    delete resto[accion];
    cambio.header_icons = Object.keys(resto).length ? resto : null;
  }
  return cambio;
}
