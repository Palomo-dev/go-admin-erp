import {
  planCierreEjercicio,
  claveCierreLibre,
  reubicarResultado,
  CUENTA_PERDIDA,
  CUENTA_UTILIDAD,
} from '../cierreEjercicio';

describe('cierre de ejercicio', () => {
  it('cancela ingresos y gastos contra 3605 cuando hay utilidad', () => {
    const plan = planCierreEjercicio([
      { codigo: '4135', debito: 0, credito: 1000 },
      { codigo: '5105', debito: 400, credito: 0 },
      { codigo: '1105', debito: 500, credito: 0 },
    ], 2026);
    expect(plan.resultado).toBe(600);
    expect(plan.cuentaResultado).toBe(CUENTA_UTILIDAD);
    expect(plan.asientos).toEqual([
      { debito: '4135', credito: '3605', valor: 1000, clave: 'cierre-ejercicio:2026:4135' },
      { debito: '3605', credito: '5105', valor: 400, clave: 'cierre-ejercicio:2026:5105' },
    ]);
  });

  it('pasa la pérdida de 3605 a 3610', () => {
    const plan = planCierreEjercicio([
      { codigo: '4135', debito: 0, credito: 200 },
      { codigo: '6135', debito: 900, credito: 0 },
      { codigo: '7205', debito: 100, credito: 0 },
    ], 2026);
    expect(plan.resultado).toBe(-800);
    expect(plan.cuentaResultado).toBe(CUENTA_PERDIDA);
    expect(plan.asientos[plan.asientos.length - 1]).toEqual({
      debito: '3610',
      credito: '3605',
      valor: 800,
      clave: 'cierre-ejercicio:2026:resultado',
    });
    const cargos3605 = plan.asientos.filter((a) => a.debito === '3605').reduce((s, a) => s + a.valor, 0);
    const abonos3605 = plan.asientos.filter((a) => a.credito === '3605').reduce((s, a) => s + a.valor, 0);
    expect(abonos3605 - cargos3605).toBe(0);
  });

  it('un segundo cierre usa otra clave y no repite la del primero', () => {
    const ocupadas = new Set(['cierre-ejercicio:2026:5105']);
    expect(claveCierreLibre('cierre-ejercicio:2026:5105', ocupadas)).toBe('cierre-ejercicio:2026:5105:2');
    expect(claveCierreLibre('cierre-ejercicio:2026:4135', ocupadas)).toBe('cierre-ejercicio:2026:4135');
  });

  it('reubica 3605 y 3610 según el neto que queda', () => {
    expect(reubicarResultado(600, 0)).toBeNull();
    expect(reubicarResultado(-800, 0)).toEqual({ debito: '3610', credito: '3605', valor: 800 });
    expect(reubicarResultado(-50, 0)).toEqual({ debito: '3610', credito: '3605', valor: 50 });
    expect(reubicarResultado(1000, 800)).toEqual({ debito: '3605', credito: '3610', valor: 800 });
    expect(reubicarResultado(100, 800)).toEqual({ debito: '3605', credito: '3610', valor: 100 });
    expect(reubicarResultado(0, 0)).toBeNull();
  });
});
