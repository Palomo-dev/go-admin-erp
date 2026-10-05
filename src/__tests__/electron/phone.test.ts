const mockNotifications: { options: Record<string, unknown>; events: Record<string, (...args: unknown[]) => void> }[] = [];
jest.mock('electron', () => ({ ipcMain: { handle: jest.fn(), on: jest.fn() }, Notification: Object.assign(jest.fn().mockImplementation((options) => {
  const events: Record<string, (...args: unknown[]) => void> = {}; mockNotifications.push({ options, events });
  return { on: (name: string, handler: (...args: unknown[]) => void) => { events[name] = handler; }, show: jest.fn() };
}), { isSupported: jest.fn(() => false) }) }), { virtual: true });
const owner = {
  mainFrame: {}, getURL: () => 'https://app.example/app/crm', isDestroyed: () => false,
  send: jest.fn(), on: jest.fn(), once: jest.fn(),
};
const mirror = { mainFrame: {}, getURL: () => 'https://app.example/telefono', send: jest.fn() };
jest.mock('../../../electron/src/main/windows/mainWindow', () => ({
  getWebContents: () => owner, getMainWindow: () => ({ show: jest.fn(), focus: jest.fn() }),
  getLoadUrl: () => 'https://app.example', isInternalUrl: (url: string) => url.startsWith('https://app.example/'),
}));
jest.mock('../../../electron/src/main/windows/phoneWindow', () => ({
  getPhoneWindow: () => ({ webContents: mirror, setAlwaysOnTop: jest.fn(), minimize: jest.fn() }),
  openPhoneWindow: jest.fn().mockResolvedValue(true), closePhoneWindow: jest.fn(), resizePhoneWindow: jest.fn(),
}));

jest.mock('../../../electron/src/main/icon', () => ({ getIconImage: () => undefined }));

import { clearPhoneController, getPhoneSnapshot, registerPhoneIpc, attachPhoneControllerLifecycle } from '../../../electron/src/main/phoneIpc';
import { parsePhoneCommand, parsePhoneSnapshot, type PhoneSnapshot } from '../../../electron/src/shared/phoneProtocol';
const scope = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const state: PhoneSnapshot = { scope, revision: 1, organizationId: 1, deviceState: 'registered', reason: null,
  callStatus: 'idle', call: null, incoming: false, muted: false, recording: false };
const cmd = { id, scope, revision: 1, action: 'dial' as const, value: '+573000000000' };
const ownEvent = () => ({ sender: owner, senderFrame: owner.mainFrame });
const mirrorEvent = () => ({ sender: mirror, senderFrame: mirror.mainFrame });
type Handler = (...args: unknown[]) => unknown;
let handlers: Record<string, Handler>; let listeners: Record<string, Handler>;
beforeEach(() => {
  clearPhoneController(); jest.clearAllMocks(); mockNotifications.length = 0; jest.requireMock('electron').Notification.isSupported.mockReturnValue(false); registerPhoneIpc();
  const { ipcMain } = jest.requireMock('electron') as { ipcMain: { handle: jest.Mock; on: jest.Mock } };
  handlers = Object.fromEntries(ipcMain.handle.mock.calls); listeners = Object.fromEntries(ipcMain.on.mock.calls);
});

it('transferencia rechaza destinos privados, números falsos y respuestas con secretos', async () => {
  expect(() => parsePhoneCommand({ ...cmd, action: 'transfer', value: { mode: 'direct', target: { number: '123' } } })).toThrow();
  expect(() => parsePhoneCommand({ ...cmd, action: 'transfer', value: { mode: 'consult', target: { userId: id, callSid: 'privada' } } })).toThrow();
  listeners['phone:publish'](ownEvent(), state);
  const promise = handlers['phone:command'](mirrorEvent(), { ...cmd, action: 'hold', value: true });
  const control = { supported: true, phase: 'held', held: true, heldAt: 1, holdSeconds: 2, busy: false, error: null, transfer: null };
  listeners['phone:reply'](ownEvent(), { id, scope, ok: true, control: { ...control, conferenceSid: 'secreto' } });
  listeners['phone:reply'](ownEvent(), { id, scope: '33333333-3333-4333-8333-333333333333', ok: true, control });
  expect(await handlers['phone:command'](mirrorEvent(), { ...cmd, id: scope })).toMatchObject({ error: 'accion_en_curso' });
  listeners['phone:reply'](ownEvent(), { id, scope, ok: true, control });
  await expect(promise).resolves.toEqual({ id, ok: true, control });
});

