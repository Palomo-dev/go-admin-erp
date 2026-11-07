/**
 * @jest-environment jsdom
 *
 * Periodos contables (Finanzas R3, frente C): rejilla del año con estados y
 * cifras, cierre bloqueado por borradores y reapertura con motivo. El servicio
 * va simulado: nada toca la base ni cierra periodos reales. Datos inventados.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { PeriodosFiscalesPage } from '../PeriodosFiscalesPage';

const mockCerrar = jest.fn();
const mockReabrir = jest.fn();
const mockPendientes = jest.fn();

const mes = (month: number, status: 'open' | 'closed') => ({
  id: `p${month}`,
  organization_id: 10,
  year: 2026,
  month,
  period_type: 'monthly',
  start_date: `2026-${String(month).padStart(2, '0')}-01`,
  end_date: `2026-${String(month).padStart(2, '0')}-28`,
  status,
  closed_by: status === 'closed' ? 'u1' : null,
  closed_at: status === 'closed' ? '2026-08-08T15:00:00Z' : null,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

jest.mock('@/components/ui/use-toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/contabilidad/periodos-fiscales',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ getToday: () => '2026-09-28', formatDate: (v: string) => (v ? v.slice(0, 10) : '') }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 10 } }) }));
jest.mock('@/hooks/usePermissionContext', () => ({
  usePermissionContext: () => ({ checker: { can: () => true }, loading: false }),
}));
jest.mock('../PeriodosFiscalesService', () => ({
  motivoReaperturaValido: (m: string) => ((m ?? '').trim().length >= 5 ? m.trim() : null),
  PeriodosFiscalesService: {
    obtenerPeriodos: jest.fn(async () => Array.from({ length: 12 }, (_, i) => mes(i + 1, i < 7 ? 'closed' : 'open'))),
    asientosPorMes: jest.fn(async () => new Map([[1, 980], [8, 1240], [9, 1284]])),
    pendientesDelPeriodo: (...a: unknown[]) => mockPendientes(...a),
    nombresUsuarios: jest.fn(async () => new Map([['u1', 'Ana Gómez']])),
    cuadreDelPeriodo: jest.fn(async () => ({ debitos: 500, creditos: 500 })),
    consecutivosDelPeriodo: jest.fn(async () => []),
    cerrarPeriodo: (...a: unknown[]) => mockCerrar(...a),
    reabrirPeriodo: (...a: unknown[]) => mockReabrir(...a),
    resultadoDelAnio: jest.fn(async () => ({ resultado: 1000, cuentaResultado: '3605' })),
  },
}));

beforeEach(() => {
  simularAncho(1440);
  mockCerrar.mockReset();
  mockReabrir.mockReset().mockResolvedValue(undefined);
  mockPendientes.mockReset().mockImplementation(async (id: string) => (id === 'p8' ? { borradores: 2, pendientes: 3 } : { borradores: 0, pendientes: 0 }));
});

describe('PeriodosFiscalesPage', () => {
  it('pinta la rejilla del año con cerrados, el pendiente de cierre y el mes actual', async () => {
    renderConIdioma(<PeriodosFiscalesPage />);
    expect(await screen.findByRole('heading', { name: 'Periodos contables' })).toBeTruthy();
    const enero = await screen.findByRole('article', { name: 'Enero' });
    expect(within(enero).getByText('Cerrado')).toBeTruthy();
    await waitFor(() => expect(within(enero).getByText('980 asientos')).toBeTruthy());
    expect(within(enero).getByText(/Cerrado por Ana Gómez/)).toBeTruthy();

    const agosto = screen.getByRole('article', { name: 'Agosto' });
    expect(within(agosto).getByText('Pendiente de cierre')).toBeTruthy();
    await waitFor(() => expect(within(agosto).getByText(/3 pendientes de contabilizar/)).toBeTruthy());
    expect(screen.getByRole('article', { name: 'Septiembre' }).textContent).toContain('Septiembre · actual');
    expect(screen.getByText(/agosto sin cerrar/)).toBeTruthy();
  });

  it('el cierre con borradores y pendientes queda bloqueado y no llama a la base', async () => {
    renderConIdioma(<PeriodosFiscalesPage />);
    const agosto = await screen.findByRole('article', { name: 'Agosto' });
    fireEvent.click(within(agosto).getByRole('button', { name: 'Cerrar' }));
    const dialogo = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialogo).getByText('3 hechos pendientes de contabilizar')).toBeTruthy());
    expect(within(dialogo).getByText('2 borradores')).toBeTruthy();
    expect(within(dialogo).getByText('El balance de prueba cuadra')).toBeTruthy();
    const confirmar = within(dialogo).getByRole('button', { name: 'Cerrar periodo' }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    fireEvent.click(confirmar);
    expect(mockCerrar).not.toHaveBeenCalled();
  });

  it('reabrir exige motivo y pasa por la RPC con el texto limpio', async () => {
    renderConIdioma(<PeriodosFiscalesPage />);
    const julio = await screen.findByRole('article', { name: 'Julio' });
    fireEvent.click(within(julio).getByRole('button', { name: 'Reabrir' }));
    const dialogo = await screen.findByRole('dialog');
    const campo = within(dialogo).getByRole('textbox');
    fireEvent.change(campo, { target: { value: '  Factura de proveedor recibida tarde  ' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Reabrir' }));
    await waitFor(() => expect(mockReabrir).toHaveBeenCalledWith('p7', 'Factura de proveedor recibida tarde'));
  });
});
