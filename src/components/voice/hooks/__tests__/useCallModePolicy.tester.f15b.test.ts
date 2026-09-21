/**
 * F5/F15-B — tester adversarial de la caché de `loadCallModePrefs`:
 * por organización (cambio de org sin recarga), TTL, 401/sin sesión sin crash
 * ni cacheo, fetch que lanza, `res.json()` que lanza, y el orden/marcado de
 * `getCallModes` con cada `defaultCallMode`.
 */
const orgRef = { id: 7 };
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => orgRef.id }));
jest.mock('@/lib/services/voice/platformCapabilities', () => ({
  getCapabilities: () => ({ platform: 'electron', webrtc: true, microphone: true, pushNotifications: false, backgroundAudio: true, clipboard: true, nativeDialer: false }),
  queryMicrophonePermission: async () => 'granted',
}));

import { computeCallModeDecision, invalidateCallModePrefs, loadCallModePrefs, microphoneDeniedReason } from '../useCallModePolicy';
import { getCallModes } from '@/components/crm/shared/quickActionsConfig';

const fetchMock = jest.fn();
const ok = (mode: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data: { default_call_mode: mode } }) });

beforeEach(() => {
  invalidateCallModePrefs();
  fetchMock.mockReset();
  orgRef.id = 7;
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
});

describe('caché por organización', () => {
  it('cambiar de organización sin recargar → refetch; volver a la anterior → refetch (no se mezclan)', async () => {
    fetchMock.mockResolvedValueOnce(ok('mobile')).mockResolvedValueOnce(ok('browser')).mockResolvedValueOnce(ok('mobile'));
    expect(await loadCallModePrefs()).toEqual({ default_call_mode: 'mobile' });
    orgRef.id = 8;
    expect(await loadCallModePrefs()).toEqual({ default_call_mode: 'browser' });
    orgRef.id = 7;
    expect(await loadCallModePrefs()).toEqual({ default_call_mode: 'mobile' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('TTL: a los 60 s se vuelve a pedir; antes no', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    fetchMock.mockResolvedValue(ok('mobile'));
    await loadCallModePrefs();
    now.mockReturnValue(1_000_000 + 59_999);
    await loadCallModePrefs();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_000_000 + 60_000);
    await loadCallModePrefs();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('401 (sin sesión) → null, no se cachea, no crashea; la decisión cae al valor de plataforma', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ success: false, error: 'No autenticado' }) });
    expect(await loadCallModePrefs()).toBeNull();
    expect(await loadCallModePrefs()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const d = await computeCallModeDecision();
    expect(d).toEqual({ mode: 'browser', reason: 'platform_default', message: null, settingsHint: null });
  });

  it('tras un 401 no se sirve la preferencia de la sesión anterior una vez vencido el TTL', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(0);
    fetchMock.mockResolvedValueOnce(ok('mobile'));
    expect(await loadCallModePrefs()).toEqual({ default_call_mode: 'mobile' });
    now.mockReturnValue(60_001);
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    expect(await loadCallModePrefs()).toBeNull();
    expect(await loadCallModePrefs()).toBeNull();
    now.mockRestore();
  });

  it('fetch que lanza (offline) o body no JSON → null sin cachear ni lanzar', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await loadCallModePrefs()).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } });
    expect(await loadCallModePrefs()).toEqual({ default_call_mode: null });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => null });
    invalidateCallModePrefs();
    expect(await loadCallModePrefs()).toEqual({ default_call_mode: null });
  });

  it('sin fetch global (SSR/entorno raro) → null sin crash', async () => {
    delete (globalThis as { fetch?: unknown }).fetch;
    await expect(loadCallModePrefs()).resolves.toBeNull();
  });

  it('inflight compartido: 10 tarjetas concurrentes = 1 petición', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    fetchMock.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const ps = Array.from({ length: 10 }, () => loadCallModePrefs());
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(ok('mobile'));
    expect(await Promise.all(ps)).toEqual(Array(10).fill({ default_call_mode: 'mobile' }));
  });
});

describe('microphoneDeniedReason en Electron', () => {
  it('usa la ruta del SO del user agent (Windows aquí), nunca «el navegador»', () => {
    const nav = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/33.4.11' }, configurable: true });
    try {
      expect(microphoneDeniedReason()).toMatch(/^Windows: Configuración/);
      expect(microphoneDeniedReason()).not.toMatch(/navegador/);
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
    }
  });
});

describe('getCallModes — contrato', () => {
  const customer = { email: null, phone: '3001234567' };
  const base = { customer, hasOpportunity: true, hasCustomer: true, softphone: { deviceState: 'registered' } };

  it('defaultCallMode desconocido o null no altera orden ni marca nada', () => {
    for (const dcm of [null, undefined, 'ai' as never, '' as never]) {
      const modes = getCallModes({ ...base, defaultCallMode: dcm });
      expect(modes.map((m) => m.mode)).toEqual(['browser', 'mobile', 'ai']);
      expect(modes.some((m) => m.isDefault)).toBe(false);
    }
  });

  it('exactamente un modo marcado como predeterminado, y solo el pedido', () => {
    for (const dcm of ['browser', 'mobile'] as const) {
      const modes = getCallModes({ ...base, defaultCallMode: dcm });
      expect(modes.filter((m) => m.isDefault).map((m) => m.mode)).toEqual([dcm]);
      expect(modes[0].mode).toBe(dcm);
    }
  });

  it('sin teléfono: ambos deshabilitados aunque uno sea predeterminado; sin softphone: browser deshabilitado', () => {
    const modes = getCallModes({ ...base, customer: { email: null, phone: null }, defaultCallMode: 'mobile' });
    expect(modes[0]).toMatchObject({ mode: 'mobile', isDefault: true, enabled: false });
    expect(modes[1]).toMatchObject({ mode: 'browser', enabled: false });
    const noSp = getCallModes({ ...base, softphone: null, defaultCallMode: 'browser' });
    expect(noSp[0]).toMatchObject({ mode: 'browser', isDefault: true, enabled: false });
    expect(noSp[1]).toMatchObject({ mode: 'mobile', enabled: true });
  });
});
