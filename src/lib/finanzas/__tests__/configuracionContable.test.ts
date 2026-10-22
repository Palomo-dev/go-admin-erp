import {
  aplicarConfiguracion,
  claveDeCuenta,
  etiquetaEvento,
  etiquetaMotivoFallo,
  etiquetaOrigen,
  mensajeCuentaAusente,
  mensajeCuentaTitulo,
  mensajeMismaCuenta,
  nombreSector,
  propuestaPorSector,
  resolverLado,
  validarCuentasDeRegla,
  type CuentaContable,
  type FilaConfiguracion,
} from '../configuracionContable';

const PLAN: CuentaContable[] = [
  { account_code: '1105', es_movimiento: true },
  { account_code: '110505', es_movimiento: true },
  { account_code: '1110', es_movimiento: true },
  { account_code: '111005', es_movimiento: true },
  { account_code: '1305', es_movimiento: true },
  { account_code: '1405', es_movimiento: true },
  { account_code: '1435', es_movimiento: true },
  { account_code: '2205', es_movimiento: true },
  { account_code: '2365', es_movimiento: true },
  { account_code: '2408', es_movimiento: true },
  { account_code: '240801', es_movimiento: true },
  { account_code: '240802', es_movimiento: true },
  { account_code: '2505', es_movimiento: true },
  { account_code: '2805', es_movimiento: true },
  { account_code: '4110', es_movimiento: true },
  { account_code: '4135', es_movimiento: true },
  { account_code: '4175', es_movimiento: true },
  { account_code: '417505', es_movimiento: true },
  { account_code: '4235', es_movimiento: true },
  { account_code: '5105', es_movimiento: true },
  { account_code: '5195', es_movimiento: true },
  { account_code: '5235', es_movimiento: true },
  { account_code: '6135', es_movimiento: true },
  { account_code: '1', es_movimiento: false, name: 'Activo' },
  { account_code: '4105', es_movimiento: null },
];

const CAJA: FilaConfiguracion = { clave: 'caja', account_code: '110505', branch_id: null };
const BANCOS: FilaConfiguracion = { clave: 'bancos', account_code: '111005', branch_id: null };
const VENTAS: FilaConfiguracion = { clave: 'ventas_productos', account_code: '4135', branch_id: null };
const IVA_GEN: FilaConfiguracion = { clave: 'iva_generado', account_code: '240801', branch_id: null };
const IVA_DESC: FilaConfiguracion = { clave: 'iva_descontable', account_code: '240802', branch_id: null };
const PROPINAS: FilaConfiguracion = { clave: 'propinas', account_code: '5195', branch_id: null };
const NOMINA: FilaConfiguracion = { clave: 'nomina', account_code: '5105', branch_id: null };
const DEVOL: FilaConfiguracion = { clave: 'devoluciones', account_code: '4175', branch_id: null };
const DESCU: FilaConfiguracion = { clave: 'descuentos', account_code: '417505', branch_id: null };

function aplicar(
  source: string,
  debito: string,
  credito: string,
  filas: FilaConfiguracion[],
  impuesto?: string | null,
  branchId: number | null = null,
) {
  return aplicarConfiguracion({ source, branchId, debito, credito, impuesto, filas, plan: PLAN });
}

