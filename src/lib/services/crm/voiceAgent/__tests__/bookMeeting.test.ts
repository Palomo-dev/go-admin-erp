import type { SupabaseClient } from '@supabase/supabase-js';
import { bookMeeting, resolverInicioReunion, type ToolContext } from '../../voiceAgentTools';
import { notificarReunion } from '../../reunionCorreo.server';
jest.mock('../../reunionCorreo.server', () => ({ notificarReunion: jest.fn() }));

const VAC = '11111111-1111-4111-8111-111111111158';
const EVENTO = '22222222-2222-4222-8222-222222222258';
const ACTIVIDAD = '33333333-3333-4333-8333-333333333358';
const USUARIO = '44444444-4444-4444-8444-444444444458';
const fila = { id: EVENTO, title: 'Prueba reunión', start_at: '2026-10-02T15:00:00.000Z',
  end_at: '2026-10-02T15:30:00.000Z', timezone: 'America/Bogota', created_by: USUARIO,
  customer_id: '55555555-5555-4555-8555-555555555558', opportunity_id: null };

function doble() {
  const rpc = jest.fn().mockResolvedValue({ data: { event: fila, activity_id: ACTIVIDAD }, error: null });
  const insert = jest.fn();
  const client = { rpc, from: jest.fn((table: string) => {
    if (table !== 'organizations') throw new Error('Las entidades las resuelve la RPC');
    const q = { select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: { timezone: 'America/Bogota' }, error: null }), insert };
    return q;
  }) } as unknown as SupabaseClient;
  const ctx: ToolContext = { orgId: 125, supabase: client, voiceAgentCallId: VAC,
    customerId: '66666666-6666-4666-8666-666666666658', actionPolicy: 'suggest' };
  return { ctx, rpc, insert };
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-09-29T15:00:00Z'),
    doNotFake: ['setTimeout', 'setImmediate', 'nextTick', 'queueMicrotask'] });
  jest.clearAllMocks();
  jest.mocked(notificarReunion).mockResolvedValue({ cliente: true, responsable: false });
});
afterEach(() => jest.useRealTimers());

describe('resolverInicioReunion', () => {
  test('con desfase respeta el instante', () => {
    expect(resolverInicioReunion('2026-10-02T10:00:00-05:00', 'America/Bogota')?.toISOString()).toBe('2026-10-02T15:00:00.000Z');
    expect(resolverInicioReunion('2026-10-02T15:00:00Z', 'America/Bogota')?.toISOString()).toBe('2026-10-02T15:00:00.000Z');
  });
  test('sin desfase usa la zona de la organización', () => {
    expect(resolverInicioReunion('2026-10-02T10:00', 'America/Bogota')?.toISOString()).toBe('2026-10-02T15:00:00.000Z');
    expect(resolverInicioReunion('2026-10-02 10:00:00', 'America/Bogota')?.toISOString()).toBe('2026-10-02T15:00:00.000Z');
    expect(resolverInicioReunion('2026-10-02T10:00', 'Europe/Madrid')?.toISOString()).toBe('2026-10-02T08:00:00.000Z');
  });
  test.each(['mañana a las 10', '2026-10-02', '2026-10-02T25:00', '',
    '2026-02-30T10:00:00Z', '2026-02-30T10:00', '2026-10-02T10:00:99'])('rechaza fecha imposible %s', input => {
    expect(resolverInicioReunion(input, 'America/Bogota')).toBeNull();
  });
});

test('guarda una sola RPC, sin insertar desde Node ni transmitir entidades o actor', async () => {
  const { ctx, rpc, insert } = doble();
  const result = await bookMeeting(ctx, { start_at: '2026-10-02T10:00', title: 'Prueba reunión' });
  expect(result.success).toBe(true);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('fn_crm_agendar_reunion_voz', { p_org: 125, p_vac: VAC,
    p_payload: { title: 'Prueba reunión', description: null, start_at: fila.start_at, end_at: fila.end_at, timezone: fila.timezone } });
  expect(insert).not.toHaveBeenCalled();
  expect(result.data).toMatchObject({ id: EVENTO, activity_id: ACTIVIDAD });
  expect(result.say).toMatch(/02\/10\/2026 10:00/);
  expect(notificarReunion).toHaveBeenCalledWith(125, { userId: USUARIO }, fila, ctx.supabase);
  expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(notificarReunion).mock.invocationCallOrder[0]);
});
test('fallo de guardado no envía invitaciones ni muestra éxito o detalles privados', async () => {
  const { ctx, rpc } = doble();
  rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'prueba_detalle_privado' } });
  const result = await bookMeeting(ctx, { start_at: '2026-10-02T10:00' });
  expect(result.success).toBe(false);
  expect(JSON.stringify(result)).not.toContain('prueba_detalle_privado');
  expect(notificarReunion).not.toHaveBeenCalled();
});
test('un resultado incompleto no confirma la reunión', async () => {
  const { ctx, rpc } = doble();
  rpc.mockResolvedValue({ data: { event: fila }, error: null });
  expect((await bookMeeting(ctx, { start_at: '2026-10-02T10:00' })).success).toBe(false);
  expect(notificarReunion).not.toHaveBeenCalled();
});
test('pasado, fecha ilegible y ausencia de contexto no escriben', async () => {
  const { ctx, rpc } = doble();
  expect((await bookMeeting(ctx, { start_at: '2023-10-02T10:00:00-05:00' })).error).toMatch(/pasado/);
  expect((await bookMeeting(ctx, { start_at: 'el jueves' })).error).toMatch(/inválida/);
  expect((await bookMeeting({ ...ctx, voiceAgentCallId: null }, { start_at: '2026-10-02T10:00' })).success).toBe(false);
  expect(rpc).not.toHaveBeenCalled();
});
