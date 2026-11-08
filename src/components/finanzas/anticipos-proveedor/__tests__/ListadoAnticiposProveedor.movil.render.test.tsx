/**
 * @jest-environment jsdom
 *
 * Anticipos a proveedores a 390 px: el buscador va en su propia fila y las pestañas de estado
 * («Todos · Con saldo · Aplicado · Anulado») debajo, en un carril con desplazamiento horizontal.
 * Antes compartían fila y el control segmentado aplastaba el buscador hasta dejar solo la lupa
 * encima de «Todos». Datos inventados.
 */
import { screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import type { RespuestaListadoAnticipos } from '@/lib/finanzas/anticiposProveedor/contrato';
import { ListadoAnticiposProveedor } from '../ListadoAnticiposProveedor';

const mockListar = jest.fn<Promise<RespuestaListadoAnticipos>, []>();

jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn(), toastError: jest.fn(), toastSuccess: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/anticipos-proveedor',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/finanzas/usePermisosFinanzas', () => ({
  usePermisosFinanzas: () => ({ ver: true, crear: true, editar: true, anular: true, aprobar: true, cargando: false }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP', formatear: (v: number) => `$ ${v}` }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDate: () => '7 nov 2026' }),
}));
// Los diálogos (cerrados) no cuentan para la disposición de la lista.
jest.mock('@/components/finanzas/saldos-a-favor', () => ({
  AplicarSaldoDialog: () => null,
  DevolverSaldoDialog: () => null,
  RegistrarAnticipoDialog: () => null,
}));
jest.mock('../AnularAnticipoDialog', () => ({ AnularAnticipoDialog: () => null }));
jest.mock('../anticiposProveedorService', () => ({
  ADAPTADOR_PROVEEDOR: {},
  anticiposProveedorService: { listar: () => mockListar(), conciliacion: jest.fn() },
}));

beforeEach(() => {
  simularAncho(390);
  mockListar.mockReset();
});

async function comprobarFilas() {
  const buscador = await screen.findByRole('searchbox');
  const pestanas = screen.getByRole('radiogroup', { name: 'Estado' });
  // Las pestañas no comparten contenedor de fila con el buscador…
  const filaBuscador = buscador.closest('.flex.items-center') as HTMLElement;
  expect(filaBuscador).toBeTruthy();
  expect(filaBuscador.contains(pestanas)).toBe(false);
  // …y van en un carril que se desplaza en horizontal si no caben.
  expect(pestanas.parentElement?.className).toContain('overflow-x-auto');
  expect(pestanas.className).toContain('w-max');
  for (const nombre of ['Todos', 'Con saldo', 'Aplicado', 'Anulado']) {
    expect(screen.getByRole('radio', { name: nombre })).toBeTruthy();
  }
}

describe('Anticipos a proveedores en el celular (390 px)', () => {
  test('con el aviso «pendiente de activar»: buscador en su fila y pestañas debajo', async () => {
    mockListar.mockResolvedValue({ pendiente: true, filas: [], estadoCuenta: null } as unknown as RespuestaListadoAnticipos);
    renderConIdioma(<ListadoAnticiposProveedor />);
    await comprobarFilas();
  });

  test('con anticipos: la misma disposición', async () => {
    mockListar.mockResolvedValue({
      pendiente: false,
      estadoCuenta: { estado: 'ok', cuenta: '13300501', configurada: '13300501', sugerida: '13300501' },
      filas: [],
    } as unknown as RespuestaListadoAnticipos);
    renderConIdioma(<ListadoAnticiposProveedor />);
    await comprobarFilas();
  });
});
