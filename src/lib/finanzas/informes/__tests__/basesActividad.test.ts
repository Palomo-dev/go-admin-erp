import { calcularBasesActividad, type FacturaActividad, type MovimientoActividad } from '../basesActividad';

const factura = (id: string, cambios: Partial<FacturaActividad> = {}): FacturaActividad => ({
  id, organization_id: 120, status: 'paid', subtotal: 100, currency: 'COP',
  payment_form: '1', payment_method: 'cash', payment_terms: 0, ...cambios,
});
const linea = (id: string, cuenta: string, debito: number, credito: number, source = 'invoice_sales'): MovimientoActividad => ({
  entry_id: id, entry_date: '2025-01-15', account_code: cuenta,
  debit: debito, credit: credito, posted: true, source, source_id: id,
});
const calcular = (cambios: Partial<Parameters<typeof calcularBasesActividad>[0]> = {}) => calcularBasesActividad({
  organizationId: 120, monedaBase: 'COP', desde: '2025-01-01', hasta: '2025-01-31', movimientos: [], ventas: [], compras: [], ...cambios,
});

describe('Bases verificadas para indicadores de actividad', () => {
  test('incluye la venta originalmente a crédito aunque esté pagada y su devolución posterior', () => {
    const resultado = calcular({
      movimientos: [linea('venta', '4135', 0, 100), linea('devolucion', '4175', 20, 0), linea('contado', '4135', 0, 80)],
      ventas: [factura('venta', { payment_method: 'credit', payment_terms: 30 }),
        factura('devolucion', { document_type: 'credit_note', related_invoice_id: 'venta' }), factura('contado')],
    });
    expect(resultado.basesActividad.ventasCredito).toBe(80);
  });

  test('una nota de período actual hereda el crédito de factura de período anterior', () => {
    const resultado = calcular({
      movimientos: [linea('nota', '4175', 10, 0)],
      ventas: [factura('nota', { document_type: 'credit_note', related_invoice_id: 'anterior' })],
      originalesVentas: [factura('anterior', { payment_terms: 30 })],
    });
    expect(resultado.basesActividad.ventasCredito).toBe(-10);
  });

  test('no confunde forma DIAN1 con venta al contado cuando hay términos pactados', () => {
    expect(calcular({ movimientos: [linea('venta', '4135', 0, 100)], ventas: [factura('venta', { payment_terms: 30 })] }).basesActividad.ventasCredito).toBe(100);
  });

  test('excluye borradores, anulados, cierres, período ajeno y documentos de otra organización', () => {
    const movimientos = [
      { ...linea('borrador', '4135', 0, 100), posted: false },
      { ...linea('anulada', '4135', 0, 100), voided: true },
      { ...linea('fuera', '4135', 0, 100), entry_date: '2024-12-31' },
      linea('void', '4135', 0, 100), linea('draft', '4135', 0, 100),
      linea('cierre', '4135', 100, 0, 'cierre_ejercicio'),
    ];
    expect(calcular({ movimientos, ventas: [factura('void', { status: 'void' }), factura('draft', { status: 'draft' })] }).basesActividad.ventasCredito).toBe(0);
    const ajena = calcular({ movimientos: [linea('ajena', '4135', 0, 100)], ventas: [factura('ajena', { organization_id: 121, payment_method: 'credit' })] });
    expect(ajena.basesActividad.ventasCredito).toBeNull();
    expect(ajena.advertencias).toHaveLength(1);
  });

  test('compras sin IVA cuenta cada factura una vez aunque haya varias líneas contables', () => {
    const resultado = calcular({
      movimientos: [linea('compra', '1435', 100, 0, 'invoice_purchase'), linea('compra', '240810', 19, 0, 'invoice_purchase'),
        linea('compra', '2205', 0, 119, 'invoice_purchase')],
      compras: [factura('compra', { subtotal: 100 })],
    });
    expect(resultado.basesActividad.compras).toBe(100);
  });

  test('la base de compras respeta distribución por centro y los impuestos de cada línea', () => {
    const resultado = calcular({
      centroCosto: 'centro-a', movimientos: [linea('compra', '1435', 100, 0, 'invoice_purchase')],
      compras: [factura('compra', { subtotal: 200 })],
      lineasCompra: [
        { invoice_purchase_id: 'compra', cost_center_id: 'centro-a', total_line: 119, tax_rate: 19 },
        { invoice_purchase_id: 'compra', cost_center_id: 'centro-b', total_line: 105, tax_rate: 5 },
      ],
    });
    expect(resultado.basesActividad.compras).toBe(100);
  });

  test('una base faltante no impide usar la otra y no mezcla subtotales extranjeros sin cambio histórico', () => {
    const resultado = calcular({
      movimientos: [linea('sin-factura', '4135', 0, 100), linea('compra', '1435', 100, 0, 'invoice_purchase')],
      compras: [factura('compra')],
    });
    expect(resultado.basesActividad.ventasCredito).toBeNull();
    expect(resultado.basesActividad.compras).toBe(100);
    expect(calcular({ movimientos: [linea('compra', '1435', 100, 0, 'invoice_purchase')], compras: [factura('compra', { currency: 'USD' })] }).basesActividad.compras).toBeNull();
  });

  test('usa la moneda base recibida y conserva como pendiente una moneda desconocida', () => {
    const movimientos = [linea('compra', '1435', 100, 0, 'invoice_purchase')];
    expect(calcular({ monedaBase: 'USD', movimientos, compras: [factura('compra', { currency: ' usd ' })] }).basesActividad.compras).toBe(100);
    expect(calcular({ movimientos, compras: [factura('compra', { currency: null })] }).basesActividad.compras).toBeNull();
    const incompleta = calcular({ monedaBase: null, movimientos, compras: [factura('compra')] });
    expect(incompleta.basesActividad).toMatchObject({ ventasCredito: null, compras: null });
    expect(incompleta.advertencias.join(' ')).toContain('moneda base no está verificada');
  });
});
