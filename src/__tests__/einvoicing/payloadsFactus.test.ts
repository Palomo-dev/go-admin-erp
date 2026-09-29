/**
 * Documentos para Factus v2. Los totales esperados son los que devolvió el
 * sandbox de Factus el 2026-09-23 para las mismas líneas (datos ficticios):
 * si el cálculo difiere, Factus rechaza el pago («la suma de los detalles de
 * pago no es igual al total de la factura»).
 */

import {
  mapearLinea,
  mapearLineas,
  cantidadFactus,
  unidadFactus,
  mapearCliente,
  elegirRango,
  construirFactura,
  construirNotaCredito,
  construirDocumentoSoporte,
  conceptoNotaCredito,
  DatosIncompletosError,
  CONSUMIDOR_FINAL,
  type RangoNumeracion,
} from '@/lib/services/einvoicing/payloadsFactus';

describe('mapearLinea: precio sin impuesto y descuento en %', () => {
  test('IVA incluido con descuento en valor (verificado en sandbox: 209.995,18)', () => {
    const linea = { qty: 1, unit_price: 108000, tax_rate: 19, tax_included: true, discount_amount: 3000 };
    const { items, total } = mapearLineas([linea, linea]);
    expect(total).toBe(209995.18);
    expect(items[0]).toMatchObject({ price: '90756.30', quantity: '1.00', discount_rate: '2.78', taxes: [{ code: '01', rate: '19.00' }] });
  });

  test('mezcla de tasas, IVA incluido y excluido (verificado en sandbox: 167.370,01)', () => {
    const { total } = mapearLineas([
      { qty: 3, unit_price: 12750, tax_rate: 0 },
      { qty: 2, unit_price: 14950.5, tax_rate: 19, tax_included: true },
      { qty: 1, unit_price: 99999, tax_rate: 5, tax_included: true, discount_amount: 777 },
    ]);
    expect(total).toBe(167370.01);
  });

  test('sin IVA incluido el precio va tal cual y sin descuento no manda discount_rate', () => {
    const { item, total } = mapearLinea({ qty: 1, unit_price: 10000, tax_rate: 19 }, 0);
    expect(item.price).toBe('10000.00');
    expect(item).not.toHaveProperty('discount_rate');
    expect(total).toBe(11900);
    expect(item.code_reference).toBe('ITEM-1');
  });

  test('tax_code heredado IVA_19 → código DIAN 01; producto → PROD-<id>', () => {
    const { item } = mapearLinea({ qty: 2, unit_price: 5000, tax_rate: 19, tax_code: 'IVA_19', product_id: 77 }, 0);
    expect(item.taxes[0].code).toBe('01');
    expect(item.code_reference).toBe('PROD-77');
  });
});

describe('mapearCliente', () => {
  test('sin identificación → consumidor final 222222222222 con responsabilidades', () => {
    const c = mapearCliente({ first_name: 'Ana', identification_number: null }, '11001');
    expect(c).toMatchObject({
      identification_document_code: '13',
      identification: CONSUMIDOR_FINAL,
      legal_organization_code: '2',
      tribute_code: 'ZZ',
      municipality_code: '11001',
      responsibilities: ['R-99-PN'],
    });
  });

  test('cliente con cédula en minúsculas y responsabilidades propias', () => {
    const c = mapearCliente(
      { identification_type: 'cc', identification_number: '1020304050', first_name: 'Ana', last_name: 'Pérez', tribute_id: 21, fiscal_responsibilities: ['O-47'] },
      '05001',
    );
    expect(c).toMatchObject({ identification_document_code: '13', identification: '1020304050', names: 'Ana Pérez', tribute_code: 'ZZ', responsibilities: ['O-47'] });
    expect(c).not.toHaveProperty('email');
  });

  test('empresa con NIT → persona jurídica', () => {
    const c = mapearCliente({ identification_type: 'NIT', identification_number: '900123456', dv: 7, company_name: 'Empresa de prueba', customer_type: 'company' }, '11001');
    expect(c).toMatchObject({ identification_document_code: '31', dv: '7', company: 'Empresa de prueba', legal_organization_code: '1' });
  });
});

