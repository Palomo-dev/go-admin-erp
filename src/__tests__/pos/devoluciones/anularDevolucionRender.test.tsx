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
const pedirDetalle = jest.fn();
const reintentar = jest.fn();
const enviarAnulacion = jest.fn();
jest.mock('@/lib/pos/devoluciones/clienteDevoluciones', () => {
  const real = jest.requireActual('@/lib/pos/devoluciones/clienteDevoluciones');
  return {
    ErrorPeticionDevoluciones: real.ErrorPeticionDevoluciones,
    pedirDiagnosticoAnulacion: (...a: unknown[]) => pedirDiagnostico(...a),
    enviarAnulacionDevolucion: (...a: unknown[]) => enviarAnulacion(...a),
    pedirDetalleDevolucion: (...a: unknown[]) => pedirDetalle(...a),
  };
});
jest.mock('@/lib/finanzas/notas/clienteNotas', () => ({ reintentarEnvioDian: (...a: unknown[]) => reintentar(...a) }));
jest.mock('@/components/pos/cajas/comunesCaja', () => ({ useFechaHoraCaja: () => (v: string | null | undefined) => String(v ?? '') }));
jest.mock('@/components/pos/cajas/paymentMethodLabels', () => ({ useEtiquetaMetodoPago: () => (m: string) => m }));
jest.mock('@/lib/documents/cliente', () => ({ imprimirDocumento: jest.fn(), guardarArchivo: jest.fn() }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 7 }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota' }) }));
const BASE_MONEDA = { code: 'COP', decimals: 0, locale: 'es-CO' };
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ ...BASE_MONEDA, formatear: (n: number) => `$ ${n}`, paraDocumento: () => BASE_MONEDA, resuelta: true }) }));
const toastSuccess = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ toastError: jest.fn(), toastSuccess: (...a: unknown[]) => toastSuccess(...a) }));

import { AnularDevolucionDialog } from '@/components/pos/devoluciones/AnularDevolucionDialog';
import { DevolucionDetallePage } from '@/components/pos/devoluciones/DevolucionDetallePage';
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
  // Sin marcar que la mercancía vuelve al cliente no se envía nada.
  fireEvent.click(screen.getByRole('button', { name: 'Anular devolución' }));
  expect(await screen.findByText(/Marca que el cliente se lleva otra vez la mercancía/)).toBeTruthy();
  expect(enviarAnulacion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'El cliente se lleva otra vez la mercancía.' }));
  fireEvent.click(screen.getByRole('button', { name: 'Anular devolución' }));
  await waitFor(() =>
    expect(enviarAnulacion).toHaveBeenCalledWith(8, 'El cliente cambió de talla en la misma visita', 'original', { saldoUsado: false, mercanciaVuelve: true }),
  );
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
  expect(screen.getByText('La venta nueva queda enlazada a esta devolución: aparece en la cadena Venta → Devolución → NC → Venta nueva.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Registrar venta nueva' }));
  expect(push).toHaveBeenCalledWith('/app/pos/ventas/nuevo?devolucion=8');
});

test('efectivo sin caja abierta: bloqueado con la razón y el error del servidor traducido', async () => {
  pedirDiagnostico.mockResolvedValue({ ...DIAG, caso: 'bloqueada', bloqueo: 'efectivo_sin_caja', caja_abierta: null });
  renderConIdioma(<AnularDevolucionDialog abierto onAbiertoChange={jest.fn()} devolucion={DEV} onAnulada={jest.fn()} />);
  expect(await screen.findAllByText(/El reintegro fue en efectivo y el dinero que el cliente devuelve tiene que entrar a una caja\. Abre la caja/)).not.toHaveLength(0);
  expect((screen.getByRole('button', { name: 'Anular devolución' }) as HTMLButtonElement).disabled).toBe(true);
});

test('error de la RPC al confirmar: se muestra traducido y no se cierra', async () => {
  pedirDiagnostico.mockResolvedValue(DIAG);
  enviarAnulacion.mockRejectedValue(new ErrorPeticionDevoluciones('stock_insuficiente', 409));
  const onAnulada = jest.fn();
  renderConIdioma(<AnularDevolucionDialog abierto onAbiertoChange={jest.fn()} devolucion={DEV} onAnulada={onAnulada} />);
  await screen.findByText('Qué se revierte');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Registrada por error' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'El cliente se lleva otra vez la mercancía.' }));
  fireEvent.click(screen.getByRole('button', { name: 'Anular devolución' }));
  expect(await screen.findByText(/ya no está en el inventario de la sucursal/)).toBeTruthy();
  expect(onAnulada).not.toHaveBeenCalled();
});

