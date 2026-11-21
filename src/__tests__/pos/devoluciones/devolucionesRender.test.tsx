/**
 * @jest-environment jsdom
 *
 * Devoluciones del POS rediseñadas (Figma `873:573998` listado, estados
 * `873:575889`/`873:577675` y detalle `874:578562`): render con los textos
 * reales en español. Datos ficticios; sin organizaciones reales.
 */
import { screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { CifrasDevoluciones, FilaDevolucion } from '@/lib/pos/devoluciones/listadoServidor';
import type { DetalleDevolucion } from '@/lib/pos/devoluciones/detalleServidor';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/pos/devoluciones',
  useSearchParams: () => new URLSearchParams(),
}));

const pedirDevoluciones = jest.fn();
const pedirCifras = jest.fn();
const pedirDetalle = jest.fn();
jest.mock('@/lib/pos/devoluciones/clienteDevoluciones', () => {
  const real = jest.requireActual('@/lib/pos/devoluciones/clienteDevoluciones');
  return {
    ErrorPeticionDevoluciones: real.ErrorPeticionDevoluciones,
    pedirDevoluciones: (...a: unknown[]) => pedirDevoluciones(...a),
    pedirCifrasDevoluciones: (...a: unknown[]) => pedirCifras(...a),
    pedirDetalleDevolucion: (...a: unknown[]) => pedirDetalle(...a),
    pedirVentasParaDevolver: jest.fn(async () => []),
    pedirCajaParaDevolucion: jest.fn(async () => null),
  };
});
const permisos = { anular: false, devolver: true, vender: true, exportar: true };
jest.mock('@/lib/pos/ventas/clienteVentas', () => ({ pedirPermisosVentas: jest.fn(async () => permisos) }));
jest.mock('@/components/pos/devoluciones/motivos/returnReasonsService', () => ({
  ReturnReasonsService: { getAll: jest.fn(async () => [{ id: 1, code: 'TALLA', name: 'Talla incorrecta' }]), getActive: jest.fn(async () => []) },
}));
jest.mock('@/components/pos/devoluciones/devolucionesService', () => ({ DevolucionesService: {} }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 7,
  useOrganization: () => ({ organization: { id: 7, name: 'Mi empresa S.A.S.' }, isLoading: false }),
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ branchFilter: 3, branches: [{ id: 3, name: 'Sucursal Principal' }], isLoading: false, canSelectAll: true, setSelectedBranch: jest.fn() }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ getToday: () => '2026-09-23', formatDate: (v: string | null) => v ?? '', timezone: 'America/Bogota' }),
}));
const BASE = { code: 'EUR', decimals: 0, locale: 'es-CO' };
const MONEDA = { ...BASE, formatear: (n: number) => `$ ${n}`, paraDocumento: () => BASE, resuelta: true };
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => MONEDA }));
jest.mock('@/components/pos/cajas/comunesCaja', () => ({ useFechaHoraCaja: () => (v: string | null | undefined) => String(v ?? '') }));
jest.mock('@/components/pos/cajas/paymentMethodLabels', () => ({ useEtiquetaMetodoPago: () => (m: string) => m }));
jest.mock('@/lib/documents/cliente', () => ({ imprimirDocumento: jest.fn(), guardarArchivo: jest.fn() }));
jest.mock('@/components/ui/use-toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));

import { DevolucionesPage } from '@/components/pos/devoluciones/DevolucionesPage';
import { DevolucionDetallePage } from '@/components/pos/devoluciones/DevolucionDetallePage';
import { ErrorPeticionDevoluciones } from '@/lib/pos/devoluciones/clienteDevoluciones';

const FILA: FilaDevolucion = {
  id: 8,
  fecha: '2026-09-23T15:42:00Z',
  estado: 'processed',
  metodo: 'cash',
  caja_sesion_id: 482,
  total: 89900,
  impuesto: 14354,
  unidades: 1,
  unidades_vendidas: 3,
  motivo: { id: 1, codigo: 'TALLA', nombre: 'Talla incorrecta', texto: 'Talla incorrecta' },
  venta: { id: 'aaaaaaaa-0000-4000-8000-000000000001', factura_id: 'bbbbbbbb-0000-4000-8000-000000000001', factura_numero: 'F-001482' },
  nota_credito: { id: 'cccccccc-0000-4000-8000-000000000001', numero: 'NC-000033', estado: 'issued' },
  cliente: { id: 'dddddddd-0000-4000-8000-000000000001', nombre: 'Cliente de ejemplo', tipo_documento: 'CC', documento: '1020334556' },
  sucursal: { id: 3, nombre: 'Sucursal Principal' },
};

const CIFRAS: CifrasDevoluciones = {
  desde: '2026-09-01',
  hasta: '2026-09-23',
  devuelto: 1284300,
  devoluciones: 8,
  procesadas: 8,
  unidades: 11,
  parciales: 3,
  por_metodo: [{ metodo: 'cash', total: 1000000, n: 5 }, { metodo: 'store_credit', total: 284300, n: 3 }],
  ventas: 48320500,
  motivo_principal: { id: 1, nombre: 'Talla incorrecta', codigo: 'TALLA', n: 4 },
};

beforeEach(() => {
  jest.clearAllMocks();
  pedirDevoluciones.mockResolvedValue({ total: 1, filas: [FILA], pagina: 1, tamano: 25 });
  pedirCifras.mockResolvedValue(CIFRAS);
});

describe('listado de devoluciones', () => {
  test('pinta la fila con sus documentos, unidades «1 de 3», método de caja y los KPI', async () => {
    renderConIdioma(<DevolucionesPage />);
    expect((await screen.findAllByText('DEV-000008')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('F-001482').length).toBeGreaterThan(0);
    expect(screen.getByText('NC-000033')).toBeTruthy();
    expect(screen.getByText('1 de 3')).toBeTruthy();
    expect(screen.getAllByText('Efectivo · Caja #482').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Procesada').length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getAllByText('$ 1284300').length).toBeGreaterThan(0));
    expect(screen.getByText('11 unidades · 3 parciales')).toBeTruthy();
    expect(screen.getAllByText('Talla incorrecta').length).toBeGreaterThan(0);
    expect(screen.getByText('4 de 8 devoluciones')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nueva devolución' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Motivos/ }).getAttribute('href')).toBe('/app/pos/devoluciones/motivos');
    // La consulta lleva la sucursal del header y el mes en curso de la organización.
    const consulta = String(pedirDevoluciones.mock.calls[0][0]);
    expect(consulta).toContain('sucursal=3');
    expect(consulta).toContain('desde=2026-09-01');
    expect(consulta).toContain('hasta=2026-09-23');
  });

  test('vacío: invita a crear la primera devolución', async () => {
    pedirDevoluciones.mockResolvedValue({ total: 0, filas: [], pagina: 1, tamano: 25 });
    renderConIdioma(<DevolucionesPage />);
    expect((await screen.findAllByText('Aún no hay devoluciones')).length).toBeGreaterThan(0);
  });

  test('sin permiso: el estado del kit, no un error genérico', async () => {
    pedirDevoluciones.mockRejectedValue(new ErrorPeticionDevoluciones('sin_permiso', 403));
    renderConIdioma(<DevolucionesPage />);
    expect((await screen.findAllByText('No tienes acceso a las devoluciones')).length).toBeGreaterThan(0);
  });
});

const DETALLE: DetalleDevolucion = {
  id: 8,
  numero: 'DEV-000008',
  fecha: '2026-09-23T15:42:00Z',
  estado: 'processed',
  metodo: 'cash',
  total: 89900,
  impuesto: 14354,
  notas: 'Cambia por talla 41 la próxima semana',
  sucursal: { id: 3, nombre: 'Sucursal Principal' },
  usuario: { id: 'u1', nombre: 'Cajera de ejemplo' },
  motivo: { id: 1, codigo: 'TALLA', nombre: 'Talla incorrecta', afecta_inventario: true, requiere_foto: false, texto: 'Talla incorrecta' },
  lineas: [
    { id: 1, producto: { id: 5, nombre: 'Tenis urbanos · talla 40', sku: 'TEN-040' }, linea_venta: 1, cantidad: 1, neto: 75546, impuesto: 14354, reintegro: 89900, repuesta: true, seriales: [] },
  ],
  unidades: 1,
  unidades_vendidas: 3,
  venta: {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    fecha: '2026-09-22T14:14:00Z',
    total: 279700,
    estado: 'devuelta_parcial',
    devuelto_antes: 0,
    cliente: { id: 'dddddddd-0000-4000-8000-000000000001', nombre: 'Cliente de ejemplo', tipo_documento: 'CC', documento: '1020334556' },
    factura: { id: 'bbbbbbbb-0000-4000-8000-000000000001', numero: 'F-001482', estado: 'issued', total: 279700 },
    cobros: [{ id: 'p1', metodo: 'cash', monto: 279700, fecha: '2026-09-22T14:14:00Z', estado: 'completed' }],
  },
  nota_credito: { id: 'cccccccc-0000-4000-8000-000000000001', numero: 'NC-000033', total: -89900, estado: 'issued', einvoice_status: null, fecha: '2026-09-23T15:43:00Z' },
  caja: { sesion_id: 482, movimiento: { id: 90, monto: 89900, fecha: '2026-09-23T15:42:00Z' } },
  saldo_a_favor: null,
  asientos: [{ id: 20118, fecha: '2026-09-23T15:42:00Z', memo: 'Reintegro en efectivo', numero: '#20118' }],
  historial: [
    { tipo: 'creada', fecha: '2026-09-23T15:42:00Z', usuario: 'Cajera de ejemplo' },
    { tipo: 'egreso_caja', fecha: '2026-09-23T15:42:01Z', sesion: 482 },
  ],
};

describe('detalle de una devolución', () => {
  test('cabecera, cadena, productos, reintegro con enlaces, venta original y motivo', async () => {
    pedirDetalle.mockResolvedValue(DETALLE);
    renderConIdioma(<DevolucionDetallePage devolucionId="8" />);
    expect(await screen.findByRole('heading', { name: 'Devolución DEV-000008' })).toBeTruthy();
    expect(screen.getByText('Parcial · 1 de 3 unidades')).toBeTruthy();
    expect(screen.getAllByText('Tenis urbanos · talla 40').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Repuesto').length).toBeGreaterThan(0);
    expect(screen.getByText('Efectivo · Caja #482')).toBeTruthy();
    expect(screen.getByRole('link', { name: /NC-000033 · \$ -89900/ }).getAttribute('href')).toBe('/app/finanzas/facturas-venta/cccccccc-0000-4000-8000-000000000001');
    expect(screen.getByText('Venta original')).toBeTruthy();
    // En la cadena (badge de la venta) y en «Estado de la venta».
    expect(screen.getAllByText('Devuelta parcial').length).toBeGreaterThan(1);
    expect(screen.getByText('Talla incorrecta (TALLA)')).toBeTruthy();
    expect(screen.getByText('Cambia por talla 41 la próxima semana')).toBeTruthy();
    expect(screen.getByText('Egreso de caja registrado en la sesión #482')).toBeTruthy();
  });

  test('devolución inexistente: estado vacío con salida al listado', async () => {
    pedirDetalle.mockRejectedValue(new ErrorPeticionDevoluciones('devolucion_no_encontrada', 404));
    renderConIdioma(<DevolucionDetallePage devolucionId="999" />);
    expect((await screen.findAllByText('Esta devolución no existe')).length).toBeGreaterThan(0);
  });
});

describe('nueva devolución · buscar la venta', () => {
  test('lista las ventas, la devuelta por completo sin «Elegir» y elegir devuelve la venta', async () => {
    const { pedirVentasParaDevolver } = jest.requireMock('@/lib/pos/devoluciones/clienteDevoluciones') as { pedirVentasParaDevolver: jest.Mock };
    const ventas = [
      { id: 'v1', fecha: '2026-09-22T14:00:00Z', total: 279700, factura_id: 'f1', numero: 'F-001482', sucursal_id: 3, cliente: { id: 'c1', nombre: 'Cliente de ejemplo', tipo_documento: null, documento: null }, productos: 3, unidades: 3, devueltas: 0 },
      { id: 'v2', fecha: '2026-09-20T14:00:00Z', total: 245000, factura_id: 'f2', numero: 'F-001470', sucursal_id: 3, cliente: null, productos: 2, unidades: 2, devueltas: 2 },
      { id: 'v3', fecha: '2026-09-19T14:00:00Z', total: 144000, factura_id: 'f3', numero: 'F-001455', sucursal_id: 3, cliente: null, productos: 4, unidades: 4, devueltas: 1 },
    ];
    pedirVentasParaDevolver.mockResolvedValue(ventas);
    const onElegir = jest.fn();
    const { NuevaDevolucionDialog } = await import('@/components/pos/devoluciones/NuevaDevolucionDialog');
    renderConIdioma(<NuevaDevolucionDialog abierto onAbiertoChange={jest.fn()} sucursal={3} onElegir={onElegir} />);
    expect(await screen.findByText('F-001482 · Cliente de ejemplo')).toBeTruthy();
    expect(screen.getByText('Ya devuelta por completo')).toBeTruthy();
    expect(screen.getByText(/1 unidad ya devuelta/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Elegir/ })).toHaveLength(2);
    screen.getByRole('button', { name: 'Elegir F-001482 · Cliente de ejemplo' }).click();
    expect(onElegir).toHaveBeenCalledWith(ventas[0]);
    expect(pedirVentasParaDevolver).toHaveBeenCalledWith('', 3, expect.anything());
  });
});

describe('motivos de devolución', () => {
  test('la columna «Usos» y un motivo en uso no se puede borrar', async () => {
    const { ReturnReasonsList } = await import('@/components/pos/devoluciones/motivos/ReturnReasonsList');
    const motivo = (id: number, code: string, name: string, activo = true) => ({
      id,
      organization_id: 7,
      code,
      name,
      requires_photo: false,
      affects_inventory: true,
      is_active: activo,
      display_order: id,
      created_at: '2026-09-01T00:00:00Z',
    });
    renderConIdioma(
      <ReturnReasonsList reasons={[motivo(1, 'TALLA', 'Talla incorrecta'), motivo(2, 'VENCIDO', 'Producto vencido', false)]} loading={false} usos={{ 1: 4 }} onEdit={jest.fn()} onRefresh={jest.fn()} />,
    );
    expect(screen.getAllByText('TALLA').length).toBeGreaterThan(0);
    expect(screen.getByRole('columnheader', { name: /Usos/ })).toBeTruthy();
    expect(screen.getAllByText('Activo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inactivo').length).toBeGreaterThan(0);
  });
});