describe('elegirRango: duplicados sin romper', () => {
  const base = { document_type: 'credit_note', is_active: true, valid_from: null, valid_until: null };
  const rangos: RangoNumeracion[] = [
    { ...base, id: 7, branch_id: 107, prefix: 'CRTE', factus_numbering_range_id: 1776 },
    { ...base, id: 8, branch_id: 107, prefix: 'NC', factus_numbering_range_id: 390 },
    { ...base, id: 20, branch_id: 200, prefix: 'OTRA', factus_numbering_range_id: 999 },
    { ...base, id: 30, branch_id: 107, prefix: 'SIN', factus_numbering_range_id: null },
  ];

  test('dos activos en la sucursal → el más reciente y un aviso', () => {
    const r = elegirRango(rangos, { branchId: 107, documentType: 'credit_note', hoy: '2026-09-24' });
    expect(r.rango?.prefix).toBe('NC');
    expect(r.aviso).toMatch(/2 rangos activos/);
  });

  test('sucursal sin rango → uno de la organización, con aviso', () => {
    const r = elegirRango(rangos, { branchId: 300, documentType: 'credit_note', hoy: '2026-09-24' });
    expect(r.rango).not.toBeNull();
    expect(r.aviso).toMatch(/no tiene un rango propio/);
  });

  test('vencidos y sin id de Factus no cuentan', () => {
    const r = elegirRango(
      [{ id: 1, branch_id: 1, document_type: 'invoice', prefix: 'FE', is_active: true, factus_numbering_range_id: 5, valid_from: '2025-01-01', valid_until: '2026-01-01' }],
      { branchId: 1, documentType: 'invoice', hoy: '2026-09-24' },
    );
    expect(r).toEqual({ rango: null, aviso: null });
  });
});

describe('construirFactura', () => {
  const cliente = mapearCliente(null, '11001');

  test('pago = total que calcula Factus; sin establecimiento no se inventan datos', () => {
    const { payload, total } = construirFactura({
      factura: { payment_form: '1', payment_method_code: '10', notes: 'Venta' },
      lineas: [{ qty: 1, unit_price: 11900, tax_rate: 19, tax_included: true }],
      cliente,
      referencia: 'INV-abc',
      numberingRangeId: 389,
    });
    expect(total).toBe(11900);
    expect(payload.payment_details).toEqual([{ payment_form: '1', payment_method_code: '10', amount: '11900.00' }]);
    expect(payload).not.toHaveProperty('establishment');
    expect(payload).toMatchObject({ reference_code: 'INV-abc', numbering_range_id: 389, document: '01', customer: { responsibilities: ['R-99-PN'] } });
  });

  test('sin líneas → datos incompletos', () => {
    expect(() =>
      construirFactura({ factura: {}, lineas: [], cliente, referencia: 'x', numberingRangeId: 1 }),
    ).toThrow(DatosIncompletosError);
  });
});

