import type { SupabaseClient } from '@supabase/supabase-js';
import { despacharVozConReserva, preparacionVozRechazada } from '../despachoConReserva';

const RESERVA = '30000000-0000-4000-8000-000000000001';
const LLAMADA = '30000000-0000-4000-8000-000000000002';
const VAC = '30000000-0000-4000-8000-000000000003';
const AGENTE = '30000000-0000-4000-8000-000000000004';
const SID = `CA${'b'.repeat(32)}`;
function escenario(overrides: Record<string, { data?: unknown; error?: unknown }> = {}, providerError?: unknown) {
  const trace: string[] = [];
  const responses: Record<string, unknown> = {
    crm_voice_dispatch_prepare: { reservation_id: RESERVA, call_id: LLAMADA, created: true, state: 'reserved', submission_state: 'prepared' },
    crm_voice_dispatch_begin: true,
    crm_voice_dispatch_accept: { reservation_id: RESERVA, call_id: LLAMADA, voice_agent_call_id: VAC, attempt_no: 1 },
    crm_voice_dispatch_cancel_prepared: true,
    crm_voice_dispatch_failure: { refunded: false, uncertain: true, applied: true },
    crm_voice_retry_rejected: { requeued: false, reason: 'attempt_limit' },
  };
  const rpc = jest.fn(async (name: string) => {
    trace.push(name);
    return name in overrides ? { data: null, error: null, ...overrides[name] } : { data: responses[name], error: null };
  });
  const create = jest.fn(async (options: Record<string, unknown>) => {
    void options;
    trace.push('provider');
    if (providerError) throw providerError;
    return { sid: SID };
  });
  const from = jest.fn(() => { throw new Error('Escritura separada no permitida'); });
  const input = {
    supabase: { rpc, from } as unknown as SupabaseClient, organizationId: 120, agentId: AGENTE,
    webhookBase: 'https://example.invalid', provider: { calls: { create } },
    preparation: {
      callId: VAC, attempt: 1, from: '+12025550198', to: '+12025550199', recording: true,
      customerPhone: '+12025550199', customerTimezone: 'UTC',
    },
  };
  return { input, rpc, create, from, trace };
}

test('reserva y comienza antes del proveedor; confirma una sola vez y no solicita grabación antes del aviso', async () => {
  const c = escenario();
  expect(await despacharVozConReserva(c.input)).toEqual({ initiated: true });
  expect(c.trace).toEqual(['crm_voice_dispatch_prepare', 'crm_voice_dispatch_begin', 'provider', 'crm_voice_dispatch_accept']);
  expect(c.create).toHaveBeenCalledTimes(1);
  const options = c.create.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
  expect(options).not.toHaveProperty('record');
  for (const key of ['url', 'statusCallback']) {
    const url = new URL(String(options[key]));
    expect(url.searchParams.get('reservationId')).toBe(RESERVA);
    expect(url.searchParams.get('callId')).toBe(VAC);
  }
  expect(c.from).not.toHaveBeenCalled();
});

test('intención ya procesada no vuelve a contactar ni devolver', async () => {
  const c = escenario({ crm_voice_dispatch_begin: { data: false } });
  expect(await despacharVozConReserva(c.input)).toMatchObject({ initiated: false });
  expect(c.trace).toEqual(['crm_voice_dispatch_prepare', 'crm_voice_dispatch_begin']);
  expect(c.create).not.toHaveBeenCalled();
});

test('respuesta perdida al preparar conserva conciliación, sin asumir que la reserva falló', async () => {
  const c = escenario({ crm_voice_dispatch_prepare: { error: new Error('timeout') } });
  await expect(despacharVozConReserva(c.input)).rejects.toMatchObject({ code: 'voz_pendiente_conciliacion' });
  expect(c.trace).toEqual(['crm_voice_dispatch_prepare']);
});

