/** @jest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import es from '../../../../messages/es.json';
import { MobileCallDialog } from '@/components/crm/shared/MobileCallDialog';
let mockOrganizationId: number | null = 120;
const mockResult = jest.fn();
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: mockOrganizationId ? { id: mockOrganizationId, name: 'Organización de prueba' } : null, branch_id: 1, isLoading: false, error: null }) }));
jest.mock('@/components/crm/shared/useOrgDefaultCountry', () => ({ useOrgDefaultCountry: () => '57' }));
jest.mock('next/navigation', () => ({ usePathname: () => '/app/crm/llamadas' }));
jest.mock('../mobile/useMobilePhoneViewport', () => ({ useMobilePhoneViewport: () => true }));
jest.mock('@/components/crm/shared/realtimeTables', () => ({ isRealtimePublished: () => false }));
jest.mock('@/lib/supabase/config', () => ({ supabase: { channel: jest.fn(), removeChannel: jest.fn() } }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));
jest.mock('../CallDispositionDialog', () => ({ CallDispositionDialog: (props: unknown) => { mockResult(props); return <div>Resultado real</div>; } }));
jest.mock('../mobile/MobileBridgeView', () => ({ MobileBridgeView: (p: { status: string | null; callId: string | null; error: string | null; loadingPrefs: boolean; onStart: () => void; onCancel: () => void; onResult: () => void }) => <div><span data-testid="status">{p.status ?? 'ready'}</span><span data-testid="call">{p.callId}</span>{p.error && <p role="alert">{p.error}</p>}<button disabled={p.loadingPrefs} onClick={p.onStart}>Iniciar</button><button onClick={p.onCancel}>Cancelar puente</button><button onClick={p.onResult}>Registrar</button></div> }));
const bridgeId = '30000000-0000-4000-8000-000000000001', callId = '10000000-0000-4000-8000-000000000001';
const response = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const prefs = response({ success: true, data: { mobile_phone_e164: '+573101234567', mobile_verified_at: '2026-10-01T10:00:00Z', requires_verification: false } });
let bridgeStatus: string;
let mockFetch: jest.Mock;
function view() { return <NextIntlClientProvider locale="es" messages={es}><MobileCallDialog open onOpenChange={() => {}} targetPhone="3001234567" customerName="Contacto" customerId="20000000-0000-4000-8000-000000000001" /></NextIntlClientProvider>; }
beforeEach(() => {
  jest.clearAllMocks(); mockOrganizationId = 120; bridgeStatus = 'agent_ringing';
  mockFetch = jest.fn(async (url: string) => url.includes('comm-preferences') ? prefs : url.endsWith('/initiate') ? response({ success: true, data: { bridgeId, callId, status: bridgeStatus } }) : url.endsWith('/cancel') ? response({ success: true, data: { status: 'failed' } }) : response({ success: true, data: { bridge: { status: bridgeStatus, call_id: callId }, call: { id: callId, status: bridgeStatus === 'completed' ? 'completed' : 'ringing', answered_at: '2026-10-02T14:00:00Z', ended_at: '2026-10-02T14:04:12Z', duration_seconds: 252, recording_enabled: true, consent_given: true } } }));
  global.fetch = mockFetch;
});
afterEach(cleanup);
it('el contrato real del hook sin organización no lee preferencias ni inicia llamadas', async () => {
  mockOrganizationId = null; render(view());
  await waitFor(() => expect((screen.getByText('Iniciar') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('Iniciar')); expect(mockFetch).not.toHaveBeenCalled();
});
it('doble clic inicia un solo puente normalizado y no cierra el progreso', async () => {
  let finish: (data: unknown) => void = () => {};
  mockFetch.mockImplementationOnce(async () => prefs).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(view()); await waitFor(() => expect((screen.getByText('Iniciar') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('Iniciar')); fireEvent.click(screen.getByText('Iniciar'));
  expect(mockFetch.mock.calls.filter(([url]) => url.endsWith('/initiate'))).toHaveLength(1);
  expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toMatchObject({ to: '+573001234567' });
  await act(async () => finish(response({ success: true, data: { bridgeId, callId, status: 'agent_ringing' } })));
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('agent_ringing'));
  expect(screen.getByRole('dialog')).toBeTruthy();
});
it('cancelar fallido conserva la llamada, un reintento confirmado detiene el puente', async () => {
  render(view()); await waitFor(() => expect((screen.getByText('Iniciar') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('Iniciar')); await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('agent_ringing'));
  mockFetch.mockImplementationOnce(async () => response({ success: false, error: 'Proveedor sin red' }, 503));
  fireEvent.click(screen.getByText('Cancelar puente')); await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Proveedor sin red'));
  expect(screen.getByTestId('call').textContent).toBe(callId);
  bridgeStatus = 'failed'; fireEvent.click(screen.getByText('Cancelar puente'));
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('failed'));
});
it('la terminación abre el resultado del mismo calls.id con duración confirmada', async () => {
  bridgeStatus = 'completed'; render(view()); await waitFor(() => expect((screen.getByText('Iniciar') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('Iniciar')); await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('completed'));
  await waitFor(() => expect(screen.getByTestId('call').textContent).toBe(callId));
  await act(async () => { await Promise.resolve(); }); fireEvent.click(screen.getByText('Registrar'));
  expect(mockResult.mock.calls.at(-1)?.[0].ended).toMatchObject({ callId, callSid: null, durationSeconds: 252, number: '+573001234567' });
});
it('descarta una respuesta tardía de iniciar al cambiar organización', async () => {
  let finish: (data: unknown) => void = () => {};
  mockFetch.mockImplementationOnce(async () => prefs).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const rendered = render(view()); await waitFor(() => expect((screen.getByText('Iniciar') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('Iniciar')); mockOrganizationId = 121; rendered.rerender(view());
  await act(async () => finish(response({ success: true, data: { bridgeId, callId, status: 'agent_ringing' } })));
  expect(screen.getByTestId('call').textContent).toBe(''); expect(screen.getByTestId('status').textContent).toBe('ready');
  expect(mockFetch.mock.calls.filter(([url]) => url === `/api/voice/bridge/${bridgeId}`)).toHaveLength(0);
});
it('un 403 del lector corta el respaldo y retira los datos de la llamada', async () => {
  mockFetch.mockImplementation(async (url: string) => url.includes('comm-preferences') ? prefs : url.endsWith('/initiate') ? response({ success: true, data: { bridgeId, callId, status: 'agent_ringing' } }) : response({ success: false }, 403));
  render(view()); await waitFor(() => expect((screen.getByText('Iniciar') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('Iniciar')); await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no está disponible'));
  expect(screen.getByTestId('call').textContent).toBe(''); expect(screen.getByTestId('status').textContent).toBe('ready');
});
