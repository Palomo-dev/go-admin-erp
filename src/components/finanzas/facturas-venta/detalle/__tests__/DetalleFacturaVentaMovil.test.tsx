/**
 * @jest-environment jsdom
 *
 * Detalle de factura de venta en móvil (Figma «Facturas de venta — detalle
 * (B.2)», móvil). Fallo del dueño (2026-11-07): en el celular no aparecía
 * ninguna acción (registrar pago, anular, nota crédito, emitir): todas iban en
 * `acciones` del PageHeader, que en móvil no se dibuja, y el detalle no
 * publicaba nada en el MobileHeader. Las reglas no cambian (`accionesFactura`).
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { CabeceraMovilProvider, useCabeceraMovilActual } from '@/components/shell/header/cabeceraMovil';
import type { DetalleFacturaVenta as Detalle } from '@/lib/finanzas/ventas/contratoFacturas';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/facturas-venta/f-1',
  useSearchParams: () => new URLSearchParams(),
}));
const pedirDetalleFactura = jest.fn();
jest.mock('@/lib/finanzas/ventas/clienteFacturas', () => ({
  ...jest.requireActual('@/lib/finanzas/ventas/clienteFacturas'),
  pedirDetalleFactura: (...a: unknown[]) => pedirDetalleFactura(...a),
}));
let permisos = { ver: true, crear: true, anular: true, aprobar: false };
jest.mock('@/lib/finanzas/usePermisosFinanzas', () => ({
  usePermisosFinanzas: () => ({ ...permisos, posVer: false, posCrear: false, posAnular: false, cargando: false }),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 7 }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    getToday: () => '2026-11-07',
    toDate: () => '2026-11-07',
    formatDate: (v: string | null) => v ?? '',
    formatDateTime: (v: string | null) => v ?? '',
  }),
}));
const BASE = { code: 'EUR', decimals: 0, locale: 'es-CO' };
const MONEDA = { ...BASE, formatear: (n: number) => String(n), paraDocumento: () => BASE, resuelta: true };
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => MONEDA }));
jest.mock('@/lib/documents/cliente', () => ({ imprimirDocumento: jest.fn(), abrirDocumento: jest.fn(), descargarDocumento: jest.fn() }));
jest.mock('@/components/ui/use-toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn(), toastWarning: jest.fn() }));
jest.mock('@/components/finanzas/pagos/RegistrarPagoConectado', () => ({
  RegistrarPagoConectado: ({ abierto }: { abierto: boolean }) => (abierto ? <p>dialogo-registrar-pago</p> : null),
}));
jest.mock('@/components/finanzas/pagos/AnularPagoConectado', () => ({ AnularPagoConectado: () => null }));
jest.mock('@/components/finanzas/facturacion-electronica', () => ({ SendToFactusButton: () => null }));
jest.mock('../NotaCreditoVentaDialog', () => ({
  NotaCreditoVentaDialog: ({ abierto }: { abierto: boolean }) => (abierto ? <p>dialogo-nota-credito</p> : null),
}));
jest.mock('../EnviarFacturaDialog', () => ({ EnviarFacturaDialog: () => null }));
jest.mock('@/components/finanzas/notas/NotaDebitoDialog', () => ({ NotaDebitoDialog: () => null }));

import { DetalleFacturaVenta } from '../DetalleFacturaVenta';

const detalle = (factura: Partial<Detalle['factura']> = {}): Detalle => ({
  factura: {
    id: 'f-1',
    numero: 'FV-42',
    estado: 'issued',
    tipoDocumento: 'invoice',
    emision: '2026-11-01',
    vencimiento: '2026-12-01',
    moneda: 'EUR',
    subtotal: 1000,
    impuestos: 0,
    total: 1000,
    saldo: 1000,
    notas: null,
    descripcion: null,
    impuestosIncluidos: false,
    terminos: 30,
    metodoPago: null,
    branchId: 3,
    sucursal: null,
    vendedor: null,
    comisionTasa: null,
    cargos: [],
    saleId: null,
    facturaRelacionadaId: null,
    fe: { estado: null, numero: null, qr: null },
    creadaEn: null,
    ...factura,
  },
  cliente: null,
  lineas: [],
  pagos: [],
  notasCredito: [],
  creditoAplicado: 0,
  cartera: null,
  asientos: [],
  job: null,
  historial: [],
});

function MobileHeaderDePrueba() {
  const c = useCabeceraMovilActual();
  return <div data-prueba="mobile-header">{c?.accion}</div>;
}
const fueraDeCabeceraOculta = (el: HTMLElement) => !(el.closest('header')?.className.includes('hidden lg:flex') ?? false);

async function montar(d: Detalle) {
  pedirDetalleFactura.mockResolvedValue(d);
  const r = renderConIdioma(
    <CabeceraMovilProvider>
      <MobileHeaderDePrueba />
      <DetalleFacturaVenta id="f-1" />
    </CabeceraMovilProvider>,
  );
  await screen.findAllByText('Factura FV-42');
  return r;
}

beforeEach(() => {
  simularAncho(390);
  permisos = { ver: true, crear: true, anular: true, aprobar: false };
});
afterAll(() => simularAncho(1440));

describe('Detalle de factura de venta · móvil', () => {
  test('emitida con saldo: «Registrar pago» y «PDF» visibles bajo el estado y abren lo mismo que en escritorio', async () => {
    await montar(detalle());
    const pagar = screen.getAllByRole('button', { name: 'Registrar pago' }).find(fueraDeCabeceraOculta);
    expect(pagar).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'PDF' }).find(fueraDeCabeceraOculta)).toBeDefined();
    fireEvent.click(pagar!);
    expect(screen.getByText('dialogo-registrar-pago')).toBeTruthy();
  });

  test('«⋯» del MobileHeader trae imprimir, enviar, nota crédito y anular', async () => {
    const { container } = await montar(detalle());
    const mas = container.querySelector('[data-prueba="mobile-header"] button[aria-haspopup="menu"]') as HTMLButtonElement;
    expect(mas).not.toBeNull();
    fireEvent.click(mas);
    for (const texto of ['Imprimir', 'Enviar', 'Nota crédito', 'Anular factura']) {
      expect(screen.queryAllByText(texto).length).toBeGreaterThan(0);
    }
  });

  test('pagada (las 146 facturas reales de hoy): sin «Registrar pago», pero «⋯» abre la nota crédito', async () => {
    const { container } = await montar(detalle({ estado: 'paid', saldo: 0 }));
    expect(screen.queryAllByRole('button', { name: 'Registrar pago' })).toHaveLength(0);
    fireEvent.click(container.querySelector('[data-prueba="mobile-header"] button[aria-haspopup="menu"]') as HTMLButtonElement);
    const nota = screen.getAllByText('Nota crédito').find((n) => n.closest('[role="dialog"]'));
    fireEvent.click(nota!);
    await waitFor(() => expect(screen.getByText('dialogo-nota-credito')).toBeTruthy());
  });

  test('borrador: la primaria móvil es «Emitir»', async () => {
    await montar(detalle({ estado: 'draft', numero: 'FV-42' }));
    expect(screen.getAllByRole('button', { name: /Emitir/ }).find(fueraDeCabeceraOculta)).toBeDefined();
  });

  test('sin finance.create: no se ofrece cobrar en móvil (misma regla que escritorio)', async () => {
    permisos = { ver: true, crear: false, anular: false, aprobar: false };
    await montar(detalle());
    expect(screen.queryAllByRole('button', { name: 'Registrar pago' })).toHaveLength(0);
  });
});
