import type { SupabaseClient } from '@supabase/supabase-js';
import {
  prepararCreditoVoz, iniciarEnvioVoz, cancelarPreparacionVoz, confirmarEnvioVoz,
  registrarFalloEnvioVoz, aplicarCallbackVoz, abrirSesionCreditoVoz, conciliarSesionCreditoVoz, programarReintentoVoz,
  VoiceCreditPendingError,
} from '../creditosVoz';

const RESERVA = '20000000-0000-4000-8000-000000000001';
const LLAMADA = '20000000-0000-4000-8000-000000000002';
const VAC = '20000000-0000-4000-8000-000000000003';
const JOB = '20000000-0000-4000-8000-000000000004';
const SID = `CA${'a'.repeat(32)}`;
function cliente(data: unknown, error: unknown = null) {
  const rpc = jest.fn(async () => ({ data, error }));
  const from = jest.fn(() => { throw new Error('No debe escribir tablas por separado'); });
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

test('preparar usa la organización resuelta y fija el testigo, sin permitir que metadata lo sustituya', async () => {
  const c = cliente({ reservation_id: RESERVA, call_id: LLAMADA, created: true, state: 'reserved', submission_state: 'prepared' });
  await prepararCreditoVoz(c.sb, 120, {
    callId: VAC, attempt: 2, from: '+12025550198', to: '+12025550199', recording: false,
    customerPhone: '+1 202 555 0199', customerTimezone: 'UTC', metadata: { expected_customer_phone: 'otro' },
  });
  expect(c.rpc).toHaveBeenCalledTimes(1);
  expect(c.rpc).toHaveBeenCalledWith('crm_voice_dispatch_prepare', expect.objectContaining({
    p_org: 120, p_vac: VAC, p_attempt: 2, p_metadata: { expected_customer_phone: '+1 202 555 0199', expected_customer_timezone: 'UTC' },
  }));
  expect(c.from).not.toHaveBeenCalled();
});

test.each([iniciarEnvioVoz, cancelarPreparacionVoz])('preserva false de una transición que no ganó', async (operar) => {
  const c = cliente(false);
  expect(await operar(c.sb, 120, RESERVA)).toBe(false);
  expect(c.rpc).toHaveBeenCalledWith(expect.any(String), { p_org: 120, p_reservation: RESERVA });
});

test('confirmar rechaza una correlación de otra reserva', async () => {
  const c = cliente({ reservation_id: JOB, call_id: LLAMADA, voice_agent_call_id: VAC, attempt_no: 1 });
  await expect(confirmarEnvioVoz(c.sb, 120, RESERVA, SID)).rejects.toMatchObject({ code: 'respuesta_creditos_voz_invalida' });
});

test.each([
  [{ status: 400, code: 21211 }, 400, '21211'],
  [{ status: 503, code: '21211' }, 503, '21211'],
  [new Error('timeout'), null, null],
  [{ status: '400', code: 'ECONNRESET' }, null, 'ECONNRESET'],
  [{ status: NaN }, null, null],
])('el fallo solo transmite evidencia del proveedor: %p', async (error, status, code) => {
  const c = cliente({ refunded: false, uncertain: true, applied: true });
  expect(await registrarFalloEnvioVoz(c.sb, 120, RESERVA, error)).toEqual({ refunded: false, uncertain: true, applied: true });
  expect(c.rpc).toHaveBeenCalledWith('crm_voice_dispatch_failure', { p_org: 120, p_reservation: RESERVA, p_http_status: status, p_provider_code: code });
});

test('callback transmite SID y token del intento sin actualizar tablas en Node', async () => {
  const c = cliente({ applied: false, refunded: true, current_attempt: false });
  expect(await aplicarCallbackVoz(c.sb, 120, RESERVA, SID, 'voicemail', 0, 'buzon')).toMatchObject({ current_attempt: false });
  expect(c.rpc).toHaveBeenCalledWith('crm_voice_callback_apply', { p_org: 120, p_reservation: RESERVA, p_sid: SID, p_status: 'voicemail', p_duration: 0, p_outcome: 'buzon' });
  expect(c.from).not.toHaveBeenCalled();
});

test('abrir acepta llamada entrante sin inventar reserva saliente', async () => {
  const c = cliente(RESERVA);
  expect(await abrirSesionCreditoVoz(c.sb, 120, SID, null, '2026-10-01T15:00:00Z', '+12025550199')).toBe(RESERVA);
  expect(c.rpc).toHaveBeenCalledWith('crm_voice_session_open', expect.objectContaining({ p_org: 120, p_vac: null }));
});

test('saldo insuficiente conserva settled=false y deuda; no se interpreta como conciliado', async () => {
  const c = cliente({ settled: false, applied: true, minutes_charged: 1, minutes_due: 2 });
  expect(await conciliarSesionCreditoVoz(c.sb, 120, SID, '2026-10-01T15:03:00Z', 4)).toEqual({ settled: false, applied: true, minutes_charged: 1, minutes_due: 2 });
  expect(c.rpc).toHaveBeenCalledTimes(1);
});

test('reintento conserva el mismo job y fecha enviados por la base', async () => {
  const c = cliente({ requeued: true, applied: false, job_id: JOB, run_at: '2026-10-02T05:00:00+00:00' });
  expect(await programarReintentoVoz(c.sb, 120, RESERVA)).toMatchObject({ applied: false, job_id: JOB });
  expect(c.from).not.toHaveBeenCalled();
});

test.each([null, true, { requeued: true }, { requeued: true, job_id: JOB, run_at: 'inválida' }])('respuesta incompleta de reintento se rechaza: %p', async (data) => {
  const c = cliente(data);
  await expect(programarReintentoVoz(c.sb, 120, RESERVA)).rejects.toMatchObject({ code: 'respuesta_creditos_voz_invalida' });
});

test('error de base se propaga sin hacer una devolución separada', async () => {
  const error = { code: 'P0001', message: 'reembolso_no_disponible' };
  const c = cliente(null, error);
  await expect(cancelarPreparacionVoz(c.sb, 120, RESERVA)).rejects.toBe(error);
  expect(c.rpc).toHaveBeenCalledTimes(1);
  expect(c.from).not.toHaveBeenCalled();
});

test('incertidumbre tiene código de negocio y conserva su causa para el servidor', () => {
  const causa = new Error('no se pudo correlacionar');
  expect(new VoiceCreditPendingError(causa)).toMatchObject({ status: 409, code: 'voz_pendiente_conciliacion', cause: causa });
});
