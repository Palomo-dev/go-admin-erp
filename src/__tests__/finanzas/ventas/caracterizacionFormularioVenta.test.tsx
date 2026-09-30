/**
 * @jest-environment jsdom
 *
 * Red de seguridad del formulario de factura de venta (F0, 2026-09-28) sobre
 * el formulario v2 que lo sustituyó (`formulario/FormularioFacturaVenta`).
 * Cada caso conserva su lógica del §1.2 (L1–L23) de
 * docs/design/FACTURA-VENTA-FORMULARIO-V2.md. Los hallazgos que el v2
 * corrige quedan INVERTIDOS a propósito (antes fijaban el defecto):
 *
 * - H1: la factura electrónica ya NO se envía al guardar el borrador; se envía
 *   después de EMITIR.
 * - H2–H3: editar conserva «incluir en el arqueo» y manda los impuestos
 *   aplicados con su tarifa.
 * - H6: formas de pago en UNA consulta.
 * - H8: el borrador no inventa número en el navegador (lo asigna la emisión).
 *
 * Se simulan: el cliente Supabase del navegador (tablas por nombre), los
 * servicios de guardar/emitir, promociones y DIAN, y los dos diálogos del
 * documento (elegir cliente y agregar productos) como botones.
 */
import * as React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

const tablas: Record<string, unknown[]> = {};
const consultas: Array<{ tabla: string; ops: Array<[string, unknown[]]> }> = [];
jest.mock('@/lib/supabase/config', () => {
  const crear = (tabla: string) => {
    const reg = { tabla, ops: [] as Array<[string, unknown[]]> };
    consultas.push(reg);
    const res = () => ({ data: tablas[tabla] ?? [], error: null });
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'or', 'order', 'ilike', 'is', 'gt', 'not', 'limit', 'abortSignal']) {
      c[m] = (...a: unknown[]) => {
        reg.ops.push([m, a]);
        return c;
      };
    }
    c.single = async () => ({ data: (tablas[tabla] ?? [])[0] ?? null, error: null });
    c.maybeSingle = c.single;
    (c as { then: unknown }).then = (r: (v: unknown) => unknown, e?: (x: unknown) => unknown) => Promise.resolve(res()).then(r, e);
    return c;
  };
  return {
    supabase: {
      from: (t: string) => crear(t),
      rpc: async () => ({ data: null, error: null }),
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    },
  };
});

jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 7, getCurrentUserId: async () => 'u-1', useOrganization: () => ({ organization: { id: 7 } }) }));
// useBranchOpcional: la zona horaria resuelve sucursal → organización (OrganizationTimezoneContext).
jest.mock('@/lib/context/BranchContext', () => {
  const sucursal = { selectedBranchId: 3, branches: [{ id: 3, name: 'Sucursal Principal' }] };
  return { useBranch: () => sucursal, useBranchOpcional: () => sucursal };
});
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP', resuelta: true, decimals: 0, locale: 'es-CO', paraDocumento: (c?: string | null) => ({ code: c || 'COP', decimals: 0, locale: 'es-CO' }) }),
}));
const resolverTasa = jest.fn(async () => 0);
jest.mock('@/lib/hooks/useCommissionRate', () => ({ useCommissionRate: () => ({ resolveRate: resolverTasa, loading: false }) }));
const preferenciaFE = { global: false };
jest.mock('@/lib/hooks/useElectronicInvoicePreference', () => ({ useElectronicInvoicePreference: () => ({ alwaysEnabled: preferenciaFE.global }) }));

const listarClientes = jest.fn();
jest.mock('@/lib/services/clientesListadoService', () => ({ listarClientes: (...a: unknown[]) => listarClientes(...a) }));

const guardarFacturaVenta = jest.fn();
const emitirFacturaVenta = jest.fn();
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
  return {
    ErrorPeticionFactura,
    guardarFacturaVenta: (...a: unknown[]) => guardarFacturaVenta(...a),
    emitirFacturaVenta: (...a: unknown[]) => emitirFacturaVenta(...a),
  };
});
const evaluarPromociones = jest.fn(async () => ({ discountTotal: 0, itemDiscounts: {} }));
jest.mock('@/lib/services/promotionEngine', () => ({ promotionEngine: { evaluate: (...a: unknown[]) => evaluarPromociones(...(a as [])) } }));
const sendToFactus = jest.fn(async () => ({ success: true }));
jest.mock('@/lib/services/electronicInvoicingService', () => ({ electronicInvoicingService: { sendToFactus: (...a: unknown[]) => sendToFactus(...(a as [])) } }));
const toastError = jest.fn();
const toastSuccess = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ toastError: (...a: unknown[]) => toastError(...a), toastSuccess: (...a: unknown[]) => toastSuccess(...a), toast: jest.fn(), useToast: () => ({ toast: jest.fn() }) }));

