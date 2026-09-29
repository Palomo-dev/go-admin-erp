/**
 * @jest-environment jsdom
 *
 * Listado de ventas del POS sin filtro de cliente (2026-09-28).
 *
 * `useListadoServidor` solo guarda los filtros con valor: sin `?cliente=` en
 * la URL, `l.filtros.cliente` es `undefined`. Con `clienteElegido` en null,
 * `clienteElegido?.id === l.filtros.cliente` era `undefined === undefined`
 * (true) y se leía `.nombre` de null: TypeError en el primer render y la
 * pantalla no abría. TypeScript no lo ve porque `filtros` es
 * `Record<string, string>`. Mismo error que ya se corrigió en el listado de
 * facturas de venta.
 */
import { screen, waitFor } from '@testing-library/react';
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

describe('VentasPage · filtro de cliente', () => {
  it('sin ?cliente= en la URL abre sin error y no pinta chip de cliente', async () => {
    params = new URLSearchParams();
    expect(() => renderConIdioma(<VentasPage />)).not.toThrow();
    await waitFor(() => expect(pedirVentas).toHaveBeenCalled());
    expect(String(pedirVentas.mock.calls.at(-1)?.[0] ?? '')).not.toContain('cliente=');
    // Tabla de escritorio y tarjeta móvil: el número sale en las dos.
    expect(await screen.findAllByText('V-0001')).not.toHaveLength(0);
  });

  it('con ?cliente= de una fila visible, el chip usa el nombre de esa fila', async () => {
    params = new URLSearchParams({ cliente: 'c1' });
    renderConIdioma(<VentasPage />);
    expect(await screen.findAllByText(/Cliente de mostrador/)).not.toHaveLength(0);
  });
});
