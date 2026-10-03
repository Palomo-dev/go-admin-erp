/** @jest-environment jsdom */
import { act, render } from '@testing-library/react';
import { SoftphoneProvider, useSoftphoneStrict } from '../SoftphoneProvider';
import type { SoftphoneContextValue } from '../softphoneTypes';
import { UNSUPPORTED_PHONE_CONTROL } from '@/lib/services/crm/phoneConferenceTypes';
const sdkConnect = jest.fn(); const sdkCall = { on: jest.fn(), parameters: { CallSid: `CA${'1'.repeat(32)}` }, removeAllListeners: jest.fn() };
jest.mock('../hooks/useTwilioDevice', () => ({ useTwilioDevice: () => ({ deviceRef: { current: { connect: sdkConnect } }, deviceState: 'registered', retry: jest.fn() }), describeDeviceError: () => ({ reason: 'Error' }) }));
jest.mock('../hooks/useCallRealtime', () => ({ useCallRealtime: () => ({ callId: null, row: null }) }));
jest.mock('../hooks/useAudioDevices', () => ({ useAudioDevices: () => ({}) }));
jest.mock('../hooks/useCallModePolicy', () => ({ microphoneDeniedReason: () => '' }));
jest.mock('../hooks/useDesktopPhoneController', () => ({ useDesktopPhoneController: jest.fn() }));
jest.mock('../hooks/usePhoneShortcuts', () => ({ usePhoneShortcuts: jest.fn() }));
jest.mock('../hooks/usePhoneConference', () => ({ usePhoneConference: () => ({ state: UNSUPPORTED_PHONE_CONTROL, call: null }) }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));
let phone: SoftphoneContextValue;
function Read() { phone = useSoftphoneStrict(); return null; }
const oldFetch = global.fetch;
beforeEach(() => { jest.clearAllMocks(); sdkConnect.mockResolvedValue(sdkCall); });
afterEach(() => { global.fetch = oldFetch; });
it('dos clics mientras precheck espera producen una sola llamada real al Device', async () => {
  let accept!: (value: Response) => void;
  const fetchMock = jest.fn(() => new Promise<Response>((resolve) => { accept = resolve; })); global.fetch = fetchMock;
  render(<SoftphoneProvider organizationId={7}><Read /></SoftphoneProvider>);
  let first!: ReturnType<SoftphoneContextValue['makeCall']>;
  await act(async () => { first = phone.makeCall('+573001234567'); });
  let second: Awaited<ReturnType<SoftphoneContextValue['makeCall']>> | undefined;
  await act(async () => { second = await phone.makeCall('+573001234567'); });
  expect(second).toMatchObject({ ok: false, reason: 'busy' }); expect(fetchMock).toHaveBeenCalledTimes(1); expect(sdkConnect).not.toHaveBeenCalled();
  await act(async () => { accept({ ok: true, json: async () => ({ data: { allowed: true } }) } as Response); await first; });
  expect(sdkConnect).toHaveBeenCalledTimes(1);
});
it('bloqueo legal no conecta Device; el siguiente intento puede pasar después de resolver', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: { allowed: false, code: 'fuera_horario' } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { allowed: true } }) });
  render(<SoftphoneProvider organizationId={7}><Read /></SoftphoneProvider>);
  await act(async () => { const result = await phone.makeCall('+573001234567'); expect(result.ok).toBe(false); });
  expect(sdkConnect).not.toHaveBeenCalled();
  await act(async () => { await phone.makeCall('+573001234567'); });
  expect(sdkConnect).toHaveBeenCalledTimes(1);
});

it('una respuesta de precheck de la organización anterior no abre el aviso ni conecta', async () => {
  let resolve!: (value: Response) => void;
  global.fetch = jest.fn(() => new Promise<Response>(done => { resolve = done; }));
  const view = render(<SoftphoneProvider organizationId={7}><Read /></SoftphoneProvider>);
  let pending!: ReturnType<SoftphoneContextValue['makeCall']>;
  await act(async () => { pending = phone.makeCall('+12025550197'); });
  view.rerender(<SoftphoneProvider organizationId={8}><Read /></SoftphoneProvider>);
  await act(async () => { resolve({ ok: true, json: async () => ({ data: { allowed: false, code: 'fuera_horario', nextAt: '2026-10-03T15:00:00Z', timezone: 'America/Bogota' } }) } as Response); await pending; });
  expect(phone.blockedCall).toBeNull();
  expect(sdkConnect).not.toHaveBeenCalled();
});
