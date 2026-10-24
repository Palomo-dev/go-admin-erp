import { documentosLibros } from '../documentosLibros';
import type { EntradaLibros, MovimientoLibro, MovimientoStockInforme } from '../libros';

const asiento = (id: number, fecha: string, debit: number, extra: Partial<MovimientoLibro> = {}): MovimientoLibro => ({ id, entry_id: id, entry_date: fecha, account_code: '1435-01', debit, credit: 0, branch_id: 1, posted: true, ...extra });
const movimientoStock = (id: number, fecha: string, direction: string, qty: number, unit_cost: number, extra: Partial<MovimientoStockInforme> = {}): MovimientoStockInforme => ({
  id, fecha, created_at: `${fecha}T12:00:00Z`, organization_id: 1, branch_id: 1, product_id: 1, direction, qty, unit_cost, source: direction === 'in' ? 'purchase' : 'sale', source_id: String(id), ...extra,
});
const entrada = (movimientos: MovimientoLibro[]): EntradaLibros => ({ cuentas: [{ account_code: '1435-01', name: 'Inventario sede' }], movimientos, desde: '2026-01-01', hasta: '2026-12-31', nivel: 6 });

describe('documentos integrados de libros, kárdex y conciliación', () => {
  test('presenta mayor comparativo, auxiliar con anulación y conciliación por sede sin duplicar 1405', () => {
    const documentos = documentosLibros({
      entrada: entrada([
        asiento(1, '2025-02-01', 100, { anulado_desde: '2026-03-01' }), asiento(2, '2026-04-01', 60),
        asiento(3, '2025-02-01', 40, { branch_id: 2, account_code: '1435-02' }), asiento(4, '2026-04-01', 10, { branch_id: 2, account_code: '1435-02' }),
        asiento(5, '2026-04-01', 9999, { account_code: '1405' }), asiento(6, '2026-04-01', 9999, { posted: false }),
      ]),
      stock: [movimientoStock(1, '2025-02-01', 'in', 10, 10), movimientoStock(2, '2026-04-01', 'out', 4, 10),
        movimientoStock(3, '2025-02-01', 'in', 2, 20, { branch_id: 2, product_id: 2 }), movimientoStock(4, '2026-04-01', 'in', 1, 10, { branch_id: 2, product_id: 2 })],
      cuenta: '14-35', productoId: 1,
    });
    const mayor = documentos['mayor-consolidado'].tablas;
    expect(mayor[0].filas.find((f) => f.codigo === '143501')).toMatchObject({ saldoInicial: 100, debitos: 60, ajusteAnulaciones: -100, saldoFinal: 60 });
    expect(mayor[1].filas.find((f) => f.codigo === '143501')).toMatchObject({ saldoInicial: 0, debitos: 100, saldoFinal: 100 });
    const auxiliar = documentos['auxiliar-cuenta'].tablas[0].filas.filter((f) => f.codigo === '1435-01');
    expect(auxiliar.map((f) => f.saldo)).toEqual([100, 0, 60]);
    expect(auxiliar[1]).toMatchObject({ debito: 0, credito: 0, ajusteAnulaciones: -100 });
    const inventarios = documentos['inventarios-balances'].tablas;
    expect(inventarios[2].filas).toEqual([
      { sedeId: 1, valorKardex: 60, saldo1435: 60, diferencia: 0 }, { sedeId: 2, valorKardex: 50, saldo1435: 50, diferencia: 0 },
    ]);
    expect(inventarios[3].filas).toEqual([
      { sedeId: 1, valorKardex: 100, saldo1435: 100, diferencia: 0 }, { sedeId: 2, valorKardex: 40, saldo1435: 40, diferencia: 0 },
    ]);
    expect(documentos['kardex-sede'].tablas[0].filas).toEqual([expect.objectContaining({ productoId: 1, sedeId: 1, saldoCantidad: 6, saldoValorizado: 60 })]);
    expect(documentos['kardex-sede'].tablas[0].columnas.find((c) => c.clave === 'costoUnitario')?.formato).toBe('pesos');
  });

  test('sin asignación fiable a centro conserva clases contables y omite la conciliación global y el kárdex', () => {
    const documentos = documentosLibros({ entrada: entrada([asiento(1, '2026-04-01', 15)]), stock: [movimientoStock(1, '2026-04-01', 'in', 10, 100)], stockCompleto: false,
      advertenciasStock: ['No se compara inventario global contra un saldo parcial del centro de costo.'] });
    expect(documentos['inventarios-balances'].tablas).toHaveLength(2);
    expect(documentos['inventarios-balances'].tablas[0].filas.find((f) => f.codigo === '143501')?.saldoFinal).toBe(15);
    expect(documentos['inventarios-balances'].avisos?.join(' ')).toContain('saldo parcial');
    expect(documentos['kardex-sede'].tablas).toEqual([]);
    expect(documentos['kardex-sede'].avisos?.join(' ')).toContain('centro de costo');
  });

  test('historial de stock incompleto conserva el libro y explica la causa sin atribuirla a un centro', () => {
    const documentos = documentosLibros({ entrada: entrada([asiento(1, '2026-04-01', 15)]), stock: [], stockCompleto: false,
      advertenciasStock: ['Hay movimientos sin costo histórico verificable.'] });
    expect(documentos['inventarios-balances'].tablas).toHaveLength(2);
    expect(documentos['mayor-consolidado'].tablas[0].filas.find((f) => f.codigo === '143501')?.saldoFinal).toBe(15);
    expect(documentos['kardex-sede'].tablas).toEqual([]);
    expect(documentos['kardex-sede'].avisos).toEqual(['Hay movimientos sin costo histórico verificable.']);
    expect(documentos['inventarios-balances'].avisos?.join(' ')).not.toContain('centro de costo');
  });

  test('advierte diferencias existentes solo en el comparativo y conserva saldo restaurado', () => {
    const documentos = documentosLibros({ entrada: entrada([
      asiento(1, '2024-02-01', 80, { anulado_desde: '2025-01-01', anulado_hasta: '2026-01-15' }), asiento(2, '2026-02-01', 20),
    ]), stock: [movimientoStock(1, '2024-02-01', 'in', 10, 10)] });
    expect(documentos['inventarios-balances'].tablas[2].filas[0]).toMatchObject({ valorKardex: 100, saldo1435: 100, diferencia: 0 });
    expect(documentos['inventarios-balances'].tablas[3].filas[0]).toMatchObject({ valorKardex: 100, saldo1435: 0, diferencia: 100 });
    expect(documentos['inventarios-balances'].avisos?.join(' ')).toContain('comparativo');
    expect(documentos['auxiliar-cuenta'].tablas[0].filas.map((f) => f.saldo)).toEqual([80, 100]);
  });
});