it.each([['es', 'Llamada perdida'], ['en', 'Missed call'], ['fr', 'Appel manqué'], ['pt', 'Chamada perdida']])('la notificación de pérdida usa idioma %s, deduplica y solo despacha contexto', (locale, title) => {
  jest.requireMock('electron').Notification.isSupported.mockReturnValue(true);
  listeners['phone:publish'](ownEvent(), { ...state, locale });
  const notice = { id, scope, number: '+573001234567', displayName: 'Contacto de prueba' };
  listeners['phone:missed'](mirrorEvent(), notice);
  listeners['phone:missed'](ownEvent(), { ...notice, token: 'secreto' });
  expect(mockNotifications).toHaveLength(0);
  listeners['phone:missed'](ownEvent(), notice); listeners['phone:missed'](ownEvent(), notice);
  expect(mockNotifications).toHaveLength(1); expect(mockNotifications[0].options.title).toBe(`${title} · ${notice.displayName}`);
  expect(getPhoneSnapshot()?.missed).toEqual(notice);
  mockNotifications[0].events.action({}, 1);
  expect(owner.send).toHaveBeenCalledWith('phone:missed-action', { id, scope, number: notice.number, action: 'create_lead' });
  expect(owner.send).not.toHaveBeenCalledWith('phone:dispatch', expect.anything());
  owner.send.mockClear(); listeners['phone:publish'](ownEvent(), { ...state, scope: '33333333-3333-4333-8333-333333333333', organizationId: 2 });
  mockNotifications[0].events.action({}, 0); expect(owner.send).not.toHaveBeenCalled();
});
afterEach(() => { clearPhoneController(); jest.useRealTimers(); });

it('una pestaña del mismo origen y un iframe no pueden publicar ni controlar el teléfono', async () => {
  listeners['phone:publish']({ ...ownEvent(), sender: { ...owner } }, state);
  listeners['phone:publish']({ ...ownEvent(), senderFrame: {} }, state);
  listeners['phone:publish'](mirrorEvent(), state);
  expect(getPhoneSnapshot()).toBeNull();
  await expect(handlers['phone:command'](ownEvent(), cmd)).rejects.toThrow('sin_permiso');
  await expect(handlers['phone:command']({ ...mirrorEvent(), senderFrame: {} }, cmd)).rejects.toThrow('sin_permiso');
  expect(owner.send).not.toHaveBeenCalled();
});

it('rechaza tokens, metadatos, destinos extensos, payloads extra y scopes sin UUID en el IPC', () => {
  expect(() => parsePhoneSnapshot({ ...state, token: 'secreto' })).toThrow();
  expect(() => parsePhoneSnapshot({ ...state, call: { number: '1', displayName: null, connectedAt: null, metadata: {} } })).toThrow();
  expect(() => parsePhoneCommand({ ...cmd, value: '1'.repeat(41) })).toThrow();
  expect(() => parsePhoneCommand({ ...cmd, organization_id: 2 })).toThrow();
  expect(() => parsePhoneCommand({ ...cmd, scope: 'ajeno' })).toThrow();
  expect(() => parsePhoneCommand({ ...cmd, action: 'hangup', value: 'x' })).toThrow();
});

it('envía solo al controlador y devuelve su resultado real; un espejo no puede falsificarlo', async () => {
  listeners['phone:publish'](ownEvent(), state);
  expect(mirror.send).toHaveBeenCalledWith('phone:state', state);
  expect(owner.send).not.toHaveBeenCalledWith('phone:state', expect.anything());
  const promise = handlers['phone:command'](mirrorEvent(), cmd);
  expect(owner.send).toHaveBeenCalledTimes(1);
  expect(owner.send).toHaveBeenCalledWith('phone:dispatch', cmd);
  listeners['phone:reply'](mirrorEvent(), { id, scope, ok: true });
  expect(await handlers['phone:command'](mirrorEvent(), { ...cmd, id: scope })).toMatchObject({ ok: false, error: 'accion_en_curso' });
  listeners['phone:reply'](ownEvent(), { id, scope, ok: false, error: 'Proveedor no disponible' });
  await expect(promise).resolves.toEqual({ id, ok: false, error: 'Proveedor no disponible' });
  expect(await handlers['phone:command'](mirrorEvent(), cmd)).toEqual({ id, ok: false, error: 'Proveedor no disponible' });
  expect(owner.send).toHaveBeenCalledTimes(1);
  expect(await handlers['phone:command'](mirrorEvent(), { ...cmd, value: '+573000000001' })).toMatchObject({ error: 'clave_reutilizada' });
});

