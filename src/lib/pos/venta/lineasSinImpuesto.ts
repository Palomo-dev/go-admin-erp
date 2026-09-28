/**
 * Líneas del carrito que se cobrarán sin impuesto porque ni el producto ni la
 * organización lo tienen configurado (etiqueta «Sin impuesto» en la línea y
 * aviso en el cobro), L30 del plan. Extracción literal de la forma en que
 * `CartView` le pasa las líneas a `useLineasSinImpuesto`; la regla es
 * `lineaQuedaSinImpuesto` (`taxCoverage.ts`), la misma de `resolveLineTax`.
 */
import type { CartItem } from '@/components/pos/types';
import type { LineaConNombre } from '@/hooks/useLineasSinImpuesto';

export function lineasParaAviso(items: CartItem[]): LineaConNombre[] {
  return items.map((it) => ({
    nombre: it.product?.name ?? '',
    productId: it.product_id ?? null,
    taxRate: it.tax_rate ?? null,
    taxExcluded: it.tax_excluded ?? null,
  }));
}
