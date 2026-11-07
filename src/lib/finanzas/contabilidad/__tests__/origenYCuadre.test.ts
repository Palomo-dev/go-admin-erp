/**
 * Piezas de Contabilidad v2: origen legible del asiento y cuadre. Sin base.
 */
import { cuadreDe, naturalezaCuenta, saldoConNaturaleza } from '../cuadre';
import { documentoDeOrigen, fuentesDeGrupo, grupoOrigen, numeroCorto } from '../origenAsiento';

describe('grupoOrigen', () => {
  it('agrupa las tres grafías de venta y deja lo desconocido como «otro»', () => {
    expect(grupoOrigen('sales')).toBe('venta');
    expect(grupoOrigen('sale')).toBe('venta');
    expect(grupoOrigen('invoice_sales')).toBe('factura');
    expect(grupoOrigen('reversal')).toBe('contraAsiento');
    expect(grupoOrigen('trip_tickets')).toBe('otro');
    expect(grupoOrigen(null)).toBe('manual');
  });

  it('fuentesDeGrupo devuelve todas las fuentes crudas del grupo', () => {
    expect(fuentesDeGrupo('venta')).toEqual(expect.arrayContaining(['sales', 'sale']));
    expect(fuentesDeGrupo('caja')).toEqual(expect.arrayContaining(['cash_movements', 'cash_sessions']));
  });
});

describe('documentoDeOrigen', () => {
  const uuid = '7c1e2b9a-1111-4222-8333-944455556666';
  it('enlaza la factura de venta y la compra por su uuid', () => {
    expect(documentoDeOrigen('invoice_sales', uuid)).toEqual({ tipo: 'factura', href: `/app/finanzas/facturas-venta/${uuid}` });
    expect(documentoDeOrigen('invoice_purchase', uuid)?.href).toBe(`/app/finanzas/facturas-compra/${uuid}`);
  });
  it('no pone en la URL un id que no es uuid ni entero', () => {
    expect(documentoDeOrigen('invoice_sales', '../x')).toEqual({ tipo: 'factura' });
  });
  it('el contra-asiento enlaza al asiento original', () => {
    expect(documentoDeOrigen('reversal', '9560')).toEqual({ tipo: 'asiento', href: '/app/finanzas/contabilidad/asientos/9560' });
  });
  it('sin documento conocido devuelve null', () => {
    expect(documentoDeOrigen('manual', '1')).toBeNull();
    expect(documentoDeOrigen('sales', null)).toBeNull();
  });
  it('numeroCorto recorta los uuid', () => {
    expect(numeroCorto(uuid)).toBe('7c1e2b9a');
    expect(numeroCorto('42')).toBe('42');
  });
});

describe('cuadreDe', () => {
  it('cuadra con importes en texto y coma flotante', () => {
    const c = cuadreDe([{ debit: '0.1' }, { debit: 0.2 }, { credit: 0.3 }]);
    expect(c.cuadra).toBe(true);
    expect(c.diferencia).toBe(0);
  });
  it('reporta la diferencia del Figma (250.000 contra 231.000)', () => {
    const c = cuadreDe([{ debit: 250000 }, { credit: 181000 }, { credit: 50000 }]);
    expect(c).toMatchObject({ debitos: 250000, creditos: 231000, diferencia: 19000, cuadra: false, vacio: false });
  });
  it('sin importes no cuadra ni descuadra', () => {
    expect(cuadreDe([{ debit: '' }, { credit: null }])).toMatchObject({ vacio: true, cuadra: false });
  });
});

describe('naturaleza', () => {
  it('sale de la clase PUC', () => {
    expect(naturalezaCuenta('110505')).toBe('D');
    expect(naturalezaCuenta('2408')).toBe('C');
    expect(naturalezaCuenta('9999', 'income')).toBe('C');
  });
  it('un saldo negativo se muestra en la naturaleza contraria', () => {
    expect(saldoConNaturaleza(-500, 'D')).toEqual({ valor: 500, lado: 'C' });
    expect(saldoConNaturaleza(0, 'D')).toEqual({ valor: 0, lado: null });
  });
});
