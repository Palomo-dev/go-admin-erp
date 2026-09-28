/**
 * L15-L16 (docs/implementacion/POS-PLAN.md §2.2): tocar la tarjeta de un
 * producto. Agotado ⇒ no se agrega; con variantes (> 0) o modificadores ⇒
 * diálogo; simple ⇒ al carrito. `decidirAccionProducto` es la extracción
 * literal de `handleProductClick` de `src/components/pos/ProductSearch.tsx`.
 */
import { decidirAccionProducto, type PosGridProduct } from '@/lib/pos/venta/catalogo';

const p = (extra: Partial<PosGridProduct>) => ({ id: 1, name: 'X', ...extra }) as PosGridProduct;

describe('acción de la tarjeta (L15-L16)', () => {
  it('agotado gana a todo: aunque tenga variantes o modificadores, no se agrega', () => {
    expect(decidirAccionProducto(p({ is_out_of_stock: true }))).toBe('agotado');
    expect(decidirAccionProducto(p({ is_out_of_stock: true, has_variants: true, variant_count: 3, has_modifiers: true }))).toBe('agotado');
  });

  it('con variantes (más de 0) o con modificadores abre el diálogo', () => {
    expect(decidirAccionProducto(p({ has_variants: true, variant_count: 2 }))).toBe('dialogo');
    expect(decidirAccionProducto(p({ has_modifiers: true }))).toBe('dialogo');
  });

  it('marcado con variantes pero con 0 variantes, y sin modificadores, es simple: va directo al carrito', () => {
    expect(decidirAccionProducto(p({ has_variants: true, variant_count: 0 }))).toBe('agregar');
    expect(decidirAccionProducto(p({ has_variants: true }))).toBe('agregar');
    expect(decidirAccionProducto(p({}))).toBe('agregar');
  });
});