test('saldo a favor ya usado: aviso, línea de cartera y doble confirmación (Figma 2729:192869)', async () => {
  pedirDiagnostico.mockResolvedValue({
    ...DIAG,
    metodo: 'store_credit',
    caja_abierta: null,
    saldo_a_favor: {
      id: 's1',
      monto: 120000,
      disponible: 40000,
      usado: 80000,
      usos: [{ factura_id: 'f9', numero: 'FV-1042', monto: 80000 }],
      cliente: { id: 'c1', nombre: 'Cliente de prueba' },
    },
  });
  enviarAnulacion.mockResolvedValue({ return_id: 8, ya_anulada: false, asientos_pendientes: 0, saldo_usado: 80000 });
  renderConIdioma(<AnularDevolucionDialog abierto onAbiertoChange={jest.fn()} devolucion={DEV} onAnulada={jest.fn()} />);
  expect(await screen.findByText('El cliente ya usó $ 80000 del saldo a favor')).toBeTruthy();
  expect(screen.getByText(/cuenta por cobrar a Cliente de prueba en su cartera.*FV-1042/)).toBeTruthy();
  expect(screen.getByText('El saldo a favor sin usar ($ 40000) se cancela y lo usado ($ 80000) pasa a cuenta por cobrar del cliente.')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Registrada por error' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'El cliente se lleva otra vez la mercancía.' }));
  fireEvent.click(screen.getByRole('button', { name: 'Anular devolución' }));
  expect(await screen.findByText('Confirma que $ 80000 quedarán como cuenta por cobrar al cliente.')).toBeTruthy();
  expect(enviarAnulacion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Entiendo que $ 80000 quedarán como cuenta por cobrar al cliente.' }));
  fireEvent.click(screen.getByRole('button', { name: 'Anular devolución' }));
  await waitFor(() => expect(enviarAnulacion).toHaveBeenCalledWith(8, 'Registrada por error', 'hoy', { saldoUsado: true, mercanciaVuelve: true }));
});

test('la mercancía se queda en la bodega: el enlace lleva a registrar una venta nueva', async () => {
  pedirDiagnostico.mockResolvedValue(DIAG);
  renderConIdioma(<AnularDevolucionDialog abierto onAbiertoChange={jest.fn()} devolucion={DEV} onAnulada={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'registra una venta nueva' }));
  expect(push).toHaveBeenCalledWith('/app/pos/ventas/nuevo?devolucion=8');
});

describe('detalle: venta nueva en la cadena y reenvío de la nota crédito', () => {
  const conReventa = {
    ...DEV,
    nota_credito: { ...DEV.nota_credito!, envio: { job_id: 'job-9', estado: 'rejected' } },
    ventas_nuevas: [{ id: 'v-nueva', numero: 'F-001900', fecha: '2026-11-21T15:00:00Z', total: 89900, estado: 'pagada' }],
    permisos: { reenviar_nc: true },
  } as unknown as DetalleDevolucion;

  test('la cadena termina en «Venta nueva» con enlace a la venta', async () => {
    pedirDetalle.mockResolvedValue(conReventa);
    renderConIdioma(<DevolucionDetallePage devolucionId="8" />);
    const enlace = await screen.findByRole('link', { name: 'F-001900' });
    expect(enlace.getAttribute('href')).toBe('/app/pos/ventas/v-nueva');
    expect(screen.getByText('Venta nueva')).toBeTruthy();
  });

  test('NC rechazada: el ⋯ ofrece reenviarla con el reintento de la cola', async () => {
    pedirDetalle.mockResolvedValue(conReventa);
    reintentar.mockResolvedValue(undefined);
    renderConIdioma(<DevolucionDetallePage devolucionId="8" />);
    await screen.findByRole('heading', { name: 'Devolución DEV-000008' });
    const boton = screen.getByRole('button', { name: /DEV-000008/ });
    fireEvent.keyDown(boton, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Reenviar nota crédito a la DIAN/ }));
    await waitFor(() => expect(reintentar).toHaveBeenCalledWith('job-9'));
    expect(toastSuccess).toHaveBeenCalledWith('NC-000033 quedó en cola para reenviarse a la DIAN.');
  });

  test('NC aceptada: el ⋯ no ofrece reenviar', async () => {
    pedirDetalle.mockResolvedValue({ ...conReventa, nota_credito: { ...conReventa.nota_credito!, einvoice_status: 'accepted', envio: { job_id: 'job-9', estado: 'accepted' } } });
    renderConIdioma(<DevolucionDetallePage devolucionId="8" />);
    await screen.findByRole('heading', { name: 'Devolución DEV-000008' });
    fireEvent.keyDown(screen.getByRole('button', { name: /DEV-000008/ }), { key: 'Enter' });
    await screen.findByRole('menuitem', { name: /Anular devolución/ });
    expect(screen.queryByRole('menuitem', { name: /Reenviar/ })).toBeNull();
  });
});
