/**
 * @jest-environment jsdom
 *
 * Detalle de egreso e ingreso (Finanzas ronda 2 · G2): el estado sale del reverso real, un
 * anulado no ofrece «Duplicar» ni «Anular», y ya no hay «Exportar» que baje un `.txt`.
 * El servicio va simulado: nada se anula en la base. Datos inventados.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { EgresoDetalle } from '@/components/finanzas/egresos/EgresoDetalle';
import { IngresoDetalle } from '@/components/finanzas/ingresos/IngresoDetalle';

const mockGetMovement = jest.fn();
const mockGetAnulacion = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/egresos/m1',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/lib/supabase/config', () => ({ supabase: { storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) } } }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDate: (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '') }),
}));
jest.mock('@/lib/services/movimientosService', () => ({
  movimientosService: {
    getMovementByUuid: (...a: unknown[]) => mockGetMovement(...a),
    getAnulacion: (...a: unknown[]) => mockGetAnulacion(...a),
    cancelMovement: jest.fn(),
    duplicateMovement: jest.fn(),
  },
}));

const egreso = {
  id: 482,
  uuid: 'm1',
  source: 'cash',
  concept: 'Arriendo noviembre',
  amount: 2800000,
  created_at: '2026-11-03T15:00:00Z',
  categoria_nombre: 'Arrendamientos',
  cuenta_contable: '51200501',
};

beforeEach(() => {
  simularAncho(1440);
  mockGetMovement.mockReset();
  mockGetAnulacion.mockReset();
});

test('egreso anulado: «Anulado» con autor y motivo, sin «Duplicar», «Anular» ni «Exportar»', async () => {
  mockGetMovement.mockResolvedValue(egreso);
  mockGetAnulacion.mockResolvedValue({ fecha: '2026-11-04T14:00:00Z', motivo: 'Se registró dos veces el arriendo', autor: 'Ana Prueba' });
  renderConIdioma(<EgresoDetalle id="m1" />);
  expect(await screen.findByText('Anulado')).toBeTruthy();
  expect(mockGetMovement).toHaveBeenCalledWith('m1', 'expense');
  expect(screen.getByText('por Ana Prueba · «Se registró dos veces el arriendo»')).toBeTruthy();
  expect(screen.getAllByText('Registrado el 2026-11-03 · anulado el 2026-11-04').length).toBeGreaterThan(0);
  expect(screen.getByText('La anulación no borra')).toBeTruthy();
  expect(screen.queryByText('Confirmado')).toBeNull();
  expect(screen.queryByRole('button', { name: /Exportar|Duplicar|Anular|Acciones de/ })).toBeNull();
});

test('ingreso vigente: «Confirmado», con «Duplicar» y «Anular» en el menú y sin «Exportar»', async () => {
  mockGetMovement.mockResolvedValue({ ...egreso, concept: 'Abono de cliente', source: 'bank', bank_account_name: 'Cuenta de prueba' });
  mockGetAnulacion.mockResolvedValue(null);
  renderConIdioma(<IngresoDetalle id="m1" />);
  expect(await screen.findByText('Confirmado')).toBeTruthy();
  expect(mockGetMovement).toHaveBeenCalledWith('m1', 'income');
  expect(screen.getByText('Banco · Cuenta de prueba')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Exportar/ })).toBeNull();
  // Radix abre el menú con el teclado (jsdom no trae PointerEvent).
  fireEvent.keyDown(screen.getAllByRole('button', { name: /Acciones de Ingreso #482/ })[0], { key: 'Enter' });
  expect(await screen.findByRole('menuitem', { name: /Duplicar/ })).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: /Anular/ })).toBeTruthy();
});

test('el reverso de una anulación se marca y no se anula ni se duplica', async () => {
  mockGetMovement.mockResolvedValue({ ...egreso, concept: 'ANULACIÓN: Arriendo noviembre', es_reverso: true });
  mockGetAnulacion.mockResolvedValue(null);
  renderConIdioma(<IngresoDetalle id="m1" />);
  expect(await screen.findByText('Este movimiento anula otro')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Acciones de/ })).toBeNull();
});

test('si no se puede comprobar la anulación, lo dice y no ofrece acciones', async () => {
  mockGetMovement.mockResolvedValue(egreso);
  mockGetAnulacion.mockRejectedValue(new Error('red'));
  renderConIdioma(<EgresoDetalle id="m1" />);
  expect(await screen.findByText('No se pudo comprobar si está anulado')).toBeTruthy();
  expect(screen.queryByText('Confirmado')).toBeNull();
  expect(screen.queryByRole('button', { name: /Acciones de/ })).toBeNull();
});
