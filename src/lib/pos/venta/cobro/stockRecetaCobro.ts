/**
 * Stock de ingredientes antes de cobrar (POS-PLAN §2.6, L49), movido
 * LITERALMENTE de `CheckoutDialog.tsx`. Los servicios llegan inyectados para
 * probarlo sin red.
 *
 * - La comprobación es previa y orientativa: si falta stock de una receta, el
 *   diálogo pide confirmación («¿Deseas continuar…?») y el cajero decide.
 * - Desktop sin red (fase 4B): si la comprobación falla (la receta puede no
 *   estar en caché), NO impide la venta: cuenta como «hay stock».
 * - En el navegador un fallo de la comprobación sigue cortando el cobro, como
 *   siempre (el error sube al `catch` del diálogo).
 */

import type { CompositeStockValidation } from '@/lib/services/compositeStockValidation';

export interface ServiciosStockReceta {
  /** `validateCompositeStock` de `@/lib/services/compositeStockValidation`. */
  validar: (items: { product_id?: number; quantity: number }[], branchId: number) => Promise<CompositeStockValidation>;
  /** `isDesktop` de `@/lib/utils/desktop`. */
  esDesktop: () => boolean;
}

export async function comprobarStockReceta(
  items: { product_id?: number; quantity: number }[],
  branchId: number,
  { validar, esDesktop }: ServiciosStockReceta,
): Promise<CompositeStockValidation> {
  let stockCheck: CompositeStockValidation;
  try {
    stockCheck = await validar(items, branchId);
  } catch (stockCheckError) {
    // Desktop sin red (fase 4B): la receta puede no estar en caché. La
    // comprobación es previa y orientativa; no debe impedir la venta.
    // En navegador se conserva el comportamiento de siempre.
    if (!esDesktop()) throw stockCheckError;
    console.warn('[checkout] No se pudo validar stock de ingredientes (sin red):', stockCheckError);
    stockCheck = { ok: true };
  }
  return stockCheck;
}

/** ¿Hay que pedir confirmación al cajero? Solo con faltante y mensaje que mostrar. */
export function debeConfirmarStock(stockCheck: CompositeStockValidation): stockCheck is CompositeStockValidation & { message: string } {
  return !stockCheck.ok && !!stockCheck.message;
}