it('un cambio de organización invalida comandos pendientes y estados antiguos', async () => {
  listeners['phone:publish'](ownEvent(), state);
  const pending = handlers['phone:command'](mirrorEvent(), cmd);
  listeners['phone:publish'](ownEvent(), { ...state, organizationId: 2, scope: '33333333-3333-4333-8333-333333333333' });
  await expect(pending).resolves.toMatchObject({ ok: false, error: 'controlador_desconectado' });
  expect(await handlers['phone:command'](mirrorEvent(), cmd)).toMatchObject({ error: 'estado_desactualizado' });
  listeners['phone:reply'](ownEvent(), { id, scope, ok: true });
  expect(getPhoneSnapshot()?.organizationId).toBe(2);
});

it('agota un comando sin afirmar éxito y no reenvía un reintento con la misma clave', async () => {
  jest.useFakeTimers(); listeners['phone:publish'](ownEvent(), state);
  const result = handlers['phone:command'](mirrorEvent(), cmd);
  jest.advanceTimersByTime(10000);
  await expect(result).resolves.toMatchObject({ ok: false, error: 'sin_respuesta' });
  expect(await handlers['phone:command'](mirrorEvent(), cmd)).toMatchObject({ error: 'sin_respuesta' });
  expect(owner.send).toHaveBeenCalledTimes(1);
});

it('recargar la vista propietaria limpia identidad y estado del espejo', () => {
  listeners['phone:publish'](ownEvent(), state); attachPhoneControllerLifecycle();
  const callback = owner.on.mock.calls.find(([event]) => event === 'did-start-navigation')?.[1];
  callback({}, 'https://app.example/login', false, true);
  expect(getPhoneSnapshot()).toBeNull();
  expect(mirror.send).toHaveBeenLastCalledWith('phone:state', null);
});

it('notificación entrante nativa identifica el número y despacha respuesta sólo al owner actual', async () => {
  jest.requireMock('electron').Notification.isSupported.mockReturnValue(true);
  const incoming: PhoneSnapshot = { ...state, locale: 'es', callStatus: 'ringing', incoming: true, call: { number: '+573001234567', displayName: 'Contacto de prueba', connectedAt: null } };
  listeners['phone:publish'](ownEvent(), incoming);
  expect(mockNotifications).toHaveLength(1);
  expect(mockNotifications[0].options).toMatchObject({ title: 'Llamada entrante · Contacto de prueba', body: '+573001234567', actions: [{ type: 'button', text: 'Contestar' }, { type: 'button', text: 'Rechazar' }] });
  mockNotifications[0].events.action({}, 0);
  const dispatched = owner.send.mock.calls.find(([event]) => event === 'phone:dispatch')?.[1];
  expect(dispatched).toMatchObject({ scope, revision: 1, action: 'accept' });
  listeners['phone:reply'](ownEvent(), { id: dispatched.id, scope, ok: true }); await Promise.resolve();
  owner.send.mockClear(); listeners['phone:publish'](ownEvent(), { ...incoming, revision: 2, incoming: false });
  mockNotifications[0].events.action({}, 1); expect(owner.send).not.toHaveBeenCalledWith('phone:dispatch', expect.anything());
});
it('contrato de nota y timbre rechaza datos extra y nunca expone tokens en la presentación', () => {
  expect(parsePhoneCommand({ ...cmd, action: 'note', value: 'Nota en vivo' })).toMatchObject({ action: 'note' });
  expect(parsePhoneCommand({ ...cmd, action: 'ringtone', value: true })).toMatchObject({ action: 'ringtone', value: true });
  expect(() => parsePhoneCommand({ ...cmd, action: 'note', value: 'x'.repeat(10001) })).toThrow();
  expect(() => parsePhoneCommand({ ...cmd, action: 'ringtone', value: 'true' })).toThrow();
  expect(() => parsePhoneSnapshot({ ...state, presentation: { inputLabel: 'Micrófono', liveNote: '', canEditNote: true, token: 'secreto' } })).toThrow();
});
