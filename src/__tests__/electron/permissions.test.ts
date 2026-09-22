/**
 * F5/F15-B — permisos del WebContents en Go Admin Desktop
 * (electron/src/main/permissions.ts). Matriz permiso × origen × detalles,
 * y el cableado de `installPermissionHandlers` con una `Session` falsa.
 * Sin binario de Electron: el módulo solo importa tipos.
 */
import {
  ALLOWED_EXTERNAL_SCHEMES,
  GRANTED_PERMISSIONS,
  decidePermission,
  installPermissionHandlers,
  isOriginAllowed,
  originOf,
  resolveAllowedOrigins,
} from '../../../electron/src/main/permissions';

const OK = { originAllowed: true };
const NO = { originAllowed: false };

const DENIED_ALWAYS = [
  'midi',
  'midiSysex',
  'usb',
  'hid',
  'serial',
  'pointerLock',
  'keyboardLock',
  'display-capture',
  'idle-detection',
  'mediaKeySystem',
  'clipboard-read',
  'storage-access',
  'top-level-storage-access',
  'window-management',
  'fileSystem',
  'speaker-selection',
  'unknown',
  'deprecated-sync-clipboard-read',
];

describe('decidePermission — lista blanca', () => {
  it.each(['notifications', 'clipboard-sanitized-write', 'fullscreen'])('concede %s al origen permitido', (p) => {
    expect(decidePermission(p, { requestingUrl: 'https://app.goadmin.io/app/crm' }, OK)).toBe('grant');
  });

  it('concede media audio (softphone) y vídeo (escáner) al origen permitido', () => {
    expect(decidePermission('media', { mediaTypes: ['audio'] }, OK)).toBe('grant');
    expect(decidePermission('media', { mediaTypes: ['video'] }, OK)).toBe('grant');
    expect(decidePermission('media', { mediaTypes: ['audio', 'video'] }, OK)).toBe('grant');
    // Forma del check handler (`mediaType` en singular).
    expect(decidePermission('media', { mediaType: 'audio' }, OK)).toBe('grant');
  });

  it('deniega media sin tipos, con tipo desconocido o con un tipo fuera de audio/vídeo', () => {
    expect(decidePermission('media', {}, OK)).toBe('deny');
    expect(decidePermission('media', undefined, OK)).toBe('deny');
    expect(decidePermission('media', { mediaTypes: [] }, OK)).toBe('deny');
    expect(decidePermission('media', { mediaType: 'unknown' }, OK)).toBe('deny');
    expect(decidePermission('media', { mediaTypes: ['audio', 'screen'] }, OK)).toBe('deny');
  });

  it.each(DENIED_ALWAYS)('deniega %s incluso al origen permitido', (p) => {
    expect(decidePermission(p, { requestingUrl: 'https://app.goadmin.io/' }, OK)).toBe('deny');
    expect(GRANTED_PERMISSIONS.has(p)).toBe(false);
  });

  it('openExternal: solo mailto/tel/sms/whatsapp; nunca file, ms-msdt, http ni sin URL', () => {
    for (const scheme of ALLOWED_EXTERNAL_SCHEMES) {
      expect(decidePermission('openExternal', { externalURL: `${scheme}algo` }, OK)).toBe('grant');
    }
    expect(decidePermission('openExternal', { externalURL: 'file:///etc/passwd' }, OK)).toBe('deny');
    expect(decidePermission('openExternal', { externalURL: 'ms-msdt:/id PCWDiagnostic' }, OK)).toBe('deny');
    expect(decidePermission('openExternal', { externalURL: 'https://evil.example' }, OK)).toBe('deny');
    expect(decidePermission('openExternal', { externalURL: 'no es una url' }, OK)).toBe('deny');
    expect(decidePermission('openExternal', {}, OK)).toBe('deny');
  });
});