test('saldo insuficiente es un rechazo conocido de preparación y no llama al proveedor', async () => {
  const error = { code: 'P0001', message: 'creditos_insuficientes' };
  const c = escenario({ crm_voice_dispatch_prepare: { error } });
  await expect(despacharVozConReserva(c.input)).rejects.toBe(error);
  expect(c.create).not.toHaveBeenCalled();
});

test('cambio antes de comenzar cancela únicamente una preparación todavía no enviada', async () => {
  const c = escenario({ crm_voice_dispatch_begin: { error: { code: 'P0001', message: 'destinatario_voz_modificado' } } });
  expect(await despacharVozConReserva(c.input)).toMatchObject({ initiated: false });
  expect(c.trace).toEqual(['crm_voice_dispatch_prepare', 'crm_voice_dispatch_begin', 'crm_voice_dispatch_cancel_prepared']);
  expect(c.create).not.toHaveBeenCalled();
});

test.each([
  { data: false }, { error: { code: 'P0001', message: 'reembolso_no_disponible' } },
])('cancelación no confirmada conserva la reserva: %p', async (cancel) => {
  const c = escenario({ crm_voice_dispatch_begin: { error: new Error('timeout') }, crm_voice_dispatch_cancel_prepared: cancel });
  await expect(despacharVozConReserva(c.input)).rejects.toMatchObject({ code: 'voz_pendiente_conciliacion' });
  expect(c.create).not.toHaveBeenCalled();
});

test('rechazo confirmado concilia y programa reintento, sin volver a marcar en la misma petición', async () => {
  const c = escenario({ crm_voice_dispatch_failure: { data: { refunded: true, uncertain: false, applied: true } } }, { status: 400, code: 21211 });
  expect(await despacharVozConReserva(c.input)).toMatchObject({ initiated: false, providerFailure: true });
  expect(c.trace).toEqual(['crm_voice_dispatch_prepare', 'crm_voice_dispatch_begin', 'provider', 'crm_voice_dispatch_failure', 'crm_voice_retry_rejected']);
  expect(c.create).toHaveBeenCalledTimes(1);
});

test('timeout del proveedor conserva reserva y no programa reintento', async () => {
  const c = escenario({}, new Error('timeout'));
  await expect(despacharVozConReserva(c.input)).rejects.toMatchObject({ code: 'voz_pendiente_conciliacion' });
  expect(c.trace).toEqual(['crm_voice_dispatch_prepare', 'crm_voice_dispatch_begin', 'provider', 'crm_voice_dispatch_failure']);
  expect(c.create).toHaveBeenCalledTimes(1);
});

test('aceptación seguida de fallo de base jamás pasa por rechazo/devolución', async () => {
  const c = escenario({ crm_voice_dispatch_accept: { error: new Error('base no disponible') } });
  await expect(despacharVozConReserva(c.input)).rejects.toMatchObject({ code: 'voz_pendiente_conciliacion' });
  expect(c.trace).toEqual(['crm_voice_dispatch_prepare', 'crm_voice_dispatch_begin', 'provider', 'crm_voice_dispatch_accept']);
  expect(c.create).toHaveBeenCalledTimes(1);
});

test('correlación ajena se conserva como incertidumbre, no como generación fallida', async () => {
  const c = escenario({ crm_voice_dispatch_accept: { data: { reservation_id: RESERVA, call_id: LLAMADA, voice_agent_call_id: AGENTE, attempt_no: 1 } } });
  await expect(despacharVozConReserva(c.input)).rejects.toMatchObject({ code: 'voz_pendiente_conciliacion' });
  expect(c.trace).not.toContain('crm_voice_dispatch_failure');
});

test.each(['reserva_voz_sin_evidencia', 'creditos_pendientes', 'reembolso_no_disponible', 'desconocido'])('no libera crédito basándose en un rechazo sin prueba: %s', (message) => {
  expect(preparacionVozRechazada({ code: 'P0001', message })).toBe(false);
});
