/**
 * L17 (docs/implementacion/POS-PLAN.md §2.2): la variante elegida hereda la
 * categoría y la estación del padre y toma su nombre legible.
 * `enriquecerVariante` es la extracción literal de `handleVariantSelect` de
 * `src/components/pos/ProductSearch.tsx` (y del escáner, `resolverCodigo`).
 * La regla de la estación en sí la fija `src/lib/pos/__tests__/estacionEfectiva.test.ts`.
 */
import { enriquecerVariante, type PosGridProduct } from '@/lib/pos/venta/catalogo';
import type { Category } from '@/components/pos/types';

const bebidas = { id: 3, name: 'Bebidas', station: 'bar' } as Category;
const cocina = { id: 4, name: 'Platos', station: 'hot_kitchen' } as Category;
const padre = { id: 10, name: 'iPhone 16 Pro Max', categories: bebidas, station: null } as unknown as PosGridProduct;

describe('variante elegida (L17)', () => {
  it('sin categoría ni estación propias hereda la categoría del padre y la estación de esa categoría', () => {
    const v = enriquecerVariante({ id: 11, sku: 'IP-256', name: 'iPhone 16 Pro Max - 256 GB', price: 1, variant_data: { Capacidad: '256 GB' } }, padre);
    expect(v).toMatchObject({ id: 11, sku: 'IP-256', categories: bebidas, category: bebidas, station: 'bar' });
    expect(v.name).toBe('iPhone 16 Pro Max (256 GB)');
  });

  it('la categoría propia de la variante manda sobre la del padre; la estación propia del padre, sobre la de la categoría', () => {
    const v = enriquecerVariante({ name: 'V', variant_data: {}, category: cocina }, { ...padre, station: 'cold_kitchen' } as PosGridProduct);
    expect(v).toMatchObject({ categories: cocina, category: cocina, station: 'cold_kitchen' });
    // Sin variant_data el nombre queda como venía.
    expect(v.name).toBe('V');
  });

  it('sin padre ni categoría: categoría null (category undefined) y estación null', () => {
    const v = enriquecerVariante({ name: 'Suelta', variant_data: null }, null);
    expect(v).toMatchObject({ categories: null, station: null, name: 'Suelta' });
    expect(v.category).toBeUndefined();
  });
});
