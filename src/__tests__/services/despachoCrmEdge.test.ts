import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { secretosCoinciden } from '../../../supabase/functions/_shared/ai-chat/politicaRespuesta';
import { cargarSecretoInterno, evaluarContactoPersistido } from '../../../supabase/functions/_shared/contacto/puerta';
import { normalizePhoneDigits, resolverIndicativo } from '../../../supabase/functions/_shared/contacto/telefono';
import { computeWindow } from '../../../supabase/functions/_shared/contacto/ventana';

const mensaje = '00000000-0000-4000-a000-000000000001';
const token = '00000000-0000-4000-a000-000000000002';
interface Consulta { tabla: string; accion: string; filtros: Record<string, unknown>; datos?: unknown }
type Resultado = { data: unknown; error: { message: string; code?: string } | null };
function cargar(funcion: 'channel-dispatch' | 'ai-auto-response', opts: {
  gate?: boolean[]; claim?: boolean; fetchError?: boolean; providerResponse?: Record<string, unknown>; providerStatus?: number; persistError?: boolean;
  channelType?: string; closedWindow?: boolean; provider?: string; failIdentity?: boolean; failJob?: boolean;
} = {}) {
  const queries: Consulta[] = [];
  const gates = [...(opts.gate || [true])];
  const rpc = jest.fn(async (nombre: string): Promise<Resultado> => {
    if (nombre === 'crm_message_contact_gate') return { data: { allowed: gates.length > 1 ? gates.shift() : gates[0], reason: 'consent_blocked' }, error: null };
    if (nombre === 'crm_claim_message_dispatch') return { data: opts.claim === false ? { claimed: false, reason: 'already_claimed' } : { claimed: true, token }, error: null };
    if (nombre === 'crm_finish_message_dispatch') return { data: {}, error: opts.persistError ? { message: 'fixture' } : null };
    return { data: null, error: null };
  });
  const from = jest.fn((tabla: string) => {
    const query: Consulta = { tabla, accion: 'select', filtros: {} }; queries.push(query);
    const result = (): Resultado => {
      if (tabla === 'messages') return { data: query.filtros.direction === 'inbound' ? { id: mensaje } : {
        id: mensaje, organization_id: 120, channel_id: 'canal', conversation_id: 'conversacion', direction: 'outbound', role: 'agent',
        content: 'Fixture', content_type: 'text', payload: {}, metadata: { to: '12025559999' }, created_at: new Date().toISOString(),
      }, error: null };
      if (tabla === 'channels') return { data: { id: 'canal', type: opts.channelType || 'whatsapp', ai_mode: 'auto' }, error: null };
      if (tabla === 'channel_credentials') return { data: [{ provider: opts.provider || 'meta', credentials: { phone_number_id: 'fixture-number', access_token: 'fixture-token' } }], error: null };
      if (tabla === 'conversations') return { data: { id: 'conversacion', customer_id: 'cliente', channel_id: 'canal', organization_id: 120,
        last_inbound_at: opts.closedWindow ? '2020-01-01T00:00:00Z' : new Date().toISOString() }, error: null };
      if (tabla === 'customer_channel_identities') return { data: { identity_value: '12025550198' }, error: opts.failIdentity ? { message: 'fixture' } : null };
      if (tabla === 'ai_settings') return { data: { is_active: true, auto_response_enabled: true, auto_response_delay_seconds: 1 }, error: null };
      if (tabla === 'ai_jobs') return { data: { id: 'job-fixture' }, error: opts.failJob ? { message: 'fixture', code: '08006' } : null };
      return { data: null, error: null };
    };
    const builder = {
      select: () => builder, order: () => builder, limit: () => builder, gt: () => builder,
      eq: (clave: string, valor: unknown) => { query.filtros[clave] = valor; return builder; },
      insert: (datos: unknown) => { query.accion = 'insert'; query.datos = datos; return builder; },
      update: (datos: unknown) => { query.accion = 'update'; query.datos = datos; return builder; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: (r: Resultado) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return builder;
  });
  const proveedor = jest.fn(async () => {
    if (opts.fetchError) throw new Error('fixture desconexión después de POST');
    return new Response(JSON.stringify(opts.providerResponse || { messages: [{ id: 'fixture-external' }] }), { status: opts.providerStatus || 200 });
  });
  let handler: (req: Request) => Promise<Response> = async () => { throw new Error('Handler no registrado'); };
  const source = fs.readFileSync(path.join(process.cwd(), 'supabase/functions', funcion, 'index.ts'), 'utf8').replace(/^import [^\n]+;\s*/gm, '');
  const compiled = transpileModule(source, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.CommonJS } });
  if (compiled.diagnostics?.length) throw new Error('Error de sintaxis de Edge');
  vm.runInNewContext(compiled.outputText, {
    Deno: { env: { get: (clave: string) => clave === 'AI_INTERNAL_SECRET' ? 'fixture-secret' : undefined }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient: () => ({ from, rpc }), OpenAI: class {}, cargarSecretoInterno, evaluarContactoPersistido,
    secretosCoinciden, normalizePhoneDigits, resolverIndicativo, computeWindow,
    fetch: proveedor, Response, Request, URLSearchParams, btoa, console: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    setTimeout: (fn: () => void) => { fn(); return 0; },
  });
  const run = (body: Record<string, unknown> = { messageId: mensaje, conversationId: 'conversacion', organizationId: 120 }, secret = 'fixture-secret') => handler(new Request('https://fixture.invalid', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret }, body: JSON.stringify(body),
  }));
  return { run, rpc, from, proveedor, queries };
}

