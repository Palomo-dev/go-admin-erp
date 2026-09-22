/**
 * F5/F15-B — tester adversarial del manejador de permisos de Electron
 * (electron/src/main/permissions.ts). Ataques que la suite del builder no
 * cubre: orígenes parecidos, iframes, listas de media extrañas, esquemas
 * externos con mayúsculas/espacios, `askForMediaAccess` que nunca resuelve.
 */
import {
  decidePermission,
  installPermissionHandlers,
  isOriginAllowed,
  originOf,
  resolveAllowedOrigins,
} from '../../../electron/src/main/permissions';

const ALLOWED = resolveAllowedOrigins('http://localhost:47800', 'https://app.goadmin.io', ['localhost:47800', '127.0.0.1:47800']);
const OK = { originAllowed: true };

type Handlers = {
  request?: (wc: unknown, permission: string, cb: (ok: boolean) => void, details: unknown) => void;
  check?: (wc: unknown, permission: string, origin: string, details: unknown) => boolean;
  device?: (details: unknown) => boolean;
};
function fakeSession(): { session: unknown; h: Handlers } {
  const h: Handlers = {};
  return {
    h,
    session: {
      setPermissionRequestHandler: (fn: Handlers['request']) => { h.request = fn; },
      setPermissionCheckHandler: (fn: Handlers['check']) => { h.check = fn; },
      setDevicePermissionHandler: (fn: Handlers['device']) => { h.device = fn; },
    },
  };
}
const wc = { getURL: () => 'https://app.goadmin.io/app/crm' };

