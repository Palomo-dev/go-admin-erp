/**
 * Facturas de venta — detalle y rutas de emitir / anular (plan §2 L3, L4, L18, L19).
 *
 * - Desglose de impuestos con la misma regla de base que fn_recalc_invoice_totals.
 * - Las rutas toman la organización de la sesión, exigen el permiso en el
 *   servidor y devuelven códigos estables; con faltantes, la lista.
 */

const FACTURA = '11111111-2222-4333-8444-555555555555';

const guion = {
  permisos: new Set<string>(),
  errorRpc: null as null | { message: string; details?: string },
  /** La factura existe, pero en otra organización (la sesión es la 120). */
  facturaAjena: false,
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];

/** `from('invoice_sales').select().eq('id').eq('organization_id').maybeSingle()`. */
function consultaFalsa() {
  const filtros: Record<string, unknown> = {};
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => {
      filtros[col] = v;
      return q;
    },
    maybeSingle: async () => ({
      data: !guion.facturaAjena && filtros.id === FACTURA && filtros.organization_id === 120 ? { id: FACTURA } : null,
      error: null,
    }),
  };
  return q;
}

const supabaseFalso = {
  from: () => consultaFalsa(),
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    if (guion.errorRpc) return { data: null, error: guion.errorRpc };
    if (nombre === 'fn_factura_venta_emitir') return { data: { id: FACTURA, numero: 'FACT-0010', stock_descontado: true }, error: null };
    if (nombre === 'fn_factura_venta_anular') return { data: { id: FACTURA, productos_devueltos: 2 }, error: null };
    return { data: null, error: { message: 'rpc inesperada' } };
  },
};

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  const ctx = { userId: 'u-1', organizationId: 120, roleId: 4, isSuperAdmin: false };
  return {
    OrgContextError,
    hasOrgAdminOrPermission: jest.fn(async (_c: unknown, code: string) => guion.permisos.has(code)),
    withOrg:
      (handler: (c: unknown, r: Request, p: unknown) => Promise<Response>) =>
      async (req: Request, params: unknown) => {
        try {
          return await handler({ ...ctx, supabase: supabaseFalso }, req, params);
        } catch (err) {
          if (err instanceof OrgContextError) {
            const e = err as { message: string; code: string; statusCode: number };
            return new Response(JSON.stringify({ error: e.message, code: e.code }), { status: e.statusCode });
          }
          throw err;
        }
      },
  };
});

import { POST as emitir } from '@/app/api/facturas-venta/[id]/emitir/route';
import { POST as anular } from '@/app/api/facturas-venta/[id]/anular/route';
import { codigoErrorFactura, estadoHttpErrorFactura } from '@/lib/finanzas/ventas/contratoFacturas';
import { asientoDescuadrado, diasVencidos, impuestosDeLineas, pagoAnulable, totalPagado } from '@/lib/finanzas/ventas/detalleLogica';

const peticion = (url: string, body: unknown = {}) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: FACTURA }) };

