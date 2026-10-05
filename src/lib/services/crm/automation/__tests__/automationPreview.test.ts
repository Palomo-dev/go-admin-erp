import { FakeDb } from '../../__tests__/fixtures/fakeSupabase';
import { getAutomationSummary } from '../automationSummary';
import { previewAutomationHistory } from '../automationBulkPreview';
import { testRunAutomationRule } from '../../automationService';
jest.mock('../../emailService', () => ({ sendTemplatedEmail: jest.fn() }));

const now = new Date('2026-10-02T12:00:00.000Z');
const rule = { id: 'rule', organization_id: 125, trigger_type: 'stage_change', event: 'opportunity.stage_changed',
  trigger_config: {}, is_active: true, conditions: { op: 'and', rules: [{ field: 'opportunity.amount', operator: 'gt', value: 100 }] },
  actions: [{ type: 'create_task', title: 'Call' }], run_once_per_opportunity: false, cooldown_hours: 0 };
const opportunity = (id: string, amount = 200, org = 125) => ({ id, organization_id: org, name: `Opportunity ${id}`, amount, pipeline_id: null, stage_id: null, customer_id: null });
const event = (id: number, opportunityId: string, at = '2026-09-20T12:00:00.000Z', org = 125) => ({ id: String(id).padStart(8, '0'), organization_id: org,
  event_type: 'opportunity.stage_changed', entity_type: 'opportunity', entity_id: opportunityId, payload: {}, created_at: at });

test('cifras de 7 días son conteos reales y no acumulados del rule ni de una página', async () => {
  const db = new FakeDb({ tables: { automation_rules: [{ ...rule, runs_count: 999 }], automation_runs: [
    { organization_id: 125, status: 'completed', created_at: '2026-10-01T10:00:00Z' },
    { organization_id: 125, status: 'failed', created_at: '2026-10-01T10:00:00Z' },
    { organization_id: 125, status: 'skipped', created_at: '2026-10-01T10:00:00Z' },
    { organization_id: 125, status: 'completed', created_at: '2026-09-01T10:00:00Z' },
    { organization_id: 999, status: 'failed', created_at: '2026-10-01T10:00:00Z' },
  ] } });
  expect(await getAutomationSummary(125, db.client(), now)).toMatchObject({ active_rules: 1, executed_7d: 2, skipped_7d: 1, failed_7d: 1 });
});

test('páginas completas de disparadores, muestra 50, datos actuales y ninguna escritura', async () => {
  const db = new FakeDb({ tables: { automation_rules: [rule], opportunities: [opportunity('a')],
    crm_events: [...Array.from({ length: 252 }, (_, id) => event(id, 'a')), event(999, 'a', '2026-09-20T12:00:00Z', 999), event(1000, 'a', '2026-08-01T12:00:00Z')],
  } });
  const before = JSON.stringify(db.tables);
  expect(await previewAutomationHistory('rule', 125, db.client(), now)).toMatchObject({ total: 252, matched: 252, skipped: 0, data_basis: 'current_records', sample: expect.any(Array) });
  expect((await previewAutomationHistory('rule', 125, db.client(), now)).sample).toHaveLength(50);
  expect(JSON.stringify(db.tables)).toBe(before);
  expect(db.rpcCalls).toHaveLength(0);
  expect(db.calls.filter(call => call.op !== 'select')).toHaveLength(0);
});

test('simula run_once sobre el mismo registro sin insertar automation_runs', async () => {
  const db = new FakeDb({ tables: { automation_rules: [{ ...rule, run_once_per_opportunity: true }], opportunities: [opportunity('a')],
    crm_events: [event(1, 'a'), event(2, 'a')], automation_runs: [],
  } });
  const result = await previewAutomationHistory('rule', 125, db.client(), now);
  expect(result).toMatchObject({ total: 2, matched: 1, skipped: 1 });
  expect(result.sample[1].skip_reason).toBe('run_once_per_opportunity');
  expect(db.tables.automation_runs).toHaveLength(0);
});

test('cooldown simulado usa tiempos capturados y el mismo guard de ejecución', async () => {
  const db = new FakeDb({ tables: { automation_rules: [{ ...rule, cooldown_hours: 24 }], opportunities: [opportunity('a')],
    crm_events: [event(1, 'a', '2026-09-20T12:00:00Z'), event(2, 'a', '2026-09-20T13:00:00Z'), event(3, 'a', '2026-09-21T13:00:00Z')],
  } });
  const result = await previewAutomationHistory('rule', 125, db.client(), now);
  expect(result).toMatchObject({ total: 3, matched: 2, skipped: 1 });
  expect(result.sample[1].skip_reason).toBe('cooldown');
});

test('registros ajenos o eliminados se distinguen de condiciones incumplidas', async () => {
  const db = new FakeDb({ tables: { automation_rules: [rule], opportunities: [opportunity('low', 50), opportunity('foreign', 200, 999)],
    crm_events: [event(1, 'low'), event(2, 'foreign'), event(3, 'missing')],
  } });
  expect(await previewAutomationHistory('rule', 125, db.client(), now)).toMatchObject({ total: 3, matched: 0, skipped: 3, unavailable: 2 });
  await expect(testRunAutomationRule('rule', 125, 'foreign', db.client())).rejects.toThrow('Oportunidad no encontrada');
});

test('una lectura fallida no se convierte en cero ni en plan exitoso parcial', async () => {
  const db = new FakeDb({ tables: { automation_rules: [rule] }, failOn: { 'crm_events:select': 'database unavailable' } });
  await expect(previewAutomationHistory('rule', 125, db.client(), now)).rejects.toMatchObject({ message: 'database unavailable' });
  db.failOn = { 'automation_runs:select': 'summary unavailable' };
  await expect(getAutomationSummary(125, db.client(), now)).rejects.toMatchObject({ message: 'summary unavailable' });
});
