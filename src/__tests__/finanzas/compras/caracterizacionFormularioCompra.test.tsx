/**
 * @jest-environment jsdom
 *
 * Red de seguridad del formulario de factura de compra (F0, 2026-09-28), que
 * sigue valiendo tras pasar a la MISMA ESTRUCTURA que la venta v2 (F3,
 * docs/design/FACTURA-VENTA-FORMULARIO-V2.md §7): lo que va a
 * `clienteCompras.guardar` (una sola RPC, `fn_factura_compra_guardar`), la
 * validación antes de guardar, el plazo del proveedor → vencimiento, el
 * consecutivo interno «#», las retenciones, «Confirmar» (diálogo con
 * recepción y documento soporte) y la carga del borrador.
 *
 * Cambios a propósito de F3 (anotados en el documento): elegir proveedor y
 * agregar productos son ahora los diálogos compartidos del documento (aquí,
 * botones simulados), la retención se elige de las configuradas (clase
 * `withholding`) y viaja con su `tax_code`, la factura ya confirmada se ve en
 * solo lectura y «Cancelar» con cambios usa el diálogo del kit, no
 * `window.confirm`.
 */
import * as React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

const tablas: Record<string, unknown[]> = {};
jest.mock('@/lib/supabase/config', () => {
  const crear = (tabla: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'or', 'ilike', 'limit', 'not', 'gt', 'abortSignal']) c[m] = () => c;
    c.maybeSingle = async () => ({ data: (tablas[tabla] ?? [])[0] ?? null, error: null });
    (c as { then: unknown }).then = (r: (v: unknown) => unknown) => Promise.resolve({ data: tablas[tabla] ?? [], error: null }).then(r);
    return c;
  };
  return { supabase: { from: (t: string) => crear(t), rpc: async () => ({ data: null, error: null }) } };
});
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 7, useOrganization: () => ({ organization: { id: 7 } }) }));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ selectedBranchId: 3, branches: [{ id: 3, name: 'Sucursal Principal' }, { id: 4, name: 'Bodega Norte' }] }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP', resuelta: true, decimals: 0, locale: 'es-CO', paraDocumento: (c?: string | null) => ({ code: c || 'COP', decimals: 0, locale: 'es-CO' }) }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => {
  const { toPlainDate } = jest.requireActual('@/lib/utils/dateDisplay');
  return {
    useFormatDate: () => ({
      getToday: () => '2026-09-28',
      toDate: (d: Date) => toPlainDate(d, 'America/Bogota'),
      formatPlain: (d: string) => d,
      formatDate: (d: string) => d,
    }),
  };
});

const guardar = jest.fn();
const confirmar = jest.fn();
const siguienteNumero = jest.fn(async () => 'FC-2026-0012');
jest.mock('@/lib/services/compras/clienteCompras', () => {
  class ErrorPeticionCompra extends Error {
    constructor(
      public codigo: string,
      public estado = 400,
    ) {
      super(codigo);
    }
  }
  return {
    ErrorPeticionCompra,
    clienteCompras: {
      guardar: (...a: unknown[]) => guardar(...a),
      confirmar: (...a: unknown[]) => confirmar(...a),
      siguienteNumero: () => siguienteNumero(),
    },
  };
});
const leerDetalleFacturaCompra = jest.fn();
jest.mock('@/lib/services/compras/lecturasCompras', () => ({
  leerDetalleFacturaCompra: (...a: unknown[]) => leerDetalleFacturaCompra(...a),
}));
jest.mock('@/components/ui/use-toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn(), useToast: () => ({ toast: jest.fn() }), toast: jest.fn() }));

const replace = jest.fn();
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push, back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/finanzas/facturas-compra/nuevo',
}));

const productoPrueba: { actual: Record<string, unknown> } = { actual: {} };
jest.mock('@/components/finanzas/documento/productos', () => ({
  AgregarProductosDocumento: ({ abierto, onAgregar }: { abierto: boolean; onAgregar: (p: unknown) => void }) =>
    abierto ? (
      <button type="button" onClick={() => onAgregar(productoPrueba.actual)}>
        agregar-producto
      </button>
    ) : null,
}));
jest.mock('@/components/finanzas/documento/terceros', () => ({
  documentoTexto: (_t: string, n: string | null) => n,
  ElegirProveedor: ({ proveedor, onCambiar }: { proveedor: { nombre: string } | null; onCambiar: (p: unknown) => void }) => (
    <div>
      <span data-testid="proveedor">{proveedor?.nombre ?? 'sin-proveedor'}</span>
      <button type="button" onClick={() => onCambiar({ id: '55', nombre: 'Distribuidora del Norte', nit: '900123456-7', creditDays: 45 })}>
        elegir-proveedor
      </button>
    </div>
  ),
}));

