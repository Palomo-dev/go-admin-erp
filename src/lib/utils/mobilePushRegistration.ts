import { getMobilePlugin, isMobile, isIOS, safeAddListener, type MobilePluginListenerHandle, type MobilePushToken } from './mobile';

let registering: Promise<MobilePushToken | null> | null = null;
async function requestToken(): Promise<MobilePushToken | null> {
  const push = getMobilePlugin('PushNotifications');
  if (!push?.requestPermissions || !push.register || !push.addListener) return null;
  const handles: MobilePluginListenerHandle[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if ((await push.requestPermissions()).receive !== 'granted') return null;
    let finish: (token: string | null) => void = () => undefined;
    const result = new Promise<string | null>(resolve => { finish = resolve; });
    const success = await safeAddListener(push, 'registration', payload => {
      const token = payload && typeof payload === 'object' ? (payload as { value?: unknown }).value : null;
      finish(typeof token === 'string' && token.length > 0 && token.length <= 4096 ? token : null);
    });
    if (!success) return null;
    handles.push(success);
    const failure = await safeAddListener(push, 'registrationError', () => finish(null));
    if (failure) handles.push(failure);
    timer = setTimeout(() => finish(null), 12000);
    // Ambos listeners existen antes de register, incluso si el evento llega síncronamente.
    void push.register().catch(() => finish(null));
    const token = await result;
    return token ? { token, platform: isIOS() ? 'ios' : 'android' } : null;
  } catch { return null; }
  finally {
    if (timer) clearTimeout(timer);
    await Promise.allSettled(handles.map(handle => handle.remove()));
  }
}
/** Contrato estándar de Capacitor; compartido por el hook y el escritor de tokens. */
export async function requestNativePushToken(): Promise<MobilePushToken | null> {
  if (!isMobile()) return null;
  if (!registering) registering = requestToken().finally(() => { registering = null; });
  return registering;
}