const push = jest.fn();
let parametros = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => parametros,
  usePathname: () => '/app/finanzas/facturas-venta/nuevo',
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
  ElegirCliente: ({ cliente, onCambiar }: { cliente: { id: string } | null; onCambiar: (c: unknown) => void }) => (
    <div>
      <span data-testid="cliente">{cliente?.id ?? 'sin-cliente'}</span>
      <button type="button" onClick={() => onCambiar({ id: 'c-1', nombre: 'Comercial Andina', plazoDias: null })}>
        elegir-cliente
      </button>
      <button type="button" onClick={() => onCambiar({ id: 'c-2', nombre: 'Con plazo', plazoDias: 45 })}>
        elegir-cliente-plazo
      </button>
    </div>
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

import FormularioFacturaVenta from '@/components/finanzas/facturas-venta/formulario/FormularioFacturaVenta';

const IVA19 = { id: 'tx-1', name: 'IVA 19%', rate: 19, is_default: true, is_active: true, kind: 'tax', tax_templates: { code: 'IVA_19' } };
const INC8 = { id: 'tx-2', name: 'INC 8%', rate: 8, is_default: false, is_active: true, kind: 'tax', tax_templates: { code: 'INC_8' } };
const RETE = { id: 'tx-3', name: 'ReteFuente', rate: 2.5, is_default: false, is_active: true, kind: 'withholding', tax_templates: { code: 'RETE_25' } };

function datosBase() {
  for (const k of Object.keys(tablas)) delete tablas[k];
  consultas.length = 0;
  Object.assign(tablas, {
    organization_currencies: [{ currency_code: 'COP', is_base: true }, { currency_code: 'USD', is_base: false }],
    organization_members: [{ user_id: 'u-9' }],
    profiles: [{ id: 'u-9', first_name: 'Laura', last_name: 'Gómez' }],
    opportunities: [],
    organization_taxes: [IVA19, INC8, RETE],
    organization_payment_methods: [
      { payment_method_code: 'cash', payment_methods: { name: 'Efectivo' } },
      { payment_method_code: 'card', payment_methods: { name: 'Tarjeta' } },
    ],
    products: [],
    stock_levels: [],
  });
}

const producto = (x: Record<string, unknown> = {}) => ({
  id: 101,
  nombre: 'Zapatilla urbana',
  sku: 'ZAP-1',
  precio: 100000,
  precioVenta: 100000,
  stock: 14,
  controlaStock: true,
  serial: false,
  impuestos: [{ id: 'tx-1', codigo: 'IVA_19', nombre: 'IVA 19%', tarifa: 19, predeterminado: true }],
  ...x,
});

async function montar(props: { id?: string } = {}) {
  const r = renderConIdioma(<FormularioFacturaVenta {...props} />);
  await waitFor(() => expect(consultas.some((c) => c.tabla === 'organization_payment_methods')).toBe(true));
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
  return r;
}

async function agregar(p: Record<string, unknown>) {
  productoPrueba.actual = p;
  fireEvent.click(screen.getAllByRole('button', { name: /Buscar producto/ })[0]);
  fireEvent.click(await screen.findByRole('button', { name: 'agregar-producto' }));
}

async function clic(nombre: RegExp | string) {
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: nombre })[0]);
  });
}

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

beforeEach(() => {
  datosBase();
  parametros = new URLSearchParams();
  preferenciaFE.global = false;
  jest.clearAllMocks();
  listarClientes.mockResolvedValue({ filas: [], total: 0 });
  evaluarPromociones.mockResolvedValue({ discountTotal: 0, itemDiscounts: {} });
  resolverTasa.mockResolvedValue(0 as never);
  guardarFacturaVenta.mockResolvedValue({ id: 'fv-1', numero: null, saleId: 's-1', total: 0, faltantes: [] });
  emitirFacturaVenta.mockResolvedValue({ id: 'fv-1', numero: 'FV-1043', stock_descontado: true });
});

