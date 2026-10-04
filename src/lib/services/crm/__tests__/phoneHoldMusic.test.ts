import { normalizedHoldMusicUrl } from '../phoneMusicUrl';
import { telephonyPatchSchema, updateTelephonySettings } from '../telephonySettingsService';
import { getTelephonySettings } from '../voiceContextService';
import { FakeDb } from './fixtures/fakeSupabase';
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('../voiceContextService', () => ({ getTelephonySettings: jest.fn() }));
beforeEach(() => { jest.mocked(getTelephonySettings).mockResolvedValue({ voice_recording_enabled: false, voice_consent_message: 'Aviso de prueba' } as never); });
it.each(['http://music.example/a', 'https://localhost/a', 'https://10.0.0.1/a', 'https://[::1]/a', 'https://user:pass@music.example/a', 'https://music.internal/a', 'https://music.example/a b'])('rechaza música no pública/HTTPS antes de escribir: %s', (url) => {
  expect(normalizedHoldMusicUrl(url)).toBeNull(); expect(telephonyPatchSchema.safeParse({ hold_url: url }).success).toBe(false);
});
it('almacena URL dentro del JSON existente, conserva agente y configura grabación en la misma fila', async () => {
  const db = new FakeDb({ tables: { comm_settings: [{ id: 9, organization_id: 7, voice_agent_config: { greeting: 'Saludo', model: 'modelo' } }], provider_configs: [] } });
  await updateTelephonySettings(7, { hold_url: 'https://music.example/hold.mp3', voice_recording_enabled: false }, db.client());
  expect(db.rows('comm_settings')[0].voice_agent_config).toEqual({ greeting: 'Saludo', model: 'modelo', hold_url: 'https://music.example/hold.mp3' });
  await updateTelephonySettings(7, { hold_url: null }, db.client());
  expect(db.rows('comm_settings')[0].voice_agent_config).toEqual({ greeting: 'Saludo', model: 'modelo' });
});
it('configuración JSON inválida no se sobrescribe silenciosamente', async () => {
  const db = new FakeDb({ tables: { comm_settings: [{ id: 9, organization_id: 7, voice_agent_config: ['legado'] }] } });
  await expect(updateTelephonySettings(7, { hold_url: 'https://music.example/a' }, db.client())).rejects.toThrow('revisarse');
  expect(db.calls.filter((call) => call.op === 'update')).toHaveLength(0);
});
