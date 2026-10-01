import type { SupabaseClient } from '@supabase/supabase-js';
import { ultimaVerificacionRne, campanaConRneVigente } from '../cumplimiento';

function client(data: unknown, error: { message: string } | null = null) {
  const rpc = jest.fn(async () => ({ data, error }));
  const from = jest.fn(() => { throw new Error('No se aceptan contadores públicos como evidencia'); });
  return { rpc, from, sb: { rpc, from } as unknown as SupabaseClient };
}
test('consulta la constancia privada con la organización validada y no recurre a tablas públicas', async () => {
  const row = { id: 'fixture', valid_until: '2999-01-01T00:00:00Z', numbers_in_file: 1,
    evidence_available: true, audience_unchanged: true, changed_targets: 0 };
  const c = client(row);
  expect(await ultimaVerificacionRne(c.sb, 120, 'fixture')).toEqual(row);
  expect(c.rpc).toHaveBeenCalledWith('crm_voice_campaign_rne_status', { p_org: 120, p_campaign: 'fixture' });
  expect(c.from).not.toHaveBeenCalled();
});
test.each([
  { evidence_available: false, audience_unchanged: false, changed_targets: 0 },
  { evidence_available: true, audience_unchanged: false, changed_targets: 1 },
])('una fecha futura no autoriza evidencia inválida: %j', async evidence => {
  const c = client({ valid_until: '2999-01-01T00:00:00Z', numbers_in_file: 1, ...evidence });
  expect(await campanaConRneVigente(c.sb, 120, 'fixture')).toBe(false);
});
test.each([{}, [], { valid_until: '2999-01-01T00:00:00Z', numbers_in_file: 1 }])('una respuesta sin prueba válida falla cerrado: %j', async data => {
  const c = client(data);
  await expect(campanaConRneVigente(c.sb, 120, 'fixture')).rejects.toThrow('Respuesta de evidencia RNE inválida');
  expect(c.from).not.toHaveBeenCalled();
});
test('un error en la prueba privada no activa la campaña ni usa una constancia antigua', async () => {
  const c = client(null, { message: 'No disponible' });
  await expect(campanaConRneVigente(c.sb, 120, 'fixture')).rejects.toThrow('No disponible');
  expect(c.from).not.toHaveBeenCalled();
});
test('una campaña sin constancia no se autoriza', async () => {
  expect(await campanaConRneVigente(client(null).sb, 120, 'fixture')).toBe(false);
});
