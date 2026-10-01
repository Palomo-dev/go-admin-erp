import { getTimeline, type TimelineEntry, type TimelineKind } from '../timelineService';
import { compareDesc } from '../timeline/types';
import { cursorFilter } from '../timeline/cursor';
import { createPgMock } from './pgMock';

const customer = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const financialKinds: TimelineKind[] = ['sale', 'reservation', 'web_order'];
const scope = { organization_id: 120, timeline_customer_id: customer };
const at = '2026-10-01T10:00:00.123456Z';

test('pagina más de mil registros financieros y notas empatadas sin perder ni repetir filas', async () => {
  const financial = Array.from({ length: 1031 }, (_, n) => ({ ...scope,
    id: `${financialKinds[n % 3]}_${uuid(n + 1)}`, source_id: uuid(n + 1),
    kind: financialKinds[n % 3], occurred_at: n % 2 ? at : '2026-10-01T10:00:00.123455Z', amount: '123.45',
  }));
  const notes = Array.from({ length: 29 }, (_, n) => ({ ...scope, id: uuid(n + 5000), created_at: at, body: 'Seguimiento' }));
  const db = createPgMock({ customers: [{ id: customer, organization_id: 120 }],
    crm_customer_financial_history: [...financial, { ...financial[0], id: `sale_${uuid(9000)}`, organization_id: 125 },
      { ...financial[0], id: `sale_${uuid(9001)}`, timeline_customer_id: uuid(9002) }], crm_customer_notes: notes }, [], { unstableTies: true });
  let cursor: string | undefined;
  const entries: TimelineEntry[] = [];
  let rounds = 0;
  do {
    const page = await getTimeline(120, 'customer', customer, db, { limit: 7, kinds: [...financialKinds, 'note'], cursor });
    entries.push(...page.entries);
    cursor = page.next_cursor ?? undefined;
    expect(++rounds).toBeLessThan(300);
  } while (cursor);
  const expected = [...financial, ...notes.map(n => ({ ...n, occurred_at: n.created_at }))].sort(compareDesc).map(n => n.id);
  expect(entries.map(e => e.id)).toEqual(expected);
  expect(new Set(entries.map(e => e.id)).size).toBe(1060);
});

test('conserva importes decimales, todos los folios y pares espacio/tipo', async () => {
  const folios = [1, 2].map(n => ({ id: uuid(n), status: 'open', balance: '140.25', items_count: 2, pending_count: 1, pending_amount: '100.25' }));
  const spaces = [{ id: uuid(8), label: 'Espacio A', type: 'Tipo A' }];
  const row = { ...scope, id: `reservation_${uuid(4)}`, kind: 'reservation', source_id: uuid(4), occurred_at: at, amount: '250.25', folios, spaces };
  const page = await getTimeline(120, 'customer', customer, createPgMock({ customers: [{ id: customer, organization_id: 120 }], crm_customer_financial_history: [row] }), { kinds: ['reservation'] });
  expect(page.entries).toHaveLength(1);
  expect(page.entries[0]).toMatchObject({ financial: { amount: '250.25', folios, spaces, source_id: uuid(4) } });
});

test('filtros por tipo y responsable se aplican antes de paginar', async () => {
  const rows = financialKinds.map((kind, n) => ({ ...scope, id: `${kind}_${uuid(n)}`, source_id: uuid(n), kind, occurred_at: at, user_id: user }));
  rows.push({ ...rows[0], id: `sale_${uuid(99)}`, user_id: uuid(99) });
  const page = await getTimeline(120, 'customer', customer, createPgMock({ customers: [{ id: customer, organization_id: 120 }], crm_customer_financial_history: rows }), { kinds: ['sale'], userId: user });
  expect(page.entries.map(e => e.id)).toEqual([rows[0].id]);
});

test('el historial de oportunidad no consulta el origen comercial del cliente', async () => {
  const log: string[] = [];
  const page = await getTimeline(120, 'opportunity', uuid(1), createPgMock({ opportunities: [{ id: uuid(1), organization_id: 120, customer_id: customer, created_at: at }] }, log));
  expect(page.entries).toEqual([]);
  expect(log).not.toContain('crm_customer_financial_history');
});

test('un cursor financiero empatado nunca se convierte a UUID en otras fuentes', () => {
  const filter = cursorFilter('created_at', { at, id: `sale_${uuid(1)}` });
  expect(filter).not.toContain('id.lt.sale_');
  expect(filter).toContain('created_at.eq.2026-10-01T10:00:00.123456Z');
});

test('el rango incluye el último microsegundo del día y excluye el siguiente', async () => {
  const rows = ['2026-10-02T04:59:59.999999Z', '2026-10-02T05:00:00.000000Z'].map((occurred_at, n) => ({ ...scope,
    id: `sale_${uuid(n + 1)}`, kind: 'sale', source_id: uuid(n + 1), occurred_at, amount: 10 }));
  const page = await getTimeline(120, 'customer', customer, createPgMock({ customers: [{ id: customer, organization_id: 120 }], crm_customer_financial_history: rows }),
    { kinds: ['sale'], from: '2026-10-01T05:00:00Z', to: '2026-10-02T05:00:00Z', toExclusive: true });
  expect(page.entries.map(e => e.id)).toEqual([rows[0].id]);
});
