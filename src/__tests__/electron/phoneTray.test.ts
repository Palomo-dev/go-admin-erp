const mockMenu = jest.fn(); const mockEvents: Record<string, () => void> = {};
const mockDispatch = jest.fn().mockResolvedValue({ ok: true });
let mockSnapshot = { scope: '11111111-1111-4111-8111-111111111111', revision: 1, deviceState: 'registered', incoming: false, callStatus: 'idle', ringtoneMuted: false, missed: null as null | { id: string } };
jest.mock('electron', () => ({ Tray: jest.fn().mockImplementation(() => ({ setToolTip: jest.fn(), setContextMenu: mockMenu, on: (event: string, handler: () => void) => { mockEvents[event] = handler; }, destroy: jest.fn() })), Menu: { buildFromTemplate: (items: unknown) => items }, app: { getPath: () => '/tmp', quit: jest.fn() }, nativeImage: { createEmpty: jest.fn() }, shell: { openPath: jest.fn().mockResolvedValue(undefined) } }), { virtual: true });
jest.mock('../../../electron/src/main/icon', () => ({ getIconImage: () => undefined }));
jest.mock('../../../electron/src/main/agentRunner', () => ({ getStatus: () => ({ running: true, organizationName: 'Organización de prueba', jobsPrinted: 12, jobsFailed: 0, branchNames: [] }) }));
jest.mock('../../../electron/src/main/crashReporter', () => ({ readLog: () => '' }));
jest.mock('../../../electron/src/main/phoneIpc', () => ({ getPhoneSnapshot: () => mockSnapshot, dispatchPhoneCommand: (value: unknown) => mockDispatch(value) }));
jest.mock('../../../electron/src/main/windows/phoneWindow', () => ({ openPhoneWindow: jest.fn().mockResolvedValue(true) }));
import { createTray, destroyTray } from '../../../electron/src/main/tray';
import type { BrowserWindow } from 'electron';
interface Item { label?: string; type?: string; enabled?: boolean; checked?: boolean; accelerator?: string; submenu?: Item[]; click?: () => void }
const items = () => mockMenu.mock.calls.at(-1)?.[0] as Item[];
beforeEach(() => { jest.clearAllMocks(); mockSnapshot = { scope: '11111111-1111-4111-8111-111111111111', revision: 1, deviceState: 'registered', incoming: false, callStatus: 'idle', ringtoneMuted: false, missed: null }; });
afterEach(destroyTray);
it('menú nativo utiliza estado real, conserva impresión y no inventa presencia ni contadores perdidos', () => {
  createTray({ show: jest.fn(), focus: jest.fn() } as unknown as BrowserWindow);
  expect(items().find(item => item.label === 'Abrir marcador')?.accelerator).toBe('CommandOrControl+Shift+L');
  expect(items().find(item => item.label === 'Estado')?.submenu).toEqual([{ label: 'Disponible', type: 'radio', checked: true, enabled: false }]);
  expect(items().find(item => item.label === 'Silenciar timbre')).toMatchObject({ type: 'checkbox', checked: false, enabled: true });
  expect(items().some(item => item.label === 'Trabajos impresos: 12')).toBe(true);
  expect(items().some(item => item.label === 'Última llamada perdida')).toBe(false);
});
it('el timbre despacha al owner y una ventana de menú antigua no actúa en otra organización', () => {
  createTray({ show: jest.fn(), focus: jest.fn() } as unknown as BrowserWindow);
  const old = items().find(item => item.label === 'Silenciar timbre')!; old.click?.();
  expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ scope: mockSnapshot.scope, revision: 1, action: 'ringtone', value: true }));
  mockDispatch.mockClear(); mockSnapshot = { ...mockSnapshot, scope: '22222222-2222-4222-8222-222222222222', revision: 7 };
  old.click?.(); expect(mockDispatch).not.toHaveBeenCalled();
  mockEvents['right-click'](); items().find(item => item.label === 'Silenciar timbre')?.click?.();
  expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ scope: mockSnapshot.scope, revision: 7 }));
});
