import { decidirRondaQr, type DatosDecisionRondaQr } from '../rondaQrMesa';

const base = (p: Partial<DatosDecisionRondaQr> = {}, pedido: Partial<DatosDecisionRondaQr['pedido']> = {}): DatosDecisionRondaQr => ({
  pedido: {
    delivery_type: 'dine_in',
    payment_status: 'pending',
    status: 'pending',
    restaurant_table_id: 'mesa-7',
    table_session_id: null,
    ...pedido,
  } as DatosDecisionRondaQr['pedido'],
  sedeLoActiva: true,
  sesion: { id: 'ses-1', server_id: 'mesero-1' },
  ...p,
});

describe('ronda de la Carta QR que entra sola a la mesa', () => {
  it('entra con la sede activada y la mesa abierta por el equipo; el mesero de la sesión es el actor', () => {
    expect(decidirRondaQr(base())).toEqual({ entra: true, sesionId: 'ses-1', meseroId: 'mesero-1' });
  });

  it('apagada por defecto: sin ajuste o con la columna ausente no entra sola', () => {
    expect(decidirRondaQr(base({ sedeLoActiva: false }))).toEqual({ entra: false, motivo: 'sede_no_lo_activa' });
    expect(decidirRondaQr(base({ sedeLoActiva: null }))).toEqual({ entra: false, motivo: 'sede_no_lo_activa' });
  });

  it('un QR fotografiado no abre una mesa vacía: sin sesión abierta, la confirma el equipo', () => {
    expect(decidirRondaQr(base({ sesion: null }))).toEqual({ entra: false, motivo: 'mesa_sin_sesion' });
  });

  it('lo pagado en línea nunca entra a la cuenta de la mesa (se cobraría dos veces)', () => {
    expect(decidirRondaQr(base({}, { payment_status: 'paid' }))).toEqual({ entra: false, motivo: 'pagado_en_linea' });
  });

  it('solo pedidos de mesa pendientes y que aún no están en la mesa', () => {
    expect(decidirRondaQr(base({}, { delivery_type: 'pickup' })).entra).toBe(false);
    expect(decidirRondaQr(base({}, { restaurant_table_id: null })).entra).toBe(false);
    expect(decidirRondaQr(base({}, { status: 'confirmed' }))).toEqual({ entra: false, motivo: 'no_pendiente' });
    expect(decidirRondaQr(base({}, { table_session_id: 'ses-1' }))).toEqual({ entra: false, motivo: 'ya_en_la_mesa' });
  });
});
