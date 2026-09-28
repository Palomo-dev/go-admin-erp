/**
 * L30 (docs/implementacion/POS-PLAN.md §2.3): líneas que se cobrarán sin
 * impuesto (etiqueta «Sin impuesto» en la línea del carrito). `lineasParaAviso`
 * es la extracción literal de cómo `CartView.tsx` le pasa las líneas a
 * `useLineasSinImpuesto`; la regla es `lineaQuedaSinImpuesto` (taxCoverage,
 * ya probada en `src/lib/services/__tests__/taxCoverage.test.ts`). Aquí se
 * fija la cadena completa desde las líneas del carrito.
 */
import { lineasParaAviso } from '@/lib/pos/venta/lineasSinImpuesto';
import { lineaQuedaSinImpuesto, type TaxCoverage } from '@/lib/services/taxCoverage';
import type { CartItem } from '@/components/pos/types';

const item = (id: string, product_id: number, extra: Partial<CartItem> = {}) =>
  ({ id, product_id, product: { id: product_id, name: `P${product_id}` }, quantity: 1, unit_price: 1000, ...extra }) as CartItem;

const cobertura = (defaultRate: number, configurados: number[]): TaxCoverage => ({
  defaultRate,
  configuredProductIds: new Set(configurados),
  productUuids: new Map(),
});

const marcadas = (items: CartItem[], c: TaxCoverage) =>
  lineasParaAviso(items).map((l, i) => (lineaQuedaSinImpuesto(l, c) ? i : -1)).filter((i) => i >= 0);

describe('líneas sin impuesto (L30)', () => {
  it('lleva nombre, producto, tasa y «Excluir impuesto» de cada línea, en el mismo orden', () => {
    expect(lineasParaAviso([item('a', 1, { tax_rate: 19, tax_excluded: true }), item('b', 2)])).toEqual([
      { nombre: 'P1', productId: 1, taxRate: 19, taxExcluded: true },
      { nombre: 'P2', productId: 2, taxRate: null, taxExcluded: null },
    ]);
  });

  it('sin impuesto por defecto: se marcan las líneas sin tasa, sin excluir y cuyo producto no tiene impuesto', () => {
    const items = [
      item('con-tasa', 1, { tax_rate: 8 }),
      item('excluida', 2, { tax_excluded: true }),
      item('configurado', 3),
      item('huerfana', 4),
    ];
    expect(marcadas(items, cobertura(0, [3]))).toEqual([3]);
  });

  it('con un impuesto por defecto en la organización ninguna línea queda sin impuesto', () => {
    expect(marcadas([item('a', 4), item('b', 5)], cobertura(19, []))).toEqual([]);
  });
});
