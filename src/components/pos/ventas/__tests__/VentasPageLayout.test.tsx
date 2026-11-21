/**
 * @jest-environment jsdom
 *
 * Listado de ventas del POS · layout aprobado en Figma (2026-11-20).
 *
 * El dueño la vio «descuadrada»: el rango de fechas iba metido dentro del
 * buscador (doble borde, «/» flotando) y la columna Documentos apilaba chips.
 * En Figma el buscador va solo, el periodo es el campo «Desde / Hasta» del
 * panel Filtros y se lee en el subtítulo; un periodo distinto del mes en curso
 * se ve como chip (mismo patrón que el listado de facturas de venta).
 */
import { screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { CifrasVentas, FilaVenta } from '@/lib/pos/ventas/listadoServidor';

let params = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/pos/ventas',
  useSearchParams: () => params,
}));

const pedirVentas = jest.fn();
const setSelectedBranch = jest.fn();
const pedirCifrasVentas = jest.fn();
jest.mock('@/lib/pos/ventas/clienteVentas', () => ({
  ...jest.requireActual('@/lib/pos/ventas/clienteVentas'),
  pedirVentas: (...a: unknown[]) => pedirVentas(...a),
  pedirCifrasVentas: (...a: unknown[]) => pedirCifrasVentas(...a),
  pedirCajerosVentas: jest.fn(async () => [{ id: 'u1', nombre: 'Laura Restrepo' }]),
  pedirPermisosVentas: jest.fn(() => new Promise(() => undefined)),
  pedirExportacionVentas: jest.fn(),
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 7,
  useOrganization: () => ({ organization: { id: 7, name: 'Mi empresa S.A.S.' }, isLoading: false }),
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ branchFilter: 3, branches: [{ id: 3, name: 'Sucursal Principal' }, { id: 4, name: 'Norte' }], isLoading: false, canSelectAll: true, setSelectedBranch }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ getToday: () => '2026-09-28', formatDate: (v: string | null) => v ?? '', timezone: 'America/Bogota' }),
}));
// Moneda cualquiera: la pantalla no cablea ninguna.
const BASE = { code: 'EUR', decimals: 0, locale: 'es-CO' };
const MONEDA = { ...BASE, formatear: (n: number) => String(n), paraDocumento: () => BASE, resuelta: true };
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => MONEDA }));
jest.mock('@/components/pos/cajas/comunesCaja', () => ({
  useFechaHoraCaja: () => (v: string | null | undefined) => String(v ?? ''),
  useMetodosPagoActivos: () => ['cash'],
}));
jest.mock('@/components/pos/cajas/paymentMethodLabels', () => ({ useEtiquetaMetodoPago: () => (m: string) => m }));
jest.mock('@/lib/documents/cliente', () => ({ imprimirDocumento: jest.fn(), guardarArchivo: jest.fn() }));
jest.mock('@/lib/services/clientesListadoService', () => ({ listarClientes: jest.fn() }));
jest.mock('@/components/ui/use-toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn(), toastWarning: jest.fn() }));
jest.mock('@/components/finanzas/pagos/RegistrarPagoConectado', () => ({ RegistrarPagoConectado: () => null }));
jest.mock('../AnularVentaDialog', () => ({ AnularVentaDialog: () => null }));

import { VentasPage } from '../VentasPage';

const FILA: FilaVenta = {
  id: 'v1',
  fecha: '2026-09-20T15:00:00Z',
  creada: '2026-09-20T15:00:00Z',
  total: 50000,
  saldo: 0,
  status: 'completed',
  payment_status: 'paid',
  estado: 'pagada' as FilaVenta['estado'],
  origen: 'pos' as FilaVenta['origen'],
  numero: 'V-0001',
  tipo_numero: 'pedido',
  factura_id: null,
  cxc_id: null,
  web_order_id: null,
  cliente: { id: 'c1', nombre: 'Cliente de mostrador', documento: null },
  cajero: { id: 'u1', nombre: 'Cajero' },
  sucursal: { id: 3, nombre: 'Sucursal Principal' },
  metodos: ['cash'],
  devuelto: 0,
  notas_credito: 0,
};

const CIFRAS = {
  desde: '2026-09-01',
  hasta: '2026-09-28',
  actual: {
    ventas: 48320500,
    transacciones: 1312,
    efectivas: 1309,
    pagadas: 1286,
    pendientes: 23,
    anuladas: 3,
    devueltas: 0,
    ticket_promedio: 36850,
    impuestos: 7712400,
    impuestos_detalle: [
      { codigo: 'IVA_19', tasa: 19, monto: 7402100 },
      { codigo: 'INC_8', tasa: 8, monto: 310300 },
    ],
  },
  anterior: { ventas: 43143303.57, transacciones: 1200 },
} as unknown as CifrasVentas;

beforeEach(() => {
  jest.clearAllMocks();
  pedirVentas.mockResolvedValue({ total: 1, filas: [FILA] });
  pedirCifrasVentas.mockResolvedValue(CIFRAS);
});

describe('VentasPage · layout de Figma', () => {
  it('el buscador va solo: el rango de fechas no está dentro de su caja', async () => {
    params = new URLSearchParams();
    renderConIdioma(<VentasPage />);
    await waitFor(() => expect(pedirVentas).toHaveBeenCalled());
    const buscador = screen.getByRole('search');
    expect(within(buscador).getByRole('searchbox')).toBeTruthy();
    expect(within(buscador).queryByRole('button', { name: /Periodo/ })).toBeNull();
  });

  it('el subtítulo muestra el periodo (mes en curso por defecto) y no hay chip de periodo', async () => {
    params = new URLSearchParams();
    renderConIdioma(<VentasPage />);
    expect(await screen.findAllByText(/1 al 28 de septiembre de 2026/)).not.toHaveLength(0);
    expect(screen.queryByText(/^Periodo:/)).toBeNull();
  });

  it('un periodo elegido a mano sale como un solo chip y en el subtítulo', async () => {
    params = new URLSearchParams({ desde: '2026-09-05', hasta: '2026-09-10' });
    renderConIdioma(<VentasPage />);
    expect(await screen.findByText('Periodo: 5 – 10 sep 2026')).toBeTruthy();
    expect(screen.getAllByText(/5 al 10 de septiembre de 2026/)).not.toHaveLength(0);
  });

  it('sin columna Documentos (no está en el Figma): sus enlaces viven en el ⋯', async () => {
    params = new URLSearchParams();
    renderConIdioma(<VentasPage />);
    await screen.findAllByText('V-0001');
    expect(screen.queryByRole('columnheader', { name: /Documentos/ })).toBeNull();
  });
});

describe('VentasPage · cierre del Figma (2026-11-20)', () => {
  it('cabecera: «Historial de ventas», N ventas encontradas · periodo · sucursal y «Exportar» visible', async () => {
    params = new URLSearchParams();
    renderConIdioma(<VentasPage />);
    expect(await screen.findByRole('heading', { name: 'Historial de ventas' })).toBeTruthy();
    expect(await screen.findAllByText(/1 venta encontrada · 1 al 28 de septiembre de 2026 · Sucursal Principal/)).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeTruthy();
  });

  it('KPI: ventas con variación, ticket, transacciones con su detalle e impuestos por impuesto', async () => {
    params = new URLSearchParams();
    renderConIdioma(<VentasPage />);
    expect(await screen.findByText('Ventas del periodo')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('+12 % frente al periodo anterior')).toBeTruthy());
    expect(screen.getByText(/sobre 1.309 transacciones/)).toBeTruthy();
    expect(screen.getByText('1.286 pagadas · 23 pendientes · 3 anuladas')).toBeTruthy();
    expect(screen.getByText('IVA 19 % 7402100 · INC 8 % 310300')).toBeTruthy();
  });

  it('las cifras piden los mismos filtros que la tabla (sin orden ni página)', async () => {
    params = new URLSearchParams({ pago: 'pending', saldo: '1', metodo: 'cash,card', origen: 'mesa' });
    renderConIdioma(<VentasPage />);
    await waitFor(() => expect(pedirCifrasVentas).toHaveBeenCalled());
    const tabla = new URLSearchParams(String(pedirVentas.mock.calls.at(-1)?.[0]));
    const cifras = new URLSearchParams(String(pedirCifrasVentas.mock.calls.at(-1)?.[0]));
    for (const k of ['pago', 'saldo', 'metodo', 'origen', 'desde', 'hasta', 'sucursal']) expect(cifras.get(k)).toBe(tabla.get(k));
    expect(cifras.get('pagina')).toBeNull();
    expect(tabla.get('saldo')).toBe('1');
    expect(tabla.get('metodo')).toBe('cash,card');
  });

  it('chips de los filtros nuevos y de la sucursal del header; quitar la sucursal vuelve a «Todas»', async () => {
    params = new URLSearchParams({ pago: 'pending', saldo: '1', devolucion: '1', sync: '1', metodo: 'cash,card', cajero: 'u1' });
    renderConIdioma(<VentasPage />);
    expect(await screen.findByText('Pago: Pendiente')).toBeTruthy();
    expect(screen.getByText('Con saldo pendiente')).toBeTruthy();
    expect(screen.getByText('Con devolución')).toBeTruthy();
    expect(screen.getByText('Pendientes de sincronizar')).toBeTruthy();
    expect(screen.getByText('Método: cash, card')).toBeTruthy();
    expect(await screen.findByText('Cajero: Laura Restrepo')).toBeTruthy();
    const chip = screen.getByText('Sucursal: Sucursal Principal');
    const quitar = within(chip.closest('[data-chip], li, span, div') as HTMLElement).queryAllByRole('button')[0] ?? screen.getByRole('button', { name: /Sucursal: Sucursal Principal/ });
    quitar.click();
    expect(setSelectedBranch).toHaveBeenCalledWith('all');
  });

  it('segunda línea del N.º y del cliente, y origen con color', async () => {
    params = new URLSearchParams();
    pedirVentas.mockResolvedValue({
      total: 3,
      filas: [
        { ...FILA, id: 'v2', numero: 'F-001480', saldo: 640000, estado: 'pago_parcial', cliente: { id: 'c2', nombre: 'Distribuciones', documento: '901455221-3', tipo_documento: 'NIT' } },
        { ...FILA, id: 'v3', numero: 'F-001481', origen: 'mesa', mesa: '7', cliente: null, cajero: { id: 'u1', nombre: 'Laura Restrepo' } },
        { ...FILA, id: 'v4', numero: 'P-0002144', origen: 'web', cliente: { id: 'c3', nombre: 'Julián', documento: null, telefono: '318 455 20 11' } },
      ],
    });
    renderConIdioma(<VentasPage />);
    expect(await screen.findAllByText('saldo 640000')).not.toHaveLength(0);
    expect(screen.getAllByText('NIT 901.455.221-3')).not.toHaveLength(0);
    expect(screen.getAllByText('Mesa 7 · Laura R.')).not.toHaveLength(0);
    expect(screen.getAllByText('pedido web')).not.toHaveLength(0);
    expect(screen.getAllByText('318 455 20 11')).not.toHaveLength(0);
    const mesa = screen.getAllByText('Mesa').find((e) => !!e.closest('[class*="warning"]'));
    expect(mesa).toBeTruthy();
  });
});
