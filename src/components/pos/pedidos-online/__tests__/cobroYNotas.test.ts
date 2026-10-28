/**
 * Detalle de Pedidos online (Figma 1981:175699): qué cobro se ofrece y qué
 * notas internas ve el equipo.
 */
import { cobroDelPedido } from '../cobroPedido';
import { notasInternasVisibles } from '../notasPedido';

const base = { status: 'ready', payment_status: 'pending', delivery_type: 'dine_in', table_session_id: null } as const;

describe('cobroDelPedido', () => {
  test('«Comer aquí» listo y sin pagar: «Cobrar y entregar» es la primaria', () => {
    expect(cobroDelPedido({ ...base })).toEqual({ puedeCobrar: true, cobraYEntrega: true, marcarPagadoPasarela: false });
  });

  test('domicilio en camino también cobra y entrega; listo sin salir, solo cobra', () => {
    expect(cobroDelPedido({ ...base, delivery_type: 'delivery_own', status: 'in_delivery' }).cobraYEntrega).toBe(true);
    expect(cobroDelPedido({ ...base, delivery_type: 'delivery_own', status: 'ready' })).toEqual({ puedeCobrar: true, cobraYEntrega: false, marcarPagadoPasarela: false });
  });

  test('pendiente, pagado o agregado a una mesa: no se cobra aquí', () => {
    expect(cobroDelPedido({ ...base, status: 'pending' }).puedeCobrar).toBe(false);
    expect(cobroDelPedido({ ...base, payment_status: 'paid' }).puedeCobrar).toBe(false);
    expect(cobroDelPedido({ ...base, table_session_id: 'ts-1' }).puedeCobrar).toBe(false);
  });
});

describe('cobroDelPedido · pedidos de pasarela (QA 98a021b73)', () => {
  test.each(['wompi', 'nequi', 'daviplata', 'card', 'pse', 'bold_link'])(
    '%s sin pagar: nunca «Cobrar»; «Marcar como pagado» de un clic',
    (payment_method) => {
      expect(cobroDelPedido({ ...base, payment_method })).toEqual({
        puedeCobrar: false,
        cobraYEntrega: false,
        marcarPagadoPasarela: true,
      });
    },
  );
  test('vencido o pendiente de Wompi también se marca pagado (el detalle confirma primero)', () => {
    expect(cobroDelPedido({ ...base, status: 'expired', payment_method: 'wompi' }).marcarPagadoPasarela).toBe(true);
    expect(cobroDelPedido({ ...base, status: 'pending', payment_method: 'nequi' }).marcarPagadoPasarela).toBe(true);
    expect(cobroDelPedido({ ...base, status: 'expired', payment_method: 'wompi' }).puedeCobrar).toBe(false);
  });
  test('ya pagado, anulado o de mesa: sin botón', () => {
    expect(cobroDelPedido({ ...base, payment_status: 'paid', payment_method: 'wompi' }).marcarPagadoPasarela).toBe(false);
    expect(cobroDelPedido({ ...base, status: 'cancelled', payment_method: 'wompi' }).marcarPagadoPasarela).toBe(false);
    expect(cobroDelPedido({ ...base, table_session_id: 'ts-1', payment_method: 'wompi' }).marcarPagadoPasarela).toBe(false);
  });
  test('efectivo / transferencia en el local siguen con «Cobrar» en caja', () => {
    expect(cobroDelPedido({ ...base, payment_method: 'cash' })).toMatchObject({ puedeCobrar: true, marcarPagadoPasarela: false });
    expect(cobroDelPedido({ ...base, payment_method: 'transfer' })).toMatchObject({ puedeCobrar: true, marcarPagadoPasarela: false });
  });
});

describe('notasInternasVisibles', () => {
  test('oculta la marca «[Comer aquí] Mesa: …» del sitio y conserva el resto', () => {
    expect(notasInternasVisibles('[Comer aquí] Mesa: 4 (Terraza)')).toBe('');
    expect(notasInternasVisibles('[Comer aquí] Mesa: 4\nSi piden algo más, se suma a la mesa.')).toBe('Si piden algo más, se suma a la mesa.');
    expect(notasInternasVisibles(null)).toBe('');
  });
});
