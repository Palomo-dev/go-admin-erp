/**
 * Nota crédito de una factura de venta (plan §2 L10, L18, L19; P1.6, P7).
 *
 * - Contrato: esquema, códigos de error y valor de línea con la proporción de la RPC.
 * - Ruta: organización de la sesión, permiso `finance.void` en el servidor,
 *   factura de otra organización → 404, argumentos que recibe la RPC.
 * - SQL (20260924093524): el saldo tiene UNA regla (total − pagado − notas) y la
 *   nota nunca escribe saldos ni cartera a mano. Dry-run anotado al aplicar
 *   (2026-09-24, transacción que se deshace): NC por líneas con reingreso y
 *   excedente → factura 0/paid, cartera 0/paid, 1 saldo a favor, 1 entrada de
 *   kardex `credit_note`, asiento `accrual:credit_note:<id>`; misma clave →
 *   `repetida`; segunda nota sobre factura acreditada → nota_excede_facturado;
 *   por valor 1.000 → saldo 4.180,01 → 3.180,01; cantidad > disponible →
 *   cantidad_excede_disponible; línea de otra factura → linea_no_pertenece_a_la_factura.
 *   Backfill: 7 facturas con nota viva y saldo que la nota ya cancelaba → 0 (paid).
 */
import * as fs from 'fs';
import * as path from 'path';

const FACTURA = '11111111-2222-4333-8444-555555555555';
const LINEA = '66666666-7777-4888-8999-aaaaaaaaaaaa';

const guion = {
  permisos: new Set<string>(),
  errorRpc: null as null | { message: string; details?: string },
  facturaAjena: false,
  fe: null as string | null,
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];
const encolados: unknown[] = [];

jest.mock('@/lib/services/einvoicing/colaFacturacion.server', () => ({
  encolarDocumento: jest.fn(async (p: unknown) => {
    encolados.push(p);
    return { job: {}, creado: true, servicioActivo: true };
  }),
}));

function consultaFalsa() {
  const filtros: Record<string, unknown> = {};
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => {
      filtros[col] = v;
      return q;
    },
    maybeSingle: async () => ({
      data:
        !guion.facturaAjena && filtros.id === FACTURA && filtros.organization_id === 120
          ? { id: FACTURA, total: 1000, balance: 400, currency: null, customer_id: 'c-1', einvoice_status: guion.fe, document_type: 'invoice', status: 'partial' }
          : null,
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
    if (nombre === 'fn_nota_credito_emitir') {
      return { data: { id: 'nc-1', numero: 'NC-0009', total: 600, repetida: false, excedente: 0, liquidacion: null, productos_reingresados: 1 }, error: null };
    }
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

import { POST } from '@/app/api/facturas-venta/[id]/nota-credito/route';
import {
  codigoErrorNota,
  estadoHttpErrorNota,
  solicitudNotaSchema,
  totalNota,
  valorLineaNota,
  type LineaAcreditable,
} from '@/lib/finanzas/ventas/contratoNotaCredito';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

const peticion = (body: unknown) =>
  new Request(`http://x/api/facturas-venta/${FACTURA}/nota-credito`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: FACTURA }) };
const base = { modo: 'lineas', lineas: [{ itemId: LINEA, cantidad: 1 }], motivo: 'Devolución del cliente', claveIdempotencia: 'nota-12345678' };

beforeEach(() => {
  guion.permisos = new Set(['finance.void']);
  guion.errorRpc = null;
  guion.facturaAjena = false;
  guion.fe = null;
  rpcs.length = 0;
  encolados.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('contrato de la nota crédito', () => {
  const linea = (total: number, cantidad: number, disponible = cantidad): LineaAcreditable => ({
    itemId: `l-${total}`,
    productId: 1,
    descripcion: 'x',
    cantidad,
    acreditada: cantidad - disponible,
    disponible,
    precioUnitario: 0,
    descuento: 0,
    total,
    tarifa: 19,
    incluido: false,
  });

  test('valor de línea: total × cantidad / facturada, a centavos', () => {
    expect(valorLineaNota(linea(1190, 3), 1)).toBe(396.67);
    expect(valorLineaNota(linea(1190, 3), 0)).toBe(0);
  });

  test('total por modo: toda la factura usa lo disponible; por líneas, lo elegido con tope', () => {
    const ls = [linea(1000, 2, 1), linea(500, 1)];
    expect(totalNota('total', ls, {}, 0)).toBe(1000);
    expect(totalNota('lineas', ls, { 'l-1000': 5 }, 0)).toBe(500);
    expect(totalNota('valor', ls, {}, 123.456)).toBe(123.46);
  });

  test('esquema: por líneas exige líneas; por valor exige valor y concepto; sin repetidas', () => {
    expect(solicitudNotaSchema.safeParse(base).success).toBe(true);
    expect(solicitudNotaSchema.safeParse({ ...base, lineas: [] }).success).toBe(false);
    expect(solicitudNotaSchema.safeParse({ ...base, modo: 'valor', lineas: undefined, valor: 10 }).success).toBe(false);
    expect(solicitudNotaSchema.safeParse({ ...base, lineas: [{ itemId: LINEA, cantidad: 1 }, { itemId: LINEA, cantidad: 2 }] }).success).toBe(false);
    expect(solicitudNotaSchema.safeParse({ ...base, organization_id: 7 }).success).toBe(false);
  });

  test('códigos estables y estado HTTP', () => {
    expect(codigoErrorNota('nota_excede_facturado')).toBe('nota_excede_facturado');
    expect(codigoErrorNota('Acceso denegado a la organización 9')).toBe('factura_no_encontrada');
    expect(codigoErrorNota('No se encontró la cuenta de caja o banco para el medio cash')).toBe('cuenta_no_encontrada');
    expect(codigoErrorNota('otro')).toBe('error_desconocido');
    expect(estadoHttpErrorNota('sin_caja_abierta')).toBe(409);
    expect(estadoHttpErrorNota('sin_permiso')).toBe(403);
  });
});

describe('POST /api/facturas-venta/[id]/nota-credito', () => {
  test('emite con finance.void y pasa a la RPC solo lo validado', async () => {
    const r = await POST(peticion(base), params);
    expect(r.status).toBe(201);
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].nombre).toBe('fn_nota_credito_emitir');
    expect(rpcs[0].args).toMatchObject({
      p_invoice_id: FACTURA,
      p_modo: 'lineas',
      p_lineas: [{ item_id: LINEA, cantidad: 1 }],
      p_valor: null,
      p_reingresar: false,
      p_liquidacion: 'saldo_a_favor',
      p_clave_idempotencia: 'nota-12345678',
    });
    expect(encolados).toHaveLength(0);
  });

  test('factura aceptada por la DIAN → la nota se encola con concepto y motivo', async () => {
    guion.fe = 'accepted';
    const r = await POST(peticion({ ...base, conceptoDian: '1' }), params);
    expect((await r.json()).resultado.fe).toBe('encolada');
    expect(encolados).toEqual([
      { organizationId: 120, documentType: 'credit_note', invoiceId: 'nc-1', opciones: { concepto: '1', observacion: 'Devolución del cliente' } },
    ]);
  });

  test('sin permiso → 403; organización ajena en el cuerpo → 403; factura de otra organización → 404', async () => {
    guion.permisos = new Set(['finance.create']);
    expect((await POST(peticion(base), params)).status).toBe(403);
    guion.permisos = new Set(['finance.void']);
    expect((await POST(peticion({ ...base, organization_id: 7 }), params)).status).toBe(403);
    guion.facturaAjena = true;
    expect((await POST(peticion(base), params)).status).toBe(404);
    expect(rpcs).toHaveLength(0);
  });

  test('tope excedido en la base → 409 con el detalle', async () => {
    guion.errorRpc = { message: 'nota_excede_facturado', details: '{"tope":100,"nota":150}' };
    const r = await POST(peticion(base), params);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'nota_excede_facturado', detalle: { tope: 100, nota: 150 } });
  });
});

