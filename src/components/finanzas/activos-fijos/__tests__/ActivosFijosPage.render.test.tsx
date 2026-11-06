/**
 * @jest-environment jsdom
 *
 * «Activos fijos — depreciación» (Figma 2335:141065): línea recta, «Depreciar» y el aviso de
 * los métodos que no se ofrecen. Datos inventados.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { ActivosFijosPage } from '../ActivosFijosPage';

const mockRpc = jest.fn();

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/activos-fijos',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 10,
  obtenerOrganizacionActiva: () => ({ id: 10 }),
  useOrganization: () => ({ organization: { id: 10 } }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ getToday: () => '2026-11-06', formatPlain: (d: string) => d }),
  useOrgTimezone: () => ({ isLoading: false }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }),
}));
jest.mock('@/components/finanzas/contabilidad/CampoCuentaContable', () => ({ CampoCuentaContable: () => null }));
jest.mock('@/lib/supabase/config', () => {
  const activo = {
    id: 'a1', code: 'A1', name: 'Vitrina refrigerada', asset_type: 'equipment', acquisition_date: '2026-01-01',
    acquisition_cost: 12000000, salvage_value: 0, useful_life_months: 120, depreciation_method: 'straight_line',
    accumulated_depreciation: 1800000, current_value: 10200000, status: 'active',
  };
  const sinCuentas = { ...activo, id: 'a2', code: 'A2', name: 'Computador caja', accumulated_depreciation: 0 };
  return {
    supabase: {
      from: () => {
        const cadena = {
          select: () => cadena,
          eq: () => cadena,
          order: () => cadena,
          then: (ok: (v: { data: unknown[]; error: null }) => unknown) => ok({ data: [activo, sinCuentas], error: null }),
        };
        return cadena;
      },
      rpc: (nombre: string, parametros: unknown) => mockRpc(nombre, parametros),
    },
  };
});

beforeEach(() => {
  simularAncho(1440);
  mockRpc.mockReset();
  mockRpc.mockImplementation(async (nombre: string) => {
    if (nombre === 'fn_depreciacion_estado') {
      return { data: { hoy: '2026-11-06', ultimo_mes: null, bloqueos: [{ activo_id: 'a2', motivo: 'faltan_cuentas' }] }, error: null };
    }
    return { data: { mes: '2026-11', asientos: 1, total: 100000, ya_depreciados: 0, terminados: 0, pendientes: [{ activo_id: 'a2', codigo: 'A2', motivo: 'faltan_cuentas' }] }, error: null };
  });
});

test('muestra el método, el pendiente y el aviso de otros métodos', async () => {
  renderConIdioma(<ActivosFijosPage />);
  expect((await screen.findAllByText('Vitrina refrigerada')).length).toBeGreaterThan(0);
  expect(screen.getAllByText('Línea recta').length).toBeGreaterThan(0);
  expect(screen.getByText('Otros métodos no están disponibles')).toBeTruthy();
  expect(screen.getAllByText('Pendiente: faltan las cuentas de gasto y de depreciación').length).toBeGreaterThan(0);
  expect(screen.queryByText('Saldo decreciente')).toBeNull();
});

test('«Depreciar» llama al proceso y deja a la vista lo que quedó pendiente', async () => {
  renderConIdioma(<ActivosFijosPage />);
  await screen.findAllByText('Vitrina refrigerada');
  fireEvent.click(screen.getByRole('button', { name: /^Depreciar/ }));
  expect(await screen.findByText(/1 asiento contabilizado/)).toBeTruthy();
  expect(mockRpc).toHaveBeenCalledWith('fn_depreciar_mes', { p_organization_id: 10, p_mes: '2026-11-06' });
  expect(screen.getByText(/A2 · Pendiente/)).toBeTruthy();
});
