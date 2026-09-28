/**
 * Fase 4 · informe «Satisfacción en caja» (Reportes › POS).
 *
 * Con datos sintéticos: el promedio, la distribución y los conteos por
 * sucursal y por terminal, y que la consulta use el rango de fechas con la
 * ZONA HORARIA de la organización (reglas canónicas de fechas del repo: un
 * `created_at` es timestamptz y no se filtra con el día suelto).
 */

// El servicio importa el cliente de navegador solo para su valor por defecto
// (aquí siempre se le inyecta un doble); en Node ese módulo exige las
// variables públicas de Supabase, así que se dobla.
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 0 }));

import { aggregateSatisfaction, getSatisfactionReport, roundAverage, type SatisfactionRow } from '@/components/pos/reportes/satisfaccionService';
import { makeSupabaseDouble, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

function row(rating: number, branch: number | null, terminal: string | null, at = '2026-09-10T15:00:00Z'): SatisfactionRow {
  return { rating, branch_id: branch, terminal_id: terminal, created_at: at };
}

describe('F4 · informe: agregación', () => {
  it('sin calificaciones: todo a cero y las cinco notas presentes', () => {
    const report = aggregateSatisfaction([]);
    expect(report).toEqual({
      total: 0,
      average: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      byBranch: [],
      byTerminal: [],
    });
  });

  it('promedio con un decimal y distribución exacta', () => {
    const report = aggregateSatisfaction([row(5, 1, 'a'), row(4, 1, 'a'), row(4, 1, 'b'), row(1, 2, 'c')]);
    expect(report.total).toBe(4);
    expect(report.average).toBe(3.5); // (5+4+4+1)/4
    expect(report.distribution).toEqual({ 1: 1, 2: 0, 3: 0, 4: 2, 5: 1 });
  });

  it('conteo y promedio por sucursal y por terminal, con los nombres de la organización', () => {
    const report = aggregateSatisfaction(
      [row(5, 1, 'a'), row(3, 1, 'b'), row(4, 2, 'c'), row(2, 2, 'c')],
      { branches: { 1: 'Centro', 2: 'Norte' }, terminals: { a: 'Caja 1', b: 'Caja 2', c: 'Caja 3' } },
    );
    expect(report.byBranch).toEqual([
      { id: '1', name: 'Centro', count: 2, average: 4 },
      { id: '2', name: 'Norte', count: 2, average: 3 },
    ]);
    expect(report.byTerminal[0]).toEqual({ id: 'c', name: 'Caja 3', count: 2, average: 3 });
    expect(report.byTerminal.map((t) => t.name)).toEqual(['Caja 3', 'Caja 1', 'Caja 2']);
  });

  it('sin nombre se pinta el id: el informe nunca se queda en blanco', () => {
    const report = aggregateSatisfaction([row(5, 9, 'z')]);
    expect(report.byBranch[0].name).toBe('9');
    expect(report.byTerminal[0].name).toBe('z');
  });

  it('descarta lo que no es una nota de 1 a 5 y no cuenta en el promedio', () => {
    const basura = [row(0, 1, 'a'), row(6, 1, 'a'), row(3.5, 1, 'a'), { rating: 'cinco' }, null, undefined] as unknown as SatisfactionRow[];
    const report = aggregateSatisfaction([...basura, row(4, 1, 'a')]);
    expect(report.total).toBe(1);
    expect(report.average).toBe(4);
  });

  it('una fila sin sucursal o sin terminal cuenta en el total pero no inventa un grupo', () => {
    const report = aggregateSatisfaction([row(5, null, null), row(1, 1, 'a')]);
    expect(report.total).toBe(2);
    expect(report.average).toBe(3);
    expect(report.byBranch).toHaveLength(1);
    expect(report.byTerminal).toHaveLength(1);
  });

  it('el promedio se redondea a un decimal, sin dividir por cero', () => {
    expect(roundAverage(10, 3)).toBe(3.3);
    expect(roundAverage(0, 0)).toBe(0);
  });
});

describe('F4 · informe: consulta', () => {
  let db: SupabaseDouble;
  const rows = [row(5, 7, 't1'), row(3, 7, 't1'), row(4, 8, 't2')];

  function responder(call: RecordedCall) {
    if (call.table === 'pos_display_feedback') return { data: rows, error: null };
    if (call.table === 'branches') return { data: [{ id: 7, name: 'Centro' }, { id: 8, name: 'Norte' }], error: null };
    if (call.table === 'pos_terminals') return { data: [{ id: 't1', name: 'Caja 1', code: 'C1' }, { id: 't2', name: null, code: 'C2' }], error: null };
    throw new Error(`tabla inesperada: ${call.table}`);
  }

  beforeEach(() => {
    db = makeSupabaseDouble(responder);
  });

  it('filtra por organización y por el RANGO en la zona de la organización, no por el día suelto', async () => {
    await getSatisfactionReport({ startDate: '2026-09-01', endDate: '2026-09-30', timezone: 'America/Bogota' }, db as never, 120);
    const query = db.calls.find((c) => c.table === 'pos_display_feedback');
    expect(query?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'organization_id', 120],
        ['gte', 'created_at', '2026-09-01T00:00:00.000-05:00'],
        ['lte', 'created_at', '2026-09-30T23:59:59.999-05:00'],
      ]),
    );
  });

  it('otra zona horaria mueve los extremos del rango', async () => {
    await getSatisfactionReport({ startDate: '2026-09-01', endDate: '2026-09-30', timezone: 'Europe/Madrid' }, db as never, 120);
    const query = db.calls.find((c) => c.table === 'pos_display_feedback');
    expect(query?.filters).toEqual(expect.arrayContaining([['gte', 'created_at', '2026-09-01T00:00:00.000+02:00']]));
  });

  it('la sucursal elegida se añade como filtro; «todas» no filtra', async () => {
    await getSatisfactionReport({ startDate: '2026-09-01', endDate: '2026-09-30', timezone: 'America/Bogota', branchId: 7 }, db as never, 120);
    const query = db.calls.find((c) => c.table === 'pos_display_feedback');
    expect(query?.filters).toEqual(expect.arrayContaining([['eq', 'branch_id', 7]]));

    const limpio = makeSupabaseDouble(responder);
    await getSatisfactionReport({ startDate: '2026-09-01', endDate: '2026-09-30', timezone: 'America/Bogota' }, limpio as never, 120);
    const sinSucursal = limpio.calls.find((c) => c.table === 'pos_display_feedback');
    expect(sinSucursal?.filters.some(([op, col]) => op === 'eq' && col === 'branch_id')).toBe(false);
  });

  it('agrega lo leído y resuelve los nombres (una terminal sin nombre cae a su código)', async () => {
    const report = await getSatisfactionReport({ startDate: '2026-09-01', endDate: '2026-09-30', timezone: 'America/Bogota' }, db as never, 120);
    expect(report.total).toBe(3);
    expect(report.average).toBe(4);
    expect(report.byBranch.map((b) => b.name).sort()).toEqual(['Centro', 'Norte']);
    expect(report.byTerminal.find((t) => t.id === 't2')?.name).toBe('C2');
  });

  it('sin organización no se consulta nada', async () => {
    const report = await getSatisfactionReport({ startDate: '2026-09-01', endDate: '2026-09-30', timezone: 'America/Bogota' }, db as never, 0);
    expect(db.calls).toHaveLength(0);
    expect(report.total).toBe(0);
  });

  it('un fallo al leer los NOMBRES no tumba el informe: se pintan los ids', async () => {
    const parcial = makeSupabaseDouble((call) => {
      if (call.table === 'pos_display_feedback') return { data: rows, error: null };
      return { data: null, error: { message: 'boom' } };
    });
    const report = await getSatisfactionReport({ startDate: '2026-09-01', endDate: '2026-09-30', timezone: 'America/Bogota' }, parcial as never, 120);
    expect(report.total).toBe(3);
    expect(report.byBranch.map((b) => b.name).sort()).toEqual(['7', '8']);
  });

  it('un fallo al leer las CALIFICACIONES sí se propaga (la página avisa)', async () => {
    const roto = makeSupabaseDouble(() => ({ data: null, error: { message: 'boom' } }));
    await expect(
      getSatisfactionReport({ startDate: '2026-09-01', endDate: '2026-09-30', timezone: 'America/Bogota' }, roto as never, 120),
    ).rejects.toThrow('boom');
  });
});
