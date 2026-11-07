/** @jest-environment node */
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';
import {
  ESTADOS_PRESUPUESTO,
  ORIGENES_DISPONIBLES,
  claveEstado,
  construirGrilla,
  copiarMesAlResto,
  esEditable,
  grillasIguales,
  permisoParaBorrar,
  planearGuardado,
  repartirAnual,
  tonoEstado,
  totalFila,
  validarCrear,
  validarFilas,
  type LineaGuardada,
} from '../presupuestoLogica';

const doce = (v: number) => Array(12).fill(v) as number[];

describe('estados traducidos', () => {
  const idiomas = { es, en, fr, pt } as Record<string, Record<string, unknown>>;
  it.each(Object.keys(idiomas))('%s tiene texto para cada estado de budgets_status_check', (l) => {
    const ns = idiomas[l].finanzasReportesR2 as { presupuestos: { estado: Record<string, string> } };
    for (const e of [...ESTADOS_PRESUPUESTO, 'desconocido']) {
      expect(ns.presupuestos.estado[e]).toBeTruthy();
      expect(ns.presupuestos.estado[e]).not.toBe(e);
    }
  });

  it('nunca deja ver el valor en inglés: lo desconocido cae en su propia clave', () => {
    expect(claveEstado('draft')).toBe('draft');
    expect(claveEstado(' Approved ')).toBe('approved');
    expect(claveEstado('archived')).toBe('desconocido');
    expect(claveEstado(null)).toBe('desconocido');
    expect((es as { finanzasReportesR2: { presupuestos: { estado: Record<string, string> } } }).finanzasReportesR2.presupuestos.estado.draft).toBe('Borrador');
  });

  it('tonos del diseño: borrador marca, aprobado verde, cerrado neutro', () => {
    expect(tonoEstado('draft')).toBe('marca');
    expect(tonoEstado('approved')).toBe('exito');
    expect(tonoEstado('closed')).toBe('neutro');
  });
});

describe('bloqueo del aprobado', () => {
  it('solo el borrador se edita', () => {
    expect(esEditable('draft')).toBe(true);
    for (const e of ['approved', 'active', 'closed', 'otro', null]) expect(esEditable(e)).toBe(false);
  });

  it('borrar un borrador pide crear; uno aprobado o cerrado pide aprobar', () => {
    expect(permisoParaBorrar('draft')).toBe('finance.create');
    expect(permisoParaBorrar('approved')).toBe('finance.approve');
    expect(permisoParaBorrar('closed')).toBe('finance.approve');
  });
});

