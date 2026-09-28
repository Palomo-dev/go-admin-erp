/**
 * Anular una nota crédito de venta (20260928144544, `fn_nota_credito_anular`).
 *
 * Antes lo hacía el navegador (notasCreditoService.anularNotaCredito) sin
 * permiso: ponía la nota en 'void' y reescribía el saldo de la factura sumando
 * el monto de la nota — que el disparador ya había devuelto —, sin revertir
 * asiento, reingreso, saldo a favor ni devolución, y dejaba anular una nota
 * aceptada por la DIAN.
 *
 * - Ruta: organización de la sesión, permiso `finance.void` en el servidor,
 *   nota de otra organización → 404 sin llamar a la RPC, motivo obligatorio,
 *   errores de la RPC con su código y el texto en el idioma del usuario.
 * - SQL: una transacción que revierte todo por contra-asiento y kardex, sin
 *   escribir el saldo de la factura; revocada a anon.
 * - Cliente: el servicio del navegador ya no escribe invoice_sales.
 * - Dry-run anotado en la migración (transacción que se deshace, org 137).
 */
import * as fs from 'fs';
import * as path from 'path';

const NOTA = '11111111-2222-4333-8444-555555555555';

const guion = {
  permisos: new Set<string>(),
  errorRpc: null as null | { message: string },
  ajena: false,
  tipo: 'credit_note' as string,
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];

// notaCredito.server importa la cola de FE (y ella el cliente del navegador): sin red ni env.
jest.mock('@/lib/services/einvoicing/colaFacturacion.server', () => ({ encolarDocumento: jest.fn() }));

function consultaFalsa(tabla: string) {
  const filtros: Record<string, unknown> = {};
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => {
      filtros[col] = v;
      return q;
    },
    maybeSingle: async () => {
      if (tabla === 'profiles') return { data: { preferred_language: 'en' }, error: null };
      return {
        data: !guion.ajena && filtros.id === NOTA && filtros.organization_id === 120 ? { id: NOTA, document_type: guion.tipo } : null,
        error: null,
      };
    },
  };
  return q;
}

const supabaseFalso = {
  from: (tabla: string) => consultaFalsa(tabla),
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    if (guion.errorRpc) return { data: null, error: guion.errorRpc };
    return {
      data: { id: NOTA, status: 'void', ya_anulada: false, saldo_factura: 1000, saldos_a_favor_cancelados: 1, devoluciones_anuladas: 0, productos_retirados: 2 },
      error: null,
    };
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

import { POST } from '@/app/api/notas-credito/[id]/anular/route';
import { codigoErrorAnularNota, estadoHttpErrorAnularNota, ERRORES_ANULAR_NOTA } from '@/lib/finanzas/ventas/contratoNotaCredito';
import { ORIGENES_MOVIMIENTO_STOCK } from '@/lib/inventario/origenesMovimientoStock';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

const peticion = (body: unknown) =>
  new Request(`http://x/api/notas-credito/${NOTA}/anular`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: NOTA }) };

async function llamar(body: unknown) {
  const res = await POST(peticion(body), params as never);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  guion.permisos = new Set(['finance.void']);
  guion.errorRpc = null;
  guion.ajena = false;
  guion.tipo = 'credit_note';
  rpcs.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/notas-credito/[id]/anular', () => {
  test('sin finance.void → 403 y no toca la base', async () => {
    guion.permisos = new Set(['finance.view', 'finance.create']);
    const r = await llamar({ motivo: 'Nota mal emitida' });
    expect(r.status).toBe(403);
    expect(r.json.codigo).toBe('sin_permiso');
    expect(rpcs).toEqual([]);
  });

  test('nota de otra organización → 404 sin llamar a la RPC; una factura tampoco se anula por aquí', async () => {
    guion.ajena = true;
    expect((await llamar({ motivo: 'Nota mal emitida' })).status).toBe(404);
    guion.ajena = false;
    guion.tipo = 'invoice';
    expect((await llamar({ motivo: 'Nota mal emitida' })).status).toBe(404);
    expect(rpcs).toEqual([]);
  });

  test('motivo corto o ausente → 400 motivo_obligatorio; organización ajena en el cuerpo → 403', async () => {
    expect((await llamar({ motivo: 'x' })).json.codigo).toBe('motivo_obligatorio');
    expect((await llamar({})).status).toBe(400);
    expect((await llamar({ motivo: 'Nota mal emitida', organization_id: 999 })).status).toBe(403);
    expect(rpcs).toEqual([]);
  });

  test('llama a fn_nota_credito_anular con la nota y el motivo, y devuelve lo que revirtió', async () => {
    const r = await llamar({ motivo: '  Nota mal emitida  ' });
    expect(r.status).toBe(200);
    expect(rpcs).toEqual([{ nombre: 'fn_nota_credito_anular', args: { p_nota_id: NOTA, p_motivo: 'Nota mal emitida' } }]);
    expect(r.json.resultado).toEqual({
      id: NOTA,
      yaAnulada: false,
      saldoFactura: 1000,
      saldosAFavorCancelados: 1,
      devolucionesAnuladas: 0,
      productosRetirados: 2,
    });
  });

  test('nota aceptada por la DIAN → 409 con el texto en el idioma del usuario', async () => {
    guion.errorRpc = { message: 'nota_aceptada_dian' };
    const r = await llamar({ motivo: 'Nota mal emitida' });
    expect(r.status).toBe(409);
    expect(r.json.codigo).toBe('nota_aceptada_dian');
    expect(String(r.json.error)).toMatch(/debit note/);
  });

  test('saldo a favor ya usado → 409; permiso negado por la base → 403', async () => {
    guion.errorRpc = { message: 'saldo_a_favor_aplicado' };
    expect((await llamar({ motivo: 'Nota mal emitida' })).status).toBe(409);
    guion.errorRpc = { message: 'sin_permiso' };
    expect((await llamar({ motivo: 'Nota mal emitida' })).status).toBe(403);
  });
});