describe('Nueva factura de venta v2 — paridad con el formulario anterior (L1–L23)', () => {
  test('L16 + H8: guarda en UNA llamada, sin número inventado; la línea con IVA adicional lleva total bruto', async () => {
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    await agregar(producto());
    await clic(/Guardar borrador/);

    expect(guardarFacturaVenta).toHaveBeenCalledTimes(1);
    const [id, datos] = guardarFacturaVenta.mock.calls[0];
    expect(id).toBeNull();
    expect(datos).toEqual(
      expect.objectContaining({
        number: null,
        customer_id: 'c-1',
        branch_id: 3,
        currency: 'COP',
        payment_terms: 30,
        payment_method: 'cash',
        tax_included: false,
        include_in_cash_register: true,
        commission_type: 'none',
        opportunity_id: null,
      }),
    );
    expect(datos.items).toEqual([
      expect.objectContaining({ product_id: 101, description: 'Zapatilla urbana', qty: 1, unit_price: 100000, tax_rate: 19, tax_code: 'IVA_19', tax_included: false, total_line: 119000, discount_amount: 0 }),
    ]);
    expect(datos.applied_taxes).toEqual([{ tax_code: 'IVA_19', tax_rate: 19 }]);
    expect(sendToFactus).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/app/finanzas/facturas-venta/fv-1');
  });

  test('L5: el vencimiento es emisión + 30 días por defecto; el plazo del cliente lo cambia (M5)', async () => {
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente-plazo' }));
    await agregar(producto());
    await clic(/Guardar borrador/);
    const datos = guardarFacturaVenta.mock.calls[0][1];
    expect(datos.payment_terms).toBe(45);
    expect(Math.round((Date.parse(datos.due_date) - Date.parse(datos.issue_date)) / 86_400_000)).toBe(45);
  });

  test('validaciones EN LÍNEA (M4): sin cliente ni líneas no guarda y el resumen lo dice arriba', async () => {
    await montar();
    await clic(/Guardar borrador/);
    expect(guardarFacturaVenta).not.toHaveBeenCalled();
    const resumen = await screen.findByText(/Revisa 2 campos/);
    expect(resumen).toBeTruthy();
    expect(screen.getAllByText('Elige el cliente.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Agrega al menos una línea.').length).toBeGreaterThan(0);
    // «Emitir» sigue deshabilitado con su motivo.
    const emitir = screen.getAllByRole('button', { name: /Emitir factura/ })[0] as HTMLButtonElement;
    expect(emitir.disabled).toBe(true);
    expect(screen.getByText('Elige un cliente y agrega una línea')).toBeTruthy();
  });

  test('L11 (F-42): un producto sin impuesto propio toma el predeterminado de la organización al agregarse', async () => {
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    await agregar(producto({ id: 102, nombre: 'Servicio', impuestos: [], precio: 50000 }));
    await clic(/Guardar borrador/);
    expect(guardarFacturaVenta.mock.calls[0][1].items[0]).toEqual(expect.objectContaining({ tax_rate: 19, tax_code: 'IVA_19', total_line: 59500 }));
  });

  test('L10: las promociones del canal finanzas se aplican al guardar a líneas sin descuento manual', async () => {
    evaluarPromociones.mockResolvedValue({ discountTotal: 5000, itemDiscounts: { 101: 5000 } } as never);
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    await agregar(producto());
    await clic(/Guardar borrador/);
    expect(evaluarPromociones).toHaveBeenCalledWith(expect.objectContaining({ channel: 'finances', organization_id: 7, branch_id: 3 }));
    expect(guardarFacturaVenta.mock.calls[0][1].items[0].discount_amount).toBe(5000);
  });

  test('L9: un serializado sin seriales se puede guardar como borrador pero NO emitir', async () => {
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    await agregar(producto({ serial: true }));
    await clic(/Emitir factura/);
    expect(guardarFacturaVenta).not.toHaveBeenCalled();
    expect(screen.getAllByText('Elige los seriales de esta línea antes de emitir.').length).toBeGreaterThan(0);
    await clic(/Guardar borrador/);
    expect(guardarFacturaVenta).toHaveBeenCalledTimes(1);
  });

  test('L7–L8: al elegir vendedor se sugiere la tasa y la comisión viaja como «salesperson»', async () => {
    resolverTasa.mockResolvedValueOnce(5 as never);
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    await agregar(producto());
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'vendedor' }), { target: { value: 'u-9' } });
    });
    expect(resolverTasa).toHaveBeenCalledWith('u-9');
    expect(screen.getByText('Tasa sugerida por la configuración de comisiones.')).toBeTruthy();
    await clic(/Guardar borrador/);
    expect(guardarFacturaVenta.mock.calls[0][1]).toEqual(expect.objectContaining({ salesperson_id: 'u-9', commission_rate: 5, commission_type: 'salesperson', commission_method: 'percentage' }));
  });

  test('H1 CORREGIDO: guardar el borrador con FE activa NO lo envía a la DIAN', async () => {
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    await agregar(producto());
    fireEvent.click(screen.getByRole('switch', { name: /Factura electrónica al emitir/ }));
    await clic(/Guardar borrador/);
    expect(guardarFacturaVenta).toHaveBeenCalled();
    expect(sendToFactus).not.toHaveBeenCalled();
  });

  test('M1 + H1: «Emitir factura» guarda, emite y DESPUÉS envía a la DIAN', async () => {
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    await agregar(producto());
    fireEvent.click(screen.getByRole('switch', { name: /Factura electrónica al emitir/ }));
    await clic(/Emitir factura/);
    await waitFor(() => expect(sendToFactus).toHaveBeenCalledWith('fv-1', 7));
    expect(guardarFacturaVenta).toHaveBeenCalledTimes(1);
    expect(emitirFacturaVenta).toHaveBeenCalledWith('fv-1');
    expect(guardarFacturaVenta.mock.invocationCallOrder[0]).toBeLessThan(emitirFacturaVenta.mock.invocationCallOrder[0]);
    expect(emitirFacturaVenta.mock.invocationCallOrder[0]).toBeLessThan(sendToFactus.mock.invocationCallOrder[0]);
    expect(toastSuccess).toHaveBeenCalledWith('Factura FV-1043 emitida');
    expect(push).toHaveBeenCalledWith('/app/finanzas/facturas-venta/fv-1');
  });

  test('L20: la preferencia global fuerza la factura electrónica', async () => {
    preferenciaFE.global = true;
    await montar();
    const fe = screen.getByRole('switch', { name: /Factura electrónica al emitir/ }) as HTMLButtonElement;
    expect(fe.getAttribute('aria-checked')).toBe('true');
    expect(fe.disabled).toBe(true);
    expect(screen.getByText('Global')).toBeTruthy();
  });

  test('L18 + decisión 6: con faltantes al emitir, el diálogo muestra el ajuste ANTES y «Ajustar y emitir» reintenta', async () => {
    const { ErrorPeticionFactura } = jest.requireMock('@/lib/finanzas/ventas/clienteFacturas') as { ErrorPeticionFactura: new (c: string, e: number, f: unknown[]) => Error };
    emitirFacturaVenta.mockRejectedValueOnce(new ErrorPeticionFactura('stock_insuficiente', 409, [{ product_id: 101, producto: 'Zapatilla urbana', requerido: 5, disponible: 3 }]));
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    await agregar(producto());
    fireEvent.change(screen.getAllByLabelText(/Cantidad de Zapatilla urbana/)[0], { target: { value: '5' } });
    fireEvent.blur(screen.getAllByLabelText(/Cantidad de Zapatilla urbana/)[0]);
    await clic(/Emitir factura/);
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText('Zapatilla urbana: 5 → 3')).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Ajustar y emitir' }));
    });
    await waitFor(() => expect(emitirFacturaVenta).toHaveBeenCalledTimes(2));
    // El segundo guardado edita el borrador ya creado, con la cantidad ajustada.
    expect(guardarFacturaVenta.mock.calls[1][0]).toBe('fv-1');
    expect(guardarFacturaVenta.mock.calls[1][1].items[0].qty).toBe(3);
  });

  test('L22: los errores del servidor se muestran en la banda por código y no navega', async () => {
    const { ErrorPeticionFactura } = jest.requireMock('@/lib/finanzas/ventas/clienteFacturas') as { ErrorPeticionFactura: new (c: string, e: number) => Error };
    guardarFacturaVenta.mockRejectedValueOnce(new ErrorPeticionFactura('sin_permiso', 403));
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    await agregar(producto());
    await clic(/Guardar borrador/);
    expect((await screen.findAllByRole('alert')).some((a) => /permiso/i.test(a.textContent ?? ''))).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  test('L1: duplicar copia las líneas y aplica cliente, moneda, términos, método y notas; banda «Copia de…»', async () => {
    parametros = new URLSearchParams('duplicar=fv-9&cliente=c-9&moneda=USD&terminos=15&metodo_pago=card&notas=Copia');
    tablas.invoice_items = [{ product_id: 5, description: 'Morral', qty: 2, unit_price: 150000, tax_code: 'IVA_19', tax_rate: 19, total_line: 357000, discount_amount: 0 }];
    tablas.invoice_sales = [{ number: 'FV-1038', branch_id: 3 }];
    listarClientes.mockResolvedValue({ filas: [{ id: 'c-9', full_name: 'Cliente nueve', saldo: 0, plazo_dias: null }], total: 1 });
    await montar();
    await waitFor(() => expect(screen.getByTestId('cliente').textContent).toBe('c-9'));
    expect(screen.getByText(/Copia de la factura FV-1038/)).toBeTruthy();
    await clic(/Guardar borrador/);
    const datos = guardarFacturaVenta.mock.calls[0][1];
    expect(datos).toEqual(expect.objectContaining({ customer_id: 'c-9', currency: 'USD', payment_terms: 15, payment_method: 'card', notes: 'Copia' }));
    expect(datos.items[0]).toEqual(expect.objectContaining({ product_id: 5, qty: 2, unit_price: 150000, tax_rate: 19, total_line: 357000 }));
  });

  test('L2: ?cliente= preselecciona el cliente («Nueva venta» desde clientes)', async () => {
    parametros = new URLSearchParams('cliente=c-5');
    listarClientes.mockResolvedValue({ filas: [{ id: 'c-5', full_name: 'Cliente cinco', saldo: 0, plazo_dias: null }], total: 1 });
    await montar();
    await waitFor(() => expect(screen.getByTestId('cliente').textContent).toBe('c-5'));
  });

  test('H6 CORREGIDO: la forma de pago sale de UNA consulta y se elige el primer método', async () => {
    await montar();
    expect(consultas.filter((c) => c.tabla === 'payment_methods')).toHaveLength(0);
    expect(consultas.filter((c) => c.tabla === 'organization_payment_methods')).toHaveLength(1);
    expect((screen.getByLabelText('Forma de pago') as HTMLSelectElement).value).toBe('cash');
  });

  test('decisión 5: varios impuestos en la línea viajan sumados con su detalle', async () => {
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    await agregar(producto({ impuestos: [{ id: 'tx-1', codigo: 'IVA_19', nombre: 'IVA 19%', tarifa: 19 }, { id: 'tx-2', codigo: 'INC_8', nombre: 'INC 8%', tarifa: 8 }] }));
    await clic(/Guardar borrador/);
    const item = guardarFacturaVenta.mock.calls[0][1].items[0];
    expect(item).toEqual(expect.objectContaining({ tax_rate: 27, tax_code: 'IVA_19', total_line: 127000 }));
    expect(item.taxes.map((x: { id: string }) => x.id)).toEqual(['tx-1', 'tx-2']);
  });

  test('M11: salir con cambios pregunta; «Guardar borrador y salir» guarda y va al listado', async () => {
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-cliente' }));
    await agregar(producto());
    await clic('Cancelar');
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByRole('button', { name: 'Seguir editando' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar borrador y salir' }));
    });
    await waitFor(() => expect(guardarFacturaVenta).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith('/app/finanzas/facturas-venta');
  });

  test('sin cambios, «Cancelar» sale sin preguntar', async () => {
    await montar();
    await clic('Cancelar');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(push).toHaveBeenCalledWith('/app/finanzas/facturas-venta');
  });
});

describe('Editar factura de venta v2', () => {
  const borrador = {
    id: 'fv-7',
    status: 'draft',
    number: null,
    customer_id: 'c-3',
    sale_id: 's-7',
    currency: 'COP',
    payment_terms: 45,
    payment_method: 'cash',
    notes: 'Nota',
    terms_conditions: 'Pago a 45 días',
    tax_included: false,
    branch_id: 3,
    salesperson_id: null,
    commission_rate: 0,
    commission_method: 'percentage',
    opportunity_id: null,
    issue_date: '2026-09-20T15:00:00Z',
    due_date: '2026-11-04T15:00:00Z',
  };

  test('no editable (emitida): solo lectura con motivo y acciones Ver · Duplicar · Nota crédito', async () => {
    tablas.invoice_sales = [{ ...borrador, status: 'issued', number: 'FV-1042' }];
    tablas.invoice_items = [];
    tablas.customers = [{ full_name: 'Comercial Andina' }];
    renderConIdioma(<FormularioFacturaVenta id="fv-7" />);
    expect(await screen.findByText(/no se puede editar/)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Ver factura/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Duplicar como nueva/ })[0].getAttribute('href')).toBe('/app/finanzas/facturas-venta/nuevo?duplicar=fv-7');
    expect(screen.getAllByRole('link', { name: /Crear nota crédito/ })[0].getAttribute('href')).toBe('/app/finanzas/facturas-venta/fv-7?accion=nota-credito');
    expect(screen.queryByRole('button', { name: /Guardar cambios/ })).toBeNull();
  });

  test('H2–H3 CORREGIDOS: editar conserva «incluir en el arqueo», términos y manda los impuestos con su tarifa', async () => {
    tablas.invoice_sales = [borrador];
    tablas.sales = [{ include_in_cash_register: false }];
    tablas.invoice_items = [{ id: 'l-1', product_id: 101, description: 'Zapatilla', qty: 1, unit_price: 100000, tax_code: 'IVA_19', tax_rate: 19, total_line: 119000, discount_amount: 0, note: 'Talla 42' }];
    listarClientes.mockResolvedValue({ filas: [{ id: 'c-3', full_name: 'Comercial Andina', saldo: 0, plazo_dias: 45 }], total: 1 });
    renderConIdioma(<FormularioFacturaVenta id="fv-7" />);
    const boton = await screen.findByRole('button', { name: /Guardar cambios/ });
    await waitFor(() => expect(screen.getByTestId('cliente').textContent).toBe('c-3'));
    await act(async () => {
      fireEvent.click(boton);
    });
    await waitFor(() => expect(guardarFacturaVenta).toHaveBeenCalled());
    const [id, datos] = guardarFacturaVenta.mock.calls[0];
    expect(id).toBe('fv-7');
    expect(datos).toEqual(expect.objectContaining({ number: null, customer_id: 'c-3', payment_terms: 45, include_in_cash_register: false, terms_conditions: 'Pago a 45 días', notes: 'Nota' }));
    expect(datos.applied_taxes).toEqual([{ tax_code: 'IVA_19', tax_rate: 19 }]);
    expect(datos.items[0]).toEqual(expect.objectContaining({ product_id: 101, qty: 1, unit_price: 100000, tax_rate: 19, note: 'Talla 42' }));
  });

  test('decisión 3: el borrador existente se autoguarda cada 30 s sin toast, solo si hay cambios', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      tablas.invoice_sales = [borrador];
      tablas.invoice_items = [{ id: 'l-1', product_id: 101, description: 'Zapatilla', qty: 1, unit_price: 100000, tax_code: 'IVA_19', tax_rate: 19, total_line: 119000, discount_amount: 0 }];
      listarClientes.mockResolvedValue({ filas: [{ id: 'c-3', full_name: 'Comercial Andina', saldo: 0, plazo_dias: null }], total: 1 });
      renderConIdioma(<FormularioFacturaVenta id="fv-7" />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(100);
      });
      await screen.findByRole('button', { name: /Guardar cambios/ });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(31_000);
      });
      expect(guardarFacturaVenta).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText('Notas para el cliente'), { target: { value: 'Otra nota' } });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(31_000);
      });
      expect(guardarFacturaVenta).toHaveBeenCalledTimes(1);
      expect(guardarFacturaVenta.mock.calls[0][0]).toBe('fv-7');
      expect(toastSuccess).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