describe('clave de la cuenta', () => {
  test('sin configuración el asiento se queda con los códigos de la regla', () => {
    const r = aplicar('invoice_sales', '1105', '4135', [], '2408');
    expect(r).toEqual({ debito: '1105', credito: '4135', impuesto: '2408', fallo: null });
  });

  test('la caja y el banco de la venta usan la cuenta configurada', () => {
    const contado = aplicar('sales', '1105', '4135', [CAJA, VENTAS], '2408');
    expect(contado.debito).toBe('110505');
    expect(contado.credito).toBe('4135');
    expect(contado.fallo).toBeNull();

    const cobro = aplicar('payments', '1110', '1305', [BANCOS]);
    expect(cobro.debito).toBe('111005');
    expect(cobro.credito).toBe('1305');
  });

  test('un auxiliar de banco no se reemplaza por la clave bancos', () => {
    expect(claveDeCuenta('bank_transactions', 'debito', '111005')).toBeNull();
  });

  test('la propina y la nómina no comparten el 5105', () => {
    expect(claveDeCuenta('tips', 'debito', '5105')).toBe('propinas');
    expect(claveDeCuenta('tip', 'debito', '5105')).toBe('propinas');
    expect(claveDeCuenta('payroll_slips', 'debito', '5105')).toBe('nomina');
    expect(claveDeCuenta('payroll', 'debito', '5105')).toBe('nomina');
    expect(claveDeCuenta('payroll_periods', 'credito', '2505')).toBe('nomina_por_pagar');
    expect(claveDeCuenta('shipment', 'debito', '5105')).toBeNull();
    expect(claveDeCuenta('expense', 'debito', '5105')).toBeNull();
    expect(claveDeCuenta('maintenance', 'debito', '5105')).toBeNull();
    expect(claveDeCuenta('bank_transactions', 'credito', '5105')).toBeNull();

    const propina = aplicar('tips', '5105', '1105', [PROPINAS, NOMINA, CAJA]);
    expect(propina.debito).toBe('5195');
    expect(propina.credito).toBe('110505');
  });

  test('la comisión no se lleva la cuenta de aportes de nómina', () => {
    expect(claveDeCuenta('commissions', 'debito', '5235')).toBe('comisiones');
    expect(claveDeCuenta('commission', 'credito', '2370')).toBeNull();
    expect(claveDeCuenta('ota_commission', 'debito', '5235')).toBe('comisiones');
    expect(claveDeCuenta('payroll_slips', 'credito', '2370')).toBe('nomina_aportes');
  });

  test('el IVA de la venta y el de la compra son claves distintas aunque el código sea el mismo', () => {
    expect(claveDeCuenta('invoice_sales', 'impuesto', '2408')).toBe('iva_generado');
    expect(claveDeCuenta('sale', 'impuesto', '2405')).toBe('iva_generado');
    expect(claveDeCuenta('invoice_purchase', 'impuesto', '2408')).toBe('iva_descontable');
    expect(claveDeCuenta('purchase_order', 'impuesto', '2408')).toBe('iva_descontable');
    expect(claveDeCuenta('reservation', 'credito', '2405')).toBeNull();

    const venta = aplicar('invoice_sales', '1305', '4135', [IVA_GEN, IVA_DESC], '2408');
    expect(venta.impuesto).toBe('240801');
    const compra = aplicar('invoice_purchase', '1435', '2205', [IVA_GEN, IVA_DESC], '2408');
    expect(compra.impuesto).toBe('240802');
    const nota = aplicar('invoice_sales', '4175', '1305', [IVA_GEN, DEVOL], '2408');
    expect(nota.impuesto).toBe('240801');
    expect(nota.debito).toBe('4175');
  });

  test('anular una venta debita devoluciones y no ventas', () => {
    expect(claveDeCuenta('invoice_sales', 'debito', '4105')).toBe('devoluciones');
    expect(claveDeCuenta('invoice_sales', 'credito', '4105')).toBe('ventas_productos');
    expect(claveDeCuenta('returns', 'debito', '4135')).toBe('devoluciones');
    expect(claveDeCuenta('folio_items', 'credito', '4110')).toBe('ventas_productos');
    expect(claveDeCuenta('parking_sessions', 'credito', '4235')).toBe('ventas_servicios');
  });

  test('el descuento no usa la clave de devoluciones', () => {
    const descuento = resolverLado({
      source: 'invoice_purchase',
      lado: 'descuento',
      codigo: '4175',
      branchId: null,
      filas: [DEVOL, DESCU],
      plan: PLAN,
    });
    expect(descuento.cuenta).toBe('417505');
    expect(claveDeCuenta('invoice_purchase', 'descuento', '4175')).toBe('descuentos');
    expect(claveDeCuenta('invoice_sales', 'debito', '4175')).toBe('devoluciones');
  });

  test('el préstamo no convierte el 1305 en clientes', () => {
    expect(claveDeCuenta('employee_loans', 'debito', '1305')).toBeNull();
    expect(claveDeCuenta('loan_installments', 'credito', '1305')).toBeNull();
    expect(claveDeCuenta('invoice_sales', 'debito', '1305')).toBe('clientes');
  });

  test('la sede gana sobre la organización y una sede sin fila hereda', () => {
    const filas: FilaConfiguracion[] = [
      CAJA,
      { clave: 'caja', account_code: '1105', branch_id: 7 },
    ];
    expect(aplicar('sales', '1105', '4135', filas, null, 7).debito).toBe('1105');
    expect(aplicar('sales', '1105', '4135', filas, null, 8).debito).toBe('110505');
  });

  test('una cuenta configurada que no está en el plan deja fallo visible', () => {
    const filas: FilaConfiguracion[] = [{ clave: 'caja', account_code: '110599', branch_id: null }];
    const r = aplicar('sales', '1105', '4135', filas);
    expect(r.fallo).toBe(mensajeCuentaAusente('110599', 'Caja'));
    expect(r.debito).toBe('110599');
  });

  test('una cuenta de título configurada no recibe el asiento', () => {
    const filas: FilaConfiguracion[] = [{ clave: 'caja', account_code: '1', branch_id: null }];
    const r = aplicar('sales', '1105', '4135', filas);
    expect(r.fallo).toBe(mensajeCuentaTitulo('1', 'Caja'));
  });

  test('un null en es_movimiento sigue siendo cuenta de movimiento', () => {
    const filas: FilaConfiguracion[] = [{ clave: 'ventas_productos', account_code: '4105', branch_id: null }];
    const r = aplicar('invoice_sales', '1305', '4135', filas);
    expect(r.credito).toBe('4105');
    expect(r.fallo).toBeNull();
  });

  test('dos claves que terminan en la misma cuenta no se contabilizan', () => {
    const filas: FilaConfiguracion[] = [
      { clave: 'caja', account_code: '1110', branch_id: null },
      { clave: 'bancos', account_code: '1110', branch_id: null },
    ];
    const r = aplicar('payments', '1105', '1110', filas);
    expect(r.fallo).toBe(mensajeMismaCuenta('1110'));
  });
});

