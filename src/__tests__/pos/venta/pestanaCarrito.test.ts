/**
 * L12 (docs/implementacion/POS-PLAN.md §2.1): la pestaña del carrito muestra
 * el primer nombre del cliente (truncado) o «Carrito N», el total si es mayor
 * que 0 y el nº de LÍNEAS; se puede cerrar solo con más de un carrito.
 * `etiquetaPestana` y `puedeCerrarPestana` son la extracción literal de
 * `src/components/pos/CartTabs.tsx`.
 */
import { etiquetaPestana, puedeCerrarPestana } from '@/lib/pos/venta/pestanaCarrito';
import type { Cart } from '@/components/pos/types';

const cart = (extra: Partial<Cart>) => ({ total: 0, items: [], status: 'active', ...extra }) as Cart;
const cliente = (full_name: string) => ({ full_name }) as Cart['customer'];

describe('pestaña del carrito (L12)', () => {
  it('con cliente: su primer nombre, truncado a 8 letras + «...»; sin cliente: el número de la pestaña', () => {
    expect(etiquetaPestana(cart({ customer: cliente('Ana María Gómez') }), 0)).toMatchObject({ cliente: 'Ana', numero: 1 });
    expect(etiquetaPestana(cart({ customer: cliente('Maximiliano Ruiz') }), 0).cliente).toBe('Maximili...');
    expect(etiquetaPestana(cart({ customer: cliente('Bernardo') }), 0).cliente).toBe('Bernardo');
    expect(etiquetaPestana(cart({}), 2)).toMatchObject({ cliente: null, numero: 3 });
  });

  it('el total solo se muestra si es mayor que 0; las líneas cuentan filas, no unidades', () => {
    const lineas = [{ quantity: 3 }, { quantity: 1 }] as Cart['items'];
    expect(etiquetaPestana(cart({ total: 0, items: lineas }), 0)).toMatchObject({ mostrarTotal: false, lineas: 2 });
    expect(etiquetaPestana(cart({ total: 15000, status: 'hold' }), 0)).toMatchObject({ mostrarTotal: true, total: 15000, lineas: 0, enEspera: true });
  });

  it('la «X» de cerrar solo existe con más de un carrito', () => {
    expect(puedeCerrarPestana(1)).toBe(false);
    expect(puedeCerrarPestana(2)).toBe(true);
  });
});
