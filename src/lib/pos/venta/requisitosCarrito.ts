/**
 * Botones de acción del carrito (`src/components/pos/CartView.tsx`): «Cobrar»,
 * «Cobrar» de un carrito en deuda y «Deuda». L33, L35 y L36 del plan.
 *
 * - Sin caja (decisión D4, paso 7): el botón pasa a «Abrir caja para cobrar
 *   · F9» (`sin-caja`) SOLO si la organización exige caja
 *   (`pos_require_cash_session`, la misma configuración que revisa el cobro
 *   al abrirse). Sin la exigencia se cobra sin caja, como ya permitía el
 *   cobro. Si la configuración no se conoce, se exige (el valor por defecto
 *   de la configuración es exigirla).
 * - El «Cobrar» de un carrito en deuda no exige caja.
 * - «Deuda» exige cliente y un carrito que no esté en espera ni en deuda. El
 *   servicio (`POSService.holdCartWithDebt`) exige además líneas, total > 0 y
 *   estado activo, y rechaza con su mensaje lo que el botón deja pasar.
 */
import type { Cart } from '@/components/pos/types';

export type EstadoBotonCobrar = 'sin-caja' | 'vacio' | 'bloqueado' | 'listo';

type CarritoParaCobrar = Pick<Cart, 'items' | 'status'>;

/**
 * Estado del botón «Cobrar» del carrito:
 * - `vacio`: sin líneas (hoy la botonera ni se pinta);
 * - `bloqueado`: en espera o en deuda (deshabilitado);
 * - `sin-caja`: no hay caja abierta y la organización la exige («Abrir caja para cobrar · F9»);
 * - `listo`: se puede cobrar.
 */
export function estadoBotonCobrar({ caja, config, carrito }: {
  caja: boolean;
  config?: { requiereCaja?: boolean };
  carrito: CarritoParaCobrar;
}): EstadoBotonCobrar {
  if (carrito.items.length === 0) return 'vacio';
  if (carrito.status === 'hold' || carrito.status === 'hold_with_debt') return 'bloqueado';
  if (!caja && config?.requiereCaja !== false) return 'sin-caja';
  return 'listo';
}

/** El carrito está en deuda: se muestran Ver factura, Imprimir, Cobrar y Anular. */
export function esCarritoEnDeuda(carrito: Pick<Cart, 'status'>): boolean {
  return carrito.status === 'hold_with_debt';
}

/**
 * «Cobrar» de un carrito en deuda (reactiva temporalmente para el cobro).
 * NO exige caja: por eso no la recibe.
 */
export function puedeCobrarDeuda(carrito: Pick<Cart, 'status'>): boolean {
  return esCarritoEnDeuda(carrito);
}

/**
 * Botón «Deuda» del carrito (abre el diálogo): con cliente asignado y el
 * carrito ni en espera ni ya en deuda. Solo existe con líneas (sin líneas la
 * botonera no se pinta).
 */
export function puedeRegistrarDeuda(carrito: Pick<Cart, 'items' | 'status' | 'customer_id'>): boolean {
  if (carrito.items.length === 0) return false;
  const isOnHold = carrito.status === 'hold';
  const isOnHoldWithDebt = carrito.status === 'hold_with_debt';
  const hasCustomer = !!carrito.customer_id;
  return !(isOnHold || isOnHoldWithDebt || !hasCustomer);
}

/** «Registrar deuda» del diálogo: motivo escrito y cliente asignado. */
export function puedeConfirmarDeuda(carrito: Pick<Cart, 'customer_id'>, motivo: string): boolean {
  return !!motivo.trim() && !!carrito.customer_id;
}
