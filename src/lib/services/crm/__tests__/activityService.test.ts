/**
 * activityService — validación zod, pertenencia a la org, 409 por call_id y
 * idempotencia por client_key (FASE-09 §9.1). Mock de supabase por tabla.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { activityInputSchema, createActivity, DuplicateActivityError, RelatedNotFoundError } from '../activityService';

type Row = Record<string, unknown>;
const OPP = '11111111-1111-4111-8111-111111111111';
const CALL = '22222222-2222-4222-8222-222222222222';

interface Mock { calls: Array<{ table: string; op: string; payload?: unknown }>; sb: SupabaseClient }

function makeSupabase(data: { opportunities?: Row[]; customers?: Row[]; activities?: Row[]; calls?: Row[]; email_messages?: Row[]; messages?: Row[]; conversations?: Row[] }): Mock {
  const calls: Mock['calls'] = [];
  const from = (table: string) => {
    let rows: Row[] = [...((data as Record<string, Row[] | undefined>)[table] ?? [])];
    let inserted: Row | null = null;
    const b: Row = {
      select: () => b,
      eq: (col: string, v: unknown) => { rows = rows.filter((r) => !(col in r) || r[col] === v); return b; },
      contains: (col: string, v: Row) => { rows = rows.filter((r) => Object.entries(v).every(([k, val]) => ((r[col] as Row) ?? {})[k] === val)); return b; },
      limit: () => b,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: inserted ?? rows[0] ?? null, error: null }),
      insert: (payload: Row) => { calls.push({ table, op: 'insert', payload }); inserted = { id: 'new-id', ...payload }; return b; },
      update: (payload: Row) => { calls.push({ table, op: 'update', payload }); return b; },
      then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
    };
    return b;
  };
  return { calls, sb: { from } as unknown as SupabaseClient };
}

describe('activityService', () => {
  test('activity_type fuera del CHECK → zod inválido', () => {
    expect(activityInputSchema.safeParse({ activity_type: 'fax', related_type: 'opportunity', related_id: OPP }).success).toBe(false);
    expect(activityInputSchema.safeParse({ activity_type: 'note', related_type: 'opportunity', related_id: OPP }).success).toBe(true);
  });

  test('related_id de otra org → RelatedNotFoundError (404)', async () => {
    const { sb } = makeSupabase({ opportunities: [] });
    await expect(createActivity(7, 'u1', { activity_type: 'note', related_type: 'opportunity', related_id: OPP }, sb)).rejects.toBeInstanceOf(RelatedNotFoundError);
  });

  test('call_id con actividad existente → DuplicateActivityError (409) con la fila existente', async () => {
    const existing = { id: 'a1', organization_id: 7, call_id: CALL, activity_type: 'call' };
    const { sb } = makeSupabase({ opportunities: [{ id: OPP, organization_id: 7, customer_id: null }], activities: [existing], calls: [{ id: CALL, organization_id: 7 }] });
    await expect(createActivity(7, 'u1', { activity_type: 'call', related_type: 'opportunity', related_id: OPP, call_id: CALL }, sb)).rejects.toMatchObject({ name: 'DuplicateActivityError', existing });
  });

  test('F9-16 · call_id de OTRA organización → RelatedNotFoundError (404)', async () => {
    const { sb } = makeSupabase({ opportunities: [{ id: OPP, organization_id: 7, customer_id: null }], calls: [{ id: CALL, organization_id: 99 }] });
    await expect(createActivity(7, 'u1', { activity_type: 'call', related_type: 'opportunity', related_id: OPP, call_id: CALL }, sb)).rejects.toBeInstanceOf(RelatedNotFoundError);
  });

  test('F9-17 · occurred_at futuro → zod inválido', () => {
    const future = new Date(Date.now() + 3 * 3600_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(activityInputSchema.safeParse({ activity_type: 'note', related_type: 'opportunity', related_id: OPP, occurred_at: future }).success).toBe(false);
    expect(activityInputSchema.safeParse({ activity_type: 'note', related_type: 'opportunity', related_id: OPP, occurred_at: past }).success).toBe(true);
  });

  test('client_key repetido → devuelve la misma fila sin insertar', async () => {
    const existing = { id: 'a2', organization_id: 7, related_id: OPP, metadata: { client_key: 'k1' } };
    const { sb, calls } = makeSupabase({ opportunities: [{ id: OPP, organization_id: 7 }], activities: [existing] });
    const r = await createActivity(7, 'u1', { activity_type: 'note', related_type: 'opportunity', related_id: OPP, metadata: { client_key: 'k1' } }, sb);
    expect(r.id).toBe('a2');
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });

  test('tipo de contacto en oportunidad → inserta y actualiza last_contact_at/contact_channel', async () => {
    const { sb, calls } = makeSupabase({ opportunities: [{ id: OPP, organization_id: 7 }], activities: [] });
    const r = await createActivity(7, 'u1', { activity_type: 'call', related_type: 'opportunity', related_id: OPP, channel: 'phone', outcome: 'reached', duration_seconds: 90 }, sb);
    expect(r.id).toBe('new-id');
    const ins = calls.find((c) => c.op === 'insert')!.payload as Row;
    expect(ins).toMatchObject({ organization_id: 7, user_id: 'u1', activity_type: 'call', related_type: 'opportunity', related_id: OPP, channel: 'phone', outcome: 'reached', duration_seconds: 90 });
    expect((ins.metadata as Row).source).toBe('quick_actions');
    const upd = calls.find((c) => c.table === 'opportunities' && c.op === 'update')!.payload as Row;
    expect(upd).toMatchObject({ contact_channel: 'phone', contact_result: 'reached' });
    expect(typeof upd.last_contact_at).toBe('string');
  });

  test('nota en cliente → inserta con related_type customer y no toca opportunities', async () => {
    const { sb, calls } = makeSupabase({ customers: [{ id: OPP, organization_id: 7 }], activities: [] });
    const r = await createActivity(7, 'u1', { activity_type: 'note', related_type: 'customer', related_id: OPP, notes: 'hola' }, sb);
    expect(r.related_type).toBe('customer');
    expect(calls.some((c) => c.table === 'opportunities')).toBe(false);
  });

  test('DuplicateActivityError expone la fila existente', () => {
    const e = new DuplicateActivityError({ id: 'x' } as never);
    expect(e.existing).toEqual({ id: 'x' });
  });
});