describe('decidePermission — origen', () => {
  const ALL = [...GRANTED_PERMISSIONS, ...DENIED_ALWAYS];
  it.each(ALL)('deniega %s a un origen no permitido, con cualquier detalle', (p) => {
    const details = { mediaTypes: ['audio'], externalURL: 'mailto:x@y.z', requestingUrl: 'https://evil.example/' };
    expect(decidePermission(p, details, NO)).toBe('deny');
  });
});

describe('orígenes permitidos', () => {
  it('resolveAllowedOrigins: web cargada + remota + hosts locales, sin duplicados ni file:', () => {
    const origins = resolveAllowedOrigins('http://localhost:47800', 'https://app.goadmin.io', ['localhost:47800', '127.0.0.1:47800']);
    expect(origins).toEqual(['http://localhost:47800', 'https://app.goadmin.io', 'http://127.0.0.1:47800']);
    expect(resolveAllowedOrigins('file:///C:/app/index.html', 'https://app.goadmin.io')).toEqual(['https://app.goadmin.io']);
    expect(resolveAllowedOrigins('no-url', 'https://app.goadmin.io', ['???'])).toEqual(['https://app.goadmin.io']);
  });

  it('isOriginAllowed: exacto por esquema+host+puerto; subdominios y http/https no se confunden', () => {
    const allowed = ['https://app.goadmin.io', 'http://localhost:47800'];
    expect(isOriginAllowed('https://app.goadmin.io', allowed)).toBe(true);
    expect(isOriginAllowed('https://app.goadmin.io/app/crm?x=1', allowed)).toBe(true);
    expect(isOriginAllowed('http://app.goadmin.io', allowed)).toBe(false);
    expect(isOriginAllowed('https://evil.app.goadmin.io', allowed)).toBe(false);
    expect(isOriginAllowed('https://app.goadmin.io.evil.example', allowed)).toBe(false);
    expect(isOriginAllowed('http://localhost:3000', allowed)).toBe(false);
    expect(isOriginAllowed('http://localhost:47800/pos', allowed)).toBe(true);
    expect(isOriginAllowed(null, allowed)).toBe(false);
    expect(isOriginAllowed('', allowed)).toBe(false);
    expect(isOriginAllowed('about:blank', allowed)).toBe(false);
  });

  it('originOf: solo http(s)', () => {
    expect(originOf('https://app.goadmin.io/x')).toBe('https://app.goadmin.io');
    expect(originOf('file:///C:/x.html')).toBeNull();
    expect(originOf('about:blank')).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });
});

type Handlers = {
  request?: (wc: unknown, permission: string, cb: (ok: boolean) => void, details: unknown) => void;
  check?: (wc: unknown, permission: string, origin: string, details: unknown) => boolean;
  device?: (details: unknown) => boolean;
};

function fakeSession(): { session: unknown; h: Handlers } {
  const h: Handlers = {};
  const session = {
    setPermissionRequestHandler: (fn: Handlers['request']) => { h.request = fn; },
    setPermissionCheckHandler: (fn: Handlers['check']) => { h.check = fn; },
    setDevicePermissionHandler: (fn: Handlers['device']) => { h.device = fn; },
  };
  return { session, h };
}

const ORIGINS = ['https://app.goadmin.io', 'http://localhost:47800'];
const wc = { getURL: () => 'https://app.goadmin.io/app/crm' };

