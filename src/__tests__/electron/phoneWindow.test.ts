interface MockWindow { options: Record<string, unknown>; destroyed: boolean; width: number; isDestroyed: () => boolean; getSize: () => number[]; setSize: jest.Mock; show: jest.Mock; focus: jest.Mock; once: jest.Mock; on: (name: string, handler: () => void) => void; loadURL: jest.Mock; close: () => void; webContents: { setWindowOpenHandler: jest.Mock; on: jest.Mock } }
const mockWindows: MockWindow[] = [];
let mockSnapshot: { deviceState: string; callStatus: string } | null = { deviceState: 'registered', callStatus: 'idle' };
const mockOwner = { isDestroyed: () => false, getURL: () => 'https://app.example/app/crm', session: { id: 'same-session' } };
const mockMain = { once: jest.fn(), removeListener: jest.fn() };
jest.mock('electron', () => ({ BrowserWindow: jest.fn().mockImplementation((options) => {
  const handlers: Record<string, () => void> = {}; const win: MockWindow = { options, destroyed: false, width: 380, isDestroyed: () => win.destroyed, getSize: () => [win.width, 621], setSize: jest.fn(), show: jest.fn(), focus: jest.fn(), once: jest.fn(), on: (name: string, handler: () => void) => { handlers[name] = handler; }, loadURL: jest.fn().mockResolvedValue(undefined), close: () => { win.destroyed = true; handlers.closed?.(); }, webContents: { setWindowOpenHandler: jest.fn(), on: jest.fn() } }; mockWindows.push(win); return win;
}) }), { virtual: true });
jest.mock('../../../electron/src/main/windows/mainWindow', () => ({ getLoadUrl: () => 'https://app.example', getWebContents: () => mockOwner, getMainWindow: () => mockMain, isInternalUrl: () => true }));
jest.mock('../../../electron/src/main/icon', () => ({ getWindowIcon: () => undefined }));
jest.mock('../../../electron/src/main/phoneIpc', () => ({ getPhoneSnapshot: () => mockSnapshot }));
import { closePhoneWindow, openPhoneWindow, resizePhoneWindow } from '../../../electron/src/main/windows/phoneWindow';
import type { PhoneSnapshot } from '../../../electron/src/shared/phoneProtocol';
beforeEach(() => { jest.clearAllMocks(); mockWindows.length = 0; mockSnapshot = { deviceState: 'registered', callStatus: 'idle' }; });
afterEach(closePhoneWindow);
it('abre una sola ventana de 380×621 con sesión compartida y preload aislado', async () => {
  await openPhoneWindow(mockSnapshot as PhoneSnapshot | null); await openPhoneWindow(mockSnapshot as PhoneSnapshot | null); expect(mockWindows).toHaveLength(1);
  expect(mockWindows[0].options).toMatchObject({ width: 380, height: 621, frame: false, webPreferences: { session: mockOwner.session, sandbox: true, nodeIntegration: false, contextIsolation: true } });
  expect(mockWindows[0].loadURL).toHaveBeenCalledWith('https://app.example/telefono');
});
it.each([['registered', 'connected', 537], ['unregistered', 'idle', 410]])('la apertura lee el controlador actual: %s/%s mide %d px', async (deviceState, callStatus, height) => {
  mockSnapshot = { deviceState, callStatus }; await openPhoneWindow(mockSnapshot as PhoneSnapshot | null); expect(mockWindows[0].setSize).toHaveBeenCalledWith(380, height, false);
});
it('cambia altura por modo y conserva el ancho que eligió la persona', async () => {
  await openPhoneWindow(mockSnapshot as PhoneSnapshot | null); mockWindows[0].width = 444;
  resizePhoneWindow({ deviceState: 'registered', callStatus: 'connected' } as PhoneSnapshot);
  resizePhoneWindow({ deviceState: 'registered', callStatus: 'connected' } as PhoneSnapshot);
  expect(mockWindows[0].setSize).toHaveBeenCalledTimes(1); expect(mockWindows[0].setSize).toHaveBeenCalledWith(444, 537, false);
  resizePhoneWindow({ deviceState: 'registered', callStatus: 'idle' } as PhoneSnapshot); expect(mockWindows[0].setSize).toHaveBeenLastCalledWith(444, 621, false);
  resizePhoneWindow(null); expect(mockWindows[0].setSize).toHaveBeenLastCalledWith(444, 410, false);
});
