/**
 * L4 (docs/implementacion/POS-PLAN.md §2.1): al completar el cobro se quita
 * el carrito cobrado y se activa otro o se crea uno. `completarCobro` es la
 * extracción literal de `handleCheckoutComplete` de `src/app/app/pos/page.tsx`.
 */
import { completarCobro } from '@/lib/pos/venta/carritos';
import type { Cart } from '@/components/pos/types';

const cart = (id: string, kitchen_ticket_id: number | null = null) => ({ id, kitchen_ticket_id, items: [] }) as unknown as Cart;

function deps(checkoutCart: Cart | null, carts: Cart[]) {
  const orden: string[] = [];
  return {
    orden,
    d: {
      checkoutCart,
      carts,
      cocina: { markTicketAsDelivered: jest.fn(async (id: number) => { orden.push(`entregada:${id}`); }) },
      setCarts: jest.fn((c: Cart[]) => { orden.push(`pestanas:${c.map((x) => x.id).join(',')}`); }),
      activar: jest.fn((id: string) => { orden.push(`activar:${id}`); }),
      crearCarrito: jest.fn(async () => { orden.push('crear'); }),
      cerrarDialogo: jest.fn(() => { orden.push('cerrar'); }),
    },
  };
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe('completarCobro (L4)', () => {
  it('marca la comanda entregada, quita el cobrado, activa el PRIMERO que queda y cierra el diálogo', async () => {
    const { d, orden } = deps(cart('b', 77), [cart('a'), cart('b', 77), cart('c')]);
    await completarCobro(d);
    expect(orden).toEqual(['entregada:77', 'pestanas:a,c', 'activar:a', 'cerrar']);
  });

  it('si era el único carrito, crea uno nuevo antes de cerrar el diálogo', async () => {
    const { d, orden } = deps(cart('a'), [cart('a')]);
    await completarCobro(d);
    expect(orden).toEqual(['pestanas:', 'crear', 'cerrar']);
  });

  it('sin carrito de cobro solo cierra el diálogo; un error se registra y el diálogo queda abierto', async () => {
    const vacio = deps(null, [cart('a')]);
    await completarCobro(vacio.d);
    expect(vacio.orden).toEqual(['cerrar']);

    const falla = deps(cart('a', 5), [cart('a')]);
    falla.d.cocina.markTicketAsDelivered.mockRejectedValueOnce(new Error('sin red'));
    await completarCobro(falla.d);
    expect(falla.d.setCarts).not.toHaveBeenCalled();
    expect(falla.d.cerrarDialogo).not.toHaveBeenCalled();
  });
});