import FormularioFacturaCompra from '@/components/finanzas/facturas-compra/formulario/FormularioFacturaCompra';

async function agregarProducto(p: Record<string, unknown>) {
  productoPrueba.actual = p;
  fireEvent.click(screen.getAllByRole('button', { name: /Buscar producto/ })[0]);
  fireEvent.click(await screen.findByRole('button', { name: 'agregar-producto' }));
}

async function elegirProveedor() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'elegir-proveedor' }));
  });
}

function numeroProveedor(valor: string) {
  fireEvent.change(screen.getByLabelText(/Número de la factura/i), { target: { value: valor } });
}

async function botonCabecera(nombre: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: nombre })[0]);
  });
}

const producto = (x: Record<string, unknown> = {}) => ({
  id: 9,
  nombre: 'Guante de nitrilo',
  sku: 'GUA-M',
  precio: 4200,
  precioVenta: 6000,
  serial: false,
  impuestos: [{ id: 'tx-1', codigo: 'IVA_19', nombre: 'IVA 19%', tarifa: 19 }],
  ...x,
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(tablas)) delete tablas[k];
  tablas.organization_currencies = [{ currency_code: 'COP', is_base: true }, { currency_code: 'USD', is_base: false }];
  tablas.organization_taxes = [
    { id: 'tx-1', name: 'IVA 19%', rate: 19, is_default: true, is_active: true, kind: 'tax', tax_templates: { code: 'IVA_19' } },
    { id: 'tx-9', name: 'ReteFuente compras 2,5%', rate: 2.5, is_default: false, is_active: true, kind: 'withholding', tax_templates: { code: 'RETE_COMPRAS' } },
  ];
  guardar.mockResolvedValue({ id: 'fc-1', number_ext: 'A-100', seriales_omitidos: [] });
});

