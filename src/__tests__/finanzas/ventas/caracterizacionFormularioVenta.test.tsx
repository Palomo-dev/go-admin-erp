/**
 * @jest-environment jsdom
 *
 * F0 · Red de seguridad del formulario de factura de venta ANTES del
 * rediseño v2 (docs/design/FACTURA-VENTA-FORMULARIO-V2.md §1.2, L1–L23).
 *
 * Pruebas de CARACTERIZACIÓN: fijan lo que el formulario viejo
 * (`NuevaFacturaForm` + `ItemsFactura` + `ImpuestosFactura` +
 * `FormaPagoSelector` + `EditarFacturaVenta`) manda hoy al servidor, incluidos
 * los hallazgos H1–H3 tal como están. Cuando el formulario nuevo los corrija,
 * la prueba correspondiente se invierte a propósito (y se anota en el
 * documento), no se borra.
 *
 * Qué se simula: el cliente Supabase del navegador (tablas de lectura por
 * nombre), los servicios de guardar / resolver impuesto / promociones / DIAN,
 * el diálogo de productos (un botón que entrega el producto de la prueba) y
 * el selector de cliente (un botón). El resto es el código real.
 */
import * as React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

// ── Supabase del navegador: datos por tabla ──────────────────────────────
const tablas: Record<string, unknown[]> = {};
const consultas: Array<{ tabla: string; filtros: Array<[string, unknown[]]> }> = [];
jest.mock('@/lib/supabase/config', () => {
  const crear = (tabla: string) => {
    const registro = { tabla, filtros: [] as Array<[string, unknown[]]> };
    consultas.push(registro);
    const resultado = () => ({ data: tablas[tabla] ?? [], error: null });
    const cadena: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'or', 'order', 'ilike', 'is', 'gt', 'not']) {
      cadena[m] = (...a: unknown[]) => {
        registro.filtros.push([m, a]);
        return cadena;
      };
    }
    cadena.limit = () => cadena;
    cadena.single = async () => ({ data: (tablas[tabla] ?? [])[0] ?? null, error: null });
    cadena.maybeSingle = cadena.single;
    (cadena as { then: unknown }).then = (r: (v: unknown) => unknown, e?: (x: unknown) => unknown) => Promise.resolve(resultado()).then(r, e);
    return cadena;
  };
  return { supabase: { from: (t: string) => crear(t), rpc: async () => ({ data: null, error: null }) } };
});

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 7,
  getCurrentUserId: async () => 'u-1',
  useOrganization: () => ({ organization: { id: 7 } }),
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ selectedBranchId: 3, branches: [{ id: 3, name: 'Sucursal Principal' }] }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({
    code: 'COP',
    resuelta: true,
    decimals: 0,
    locale: 'es-CO',
    paraDocumento: (c?: string | null) => ({ code: c || 'COP', decimals: 0, locale: 'es-CO' }),
  }),
}));
const resolverTasaComision = jest.fn(async () => 0);
jest.mock('@/lib/hooks/useCommissionRate', () => ({ useCommissionRate: () => ({ resolveRate: resolverTasaComision, loading: false }) }));
jest.mock('@/lib/hooks/useElectronicInvoicePreference', () => ({ useElectronicInvoicePreference: () => ({ alwaysEnabled: preferenciaFE.global }) }));
const preferenciaFE = { global: false };
jest.mock('@/hooks/useLineasSinImpuesto', () => ({ useLineasSinImpuesto: () => ({ sinImpuesto: [], indices: new Set<number>() }) }));
jest.mock('@/lib/utils/invoiceUtils', () => ({ generateInvoiceNumber: async () => 'FACT-0001' }));

const guardarFacturaVenta = jest.fn();
jest.mock('@/lib/finanzas/ventas/clienteFacturas', () => {
  class ErrorPeticionFactura extends Error {
    constructor(
      public codigo: string,
      public estado: number,
      public faltantes: unknown[] = [],
    ) {
      super(codigo);
    }
  }
  return { ErrorPeticionFactura, guardarFacturaVenta: (...a: unknown[]) => guardarFacturaVenta(...a) };
});
const resolveLineTax = jest.fn();
jest.mock('@/lib/services/taxResolver', () => ({ resolveLineTax: (...a: unknown[]) => resolveLineTax(...a) }));
const evaluarPromociones = jest.fn(async () => ({ discountTotal: 0, itemDiscounts: {} }));
jest.mock('@/lib/services/promotionEngine', () => ({ promotionEngine: { evaluate: (...a: unknown[]) => evaluarPromociones(...(a as [])) } }));
const sendToFactus = jest.fn(async () => ({ success: true }));
jest.mock('@/lib/services/electronicInvoicingService', () => ({ electronicInvoicingService: { sendToFactus: (...a: unknown[]) => sendToFactus(...(a as [])) } }));
const toastError = jest.fn();
const toastSuccess = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  toastError: (...a: unknown[]) => toastError(...a),
  toastSuccess: (...a: unknown[]) => toastSuccess(...a),
  useToast: () => ({ toast: jest.fn() }),
  toast: jest.fn(),
}));

