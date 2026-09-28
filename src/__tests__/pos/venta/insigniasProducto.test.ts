/**
 * L23 (docs/implementacion/POS-PLAN.md §2.2): insignias de la tarjeta del
 * producto (Agotado, -%, N var., Personalizable, Top, receta, sin precio) y de
 * la categoría («Top», orden por favoritas). `insigniasDe` sale de
 * `src/components/pos/ProductSearch.tsx`; `esCategoriaTop`,
 * `ordenarCategorias` y `colorDeCategoria`, de `CategoryFilterBar.tsx`.
 */
import { insigniasDe, type PosGridProduct } from '@/lib/pos/venta/catalogo';
import { colorDeCategoria, esCategoriaTop, ordenarCategorias } from '@/lib/pos/venta/categorias';

const p = (extra: Partial<PosGridProduct>) => ({ id: 1, name: 'X', price: 10000, ...extra }) as PosGridProduct;

describe('insignias del producto (L23)', () => {
  it('simple con precio: ninguna insignia y botón «Agregar»', () => {
    expect(insigniasDe(p({}))).toEqual({
      agotado: false, descuento: null, variantes: null, personalizable: false,
      top: null, receta: false, sinPrecio: false, elegir: false,
    });
  });

  it('descuento solo si el precio de comparación es mayor, redondeado', () => {
    expect(insigniasDe(p({ price: 8000, compare_price: 12000 })).descuento).toBe(33);
    expect(insigniasDe(p({ price: 12000, compare_price: 12000 })).descuento).toBeNull();
    expect(insigniasDe(p({ compare_price: null })).descuento).toBeNull();
  });

  it('«N var.» con variantes; «Personalizable» solo sin variantes y con modificadores; ambos piden «Elegir»', () => {
    expect(insigniasDe(p({ has_variants: true, variant_count: 4, has_modifiers: true }))).toMatchObject({ variantes: 4, personalizable: false, elegir: true });
    expect(insigniasDe(p({ has_variants: true, variant_count: 0, has_modifiers: true }))).toMatchObject({ variantes: null, personalizable: true, elegir: true });
  });

  it('«Top» con ventas en 90 días (unidades redondeadas para el tooltip), receta, agotado y sin precio', () => {
    expect(insigniasDe(p({ sales_count_90d: 12.6 })).top).toBe(13);
    expect(insigniasDe(p({ sales_count_90d: 0 })).top).toBeNull();
    expect(insigniasDe(p({ has_recipe: true, recipe_id: 5 })).receta).toBe(true);
    expect(insigniasDe(p({ has_recipe: true, recipe_id: null })).receta).toBe(false);
    expect(insigniasDe(p({ is_out_of_stock: true })).agotado).toBe(true);
    expect(insigniasDe(p({ price: 0 })).sinPrecio).toBe(true);
  });
});

describe('categorías (L23)', () => {
  const cats = [
    { id: 1, name: 'Bebidas', display_order: 2, sales_count_90d: 5 },
    { id: 2, name: 'Almuerzos', display_order: 1, is_favorite: true },
    { id: 3, name: 'Postres', display_order: 3, sales_count_90d: 40 },
  ];

  it('«Top» si vendió en 90 días; el orden «favorites» pone favoritas, luego las más vendidas, luego el manual', () => {
    expect(esCategoriaTop(cats[0])).toBe(true);
    expect(esCategoriaTop(cats[1])).toBe(false);
    expect(ordenarCategorias(cats, 'favorites').map((c) => c.id)).toEqual([2, 3, 1]);
    expect(ordenarCategorias(cats).map((c) => c.id)).toEqual([2, 1, 3]);
    expect(ordenarCategorias(cats, 'name').map((c) => c.name)).toEqual(['Almuerzos', 'Bebidas', 'Postres']);
  });

  it('el color configurado manda; sin color, uno de respaldo estable por id', () => {
    expect(colorDeCategoria({ id: 1, color: '#123456' })).toBe('#123456');
    expect(colorDeCategoria({ id: 7, color: null })).toBe(colorDeCategoria({ id: 7 }));
    expect(colorDeCategoria({ id: 7 })).toMatch(/^#[0-9A-F]{6}$/);
  });
});
