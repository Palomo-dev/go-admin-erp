/**
 * @jest-environment jsdom
 *
 * Libro diario de trabajo (Figma 981:62898): pide la página al servidor con el
 * mes en curso, pinta origen, marcas de reversión y el menú por tipo (duplicar
 * solo en manuales: `asientosLogica.test.ts`). Servicio simulado; datos inventados.
 */
import { screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { AsientosPage } from '../AsientosPage';

const mockListar = jest.fn();

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/contabilidad/asientos',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ selectedBranchId: 3, branches: [{ id: 3, name: 'Principal', organization_id: 10 }] }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => {
  const fns = { formatDate: (v: string) => String(v).slice(0, 10), getToday: () => '2026-09-28', toInstant: (d: string) => d };
  return { useFormatDate: () => fns, useOrgTimezone: () => ({ isLoading: false }) };
});
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}`, decimals: 0 }) }));
jest.mock('@/lib/finanzas/usePermisosFinanzas', () => ({ usePermisosFinanzas: () => ({ crear: true, cargando: false }) }));
jest.mock('../../AlertasContables', () => ({ AlertasContables: () => null }));
jest.mock('../NuevoAsientoDialog', () => ({ NuevoAsientoDialog: () => null }));
jest.mock('../../ContabilidadService', () => ({
  mensajeErrorAsiento: () => 'error',
  ContabilidadService: {
    listarLibroDiario: (...a: unknown[]) => mockListar(...a),
    resumenLibroDiario: jest.fn(async () => ({ asientos: 2, contraAsientos: 1, borradores: 0, movimiento: 369000 })),
    obtenerPlanCuentas: jest.fn(async () => []),
    listarCentrosCosto: jest.fn(async () => []),
    listarDistribuciones: jest.fn(async () => []),
  },
}));

const fila = (c: Record<string, unknown>) => ({
  organization_id: 10,
  branch_id: 3,
  entry_date: '2026-09-27T15:00:00Z',
  posted: true,
  source_id: null,
  created_by: null,
  created_at: '',
  updated_at: '',
  revertidoPor: null,
  importe: 1000,
  ...c,
});

beforeEach(() => {
  simularAncho(1440);
  mockListar.mockReset();
  mockListar.mockResolvedValue({
    total: 3,
    paresOcultos: 0,
    filas: [
      fila({ id: 9580, memo: 'Venta POS', source: 'invoice_sales', source_id: '7c1e2b9a-1111-4222-8333-944455556666', importe: 119000 }),
      fila({ id: 9560, memo: 'Gastos bancarios', source: 'manual', revertidoPor: 9577, importe: 250000 }),
      fila({ id: 9577, memo: 'REVERSION', source: 'reversal', source_id: '9560', importe: 250000 }),
    ],
  });
});

describe('Libro diario', () => {
  it('consulta el mes en curso paginado y pinta origen y marcas', async () => {
    renderConIdioma(<AsientosPage />);
    expect((await screen.findAllByText('Venta POS')).length).toBeGreaterThan(0);
    expect(mockListar).toHaveBeenCalledWith(expect.objectContaining({ desde: '2026-09-01', hasta: '2026-09-28', limite: 25, desplazamiento: 0, ocultarPares: false }));
    expect(screen.getAllByText(/Revertido por #9\.?577/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reversión de #9\.?560/).length).toBeGreaterThan(0);
  });

});
