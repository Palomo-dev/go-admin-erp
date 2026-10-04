import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertStageAgent } from '../stageAgentService';
const AGENT = '10000000-0000-4000-8000-000000000001';
const input = { stage_id: '10000000-0000-4000-8000-000000000002', voice_agent_id: AGENT, objective: 'qualify_lead' as const };
const current = { id: 'row', updated_at: '2026-10-02T00:00:00Z', voice_agent_id: AGENT };
function setup(existing: Record<string, unknown> | null, written: { data: Record<string, unknown> | null; error: { message: string; code: string } | null } = { data: { id: 'saved' }, error: null }) {
  const writes: { operation: string; filters: [string, unknown][]; row: Record<string, unknown> }[] = [];
  const db = { from: (table: string) => {
    let operation = 'read'; const filters: [string, unknown][] = []; let row: Record<string, unknown> = {};
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query; }, is: (key: string, value: unknown) => { filters.push([key, value]); return query; }, update: (value: Record<string, unknown>) => { operation = 'update'; row = value; return query; }, insert: (value: Record<string, unknown>) => { operation = 'insert'; row = value; return query; }, maybeSingle: async () => {
      if (table === 'stages') return { data: { id: input.stage_id, pipelines: { organization_id: 120 } }, error: null };
      if (operation === 'read') return { data: existing, error: null };
      writes.push({ operation, filters, row }); return written;
    } };
    return query;
  } };
  return { db: db as unknown as SupabaseClient, writes };
}
test('actualización conserva org, agente y versión en el WHERE de la escritura', async () => {
  const { db, writes } = setup(current);
  expect(await upsertStageAgent(db, 120, input, 'actor', { preventReassignment: true, expectedUpdatedAt: current.updated_at })).toMatchObject({ id: 'saved' });
  expect(writes).toHaveLength(1); expect(writes[0].operation).toBe('update');
  expect(writes[0].filters).toEqual(expect.arrayContaining([['organization_id', 120], ['id', current.id], ['voice_agent_id', AGENT], ['updated_at', current.updated_at]]));
  expect(writes[0].row).toMatchObject({ organization_id: 120, created_by: 'actor', voice_agent_id: AGENT });
});
test.each(['other-agent', 'old-version', 'deleted'])('conflicto %s no escribe', async reason => {
  const { db, writes } = setup(reason === 'deleted' ? null : { ...current, voice_agent_id: reason === 'other-agent' ? 'another-agent' : AGENT });
  await expect(upsertStageAgent(db, 120, input, 'actor', { preventReassignment: true, expectedUpdatedAt: reason === 'old-version' ? 'old' : current.updated_at })).rejects.toMatchObject({ status: 409 });
  expect(writes).toHaveLength(0);
});
test.each(['no-row', 'unique-race'])('carrera %s devuelve conflicto y no realiza upsert que reemplace', async reason => {
  const { db, writes } = setup(reason === 'no-row' ? current : null, { data: null, error: reason === 'unique-race' ? { code: '23505', message: 'unique' } : null });
  await expect(upsertStageAgent(db, 120, input, 'actor', { preventReassignment: true })).rejects.toMatchObject({ status: 409 });
  expect(writes).toHaveLength(1); expect(writes[0].operation).toBe(reason === 'no-row' ? 'update' : 'insert');
});