beforeEach(() => {
  guion.permisos = new Set(['finance.create', 'finance.void']);
  guion.errorRpc = null;
  guion.facturaAjena = false;
  rpcs.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('impuestosDeLineas (regla de fn_recalc_invoice_totals)', () => {
  const linea = (tarifa: number, cantidad: number, precio: number, total: number, nombre: string | null = 'IVA') => ({
    cantidad,
    precioUnitario: precio,
    descuento: 0,
    tarifa,
    total,
    nombreImpuesto: nombre,
  });

  test('impuestos adicionales: base = cantidad × precio; impuesto = total − base', () => {
    expect(impuestosDeLineas([linea(19, 2, 100, 238), linea(8, 1, 50, 54, 'INC')], false, 'Impuesto')).toEqual([
      { nombre: 'IVA', tarifa: 19, base: 200, importe: 38 },
      { nombre: 'INC', tarifa: 8, base: 50, importe: 4 },
    ]);
  });

  test('impuestos incluidos: la base se redondea por línea', () => {
    expect(impuestosDeLineas([linea(19, 1, 11900, 11900)], true, 'Impuesto')).toEqual([{ nombre: 'IVA', tarifa: 19, base: 10000, importe: 1900 }]);
  });

  test('agrupa por nombre y tarifa; exentas fuera; sin nombre usa el de respaldo', () => {
    const r = impuestosDeLineas([linea(19, 1, 100, 119), linea(19, 1, 100, 119, 'iva'), linea(0, 1, 100, 100), linea(5, 1, 100, 105, null)], false, 'Impuesto');
    expect(r).toEqual([
      { nombre: 'IVA', tarifa: 19, base: 200, importe: 38 },
      { nombre: 'Impuesto', tarifa: 5, base: 100, importe: 5 },
    ]);
  });
});

describe('pagos, asiento y vencimiento del detalle', () => {
  test('solo cuentan los pagos vivos; se anulan los de venta', () => {
    expect(totalPagado([{ estado: 'completed', monto: 10.1 }, { estado: 'void', monto: 5 }, { estado: 'completed', monto: 0.2 }])).toBe(10.3);
    expect(pagoAnulable({ estado: 'completed', origen: 'account_receivable' })).toBe(true);
    expect(pagoAnulable({ estado: 'void', origen: 'account_receivable' })).toBe(false);
    expect(pagoAnulable({ estado: 'completed', origen: 'folio' })).toBe(false);
  });

  test('H1: asiento vivo que no cuadra (tolerancia de un peso)', () => {
    expect(asientoDescuadrado([{ clave: 'accrual:sale:x', debito: 120, revertido: false }], 100)).toEqual({ descuadrado: true, diferencia: 20 });
    expect(asientoDescuadrado([{ clave: 'accrual:sale:x', debito: 100.5, revertido: false }], 100).descuadrado).toBe(false);
    expect(asientoDescuadrado([{ clave: 'accrual:sale:x', debito: 120, revertido: true }], 100).descuadrado).toBe(false);
  });

  test('días vencidos entre días calendario', () => {
    expect(diasVencidos('2026-09-01', '2026-09-24')).toBe(23);
    expect(diasVencidos('2026-09-30', '2026-09-24')).toBe(0);
    expect(diasVencidos(null, '2026-09-24')).toBe(0);
  });
});

describe('códigos de error de la RPC', () => {
  test('mensaje estable → código; factura ajena → no encontrada', () => {
    expect(codigoErrorFactura('con_pagos')).toBe('con_pagos');
    expect(codigoErrorFactura('Acceso denegado a la organización')).toBe('factura_no_encontrada');
    expect(codigoErrorFactura('boom')).toBe('error_desconocido');
    expect(estadoHttpErrorFactura('stock_insuficiente')).toBe(409);
    expect(estadoHttpErrorFactura('factura_no_encontrada')).toBe(404);
  });
});

describe('POST /api/facturas-venta/[id]/emitir', () => {
  test('emite con permiso finance.create', async () => {
    const r = await emitir(peticion(`http://x/api/facturas-venta/${FACTURA}/emitir`), params);
    expect(r.status).toBe(200);
    expect(rpcs).toEqual([{ nombre: 'fn_factura_venta_emitir', args: { p_invoice_id: FACTURA } }]);
  });

  test('sin permiso → 403 sin llamar a la RPC; organización ajena → 403', async () => {
    guion.permisos = new Set();
    expect((await emitir(peticion(`http://x/api/facturas-venta/${FACTURA}/emitir`), params)).status).toBe(403);
    guion.permisos = new Set(['finance.create']);
    expect((await emitir(peticion(`http://x/api/facturas-venta/${FACTURA}/emitir`, { organization_id: 7 }), params)).status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  test('faltantes de inventario → 409 con la lista', async () => {
    guion.errorRpc = { message: 'stock_insuficiente', details: '[{"product_id":7,"producto":"Café","requerido":3,"disponible":1}]' };
    const r = await emitir(peticion(`http://x/api/facturas-venta/${FACTURA}/emitir`), params);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'stock_insuficiente', faltantes: [{ producto: 'Café', requerido: 3, disponible: 1 }] });
  });

  test('factura de otra organización de la persona → 404 sin llamar a la RPC', async () => {
    guion.facturaAjena = true;
    const r = await emitir(peticion(`http://x/api/facturas-venta/${FACTURA}/emitir`), params);
    expect(r.status).toBe(404);
    expect(rpcs).toHaveLength(0);
  });

  test('id mal formado → 404', async () => {
    const r = await emitir(peticion('http://x/api/facturas-venta/x/emitir'), { params: Promise.resolve({ id: 'x' }) });
    expect(r.status).toBe(404);
  });
});

describe('POST /api/facturas-venta/[id]/anular', () => {
  test('anula con motivo y finance.void', async () => {
    const r = await anular(peticion(`http://x/api/facturas-venta/${FACTURA}/anular`, { motivo: 'Factura duplicada' }), params);
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({ nombre: 'fn_factura_venta_anular', args: { p_invoice_id: FACTURA, p_motivo: 'Factura duplicada' } });
  });

  test('sin motivo → 400; sin permiso → 403', async () => {
    expect((await anular(peticion(`http://x/api/facturas-venta/${FACTURA}/anular`, {}), params)).status).toBe(400);
    guion.permisos = new Set(['finance.create']);
    expect((await anular(peticion(`http://x/api/facturas-venta/${FACTURA}/anular`, { motivo: 'Factura duplicada' }), params)).status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  test('L4 en la base: con pagos → 409 con_pagos', async () => {
    guion.errorRpc = { message: 'con_pagos' };
    const r = await anular(peticion(`http://x/api/facturas-venta/${FACTURA}/anular`, { motivo: 'Factura duplicada' }), params);
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe('con_pagos');
  });
});
