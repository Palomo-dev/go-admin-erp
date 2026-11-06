import {
  accionDe,
  celdasCsv,
  datoFaltante,
  errorDePendiente,
  esReversa,
  kpisDe,
  responsableDe,
  tipoDocumento,
  type ResumenPendientes,
} from '../pendientesContables';

const base = { id: 7, origen: 'invoice_sales', origenId: 'abc', debito: null, credito: null };

describe('qué falló y qué falta', () => {
  it('un motivo desconocido no se pierde: queda para revisar', () => {
    expect(errorDePendiente('motivo_nuevo')).toBe('otro');
    expect(accionDe({ ...base, motivo: 'motivo_nuevo' })).toEqual({ accion: 'verDetalle', href: null });
    expect(datoFaltante({ ...base, motivo: 'motivo_nuevo' })).toEqual({ tipo: 'revisar' });
  });

  it('nombra la cuenta que no existe', () => {
    expect(datoFaltante({ ...base, motivo: 'credit_account_missing', credito: '4135' })).toEqual({ tipo: 'cuenta', cuenta: '4135' });
    expect(datoFaltante({ ...base, motivo: 'debit_account_missing', debito: '5195' })).toEqual({ tipo: 'cuenta', cuenta: '5195' });
  });

  it('nombra la cuenta de título', () => {
    expect(datoFaltante({ ...base, motivo: 'cuenta_no_es_de_movimiento', debito: '1110' })).toEqual({ tipo: 'cuenta', cuenta: '1110' });
  });

  it('periodo cerrado y tercero', () => {
    expect(datoFaltante({ ...base, motivo: 'period_closed' })).toEqual({ tipo: 'periodo' });
    expect(datoFaltante({ ...base, motivo: 'tercero_requerido' })).toEqual({ tipo: 'tercero' });
  });
});

describe('dónde se arregla', () => {
  it.each([
    ['period_closed', 'reabrirPeriodo', '/app/finanzas/contabilidad/periodos-fiscales'],
    ['debit_account_missing', 'corregirRegla', '/app/finanzas/reglas-contables'],
    ['no_rule', 'corregirRegla', '/app/finanzas/reglas-contables'],
    ['cuenta_no_configurada', 'configurar', '/app/finanzas/configuracion-contable'],
    ['cuenta_no_es_de_movimiento', 'elegirAuxiliar', '/app/finanzas/contabilidad/plan-cuentas'],
  ])('%s', (motivo, accion, href) => {
    expect(accionDe({ ...base, motivo })).toEqual({ accion, href });
  });

  it('el tercero se completa en el documento', () => {
    expect(accionDe({ id: 1, motivo: 'tercero_requerido', origen: 'invoice_purchase', origenId: 'x1' })).toEqual({
      accion: 'completarTercero',
      href: '/app/finanzas/facturas-compra/x1',
    });
  });

  it('sin documento que abrir, se resuelve en el detalle', () => {
    expect(accionDe({ id: 1, motivo: 'tercero_requerido', origen: 'cash_movements', origenId: '9' })).toEqual({ accion: 'verDetalle', href: null });
  });
});

describe('redondeo y reversas', () => {
  it.each([
    ['redondeo_sin_cuenta', 'redondeoSinCuenta', 'configurarRedondeo', { tipo: 'redondeo' }],
    ['reversa_cuenta_titulo', 'reversaCuentaTitulo', 'elegirAuxiliar', { tipo: 'auxiliar' }],
    ['linea_sin_cuenta', 'reversaLineaSinCuenta', 'asignarCuenta', { tipo: 'auxiliar' }],
  ])('%s se resuelve en su página', (motivo, error, accion, dato) => {
    expect(errorDePendiente(motivo)).toBe(error);
    expect(accionDe({ ...base, motivo })).toEqual({ accion, href: '/app/finanzas/contabilidad/pendientes/7' });
    expect(datoFaltante({ ...base, motivo })).toEqual(dato);
    expect(responsableDe({ motivo, origen: 'reversal' })).toBe('contador');
  });

  it('solo las reversas exigen Revertir asientos', () => {
    expect(esReversa('linea_sin_cuenta')).toBe(true);
    expect(esReversa('reversa_cuenta_titulo')).toBe(true);
    expect(esReversa('redondeo_sin_cuenta')).toBe(false);
  });
});

describe('quién responde', () => {
  it('reglas y periodos son del Contador', () => {
    expect(responsableDe({ motivo: 'no_rule', origen: 'invoice_sales' })).toBe('contador');
    expect(responsableDe({ motivo: 'period_closed', origen: 'stock_movements' })).toBe('contador');
  });

  it('el dato del documento es de su área', () => {
    expect(responsableDe({ motivo: 'tercero_requerido', origen: 'invoice_purchase' })).toBe('compras');
    expect(responsableDe({ motivo: 'tercero_requerido', origen: 'invoice_sales' })).toBe('ventas');
  });

  it('la cuenta de título de un recibo es de Tesorería', () => {
    expect(responsableDe({ motivo: 'cuenta_de_titulo', origen: 'cash_movements' })).toBe('tesoreria');
    expect(responsableDe({ motivo: 'cuenta_de_titulo', origen: 'invoice_sales' })).toBe('contador');
  });
});

describe('los KPI', () => {
  it('un error nunca se muestra como cero', () => {
    expect(kpisDe(null)).toEqual({ pendientes: null, masAntiguoDias: null, bloqueanCierre: null, valor: null });
  });

  it('cero de verdad sigue siendo cero', () => {
    const vacio: ResumenPendientes = {
      pendientes: 0,
      masAntiguoDias: null,
      bloqueanCierre: 0,
      periodoInicio: null,
      valor: 0,
      totalFiltradas: 0,
      filas: [],
    };
    expect(kpisDe(vacio)).toMatchObject({ pendientes: 0, bloqueanCierre: 0, valor: 0 });
  });
});

describe('el documento y la exportación', () => {
  it('traduce el origen', () => {
    expect(tipoDocumento('invoice_sales')).toBe('factura');
    expect(tipoDocumento(null)).toBe('otro');
    expect(tipoDocumento('algo')).toBe('otro');
  });

  it('el CSV no deja pasar fórmulas ni rompe columnas', () => {
    expect(celdasCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(celdasCsv('a,b')).toBe('"a,b"');
    expect(celdasCsv(null)).toBe('');
    expect(celdasCsv(12)).toBe('12');
  });
});