describe('construirNotaCredito (v2)', () => {
  test('lleva concepto, customization 20, número DIAN de la factura, cliente y pagos', () => {
    const { payload } = construirNotaCredito({
      lineas: [{ qty: -1, unit_price: 10000, tax_rate: 19 }],
      cliente: mapearCliente(null, '11001'),
      referencia: 'NC-1',
      numberingRangeId: 1776,
      numeroFacturaDian: 'SETP990020456',
      concepto: '2',
      observacion: 'Devolución total',
      metodoPago: '10',
    });
    expect(payload).toMatchObject({
      correction_concept_code: '2',
      customization_id: '20',
      bill_number: 'SETP990020456',
      numbering_range_id: 1776,
      payment_details: [{ payment_form: '1', payment_method_code: '10', amount: '11900.00' }],
      customer: { identification: CONSUMIDOR_FINAL },
    });
    expect(payload.items[0].quantity).toBe('1.00');
    expect(payload).not.toHaveProperty('billing_reference');
  });

  test('sin número DIAN de la factura no se construye', () => {
    expect(() =>
      construirNotaCredito({
        lineas: [{ qty: 1, unit_price: 1, tax_rate: 0 }],
        cliente: mapearCliente(null, '11001'),
        referencia: 'NC-2',
        numberingRangeId: null,
        numeroFacturaDian: '',
        concepto: '1',
        observacion: '',
        metodoPago: '10',
      }),
    ).toThrow(DatosIncompletosError);
  });

  test('concepto por defecto: total → anulación; productos → devolución; valor → rebaja', () => {
    expect(conceptoNotaCredito({ totalNota: -100, totalFactura: 100, conProductos: true })).toBe('2');
    expect(conceptoNotaCredito({ totalNota: -40, totalFactura: 100, conProductos: true })).toBe('1');
    expect(conceptoNotaCredito({ totalNota: -40, totalFactura: 100, conProductos: false })).toBe('3');
  });
});

describe('construirDocumentoSoporte', () => {
  test('sin identificación del proveedor → datos incompletos', () => {
    expect(() =>
      construirDocumentoSoporte({
        documento: { reference_code: 'DS-1', provider: { names: 'Sin documento' } },
        lineas: [{ qty: 1, unit_price: 1000, tax_rate: 0 }],
        numberingRangeId: 2058,
      }),
    ).toThrow(DatosIncompletosError);
  });

  test('con proveedor completo arma el payload con su rango', () => {
    const p = construirDocumentoSoporte({
      documento: { reference_code: 'DS-1', total: 1000, provider: { identification: '123', names: 'Proveedor de prueba' } },
      lineas: [{ qty: 1, unit_price: 1000, tax_rate: 0 }],
      numberingRangeId: 2058,
    });
    expect(p).toMatchObject({ reference_code: 'DS-1', numbering_range_id: 2058, provider: { identification: '123', identification_document_code: '31' } });
    expect(p.payment_details[0].amount).toBe('1000.00');
  });
});

describe('venta por peso (PRODUCTOS-POR-PESO-BASCULA.md, fase 1)', () => {
  test('la cantidad viaja con 3 decimales: 0,735 kg no se redondea a 0,74', () => {
    const { item, total } = mapearLinea({ qty: '0.735', unit_price: 18900, tax_rate: 0, unit_measure_id: 71, unit_measure_code: 'KGM' }, 0);
    expect(item.quantity).toBe('0.735');
    expect(item.unit_measure_code).toBe('KGM');
    expect(total).toBe(13891.5);
  });

  test('cantidades con 2 decimales o enteras conservan el formato de siempre', () => {
    expect(cantidadFactus(1)).toBe('1.00');
    expect(cantidadFactus(2.5)).toBe('2.50');
    expect(cantidadFactus(1.25)).toBe('1.25');
    expect(cantidadFactus(0.7354)).toBe('0.735');
    expect(cantidadFactus(-0.375)).toBe('0.375');
  });

  test('la unidad sale del código DIAN cargado; sin código, respaldo «94» Unidad', () => {
    expect(unidadFactus({ unit_measure_id: 71, unit_measure_code: ' KGM ' })).toBe('KGM');
    expect(unidadFactus({ unit_measure_id: 70, unit_measure_code: null })).toBe('94');
    expect(unidadFactus({ unit_measure_id: null })).toBe('94');
  });

  test('IVA incluido por peso: base con 3 decimales de cantidad', () => {
    const { item } = mapearLinea({ qty: 1.25, unit_price: 11900, tax_rate: 19, tax_included: true }, 0);
    expect(item.quantity).toBe('1.25');
    expect(item.price).toBe('10000.00');
  });
});
