/**
 * @jest-environment jsdom
 *
 * Diálogos de «Anular devolución» (Figma 2719:190434, 2719:190511 y
 * 2719:190584) con los textos reales en español. Datos ficticios.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { DetalleDevolucion } from '@/lib/pos/devoluciones/detalleServidor';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/app/pos/devoluciones/8',
  useSearchParams: () => new URLSearchParams(),
}));

const pedirDiagnostico = jest.fn();
const enviarAnulacion = jest.fn();
jest.mock('@/lib/pos/devoluciones/clienteDevoluciones', () => {
  const real = jest.requireActual('@/lib/pos/devoluciones/clienteDevoluciones');
  return {
    ErrorPeticionDevoluciones: real.ErrorPeticionDevoluciones,
    pedirDiagnosticoAnulacion: (...a: unknown[]) => pedirDiagnostico(...a),
    enviarAnulacionDevolucion: (...a: unknown[]) => enviarAnulacion(...a),
  };
});
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 7 }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota' }) }));
const BASE_MONEDA = { code: 'COP', decimals: 0, locale: 'es-CO' };
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ ...BASE_MONEDA, formatear: (n: number) => `$ ${n}`, paraDocumento: () => BASE_MONEDA, resuelta: true }) }));
const toastSuccess = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ toastError: jest.fn(), toastSuccess: (...a: unknown[]) => toastSuccess(...a) }));

import { AnularDevolucionDialog } from '@/components/pos/devoluciones/AnularDevolucionDialog';
import { ErrorPeticionDevoluciones } from '@/lib/pos/devoluciones/clienteDevoluciones';

const DEV = {
  id: 8,
  numero: 'DEV-000008',
  fecha: '2026-09-23T15:42:00Z',
  estado: 'processed',
  metodo: 'cash',
  total: 89900,
  impuesto: 14354,
  notas: null,
  sucursal: { id: 3, nombre: 'Sucursal Principal' },
  usuario: { id: 'u1', nombre: 'Cajera de ejemplo' },
  motivo: { id: 1, codigo: 'TALLA', nombre: 'Talla incorrecta', afecta_inventario: true, requiere_foto: false, texto: '' },
  lineas: [
    { id: 1, producto: { id: 10, nombre: 'Tenis urbanos · talla 40', sku: 'TEN-040' }, linea_venta: 1, cantidad: 1, neto: 75546, impuesto: 14354, reintegro: 89900, repuesta: true, seriales: [] },
  ],
  unidades: 1,
  unidades_vendidas: 3,
  venta: { id: 'v1', fecha: null, total: 279700, estado: 'devuelta_parcial', devuelto_antes: 0, cliente: null, factura: { id: 'f1', numero: 'F-001482', estado: 'issued', total: 279700 }, cobros: [] },
  nota_credito: { id: 'nc-1', numero: 'NC-000033', total: -89900, estado: 'issued', einvoice_status: 'rejected', fecha: null },
  caja: { sesion_id: 482, movimiento: null },
  saldo_a_favor: null,
  asientos: [],
  historial: [],
} as unknown as DetalleDevolucion;

const DIAG = {
  return_id: 8,
  estado: 'processed',
  metodo: 'cash',
  total: 89900,
  tiene_permiso: true,
  nota: { id: 'nc-1', numero: 'NC-000033', estado_dian: 'rechazada', fecha_aceptacion: null },
  fecha_original: '2026-09-23',
  hoy: '2026-11-21',
  periodo_original_abierto: true,
  periodo_hoy_abierto: true,
  caja_abierta: 509,
  saldo_a_favor: null,
  asientos: [{ id: 20118, fecha: '2026-09-23T15:42:00Z', numero: '#20.118', memo: null }],
  bloqueo: null,
  caso: 'anulable',
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('nota rechazada, periodo abierto: aviso, qué se revierte, fecha y anula con motivo (2719:190434)', async () => {
  pedirDiagnostico.mockResolvedValue(DIAG);
  enviarAnulacion.mockResolvedValue({ return_id: 8, ya_anulada: false, asientos_pendientes: 0 });
  const onAnulada = jest.fn();
  renderConIdioma(<AnularDevolucionDialog abierto onAbiertoChange={jest.fn()} devolucion={DEV} onAnulada={onAnulada} />);
  expect(await screen.findByText('Se puede anular: la DIAN rechazó la nota crédito NC-000033.')).toBeTruthy();
  expect(screen.getByText('Se reversa con un asiento espejo: #20.118.')).toBeTruthy();
  expect(screen.getByText('La caja (sesión #509) registra el ingreso de $ 89900 que el cliente devuelve.')).toBeTruthy();
  const original = screen.getByRole('radio', { name: /Fecha original/ });
  expect(original.hasAttribute('disabled')).toBe(false);
  fireEvent.click(original);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'El cliente cambió de talla en la misma visita' } });
  fireEvent.click(screen.getByRole('button', { name: 'Anular devolución' }));
  await waitFor(() => expect(enviarAnulacion).toHaveBeenCalledWith(8, 'El cliente cambió de talla en la misma visita', 'original'));
  await waitFor(() => expect(onAnulada).toHaveBeenCalled());
  expect(toastSuccess).toHaveBeenCalledWith('DEV-000008 quedó anulada');
});

test('sin transmitir y periodo original cerrado: «Fecha original · cerrado» deshabilitada (2719:190511)', async () => {
  pedirDiagnostico.mockResolvedValue({ ...DIAG, periodo_original_abierto: false, nota: { ...DIAG.nota, estado_dian: 'sin_transmitir' } });
  renderConIdioma(<AnularDevolucionDialog abierto onAbiertoChange={jest.fn()} devolucion={DEV} onAnulada={jest.fn()} />);
  expect(await screen.findByText('Se puede anular: la nota crédito NC-000033 no se ha transmitido a la DIAN.')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Fecha original · cerrado' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/está cerrado\. Nunca se reversa dentro de un periodo cerrado/)).toBeTruthy();
});

test('nota aceptada por la DIAN: no se anula y ofrece registrar una venta nueva (2719:190584)', async () => {
  pedirDiagnostico.mockResolvedValue({ ...DIAG, caso: 'nota_aceptada', bloqueo: 'nota_aceptada_dian', nota: { ...DIAG.nota, estado_dian: 'aceptada' } });
  renderConIdioma(<AnularDevolucionDialog abierto onAbiertoChange={jest.fn()} devolucion={DEV} onAnulada={jest.fn()} />);
  expect(await screen.findByText('No se puede anular DEV-000008')).toBeTruthy();
  expect(screen.getByText('La nota crédito NC-000033 ya fue validada por la DIAN.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Registrar venta nueva' }));
  expect(push).toHaveBeenCalledWith('/app/pos/ventas/nuevo?devolucion=8');
});

test('efectivo sin caja abierta: bloqueado con la razón y el error del servidor traducido', async () => {
  pedirDiagnostico.mockResolvedValue({ ...DIAG, caso: 'bloqueada', bloqueo: 'efectivo_sin_caja', caja_abierta: null });
  renderConIdioma(<AnularDevolucionDialog abierto onAbiertoChange={jest.fn()} devolucion={DEV} onAnulada={jest.fn()} />);
  expect(await screen.findAllByText('El reintegro fue en efectivo: abre una caja para recibir el dinero que el cliente devuelve.')).not.toHaveLength(0);
  expect((screen.getByRole('button', { name: 'Anular devolución' }) as HTMLButtonElement).disabled).toBe(true);
});

test('error de la RPC al confirmar: se muestra traducido y no se cierra', async () => {
  pedirDiagnostico.mockResolvedValue(DIAG);
  enviarAnulacion.mockRejectedValue(new ErrorPeticionDevoluciones('stock_insuficiente', 409));
  const onAnulada = jest.fn();
  renderConIdioma(<AnularDevolucionDialog abierto onAbiertoChange={jest.fn()} devolucion={DEV} onAnulada={onAnulada} />);
  await screen.findByText('Qué se revierte');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Registrada por error' } });
  fireEvent.click(screen.getByRole('button', { name: 'Anular devolución' }));
  expect(await screen.findByText(/ya no está en el inventario de la sucursal/)).toBeTruthy();
  expect(onAnulada).not.toHaveBeenCalled();
});
