import { calcularContribucionDirecta, type EntradaContribucion } from '../contribucionProductos';

const entrada = (cambios: Partial<EntradaContribucion> = {}): EntradaContribucion => ({
  organizationId: 120, monedaBase: 'COP', desde: '2026-01-01', hasta: '2026-12-31',
  movimientos: [{ entry_id: 1, entry_date: '2026-01-15', account_code: '4135', debit: 0, credit: 100, posted: true, source: 'invoice_sales', source_id: 'factura' }],
  ventas: [{ id: 'factura', organization_id: 120, status: 'paid', currency: 'COP', subtotal: 100, sale_id: 'venta' }],
  lineas: [{ invoice_sales_id: 'factura', product_id: 1, qty: 2, total_line: 119, tax_rate: 19 }],
  productos: [{ id: 1, name: 'Producto de prueba', linea: 'Línea de prueba' }],
  stock: [{ product_id: 1, source: 'sale', source_id: 'venta', direction: 'out', qty: 1, unit_cost: 20 },
    { product_id: 1, source: 'sale', source_id: 'venta', direction: 'out', qty: 1, unit_cost: 30 }],
  costoVariableTotal: 50, ...cambios,
});

describe('Contribución directa de productos desde costo histórico', () => {
  test('suma salidas de varios lotes, conserva costo histórico y quita IVA de venta', () => {
    const resultado = calcularContribucionDirecta(entrada());
    expect(resultado.productos).toEqual([{ id: '1', nombre: 'Producto de prueba', linea: 'Línea de prueba', ventas: 100, costoVariable: 50, unidades: 2 }]);
    expect(resultado.costoVariableNoDistribuido).toBe(0);
    expect(resultado.unidadesHomogeneas).toBe(true);
    expect(resultado.advertencias).toEqual([]);
  });

  test('no duplica el mismo costo cuando hay dos facturas que apuntan a una venta', () => {
    const base = entrada();
    const resultado = calcularContribucionDirecta(entrada({
      movimientos: [...base.movimientos, { ...base.movimientos[0], entry_id: 2, source_id: 'duplicada' }],
      ventas: [...base.ventas, { ...base.ventas[0], id: 'duplicada' }],
      lineas: [...base.lineas, { ...base.lineas[0], invoice_sales_id: 'duplicada' }],
    }));
    expect(resultado.productos).toEqual([]);
    expect(resultado.advertencias.join(' ')).toContain('costo histórico verificables');
  });

  test('invoice_sale conserva el source_id de venta verificado en los movimientos reales', () => {
    const resultado = calcularContribucionDirecta(entrada({ stock: entrada().stock.map((s) => ({ ...s, source: 'invoice_sale' })) }));
    expect(resultado.productos[0]).toMatchObject({ ventas: 100, costoVariable: 50 });
  });

  test('devuelve ventas y costo de una nota solo con su entrada de inventario identificada', () => {
    const base = entrada();
    const resultado = calcularContribucionDirecta(entrada({
      movimientos: [...base.movimientos, { ...base.movimientos[0], entry_id: 2, source_id: 'nota', account_code: '4175', debit: 50, credit: 0 }],
      ventas: [...base.ventas, { ...base.ventas[0], id: 'nota', sale_id: null, document_type: 'credit_note' }],
      lineas: [...base.lineas, { ...base.lineas[0], invoice_sales_id: 'nota', qty: -1, total_line: -59.5 }],
      stock: [...base.stock, { product_id: 1, source: 'credit_note', source_id: 'nota', direction: 'in', qty: 1, unit_cost: 20 }],
      costoVariableTotal: 30,
    }));
    expect(resultado.productos[0]).toMatchObject({ ventas: 50, costoVariable: 30, unidades: 1 });
    expect(resultado.advertencias).toEqual([]);
  });

  test('no rellena costos inexistentes con cero ni incluye borradores o facturas de otra organización', () => {
    expect(calcularContribucionDirecta(entrada({ stock: [] })).productos).toEqual([]);
    expect(calcularContribucionDirecta(entrada({ movimientos: entrada().movimientos.map((m) => ({ ...m, posted: false })) })).productos).toEqual([]);
    expect(calcularContribucionDirecta(entrada({ ventas: entrada().ventas.map((f) => ({ ...f, organization_id: 121 })) })).productos).toEqual([]);
  });

  test('muestra costo variable sin distribuir sin asignarlo arbitrariamente a productos', () => {
    const resultado = calcularContribucionDirecta(entrada({ costoVariableTotal: 70 }));
    expect(resultado.productos[0].costoVariable).toBe(50);
    expect(resultado.costoVariableNoDistribuido).toBe(20);
    expect(resultado.advertencias.join(' ')).toContain('sin distribuir');
  });

  test('no mezcla un precio en dólares con el costo histórico en pesos', () => {
    const resultado = calcularContribucionDirecta(entrada({ ventas: entrada().ventas.map((f) => ({ ...f, currency: 'USD' })) }));
    expect(resultado.productos).toEqual([]);
    expect(resultado.advertencias.join(' ')).toContain('otra moneda');
  });

  test('una organización con base en dólares usa esa moneda y una base ausente no presume pesos', () => {
    const dolares = calcularContribucionDirecta(entrada({ monedaBase: ' usd ', ventas: entrada().ventas.map((f) => ({ ...f, currency: 'USD' })) }));
    expect(dolares.productos[0]).toMatchObject({ ventas: 100, costoVariable: 50 });
    const desconocida = calcularContribucionDirecta(entrada({ monedaBase: null }));
    expect(desconocida.productos).toEqual([]);
    expect(desconocida.costoVariableNoDistribuido).toBe(50);
    expect(desconocida.advertencias.join(' ')).toContain('moneda base no está verificada');
  });

  test('un producto con venta parcialmente no costeada no presenta un margen sesgado', () => {
    const base = entrada();
    const resultado = calcularContribucionDirecta(entrada({
      movimientos: [...base.movimientos, { ...base.movimientos[0], entry_id: 2, source_id: 'otra' }],
      ventas: [...base.ventas, { ...base.ventas[0], id: 'otra', sale_id: 'sin-stock' }],
      lineas: [...base.lineas, { ...base.lineas[0], invoice_sales_id: 'otra' }],
    }));
    expect(resultado.productos).toEqual([]);
    expect(resultado.unidadesHomogeneas).toBe(false);
  });
});
