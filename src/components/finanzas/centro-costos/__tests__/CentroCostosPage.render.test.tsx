/**
 * @jest-environment jsdom
 *
 * «Centros de costo — árbol» (Figma 2327:125607), «Aplicar plantilla de
 * centros» (2327:126295) y «Nueva distribución» (2327:126356). Caracteriza las
 * acciones que ya tenía la pantalla vieja: crear, hijo, activar y desactivar,
 * plantilla con vista previa y distribución que suma 100 %. Servicio simulado:
 * nada toca la base. Datos inventados.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { CentroCostosPage } from '../CentroCostosPage';

const mockGetAll = jest.fn();
const mockDistribuciones = jest.fn();
const mockDesactivar = jest.fn();
const mockSembrar = jest.fn();
const mockGuardarDist = jest.fn();
const mockCreate = jest.fn();

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/centro-costos',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranchOpcional: () => ({ branches: [{ id: 1, name: 'Sede norte', organization_id: 10 }] }),
}));
jest.mock('../CostCenterService', () => ({
  CostCenterService: {
    getAll: (...a: unknown[]) => mockGetAll(...a),
    distribuciones: (...a: unknown[]) => mockDistribuciones(...a),
    desactivar: (...a: unknown[]) => mockDesactivar(...a),
    sembrar: (...a: unknown[]) => mockSembrar(...a),
    guardarDistribucion: (...a: unknown[]) => mockGuardarDist(...a),
    create: (...a: unknown[]) => mockCreate(...a),
    update: jest.fn(),
  },
}));

const centro = (id: string, code: string, name: string, parent_id: string | null, extra = {}) => ({
  id,
  organization_id: 10,
  code,
  name,
  parent_id,
  branch_id: null,
  level: null,
  type: null,
  template_key: null,
  is_default: false,
  is_active: true,
  created_at: '',
  updated_at: '',
  sucursal: null,
  ...extra,
});

const CENTROS = [
  centro('a', '100', 'Administración', null),
  centro('a1', '110', 'Gerencia', 'a'),
  centro('b', '200', 'Ventas', null, { branch_id: 1, sucursal: 'Sede norte' }),
  centro('b1', '210', 'Mostrador', 'b', { branch_id: 1, sucursal: 'Sede norte' }),
  centro('b2', '220', 'Domicilios', 'b', { branch_id: 1, sucursal: 'Sede norte' }),
];

async function tabla() {
  return within(await screen.findByRole('table', { name: 'Centros de costo' }));
}

beforeEach(() => {
  simularAncho(375);
  jest.clearAllMocks();
  mockGetAll.mockResolvedValue(CENTROS);
  mockDistribuciones.mockResolvedValue([
    { id: 'd1', nombre: 'Gastos compartidos', activo: true, lineas: [{ cost_center_id: 'b1', porcentaje: 60 }, { cost_center_id: 'b2', porcentaje: 40 }] },
  ]);
  mockDesactivar.mockResolvedValue(undefined);
  mockGuardarDist.mockResolvedValue('d2');
  mockSembrar.mockResolvedValue({ creados: 0, ya_existian: 1, previstos: 2, centros: [
    { code: '100', name: 'Administración', accion: 'existia' },
    { code: '300', name: 'Operación', accion: 'crear' },
  ] });
});

describe('Centros de costo', () => {
  test('pinta el árbol ordenado con sucursal y estado, y el reparto de cada distribución', async () => {
    renderConIdioma(<CentroCostosPage />);
    const t = await tabla();
    await t.findByText('100 · Administración');
    const filas = t.getAllByRole('row').map((f) => f.textContent ?? '').filter((x) => x.includes('·'));
    expect(filas[0]).toContain('100 · Administración');
    expect(filas[1]).toContain('110 · Gerencia');
    expect(filas[2]).toContain('Sede norte');
    expect(t.getAllByText('Activo')).toHaveLength(5);
    const dist = within(await screen.findByRole('table', { name: 'Distribuciones' }));
    expect(dist.getByText('Mostrador 60 % · Domicilios 40 %')).toBeTruthy();
  });

  test('sin centros: explica qué es un centro y ofrece la plantilla', async () => {
    mockGetAll.mockResolvedValue([]);
    renderConIdioma(<CentroCostosPage />);
    expect(await screen.findByText('Aún no hay centros de costo')).toBeTruthy();
    expect(screen.getByText(/reparten los gastos por área/)).toBeTruthy();
  });

  test('error al cargar: no se muestra como vacío y se puede reintentar', async () => {
    mockGetAll.mockRejectedValueOnce(new Error('caída'));
    renderConIdioma(<CentroCostosPage />);
    const reintentar = await screen.findAllByRole('button', { name: /Reintentar/ });
    expect(screen.queryByText('Aún no hay centros de costo')).toBeNull();
    fireEvent.click(reintentar[0]);
    await waitFor(() => expect(mockGetAll).toHaveBeenCalledTimes(2));
  });

  test('desactivar pide confirmación y no borra', async () => {
    renderConIdioma(<CentroCostosPage />);
    const fila = (await tabla()).getByText('210 · Mostrador').closest('tr') as HTMLElement;
    fireEvent.click(within(fila).getAllByRole('button').at(-1) as HTMLElement);
    fireEvent.click(await screen.findByText('Desactivar'));
    const dialogo = await screen.findByRole('dialog', { name: 'Desactivar centro de costo' });
    expect(within(dialogo).getByText(/210 · Mostrador/)).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(mockDesactivar).toHaveBeenCalledWith('b1', false));
  });

  test('aplicar plantilla muestra la vista previa antes de crear', async () => {
    renderConIdioma(<CentroCostosPage />);
    await tabla();
    fireEvent.click(screen.getAllByRole('button', { name: 'Aplicar plantilla' })[0]);
    const dialogo = await screen.findByRole('dialog');
    expect(await within(dialogo).findByText('300')).toBeTruthy();
    expect(within(dialogo).getByText('Se creará')).toBeTruthy();
    expect(within(dialogo).getByText('Ya existe')).toBeTruthy();
    expect(mockSembrar).toHaveBeenCalledWith('base', false);
  });

  test('nueva distribución: Guardar solo con suma 100 % y manda las líneas a la RPC', async () => {
    renderConIdioma(<CentroCostosPage />);
    await tabla();
    fireEvent.click(screen.getByRole('button', { name: 'Nueva distribución' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.change(within(dialogo).getByPlaceholderText('Gastos compartidos'), { target: { value: 'Domicilios y mostrador' } });
    fireEvent.change(within(dialogo).getByLabelText('Centro de la línea 1'), { target: { value: 'b1' } });
    fireEvent.change(within(dialogo).getByLabelText('Centro de la línea 2'), { target: { value: 'b2' } });
    fireEvent.change(within(dialogo).getByLabelText('Porcentaje de la línea 2'), { target: { value: '30' } });
    expect(within(dialogo).getByText('Suma 90 %')).toBeTruthy();
    const guardar = within(dialogo).getByRole('button', { name: 'Guardar' }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText('Porcentaje de la línea 2'), { target: { value: '40' } });
    expect(within(dialogo).getByText('Suma 100 %')).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockGuardarDist).toHaveBeenCalledWith(
        'Domicilios y mostrador',
        [{ cost_center_id: 'b1', porcentaje: 60 }, { cost_center_id: 'b2', porcentaje: 40 }],
        null,
      ),
    );
  });

  test.each(['en', 'fr', 'pt'] as const)('%s: carga con sus textos', async (idioma) => {
    renderConIdioma(<CentroCostosPage />, { idioma });
    expect(await screen.findAllByText('100 · Administración')).not.toHaveLength(0);
  });
});
