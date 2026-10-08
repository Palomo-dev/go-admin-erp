/**
 * @jest-environment jsdom
 *
 * HRM › detalles en celular (390 px): una sola «←», la del MobileHeader del
 * shell. Préstamo y periodo de nómina conservan nombre, estado y acciones
 * (Aprobar, Ejecutar cálculo); solo su «←» pasa a lg. Paquete, colilla y
 * ejecución de nómina usan el mismo cambio y los cubre el guardarraíl 44.
 */
import { screen, waitFor } from '@testing-library/react';
import { simularAncho } from '@/test-utils/renderConIdioma';
import { cabeceraPublicada, comprobarDetalleMovil, renderEnCelular } from '@/test-utils/dobleAtrasMovil';
import { contextoMoneda } from '@/lib/utils/moneda';

const COP = { ...contextoMoneda('COP', { locale: 'es-CO' }), formatear: String, paraDocumento: () => contextoMoneda('COP', { locale: 'es-CO' }), resuelta: true };
let idRuta = 'x';

// Un solo router, como en Next: un objeto nuevo por render dispara los efectos que dependen de él.
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/app/hrm',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: idRuta }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => COP }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 1 }, isLoading: false }),
  getCurrentUserId: async () => 'u1',
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useOrgTimezone: () => ({ timezone: 'America/Bogota' }),
  useFormatDate: () => ({
    formatDate: (v: string | null | undefined) => (v ? String(v).slice(0, 10) : ''),
    formatDateTime: (v: string | null | undefined) => (v ? String(v) : ''),
    getToday: () => '2026-10-08',
  }),
}));
jest.mock('@/components/shared/HtmlContentRenderer', () => ({ HtmlContentRenderer: () => null }));
jest.mock('@/lib/services/employeeLoansService', () => ({
  __esModule: true,
  default: class {
    async getById() {
      return { id: 'p1', loan_number: 'PRE-0003', status: 'pending', employee_name: 'Empleado de prueba', loan_type: 'personal', principal: 1000000, total_amount: 1000000, balance: 1000000, installments_paid: 0, installments_total: 10, currency_code: 'COP' };
    }
    async getInstallments() {
      return [];
    }
  },
}));
jest.mock('@/lib/services/payrollService', () => ({
  __esModule: true,
  default: class {
    async getPeriodById() {
      return { id: 'n1', name: 'Quincena 1 · octubre', status: 'open', period_start: '2026-10-01', period_end: '2026-10-15', frequency: 'biweekly' };
    }
    async getRuns() {
      return [];
    }
  },
}));

import PrestamoDetallePage from '@/app/app/hrm/prestamos/[id]/page';
import PeriodoDetallePage from '@/app/app/hrm/nomina/periodos/[id]/page';

afterEach(() => simularAncho(1440));

describe('HRM › detalles en celular (390 px): una sola «←»', () => {
  test('préstamo: número, estado y «Aprobar» a la vista', async () => {
    idRuta = 'p1';
    renderEnCelular(<PrestamoDetallePage />);
    await screen.findByRole('heading', { level: 1, name: /PRE-0003/ });
    await waitFor(() => comprobarDetalleMovil('PRE-0003', ['Pendiente', 'Aprobar', 'HRM / Préstamos / Detalle']));
    expect(cabeceraPublicada()?.volverA).toBe('/app/hrm/prestamos');
  });

  test('periodo de nómina: nombre y acciones a la vista', async () => {
    idRuta = 'n1';
    renderEnCelular(<PeriodoDetallePage />);
    await screen.findByRole('heading', { level: 1, name: /Quincena 1/ });
    await waitFor(() => comprobarDetalleMovil('Quincena 1 · octubre', ['HRM / Nómina / Detalle Periodo']));
    expect(cabeceraPublicada()?.volverA).toBe('/app/hrm/nomina');
  });
});
