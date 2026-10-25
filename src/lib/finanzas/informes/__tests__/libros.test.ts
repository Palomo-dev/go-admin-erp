import { auxiliarContable, conciliarInventario1435, kardexValorizado, libroInventariosBalances, mayorConsolidado, type EntradaLibros, type MovimientoLibro, type MovimientoStockInforme } from '../libros';

const movimiento = (account_code: string, debit: number, credit = 0, extra: Partial<MovimientoLibro> = {}): MovimientoLibro => ({
  id: 1, entry_id: 1, entry_date: '2026-02-01', account_code, debit, credit, posted: true, branch_id: 1, ...extra,
});
const entrada = (movimientos: MovimientoLibro[], otros: Partial<EntradaLibros> = {}): EntradaLibros => ({
  cuentas: [{ account_code: '1', name: 'Activo' }, { account_code: '11', name: 'Disponible' }, { account_code: '110505', name: 'Caja sede' }],
  movimientos, desde: '2026-01-01', hasta: '2026-12-31', ...otros,
});
const stock = (id: number, direction: string, qty: number, unit_cost: number, extra: Partial<MovimientoStockInforme> = {}): MovimientoStockInforme => ({
  id, organization_id: 10, branch_id: 1, product_id: 1, direction, qty, unit_cost, source: 'purchase', source_id: String(id), created_at: `2026-01-${String(id).padStart(2, '0')}T12:00:00Z`, fecha: `2026-01-${String(id).padStart(2, '0')}`, ...extra,
});

