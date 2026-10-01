import { getTimeline, type TimelineEntry } from '../timelineService';
import { createPgMock } from './pgMock';

const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const at = (n: number) => `2026-10-01T10:00:00.${String(n).padStart(6, '0')}Z`;
const scoped = { organization_id: 120, timeline_customer_id: CUSTOMER };
const tables = () => ({ customers: [{ id: CUSTOMER, organization_id: 120, lifecycle_stage: 'lead' }] });

test('cliente consume las relaciones SQL, incluye oportunidades y conserva cursor de microsegundos', async () => {
  const notes = Array.from({ length: 67 }, (_, n) => ({ ...scoped, id: uuid(n + 1), body: `Nota ${n}`, created_at: at(n), user_id: null }));
  const data = { ...tables(), crm_customer_notes: [...notes,
    { ...notes[0], id: uuid(900), organization_id: 125 },
    { ...notes[0], id: uuid(901), timeline_customer_id: OTHER }],
    // El servicio no debe volver a leer la tabla sin la relación canónica.
    notes: [{ ...notes[0], id: uuid(902), related_type: 'customer', related_id: CUSTOMER }],
  };
  const entries: TimelineEntry[] = [];
  let cursor: string | undefined;
  do {
    const page = await getTimeline(120, 'customer', CUSTOMER, createPgMock(data), { kinds: ['note'], limit: 7, cursor });
    entries.push(...page.entries);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  expect(entries.map(e => e.id)).toEqual(notes.slice().reverse().map(n => n.id));
  expect(new Set(entries.map(e => e.id)).size).toBe(67);
});

test('tareas, correos y cambios de etapa del cliente proceden de vistas acotadas', async () => {
  const log: string[] = [];
  const data = { ...tables(),
    crm_customer_tasks: [{ ...scoped, id: uuid(1), title: 'Seguimiento', created_at: at(4), status: 'open' }],
    crm_customer_email_messages: [{ ...scoped, id: uuid(2), subject: 'Correo', created_at: at(3), status: 'sent' }],
    crm_customer_stage_history: [{ ...scoped, id: uuid(3), changed_at: at(2), to_stage_id: uuid(7) }],
    stages: [{ id: uuid(7), name: 'Etapa propia', pipelines: { organization_id: 120 } }],
  };
  const page = await getTimeline(120, 'customer', CUSTOMER, createPgMock(data, log), { kinds: ['task', 'email', 'system'] });
  expect(page.entries.map(e => e.kind)).toEqual(['task', 'email', 'system']);
  expect(log).toEqual(expect.arrayContaining(['crm_customer_tasks', 'crm_customer_email_messages', 'crm_customer_stage_history']));
  expect(log).not.toContain('opportunities');
  expect(page.entries[2]).toMatchObject({ to_stage: { name: 'Etapa propia' } });
});

test('sin ver todas las llamadas, el autor de activity no concede acceso al call ajeno', async () => {
  const calls = [
    { id: uuid(10), organization_id: 120, customer_id: CUSTOMER, user_id: USER, started_at: at(7), status: 'completed' },
    { id: uuid(11), organization_id: 120, customer_id: CUSTOMER, user_id: OTHER, started_at: at(6), status: 'completed' },
  ];
  const data = { ...tables(), calls, crm_customer_activities: [
    { ...scoped, id: uuid(20), activity_type: 'call', user_id: USER, call_id: uuid(10), occurred_at: at(7) },
    { ...scoped, id: uuid(21), activity_type: 'call', user_id: USER, call_id: uuid(11), occurred_at: at(6), notes: 'Privado' },
    { ...scoped, id: uuid(22), activity_type: 'call', user_id: OTHER, occurred_at: at(5), notes: 'Registro ajeno' },
    { ...scoped, id: uuid(23), activity_type: 'note', user_id: OTHER, occurred_at: at(4), notes: 'Nota del equipo' },
  ] };
  const page = await getTimeline(120, 'customer', CUSTOMER, createPgMock(data), {}, { callUserId: USER });
  expect(page.entries.map(e => e.id)).toEqual([uuid(20), uuid(23)]);
  expect(JSON.stringify(page)).not.toContain('Privado');
  expect(JSON.stringify(page)).not.toContain('Registro ajeno');
});

test('permiso solo de leads no devuelve el historial de un comprador', async () => {
  const data = { customers: [{ id: CUSTOMER, organization_id: 120, lifecycle_stage: 'customer' }] };
  await expect(getTimeline(120, 'customer', CUSTOMER, createPgMock(data), {}, { onlyLeads: true })).rejects.toThrow('Entidad no encontrada');
});

test('hidratación de etapas y eventos no cruza la organización aunque coincida la referencia', async () => {
  const data = { ...tables(),
    crm_customer_activities: [{ ...scoped, id: uuid(1), activity_type: 'system', occurred_at: at(5), metadata: { to_stage_id: uuid(9) } }],
    crm_customer_email_messages: [{ ...scoped, id: uuid(2), subject: 'Correo propio', created_at: at(4) }],
    stages: [{ id: uuid(9), name: 'Etapa ajena', pipelines: { organization_id: 125 } }],
    email_events: [{ email_message_id: uuid(2), organization_id: 125, event_type: 'opened', occurred_at: at(6) }],
  };
  const page = await getTimeline(120, 'customer', CUSTOMER, createPgMock(data));
  expect(page.entries[0]).toMatchObject({ to_stage: null });
  expect(page.entries[1]).toMatchObject({ events: [] });
});
