/** @jest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MobileCallsHistory } from '../mobile/MobileCallsHistory';
import { encodeMobileHistory, mobileHistoryKey, mobileHistoryRow } from '../mobile/mobileHistoryCache';
import { leerLlamadas } from '../useCallsData';
import { ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import type { CallListRow } from '@/lib/services/crm/callManagementService';
import es from '../../../../messages/es.json';
let mockOrg: number | null = 120; let mockUser = 'user-a', mockBranch = 1, mockExpires = Math.floor(Date.now() / 1000) + 3600;
const mockStorage = new Map<string, string>(); const mockRemove = jest.fn(async (key: string) => { mockStorage.delete(key); });
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: mockOrg ? { id: mockOrg, name: 'Organización de prueba' } : null, branch_id: 1, isLoading: false, error: null }) }));
jest.mock('@/lib/context/SessionContext', () => ({ useSession: () => ({ session: { expires_at: mockExpires, user: { id: mockUser } } }) }));
jest.mock('@/lib/context/BranchContext', () => ({ useBranchOpcional: () => ({ branchFilter: mockBranch, branches: [{ id: 1 }, { id: 2 }] }) }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => {} }));
jest.mock('@/lib/utils/mobileStorage', () => ({ getMobileStorage: async (key: string) => mockStorage.get(key) ?? null, setMobileStorage: async (key: string, value: string) => { mockStorage.set(key, value); }, removeMobileStorage: (key: string) => mockRemove(key) }));
jest.mock('../useCallsData', () => ({ leerLlamadas: jest.fn() }));
const call = { id: '10000000-0000-4000-8000-000000000001', direction: 'outbound', mode: 'bridge', status: 'completed', started_at: '2026-10-02T15:42:00Z', created_at: '2026-10-02T15:42:00Z', from_number: '+573001234568', to_number: '+573001234567', customer: { full_name: 'Contacto de prueba' }, duration_seconds: 252, disposition_outcome: 'answered' } as unknown as CallListRow;
const scope = { organizationId: 120, userId: 'user-a', branch: '1:1,2' }; const key = mobileHistoryKey(scope);
const mockOpen = jest.fn();
function view() { return <NextIntlClientProvider locale="es" messages={es}><MobileCallsHistory onOpen={mockOpen} /></NextIntlClientProvider>; }
beforeEach(() => { jest.clearAllMocks(); mockStorage.clear(); mockOrg = 120; mockUser = 'user-a'; mockBranch = 1; mockExpires = Math.floor(Date.now() / 1000) + 3600; (leerLlamadas as jest.Mock).mockResolvedValue({ data: [call] }); });
afterEach(() => { cleanup(); jest.useRealTimers(); });
it('el contrato real del hook sin organización no consulta el lector ni revela caché previa', async () => {
  mockOrg = null; mockStorage.set(key, encodeMobileHistory(scope, [mobileHistoryRow(call)]));
  render(view()); await waitFor(() => expect(screen.getByText(es.phoneVisual.forbidden)).toBeTruthy());
  expect(leerLlamadas).not.toHaveBeenCalled(); expect(screen.queryByText('Contacto de prueba')).toBeNull();
});
it('el estado vacío recibe la descripción nativa del kit', async () => {
  (leerLlamadas as jest.Mock).mockResolvedValue({ data: [] }); render(view());
  await waitFor(() => expect(screen.getByText(es.phoneVisual.emptyHint)).toBeTruthy());
});
it.each([401, 403])('un %s elimina el cache anterior y no concede acceso offline', async status => {
  mockStorage.set(key, encodeMobileHistory(scope, [mobileHistoryRow(call)])); (leerLlamadas as jest.Mock).mockRejectedValue(new ErrorApiCrm(status, null, 'denied'));
  render(view()); await waitFor(() => expect(screen.getByText(es.phoneVisual.forbidden)).toBeTruthy());
  expect(screen.queryByText('Contacto de prueba')).toBeNull(); expect(mockRemove).toHaveBeenCalledWith(key); expect(mockStorage.has(key)).toBe(false);
});
it('sin red muestra únicamente caché del ámbito vigente y las filas no son navegables', async () => {
  mockStorage.set(key, encodeMobileHistory(scope, [mobileHistoryRow(call)])); (leerLlamadas as jest.Mock).mockRejectedValue(new ErrorApiCrm(0, 'red', 'offline'));
  render(view()); await waitFor(() => expect(screen.getByText('Contacto de prueba')).toBeTruthy());
  const row = screen.getByText('Contacto de prueba').closest('button') as HTMLButtonElement;
  expect(row.disabled).toBe(true); fireEvent.click(row); expect(mockOpen).not.toHaveBeenCalled();
});
it.each(['org', 'user', 'branch'])('un cambio de %s aborta el lector y descarta su respuesta tardía', async field => {
  let finish: (result: unknown) => void = () => {};
  (leerLlamadas as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockImplementation(() => new Promise(() => {}));
  const rendered = render(view()); const signal = (leerLlamadas as jest.Mock).mock.calls[0][1] as AbortSignal;
  if (field === 'org') mockOrg = 121; if (field === 'user') mockUser = 'user-b'; if (field === 'branch') mockBranch = 2;
  rendered.rerender(view()); await act(async () => finish({ data: [call] }));
  expect(signal.aborted).toBe(true); expect(screen.queryByText('Contacto de prueba')).toBeNull(); expect(mockStorage.has(key)).toBe(false);
});
it('una sesión ya vencida no lee API ni cache y elimina la persistencia', async () => {
  mockExpires = Math.floor(Date.now() / 1000) - 1; mockStorage.set(key, encodeMobileHistory(scope, [mobileHistoryRow(call)]));
  render(view()); await waitFor(() => expect(screen.getByText(es.phoneVisual.forbidden)).toBeTruthy());
  expect(leerLlamadas).not.toHaveBeenCalled(); expect(mockStorage.has(key)).toBe(false);
});
it('vence la sesión mientras se ve el historial y retira inmediatamente las identidades', async () => {
  jest.useFakeTimers(); mockExpires = Math.floor(Date.now() / 1000) + 2;
  render(view()); await act(async () => { await Promise.resolve(); }); expect(screen.getByText('Contacto de prueba')).toBeTruthy();
  await act(async () => jest.advanceTimersByTime(2100));
  expect(screen.queryByText('Contacto de prueba')).toBeNull(); expect(screen.getByText(es.phoneVisual.forbidden)).toBeTruthy(); expect(mockStorage.has(key)).toBe(false);
});
