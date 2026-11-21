/**
 * @jest-environment jsdom
 *
 * Comisiones con el kit (Figma 1012:87993 y diálogo 1012:89017): agrupadas por
 * vendedor, cifras, asiento y «Pagar» del vendedor por la ruta de siempre.
 * Datos inventados.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import ComisionesPage from '@/app/app/finanzas/comisiones/page';

const mockFetch = jest.fn();

jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn(), useToast: () => ({ toast: jest.fn() }) }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/comisiones',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrgMembers', () => ({ useOrgMembers: () => ({ members: [], loading: false }) }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP', formatear: (n: number) => `$ ${n}`, paraDocumento: (m?: string | null) => m || 'COP' }),
}));
jest.mock('@/lib/utils/fetchJson', () => ({ fetchJson: (url: string, init?: RequestInit) => mockFetch(url, init) }));

const fila = (id: string, p: Record<string, unknown> = {}) => ({
  id,
  organization_id: 10,
  branch_id: null,
  commission_type: 'salesperson',
  source_type: 'invoice_sale',
  source_id: `fv-${id}`,
  source_item_id: null,
  payee_type: 'employee',
  payee_id: 'u-1',
  payee_name: 'Vendedora A',
  base_amount: 100000,
  commission_rate: 5,
  commission_amount: 5000,
  currency: 'COP',
  status: 'accrued',
  accrued_at: '2026-09-28T15:00:00Z',
  paid_at: null,
  notes: null,
  metadata: null,
  created_by: null,
  created_at: '2026-09-28T15:00:00Z',
  updated_at: '2026-09-28T15:00:00Z',
  ...p,
});

const resumen = { currency: 'COP', accrued_total: 50000, pending_total: 50000, paid_total: 0, cancelled_total: 0, rejected_total: 0, clawback_total: 0, count: 3, count_pending: 3, count_paid: 0, count_cancelled: 0 };

beforeEach(() => {
  simularAncho(1440);
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string) => {
    if (url.startsWith('/api/crm/commissions/money-accounts')) return Promise.resolve({ success: true, data: [] });
    if (url.startsWith('/api/crm/commissions/bulk-pay')) return Promise.resolve({ success: true, data: { paid: ['1', '2'], failed: [] } });
    return Promise.resolve({
      success: true,
      data: [fila('1'), fila('2', { base_amount: 480000, commission_amount: 24000 }), fila('3', { payee_id: 'u-2', payee_name: 'Vendedor B', commission_amount: 21000 })],
      count: 3,
      summary: resumen,
      summary_others: [],
      currency: 'COP',
      can_manage: true,
      timezone: 'America/Bogota',
      asientos: { '1': { id: 9408, comprobante_prefijo: null, comprobante_numero: null } },
    });
  });
});

const filaDe = async (texto: string) => (await screen.findAllByText(texto)).map((e) => e.closest('tr')).find(Boolean) as HTMLElement;

describe('Finanzas › Comisiones', () => {
  test('agrupa por vendedor con sus totales, el asiento y las cifras', async () => {
    renderConIdioma(<ComisionesPage />);
    const grupo = await filaDe('Vendedora A');
    expect(within(grupo).getByText('2 comisiones')).toBeTruthy();
    expect(within(grupo).getByText('Por pagar')).toBeTruthy();
    expect(within(grupo).getByRole('button', { name: 'Pagar' })).toBeTruthy();
    expect((await screen.findAllByText('#9408')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Factura de venta').length).toBeGreaterThan(0);
    // La primera carga pide «Por pagar» y el resumen de todos los estados aparte.
    const urls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(urls).toContain('/api/crm/commissions?status=accrued');
    expect(urls).toContain('/api/crm/commissions?limit=1');
  });

  test('«Pagar» del vendedor abre el diálogo y paga sus pendientes por bulk-pay', async () => {
    renderConIdioma(<ComisionesPage />);
    const grupo = await filaDe('Vendedora A');
    fireEvent.click(within(grupo).getByRole('button', { name: 'Pagar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Pagar comisiones de Vendedora A' });
    fireEvent.change(within(dialogo).getByLabelText('Referencia'), { target: { value: 'Transferencia 1' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: /^Pagar/ }));
    await waitFor(() => expect(mockFetch.mock.calls.some((c) => c[0] === '/api/crm/commissions/bulk-pay')).toBe(true));
    const llamada = mockFetch.mock.calls.find((c) => c[0] === '/api/crm/commissions/bulk-pay');
    expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ commission_ids: ['1', '2'], reference: 'Transferencia 1' });
  });
});
