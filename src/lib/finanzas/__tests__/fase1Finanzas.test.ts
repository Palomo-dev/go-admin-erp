import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { armarArbolContable, importeDeGrupo } from '@/lib/finanzas/arbolBalance';
import { esCuentaDeTitulo } from '@/lib/finanzas/cuentasTitulo';
import {
  cuentaAplicableDeMapeo,
  cuentaCanonicaImpuesto,
  cuentasBancariasElegibles,
  esImpuestoIva,
} from '@/lib/finanzas/mapeoImpuesto';
import {
  DEBITO_REVISADO,
  asientoAjusteBanco,
  asientoDeMovimientoCaja,
  asientoTransferenciaBancaria,
} from '@/lib/finanzas/movimientoCajaCuentas';
import { valorSelect } from '@/lib/finanzas/valorSelect';
import { formatPlainDate } from '@/lib/utils/dateDisplay';

const RAIZ = join(__dirname, '..', '..', '..', '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

const PLAN = new Set([
  '1105', '1110', '1120', '1365', '2105', '2205', '2365', '2367', '2368',
  '2408', '2505', '3105', '4105', '4250', '42959501', '5105', '5135', '5195', '5235', '5305', '6105',
]);

describe('cuenta bancaria nueva: el select no entra en bucle', () => {
  it('el string vacío no se pasa a Radix (React #185)', () => {
    expect(valorSelect('')).toBeUndefined();
    expect(valorSelect(null)).toBeUndefined();
    expect(valorSelect('Bancolombia')).toBe('Bancolombia');
    expect(valorSelect('COP')).toBe('COP');
  });

  it('el formulario usa valorSelect y exige el PUC', () => {
    const formulario = leer('src/components/finanzas/bancos/cuentas/NuevaCuentaForm.tsx');
    expect(formulario).toContain('valorSelect(formData.bank_name)');
    expect(formulario).toContain('valorSelect(formData.currency)');
    expect(formulario).not.toContain('value={formData.bank_name}');
    expect(formulario).not.toContain('value={formData.currency}');
    expect(formulario).toContain('account_code');
    expect(formulario).toContain('cuentasBancariasElegibles');
  });

  it('ofrece el detalle de la clase 11 y no el grupo ni un 1110 que ya tiene auxiliar', () => {
    const elegibles = cuentasBancariasElegibles([
      { account_code: '1', name: 'Activo', type: 'asset', parent_code: null },
      { account_code: '11', name: 'Disponible', type: 'asset', parent_code: '1' },
      { account_code: '1105', name: 'Caja', type: 'asset', parent_code: '11' },
      { account_code: '1110', name: 'Bancos', type: 'asset', parent_code: '11' },
      { account_code: '1120', name: 'Cuentas de ahorro', type: 'asset', parent_code: '11' },
      { account_code: '111005', name: 'Bancolombia', type: 'asset', parent_code: '1110' },
      { account_code: '2105', name: 'Proveedores', type: 'liability', parent_code: null },
      { account_code: '5105', name: 'Gastos de personal', type: 'expense', parent_code: null },
    ]);
    expect(elegibles.map((c) => c.account_code)).toEqual(['1105', '111005', '1120']);
  });

  it('sin PUC en los dos bancos la transferencia no acredita 5105', () => {
    expect(asientoTransferenciaBancaria(null, '1110')).toEqual({ tipo: 'sin_cuenta' });
    expect(asientoTransferenciaBancaria('5105', '1110')).toEqual({ tipo: 'sin_cuenta' });
    expect(asientoTransferenciaBancaria('1110', '1120')).toEqual({
      tipo: 'asiento',
      debito: '1120',
      credito: '1110',
    });
  });
});

describe('egreso que no es compra', () => {
  it('un gasto menor debita 5195, no 4105 Ventas', () => {
    expect(asientoDeMovimientoCaja('out', 'gastosMenores', PLAN)).toEqual({
      tipo: 'asiento',
      debito: '5195',
      credito: '1105',
    });
    expect(asientoDeMovimientoCaja('out', 'otroEgreso', PLAN).tipo === 'asiento'
      && (asientoDeMovimientoCaja('out', 'otroEgreso', PLAN) as { debito: string }).debito,
    ).not.toBe('4105');
  });

  it('si el plan solo tiene 4105, el egreso no se contabiliza contra ventas', () => {
    expect(asientoDeMovimientoCaja('out', 'gastoOperativo', new Set(['1105', '4105']))).toEqual({
      tipo: 'sin_cuenta',
    });
  });

  it('el pago a proveedor baja el pasivo y la venta de contado sí acredita 4105', () => {
    expect(asientoDeMovimientoCaja('out', 'pagoProveedor', PLAN)).toEqual({
      tipo: 'asiento',
      debito: '2105',
      credito: '1105',
    });
    expect(asientoDeMovimientoCaja('in', 'ventaContadoEspecial', PLAN)).toEqual({
      tipo: 'asiento',
      debito: '1105',
      credito: '4105',
    });
    expect(asientoDeMovimientoCaja('in', 'otroIngreso', PLAN)).toEqual({
      tipo: 'asiento',
      debito: '1105',
      credito: '42959501',
    });
  });

  it('el cambio de efectivo no genera asiento', () => {
    expect(asientoDeMovimientoCaja('out', 'cambioEfectivo', PLAN)).toEqual({ tipo: 'omitir' });
  });

  it('propina y nómina van a gasto; la devolución reversa la venta', () => {
    expect(DEBITO_REVISADO['tip.created']).toEqual({ debito: '5105', clase: 'gasto' });
    expect(DEBITO_REVISADO['payroll.created'].debito.startsWith('5')).toBe(true);
    expect(DEBITO_REVISADO['payroll.paid']).toEqual({ debito: '25050501', clase: 'pasivo' });
    expect(DEBITO_REVISADO['commission.accrued'].debito.startsWith('5')).toBe(true);
    expect(DEBITO_REVISADO['commission.paid'].clase).toBe('pasivo');
    expect(DEBITO_REVISADO['refund.refunded']).toEqual({ debito: '4105', clase: 'contra_ingreso' });
    expect(DEBITO_REVISADO['sale_credit_note.created'].clase).toBe('contra_ingreso');
    expect(DEBITO_REVISADO['inventory_adjustment.loss']).toEqual({ debito: '519595', clase: 'gasto' });
    expect(DEBITO_REVISADO['inventory.adjusted']).toEqual({ debito: '519595', clase: 'gasto' });
    expect(DEBITO_REVISADO['inventory_adjustment.loss'].debito.startsWith('6')).toBe(false);
    expect(DEBITO_REVISADO['inventory.adjusted'].debito.startsWith('6')).toBe(false);
  });

  it('un egreso bancario no acredita ni debita 5105 de personal', () => {
    expect(asientoAjusteBanco(-1500, '1110', PLAN)).toEqual({
      tipo: 'asiento',
      debito: '5305',
      credito: '1110',
    });
    expect(asientoAjusteBanco(1500, '1110', PLAN)).toEqual({
      tipo: 'asiento',
      debito: '1110',
      credito: '42959501',
    });
    const soloPersonal = asientoAjusteBanco(-1500, '1110', new Set(['1110', '5105', '4105']));
    expect(soloPersonal).toEqual({ tipo: 'sin_cuenta' });
  });
});

describe('mapeo de impuestos', () => {
  it('el IVA cae en 2408 y no en el auxiliar que no existe', () => {
    expect(cuentaCanonicaImpuesto('IVA_19', 'IVA 19%')).toBe('2408');
    expect(cuentaCanonicaImpuesto('IVA_5', 'IVA 5%')).toBe('2408');
    expect(cuentaCanonicaImpuesto('IVA_0', 'Exento de IVA')).toBe('2408');
    expect(cuentaAplicableDeMapeo('24080501', 'IVA_19', 'IVA 19%', new Set(['2365', '2408']))).toBe('2408');
    expect(cuentaAplicableDeMapeo('24080501', 'IVA_19', 'IVA 19%', new Set(['2365']))).toBeNull();
  });

  it('retefuente e ICA usan la cuenta de 4 dígitos que sí está en el plan', () => {
    expect(cuentaAplicableDeMapeo('23650501', 'RETE_4', 'Retención en la Fuente 4%', PLAN)).toBe('2365');
    expect(cuentaAplicableDeMapeo('23170501', 'ICA_0.966', 'ICA Bogotá 9.66x1000', PLAN)).toBe('2368');
  });

  it('si la cuenta mapeada existe, se respeta', () => {
    expect(cuentaAplicableDeMapeo('2408', 'IVA_19', 'IVA 19%', PLAN)).toBe('2408');
  });

  it('el formulario de IVA exige una cuenta del plan', () => {
    expect(esImpuestoIva('IVA_19', 'IVA 19%')).toBe(true);
    expect(esImpuestoIva('RETE_4', 'Retención en la fuente')).toBe(false);
    const formulario = leer('src/components/finanzas/impuestos/TaxForm.tsx');
    expect(formulario).toContain('vincularCuentaImpuesto');
    expect(formulario).toContain('esImpuestoIva');
    const sql = leer('supabase/migrations/20261021225000_finanzas_fase1_asientos.sql');
    expect(sql).toContain('cuenta_no_existe');
    expect(sql).toContain('fn_impuesto_vincular_cuenta');
  });
});

describe('balance: el grupo incluye a las cuentas sin padre', () => {
  const pasivos = [
    { account_code: '2', name: 'Pasivo', type: 'liability', parent_code: null },
    { account_code: '21', name: 'Obligaciones', type: 'liability', parent_code: '2' },
    { account_code: '2105', name: 'Proveedores', type: 'liability', parent_code: '21' },
    { account_code: '2365', name: 'Retención en la fuente', type: 'liability', parent_code: null },
    { account_code: '2405', name: 'De industria y comercio', type: 'liability', parent_code: null },
  ];
  const saldos = new Map([
    ['2105', 41910],
    ['2365', 5000],
    ['2405', 1297],
  ]);

  it('el grupo 2 suma lo mismo que el total de pasivos', () => {
    const arbol = armarArbolContable(pasivos, (codigo) => saldos.get(codigo) ?? 0);
    const total = arbol.reduce((suma, nodo) => suma + nodo.amount, 0);
    expect(importeDeGrupo(arbol, '2')).toBe(48207);
    expect(total).toBe(48207);
    expect(arbol.map((nodo) => nodo.account_code)).toEqual(['2']);
  });

  it('el saldo propio del padre no se pierde y no se duplica', () => {
    const cuentas = [
      { account_code: '2', name: 'Pasivo', type: 'liability', parent_code: null },
      { account_code: '2105', name: 'Proveedores', type: 'liability', parent_code: null },
    ];
    const arbol = armarArbolContable(cuentas, (codigo) => (codigo === '2' ? 10 : 5));
    expect(importeDeGrupo(arbol, '2')).toBe(15);
    expect(arbol.reduce((suma, nodo) => suma + nodo.amount, 0)).toBe(15);
  });

  it('un ciclo de padres no se recorre sin fin', () => {
    const cuentas = [
      { account_code: '2105', name: 'A', type: 'liability', parent_code: '2205' },
      { account_code: '2205', name: 'B', type: 'liability', parent_code: '2105' },
    ];
    const arbol = armarArbolContable(cuentas, () => 3);
    expect(arbol.reduce((suma, nodo) => suma + nodo.amount, 0)).toBe(6);
  });
});

describe('períodos fiscales: un date no se lee como UTC', () => {
  it('diciembre es 01/12–31/12, no 30/11–30/12', () => {
    expect(formatPlainDate('2026-12-01')).toBe('01/12/2026');
    expect(formatPlainDate('2026-12-31')).toBe('31/12/2026');
    const comoUtcEnBogota = new Date('2026-12-01T00:00:00.000Z').toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    expect(comoUtcEnBogota).toBe('30/11/2026');
    expect(formatPlainDate('2026-12-01')).not.toBe(comoUtcEnBogota);
  });

  it('las dos pantallas de períodos pintan el date con formatPlainDate', () => {
    for (const ruta of [
      'src/components/finanzas/contabilidad/periodos-fiscales/PeriodosFiscalesPage.tsx',
      'src/components/finanzas/periodos-contables/PeriodosContablesPage.tsx',
    ]) {
      const fuente = leer(ruta);
      expect(fuente).toContain('formatPlainDate(periodo.start_date)');
      expect(fuente).toContain('formatPlainDate(periodo.end_date)');
      expect(fuente).not.toContain('new Date(periodo.start_date)');
      expect(fuente).not.toContain('new Date(periodo.end_date)');
    }
  });
});

describe('asientos manuales y fallos abiertos', () => {
  const plan = [
    { account_code: '2', parent_code: null },
    { account_code: '21', parent_code: null },
    { account_code: '2105', parent_code: null },
    { account_code: '210505', parent_code: null },
    { account_code: '1105', parent_code: null },
  ];

  it('la clase, el grupo y la cuenta con auxiliares son título', () => {
    expect(esCuentaDeTitulo({ account_code: '2' }, plan)).toBe(true);
    expect(esCuentaDeTitulo({ account_code: '21' }, plan)).toBe(true);
    expect(esCuentaDeTitulo({ account_code: '2105' }, plan)).toBe(true);
    expect(esCuentaDeTitulo({ account_code: '210505' }, plan)).toBe(false);
    expect(esCuentaDeTitulo({ account_code: '1105' }, plan)).toBe(false);
  });

  it('la página de asientos no ofrece títulos y muestra los fallos', () => {
    const pagina = leer('src/components/finanzas/contabilidad/asientos/AsientosPage.tsx');
    expect(pagina).toContain('esCuentaDeTitulo');
    expect(pagina).toContain('cuentasMovimiento');
    expect(pagina).toContain('AlertasContables');
    const sql = leer('supabase/migrations/20261021225000_finanzas_fase1_asientos.sql');
    expect(sql).toContain('CUENTA_DE_TITULO');
    expect(sql).toContain('fn_alertas_contables');
    expect(sql).toContain('asientos_sin_lineas');
  });
});
