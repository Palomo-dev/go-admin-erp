/**
 * @jest-environment jsdom
 *
 * Mayor contable (Figma 990:75517 listo · 990:76399 sin cuenta): arranca sin
 * cuenta y no consulta nada; con `?cuenta=` lee `getLedger` (la misma función
 * del reporte de Reportes) con el mes en curso y pinta saldo inicial, líneas
 * con saldo D/C y saldo final. Dentro del visor de Reportes usa su periodo.
 * Servicio simulado; datos inventados.
 */
import { screen, waitFor } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { MayorContablePage } from '../MayorContablePage';
import { ProveedorVisorInforme } from '@/components/reportes/especiales/contextoVisor';

let mockParams = new URLSearchParams();
const mockLedger = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/contabilidad/mayor-contable',
  useSearchParams: () => mockParams,
}));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/context/BranchContext', () => ({ useBranchOpcional: () => ({ branches: [] }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => {
  const fns = { formatDate: (v: string) => String(v).slice(0, 10), formatPlain: (v: string) => v, getToday: () => '2026-09-28' };
  return { useFormatDate: () => fns, useOrgTimezone: () => ({ isLoading: false }) };
});
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }) }));
jest.mock('../../ContabilidadService', () => ({
  ContabilidadService: {
    obtenerCuentasLigero: jest.fn(async () => [{ account_code: '130505', name: 'Clientes nacionales', type: 'asset' }]),
    listarCentrosCosto: jest.fn(async () => []),
  },
}));
jest.mock('../../ReportesContablesService', () => ({
  ReportesContablesService: { getLedger: (...a: unknown[]) => mockLedger(...a) },
}));

beforeEach(() => {
  simularAncho(1440);
  mockParams = new URLSearchParams();
  mockLedger.mockReset();
  mockLedger.mockResolvedValue({
    account_code: '130505',
    name: 'Clientes nacionales',
    type: 'asset',
    opening_balance: 8420000,
    entries: [
      { journal_entry_id: 8702, entry_date: '2026-09-02T15:00:00Z', account_code: '130505', memo: 'Venta', source: 'invoice_sales', source_id: '7c1e2b9a-1111-4222-8333-944455556666', posted: true, debit: 476000, credit: 0, running_balance: 8896000, description: 'Venta a crédito' },
    ],
    total_debit: 476000,
    total_credit: 0,
    closing_balance: 8896000,
    truncated: false,
    filtrado: false,
  });
});

describe('Mayor contable', () => {
  it('sin cuenta: «Elige una cuenta» y no consulta el mayor', async () => {
    renderConIdioma(<MayorContablePage />);
    expect(await screen.findByText('Elige una cuenta')).toBeTruthy();
    expect(mockLedger).not.toHaveBeenCalled();
  });

  it('con ?cuenta= lee getLedger del mes en curso y pinta saldo con su naturaleza', async () => {
    mockParams = new URLSearchParams('cuenta=130505');
    renderConIdioma(<MayorContablePage />);
    await waitFor(() => expect(mockLedger).toHaveBeenCalledWith('130505', '2026-09-01', '2026-09-28', {}));
    expect((await screen.findAllByText('Venta a crédito')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('$ 8896000 D').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Saldo inicial').length).toBeGreaterThan(0);
  });

  it('dentro del visor de Reportes usa el periodo del visor y no pinta su cabecera', async () => {
    mockParams = new URLSearchParams('cuenta=130505');
    renderConIdioma(
      <ProveedorVisorInforme valor={{ desde: '2026-01-01', hasta: '2026-06-30', sucursal: null }}>
        <MayorContablePage />
      </ProveedorVisorInforme>,
    );
    await waitFor(() => expect(mockLedger).toHaveBeenCalledWith('130505', '2026-01-01', '2026-06-30', {}));
    expect(screen.queryByRole('heading', { name: 'Mayor contable' })).toBeNull();
  });
});
