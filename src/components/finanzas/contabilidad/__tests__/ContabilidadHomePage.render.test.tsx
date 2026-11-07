/**
 * @jest-environment jsdom
 *
 * Inicio de Contabilidad (Figma 987:622311 con avisos · 987:623198 todo en
 * orden): banda con pendientes y descuadres hacia Salud contable, KPIs del mes,
 * accesos a todas las páginas de Contabilidad (los mismos de la pantalla vieja,
 * sin la tarjeta del PMS) y «Nuevo asiento». Servicios simulados; datos inventados.
 */
import { screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { ContabilidadHomePage } from '../ContabilidadHomePage';

const mockPendientes = jest.fn();
const mockCruce = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/contabilidad',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => {
  const fns = { formatDate: (v: string) => String(v).slice(0, 10), getToday: () => '2026-09-28' };
  return { useFormatDate: () => fns, useOrgTimezone: () => ({ isLoading: false }) };
});
jest.mock('@/components/finanzas/configuracion-contable', () => ({ AlertasFalloContable: () => null }));
jest.mock('../ContabilidadService', () => ({
  ContabilidadService: {
    resumenLibroDiario: jest.fn(async () => ({ asientos: 1284, contraAsientos: 312, borradores: 0, movimiento: 0 })),
    obtenerCuentasLigero: jest.fn(async () => [
      { account_code: '1105', name: 'Caja', type: 'asset' },
      { account_code: '110505', name: 'Caja general', type: 'asset' },
    ]),
    listarCentrosCosto: jest.fn(async () => []),
  },
}));
jest.mock('../periodos-fiscales/PeriodosFiscalesService', () => ({
  PeriodosFiscalesService: {
    obtenerPeriodos: jest.fn(async () => [
      { id: '8', year: 2026, month: 8, period_type: 'monthly', start_date: '2026-08-01', end_date: '2026-08-31', status: 'open' },
      { id: '9', year: 2026, month: 9, period_type: 'monthly', start_date: '2026-09-01', end_date: '2026-09-30', status: 'open' },
    ]),
  },
}));
jest.mock('@/components/finanzas/reglas-contables/ReglasContablesService', () => ({
  ReglasContablesService: {
    obtenerReglas: jest.fn(async () => [{ id: 'r1' }, { id: 'r2' }]),
    obtenerDiagnostico: jest.fn(async () => [{ regla_id: 'r1', lado: 'impuesto', cuenta: '2408', estado: 'titulo' }]),
  },
}));
jest.mock('../salud/SaludContableService', () => ({
  SaludContableService: {
    pendientes: (...a: unknown[]) => mockPendientes(...a),
    cruce: (...a: unknown[]) => mockCruce(...a),
    balance: jest.fn(async () => ({ cuadra: true, diferencia: 0 })),
  },
}));

beforeEach(() => {
  simularAncho(1440);
  mockPendientes.mockResolvedValue(3);
  mockCruce.mockResolvedValue({ descuadres: [], totalDescuadres: 4, huerfanos: [], totalHuerfanos: 0 });
});

describe('Inicio de Contabilidad', () => {
  it('con avisos: banda hacia Salud contable y KPIs del mes', async () => {
    renderConIdioma(<ContabilidadHomePage />);
    expect(await screen.findByText('3 hechos sin contabilizar y 4 descuadres')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Abrir Salud contable/ }).getAttribute('href')).toBe('/app/finanzas/contabilidad/salud');
    expect(await screen.findByText('Asientos de septiembre')).toBeTruthy();
    expect(screen.getAllByText(/agosto sin cerrar/).length).toBeGreaterThan(0);
  });

  it('conserva los accesos a todas las páginas de Contabilidad y «Nuevo asiento»', async () => {
    renderConIdioma(<ContabilidadHomePage />);
    await screen.findByText('Asientos de septiembre');
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const ruta of [
      '/app/finanzas/contabilidad/asientos?action=new',
      '/app/finanzas/contabilidad/asientos',
      '/app/finanzas/contabilidad/mayor-contable',
      '/app/finanzas/contabilidad/plan-cuentas',
      '/app/finanzas/contabilidad/actualizar-puc',
      '/app/finanzas/contabilidad/plantillas',
      '/app/finanzas/reglas-contables',
      '/app/finanzas/configuracion-contable',
      '/app/finanzas/contabilidad/periodos-fiscales',
      '/app/finanzas/centro-costos',
      '/app/finanzas/activos-fijos',
      '/app/finanzas/presupuestos',
      '/app/finanzas/contabilidad/salud',
      '/app/reportes/contabilidad',
    ]) {
      expect(hrefs).toContain(ruta);
    }
    // La tarjeta de folios del PMS salió del inicio contable.
    expect(hrefs).not.toContain('/app/pms/folios');
  });

  it('todo en orden: sin banda de aviso', async () => {
    mockPendientes.mockResolvedValue(0);
    mockCruce.mockResolvedValue(null);
    renderConIdioma(<ContabilidadHomePage />);
    expect(await screen.findByText('Todo contabilizado: 0 pendientes y el balance cuadra.')).toBeTruthy();
    expect(screen.queryByText(/hechos sin contabilizar/)).toBeNull();
    // La revisión de descuadres sin activar no se pinta como cero.
    expect(screen.getByText('revisión pendiente de activar')).toBeTruthy();
  });
});
