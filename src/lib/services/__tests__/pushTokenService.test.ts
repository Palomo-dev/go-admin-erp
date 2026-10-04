jest.mock('@/lib/supabase/config', () => ({ supabase: { auth: { getSession: jest.fn() }, from: jest.fn() } }));
jest.mock('@/lib/utils/mobile', () => ({ isMobile: () => true, isIOS: () => false, getMobilePlugin: jest.fn(),
  safeAddListener: (plugin: { addListener: (event: string, callback: (value: unknown) => void) => unknown }, event: string, callback: (value: unknown) => void) => plugin.addListener(event, callback) }));
jest.mock('@/lib/utils/mobileStorage', () => ({ getMobileStorage: jest.fn(), setMobileStorage: jest.fn(), removeMobileStorage: jest.fn() }));
import { registerPushToken, unregisterPushToken } from '../pushTokenService';
import { supabase } from '@/lib/supabase/config';
import { getMobilePlugin } from '@/lib/utils/mobile';
import { getMobileStorage, setMobileStorage } from '@/lib/utils/mobileStorage';
const id = '11111111-1111-4111-8111-111111111111';
let events: Record<string, (value: unknown) => void>; let remove: jest.Mock; let upsert: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks(); events = {}; remove = jest.fn().mockResolvedValue(undefined); upsert = jest.fn().mockResolvedValue({ error: null });
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id } } } });
  (supabase.from as jest.Mock).mockReturnValue({ upsert });
  (getMobilePlugin as jest.Mock).mockReturnValue({ requestPermissions: jest.fn().mockResolvedValue({ receive: 'granted' }),
    addListener: jest.fn((event, callback) => { events[event] = callback; return { remove }; }),
    register: jest.fn(async () => events.registration({ value: 'token-prueba' })) });
});
it('registra con eventos estándar de Capacitor, antes del register síncrono, sin getToken', async () => {
  expect(await registerPushToken(id)).toBe(true);
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: id, token: 'token-prueba', platform: 'android' }), { onConflict: 'user_id,token' });
  expect(setMobileStorage).toHaveBeenCalledWith('goAdminPushRegistration', JSON.stringify({ userId: id, token: 'token-prueba' }));
  expect(remove).toHaveBeenCalledTimes(2);
});
it('rechazo y error de registro no guardan token ni anuncian éxito', async () => {
  const plugin = getMobilePlugin('PushNotifications')!;
  (plugin.requestPermissions as jest.Mock).mockResolvedValueOnce({ receive: 'denied' });
  expect(await registerPushToken(id)).toBe(false); expect(upsert).not.toHaveBeenCalled();
  (plugin.register as jest.Mock).mockImplementation(async () => events.registrationError({ error: 'configuración' }));
  expect(await registerPushToken(id)).toBe(false); expect(upsert).not.toHaveBeenCalled(); expect(remove).toHaveBeenCalledTimes(2);
});
it('una sesión que cambió durante el registro no vincula el token a la cuenta anterior', async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'otra-cuenta' } } } });
  expect(await registerPushToken(id)).toBe(false); expect(upsert).not.toHaveBeenCalled();
});
it('logout borra solo el token persistido del usuario actual, sin API getToken', async () => {
  (getMobileStorage as jest.Mock).mockResolvedValue(JSON.stringify({ userId: id, token: 'token-prueba' }));
  const eq = jest.fn(); eq.mockReturnValue({ eq }); eq.mockReturnValueOnce({ eq }).mockReturnValueOnce(Promise.resolve({ error: null }));
  (supabase.from as jest.Mock).mockReturnValue({ delete: () => ({ eq }) });
  await unregisterPushToken(id);
  expect(eq.mock.calls).toEqual([['user_id', id], ['token', 'token-prueba']]);
});
