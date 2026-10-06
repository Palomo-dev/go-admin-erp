/**
 * Detalle de Pedidos online (Figma 1981:175699): qué cobro se ofrece y qué
 * notas internas ve el equipo.
 */
import { cobroDelPedido } from '../cobroPedido';
import { notasInternasVisibles } from '../notasPedido';

const base = { status: 'ready', payment_status: 'pending', delivery_type: 'dine_in', table_session_id: null } as const;

describe('cobroDelPedido', () => {
  test('«Comer aquí» listo y sin pagar: «Cobrar y entregar» es la primaria', () => {
    expect(cobroDelPedido({ ...base })).toEqual({ puedeCobrar: true, cobraYEntrega: true });
  });

  test('domicilio en camino también cobra y entrega; listo sin salir, solo cobra', () => {
    expect(cobroDelPedido({ ...base, delivery_type: 'delivery_own', status: 'in_delivery' }).cobraYEntrega).toBe(true);
    expect(cobroDelPedido({ ...base, delivery_type: 'delivery_own', status: 'ready' })).toEqual({ puedeCobrar: true, cobraYEntrega: false });
  });

  test('pendiente, pagado o agregado a una mesa: no se cobra aquí', () => {
    expect(cobroDelPedido({ ...base, status: 'pending' }).puedeCobrar).toBe(false);
    expect(cobroDelPedido({ ...base, payment_status: 'paid' }).puedeCobrar).toBe(false);
    expect(cobroDelPedido({ ...base, table_session_id: 'ts-1' }).puedeCobrar).toBe(false);
  });
});

describe('notasInternasVisibles', () => {
  test('oculta la marca «[Comer aquí] Mesa: …» del sitio y conserva el resto', () => {
    expect(notasInternasVisibles('[Comer aquí] Mesa: 4 (Terraza)')).toBe('');
    expect(notasInternasVisibles('[Comer aquí] Mesa: 4\nSi piden algo más, se suma a la mesa.')).toBe('Si piden algo más, se suma a la mesa.');
    expect(notasInternasVisibles(null)).toBe('');
  });
});
