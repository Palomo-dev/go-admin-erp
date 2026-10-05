import { emitInboundCallContext, inboundNotificationId } from '../inboundCallPushService';
import type { SupabaseClient } from '@supabase/supabase-js';
const callId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
function client(status = 'ringing', active = true) {
  const inserts: unknown[] = []; const filters: unknown[] = [];
  const db = { from: (table: string) => {
    const chain = { select: () => chain, eq: (key: string, value: unknown) => { filters.push([table, key, value]); return chain; },
      in: () => Promise.resolve({ data: active ? [{ user_id: userId }] : [], error: null }),
      maybeSingle: () => Promise.resolve({ data: { id: callId, direction: 'inbound', status }, error: null }),
      upsert: (rows: unknown, options: unknown) => { inserts.push({ rows, options }); return Promise.resolve({ error: null }); } };
    return chain;
  } };
  return { db: db as unknown as SupabaseClient, inserts, filters };
}
it('reintentos generan la misma PK y el lote usa DO NOTHING para no repetir el trigger push', async () => {
  const fixture = client(); const call = { id: callId, organization_id: 1 };
  await emitInboundCallContext(call, [userId, userId], fixture.db); await emitInboundCallContext(call, [userId], fixture.db);
  expect(fixture.inserts[0]).toEqual(fixture.inserts[1]);
  expect(fixture.inserts[0]).toMatchObject({ options: { onConflict: 'id', ignoreDuplicates: true },
    rows: [{ id: inboundNotificationId(callId, userId, 1), organization_id: 1, recipient_user_id: userId,
      payload: { data: { call_id: callId, organization_id: '1' }, body: '📞' } }] });
  expect(fixture.filters).toContainEqual(['calls', 'organization_id', 1]);
  expect(fixture.filters).toContainEqual(['organization_members', 'organization_id', 1]);
});
it('no notifica miembros inactivos ni llamadas ya finalizadas', async () => {
  for (const fixture of [client('completed'), client('ringing', false)]) {
    expect(await emitInboundCallContext({ id: callId, organization_id: 1 }, [userId], fixture.db)).toEqual({ notifiedUserIds: [] });
    expect(fixture.inserts).toHaveLength(0);
  }
});
it('el identificador separa org y usuario, normaliza UUID y nunca usa números en la pantalla bloqueada', () => {
  expect(inboundNotificationId(callId.toUpperCase(), userId, 1)).toBe(inboundNotificationId(callId, userId, 1));
  expect(inboundNotificationId(callId, userId, 1)).not.toBe(inboundNotificationId(callId, userId, 2));
  expect(() => inboundNotificationId('inválido', userId, 1)).toThrow();
});
