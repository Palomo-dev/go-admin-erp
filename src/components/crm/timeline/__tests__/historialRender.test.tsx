/** @jest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { FinancialEntry } from '../entries/FinancialEntry';
import { OpportunityTimeline } from '../OpportunityTimeline';
import { useTimeline, type UseTimelineResult } from '../hooks/useTimeline';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';

jest.mock('../hooks/useTimeline', () => ({ useTimeline: jest.fn() }));
jest.mock('../TimelineFilters', () => ({ TimelineFilters: () => <div data-testid="filtros" /> }));
jest.mock('@/components/crm/acciones/AccionesRapidasCrm', () => ({ AccionesRapidasCrm: () => <div data-testid="acciones" /> }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'organization-changed' }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota' }) }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ resuelta: false, formatear: () => 'moneda sin resolver' }) }));
const idiomas: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const id = '11111111-1111-4111-8111-111111111111';
const folioId = '22222222-2222-4222-8222-222222222222';
const reserva: Extract<TimelineEntry, { kind: 'sale' | 'reservation' | 'web_order' }> = {
  kind: 'reservation', id: `reservation_${id}`, occurred_at: '2026-10-01T15:00:00Z', user: null,
  financial: { source_id: id, reference: id, amount: '250.25', status: 'pending', payment_status: null, notes: null,
    end_at: '2026-10-02T15:00:00Z', checkin: '2026-10-01', checkout: '2026-10-02', delivery_type: null,
    spaces: [{ id, label: 'Espacio A', type: 'Tipo A' }], folios: [
      { id: folioId, status: 'open', balance: '140.25', items_count: 2, pending_count: 1, pending_amount: '100.25' },
      { id, status: 'open', balance: '25', items_count: 1, pending_count: 1, pending_amount: '25' },
    ] },
};
const refresh = jest.fn(async () => undefined);
const estado: UseTimelineResult = { entries: [], groups: [], loading: false, loadingMore: false, error: null,
  hasMore: false, loadMore: jest.fn(), refresh, realtime: 'polling', newCount: 0, showNew: jest.fn() };
let errores: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); jest.mocked(useTimeline).mockReturnValue(estado); errores = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { const llamadas = errores.mock.calls; errores.mockRestore(); expect(llamadas).toEqual([]); });

test.each(idiomas)('registros comerciales conservan todos los enlaces y textos en %s', idioma => {
  renderConIdioma(<FinancialEntry entry={reserva} />, { idioma });
  const links = screen.getAllByRole('link');
  expect(links.map(l => l.getAttribute('href'))).toEqual([`/app/pms/reservas/${id}`,
    `/app/pms/folios?reservation=${id}&folio=${folioId}`, `/app/pms/folios?reservation=${id}&folio=${id}`]);
  expect(screen.getByText('Espacio A · Tipo A')).toBeTruthy();
  expect(screen.queryByText('moneda sin resolver')).toBeNull();
});
test.each(idiomas)('vacío y error del historial usan estados del kit en %s', idioma => {
  const { rerender } = renderConIdioma(<OpportunityTimeline entityType="customer" entityId={id} />, { idioma });
  expect(screen.getByTestId('acciones')).toBeTruthy();
  jest.mocked(useTimeline).mockReturnValue({ ...estado, error: 'red' });
  // El proveedor del helper se conserva en cada rerender.
  rerender(<OpportunityTimeline entityType="customer" entityId={id} />);
  const buttons = screen.getAllByRole('button');
  fireEvent.click(buttons[buttons.length - 1]);
  expect(refresh).toHaveBeenCalled();
});