describe('plantilla por sector', () => {
  test('comercio, gimnasio y transporte comparten el PUC de ventas', () => {
    for (const tipo of [null, 3, 5, 6]) {
      const p = propuestaPorSector(tipo);
      expect(p.ventas_productos).toBe('4135');
      expect(p.ventas_servicios).toBe('4235');
      expect(p.costo_ventas).toBe('6135');
      expect(p.inventario).toBe('1435');
    }
  });

  test('restaurante, hotel, servicios y parqueadero mueven las ventas', () => {
    expect(propuestaPorSector(1)).toMatchObject({
      ventas_productos: '4110',
      ventas_servicios: '4140',
      costo_ventas: '6140',
      inventario: '1405',
    });
    expect(propuestaPorSector(2)).toMatchObject({
      ventas_productos: '4110',
      ventas_servicios: '4115',
      costo_ventas: '6140',
      inventario: '1435',
    });
    expect(propuestaPorSector(4).ventas_productos).toBe('4155');
    expect(propuestaPorSector(7).ventas_productos).toBe('4235');
    expect(propuestaPorSector(7).ventas_servicios).toBe('4235');
  });

  test('las cuentas compartidas salen de la plantilla', () => {
    const p = propuestaPorSector(3);
    expect(p).toMatchObject({
      caja: '1105',
      bancos: '1110',
      clientes: '1305',
      proveedores: '2205',
      devoluciones: '4175',
      descuentos: '4175',
      iva_generado: '2408',
      iva_descontable: '2408',
      retefuente: '2365',
      reteiva: '2367',
      reteica: '2368',
      propinas: '5105',
      comisiones: '5235',
      anticipos: '2805',
      nomina: '5105',
      nomina_por_pagar: '2505',
      nomina_aportes: '2370',
    });
    expect(nombreSector(1)).toBe('Restaurante');
    expect(nombreSector(99)).toBe('Comercio');
  });
});

describe('reglas y nombres', () => {
  test('traduce los orígenes técnicos', () => {
    expect(etiquetaOrigen('commission')).toBe('Comisión');
    expect(etiquetaEvento('accrued')).toBe('Causación');
    expect(etiquetaOrigen('folio_item')).toBe('Cargo de folio');
    expect(etiquetaOrigen('installment')).toBe('Cuota');
    expect(etiquetaOrigen('tips')).toBe('Propina');
    expect(etiquetaOrigen('invoice_sales')).toBe('Venta');
    expect(etiquetaOrigen('payroll_slips')).toBe('Nómina');
  });

  test('un origen desconocido se muestra tal cual', () => {
    expect(etiquetaOrigen('algo_nuevo')).toBe('algo_nuevo');
    expect(etiquetaMotivoFallo('cuenta_no_configurada')).toBe('La cuenta configurada no sirve para contabilizar');
  });

  test('la regla solo acepta cuentas de movimiento que existan', () => {
    expect(validarCuentasDeRegla({ debito: '1105', credito: '4135', impuesto: '2408' }, PLAN)).toBeNull();
    expect(validarCuentasDeRegla({ debito: '1105', credito: '4135', impuesto: null }, PLAN)).toBeNull();
    expect(validarCuentasDeRegla({ debito: '1105', credito: '4135', impuesto: '4105' }, PLAN)).toBeNull();
    expect(validarCuentasDeRegla({ debito: '9999', credito: '4135' }, PLAN)).toMatch(/no existe/);
    expect(validarCuentasDeRegla({ debito: '1', credito: '4135' }, PLAN)).toMatch(/título/);
    expect(validarCuentasDeRegla(
      { debito: '1105', credito: '4135' },
      [{ account_code: '1105', is_active: false, es_movimiento: true }, { account_code: '4135', es_movimiento: true }],
    )).toMatch(/inactiva/);
  });
});
