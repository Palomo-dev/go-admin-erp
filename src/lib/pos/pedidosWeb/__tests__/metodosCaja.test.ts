/// <reference types="jest" />
import {
  debeCobrarseEnCaja,
  esMetodoCobroEnCaja,
  esMetodoDePasarela,
  marcaPagadoPorPasarela,
  metodoDeCobroEnCaja,
  pedidoPagadoPorPasarela,
} from '../metodosCaja';

describe('metodoDeCobroEnCaja', () => {
  it.each(['cash', 'transfer', 'qr'])('%s se cobra tal cual', (m) => {
    expect(metodoDeCobroEnCaja(m)).toBe(m);
  });
  it('nequi, daviplata y card del pedido web son Wompi (webhook wompi_co): pasarela, nunca caja', () => {
    for (const m of ['nequi', ' DaviPlata ', 'card', 'NEQUI']) {
      expect(esMetodoDePasarela(m)).toBe(true);
      expect(metodoDeCobroEnCaja(m)).toBeNull();
    }
  });
  it('en el diálogo de caja, card (datáfono) sí es un método de caja', () => {
    expect(esMetodoCobroEnCaja('card')).toBe(true);
    expect(esMetodoCobroEnCaja('wompi')).toBe(false);
    expect(esMetodoCobroEnCaja(null)).toBe(false);
  });
  it('QR del banco (bancolombia_qr, breb_qr, redeban_qr) y 001/002/SQS no se tocan: no son pasarela', () => {
    for (const m of ['bancolombia_qr', 'breb_qr', 'redeban_qr', '001', '002', 'SQS']) {
      expect(esMetodoDePasarela(m)).toBe(false);
    }
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

describe('marcaPagadoPorPasarela', () => {
  it('pasarela sin pagar (incluye vencido): sí', () => {
    expect(marcaPagadoPorPasarela({ status: 'confirmed', payment_status: 'pending', payment_method: 'wompi' })).toBe(true);
    expect(marcaPagadoPorPasarela({ status: 'expired', payment_status: 'pending', payment_method: 'nequi' })).toBe(true);
  });
  it('pagado, anulado, de mesa o no pasarela: no', () => {
    expect(marcaPagadoPorPasarela({ status: 'confirmed', payment_status: 'paid', payment_method: 'wompi' })).toBe(false);
    expect(marcaPagadoPorPasarela({ status: 'rejected', payment_status: 'pending', payment_method: 'wompi' })).toBe(false);
    expect(marcaPagadoPorPasarela({ status: 'confirmed', payment_status: 'pending', payment_method: 'wompi', table_session_id: 'ts' })).toBe(false);
    expect(marcaPagadoPorPasarela({ status: 'confirmed', payment_status: 'pending', payment_method: 'cash' })).toBe(false);
  });
});
