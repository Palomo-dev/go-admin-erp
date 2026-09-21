/**
 * F5/F15-B — el modo por defecto llega al menú «Llamar» (getCallModes) y la
 * preferencia se lee una sola vez por TTL (loadCallModePrefs).
 */
import { getCallModes } from '../quickActionsConfig';
import { computeCallModeDecision, invalidateCallModePrefs, loadCallModePrefs } from '@/components/voice/hooks/useCallModePolicy';

jest.mock('@/lib/services/voice/platformCapabilities', () => ({
  getCapabilities: () => ({ platform: 'capacitor-ios', webrtc: false, microphone: true, pushNotifications: false, backgroundAudio: false, clipboard: true, nativeDialer: true }),
  queryMicrophonePermission: async () => 'prompt',
}));

const customer = { email: null, phone: '3001234567' };
const base = { customer, hasOpportunity: true, hasCustomer: true, softphone: { deviceState: 'registered' } };

describe('getCallModes con defaultCallMode', () => {
  it('sin modo por defecto: orden histórico (navegador, celular, IA) y sin isDefault', () => {
    const modes = getCallModes(base);
    expect(modes.map((m) => m.mode)).toEqual(['browser', 'mobile', 'ai']);
    expect(modes.some((m) => m.isDefault)).toBe(false);
  });

  it('mobile por defecto (Capacitor / teléfono / preferencia): «Desde mi celular» primero y marcado', () => {
    const modes = getCallModes({ ...base, defaultCallMode: 'mobile' });
    expect(modes.map((m) => m.mode)).toEqual(['mobile', 'browser', 'ai']);
    expect(modes[0].isDefault).toBe(true);
    expect(modes[1].isDefault).toBeUndefined();
  });

  it('browser por defecto (escritorio): navegador primero y marcado; habilitación intacta', () => {
    const modes = getCallModes({ ...base, defaultCallMode: 'browser', softphone: { deviceState: 'registering' } });
    expect(modes[0]).toMatchObject({ mode: 'browser', isDefault: true, enabled: false });
    expect(modes[1]).toMatchObject({ mode: 'mobile', enabled: true });
  });
});

describe('loadCallModePrefs / computeCallModeDecision', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    invalidateCallModePrefs();
    fetchMock.mockReset();
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
  });

  it('lee GET /api/crm/me/comm-preferences una vez y cachea; valores raros → null', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { default_call_mode: 'browser' } }) });
    const [a, b] = await Promise.all([loadCallModePrefs(), loadCallModePrefs()]);
    expect(a).toEqual({ default_call_mode: 'browser' });
    expect(b).toEqual(a);
    await loadCallModePrefs();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/crm/me/comm-preferences');

    invalidateCallModePrefs();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { default_call_mode: 'ai' } }) });
    expect(await loadCallModePrefs()).toEqual({ default_call_mode: null });
  });

  it('API caída → null sin cachear (se reintenta) y la decisión cae al valor por plataforma', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await loadCallModePrefs()).toBeNull();
    expect(await loadCallModePrefs()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const d = await computeCallModeDecision();
    expect(d.mode).toBe('mobile');
    expect(d.reason).toBe('no_webrtc');
  });

  it('preferencia browser en Capacitor: se respeta la plataforma (sin WebRTC → mobile) y se explica', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { default_call_mode: 'browser' } }) });
    const d = await computeCallModeDecision();
    expect(d).toMatchObject({ mode: 'mobile', reason: 'no_webrtc' });
    expect(d.message).toMatch(/app móvil/);
  });
});
