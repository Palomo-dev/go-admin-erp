/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useDesktopPhoneController } from '../hooks/useDesktopPhoneController';
import { OPEN_SOFTPHONE_EVENT } from '../softphoneUi';
import type { SoftphoneValue } from '../softphoneTypes';
import type { PhoneSnapshot } from '../../../../electron/src/shared/phoneProtocol';
const mockPush = jest.fn(); const mockRouter = { push: mockPush };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
const mockBridge = { publish: jest.fn(), reply: jest.fn(), missed: jest.fn(), onCommand: jest.fn(), onMissedAction: jest.fn() };
jest.mock('@/lib/utils/desktop', () => ({ getDesktopBridge: () => ({ phone: mockBridge }) }));
let command: (raw: unknown) => Promise<void>; let missedAction: (raw: unknown) => void;
const phoneControl = { supported: true, phase: 'ready', held: false, heldAt: null, holdSeconds: 0, busy: false, error: null, transfer: null };
const makeCall = jest.fn(), setHold = jest.fn(), mute = jest.fn(), sendDigits = jest.fn();
function value(extra={}) { return { available: true, deviceState: 'registered', deviceReason: null, callStatus: 'idle', activeCall: null, activeCallRow: null, hasIncoming: false, muted: false, makeCall, setHold, mute, sendDigits, phoneControl, ...extra } as unknown as SoftphoneValue; }
function latest() { return mockBridge.publish.mock.calls.at(-1)?.[0] as PhoneSnapshot; }
const wrapper = ({ children }: { children: React.ReactNode }) => <NextIntlClientProvider locale="es" messages={{}}>{children}</NextIntlClientProvider>;
beforeEach(() => {
  jest.clearAllMocks(); mockBridge.onCommand.mockImplementation(handler => { command=handler; return jest.fn(); }); mockBridge.onMissedAction.mockImplementation(handler => { missedAction=handler; return jest.fn(); });
  makeCall.mockResolvedValue({ ok: false, message: 'Conexión fallida' });
  Object.defineProperty(global.crypto, 'randomUUID', { configurable: true, value: jest.fn().mockReturnValueOnce('11111111-1111-4111-8111-111111111111').mockReturnValue('22222222-2222-4222-8222-222222222222') });
});
it('el controlador espera el proveedor y devuelve fracaso real sin dial duplicado', async () => {
  renderHook(() => useDesktopPhoneController(value(), 1), { wrapper }); const s=latest();
  await act(async () => { await command({ id: crypto.randomUUID(), scope:s.scope, revision:s.revision, action:'dial', value:'+573001234567' }); });
  expect(makeCall).toHaveBeenCalledTimes(1); expect(mockBridge.reply).toHaveBeenCalledWith(expect.objectContaining({ scope:s.scope, ok:false, error:'Conexión fallida' }));
});
it('hold espera confirmación real y un estado held bloquea mute y DTMF', async () => {
  const connected=value({ callStatus:'connected', activeCall:{ number:'+573001234567', displayName:null, connectedAt:1 } });
  const v=renderHook(({ sp }) => useDesktopPhoneController(sp, 1), { wrapper, initialProps:{ sp:connected } }); const s=latest();
  let finish: (v: unknown) => void = () => {}; setHold.mockImplementation(() => new Promise(resolve => { finish=resolve; }));
  let pending: Promise<void>;
  act(() => { pending=command({ id:crypto.randomUUID(),scope:s.scope,revision:s.revision,action:'hold',value:true }); });
  expect(mockBridge.reply).not.toHaveBeenCalled();
  await act(async () => { finish({ ok:true,state:{ ...phoneControl,phase:'held',held:true,heldAt:1 } }); await pending; });
  expect(mockBridge.reply).toHaveBeenCalledWith(expect.objectContaining({ ok:true,control:expect.objectContaining({ held:true }) }));
  v.rerender({ sp:value({ ...connected, phoneControl:{ ...phoneControl, held:true } }) }); const held=latest();
  await act(async () => { await command({ id:crypto.randomUUID(),scope:held.scope,revision:held.revision,action:'digits',value:'1' }); await command({ id:crypto.randomUUID(),scope:held.scope,revision:held.revision,action:'mute',value:true }); });
  expect(mute).not.toHaveBeenCalled(); expect(sendDigits).not.toHaveBeenCalled();
});
it('pérdidas y sus CTAs solo prellenan y respetan el scope activo', () => {
  const listener=jest.fn(); window.addEventListener(OPEN_SOFTPHONE_EVENT,listener);
  const { rerender,unmount }=renderHook(({ org }) => useDesktopPhoneController(value(),org),{ wrapper,initialProps:{ org:1 } }); const s=latest();
  act(() => window.dispatchEvent(new CustomEvent('go-admin:phone-missed',{ detail:{ number:'+57 3001234567',displayName:'Contacto' } })));
  expect(mockBridge.missed).toHaveBeenCalledWith(expect.objectContaining({ scope:s.scope,number:'+573001234567' }));
  act(() => missedAction({ scope:s.scope,number:'+573001234567',action:'callback' }));
  expect(listener.mock.calls[0][0].detail).toEqual({ number:'+573001234567' }); expect(makeCall).not.toHaveBeenCalled();
  act(() => missedAction({ scope:s.scope,number:'+573001234567',action:'create_lead' }));
  expect(mockPush).toHaveBeenCalledWith('/app/crm/leads?create=1&phone=%2B573001234567');
  const old=missedAction; mockPush.mockClear(); rerender({ org:2 }); act(() => old({ scope:s.scope,number:'+573001234567',action:'create_lead' })); expect(mockPush).not.toHaveBeenCalled();
  unmount(); expect(mockBridge.publish).toHaveBeenLastCalledWith(null); window.removeEventListener(OPEN_SOFTPHONE_EVENT,listener);
});
it('durante consulta permite hablar con el destino y mantiene DTMF bloqueado', async () => {
  renderHook(()=>useDesktopPhoneController(value({ callStatus:'connected', activeCall:{number:'+573001234567',displayName:null,connectedAt:1}, phoneControl:{...phoneControl,held:true,phase:'consulting'} }),1),{wrapper}); const s=latest();
  await act(async()=>{await command({id:crypto.randomUUID(),scope:s.scope,revision:s.revision,action:'mute',value:true});await command({id:crypto.randomUUID(),scope:s.scope,revision:s.revision,action:'digits',value:'1'});});
  expect(mute).toHaveBeenCalledWith(true);expect(sendDigits).not.toHaveBeenCalled();
});