describe('contrato', () => {
  test('códigos de la RPC y organización ajena', () => {
    expect(codigoErrorAnularNota('Acceso denegado a la organización')).toBe('nota_no_encontrada');
    expect(codigoErrorAnularNota('pago_en_caja_cerrada')).toBe('pago_en_caja_cerrada');
    expect(codigoErrorAnularNota('boom')).toBe('error_desconocido');
    expect(estadoHttpErrorAnularNota('nota_en_envio_dian')).toBe(409);
    expect(estadoHttpErrorAnularNota('error_desconocido')).toBe(500);
  });

  test('cada código tiene su texto en es, en, fr y pt', () => {
    for (const l of ['es', 'en', 'fr', 'pt']) {
      const m = JSON.parse(leer(`messages/${l}.json`)) as { documentosVenta: { notaCreditoAnular: { errores: Record<string, string> } } };
      for (const c of [...ERRORES_ANULAR_NOTA, 'error_desconocido', 'datos_invalidos']) {
        expect(m.documentosVenta.notaCreditoAnular.errores[c]).toEqual(expect.any(String));
      }
    }
  });
});

describe('SQL de 20260928144544', () => {
  const sql = leer('supabase/migrations/20260928144544_nota_credito_anular.sql');
  const cuerpo = sql.slice(sql.indexOf('create or replace function public.fn_nota_credito_anular'));

  test('permiso finance.void en la base, revocada a anon, motivo e idempotencia', () => {
    expect(cuerpo).toMatch(/fn_finanzas_exigir_permiso\(v_nc\.organization_id, array\['finance\.void'\]\)/);
    expect(sql).toMatch(/revoke all on function public\.fn_nota_credito_anular\(uuid, text\) from public, anon;/);
    expect(cuerpo).toMatch(/'motivo_obligatorio'/);
    expect(cuerpo).toMatch(/'ya_anulada', true/);
    expect(cuerpo).toMatch(/for update/);
  });

  test('una nota aceptada por la DIAN no se anula (einvoice_status, no status)', () => {
    expect(cuerpo).toMatch(/v_nc\.einvoice_status = 'accepted'/);
    expect(cuerpo).toMatch(/'nota_aceptada_dian'/);
  });

  test('revierte por contra-asiento, fn_anular_pago y kardex propio; nunca escribe el saldo de la factura', () => {
    expect(cuerpo).toMatch(/fn_revertir_asiento_en_fecha/);
    expect(cuerpo).toMatch(/'accrual:credit_note:' \|\| v_nc\.id/);
    expect(cuerpo).toMatch(/perform public\.fn_anular_pago\(/);
    expect(cuerpo).toMatch(/'credit_note_void'/);
    expect(cuerpo).toMatch(/'saldo_a_favor_aplicado'/);
    expect(cuerpo).not.toMatch(/set\s+balance/i);
    expect(cuerpo).not.toMatch(/delete\s+from\s+public\.journal/i);
  });

  test('credit_note_void está en el CHECK y en ORIGENES_MOVIMIENTO_STOCK (guardarraíl 23)', () => {
    expect(sql).toMatch(/'credit_note_void'\]::text\[\]\)\)/);
    expect(ORIGENES_MOVIMIENTO_STOCK).toContain('credit_note_void');
  });

  test('el rollback existe y advierte que no revierte datos', () => {
    expect(leer('supabase/rollbacks/20260928144544_nota_credito_anular_rollback.sql')).toMatch(/no revierte datos/);
  });
});

test('el servicio del navegador ya no escribe la nota ni la factura: llama a la ruta', () => {
  const src = leer('src/lib/services/notasCreditoService.ts');
  const metodo = src.slice(src.indexOf('async anularNotaCredito('), src.indexOf('Obtener estadísticas'));
  expect(metodo).toMatch(/\/api\/notas-credito\/\$\{encodeURIComponent\(id\)\}\/anular/);
  expect(metodo).not.toMatch(/\.update\(|from\('invoice_sales'\)/);
});