test('despacho exige secreto antes de consultar mensajes', async () => {
  const h = cargar('channel-dispatch'); expect((await h.run(undefined, 'incorrecto')).status).toBe(401);
  expect(h.from).not.toHaveBeenCalled(); expect(h.proveedor).not.toHaveBeenCalled();
});
test('org/conversación distintos se rechazan antes de reservar o enviar', async () => {
  const h = cargar('channel-dispatch'); expect((await h.run({ messageId: mensaje, organizationId: 121 })).status).toBe(403);
  expect(h.rpc).not.toHaveBeenCalled(); expect(h.proveedor).not.toHaveBeenCalled();
});
test('un claim duplicado no llama al proveedor', async () => {
  const h = cargar('channel-dispatch', { claim: false }); expect(await (await h.run()).json()).toEqual({ skipped: 'already_claimed' });
  expect(h.proveedor).not.toHaveBeenCalled();
});
test('una baja entre claim y despacho impide el POST y persiste fallo con el token', async () => {
  const h = cargar('channel-dispatch', { gate: [false] }); expect(await (await h.run()).json()).toEqual({ skipped: 'consent_blocked' });
  expect(h.proveedor).not.toHaveBeenCalled(); expect(h.rpc).toHaveBeenCalledWith('crm_finish_message_dispatch', expect.objectContaining({ p_org: 120, p_message: mensaje, p_token: token, p_status: 'failed', p_error_code: 'consent_blocked' }));
});
test('envía a la identidad propia, ignora metadata.to y registra entrega atómica', async () => {
  const h = cargar('channel-dispatch'); expect((await h.run()).status).toBe(200);
  const body = JSON.parse((h.proveedor.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  expect(body.to).toBe('12025550198'); expect(h.proveedor).toHaveBeenCalledTimes(1);
  expect(h.rpc).toHaveBeenCalledWith('crm_finish_message_dispatch', expect.objectContaining({ p_status: 'sent', p_external_id: 'fixture-external', p_token: token }));
  for (const q of h.queries.filter(q => ['conversations', 'channels', 'customer_channel_identities'].includes(q.tabla))) expect(q.filtros.organization_id).toBe(120);
});
test('desconexión tras POST queda uncertain, no simula entrega confirmada', async () => {
  const h = cargar('channel-dispatch', { fetchError: true }); expect((await h.run()).status).toBe(500);
  expect(h.proveedor).toHaveBeenCalledTimes(1); expect(h.rpc).toHaveBeenCalledWith('crm_finish_message_dispatch', expect.objectContaining({ p_status: 'uncertain', p_error_code: 'PROVIDER_UNCERTAIN' }));
});
test('2xx sin ID del proveedor exige conciliación', async () => {
  const h = cargar('channel-dispatch', { providerResponse: { accepted: true } }); expect((await h.run()).status).toBe(202);
  expect(h.rpc).toHaveBeenCalledWith('crm_finish_message_dispatch', expect.objectContaining({ p_status: 'uncertain' }));
});
test('fallo de persistencia después de enviar no responde success', async () => {
  const h = cargar('channel-dispatch', { persistError: true }); expect((await h.run()).status).toBe(500); expect(h.proveedor).toHaveBeenCalledTimes(1);
});
test('sin configurar Evolution, QR queda deferred sin POST', async () => {
  const h = cargar('channel-dispatch', { provider: 'baileys' }); expect(await (await h.run()).json()).toMatchObject({ skipped: 'baileys_pending_dispatch' });
  expect(h.proveedor).not.toHaveBeenCalled(); expect(h.rpc).toHaveBeenCalledWith('crm_finish_message_dispatch', expect.objectContaining({ p_status: 'deferred' }));
});
test('error de identidad bloquea preparación; no usa datos alternativos sin verificar', async () => {
  const h = cargar('channel-dispatch', { failIdentity: true }); expect((await h.run()).status).toBe(500); expect(h.proveedor).not.toHaveBeenCalled();
  expect(h.rpc).toHaveBeenCalledWith('crm_finish_message_dispatch', expect.objectContaining({ p_status: 'failed', p_error_code: 'DISPATCH_PREPARATION_FAILED' }));
});
test.each([{ gate: [false] }, { closedWindow: true }])('IA no genera con baja o ventana cerrada: %j', async opts => {
  const h = cargar('ai-auto-response', opts); expect(await (await h.run()).json()).toEqual({ skipped: true, reason: 'contact_blocked' });
  expect(h.proveedor).not.toHaveBeenCalled(); expect(h.queries.filter(q => q.tabla === 'ai_jobs' && q.accion === 'insert')).toHaveLength(0);
});
test('baja registrada durante debounce cierra job y evita el modelo', async () => {
  const h = cargar('ai-auto-response', { gate: [true, false] }); expect(await (await h.run()).json()).toEqual({ skipped: true, reason: 'contact_blocked' });
  expect(h.queries).toContainEqual(expect.objectContaining({ tabla: 'ai_jobs', accion: 'update', datos: expect.objectContaining({ status: 'skipped', error_code: 'contact_blocked' }) }));
  expect(h.proveedor).not.toHaveBeenCalled();
});
test('si no se puede reservar respuesta, IA falla antes de generar', async () => {
  const h = cargar('ai-auto-response', { failJob: true }); expect((await h.run()).status).toBe(503); expect(h.proveedor).not.toHaveBeenCalled();
});

test('5xx del proveedor conserva la incertidumbre y no aparenta rechazo confirmado', async () => {
  const h = cargar('channel-dispatch', { providerStatus: 502, providerResponse: { error: { message: 'Fixture gateway' } } });
  expect((await h.run()).status).toBe(202);
  expect(h.rpc).toHaveBeenCalledWith('crm_finish_message_dispatch', expect.objectContaining({ p_status: 'uncertain' }));
});
test.each([null, { allowed: 'true' }, { allowed: false }, { fixture: true }])('puerta falla cerrada ante respuesta inválida %j', async data => {
  const rpc = jest.fn(async () => ({ data, error: null }));
  expect((await evaluarContactoPersistido({ rpc }, 120, mensaje)).allowed).toBe(false);
});
test('puerta y secreto fallan cerrados ante desconexión de RPC', async () => {
  const rpc = jest.fn(async (): Promise<Resultado> => { throw new Error('Fixture red'); });
  expect(await cargarSecretoInterno({ rpc })).toBeNull();
  expect(await evaluarContactoPersistido({ rpc }, 120, mensaje)).toEqual({ allowed: false, reason: 'contact_gate_unavailable' });
});
