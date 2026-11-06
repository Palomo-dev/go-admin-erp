/**
 * @jest-environment jsdom
 *
 * «Cartera por edades» (Figma 2334:135048 y 2335:143427). Datos inventados.
 */
import { screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { CarteraEdadesPage } from '../CarteraEdadesPage';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/reportes/cartera-edades',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 10,
  obtenerOrganizacionActiva: () => ({ id: 10 }),
  useOrganization: () => ({ organization: { id: 10 } }),
}));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branchFilter: null }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ getToday: () => '2026-11-30', formatPlain: (d: string) => d }),
  useOrgTimezone: () => ({ isLoading: false }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }),
}));

const mockRpc = jest.fn();
jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: (n: string, p: unknown) => mockRpc(n, p) } }));

const RESPUESTA = {
  corte: '2026-11-30', total: 1000, vencida: 360,
  buckets: [
    { bucket: 'corriente', total: 640, cantidad: 1 }, { bucket: '1-30', total: 360, cantidad: 1 },
    { bucket: '31-60', total: 0, cantidad: 0 }, { bucket: '61-90', total: 0, cantidad: 0 }, { bucket: '+90', total: 0, cantidad: 0 },
  ],
  terceros: [{ tercero_id: 't', tercero: 'Comercial de prueba', corriente: 640, d1_30: 360, d31_60: 0, d61_90: 0, d90: 0, total: 1000, cantidad: 2 }],
  detalle: [],
  anticipos: { origen: 'saldos_a_favor', cuenta: '2805', total: 80, detalle: [] },
};

beforeEach(() => {
  simularAncho(1440);
  mockRpc.mockReset();
});

test('tabla por tercero con su fila Total, anticipo aparte y mayor que cuadra', async () => {
  mockRpc.mockResolvedValue({ data: { ...RESPUESTA, mayor: { cuenta: '1305', saldo: 1000, diferencia: 0, cuadra: true } }, error: null });
  renderConIdioma(<CarteraEdadesPage />);
  expect((await screen.findAllByText('Comercial de prueba')).length).toBeGreaterThan(0);
  expect(mockRpc).toHaveBeenCalledWith('fn_reporte_cxc_aging', { p_organization_id: 10, p_as_of: '2026-11-30', p_branch_id: null });
  expect(screen.getByText('Anticipos sin aplicar')).toBeTruthy();
  expect(screen.getByText('Aparte, no resta')).toBeTruthy();
  expect(screen.getByText('Mayor 1305')).toBeTruthy();
  expect(screen.getByText('Cuadra')).toBeTruthy();
  expect(screen.getAllByText('Total').length).toBeGreaterThan(0);
  expect(screen.queryByText(/no cuadra con el mayor/)).toBeNull();
});

test('muestra la diferencia cuando no cuadra', async () => {
  mockRpc.mockResolvedValue({ data: { ...RESPUESTA, mayor: { cuenta: '1305', saldo: 1200, diferencia: 200, cuadra: false } }, error: null });
  renderConIdioma(<CarteraEdadesPage />);
  expect(await screen.findByText('Diferencia $ 200')).toBeTruthy();
  expect(screen.getByText(/no cuadra con el mayor 1305/)).toBeTruthy();
});

test('sin permiso no muestra cifras', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: '42501' } });
  renderConIdioma(<CarteraEdadesPage />);
  await screen.findByRole('button', { name: 'Consultar' });
  expect(screen.queryByText('Total cartera')).toBeNull();
});
