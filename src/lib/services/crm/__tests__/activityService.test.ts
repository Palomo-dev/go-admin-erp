import type { SupabaseClient } from '@supabase/supabase-js';
import { activityInputSchema, createActivity, DuplicateActivityError, RelatedNotFoundError } from '../activityService';
import { crearTareaRapida, tareaRapidaSchema } from '../tareaRapidaService';

const OPP = '11111111-1111-4111-8111-111111111111';
const INPUT = { activity_type: 'call' as const, related_type: 'opportunity' as const, related_id: OPP, notes: 'Contacto', metadata: { client_key: 'reintento' }, follow_up: { title: 'Volver a llamar' } };
const ACTIVITY = { id: OPP, user_id: 'actor-de-sesion', metadata: { follow_up_id: 'seguimiento' } };
function cliente(data: unknown, error: unknown = null) {
  const rpc = jest.fn(async () => ({ data, error }));
  const from = jest.fn(() => { throw new Error('La creación debe ser atómica'); });
  return { rpc, from, sb: { rpc, from } as unknown as SupabaseClient };
}

describe('Actividad y seguimiento en una transacción', () => {
  test('una RPC devuelve lo persistido y nunca transmite el actor como autoridad', async () => {
    const c = cliente({ activity: ACTIVITY, follow_up_id: 'seguimiento' });
    expect(await createActivity(7, 'actor-del-body-no-confiable', INPUT, c.sb)).toEqual(ACTIVITY);
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(c.rpc).toHaveBeenCalledWith('fn_crm_registrar_actividad', { p_org: 7, p_payload: INPUT });
    expect(c.from).not.toHaveBeenCalled();
  });
  test('reintento devuelve la fila canónica sin crear otro seguimiento', async () => {
    const c = cliente({ activity: ACTIVITY, reused: true });
    expect(await createActivity(7, 'u1', INPUT, c.sb)).toEqual(ACTIVITY);
    expect(c.from).not.toHaveBeenCalled();
  });
  test('call_id duplicado conserva 409 y su fila existente', async () => {
    const c = cliente({ activity: ACTIVITY, duplicate: true });
    await expect(createActivity(7, 'u1', INPUT, c.sb)).rejects.toMatchObject({ name: 'DuplicateActivityError', existing: ACTIVITY });
  });
  test('entidad o referencia ajena conserva 404', async () => {
    const c = cliente(null, { code: 'P0002', message: 'referencia_no_encontrada' });
    await expect(createActivity(7, 'u1', INPUT, c.sb)).rejects.toBeInstanceOf(RelatedNotFoundError);
  });
  test.each(['42501', '40001', '23514'])('propaga SQLSTATE %s al clasificador común; ningún guardado secundario', async code => {
    const error = { code, message: 'error_controlado' };
    const c = cliente(null, error);
    await expect(createActivity(7, 'u1', INPUT, c.sb)).rejects.toBe(error);
    expect(c.from).not.toHaveBeenCalled();
  });
  test.each([null, {}, { activity: {} }])('una respuesta incompleta no confirma el guardado', async data => {
    const c = cliente(data);
    await expect(createActivity(7, 'u1', INPUT, c.sb)).rejects.toThrow('no devolvió su historial');
  });
  test('rechaza campos de identidad y enlaces de calendario enviados por cliente', () => {
    expect(activityInputSchema.safeParse({ ...INPUT, user_id: OPP }).success).toBe(false);
    for (const key of ['event_id', 'activity_id', 'completed_at', 'request_fingerprint', 'follow_up_id', 'voice_agent_call_id']) {
      expect(activityInputSchema.safeParse({ ...INPUT, metadata: { [key]: OPP } }).success).toBe(false);
    }
  });
  test('la actividad manual no falsifica sistema, IA o tareas; el seguimiento requiere llamada', () => {
    for (const activity_type of ['system', 'ai_call', 'task', 'fax']) expect(activityInputSchema.safeParse({ ...INPUT, activity_type }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...INPUT, activity_type: 'note' }).success).toBe(false);
    expect(activityInputSchema.safeParse(INPUT).success).toBe(true);
  });
  test('rechaza fecha futura y claves de reintento inválidas', () => {
    expect(activityInputSchema.safeParse({ ...INPUT, occurred_at: new Date(Date.now() + 3600_000).toISOString() }).success).toBe(false);
    for (const client_key of ['', 42, 'x'.repeat(121)]) expect(activityInputSchema.safeParse({ ...INPUT, metadata: { client_key } }).success).toBe(false);
  });
  test('DuplicateActivityError expone solo su actividad existente', () => {
    expect(new DuplicateActivityError(ACTIVITY as never).existing).toEqual(ACTIVITY);
  });
});

describe('Tarea rápida canónica', () => {
  const tarea = { related_to_type: 'customer' as const, related_to_id: OPP, title: 'Seguimiento', client_key: 'tarea' };
  test('la ruta y el seguimiento usan la misma RPC; autor derivado', async () => {
    const c = cliente({ id: OPP });
    expect(await crearTareaRapida(7, tarea, c.sb)).toEqual({ id: OPP });
    expect(c.rpc).toHaveBeenCalledWith('fn_crm_crear_tarea', { p_org: 7, p_payload: tarea });
    expect(c.from).not.toHaveBeenCalled();
  });
  test('no acredita responsables ni claves inválidas desde el cuerpo', () => {
    expect(tareaRapidaSchema.safeParse({ ...tarea, created_by: OPP }).success).toBe(false);
    expect(tareaRapidaSchema.safeParse({ ...tarea, assigned_to: 'otra-org' }).success).toBe(false);
    expect(tareaRapidaSchema.safeParse({ ...tarea, client_key: '' }).success).toBe(false);
  });
});
