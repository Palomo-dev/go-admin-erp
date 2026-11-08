/**
 * @jest-environment jsdom
 *
 * Detalle de factura de compra en móvil (Figma «Facturas de compra — detalle
 * (B.6)», móvil). Mismo fallo que la de venta: las acciones (confirmar,
 * recepcionar, registrar pago, anular) solo vivían en la cabecera de escritorio,
 * que no se dibuja por debajo de `lg`. Las reglas (`accionesPermitidas`) y los
 * permisos del servidor no cambian.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { CabeceraMovilProvider, useCabeceraMovilActual } from '@/components/shell/header/cabeceraMovil';
import type { DetalleFacturaCompra } from '@/lib/services/compras/lecturasCompras';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/facturas-compra/c-1',
  useSearchParams: () => new URLSearchParams(),
}));
const leerDetalleFacturaCompra = jest.fn();
jest.mock('@/lib/services/compras/lecturasCompras', () => ({
  leerDetalleFacturaCompra: (...a: unknown[]) => leerDetalleFacturaCompra(...a),
}));
jest.mock('@/lib/services/compras/clienteCompras', () => ({
  clienteCompras: {},
  ErrorPeticionCompra: class extends Error {},
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
jest.mock('@/components/finanzas/cuentas-por-pagar/RegistrarPagoProveedor', () => ({
  RegistrarPagoProveedor: ({ abierto }: { abierto: boolean }) => (abierto ? <p>dialogo-pago-proveedor</p> : null),
}));
jest.mock('@/components/finanzas/cuentas-por-pagar/ProgramarPagoDialog', () => ({ ProgramarPagoDialog: () => null }));
jest.mock('@/components/finanzas/cuentas-por-pagar/CertificadoRetencionesDialog', () => ({
  CertificadoRetencionesDialog: () => null,
  rangoMesDe: () => ({ desde: '2026-11-01', hasta: '2026-11-30' }),
}));
jest.mock('../DialogosCompra', () => ({
  DialogoConfirmarCompra: ({ abierto }: { abierto: boolean }) => (abierto ? <p>dialogo-confirmar</p> : null),
  DialogoRecepcionar: ({ abierto }: { abierto: boolean }) => (abierto ? <p>dialogo-recepcionar</p> : null),
}));
jest.mock('@/components/inventario/recepcion/LotesRecepcion', () => ({
  useProductosConLote: () => new Set<number>(),
  useTextoErrorRecepcion: () => () => null,
}));

import DetalleFacturaCompraV2 from '../DetalleFacturaCompraV2';

const factura = (p: Partial<DetalleFacturaCompra> = {}): DetalleFacturaCompra => ({
  id: 'c-1',
  organization_id: 7,
  branch_id: 3,
  cost_center_id: null,
  distribucion_id: null,
  supplier_id: 9,
  po_id: null,
  number_ext: 'FC-77',
  issue_date: '2026-11-01',
  due_date: '2026-12-01',
  currency: 'EUR',
  subtotal: 500,
  tax_total: 0,
  total: 500,
  balance: 500,
  status: 'received',
  notes: null,
  payment_terms: 30,
  payment_method: null,
  tax_included: false,
  stock_received_at: '2026-11-02T10:00:00Z',
  created_at: null,
  salesperson_id: null,
  commission_rate: 0,
  commission_type: null,
  commission_method: null,
  commission_amount: 0,
  proveedor: { id: 9, uuid: null, name: 'Proveedor de prueba', nit: null, dv: null, email: null, phone: null, address: null },
  sucursal: null,
  orden: null,
  lineas: [],
  retenciones: [],
  cuenta: { id: 'cxp-1', amount: 500, balance: 500, status: 'pending', due_date: '2026-12-01' },
  pagos: [],
  documentoSoporte: null,
  asientos: [],
  programaciones: [],
  ...p,
});

function MobileHeaderDePrueba() {
  const c = useCabeceraMovilActual();
  return <div data-prueba="mobile-header">{c?.accion}</div>;
}
const fueraDeCabeceraOculta = (el: HTMLElement) => !(el.closest('header')?.className.includes('hidden lg:flex') ?? false);

async function montar(f: DetalleFacturaCompra) {
  leerDetalleFacturaCompra.mockResolvedValue(f);
  const r = renderConIdioma(
    <CabeceraMovilProvider>
      <MobileHeaderDePrueba />
      <DetalleFacturaCompraV2 id="c-1" />
    </CabeceraMovilProvider>,
  );
  await screen.findAllByText('Factura FC-77');
  return r;
}

beforeEach(() => {
  simularAncho(390);
  permisos = { ver: true, crear: true, anular: true, aprobar: false };
});
afterAll(() => simularAncho(1440));

describe('Detalle de factura de compra · móvil', () => {
  test('recibida con saldo: «Registrar pago» y «PDF» bajo el estado; el pago abre el diálogo único del proveedor', async () => {
    await montar(factura());
    const pagar = screen.getAllByRole('button', { name: 'Registrar pago' }).find(fueraDeCabeceraOculta);
    expect(pagar).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'PDF' }).find(fueraDeCabeceraOculta)).toBeDefined();
    fireEvent.click(pagar!);
    expect(screen.getByText('dialogo-pago-proveedor')).toBeTruthy();
  });

  test('borrador: «Confirmar» es la primaria móvil', async () => {
    await montar(factura({ status: 'draft', stock_received_at: null }));
    const confirmar = screen.getAllByRole('button', { name: 'Confirmar' }).find(fueraDeCabeceraOculta);
    fireEvent.click(confirmar!);
    expect(screen.getByText('dialogo-confirmar')).toBeTruthy();
  });

  test('por recibir: «Recepcionar» ocupa la secundaria y el PDF pasa al «⋯» con Imprimir y Anular', async () => {
    const { container } = await montar(
      factura({
        stock_received_at: null,
        lineas: [{ id: 'l-1', product_id: 5, description: 'Tornillo', sku: null, note: null, serial_numbers: [], qty: 2, unidad: null, decimalesCantidad: null, unit_price: 250, discount_amount: 0, tax_rate: 0, total_line: 500 }] as unknown as DetalleFacturaCompra['lineas'],
      }),
    );
    expect(screen.getAllByRole('button', { name: 'Recepcionar' }).find(fueraDeCabeceraOculta)).toBeDefined();
    fireEvent.click(container.querySelector('[data-prueba="mobile-header"] button[aria-haspopup="menu"]') as HTMLButtonElement);
    for (const texto of ['Imprimir', 'Descargar PDF', 'Anular']) expect(screen.queryAllByText(texto).length).toBeGreaterThan(0);
  });

  test('sin finance.create: el botón se ve deshabilitado con su motivo, como en escritorio', async () => {
    permisos = { ver: true, crear: false, anular: false, aprobar: false };
    await montar(factura());
    const pagar = screen.getAllByRole('button', { name: 'Registrar pago' }).find(fueraDeCabeceraOculta) as HTMLButtonElement;
    expect(pagar.disabled).toBe(true);
    expect(pagar.getAttribute('aria-describedby')).toBeTruthy();
  });
});