const push = jest.fn();
const back = jest.fn();
let parametros = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, back, replace: jest.fn() }),
  useSearchParams: () => parametros,
  usePathname: () => '/app/finanzas/facturas-venta/nuevo',
}));

// Piezas de interfaz sustituidas por botones (lo que se caracteriza es el formulario).
jest.mock('@/components/finanzas/facturas-venta/nueva-factura/ClienteSelector', () => ({
  ClienteSelector: ({ selectedCustomerId, onCustomerChange }: { selectedCustomerId: string | null; onCustomerChange: (id: string) => void }) => (
    <div>
      <span data-testid="cliente">{selectedCustomerId ?? 'sin-cliente'}</span>
      <button type="button" onClick={() => onCustomerChange('c-1')}>
        elegir-cliente
      </button>
    </div>
  ),
}));
jest.mock('@/components/inventario/BranchSelectorField', () => ({ BranchSelectorField: () => null }));
jest.mock('@/components/finanzas/facturacion-electronica', () => ({
  ElectronicInvoiceToggle: ({ checked, onCheckedChange, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean }) => (
    <input type="checkbox" aria-label="fe" checked={checked} disabled={disabled} onChange={(e) => onCheckedChange(e.target.checked)} />
  ),
}));
const productoPrueba: { actual: Record<string, unknown> } = { actual: {} };
jest.mock('@/components/shared/product-search', () => ({
  ProductSearchDialog: ({ onProductSelect }: { onProductSelect: (p: unknown, m?: unknown[]) => void }) => (
    <button type="button" onClick={() => onProductSelect(productoPrueba.actual, (productoPrueba.actual.__mods as unknown[]) ?? [])}>
      agregar-producto
    </button>
  ),
}));
jest.mock('@/components/pos/SerialSelectorDialog', () => ({ SerialSelectorDialog: () => null }));
jest.mock('@/components/ui/search-select', () => ({
  SearchSelect: ({ options, value, onValueChange }: { options: { value: string; label: string }[]; value: string; onValueChange: (v: string) => void }) => (
    <select aria-label="vendedor" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

import { NuevaFacturaForm } from '@/components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm';
import { EditarFacturaVenta } from '@/components/finanzas/facturas-venta/editar/EditarFacturaVenta';

const IVA19 = { id: 'tx-1', name: 'IVA 19%', rate: 19, is_default: true, is_active: true, kind: 'tax', tax_templates: { code: 'IVA_19', name: 'IVA' } };
const INC8 = { id: 'tx-2', name: 'INC 8%', rate: 8, is_default: false, is_active: true, kind: 'tax', tax_templates: { code: 'INC_8', name: 'INC' } };
const RETE = { id: 'tx-3', name: 'ReteFuente', rate: 2.5, is_default: false, is_active: true, kind: 'withholding', tax_templates: { code: 'RETE_25', name: 'Rete' } };

function datosBase() {
  for (const k of Object.keys(tablas)) delete tablas[k];
  consultas.length = 0;
  Object.assign(tablas, {
    organization_currencies: [{ currency_code: 'COP', is_base: true }, { currency_code: 'USD', is_base: false }],
    currencies: [
      { code: 'COP', name: 'Peso colombiano', symbol: '$' },
      { code: 'USD', name: 'Dólar', symbol: 'US$' },
    ],
    organization_members: [{ user_id: 'u-9' }],
    profiles: [{ id: 'u-9', first_name: 'Laura', last_name: 'Gómez' }],
    opportunities: [],
    organization_taxes: [IVA19, INC8, RETE],
    organization_payment_methods: [{ id: 1, organization_id: 7, payment_method_code: 'cash', is_active: true, settings: null }],
    payment_methods: [{ name: 'Efectivo', requires_reference: false }],
    invoice_sales: [],
  });
}

const producto = (extra: Record<string, unknown> = {}) => ({
  id: 101,
  name: 'Zapatilla urbana',
  sku: 'ZAP-1',
  price: 100000,
  tax_rate: 19,
  tax_code: 'IVA_19',
  stock_qty: 14,
  track_stock: true,
  track_serial: false,
  ...extra,
});

async function montarNueva() {
  const r = renderConIdioma(<NuevaFacturaForm />);
  // Número generado, monedas, impuestos y forma de pago cargados.
  await waitFor(() => expect((document.getElementById('invoice-number') as HTMLInputElement).value).toBe('FACT-0001'));
  await act(async () => {
    await Promise.resolve();
  });
  return r;
}

async function guardar() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Guardar factura/ }));
  });
}

