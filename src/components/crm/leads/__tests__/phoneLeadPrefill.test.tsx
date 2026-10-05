/** @jest-environment jsdom */
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
const mockRouter = { replace: jest.fn(), push: jest.fn() };
let mockQuery = new URLSearchParams();
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter, useSearchParams: () => mockQuery }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ code: 'USD', resuelta: true }) }));
jest.mock('@/components/crm/oportunidades/opportunitiesService', () => ({ opportunitiesService: { getPipelines: jest.fn().mockResolvedValue([]), searchCustomers: jest.fn().mockResolvedValue([]) } }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));
jest.mock('../NewLeadDialogView', () => ({ NewLeadDialogView: (p: { open: boolean; customerMode: string; newPhone: string; source: string; setName(v: string): void; setNewFirstName(v: string): void; handleSubmit(): Promise<void> }) => p.open ? <div>
  <span data-testid="phone">{p.newPhone}</span><span data-testid="mode">{p.customerMode}</span><span>{p.source}</span>
  <button onClick={() => { p.setName('Lead de prueba'); p.setNewFirstName('Contacto'); }}>Completar</button><button onClick={p.handleSubmit}>Guardar</button>
</div> : null }));
import { phoneLeadPrefill, usePhoneLeadPrefill } from '../usePhoneLeadPrefill';
import { NewLeadDialog } from '../NewLeadDialog';
beforeEach(() => { jest.clearAllMocks(); mockQuery = new URLSearchParams(); global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }); });
it('solo acepta un teléfono E.164 válido y jamás interpreta destinos libres', () => {
  expect(phoneLeadPrefill(new URLSearchParams({ create: '1', phone: '+573001234567' }))).toBe('+573001234567');
  for (const phone of ['3001234567', '+57 3001234567', '+999123456789', 'javascript:alert(1)', '+1']) expect(phoneLeadPrefill(new URLSearchParams({ create: '1', phone }))).toBeNull();
});
it('espera permisos, consume la query conservando filtros y abre solo el formulario', () => {
  mockQuery = new URLSearchParams({ create: '1', phone: '+573001234567', q: 'venta' }); const open = jest.fn();
  const { rerender, result } = renderHook(({ loading, allowed }) => usePhoneLeadPrefill(loading, allowed, open), { initialProps: { loading: true, allowed: false } });
  expect(open).not.toHaveBeenCalled(); rerender({ loading: false, allowed: true });
  expect(open).toHaveBeenCalledWith(true); expect(result.current.initialPhone).toBe('+573001234567');
  expect(mockRouter.replace).toHaveBeenCalledWith('/?q=venta', { scroll: false }); expect(global.fetch).not.toHaveBeenCalled();
  act(() => result.current.clearInitialPhone()); expect(result.current.initialPhone).toBeNull();
});
it('consume una query inválida o sin permiso sin abrir ni guardar', () => {
  const open = jest.fn(); mockQuery = new URLSearchParams({ create: '1', phone: '+573001234567' });
  renderHook(() => usePhoneLeadPrefill(false, false, open)); expect(open).not.toHaveBeenCalled(); expect(mockRouter.replace).toHaveBeenCalled(); expect(global.fetch).not.toHaveBeenCalled();
});
it('prellena el creador canónico sin autosave y envía el cliente solo al confirmar', async () => {
  render(<NewLeadDialog open initialPhone="+573001234567" branchId={null} onOpenChange={jest.fn()} onCreated={jest.fn()} />);
  await waitFor(() => expect(screen.getByTestId('phone').textContent).toBe('+57 3001234567'));
  expect(screen.getByTestId('mode').textContent).toBe('new'); expect(global.fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Completar')); fireEvent.click(screen.getByText('Guardar'));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]; expect(url).toBe('/api/crm/leads');
  expect(JSON.parse(init.body)).toMatchObject({ source: 'llamada_entrante', new_customer: { first_name: 'Contacto', phone: '+57 3001234567' } });
});
