/** @jest-environment jsdom */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { DEFAULT_HEALTH_CONFIG } from '@/lib/services/crm/healthFactorConfig';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/app/crm/salud' }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (value: number) => `¤${value}`, paraDocumento: () => ({ moneda: 'COP', locale: 'es-CO' }), resuelta: true }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useOrgTimezone: () => ({ timezone: 'America/Bogota' }), useFormatDate: () => ({ timezone: 'America/Bogota', getToday: () => '2026-10-01' }) }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/components/voice/SoftphoneProvider', () => ({ useSoftphone: () => ({ available: false }) }));
jest.mock('@/components/voice/hooks/useCallModePolicy', () => ({ useCallModePolicy: () => ({ decision: null }) }));
jest.mock('@/components/crm/shared/useOrgDefaultCountry', () => ({ useOrgDefaultCountry: () => '57' }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));
import { SaludView } from '../SaludView';
import { FactoresSalud } from '../FactoresSalud';
import { ClientHealthCard } from '../ClientHealthCard';
const raw = { customer_id: 'cliente-prueba', invoices_12m: 1, revenue_12m: 49000, days_since_last_invoice: 77, days_since_last_activity: 40, overdue_balance: 0, overdue_ratio: 0, score: 58, band: 'red' };
const row = { customer_id: 'cliente-prueba', customer_name: 'Cliente de prueba', score: 22, band: 'red', raw, alerts: [{ code: 'no_activity', severity: 'yellow', message: 'ignore-server-copy' }], indicators: [{ key: 'recency', label: 'Ignore-server-label', score: 10, value: 77, weight: 30 }], phone: null, email: null, do_not_call: false, owner_id: 'user-test', previous_score: 40, measured_at: null, snapshot_raw: raw };
const dashboard = { scores: [row], config: DEFAULT_HEALTH_CONFIG, can_manage: true, user_id: 'user-test', trend: [], trend_error: false };
const settings = { config: DEFAULT_HEALTH_CONFIG, updated_at: '2026-09-30T12:00:00Z', refresh_interval_hours: 24, is_active: true };
let fetchMock: jest.Mock; let errors: jest.SpyInstance;
beforeEach(() => {
  simularAncho(1440);
  if (!global.structuredClone) global.structuredClone = value => JSON.parse(JSON.stringify(value));
  fetchMock = jest.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ success: true, data: url.endsWith('/config') ? settings : url === '/api/crm/health' ? dashboard : { queued: true, event_id: 'evento-prueba' } }) }));
  global.fetch = fetchMock;
  errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  const intl = errors.mock.calls.map(call => String(call[0] instanceof Error ? call[0].message : call[0])).filter(message => /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE/.test(message));
  errors.mockRestore(); expect(intl).toEqual([]);
});
test.each(['es', 'en', 'fr', 'pt'] as const)('panel y factores usan kit e Intl real en %s sin copia española del servidor', async idioma => {
  const m = { es, en, fr, pt }[idioma].crm.salud;
  const rendered = renderConIdioma(<SaludView organizationId={120} />, { idioma });
  await screen.findAllByText('Cliente de prueba');
  expect(screen.getByRole('columnheader', { name: m.why })).toBeTruthy();
  expect(screen.queryByText('ignore-server-copy')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: m.recalculate }));
  await screen.findByText(m.recalculationQueued);
  expect(fetchMock.mock.calls.filter(call => call[0] === '/api/crm/health/refresh')[0][1]).toMatchObject({ method: 'POST', body: '{}' });
  fireEvent.click(screen.getByRole('button', { name: m.factors }));
  await screen.findByText(m.preview);
  expect(screen.getByRole('button', { name: m.saveRecalculate })).toBeTruthy();
  rendered.unmount();
});
test('el editor valida100, preserva borrador tras409 y envía versión original para evitar pisar cambios ajenos', async () => {
  const onSaved = jest.fn();
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => ({ ok: init.method !== 'PATCH', status: init.method === 'PATCH' ? 409 : 200, json: async () => init.method === 'PATCH' ? { success: false, code: 'configuracion_cambiada' } : { success: true, data: settings } }));
  renderConIdioma(<FactoresSalud scores={[row as never]} onClose={jest.fn()} onSaved={onSaved} />);
  const recency = await screen.findByLabelText(es.crm.salud.indicatorLabels.recency);
  fireEvent.change(recency, { target: { value: '20' } });
  const save = screen.getByRole('button', { name: es.crm.salud.saveRecalculate }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(recency, { target: { value: '30' } });
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect((recency as HTMLInputElement).value).toBe('30');
  expect(onSaved).not.toHaveBeenCalled();
  const patch = fetchMock.mock.calls.find(call => call[1]?.method === 'PATCH');
  expect(JSON.parse(patch![1].body)).toMatchObject({ expected_updated_at: settings.updated_at, config: DEFAULT_HEALTH_CONFIG });
});
test('fallo de lectura muestra error con retry; vacío real muestra explicación accesible', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ success: false }) });
  renderConIdioma(<SaludView organizationId={120} />);
  await screen.findByText(es.crm.salud.loadError);
  fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));
  await screen.findAllByText('Cliente de prueba');
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { ...dashboard, scores: [] } }) });
  fireEvent.click(screen.getByRole('button', { name: es.crm.salud.recalculate }));
  // Una cola aceptada no sustituye los datos actuales por ceros.
  await screen.findByText(es.crm.salud.recalculationQueued);
  expect(screen.getAllByText('Cliente de prueba').length).toBeGreaterThan(0);
});
test('historial fallido conserva puntaje y muestra error aislado, nunca estado sin datos', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { health: row, history: [], invoice_count: 1, history_error: true } }) });
  renderConIdioma(<ClientHealthCard customerId="cliente-prueba" customerName="Cliente de prueba" />);
  await screen.findByText(es.crm.salud.trend.error);
  expect(screen.getByRole('img', { name: /22.*100/ })).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test('respuesta tardía de una organización anterior no vuelve a mostrar sus clientes', async () => {
  let resolveFirst: (value: unknown) => void = () => {};
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
  const rendered = renderConIdioma(<SaludView organizationId={120} />);
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { ...dashboard, scores: [] } }) });
  rendered.rerender(<SaludView organizationId={121} />);
  await screen.findByText(es.crm.salud.emptyTitle);
  await act(async () => resolveFirst({ ok: true, status: 200, json: async () => ({ success: true, data: dashboard }) }));
  expect(screen.queryByText('Cliente de prueba')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: es.crm.salud.howCalculated }));
  expect(within(screen.getByRole('dialog')).getByText(es.crm.salud.calculationDescription)).toBeTruthy();
});

