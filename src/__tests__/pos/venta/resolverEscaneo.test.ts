/**
 * L18 (docs/implementacion/POS-PLAN.md §2.2): código del lector físico.
 * Variante exacta ⇒ al carrito (enriquecida); con modificadores ⇒ diálogo del
 * PADRE (la variante escaneada se pierde, B-06); padre o simple ⇒ la misma
 * decisión que la tarjeta; no encontrado o agotado ⇒ aviso. `resolverCodigo`
 * es la extracción literal de `handleHardwareScan` de
 * `src/components/pos/ProductSearch.tsx`. La detección del lector (ráfaga de
 * teclas) la fija `src/__tests__/pos/barcodeWedge.test.ts`.
 */
import { resolverCodigo, type PosGridProduct } from '@/lib/pos/venta/catalogo';
import type { Category, Product } from '@/components/pos/types';

const bar = { id: 3, name: 'Bebidas', station: 'bar' } as Category;
const padre = (extra: Partial<PosGridProduct> = {}) =>
  ({ id: 10, name: 'Gaseosa', categories: bar, has_variants: true, variant_count: 2, ...extra }) as PosGridProduct;
const variante = { id: 11, name: 'Gaseosa - Variante 1', parent_product_id: 10, variant_data: { Tamaño: '1,5 L' } } as unknown as Product;
const simple = { id: 20, name: 'Agua' } as Product;

describe('código escaneado (L18)', () => {
  it('sin fila exacta, o sin el padre en el grid, es «no encontrado»', () => {
    expect(resolverCodigo(null, [padre()])).toEqual({ tipo: 'no_encontrado' });
    expect(resolverCodigo(variante, [])).toEqual({ tipo: 'no_encontrado' });
  });

  it('el padre agotado bloquea también a su variante', () => {
    expect(resolverCodigo(variante, [padre({ is_out_of_stock: true })])).toMatchObject({ tipo: 'agotado', producto: { id: 10 } });
  });

  it('variante exacta sin modificadores: al carrito con nombre legible y la estación heredada', () => {
    const d = resolverCodigo(variante, [padre()]);
    expect(d.tipo).toBe('agregar_variante');
    if (d.tipo !== 'agregar_variante') return;
    expect(d.producto).toMatchObject({ id: 11, name: 'Gaseosa (1,5 L)', categories: bar, station: 'bar' });
  });

  it('variante exacta de un producto con modificadores: abre el diálogo del PADRE', () => {
    expect(resolverCodigo(variante, [padre({ has_modifiers: true })])).toMatchObject({ tipo: 'dialogo_padre', padre: { id: 10 } });
  });

  it('código de un producto simple o de un padre: la decisión de la tarjeta', () => {
    const grid = [{ ...simple } as PosGridProduct, padre()];
    expect(resolverCodigo(simple, grid)).toMatchObject({ tipo: 'tarjeta', producto: { id: 20 } });
    expect(resolverCodigo({ id: 10, name: 'Gaseosa' } as Product, grid)).toMatchObject({ tipo: 'tarjeta', producto: { id: 10 } });
  });
});