describe('grilla', () => {
  const lineas: LineaGuardada[] = [
    { id: 'a1', account_code: '51050601', period: 1, planned_amount: '8000', cost_center_id: null },
    { id: 'a1b', account_code: '51050601', period: 1, planned_amount: 500, cost_center_id: null },
    { id: 'a2', account_code: '51050601', period: 2, planned_amount: 8000, cost_center_id: null },
    { id: 'b1', account_code: '41359501', period: 12, planned_amount: 52000, cost_center_id: null },
    { id: 'x', account_code: '41359501', period: 13, planned_amount: 1, cost_center_id: null },
  ];

  it('agrupa por cuenta, suma repetidos del mismo mes e ignora periodos fuera de 1–12', () => {
    const g = construirGrilla(lineas);
    expect(g.map((f) => f.account_code)).toEqual(['41359501', '51050601']);
    expect(g[1].meses[0]).toBe(8500);
    expect(g[0].meses[11]).toBe(52000);
    expect(totalFila(g[0])).toBe(52000);
  });

  it('el año se reparte en 12 meses y la suma da exacto', () => {
    expect(repartirAnual(480000, 0)).toEqual(doce(40000));
    const r = repartirAnual(100, 0);
    expect(r.slice(0, 11)).toEqual(Array(11).fill(8));
    expect(r.reduce((s, v) => s + v, 0)).toBe(100);
    const d = repartirAnual(1000, 2);
    expect(d[0]).toBe(83.33);
    expect(Math.round(d.reduce((s, v) => s + v, 0) * 100) / 100).toBe(1000);
  });

  it('copia un mes al resto', () => {
    expect(copiarMesAlResto([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 2)).toEqual(doce(3));
  });

  it('detecta cambios', () => {
    const g = construirGrilla(lineas);
    expect(grillasIguales(g, construirGrilla(lineas))).toBe(true);
    expect(grillasIguales(g, [{ ...g[0], meses: doce(1) }, g[1]])).toBe(false);
  });
});

describe('guardado sin filas repetidas', () => {
  it('reutiliza el id de cada celda, borra repetidos y cuentas quitadas, y da id nuevo a lo nuevo', () => {
    const existentes: LineaGuardada[] = [
      { id: 'a1', account_code: '510506', period: 1, planned_amount: 1, cost_center_id: null },
      { id: 'a1-dup', account_code: '510506', period: 1, planned_amount: 1, cost_center_id: null },
      { id: 'q1', account_code: '512005', period: 1, planned_amount: 1, cost_center_id: null },
    ];
    let n = 0;
    const plan = planearGuardado(existentes, [{ account_code: '510506', cost_center_id: null, meses: doce(10) }], {
      budgetId: 'b',
      organizationId: 7,
      nuevoId: () => `nuevo-${++n}`,
    });
    expect(plan.upsert).toHaveLength(12);
    expect(plan.upsert[0]).toEqual({ id: 'a1', budget_id: 'b', organization_id: 7, account_code: '510506', period: 1, planned_amount: 10, cost_center_id: null });
    expect(plan.upsert.slice(1).every((f) => f.id.startsWith('nuevo-'))).toBe(true);
    expect(plan.borrar.sort()).toEqual(['a1-dup', 'q1']);
    expect(plan.total).toBe(120);
    expect(new Set(plan.upsert.map((f) => f.id)).size).toBe(12);
  });
});

describe('validación de cuerpos', () => {
  it('acepta una grilla bien formada', () => {
    const r = validarFilas({ filas: [{ account_code: '510506', cost_center_id: null, meses: doce(1) }] });
    expect(r.ok).toBe(true);
  });

  it.each([
    [{ filas: 'x' }, 'filas'],
    [{ filas: [{ account_code: '', meses: doce(1) }] }, 'cuenta'],
    [{ filas: [{ account_code: '510506', meses: [1, 2] }] }, 'meses'],
    [{ filas: [{ account_code: '510506', meses: [...doce(1).slice(0, 11), 'a'] }] }, 'importe'],
    [{ filas: [{ account_code: '510506', meses: doce(1) }, { account_code: '510506', meses: doce(2) }] }, 'cuenta_repetida'],
    [{ filas: [{ account_code: '510506', cost_center_id: 'no-uuid', meses: doce(1) }] }, 'centro'],
  ])('rechaza %j', (cuerpo, error) => {
    expect(validarFilas(cuerpo)).toEqual({ ok: false, error });
  });

  it('crear: vacío o copia; «real del año anterior» no se acepta todavía', () => {
    expect(ORIGENES_DISPONIBLES).toEqual(['vacio', 'copia']);
    expect(validarCrear({ name: ' Operación 2027 ', fiscal_year: 2027 })).toEqual({
      ok: true,
      valor: { name: 'Operación 2027', fiscal_year: 2027, origen: 'vacio', copiar_de: null },
    });
    expect(validarCrear({ name: 'X', fiscal_year: 2027, origen: 'real_anterior' })).toEqual({ ok: false, error: 'origen' });
    expect(validarCrear({ name: 'X', fiscal_year: 2027, origen: 'copia' })).toEqual({ ok: false, error: 'copiar_de' });
    expect(validarCrear({ name: '', fiscal_year: 2027 })).toEqual({ ok: false, error: 'nombre' });
    expect(validarCrear({ name: 'X', fiscal_year: 27 })).toEqual({ ok: false, error: 'anio' });
  });
});