describe('libros contables e inventarios al corte', () => {
  test('el mayor consolidado carga sin cuenta, agrega por nivel y no duplica títulos', () => {
    const filas = mayorConsolidado(entrada([
      movimiento('110505', 100, 0, { entry_date: '2025-12-31' }),
      movimiento('110505', 50), movimiento('110505', 0, 20),
      movimiento('110510', 30),
    ], { nivel: 2 }));
    expect(filas.find((f) => f.codigo === '11')).toMatchObject({ saldoInicial: 100, debitos: 80, creditos: 20, saldoFinal: 160, ajusteAnulaciones: 0 });
    expect(filas.reduce((s, f) => s + f.saldoFinal, 0)).toBe(160);
  });

  test('excluye borradores, anulados permanentes y movimientos posteriores al corte', () => {
    const filas = mayorConsolidado(entrada([
      movimiento('110505', 10), movimiento('110505', 50, 0, { posted: false }),
      movimiento('110505', 80, 0, { voided: true }), movimiento('110505', 70, 0, { entry_date: '2027-01-01' }),
    ]));
    expect(filas.find((f) => f.codigo === '110505')?.saldoFinal).toBe(10);
  });

  test('el corte anterior conserva el original antes de su anulación posterior', () => {
    const m = movimiento('110505', 100, 0, { entry_date: '2024-06-01', anulado_desde: '2025-02-01' });
    expect(mayorConsolidado(entrada([m], { desde: '2024-01-01', hasta: '2024-12-31' })).find((f) => f.codigo === '110505')?.saldoFinal).toBe(100);
    const posterior = mayorConsolidado(entrada([m], { desde: '2025-01-01', hasta: '2025-12-31' })).find((f) => f.codigo === '110505');
    expect(posterior).toMatchObject({ saldoInicial: 100, saldoFinal: 0, debitos: 0, creditos: 0, ajusteAnulaciones: -100 });
  });

  test('el grupo 36 presenta la pérdida como disminución del patrimonio', () => {
    const movimientos = [movimiento('360505', 0, 100), movimiento('361005', 20)];
    expect(mayorConsolidado(entrada(movimientos, { nivel: 2 })).find((f) => f.codigo === '36')?.saldoFinal).toBe(80);
    expect(mayorConsolidado(entrada(movimientos)).find((f) => f.codigo === '361005')?.saldoFinal).toBe(20);
  });

  test('reutiliza niveles PUC con guiones históricos sin alterar el código de la FK auxiliar', () => {
    const m = movimiento('1435-01', 120);
    const input = entrada([m], { cuentas: [{ account_code: '1435-01', name: 'Inventario auxiliar histórico' }] });
    expect(mayorConsolidado({ ...input, nivel: 6 })).toEqual([expect.objectContaining({ codigo: '143501', saldoFinal: 120 })]);
    expect(mayorConsolidado({ ...input, nivel: 4 })).toEqual([expect.objectContaining({ codigo: '1435', saldoFinal: 120 })]);
    expect(mayorConsolidado(input)[0].codigo).toBe('1435-01');
    expect(auxiliarContable(input, false, '14-35')[0]).toMatchObject({ codigo: '1435-01', saldo: 120 });
  });

  test('naturaleza y conciliación reconocen prefijos con guiones intermedios', () => {
    expect(mayorConsolidado(entrada([movimiento('36-10-05', 20)])).find((f) => f.codigo === '36-10-05')?.saldoFinal).toBe(20);
    const kardex = kardexValorizado([stock(1, 'in', 5, 10)]);
    expect(conciliarInventario1435(kardex, [movimiento('14-35-01', 50)], '2026-12-31')).toEqual([{ sedeId: 1, valorKardex: 50, saldo1435: 50, diferencia: 0 }]);
  });

  test('auxiliar cuenta mantiene saldo corrido natural y el saldo inicial sin movimientos', () => {
    const filas = auxiliarContable(entrada([
      movimiento('110505', 100, 0, { entry_date: '2025-12-01' }),
      movimiento('110505', 20, 0, { id: 2 }), movimiento('110505', 0, 10, { id: 3 }),
      movimiento('220505', 0, 90, { entry_date: '2025-12-01' }),
    ]));
    expect(filas.filter((f) => f.codigo === '110505').map((f) => f.saldo)).toEqual([100, 120, 110]);
    expect(filas.find((f) => f.codigo === '220505')).toMatchObject({ tipo: 'saldo_inicial', saldo: 90 });
    expect(auxiliarContable(entrada([movimiento('110505', 20), movimiento('220505', 0, 90)]), false, '11')).toHaveLength(1);
  });

  test('auxiliar separa cuenta × centro × tercero y no mezcla terceros iguales de centros distintos', () => {
    const filas = auxiliarContable(entrada([
      movimiento('130505', 10, 0, { cost_center_id: 'a', tercero_nit: '1' }),
      movimiento('130505', 20, 0, { cost_center_id: 'b', tercero_nit: '1' }),
      movimiento('130505', 5, 0, { cost_center_id: 'a', tercero_nit: '2' }),
      movimiento('130505', 3, 0, { cost_center_id: 'a', tercero_nit: '1' }),
    ]), true);
    expect([...filas].reverse().find((f) => f.centroId === 'a' && f.terceroDocumento === '1')?.saldo).toBe(13);
    expect(filas.find((f) => f.centroId === 'b')?.saldo).toBe(20);
    expect(filas.find((f) => f.terceroDocumento === '2')?.saldo).toBe(5);
  });

  test('auxiliar identifica efecto de anulación sin inventar débitos o créditos', () => {
    const filas = auxiliarContable(entrada([movimiento('110505', 100, 0, { entry_date: '2025-06-01', anulado_desde: '2026-03-01' })]));
    expect(filas).toHaveLength(2);
    expect(filas[1]).toMatchObject({ tipo: 'ajuste_anulacion', debito: 0, credito: 0, ajusteAnulaciones: -100, saldo: 0 });
  });

  test('inventarios y balances incluye exclusivamente clases 1, 2 y 3', () => {
    expect(libroInventariosBalances(entrada([movimiento('4135', 0, 50), movimiento('3105', 0, 50)])).every((f) => /^[123]/.test(f.codigo))).toBe(true);
  });

  test('promedio ponderado se calcula por producto y sede con costo de salida promedio', () => {
    const filas = kardexValorizado([
      stock(1, 'in', 10, 10), stock(2, 'in', 10, 20), stock(3, 'out', 4, 999),
      stock(4, 'in', 3, 50, { branch_id: 2 }), stock(5, 'in', 1, 7, { product_id: 2 }),
    ], '2026-12-31');
    expect(filas[2]).toMatchObject({ saldoCantidad: 16, costoUnitario: 15, costoPromedio: 15, saldoValorizado: 240 });
    expect(filas[3].saldoValorizado).toBe(150);
    expect(filas[4].saldoValorizado).toBe(7);
  });

  test('orden estable por instante e id y tipos ajuste/traslado', () => {
    const fecha = '2026-01-01T12:00:00Z';
    const filas = kardexValorizado([stock(2, 'out', 2, 20, { created_at: fecha, source: 'transfer_out' }), stock(1, 'in', 5, 20, { created_at: fecha, source: 'adjustment' })]);
    expect(filas.map((f) => f.id)).toEqual([1, 2]);
    expect(filas.map((f) => f.tipo)).toEqual(['ajuste', 'traslado']);
    expect(filas[1].saldoValorizado).toBe(60);
  });

  test('no usa stock actual para el corte histórico y exige fecha de organización', () => {
    const movimientos = [stock(1, 'in', 10, 20), stock(2, 'out', 5, 20)];
    expect(kardexValorizado(movimientos, '2026-01-01')).toHaveLength(1);
    expect(kardexValorizado(movimientos, '2026-01-01')[0].saldoValorizado).toBe(200);
    expect(() => kardexValorizado([stock(1, 'in', 1, 1, { fecha: undefined })], '2026-01-01')).toThrow('zona');
  });

  test('marca saldo negativo y rechaza costos no finitos/direcciones desconocidas', () => {
    expect(kardexValorizado([stock(1, 'out', 2, 10)])[0].advertencia).toContain('saldo negativo');
    expect(() => kardexValorizado([stock(1, 'in', 1, NaN)])).toThrow('no finito');
    expect(() => kardexValorizado([stock(1, 'adjust', 1, 5)])).toThrow('dirección');
  });

  test('conciliación exige 1435 por sede, excluye 1405, borradores y salidas posteriores', () => {
    const kardex = kardexValorizado([stock(1, 'in', 10, 10), stock(2, 'out', 2, 10), stock(3, 'in', 3, 20, { branch_id: 2 })]);
    const filas = conciliarInventario1435(kardex, [
      movimiento('143505', 80), movimiento('143505', 50, 0, { branch_id: 2 }),
      movimiento('140505', 400), movimiento('143505', 900, 0, { posted: false }),
      movimiento('143505', 500, 0, { entry_date: '2027-01-01' }),
    ], '2026-12-31');
    expect(filas).toEqual([
      { sedeId: 1, valorKardex: 80, saldo1435: 80, diferencia: 0 },
      { sedeId: 2, valorKardex: 60, saldo1435: 50, diferencia: 10 },
    ]);
  });

  test('la conciliación incluye sedes con saldo contable sin historial de stock', () => {
    expect(conciliarInventario1435([], [movimiento('143505', 50, 0, { branch_id: 9 })], '2026-12-31')).toEqual([{ sedeId: 9, valorKardex: 0, saldo1435: 50, diferencia: -50 }]);
  });
});
