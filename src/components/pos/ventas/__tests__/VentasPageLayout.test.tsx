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
const pedirCifrasVentas = jest.fn();
jest.mock('@/lib/pos/ventas/clienteVentas', () => ({
  ...jest.requireActual('@/lib/pos/ventas/clienteVentas'),
  pedirVentas: (...a: unknown[]) => pedirVentas(...a),
  pedirCifrasVentas: (...a: unknown[]) => pedirCifrasVentas(...a),
  pedirPermisosVentas: jest.fn(() => new Promise(() => undefined)),
  pedirExportacionVentas: jest.fn(),
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 7,
  useOrganization: () => ({ organization: { id: 7, name: 'Mi empresa S.A.S.' }, isLoading: false }),
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ branchFilter: 3, branches: [{ id: 3, name: 'Sucursal Principal' }], isLoading: false }),
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
jest.mock('@/components/kit', () => ({
  ...jest.requireActual('@/components/kit'),
  BranchBadgeActiva: () => null,
}));

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
  desde_anterior: '2026-08-01',
  actual: { ventas: 1, total: 50000, ticket_promedio: 50000, impuestos: 0, facturado: 0, por_canal: {}, por_sucursal: {} },
  anterior: { ventas: 0, total: 0 },
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

  it('Documentos en una línea: el principal como chip y el resto como «+N»', async () => {
    params = new URLSearchParams();
    pedirVentas.mockResolvedValue({
      total: 1,
      filas: [{ ...FILA, numero: 'FACT-0707', tipo_numero: 'factura', factura_id: 'f1', cxc_id: 'x1', notas_credito: 1 }],
    });
    renderConIdioma(<VentasPage />);
    expect(await screen.findAllByText('+2')).not.toHaveLength(0);
    expect(screen.getByText(/2 documentos más: Cuenta por cobrar · 1 nota crédito/)).toBeTruthy();
  });
});
