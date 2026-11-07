/**
 * Vista previa del asiento de una regla: sus cuatro estados y el lado del IVA.
 * Plan de cuentas inventado.
 */
import { vistaPreviaRegla } from '../vistaPreviaRegla';

const PLAN = [
  { account_code: '110505', name: 'Caja general', is_active: true, es_movimiento: true },
  { account_code: '413505', name: 'Comercio', is_active: true, es_movimiento: true },
  { account_code: '2408', name: 'IVA por pagar', is_active: true, es_movimiento: false },
  { account_code: '240805', name: 'IVA 19 %', parent_code: '2408', is_active: true, es_movimiento: true },
  { account_code: '143501', name: 'Mercancías', is_active: true, es_movimiento: true },
  { account_code: '220505', name: 'Proveedores', is_active: true, es_movimiento: true },
];

describe('vistaPreviaRegla', () => {
  it('sin cuenta débito o crédito: sin datos', () => {
    expect(vistaPreviaRegla({ source_type: 'sale', debit_account_code: '', credit_account_code: '413505' }, PLAN).estado).toBe('sinDatos');
  });

  it('venta con IVA: cuadra con 119.000 al débito y el IVA al crédito', () => {
    const v = vistaPreviaRegla({ source_type: 'sale', debit_account_code: '110505', credit_account_code: '413505', tax_account_code: '240805' }, PLAN);
    expect(v.estado).toBe('cuadra');
    expect(v.lineas.map((l) => [l.cuenta, l.debito, l.credito])).toEqual([
      ['110505', 119000, 0],
      ['413505', 0, 100000],
      ['240805', 0, 19000],
    ]);
    const debitos = v.lineas.reduce((s, l) => s + l.debito, 0);
    const creditos = v.lineas.reduce((s, l) => s + l.credito, 0);
    expect(debitos).toBe(creditos);
  });

  it('compra con IVA: el IVA descontable va al débito', () => {
    const v = vistaPreviaRegla({ source_type: 'purchase', debit_account_code: '143501', credit_account_code: '220505', tax_account_code: '240805' }, PLAN);
    expect(v.lineas.map((l) => [l.lado, l.debito, l.credito])).toEqual([
      ['debito', 100000, 0],
      ['impuesto', 19000, 0],
      ['credito', 0, 119000],
    ]);
  });

  it('cuenta de IVA agrupadora: estado agrupadora', () => {
    const v = vistaPreviaRegla({ source_type: 'sale', debit_account_code: '110505', credit_account_code: '413505', tax_account_code: '2408' }, PLAN);
    expect(v.estado).toBe('agrupadora');
    expect(v.lineas.find((l) => l.cuenta === '2408')?.estado).toBe('agrupadora');
  });

  it('cuenta que no está en el plan: inexistente gana a agrupadora', () => {
    const v = vistaPreviaRegla({ source_type: 'sale', debit_account_code: '4135', credit_account_code: '413505', tax_account_code: '2408' }, PLAN);
    expect(v.estado).toBe('inexistente');
  });

  it('sin IVA: dos líneas por el total', () => {
    const v = vistaPreviaRegla({ source_type: 'sale_payment', debit_account_code: '110505', credit_account_code: '413505' }, PLAN, { base: 50000 });
    expect(v.lineas).toHaveLength(2);
    expect(v.total).toBe(50000);
  });
});
