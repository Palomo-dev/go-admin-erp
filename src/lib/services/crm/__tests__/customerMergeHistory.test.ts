import { mergeHistoryWindow, publicMergeHistory, readMergeHistoryExport, readMergeHistoryPage } from '../customerMergeHistory';
import type { CrmSesion } from '../crmRouteSupport';

const stored = (id: string) => ({ id, primary_customer_id: 'principal', secondary_customer_id: 'secundario', merged_at: '2026-09-30T12:00:00Z', merged_by: 'autor', undone_at: null, undone_by: null,
  principal: { full_name: 'Persona A' }, secundario: { full_name: 'Persona B' }, autor: null,
  moved_rows: [{ table: 'calls', ids: ['a', 'b'], before: [{ datoPrivado: 'oculto' }] }] });

function fixture(results: Array<{ data: unknown[] | null; error: unknown; count: number | null }>) {
  const filters: Array<[string, unknown, unknown]> = [];
  const query: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'order']) query[method] = jest.fn((first: unknown, second: unknown) => { filters.push([method, first, second]); return query; });
  query.range = jest.fn(async () => results.shift());
  const from = jest.fn(() => query);
  const ctx = { organizationId: 125, supabase: { from } } as unknown as CrmSesion;
  return { ctx, filters, query, from };
}

test('entrega únicamente conteos sin ids/snapshots de las filas movidas', () => {
  const audit = publicMergeHistory(stored('fusion'));
  expect(audit.moved_counts).toEqual([{ table: 'calls', count: 2 }]);
  expect(JSON.stringify(audit)).not.toMatch(/datoPrivado|before|moved_rows/);
  expect(publicMergeHistory({ ...stored('x'), moved_rows: [null, 3, {}, { table: 'calls', ids: null }] }).moved_counts).toEqual([]);
});

test('usa el intervalo de 90 días e idéntico límite superior en cada página', async () => {
  const first = Array.from({ length: 250 }, (_, id) => stored(String(id)));
  const f = fixture([{ data: first, count: 252, error: null }, { data: [stored('250'), stored('251')], count: 252, error: null }]);
  const rows = await readMergeHistoryExport(f.ctx);
  expect(rows).toHaveLength(252);
  expect(f.query.range.mock.calls).toEqual([[0, 249], [250, 499]]);
  expect(f.filters.filter(([type]) => type === 'eq')).toEqual([['eq', 'organization_id', 125], ['eq', 'organization_id', 125]]);
  expect(new Set(f.filters.filter(([type]) => type === 'gte').map(([, , value]) => value)).size).toBe(1);
  expect(new Set(f.filters.filter(([type]) => type === 'lte').map(([, , value]) => value)).size).toBe(1);
  const selectedFields = f.filters.filter(([type]) => type === 'select').flatMap(([, value]) => String(value).split(',').map(v => v.trim()));
  expect(selectedFields).not.toContain('snapshot');
  expect(selectedFields).not.toContain('*');
  expect(f.filters.filter(([type]) => type === 'select').map(([, value]) => value)).toEqual([expect.stringContaining('reason:snapshot->>reason'), expect.stringContaining('reason:snapshot->>reason')]);
});

test('el error de una página posterior no devuelve un CSV parcial como éxito', async () => {
  const f = fixture([{ data: Array.from({ length: 250 }, (_, id) => stored(String(id))), count: 251, error: null }, { data: null, count: null, error: { code: 'XX000', message: 'privado' } }]);
  await expect(readMergeHistoryExport(f.ctx)).rejects.toMatchObject({ code: 'XX000' });
});

test('un conteo fallido no se presenta como cero fusiones', async () => {
  const f = fixture([{ data: [], error: null, count: null }]);
  await expect(readMergeHistoryPage(f.ctx, 0, 25)).rejects.toThrow('contar');
});

test('intervalo finito y cierre exacto a los 90 días', () => {
  const now = new Date('2026-10-02T03:00:00Z');
  const window = mergeHistoryWindow(now);
  expect(window.to).toBe(now.toISOString());
  expect(Date.parse(window.to) - Date.parse(window.from)).toBe(90 * 86400000);
});


test('motivo sólo desde la proyección permitida; nunca expone el snapshot completo', () => {
 const row = Object.assign(stored('a'), {reason:'email',snapshot:{before:{secret:'privado'}},extra:'oculto'});
 const result = publicMergeHistory(row);
 expect(result.reason).toBe('email');expect(JSON.stringify(result)).not.toMatch(/snapshot|secret|extra|oculto/);
 expect(publicMergeHistory({...row,reason:'forged'}).reason).toBe('unknown');
});
test('no exporta éxito si el conteo acredita filas que la página no entregó', async () => {
 const f=fixture([{data:[stored('a')],count:250,error:null}]);
 await expect(readMergeHistoryExport(f.ctx)).rejects.toThrow('completar');
});