function agregar(p: Record<string, unknown>) {
  productoPrueba.actual = p;
  fireEvent.click(screen.getByRole('button', { name: 'agregar-producto' }));
}

// H5: `ImpuestosFactura` escribe decenas de console.log por render; aquí se callan.
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

beforeEach(() => {
  datosBase();
  parametros = new URLSearchParams();
  preferenciaFE.global = false;
  jest.clearAllMocks();
  guardarFacturaVenta.mockResolvedValue({ id: 'fv-1', numero: null, saleId: 's-1', total: 0, faltantes: [] });
  // El resolver real devuelve la tarifa de la línea si la trae; si no, la del documento.
  resolveLineTax.mockImplementation(async (i: { itemTaxRate?: number | null; itemTaxCode?: string | null; qty: number; unitPrice: number; discountAmount?: number; taxIncluded: boolean }) => {
    const tasa = Number(i.itemTaxRate) || 19;
    const neto = i.qty * i.unitPrice - (i.discountAmount || 0);
    return { tax_rate: tasa, tax_code: i.itemTaxCode || 'IVA_19', tax_included: i.taxIncluded, total_line: i.taxIncluded ? neto : Math.round(neto * (1 + tasa / 100) * 100) / 100, has_no_tax: false };
  });
});

describe('Nueva factura de venta (formulario viejo) — caracterización', () => {
  test('L16: guarda en UNA llamada con el payload completo; la línea con IVA adicional lleva total bruto', async () => {
    await montarNueva();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    agregar(producto());
    await guardar();

    expect(guardarFacturaVenta).toHaveBeenCalledTimes(1);
    const [id, datos] = guardarFacturaVenta.mock.calls[0];
    expect(id).toBeNull();
    expect(datos).toEqual(
      expect.objectContaining({
        number: 'FACT-0001',
        customer_id: 'c-1',
        branch_id: 3,
        currency: 'COP',
        payment_terms: 30,
        payment_method: 'cash',
        tax_included: false,
        include_in_cash_register: true,
        commission_type: 'none',
        commission_method: 'percentage',
        opportunity_id: null,
      }),
    );
    expect(datos.items).toEqual([
      expect.objectContaining({ product_id: 101, description: 'Zapatilla urbana', qty: 1, unit_price: 100000, tax_rate: 19, tax_code: 'IVA_19', tax_included: false, total_line: 119000, discount_amount: 0 }),
    ]);
    // Impuestos aplicados del documento: el predeterminado de la organización, con su tarifa; nunca la retención.
    expect(datos.applied_taxes).toEqual([{ tax_code: 'IVA_19', tax_rate: 19 }]);
    // Sin FE: no se envía nada a la DIAN y se va al detalle.
    expect(sendToFactus).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/app/finanzas/facturas-venta/fv-1');
  });

  test('L5: el vencimiento es emisión + 30 días por defecto (días de la organización)', async () => {
    await montarNueva();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    agregar(producto());
    await guardar();
    const datos = guardarFacturaVenta.mock.calls[0][1];
    const dias = Math.round((Date.parse(datos.due_date) - Date.parse(datos.issue_date)) / 86_400_000);
    expect(dias).toBe(30);
  });

  test('validaciones: sin cliente o sin líneas no guarda y avisa con toast', async () => {
    await montarNueva();
    await guardar();
    expect(guardarFacturaVenta).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    await guardar();
    expect(guardarFacturaVenta).not.toHaveBeenCalled();
  });

  test('L11 (F-42): una línea sin tarifa pasa por resolveLineTax y el payload lleva lo resuelto', async () => {
    await montarNueva();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    agregar(producto({ id: 102, name: 'Servicio', tax_rate: null, tax_code: null, price: 50000 }));
    await guardar();
    expect(resolveLineTax).toHaveBeenCalledWith(expect.objectContaining({ productId: 102, organizationId: 7, taxIncluded: false, qty: 1, unitPrice: 50000 }));
    const linea = guardarFacturaVenta.mock.calls[0][1].items[0];
    expect(linea).toEqual(expect.objectContaining({ tax_rate: 19, tax_code: 'IVA_19', total_line: 59500 }));
  });

  test('L10: las promociones del canal finanzas se aplican al guardar solo a líneas sin descuento manual', async () => {
    evaluarPromociones.mockResolvedValueOnce({ discountTotal: 5000, itemDiscounts: { 101: 5000 } } as never);
    await montarNueva();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    agregar(producto());
    await guardar();
    expect(evaluarPromociones).toHaveBeenCalledWith(expect.objectContaining({ channel: 'finances', organization_id: 7, branch_id: 3 }));
    expect(guardarFacturaVenta.mock.calls[0][1].items[0].discount_amount).toBe(5000);
  });

  test('agregar producto con modificadores: precio + extra y descripción con los modificadores', async () => {
    await montarNueva();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    agregar(producto({ __mods: [{ name: 'Talla 42', extraPrice: 10000 }] }));
    await guardar();
    const linea = guardarFacturaVenta.mock.calls[0][1].items[0];
    expect(linea.unit_price).toBe(110000);
    expect(linea.description).toBe('Zapatilla urbana (Talla 42)');
    expect(linea.total_line).toBe(130900);
  });

  test('L9: un producto serializado sin seriales elegidos no deja guardar', async () => {
    await montarNueva();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    agregar(producto({ track_serial: true }));
    await guardar();
    expect(guardarFacturaVenta).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  test('L7–L8: al elegir vendedor se sugiere la tasa y la comisión viaja como «salesperson» en porcentaje', async () => {
    resolverTasaComision.mockResolvedValueOnce(5 as never);
    await montarNueva();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    agregar(producto());
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'vendedor' }), { target: { value: 'u-9' } });
    });
    expect(resolverTasaComision).toHaveBeenCalledWith('u-9');
    await guardar();
    expect(guardarFacturaVenta.mock.calls[0][1]).toEqual(
      expect.objectContaining({ salesperson_id: 'u-9', commission_rate: 5, commission_type: 'salesperson', commission_method: 'percentage' }),
    );
  });

  test('H1 (hallazgo, hoy): con «Factura electrónica» activa, el BORRADOR se envía a la DIAN tras guardar', async () => {
    await montarNueva();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    agregar(producto());
    fireEvent.click(screen.getByRole('checkbox', { name: 'fe' }));
    await guardar();
    expect(sendToFactus).toHaveBeenCalledWith('fv-1', 7);
  });

  test('L20: la preferencia global fuerza el interruptor de factura electrónica', async () => {
    preferenciaFE.global = true;
    await montarNueva();
    const fe = screen.getByRole('checkbox', { name: 'fe' }) as HTMLInputElement;
    expect(fe.checked).toBe(true);
    expect(fe.disabled).toBe(true);
  });

  test('L18: si el servidor devuelve faltantes, avisa (el borrador ya quedó guardado)', async () => {
    guardarFacturaVenta.mockResolvedValueOnce({ id: 'fv-2', numero: null, saleId: 's', total: 0, faltantes: [{ product_id: 101, producto: 'Zapatilla urbana', requerido: 5, disponible: 3 }] });
    await montarNueva();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    agregar(producto());
    await guardar();
    expect(toastError).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/app/finanzas/facturas-venta/fv-2');
  });

  test('L22: los errores del servidor se traducen por código y no navega', async () => {
    const { ErrorPeticionFactura } = jest.requireMock('@/lib/finanzas/ventas/clienteFacturas') as { ErrorPeticionFactura: new (c: string, e: number) => Error };
    guardarFacturaVenta.mockRejectedValueOnce(new ErrorPeticionFactura('sin_permiso', 403));
    await montarNueva();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    agregar(producto());
    await guardar();
    expect(toastError).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/permiso/i));
    expect(push).not.toHaveBeenCalled();
  });

  test('L1: duplicar copia las líneas de la factura original y aplica cliente, moneda, términos, método y notas', async () => {
    parametros = new URLSearchParams('duplicar=fv-9&cliente=c-9&moneda=USD&terminos=15&metodo_pago=cash&notas=Copia');
    tablas.invoice_items = [{ product_id: 5, description: 'Morral', qty: 2, unit_price: 150000, tax_code: 'IVA_19', tax_rate: 19, tax_included: false, total_line: 357000, discount_amount: 0 }];
    await montarNueva();
    await waitFor(() => expect(screen.getByTestId('cliente').textContent).toBe('c-9'));
    await guardar();
    const datos = guardarFacturaVenta.mock.calls[0][1];
    expect(datos).toEqual(expect.objectContaining({ customer_id: 'c-9', currency: 'USD', payment_terms: 15, notes: 'Copia' }));
    expect(datos.items[0]).toEqual(expect.objectContaining({ product_id: 5, qty: 2, unit_price: 150000, total_line: 357000 }));
    expect(consultas.some((c) => c.tabla === 'invoice_items' && c.filtros.some(([m, a]) => m === 'eq' && a[0] === 'invoice_sales_id' && a[1] === 'fv-9'))).toBe(true);
  });

  test('L2: ?cliente= sin duplicar preselecciona el cliente («Nueva venta» desde clientes)', async () => {
    parametros = new URLSearchParams('cliente=c-5');
    await montarNueva();
    expect(screen.getByTestId('cliente').textContent).toBe('c-5');
  });

  test('H6 (hallazgo, hoy): la forma de pago hace una consulta por método (N+1) y elige el primero', async () => {
    tablas.organization_payment_methods = [
      { id: 1, payment_method_code: 'cash', is_active: true, settings: null },
      { id: 2, payment_method_code: 'card', is_active: true, settings: null },
    ];
    await montarNueva();
    expect(consultas.filter((c) => c.tabla === 'payment_methods').length).toBe(2);
  });
});

