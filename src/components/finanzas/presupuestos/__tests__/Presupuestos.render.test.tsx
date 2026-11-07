/**
 * @jest-environment jsdom
 *
 * Presupuestos (Figma 82-19, 82-20 y 82-21). Datos inventados.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  usePathname: () => '/app/finanzas/presupuestos',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 10,
  obtenerOrganizacionActiva: () => ({ id: 10 }),
  useOrganization: () => ({ organization: { id: 10 } }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}`, decimals: 0, code: 'COP', locale: 'es-CO' }),
}));
const mockPermisos = { ver: true, crear: true, anular: false, aprobar: true, posVer: false, posCrear: false, posAnular: false, cargando: false };
jest.mock('@/lib/finanzas/usePermisosFinanzas', () => ({ usePermisosFinanzas: () => mockPermisos }));
jest.mock('@/components/finanzas/contabilidad/cuentas/CuentasAutomaticasService', () => ({
  cuentasDeMovimiento: async () => [{ account_code: '51050601', name: 'Sueldos' }],
  buscarCuentas: async () => ({ items: [], total: 0 }),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockService = {
  getAll: jest.fn(),
  getById: jest.fn(),
  getLines: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  approve: jest.fn(),
  guardarLineas: jest.fn(),
};
jest.mock('@/components/finanzas/presupuestos/BudgetService', () => {
  class ErrorPresupuesto extends Error {
    constructor(public codigo: string) {
      super(codigo);
    }
  }
  return { BudgetService: mockService, ErrorPresupuesto };
});

import { PresupuestosPage } from '../PresupuestosPage';
import { EditorPresupuestoPage } from '../EditorPresupuestoPage';

const base = { organization_id: 10, created_by: null, approved_by: null, created_at: '', updated_at: '' };
const BORRADOR = { ...base, id: 'b-1', name: 'Operación 2027', fiscal_year: 2027, status: 'draft', total_amount: 96000 };
const APROBADO = { ...base, id: 'b-2', name: 'Operación 2026', fiscal_year: 2026, status: 'approved', total_amount: 50 };
const LINEAS = Array.from({ length: 12 }, (_, i) => ({
  id: `l${i}`, budget_id: 'b-1', organization_id: 10, account_code: '51050601', period: i + 1, planned_amount: 8000, actual_amount: 0, variance: 0, cost_center_id: null,
}));

beforeEach(() => {
  simularAncho(1440);
  Object.values(mockService).forEach((f) => f.mockReset());
  mockService.getAll.mockResolvedValue([BORRADOR, APROBADO]);
  mockService.getLines.mockResolvedValue(LINEAS);
  mockService.delete.mockResolvedValue({ id: 'b-1' });
});

test('lista con estados traducidos, total por cuenta y enlace al informe de lo real', async () => {
  renderConIdioma(<PresupuestosPage />);
  expect(await screen.findByText('Borrador')).toBeTruthy();
  expect(screen.getByText('Aprobado')).toBeTruthy();
  expect(screen.queryByText('draft')).toBeNull();
  expect(screen.queryByText('approved')).toBeNull();
  expect(await screen.findByText(/Sueldos/)).toBeTruthy();
  expect(screen.getAllByText('$ 96000').length).toBeGreaterThan(0);
  expect(screen.getByRole('link', { name: 'Abrir informe' }).getAttribute('href')).toBe('/app/reportes/contabilidad/presupuesto-vs-real');
  expect(screen.getByRole('link', { name: 'Editar líneas' }).getAttribute('href')).toBe('/app/finanzas/presupuestos/b-1');
});

test('un aprobado se ve, no se edita ni se aprueba de nuevo', async () => {
  renderConIdioma(<PresupuestosPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Operación 2026/ }));
  expect(await screen.findByRole('link', { name: 'Ver líneas' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Editar líneas' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
});

test('borrar usa el diálogo del kit y la ruta del servidor, nunca confirm()', async () => {
  const confirmar = jest.spyOn(window, 'confirm');
  renderConIdioma(<PresupuestosPage />);
  await screen.findByText('Borrador');
  // Radix abre el menú con el teclado (jsdom no trae PointerEvent).
  const menus = screen.getAllByRole('button', { expanded: false }).filter((b) => /Operación 2027/.test(b.getAttribute('aria-label') ?? ''));
  fireEvent.keyDown(menus[0], { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Eliminar' }));
  expect(await screen.findByText('¿Eliminar «Operación 2027»?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar presupuesto' }));
  await waitFor(() => expect(mockService.delete).toHaveBeenCalledWith('b-1'));
  expect(confirmar).not.toHaveBeenCalled();
});

test('«Nuevo presupuesto»: vacío o copia; «real del año anterior» deshabilitado con su motivo', async () => {
  renderConIdioma(<PresupuestosPage />);
  await screen.findByText('Borrador');
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo presupuesto' }));
  expect(await screen.findByText('Empieza vacío o copia uno anterior')).toBeTruthy();
  expect(screen.getByText(/falta una fuente aprobada de saldos reales por cuenta y mes/)).toBeTruthy();
});

test('editor de un aprobado: solo lectura y ofrece copiar como borrador', async () => {
  mockService.getById.mockResolvedValue(APROBADO);
  mockService.getLines.mockResolvedValue(LINEAS.map((l) => ({ ...l, budget_id: 'b-2' })));
  renderConIdioma(<EditorPresupuestoPage id="b-2" />);
  expect(await screen.findByText('Este presupuesto no se puede editar')).toBeTruthy();
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Copiar como borrador' }).length).toBeGreaterThan(0);
});

test('editor de un borrador: «Año» reparte en 12 meses y guarda por la ruta', async () => {
  mockService.getById.mockResolvedValue(BORRADOR);
  mockService.guardarLineas.mockResolvedValue({ id: 'b-1', total: 120000 });
  renderConIdioma(<EditorPresupuestoPage id="b-1" />);
  // La tabla (escritorio) y las tarjetas (móvil) están en el DOM; jsdom no aplica `hidden lg:block`.
  const [anio] = await screen.findAllByRole('textbox', { name: '51050601, año' });
  const guardar = screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement;
  expect(guardar.disabled).toBe(true);
  fireEvent.focus(anio);
  fireEvent.change(anio, { target: { value: '120000' } });
  await waitFor(() => expect(guardar.disabled).toBe(false));
  fireEvent.click(guardar);
  await waitFor(() => expect(mockService.guardarLineas).toHaveBeenCalled());
  const [id, filas] = mockService.guardarLineas.mock.calls[0];
  expect(id).toBe('b-1');
  expect(filas).toEqual([{ account_code: '51050601', cost_center_id: null, meses: Array(12).fill(10000) }]);
});
