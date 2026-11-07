/**
 * @jest-environment jsdom
 *
 * «Plantillas de asientos» (Finanzas ronda 2 · F3 y F4): «Cuadra / No cuadra», Guardar
 * desactivado si no cuadra, archivar con confirmación y «Usar plantilla» con fecha y sucursal
 * obligatorias dentro del diálogo. El servicio va simulado: nada toca la base. Datos inventados.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { PlantillasAsientoPage } from '../PlantillasAsientoPage';

const mockPush = jest.fn();
const mockGuardar = jest.fn();
const mockAplicar = jest.fn();
const mockArchivar = jest.fn();
let mockSucursal: number | null = null;

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  usePathname: () => '/app/finanzas/contabilidad/plantillas',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ selectedBranchId: mockSucursal, branches: [{ id: 3, name: 'Sede norte', organization_id: 10 }] }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ getToday: () => '2026-11-01', toInstant: (d: string) => `${d}T12:00:00-05:00` }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }),
}));
jest.mock('../../CampoTerceroAsiento', () => ({ CampoTerceroAsiento: () => null }));
jest.mock('../../ContabilidadService', () => ({
  mensajeErrorAsiento: () => 'No se pudo completar la operación contable.',
  ContabilidadService: {
    listarPlantillas: jest.fn(async () => [
      {
        id: 'p1',
        nombre: 'Arriendo mensual sede norte',
        memo: 'Canon de arrendamiento',
        lineas: [
          { orden: 1, account_code: '51200501', descripcion: null, debito: 3000000, credito: 0, tercero_nit: null, tercero_nombre: null, cost_center_id: null },
          { orden: 2, account_code: '23359501', descripcion: null, debito: 0, credito: 3000000, tercero_nit: null, tercero_nombre: null, cost_center_id: null },
        ],
      },
    ]),
    obtenerPlanCuentas: jest.fn(async () => [
      { account_code: '51200501', name: 'Arrendamientos', is_active: true },
      { account_code: '23359501', name: 'Costos por pagar', is_active: true },
    ]),
    listarCentrosCosto: jest.fn(async () => []),
    guardarPlantilla: (...a: unknown[]) => mockGuardar(...a),
    aplicarPlantilla: (...a: unknown[]) => mockAplicar(...a),
    archivarPlantilla: (...a: unknown[]) => mockArchivar(...a),
  },
}));

beforeEach(() => {
  simularAncho(1440);
  mockSucursal = null;
  [mockPush, mockGuardar, mockAplicar, mockArchivar].forEach((m) => m.mockReset());
  mockGuardar.mockResolvedValue('nueva');
  mockAplicar.mockResolvedValue(77);
  mockArchivar.mockResolvedValue(undefined);
});

async function llenar(debito: string, credito: string) {
  await screen.findByRole('option', { name: /51200501/ }, { timeout: 3000 }).catch(() => undefined);
  fireEvent.change(screen.getByLabelText('Cuenta de la línea 1'), { target: { value: '51200501' } });
  fireEvent.change(screen.getByLabelText('Débito de la línea 1'), { target: { value: debito } });
  fireEvent.change(screen.getByLabelText('Cuenta de la línea 2'), { target: { value: '23359501' } });
  fireEvent.change(screen.getByLabelText('Crédito de la línea 2'), { target: { value: credito } });
}

test('muestra «Cuadra» y deja guardar cuando débitos y créditos son iguales', async () => {
  renderConIdioma(<PlantillasAsientoPage />);
  await screen.findByText('Arriendo mensual sede norte');
  expect(screen.getByText('Sin importes')).toBeTruthy();
  fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Seguro anual' } });
  await llenar('1200', '1200');
  expect(screen.getByText('Cuadra')).toBeTruthy();
  const guardar = screen.getByRole('button', { name: 'Guardar plantilla' }) as HTMLButtonElement;
  expect(guardar.disabled).toBe(false);
  fireEvent.click(guardar);
  await waitFor(() => expect(mockGuardar).toHaveBeenCalledTimes(1));
  const enviado = mockGuardar.mock.calls[0][0] as { nombre: string; lineas: { debito: number; credito: number }[] };
  expect(enviado.nombre).toBe('Seguro anual');
  expect(enviado.lineas.map((l) => [l.debito, l.credito])).toEqual([[1200, 0], [0, 1200]]);
});

test('si no cuadra: «No cuadra», Guardar desactivado con su motivo y nada se guarda', async () => {
  renderConIdioma(<PlantillasAsientoPage />);
  await screen.findByText('Arriendo mensual sede norte');
  fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Seguro anual' } });
  await llenar('1200', '1000');
  expect(screen.getByText(/No cuadra · diferencia \$ 200/)).toBeTruthy();
  const guardar = screen.getByRole('button', { name: 'Guardar plantilla' }) as HTMLButtonElement;
  expect(guardar.disabled).toBe(true);
  expect(screen.getByText('Los débitos y los créditos deben cuadrar para guardar.')).toBeTruthy();
  fireEvent.click(guardar);
  expect(mockGuardar).not.toHaveBeenCalled();
});

test('archivar pide confirmación antes de llamar al servicio', async () => {
  renderConIdioma(<PlantillasAsientoPage />);
  await screen.findByText('Arriendo mensual sede norte');
  // Radix abre el menú con el teclado (jsdom no trae PointerEvent).
  fireEvent.keyDown(screen.getByRole('button', { name: /Arriendo mensual sede norte/ }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: /Archivar/ }));
  expect(mockArchivar).not.toHaveBeenCalled();
  expect(await screen.findByText('¿Archivar «Arriendo mensual sede norte»?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Archivar' }));
  await waitFor(() => expect(mockArchivar).toHaveBeenCalledWith('p1'));
});

test('«Usar»: sin sucursal marca el error en el campo y no crea el asiento', async () => {
  renderConIdioma(<PlantillasAsientoPage />);
  await screen.findByText('Arriendo mensual sede norte');
  fireEvent.click(screen.getByRole('button', { name: 'Usar' }));
  expect(await screen.findByText('Usar plantilla')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Crear borrador' }));
  expect(await screen.findByText('Elige la sucursal del asiento.')).toBeTruthy();
  expect(mockAplicar).not.toHaveBeenCalled();
});

test('«Usar» con fecha y sucursal crea el borrador con ellas y abre el asiento', async () => {
  mockSucursal = 3;
  renderConIdioma(<PlantillasAsientoPage />);
  await screen.findByText('Arriendo mensual sede norte');
  fireEvent.click(screen.getByRole('button', { name: 'Usar' }));
  await screen.findByText('Crear borrador');
  fireEvent.click(screen.getByRole('button', { name: 'Crear borrador' }));
  await waitFor(() => expect(mockAplicar).toHaveBeenCalledWith('p1', 3, '2026-11-01T12:00:00-05:00', 'Canon de arrendamiento'));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/app/finanzas/contabilidad/asientos/77'));
});