describe('Factura de compra — misma estructura que venta, misma lógica de siempre', () => {
  test('sin proveedor, número ni líneas no guarda y resume los errores arriba', async () => {
    renderConIdioma(<FormularioFacturaCompra />);
    await botonCabecera(/Guardar borrador/);
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(screen.getByText(/Revisa 3 campos/)).toBeTruthy();
  });

  test('borrador: payload completo, plazo del proveedor → vencimiento, líneas con IVA adicional', async () => {
    renderConIdioma(<FormularioFacturaCompra />);
    await elegirProveedor();
    numeroProveedor('A-100');
    await agregarProducto(producto());
    await botonCabecera(/Guardar borrador/);

    expect(guardar).toHaveBeenCalledTimes(1);
    const datos = guardar.mock.calls[0][0];
    expect(datos).toEqual(
      expect.objectContaining({
        branch_id: 3,
        supplier_id: 55,
        number_ext: 'A-100',
        issue_date: '2026-09-28',
        due_date: '2026-11-12',
        payment_terms: 45,
        tax_included: false,
        currency: null,
        po_id: null,
        commission_type: 'none',
        withholdings: [],
      }),
    );
    expect(datos.lines).toEqual([
      expect.objectContaining({ product_id: 9, description: 'Guante de nitrilo', qty: 1, unit_price: 4200, discount_amount: 0, tax_rate: 19, tax_code: 'IVA_19', serial_numbers: [], note: null }),
    ]);
    expect('id' in datos).toBe(false);
    expect(replace).toHaveBeenCalledWith('/app/finanzas/facturas-compra/fc-1');
  });

  test('«#» pone el consecutivo interno; su texto explica cuándo usarlo', async () => {
    renderConIdioma(<FormularioFacturaCompra />);
    const boton = screen.getByRole('button', { name: 'Usar consecutivo interno — solo si la factura del proveedor no trae número' });
    await act(async () => {
      fireEvent.click(boton);
    });
    await waitFor(() => expect((screen.getByLabelText(/Número de la factura/i) as HTMLInputElement).value).toBe('FC-2026-0012'));
  });

  test('retención: se elige de las configuradas, sobre el subtotal, y viaja con su tax_code', async () => {
    renderConIdioma(<FormularioFacturaCompra />);
    await elegirProveedor();
    numeroProveedor('A-101');
    await agregarProducto(producto({ precio: 10000, impuestos: [] }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Agregar retención/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Agregar retención/i }));
    await botonCabecera(/Guardar borrador/);
    expect(guardar.mock.calls[0][0].withholdings).toEqual([{ concept: 'ReteFuente compras 2,5%', base: 10000, rate: 2.5, tax_code: 'RETE_COMPRAS' }]);
  });

  test('retención escrita a mano cuando no hay configuradas (como antes: 2,5 % sobre el subtotal)', async () => {
    tablas.organization_taxes = [];
    renderConIdioma(<FormularioFacturaCompra />);
    await elegirProveedor();
    numeroProveedor('A-102');
    await agregarProducto(producto({ precio: 10000, impuestos: [] }));
    fireEvent.click(screen.getByRole('button', { name: /Agregar retención/i }));
    await botonCabecera(/Guardar borrador/);
    expect(guardar.mock.calls[0][0].withholdings).toEqual([expect.objectContaining({ base: 10000, rate: 2.5 })]);
  });

  test('número repetido para el proveedor: el error del servidor queda en el campo y en la banda', async () => {
    const { ErrorPeticionCompra } = jest.requireMock('@/lib/services/compras/clienteCompras') as { ErrorPeticionCompra: new (c: string) => Error };
    guardar.mockRejectedValueOnce(new ErrorPeticionCompra('numero_duplicado'));
    renderConIdioma(<FormularioFacturaCompra />);
    await elegirProveedor();
    numeroProveedor('A-100');
    await agregarProducto(producto({ precio: 100, impuestos: [] }));
    await botonCabecera(/Guardar borrador/);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  test('«Confirmar factura» guarda y abre la confirmación (recepción y documento soporte)', async () => {
    renderConIdioma(<FormularioFacturaCompra />);
    await elegirProveedor();
    numeroProveedor('A-102');
    await agregarProducto(producto({ precio: 100, impuestos: [] }));
    await botonCabecera(/Confirmar factura/);
    expect(guardar).toHaveBeenCalledTimes(1);
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getAllByRole('button').length).toBeGreaterThan(1);
  });

  test('salir con cambios: el diálogo del kit (no window.confirm) con «Guardar borrador y salir»', async () => {
    const confirmNativo = jest.spyOn(window, 'confirm');
    renderConIdioma(<FormularioFacturaCompra />);
    await elegirProveedor();
    await botonCabecera(/^Cancelar$/);
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByRole('button', { name: 'Guardar borrador y salir' })).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salir sin guardar' }));
    expect(push).toHaveBeenCalledWith('/app/finanzas/facturas-compra');
    expect(confirmNativo).not.toHaveBeenCalled();
  });

  test('edición: carga el borrador con su proveedor, número, líneas y retenciones; guardar manda el id', async () => {
    leerDetalleFacturaCompra.mockResolvedValue({
      status: 'draft',
      proveedor: { id: 55, name: 'Distribuidora del Norte', nit: '900123456', dv: '7', phone: null },
      number_ext: 'A-200',
      branch_id: 4,
      issue_date: '2026-09-20T12:00:00Z',
      due_date: '2026-10-20T12:00:00Z',
      payment_terms: 30,
      currency: null,
      tax_included: true,
      notes: 'Nota',
      po_id: null,
      lineas: [{ id: 'l1', product_id: 9, description: 'Guante', sku: 'G', qty: 3, unit_price: 1190, discount_amount: 0, tax_rate: 19, tax_code: null, serial_numbers: [], note: null }],
      retenciones: [{ id: 'r1', concept: 'ReteFuente compras 2,5%', base: 3000, rate: 2.5, amount: 75, tax_code: 'RETE_COMPRAS' }],
      salesperson_id: null,
      commission_rate: 0,
      commission_type: 'none',
      commission_method: 'percentage',
      commission_amount: 0,
    });
    renderConIdioma(<FormularioFacturaCompra id="fc-9" />);
    await waitFor(() => expect((screen.getByLabelText(/Número de la factura/i) as HTMLInputElement).value).toBe('A-200'));
    await botonCabecera(/Guardar borrador/);
    const datos = guardar.mock.calls[0][0];
    expect(datos).toEqual(expect.objectContaining({ id: 'fc-9', branch_id: 4, tax_included: true, number_ext: 'A-200', supplier_id: 55 }));
    expect(datos.lines[0]).toEqual(expect.objectContaining({ qty: 3, unit_price: 1190, tax_rate: 19 }));
    expect(datos.withholdings).toEqual([{ concept: 'ReteFuente compras 2,5%', base: 3000, rate: 2.5, tax_code: 'RETE_COMPRAS' }]);
  });

  test('una factura que ya no es borrador se ve en solo lectura con su motivo', async () => {
    leerDetalleFacturaCompra.mockResolvedValue({
      id: 'fc-8',
      status: 'received',
      number_ext: 'A-300',
      proveedor: { name: 'Distribuidora del Norte' },
      currency: null,
      tax_included: false,
      subtotal: 100,
      total: 119,
      lineas: [{ id: 'l1', product_id: 9, description: 'Guante', sku: null, qty: 1, unit_price: 100, discount_amount: 0, tax_rate: 19, tax_code: null, total_line: 119, serial_numbers: [], note: null }],
      retenciones: [],
    });
    renderConIdioma(<FormularioFacturaCompra id="fc-8" />);
    expect(await screen.findByText(/no se puede editar/)).toBeTruthy();
    expect(screen.getAllByText(/A-300/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Guardar borrador/ })).toBeNull();
  });
});
