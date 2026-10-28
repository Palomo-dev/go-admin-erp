/// <reference types="jest" />
import {
  debeCobrarseEnCaja,
  esMetodoDePasarela,
  metodoDeCobroEnCaja,
  pedidoPagadoPorPasarela,
} from '../metodosCaja';

describe('metodoDeCobroEnCaja', () => {
  it.each(['cash', 'card', 'transfer', 'qr'])('%s se cobra tal cual', (m) => {
    expect(metodoDeCobroEnCaja(m)).toBe(m);
  });
  it('nequi y daviplata se cobran como transferencia', () => {
    expect(metodoDeCobroEnCaja('nequi')).toBe('transfer');
    expect(metodoDeCobroEnCaja(' DaviPlata ')).toBe('transfer');
  });
  it.each([
    'wompi', 'wompi_co', 'WOMPI', 'epayco', 'mercadopago', 'mp', 'payu', 'stripe', 'paypal',
    'bold', 'bold_link', 'bold_card', 'addi', 'pse', 'bancolombia_bnpl', 'bancolombia_collect', 'su_plus',
  ])('la pasarela %s NO cae en efectivo', (m) => {
    expect(esMetodoDePasarela(m)).toBe(true);
    expect(metodoDeCobroEnCaja(m)).toBeNull();
  });
  it('sin método o desconocido sigue siendo efectivo', () => {
    expect(metodoDeCobroEnCaja(null)).toBe('cash');
    expect(metodoDeCobroEnCaja('')).toBe('cash');
    expect(metodoDeCobroEnCaja('mesa')).toBe('cash');
  });
});

describe('regla de pasarela pagada', () => {
  it('pagado por Wompi: ya cobrado, no se cobra en caja', () => {
    const o = { payment_status: 'paid', payment_method: 'wompi' };
    expect(pedidoPagadoPorPasarela(o)).toBe(true);
    expect(debeCobrarseEnCaja(o)).toBe(false);
  });
  it('pendiente de Wompi: «Marcar como pagado» no lo cobra en caja (se marca por la pasarela)', () => {
    const o = { payment_status: 'pending', payment_method: 'wompi' };
    expect(pedidoPagadoPorPasarela(o)).toBe(false);
    expect(debeCobrarseEnCaja(o)).toBe(false);
  });
  it('pagado en efectivo no es pasarela; pendiente en efectivo sí se cobra en caja', () => {
    expect(pedidoPagadoPorPasarela({ payment_status: 'paid', payment_method: 'cash' })).toBe(false);
    expect(debeCobrarseEnCaja({ payment_status: 'pending', payment_method: 'cash' })).toBe(true);
    expect(debeCobrarseEnCaja({ payment_status: 'paid', payment_method: 'cash' })).toBe(false);
  });
});