it('notas y timbre siguen al Device dueño; una nota ajena o el Device desconectado se rechazan', async () => {
  const setLiveNote = jest.fn(), setRingtoneMuted = jest.fn();
  const connected = value({ callStatus: 'connected', activeCall: { number: '+573001234567', displayName: 'Contacto', connectedAt: 1 }, activeCallRow: { id: 'call-a', can_edit_notes: true }, liveNote: '', setLiveNote, setRingtoneMuted });
  const rendered = renderHook(({ sp }) => useDesktopPhoneController(sp, 1), { wrapper, initialProps: { sp: connected } }); let s = latest();
  await act(async () => { await command({ id: crypto.randomUUID(), scope: s.scope, revision: s.revision, action: 'note', value: 'Nota real' }); await command({ id: crypto.randomUUID(), scope: s.scope, revision: s.revision, action: 'ringtone', value: true }); });
  expect(setLiveNote).toHaveBeenCalledWith('Nota real'); expect(setRingtoneMuted).toHaveBeenCalledWith(true);
  setLiveNote.mockClear(); setRingtoneMuted.mockClear(); rendered.rerender({ sp: value({ ...connected, deviceState: 'unregistered', activeCallRow: { id: 'call-a', can_edit_notes: false } }) }); s = latest();
  await act(async () => { await command({ id: crypto.randomUUID(), scope: s.scope, revision: s.revision, action: 'note', value: 'No permitido' }); await command({ id: crypto.randomUUID(), scope: s.scope, revision: s.revision, action: 'ringtone', value: false }); });
  expect(setLiveNote).not.toHaveBeenCalled(); expect(setRingtoneMuted).not.toHaveBeenCalled();
});
it('REC requiere confirmación de inicio además de autorización', () => {
  const rendered = renderHook(({ row }) => useDesktopPhoneController(value({ activeCallRow: row }), 1), { wrapper, initialProps: { row: { recording_enabled: true, consent_given: true, recording_started: false } } });
  expect(latest().recording).toBe(false); rendered.rerender({ row: { recording_enabled: true, consent_given: true, recording_started: true } }); expect(latest().recording).toBe(true);
  rendered.rerender({ row: { recording_enabled: true, consent_given: false, recording_started: true } }); expect(latest().recording).toBe(false);
});
