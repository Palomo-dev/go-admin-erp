import type { SupabaseClient } from '@supabase/supabase-js';
import { whatsappJobHandler } from '../handlers/whatsapp';
import { JobFatalError, JobRetryableError, type JobContext, type OutboundJob } from '../types';

const ID = '11111111-1111-4111-8111-111111111111';
const savedSecret = process.env.AI_INTERNAL_SECRET;
const invoke = jest.fn();
const rpc = jest.fn();
const from = jest.fn();
let response: { data: unknown; error: unknown };
let controller: AbortController;
const eq = jest.fn();
const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const sb = { from, rpc, functions: { invoke } } as unknown as SupabaseClient;
const context = (payload: Record<string, unknown> = { dispatch_message_id: ID }): JobContext => ({
  job: { id: 'fixture-job', organization_id: 7, kind: 'whatsapp', payload } as OutboundJob,
  orgId: 7, supabase: sb, signal: controller.signal, log,
});
beforeEach(() => {
  jest.clearAllMocks(); delete process.env.AI_INTERNAL_SECRET; controller = new AbortController();
  response = { data: { id: ID, organization_id: 7, conversation_id: 'fixture-conversation' }, error: null };
  const builder = { select: () => builder, eq: (key: string, value: unknown) => { eq(key, value); return builder; },
    maybeSingle: async () => response };
  from.mockReturnValue(builder);
  rpc.mockResolvedValue({ data: 'fixture-secret', error: null });
  invoke.mockResolvedValue({ data: { deferred: true, run_at: '2026-10-05T12:00:00Z' }, error: null });
});
afterAll(() => { if (savedSecret === undefined) delete process.env.AI_INTERNAL_SECRET; else process.env.AI_INTERNAL_SECRET = savedSecret; });

test('reanuda el mismo mensaje propio con el secreto interno, sin volver a preparar ni cobrar', async () => {
  expect(await whatsappJobHandler(context())).toMatchObject({ message_id: ID, deferred: true });
  expect(from).toHaveBeenCalledTimes(1); expect(from).toHaveBeenCalledWith('messages');
  expect(eq).toHaveBeenCalledWith('organization_id', 7); expect(eq).toHaveBeenCalledWith('id', ID);
  expect(invoke).toHaveBeenCalledWith('channel-dispatch', { body: { messageId: ID, organizationId: 7, conversationId: 'fixture-conversation' },
    headers: { 'x-internal-secret': 'fixture-secret' } });
  expect(rpc.mock.calls.map(call => call[0])).toEqual(['get_ai_internal_secret']);
  expect(JSON.stringify(log.info.mock.calls)).not.toContain('fixture-secret');
});

test.each([null, { id: ID, organization_id: 999 }])('no invoca un mensaje ausente o ajeno: %j', async data => {
  response = { data, error: null };
  await expect(whatsappJobHandler(context())).rejects.toBeInstanceOf(JobFatalError);
  expect(invoke).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});

test('error de lectura no usa otra organización ni publica', async () => {
  response = { data: null, error: { message: 'Fixture lectura' } };
  await expect(whatsappJobHandler(context())).rejects.toBeInstanceOf(JobRetryableError);
  expect(invoke).not.toHaveBeenCalled();
});

test('abort y mensaje inválido impiden efectos', async () => {
  controller.abort(); await expect(whatsappJobHandler(context())).rejects.toBeInstanceOf(JobRetryableError);
  controller = new AbortController(); await expect(whatsappJobHandler(context({ dispatch_message_id: 'otro' }))).rejects.toBeInstanceOf(JobFatalError);
  expect(from).not.toHaveBeenCalled(); expect(invoke).not.toHaveBeenCalled();
});

test('sin secreto o con fallo del consumidor conserva reintento seguro', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'Fixture secreto' } });
  await expect(whatsappJobHandler(context())).rejects.toBeInstanceOf(JobRetryableError); expect(invoke).not.toHaveBeenCalled();
  rpc.mockResolvedValue({ data: 'fixture-secret', error: null });
  invoke.mockResolvedValue({ data: null, error: { message: 'Fixture consumidor' } });
  await expect(whatsappJobHandler(context())).rejects.toBeInstanceOf(JobRetryableError);
});

test.each([{ pendingReconciliation: true }, { skipped: 'already_claimed' }])('incertidumbre/claim previo se conserva sin crear otra solicitud: %j', async data => {
  invoke.mockResolvedValue({ data, error: null });
  expect(await whatsappJobHandler(context())).toEqual({ message_id: ID, ...data });
  expect(invoke).toHaveBeenCalledTimes(1);
});
