/**
 * L3 (docs/implementacion/POS-PLAN.md §2.1): cerrar la pestaña de un carrito.
 * `cerrarCarrito` es la extracción literal de `removeCart` de
 * `src/app/app/pos/page.tsx`. Que `POSService.removeCart` borre de
 * `pos_carts_<org>` sin tocar los de deuda lo fija `removeCart.test.ts`.
 */
import { cerrarCarrito } from '@/lib/pos/venta/carritos';
import type { Cart } from '@/components/pos/types';

const cart = (id: string, kitchen_ticket_id: number | null = null) => ({ id, kitchen_ticket_id, items: [] }) as unknown as Cart;

function deps(carts: Cart[], cartId: string, activeCartId: string) {
  const orden: string[] = [];
  return {
    orden,
    d: {
      cartId,
      carts,
      activeCartId,
      servicio: { removeCart: jest.fn(async (id: string) => { orden.push(`borrar:${id}`); }) },
      cocina: { markTicketAsDelivered: jest.fn(async (id: number) => { orden.push(`entregada:${id}`); }) },
      setCarts: jest.fn((c: Cart[]) => { orden.push(`pestanas:${c.map((x) => x.id).join(',')}`); }),
      activar: jest.fn((id: string) => { orden.push(`activar:${id}`); }),
      crearCarrito: jest.fn(async () => { orden.push('crear'); }),
    },
  };
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe('cerrarCarrito (L3)', () => {
  it('con comanda: la marca entregada, lo borra del almacenamiento y, si era el activo, activa el primero que queda', async () => {
    const { d, orden } = deps([cart('a'), cart('b', 55), cart('c')], 'b', 'b');
    await cerrarCarrito(d);
    expect(orden).toEqual(['entregada:55', 'borrar:b', 'pestanas:a,c', 'activar:a']);
  });

  it('cerrar uno que no es el activo no cambia el activo ni crea otro', async () => {
    const { d, orden } = deps([cart('a'), cart('b')], 'b', 'a');
    await cerrarCarrito(d);
    expect(orden).toEqual(['borrar:b', 'pestanas:a']);
    expect(d.cocina.markTicketAsDelivered).not.toHaveBeenCalled();
  });

  it('si no queda ninguno, crea uno nuevo', async () => {
    const { d, orden } = deps([cart('a')], 'a', 'a');
    await cerrarCarrito(d);
    expect(orden).toEqual(['borrar:a', 'pestanas:', 'crear']);
  });

  it('un error (p. ej. al marcar la comanda) se registra, no se propaga y el carrito no se borra', async () => {
    const { d } = deps([cart('a', 9), cart('b')], 'a', 'a');
    d.cocina.markTicketAsDelivered.mockRejectedValueOnce(new Error('sin red'));
    await expect(cerrarCarrito(d)).resolves.toBeUndefined();
    expect(d.servicio.removeCart).not.toHaveBeenCalled();
    expect(d.setCarts).not.toHaveBeenCalled();
  });
});
