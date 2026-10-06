import {
  aIntentoPagoEnLinea,
  aPagoEnLinea,
  aValoracion,
  nombreMetodo,
  promedioEstrellas,
  quienPidio,
  totalPagadoEnLinea,
} from '../solicitudes/cartaQrMesaLogica';

describe('Carta QR en la cuenta de la mesa', () => {
  it('lee el abono en línea: importe sin cambio, propina, comensal y anulados', () => {
    const p = aPagoEnLinea({
      id: 'p1',
      amount: '59000',
      change_amount: 0,
      method: 'wompi',
      reference: 'CQR-abc',
      status: 'completed',
      created_at: '2026-10-06T21:00:00Z',
      processor_response: { origen: 'carta_qr', tip_amount: 5900, diner_label: 'Ana', split_mode: 'iguales' },
    });
    expect(p).toMatchObject({ importe: 59000, propina: 5900, metodo: 'Wompi', comensal: 'Ana', modo: 'iguales', anulado: false });
    const anulado = aPagoEnLinea({ id: 'p2', amount: 10000, method: 'nequi', reference: null, status: 'voided', created_at: '2026-10-06T21:01:00Z' });
    expect(totalPagadoEnLinea([p, anulado])).toBe(59000);
  });

  it('nombres de método: pasarela y sub-métodos', () => {
    expect(nombreMetodo('pse')).toBe('PSE');
    expect(nombreMetodo(null)).toBe('En línea');
    expect(nombreMetodo('daviplata')).toBe('Daviplata');
  });

  it('intentos: en curso o pagado sin aplicar (con propina en el importe)', () => {
    expect(aIntentoPagoEnLinea({ id: 'i', amount: 50000, tip_amount: 5000, status: 'paid_unapplied' })).toMatchObject({ importe: 55000, estado: 'sin_aplicar' });
    expect(aIntentoPagoEnLinea({ id: 'j', amount: 50000, status: 'pending' }).estado).toBe('en_curso');
  });

  it('valoración: estrellas acotadas, aspectos sin repetir y promedio', () => {
    const v = aValoracion({ id: 'v', rating: 9, aspects: ['La comida', 'La comida', ' Rapidez ', 3], comment: '  ', diner_label: 'Luis', created_at: 'x' });
    expect(v).toMatchObject({ estrellas: 5, aspectos: ['La comida', 'Rapidez'], comentario: null, comensal: 'Luis' });
    expect(promedioEstrellas([v, aValoracion({ id: 'w', rating: 4, created_at: 'y' })])).toBe(4.5);
    expect(promedioEstrellas([])).toBeNull();
  });

  it('quién pidió: el de la línea o el del pedido web de la ronda', () => {
    const comensales = new Map([['WEB-0012', 'Ana']]);
    expect(quienPidio({ from_web_order: 'WEB-0012' }, comensales)).toBe('Ana');
    expect(quienPidio({ from_web_order: 'WEB-0099' }, comensales)).toBeNull();
    expect(quienPidio({ diner_label: 'Luis', from_web_order: 'WEB-0012' }, comensales)).toBe('Luis');
    expect(quienPidio(null, comensales)).toBeNull();
  });
});