describe('orígenes hostiles', () => {
  it.each([
    'http://localhost',
    'http://localhost:3000',
    'https://localhost:47800',
    'http://127.0.0.1',
    'http://127.0.0.1:47801',
    'https://app.goadmin.io.evil.com',
    'https://evil.com/app.goadmin.io',
    'https://evil.com/?u=https://app.goadmin.io',
    'https://evil.com#https://app.goadmin.io',
    'https://user:pass@evil.com',
    'https://app.goadmin.io@evil.com',
    'https://sub.app.goadmin.io',
    'https://goadmin.io',
    'https://app.goadmin.io:8443',
    'http://app.goadmin.io',
    'file:///C:/Users/x/app.html',
    'about:blank',
    'about:srcdoc',
    'data:text/html,<script>',
    'blob:https://app.goadmin.io/uuid',
    'javascript:alert(1)',
    'chrome-extension://abc/x.html',
    'devtools://devtools/bundled/x.html',
    '',
    '   ',
    'https://',
  ])('rechaza %s', (origin) => {
    expect(isOriginAllowed(origin, ALLOWED)).toBe(false);
  });

  it('acepta el origen exacto con ruta/query/puerto explícito por defecto', () => {
    expect(isOriginAllowed('https://app.goadmin.io:443/x', ALLOWED)).toBe(true);
    expect(isOriginAllowed('HTTPS://APP.GOADMIN.IO/x', ALLOWED)).toBe(true);
    expect(isOriginAllowed('http://LOCALHOST:47800', ALLOWED)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:47800/pos', ALLOWED)).toBe(true);
  });

  it('resolveAllowedOrigins: los hosts locales son entrada INTERNA (webServer.getHosts) y se recortan a origen http', () => {
    // Documenta el contrato: `localHosts` nunca viene del renderer; solo se
    // normaliza (ruta fuera) y se descarta lo que no parsea como host.
    expect(resolveAllowedOrigins('http://localhost:47800', 'https://app.goadmin.io', ['localhost:47800/x', 'no host', ''])).toEqual([
      'http://localhost:47800',
      'https://app.goadmin.io',
    ]);
  });
});

describe('iframes y URLs de petición', () => {
  it('request: un iframe ajeno dentro de la app se deniega aunque el webContents sea la app', () => {
    const { session, h } = fakeSession();
    installPermissionHandlers(session as never, ALLOWED, { platform: 'win32', log: () => {} });
    const r: boolean[] = [];
    h.request!(wc, 'media', (ok) => r.push(ok), { requestingUrl: 'https://evil.example/frame.html', isMainFrame: false, mediaTypes: ['audio'] });
    h.request!(wc, 'geolocation', (ok) => r.push(ok), { requestingUrl: 'https://evil.example/frame.html', isMainFrame: false });
    h.request!(wc, 'notifications', (ok) => r.push(ok), { requestingUrl: 'about:blank', isMainFrame: false });
    h.request!(wc, 'media', (ok) => r.push(ok), { requestingUrl: 'file:///C:/x.html', mediaTypes: ['audio'] });
    expect(r).toEqual([false, false, false, false]);
  });

  it('request: sin requestingUrl y con webContents que lanza o es null → deny (no crash)', () => {
    const { session, h } = fakeSession();
    installPermissionHandlers(session as never, ALLOWED, { platform: 'win32', log: () => {} });
    const r: boolean[] = [];
    h.request!({ getURL: () => { throw new Error('destroyed'); } }, 'notifications', (ok) => r.push(ok), {});
    h.request!(null, 'notifications', (ok) => r.push(ok), {});
    h.request!(undefined, 'notifications', (ok) => r.push(ok), undefined as never);
    expect(r).toEqual([false, false, false]);
  });

  it('check: requestingOrigin manda sobre requestingUrl; details undefined no rompe', () => {
    const { session, h } = fakeSession();
    installPermissionHandlers(session as never, ALLOWED, { platform: 'win32', log: () => {} });
    expect(h.check!(null, 'media', 'https://evil.example', { requestingUrl: 'https://app.goadmin.io/', mediaType: 'audio' })).toBe(false);
    expect(h.check!(null, 'notifications', 'https://app.goadmin.io', undefined)).toBe(true);
    expect(h.check!(null, 'media', 'https://app.goadmin.io', undefined)).toBe(false);
    expect(h.check!(null, 'notifications', '', undefined)).toBe(false);
  });
});

describe('media y openExternal — detalles extraños', () => {
  it('media: display/screen/unknown mezclados, undefined dentro del array, duplicados', () => {
    expect(decidePermission('media', { mediaTypes: ['audio', 'video', 'display'] }, OK)).toBe('deny');
    expect(decidePermission('media', { mediaTypes: ['audio', undefined as never] }, OK)).toBe('deny');
    expect(decidePermission('media', { mediaTypes: ['AUDIO'] }, OK)).toBe('deny');
    expect(decidePermission('media', { mediaTypes: ['audio', 'audio'] }, OK)).toBe('grant');
    expect(decidePermission('media', { mediaTypes: undefined, mediaType: undefined }, OK)).toBe('deny');
    expect(decidePermission('display-capture', { mediaTypes: ['audio'] }, OK)).toBe('deny');
  });

  it('openExternal: MAILTO: mayúsculas se concede (WHATWG normaliza), javascript:, tel con espacios y sin esquema se deniegan', () => {
    expect(decidePermission('openExternal', { externalURL: 'MAILTO:a@b.c' }, OK)).toBe('grant');
    expect(decidePermission('openExternal', { externalURL: 'Tel:+57 300 123 4567' }, OK)).toBe('grant');
    expect(decidePermission('openExternal', { externalURL: 'javascript:alert(1)' }, OK)).toBe('deny');
    expect(decidePermission('openExternal', { externalURL: 'tel: +573001234567' }, OK)).toBe('grant');
    expect(decidePermission('openExternal', { externalURL: ' tel:+573001234567' }, OK)).toBe('grant');
    expect(decidePermission('openExternal', { externalURL: '+573001234567' }, OK)).toBe('deny');
    expect(decidePermission('openExternal', { externalURL: '//evil.com' }, OK)).toBe('deny');
    expect(decidePermission('openExternal', { externalURL: 'mailto' }, OK)).toBe('deny');
    expect(decidePermission('openExternal', { externalURL: 'mailto:' }, OK)).toBe('grant');
    expect(decidePermission('openExternal', { externalURL: 'whatsapp://send?text=hola' }, OK)).toBe('grant');
    expect(decidePermission('openExternal', { externalURL: 'goadmin://x' }, OK)).toBe('deny');
    expect(decidePermission('openExternal', { externalURL: 'ms-settings:privacy-microphone' }, OK)).toBe('deny');
    expect(decidePermission('openExternal', { externalURL: 'smsto:123' }, OK)).toBe('deny');
    expect(decidePermission('openExternal', { externalURL: 'tel:\u0000x' }, OK)).toBe('grant');
  });
});

describe('askForMediaAccess', () => {
  it('nunca se invoca para orígenes denegados ni para vídeo, y un callback bloqueado no bloquea otras peticiones', async () => {
    const { session, h } = fakeSession();
    const ask = jest.fn(() => new Promise<boolean>(() => {})); // nunca resuelve
    installPermissionHandlers(session as never, ALLOWED, { platform: 'darwin', askForMicrophone: ask, log: () => {} });
    const r: boolean[] = [];
    h.request!(wc, 'media', (ok) => r.push(ok), { requestingUrl: 'https://evil.example/', mediaTypes: ['audio'] });
    await Promise.resolve();
    expect(ask).not.toHaveBeenCalled();
    h.request!(wc, 'media', (ok) => r.push(ok), { requestingUrl: 'https://app.goadmin.io/', mediaTypes: ['audio'] });
    await Promise.resolve();
    expect(ask).toHaveBeenCalledTimes(1);
    // El prompt sigue colgado: otra petición (vídeo) no depende de él.
    h.request!(wc, 'media', (ok) => r.push(ok), { requestingUrl: 'https://app.goadmin.io/', mediaTypes: ['video'] });
    h.request!(wc, 'notifications', (ok) => r.push(ok), { requestingUrl: 'https://app.goadmin.io/' });
    expect(r).toEqual([false, true, true]);
  });

  it('askForMicrophone que lanza SÍNCRONAMENTE deniega en vez de reventar el handler', async () => {
    const { session, h } = fakeSession();
    const ask = jest.fn(() => { throw new Error('TCC not available'); });
    installPermissionHandlers(session as never, ALLOWED, { platform: 'darwin', askForMicrophone: ask as never, log: () => {} });
    const r = await new Promise<boolean>((resolve) => {
      expect(() => h.request!(wc, 'media', resolve, { requestingUrl: 'https://app.goadmin.io/', mediaTypes: ['audio'] })).not.toThrow();
    });
    expect(r).toBe(false);
  });

  it('device handler: false para hid/usb/serial aunque el origen sea la app', () => {
    const { session, h } = fakeSession();
    installPermissionHandlers(session as never, ALLOWED, { platform: 'win32', log: () => {} });
    for (const deviceType of ['hid', 'usb', 'serial']) {
      expect(h.device!({ deviceType, origin: 'https://app.goadmin.io', device: {} })).toBe(false);
    }
  });
});

describe('originOf', () => {
  it('normaliza puerto por defecto y mayúsculas; rechaza credenciales embebidas', () => {
    expect(originOf('HTTPS://APP.GOADMIN.IO:443/x')).toBe('https://app.goadmin.io');
    expect(originOf('https://app.goadmin.io@evil.com/')).toBe('https://evil.com');
    expect(originOf('ws://app.goadmin.io')).toBeNull();
  });
});
