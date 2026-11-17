/**
 * @jest-environment jsdom
 *
 * HRM › detalles en celular (390 px): una sola «←», la del MobileHeader del
 * shell. Préstamo y período de nómina (interfaz de la fase 3, Figma 20.17 y
 * 20.21.2) conservan nombre, estado y acciones (Aprobar, Preliquidar); su «←»
 * es la del PageHeader del kit, que en celular no se dibuja. Paquete, colilla y
 * detalle de la persona en el período usan el mismo PageHeader y los cubre el
 * guardarraíl 44.
 */
import { screen, waitFor } from '@testing-library/react';
import { simularAncho } from '@/test-utils/renderConIdioma';
import { cabeceraPublicada, comprobarDetalleMovil, renderEnCelular, visibleEnCelular } from '@/test-utils/dobleAtrasMovil';
import { contextoMoneda } from '@/lib/utils/moneda';

const COP = { ...contextoMoneda('COP', { locale: 'es-CO' }), formatear: String, paraDocumento: () => contextoMoneda('COP', { locale: 'es-CO' }), resuelta: true };

// Un solo router, como en Next: un objeto nuevo por render dispara los efectos que dependen de él.
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/app/hrm/nomina',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => COP }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 1, name: 'Empresa de prueba' }, isLoading: false }),
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
      return {
        id: 'p1', employment_id: 'v1', loan_number: 'PRE-0003', status: 'requested', employee_name: 'Empleado de prueba', loan_type: 'general',
        principal: 1000000, total_amount: 1000000, total_interest: 0, interest_rate: 0, balance: 1000000, installment_amount: 100000,
        installments_paid: 0, installments_total: 10, currency_code: 'COP', first_payment_date: '2026-10-15', auto_deduct: true, max_deduction_pct: 30,
      };
    }
    async getInstallments() {
      return [];
    }
  },
}));

const PERMISOS = { ver: true, procesar: true, cerrar: false, pagar: false, salario: false };
const RESPUESTAS: Record<string, unknown> = {
  '/api/hrm/nomina': { usuario_id: 'u1', permisos: PERMISOS, habilitada: false, plan: null, periodos: [] },
  '/api/hrm/nomina/personas': { personas: [] },
  '/api/hrm/nomina/periodos/n1': {
    periodo: {
      id: 'n1', name: 'Quincena 1 · octubre', kind: 'ordinaria', frequency: 'biweekly', period_start: '2026-10-01', period_end: '2026-10-15',
      payment_date: '2026-10-15', status: 'open', total_employees: 0, total_gross: 0, total_deductions: 0, total_net: 0, total_employer_cost: 0,
      approved_at: null, updated_at: null,
    },
    nomina_habilitada: false,
    versiones: [],
    colillas: [],
    novedades: [],
  },
  '/api/hrm/nomina/periodos/n1/revision': {
    usuario_id: 'u1', permisos: PERMISOS, habilitada: false, bloqueos: [{ codigo: 'sin_preliquidacion' }], preliquidado_por: null,
    enviado_por: null, es_preparador: false, aprobacion: null, ajustes: [],
  },
};

beforeEach(() => {
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const ruta = String(url);
    const cuerpo = RESPUESTAS[ruta];
    return { ok: cuerpo !== undefined, status: cuerpo !== undefined ? 200 : 404, json: async () => cuerpo ?? { code: 'no_existe' } } as Response;
  }) as typeof fetch;
});

import { DetallePrestamo } from '@/components/hrm/nomina/DetallePrestamo';
import { PeriodoPage } from '@/components/hrm/nomina/PeriodoPage';

afterEach(() => simularAncho(1440));

/** El texto se ve en celular en el contenido de la pantalla (fuera del MobileHeader), aunque se repita oculto para lg. */
function aLaVista(...textos: string[]) {
  for (const texto of textos) {
    const visibles = screen.getAllByText(texto).filter((e) => !e.closest('[data-testid="shell-movil"]') && visibleEnCelular(e));
    if (visibles.length === 0) throw new Error(`«${texto}» debe verse en celular`);
  }
}

describe('HRM › detalles en celular (390 px): una sola «←»', () => {
  test('préstamo: número, estado y «Aprobar» a la vista', async () => {
    renderEnCelular(<DetallePrestamo id="p1" />);
    await screen.findByRole('heading', { level: 1, name: /PRE-0003/ });
    await screen.findAllByText('Aprobar');
    await waitFor(() => comprobarDetalleMovil('Préstamo PRE-0003 · Empleado de prueba'));
    aLaVista('Por aprobar', 'Aprobar');
    expect(cabeceraPublicada()?.volverA).toBe('/app/hrm/nomina?vista=prestamos');
  });

  test('período de nómina: nombre y «Preliquidar» a la vista', async () => {
    renderEnCelular(<PeriodoPage id="n1" />);
    await screen.findByRole('heading', { level: 1, name: /Quincena 1/ });
    await waitFor(() => comprobarDetalleMovil('Quincena 1 · octubre'));
    await waitFor(() => aLaVista('Preliquidar', 'Neto preliquidado'));
    expect(cabeceraPublicada()?.volverA).toBe('/app/hrm/nomina');
    expect(cabeceraPublicada()?.subtitulo).toBe('Abierto');
  });
});
