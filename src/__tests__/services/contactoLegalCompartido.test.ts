import { reservarContactoLegal, siguienteVentanaComun } from '../../../supabase/functions/_shared/contacto/despachoLegal';

const ctx = { gate: { allowed: true }, required: true, phone_raw: '+573001234567', identity_raw: false,
  timezone: 'Pacific/Auckland', default_country_code: null, allowed_hours: null, server_now: '2026-10-01T15:00:00Z' };
function cliente(cambios: Partial<typeof ctx> = {}, reserva: unknown = { allowed: true }) {
  return { rpc: jest.fn(async (name: string) => ({ data: name === 'crm_message_legal_context' ? { ...ctx, ...cambios } : reserva, error: null })) };
}
const run = (c: ReturnType<typeof cliente>) => reservarContactoLegal(c, 7, 'mensaje', 'testigo', '573001234567');

test('hora del destinatario +57 prevalece y reserva con límites centrales y reloj del servidor', async () => {
  const c = cliente(); expect(await run(c)).toEqual({ allowed: true });
  expect(c.rpc).toHaveBeenCalledWith('crm_reserve_legal_contact', expect.objectContaining({ p_zone: 'America/Bogota',
    p_phone: '+573001234567', p_from: '2026-09-28T05:00:00.000Z', p_until: '2026-10-05T05:00:00.000Z',
    p_open: '2026-10-01T12:00:00.000Z', p_close: '2026-10-01T15:00:30.000Z', p_limits: { channel: 1, total: 2 } }));
});

test.each(['2026-10-04T15:00:00Z', '2026-10-12T15:00:00Z', '2026-10-02T00:00:00Z'])('no reserva fuera del horario o en festivo: %s', async server_now => {
  const c = cliente({ server_now });
  expect(await run(c)).toMatchObject({ allowed: false, reason: 'fuera_de_horario', retryAt: expect.any(String) });
  expect(c.rpc).toHaveBeenCalledTimes(1);
});

test('el horario de la organización solo restringe la ventana legal', async () => {
  const horario = { tz: 'America/Bogota', days: [1, 2, 3, 4, 5, 6], from: '06:00', to: '23:00' };
  expect(siguienteVentanaComun(new Date('2026-10-04T15:00:00Z'), '+573001234567', null, horario)?.toISOString()).toBe('2026-10-05T12:00:00.000Z');
  const estrecho = { ...horario, from: '11:00', to: '12:00' };
  expect(siguienteVentanaComun(new Date('2026-10-01T15:00:00Z'), '+573001234567', null, estrecho)?.toISOString()).toBe('2026-10-01T16:00:00.000Z');
  expect(siguienteVentanaComun(new Date('2026-10-01T15:00:00Z'), '+573001234567', null, { ...horario, days: [0] })).toBeNull();
});

test.each([{ whatsapp: 1 }, { voice: 1, email: 1 }])('capacidad SQL decide la siguiente semana por la regla compartida: %j', async counts => {
  const c = cliente({}, { allowed: false, reason: 'weekly_capacity', counts });
  expect(await run(c)).toMatchObject({ allowed: false, retryAt: '2026-10-05T12:00:00.000Z' });
});

test('horario inválido, lectura fallida o conteos inválidos fallan cerrado', async () => {
  const invalid = cliente({ allowed_hours: {} as never }); expect(await run(invalid)).toEqual({ allowed: false, reason: 'legal_gate_unavailable' });
  const failed = cliente(); failed.rpc.mockRejectedValue(new Error('Fixture lectura'));
  expect(await run(failed)).toEqual({ allowed: false, reason: 'legal_gate_unavailable' });
  const counts = cliente({}, { allowed: false, reason: 'weekly_capacity', counts: { whatsapp: '1' } });
  expect(await run(counts)).toEqual({ allowed: false, reason: 'legal_gate_unavailable' });
});

test('no sustituye destinatario y las respuestas transaccionales ordinarias no usan turnos semanales', async () => {
  const changed = cliente({ phone_raw: '+573009999999' }); expect(await run(changed)).toEqual({ allowed: false, reason: 'recipient_changed' });
  expect(changed.rpc).toHaveBeenCalledTimes(1);
  const utility = cliente({ required: false }); expect(await run(utility)).toEqual({ allowed: true });
  expect(utility.rpc).toHaveBeenCalledTimes(1);
});

test('exención de número de prueba no desactiva el horario legal', async () => {
  const open = cliente({}, { allowed: true, exemption: 'numero_prueba' });
  expect(await run(open)).toEqual({ allowed: true, exemption: 'numero_prueba' });
  const closed = cliente({ server_now: '2026-10-04T15:00:00Z' }, { allowed: true, exemption: 'numero_prueba' });
  expect(await run(closed)).toMatchObject({ allowed: false, reason: 'fuera_de_horario' });
  expect(closed.rpc).toHaveBeenCalledTimes(1);
});

test('ventana cambiada bajo candado exige nueva oportunidad futura', async () => {
  const c = cliente({}, { allowed: false, reason: 'window_changed', server_now: '2026-10-02T00:00:00Z' });
  expect(await run(c)).toMatchObject({ allowed: false, reason: 'window_changed', retryAt: '2026-10-02T12:00:00.000Z' });
});
