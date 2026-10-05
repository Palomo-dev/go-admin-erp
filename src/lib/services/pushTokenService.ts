/** Registro Capacitor real: el token llega por registration, no por getToken(). */
import { supabase } from '@/lib/supabase/config';
import { isMobile } from '@/lib/utils/mobile';
import { requestNativePushToken } from '@/lib/utils/mobilePushRegistration';
import { getMobileStorage, setMobileStorage, removeMobileStorage } from '@/lib/utils/mobileStorage';

const TOKEN_KEY = 'goAdminPushRegistration';
const registrations = new Map<string, Promise<boolean>>();
interface Registration { userId: string; token: string }
async function cachedRegistration(): Promise<Registration | null> {
  try {
    const raw = await getMobileStorage(TOKEN_KEY); if (!raw) return null;
    const parsed = JSON.parse(raw) as Registration;
    return typeof parsed.userId === 'string' && typeof parsed.token === 'string' ? parsed : null;
  } catch { return null; }
}

async function register(userId: string, appVersion?: string): Promise<boolean> {
  try {
    const registration = await requestNativePushToken(); if (!registration) return false;
    const { token, platform } = registration;
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.id !== userId) return false;
    const saved = await supabase.from('device_push_tokens').upsert({
      user_id: userId, platform, token,
      app_version: appVersion ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,token' });
    if (saved.error) throw saved.error;
    await setMobileStorage(TOKEN_KEY, JSON.stringify({ userId, token }));
    return true;
  } catch (error) {
    console.warn('[pushToken] No se pudo registrar el dispositivo:', error instanceof Error ? error.message : 'error');
    return false;
  }
}

export async function registerPushToken(userId: string, appVersion?: string): Promise<boolean> {
  if (!isMobile() || !userId) return false;
  const current = registrations.get(userId); if (current) return current;
  const task = register(userId, appVersion).finally(() => registrations.delete(userId));
  registrations.set(userId, task); return task;
}

/** Antes de cerrar sesión, elimina solamente el token de este dispositivo. */
export async function unregisterPushToken(userId: string): Promise<void> {
  if (!isMobile() || !userId) return;
  const stored = await cachedRegistration();
  if (!stored || stored.userId !== userId) return;
  const result = await supabase.from('device_push_tokens').delete().eq('user_id', userId).eq('token', stored.token);
  if (result.error) throw result.error;
  await removeMobileStorage(TOKEN_KEY);
}

export async function removeAllUserTokens(userId: string): Promise<void> {
  if (!userId) return;
  const result = await supabase.from('device_push_tokens').delete().eq('user_id', userId);
  if (result.error) throw result.error;
}

/** Limpieza acotada antes de invalidar sesión; un fallo de red no atrapa el logout. */
export async function cleanupPushTokenBeforeLogout(): Promise<void> {
  if (!isMobile()) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const cleanup = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.id) await unregisterPushToken(data.session.user.id);
    };
    await Promise.race([cleanup(), new Promise<void>(resolve => { timer = setTimeout(resolve, 1500); })]);
  } catch { console.warn('[pushToken] No se pudo revocar el token antes de salir'); }
  finally { if (timer) clearTimeout(timer); }
}