test('detalle se abre por Enter en fila nativa y devuelve foco al cerrar', async () => {
  fetchMock.mockImplementation(async (url: string) => ({ ok: true, status: 200, json: async () => ({ success: true, data: url === '/api/crm/health' ? dashboard : { health: row, history: [{ id: 's1', score: 22, band: 'red', created_at: '2026-10-01T00:30:00Z', indicators: raw }, { id: 's2', score: 40, band: 'yellow', created_at: '2026-09-30T00:30:00Z', indicators: raw }], invoice_count: 1, history_error: false } }) }));
  renderConIdioma(<SaludView organizationId={120} />);
  await screen.findAllByText('Cliente de prueba');
  const tableRow = screen.getAllByRole('row').find(element => element.hasAttribute('tabindex'))!;
  tableRow.focus(); fireEvent.keyDown(tableRow, { key: 'Enter' });
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByText(es.crm.salud.currentHealth);
  fireEvent.click(within(dialog).getByRole('button', { name: es.crm.salud.trend.showTable }));
  const historyTable = within(dialog).getByRole('table');
  // Los instantes después de medianoche UTC pertenecen al día anterior en la zona de la org.
  expect(within(historyTable).getByText(/30.*sept.*19:30/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: es.kit.comun.cerrar }));
  await waitFor(() => expect(document.activeElement).toBe(tableRow));
});
test('filtro sin coincidencias ofrece limpiar y devuelve las filas', async () => {
  renderConIdioma(<SaludView organizationId={120} />);
  await screen.findAllByText('Cliente de prueba');
  fireEvent.click(screen.getByRole('radio', { name: es.crm.salud.filtersLabels.yellow }));
  await screen.findAllByText(es.crm.salud.filterEmpty);
  fireEvent.click(screen.getAllByRole('button', { name: /Limpiar filtros/i })[0]);
  await screen.findAllByText('Cliente de prueba');
});