describe('installPermissionHandlers', () => {
  it('instala los tres handlers y deniega dispositivos (WebHID/USB/Serial) siempre', () => {
    const { session, h } = fakeSession();
    installPermissionHandlers(session as never, ORIGINS, { platform: 'win32', log: () => {} });
    expect(h.request && h.check && h.device).toBeTruthy();
    expect(h.device!({ deviceType: 'hid', origin: 'https://app.goadmin.io' })).toBe(false);
  });

  it('request: micrófono y geolocation concedidos al origen de la web (asistencia); otro origen denegado', () => {
    const { session, h } = fakeSession();
    const log = jest.fn();
    installPermissionHandlers(session as never, () => ORIGINS, { platform: 'win32', log });
    const results: boolean[] = [];
    h.request!(wc, 'media', (ok) => results.push(ok), { requestingUrl: 'https://app.goadmin.io/app/crm', mediaTypes: ['audio'] });
    h.request!(wc, 'geolocation', (ok) => results.push(ok), { requestingUrl: 'https://app.goadmin.io/app/marcar' });
    h.request!(wc, 'media', (ok) => results.push(ok), { requestingUrl: 'https://evil.example/', mediaTypes: ['audio'] });
    // Sin requestingUrl cae a webContents.getURL().
    h.request!(wc, 'notifications', (ok) => results.push(ok), {});
    expect(results).toEqual([true, true, false, true]);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('check: mismo criterio con requestingOrigin (enumerateDevices, Notification.permission)', () => {
    const { session, h } = fakeSession();
    installPermissionHandlers(session as never, ORIGINS, { platform: 'win32', log: () => {} });
    expect(h.check!(null, 'media', 'https://app.goadmin.io', { mediaType: 'audio', isMainFrame: true })).toBe(true);
    expect(h.check!(null, 'media', 'http://localhost:47800', { mediaType: 'video', isMainFrame: true })).toBe(true);
    expect(h.check!(null, 'notifications', 'https://app.goadmin.io', { isMainFrame: true })).toBe(true);
    expect(h.check!(null, 'geolocation', 'https://app.goadmin.io', { isMainFrame: true })).toBe(true);
    expect(h.check!(null, 'geolocation', 'https://evil.example', { isMainFrame: true })).toBe(false);
    expect(h.check!(null, 'media', 'https://evil.example', { mediaType: 'audio', isMainFrame: true })).toBe(false);
    expect(h.check!(null, 'usb', 'https://app.goadmin.io', { isMainFrame: true })).toBe(false);
  });

  it('macOS: media audio pasa por askForMediaAccess y respeta su respuesta; vídeo no lo invoca', async () => {
    const { session, h } = fakeSession();
    const ask = jest.fn<Promise<boolean>, []>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    installPermissionHandlers(session as never, ORIGINS, { platform: 'darwin', askForMicrophone: ask, log: () => {} });
    const first = await new Promise<boolean>((resolve) => h.request!(wc, 'media', resolve, { requestingUrl: 'https://app.goadmin.io/', mediaTypes: ['audio'] }));
    const second = await new Promise<boolean>((resolve) => h.request!(wc, 'media', resolve, { requestingUrl: 'https://app.goadmin.io/', mediaTypes: ['audio'] }));
    const video = await new Promise<boolean>((resolve) => h.request!(wc, 'media', resolve, { requestingUrl: 'https://app.goadmin.io/', mediaTypes: ['video'] }));
    expect([first, second, video]).toEqual([false, true, true]);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('macOS: si askForMediaAccess falla se deniega; en Windows nunca se invoca', async () => {
    const { session, h } = fakeSession();
    const ask = jest.fn<Promise<boolean>, []>().mockRejectedValue(new Error('TCC'));
    installPermissionHandlers(session as never, ORIGINS, { platform: 'darwin', askForMicrophone: ask, log: () => {} });
    const r = await new Promise<boolean>((resolve) => h.request!(wc, 'media', resolve, { requestingUrl: 'https://app.goadmin.io/', mediaTypes: ['audio'] }));
    expect(r).toBe(false);

    const win = fakeSession();
    const askWin = jest.fn<Promise<boolean>, []>().mockResolvedValue(false);
    installPermissionHandlers(win.session as never, ORIGINS, { platform: 'win32', askForMicrophone: askWin, log: () => {} });
    const rw = await new Promise<boolean>((resolve) => win.h.request!(wc, 'media', resolve, { requestingUrl: 'https://app.goadmin.io/', mediaTypes: ['audio'] }));
    expect(rw).toBe(true);
    expect(askWin).not.toHaveBeenCalled();
  });
});