describe('Editar factura de venta (formulario viejo) — caracterización', () => {
  const borrador = {
    id: 'fv-7',
    status: 'draft',
    number: 'FACT-0007',
    customer_id: 'c-3',
    currency: 'COP',
    payment_terms: 45,
    payment_method: 'cash',
    notes: 'Nota',
    tax_included: false,
    branch_id: 3,
    salesperson_id: null,
    commission_rate: 0,
    commission_type: 'none',
    commission_method: 'percentage',
    issue_date: '2026-09-20T15:00:00Z',
    due_date: '2026-11-04T15:00:00Z',
    include_in_cash_register: false,
  };

  test('solo edita borradores: otro estado muestra el aviso y no el formulario', async () => {
    tablas.invoice_sales = [{ ...borrador, status: 'issued' }];
    renderConIdioma(<EditarFacturaVenta facturaId="fv-7" />);
    await screen.findByRole('button', { name: /Volver al detalle/ });
    expect(screen.queryByRole('button', { name: /Guardar cambios/ })).toBeNull();
  });

  test('H2–H3 (hallazgos, hoy): guardar cambios NO manda «incluir en el arqueo» y manda impuestos aplicados sin tarifa', async () => {
    tablas.invoice_sales = [borrador];
    tablas.invoice_items = [{ id: 'l-1', product_id: 101, description: 'Zapatilla', qty: 1, unit_price: 100000, tax_code: 'IVA_19', tax_rate: 19, tax_included: false, total_line: 119000, discount_amount: 0 }];
    tablas.invoice_applied_taxes = [{ tax_code: 'IVA_19', tax_rate: 19, is_applied: true }];
    renderConIdioma(<EditarFacturaVenta facturaId="fv-7" />);
    const boton = await screen.findByRole('button', { name: /Guardar cambios/ });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(boton);
    });
    await waitFor(() => expect(guardarFacturaVenta).toHaveBeenCalled());
    const [id, datos] = guardarFacturaVenta.mock.calls[0];
    expect(id).toBe('fv-7');
    expect(datos).toEqual(expect.objectContaining({ number: 'FACT-0007', customer_id: 'c-3', payment_terms: 45, branch_id: 3 }));
    expect('include_in_cash_register' in datos).toBe(false);
    expect(datos.applied_taxes).toEqual([{ tax_code: 'IVA_19' }]);
    expect(datos.items[0]).toEqual(expect.objectContaining({ product_id: 101, qty: 1, unit_price: 100000, tax_rate: 19 }));
    expect(push).toHaveBeenCalledWith('/app/finanzas/facturas-venta/fv-7');
  });
});
