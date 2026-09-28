/**
 * Pestaña de un carrito (`src/components/pos/CartTabs.tsx`), L12 del plan.
 * Extracción literal: qué nombre, qué total y cuántas líneas muestra la
 * pestaña, y cuándo se puede cerrar. Los textos («Carrito N») los pone el
 * componente.
 */
import type { Cart } from '@/components/pos/types';

export interface EtiquetaPestana {
  /** Primer nombre del cliente, truncado a 8 letras + «...»; null si el carrito no tiene cliente. */
  cliente: string | null;
  /** Número de la pestaña (posición + 1) para «Carrito N» cuando no hay cliente. */
  numero: number;
  /** El total solo se muestra si es mayor que cero. */
  mostrarTotal: boolean;
  total: number;
  /** Nº de líneas (no de unidades); solo se muestra si hay alguna. */
  lineas: number;
  enEspera: boolean;
}

export function etiquetaPestana(cart: Pick<Cart, 'customer' | 'total' | 'items' | 'status'>, index: number): EtiquetaPestana {
  let cliente: string | null = null;
  if (cart.customer) {
    const firstName = cart.customer.full_name.split(' ')[0];
    cliente = firstName.length > 8 ? firstName.substring(0, 8) + '...' : firstName;
  }
  return {
    cliente,
    numero: index + 1,
    mostrarTotal: cart.total > 0,
    total: cart.total,
    lineas: cart.items.length,
    enEspera: cart.status === 'hold',
  };
}

/** La «X» de la pestaña (y su confirmación) solo existe con más de un carrito. */
export function puedeCerrarPestana(totalCarritos: number): boolean {
  return totalCarritos > 1;
}