describe('SQL 20260924093524: una regla de saldo y la nota en una transacción', () => {
  const sql = leer('supabase/migrations/20260924093524_nota_credito_emitir_y_saldo_con_notas.sql');
  const rollback = leer('supabase/rollbacks/20260924093524_nota_credito_emitir_y_saldo_con_notas_rollback.sql');

  test('saldo = total − pagado − notas vivas, en una sola función que usan los dos disparadores', () => {
    expect(sql).toMatch(/v_balance := greatest\(v_inv\.total - v_paid - v_cred, 0\)/);
    expect(sql.match(/PERFORM public\.fn_factura_venta_recalcular_saldo/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/create trigger trg_nota_credito_recalcula_factura/);
  });

  test('la nota no escribe saldos ni cartera a mano; valida permiso y tope', () => {
    const cuerpo = sql.slice(sql.indexOf('create or replace function public.fn_nota_credito_emitir'));
    expect(cuerpo).not.toMatch(/update public\.invoice_sales/i);
    expect(cuerpo).not.toMatch(/accounts_receivable/i);
    expect(cuerpo).toMatch(/fn_finanzas_exigir_permiso\(v_inv\.organization_id, array\['finance\.void'\]\)/);
    expect(cuerpo).toMatch(/nota_excede_facturado/);
    expect(cuerpo).toMatch(/fn_pos_numero_nota_credito/);
    expect(sql).toMatch(/revoke all on function public\.fn_nota_credito_emitir\([^)]*\) from public, anon;/);
    expect(sql).toMatch(/revoke all on function public\.fn_factura_venta_recalcular_saldo\(uuid\) from public, anon, authenticated;/);
  });

  test('la reversión restaura las dos funciones de disparador y quita lo nuevo', () => {
    expect(rollback).toMatch(/create or replace function public\.fn_recalc_invoice_balance_from_payments/);
    expect(rollback).toMatch(/create or replace function public\.fn_recalc_invoice_totals/);
    expect(rollback).toMatch(/drop function if exists public\.fn_nota_credito_emitir/);
  });
});
