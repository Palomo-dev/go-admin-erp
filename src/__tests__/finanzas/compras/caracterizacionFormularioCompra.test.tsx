/**
 * @jest-environment jsdom
 *
 * F0 · Red de seguridad del formulario de factura de compra
 * (`FormularioFacturaCompra`) antes de que adopte las piezas compartidas con
 * la venta (docs/design/FACTURA-VENTA-FORMULARIO-V2.md, F3).
 *
 * Caracteriza el contrato con el servidor: lo que va a
 * `clienteCompras.guardar` (una sola RPC, `fn_factura_compra_guardar`), la
 * validación antes de guardar, el plazo del proveedor → vencimiento, el
 * consecutivo interno «#», las retenciones, «Confirmar» (abre el diálogo de
 * confirmación con recepción y documento soporte) y la carga del borrador en
 * edición. La forma de agregar líneas cambia en F3; los ayudantes
 * `agregarProducto`/`agregarManual` son lo único que se adapta.
 */
import * as React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

jest.mock('@/lib/supabase/config', () => {
  const cadena: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'or', 'ilike', 'limit']) cadena[m] = () => cadena;
  cadena.maybeSingle = async () => ({ data: null, error: null });
  (cadena as { then: unknown }).then = (r: (v: unknown) => unknown) =>
    Promise.resolve({ data: [{ currency_code: 'COP', is_base: true }, { currency_code: 'USD', is_base: false }], error: null }).then(r);
  return { supabase: { from: () => cadena, rpc: async () => ({ data: null, error: null }) } };
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
const buscarProveedores = jest.fn();
const leerDetalleFacturaCompra = jest.fn();
jest.mock('@/lib/services/compras/lecturasCompras', () => ({
  buscarProveedores: (...a: unknown[]) => buscarProveedores(...a),
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
jest.mock('@/components/shared/product-search', () => ({
  ProductSearchDialog: ({ onProductSelect }: { onProductSelect: (p: unknown) => void }) => (
    <button type="button" onClick={() => onProductSelect(productoPrueba.actual)}>
      agregar-producto
    </button>
  ),
}));

import FormularioFacturaCompra from '@/components/finanzas/facturas-compra/formulario/FormularioFacturaCompra';

const proveedor = { id: 55, name: 'Distribuidora del Norte', nit: '900123456', dv: '7', contact: 'Ana Ruiz', phone: '6015550000', credit_days: 45, is_active: true };

function agregarProducto(p: Record<string, unknown>) {
  productoPrueba.actual = p;
  fireEvent.click(screen.getByRole('button', { name: 'agregar-producto' }));
}

async function elegirProveedor() {
  fireEvent.click(screen.getByRole('combobox', { name: /Proveedor/ }));
  const opcion = await screen.findByRole('option', { name: /Distribuidora del Norte/ });
  await act(async () => {
    fireEvent.click(opcion);
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

beforeEach(() => {
  jest.clearAllMocks();
  buscarProveedores.mockResolvedValue([proveedor]);
  guardar.mockResolvedValue({ id: 'fc-1', number_ext: 'A-100', seriales_omitidos: [] });
});

describe('Factura de compra (formulario actual) — caracterización', () => {
  test('sin proveedor, número ni líneas no guarda y muestra la banda de error', async () => {
    renderConIdioma(<FormularioFacturaCompra />);
    await botonCabecera(/Guardar borrador/);
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  test('borrador: payload completo, plazo del proveedor → vencimiento, líneas con IVA adicional', async () => {
    renderConIdioma(<FormularioFacturaCompra />);
    await elegirProveedor();
    numeroProveedor('A-100');
    agregarProducto({ id: 9, name: 'Guante de nitrilo', sku: 'GUA-M', cost: 4200, price: 6000, tax_rate: 19, tax_code: 'IVA_19', track_serial: false });
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

  test('«#» pone el consecutivo interno de la organización en el número', async () => {
    renderConIdioma(<FormularioFacturaCompra />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /consecutivo/i }));
    });
    await waitFor(() => expect((screen.getByLabelText(/Número de la factura/i) as HTMLInputElement).value).toBe('FC-2026-0012'));
  });

  test('retención: se agrega sobre el subtotal (2,5 %) y viaja en withholdings', async () => {
    renderConIdioma(<FormularioFacturaCompra />);
    await elegirProveedor();
    numeroProveedor('A-101');
    agregarProducto({ id: 9, name: 'Guante', sku: null, cost: 10000, tax_rate: 0, tax_code: null });
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
    agregarProducto({ id: 9, name: 'Guante', cost: 100, tax_rate: 0 });
    await botonCabecera(/Guardar borrador/);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  test('«Confirmar factura» guarda y abre la confirmación (recepción y documento soporte)', async () => {
    renderConIdioma(<FormularioFacturaCompra />);
    await elegirProveedor();
    numeroProveedor('A-102');
    agregarProducto({ id: 9, name: 'Guante', cost: 100, tax_rate: 0 });
    await botonCabecera(/Confirmar factura/);
    expect(guardar).toHaveBeenCalledTimes(1);
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getAllByRole('button').length).toBeGreaterThan(1);
  });

  test('edición: carga el borrador con su proveedor, número y líneas; guardar manda el id', async () => {
    leerDetalleFacturaCompra.mockResolvedValue({
      status: 'draft',
      proveedor: { id: 55, name: 'Distribuidora del Norte', nit: '900123456', phone: null },
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
      retenciones: [],
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
  });

  test('edición de una factura que ya no es borrador: no se puede editar', async () => {
    leerDetalleFacturaCompra.mockResolvedValue({ status: 'received', number_ext: 'A-300' });
    renderConIdioma(<FormularioFacturaCompra id="fc-8" />);
    await screen.findByText(/A-300/);
    expect(screen.queryByRole('button', { name: /Guardar borrador/ })).toBeNull();
  });
});
