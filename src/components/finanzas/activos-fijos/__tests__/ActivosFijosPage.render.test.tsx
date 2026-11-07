/**
 * @jest-environment jsdom
 *
 * «Activos fijos — depreciación» (Figma 2335:141065) y su ronda 2 (Figma 36 · F1, F2, G3):
 * línea recta, «Depreciar», KPIs, el vacío sin «Depreciar» y el bloqueo de fecha, costo,
 * residual y vida útil tras la primera depreciación. Datos inventados.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { ActivosFijosPage } from '../ActivosFijosPage';

const mockRpc = jest.fn();
let mockFilas: unknown[] = [];

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
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => {
      const cadena = {
        select: () => cadena,
        eq: () => cadena,
        order: () => cadena,
        then: (ok: (v: { data: unknown[]; error: null }) => unknown) => ok({ data: mockFilas, error: null }),
      };
      return cadena;
    },
    rpc: (nombre: string, parametros: unknown) => mockRpc(nombre, parametros),
  },
}));

const activo = {
  id: 'a1', code: 'A1', name: 'Vitrina refrigerada', asset_type: 'equipment', acquisition_date: '2026-01-01',
  acquisition_cost: 12000000, salvage_value: 0, useful_life_months: 120, depreciation_method: 'straight_line',
  accumulated_depreciation: 1800000, current_value: 10200000, status: 'active', depreciaciones: [{ count: 9 }],
};
const sinCuentas = { ...activo, id: 'a2', code: 'A2', name: 'Computador caja', accumulated_depreciation: 0, current_value: 12000000, depreciaciones: [{ count: 0 }] };

beforeEach(() => {
  simularAncho(1440);
  mockFilas = [activo, sinCuentas];
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
  expect((await screen.findAllByText(/Vitrina refrigerada/)).length).toBeGreaterThan(0);
  expect(screen.getAllByText('Línea recta').length).toBeGreaterThan(0);
  expect(screen.getByText('Otros métodos no están disponibles')).toBeTruthy();
  expect(screen.getAllByText('Pendiente: faltan las cuentas de gasto y de depreciación').length).toBeGreaterThan(0);
  expect(screen.queryByText('Saldo decreciente')).toBeNull();
});

test('KPIs calculados de lo cargado: costo, acumulada, libros y pendientes', async () => {
  renderConIdioma(<ActivosFijosPage />);
  await screen.findAllByText(/Vitrina refrigerada/);
  expect(screen.getByText('Costo total')).toBeTruthy();
  expect(screen.getByText('$ 24000000')).toBeTruthy();
  expect(screen.getAllByText('$ 1800000').length).toBeGreaterThan(0);
  expect(screen.getByText('$ 22200000')).toBeTruthy();
  expect(screen.getByText('Pendientes de depreciar')).toBeTruthy();
});

test('«Depreciar» llama al proceso y deja a la vista lo que quedó pendiente', async () => {
  renderConIdioma(<ActivosFijosPage />);
  await screen.findAllByText(/Vitrina refrigerada/);
  fireEvent.click(screen.getByRole('button', { name: /^Depreciar/ }));
  expect(await screen.findByText(/1 asiento contabilizado/)).toBeTruthy();
  expect(mockRpc).toHaveBeenCalledWith('fn_depreciar_mes', { p_organization_id: 10, p_mes: '2026-11-06' });
  expect(screen.getByText(/A2 · Pendiente/)).toBeTruthy();
});

test('vacío (G3): texto de siempre, «Nuevo activo» y sin «Depreciar»', async () => {
  mockFilas = [];
  renderConIdioma(<ActivosFijosPage />);
  // La tabla (escritorio) y la lista (celular) pintan cada una su vacío.
  expect((await screen.findAllByText('Sin activos fijos')).length).toBeGreaterThan(0);
  expect(screen.getAllByText('Registre el primer activo para depreciarlo cada mes.').length).toBeGreaterThan(0);
  expect(screen.getAllByRole('button', { name: /Nuevo activo/ }).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: /^Depreciar/ })).toBeNull();
});

test('tras la primera depreciación, fecha, costo, residual y vida útil quedan bloqueados', async () => {
  renderConIdioma(<ActivosFijosPage />);
  await screen.findAllByText(/Vitrina refrigerada/);
  fireEvent.click(screen.getByRole('button', { name: 'Editar Vitrina refrigerada' }));
  expect(await screen.findByText(/ya tiene depreciación contabilizada/)).toBeTruthy();
  expect((screen.getByLabelText(/Costo de adquisición/) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText(/Valor residual/) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText(/Vida útil en meses/) as HTMLInputElement).disabled).toBe(true);
});

test('sin depreciación se edita todo y se anuncia la primera cuota', async () => {
  renderConIdioma(<ActivosFijosPage />);
  await screen.findAllByText(/Computador caja/);
  fireEvent.click(screen.getByRole('button', { name: 'Editar Computador caja' }));
  expect((await screen.findByLabelText(/Costo de adquisición/) as HTMLInputElement).disabled).toBe(false);
  expect(screen.queryByText(/ya tiene depreciación contabilizada/)).toBeNull();
  expect(screen.getByText(/Primera cuota: febrero de 2026/)).toBeTruthy();
});
