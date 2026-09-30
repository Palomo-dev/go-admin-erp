/**
 * Números de prueba internos del agente de voz (2026-09-30).
 *
 *  - Normalización a E.164 con el MISMO criterio que el despachador.
 *  - Servicio: auditoría (created_by / removed_by = usuario de la sesión, baja
 *    lógica, nunca DELETE), traducción de los errores de la base (duplicado,
 *    tope de 10, RLS) y organización siempre la del llamador.
 *  - Ruta /api/crm/settings/telephony/test-numbers: sin sesión 401, sin admin
 *    403 (y el servicio no se toca), organización ajena 403 FOREIGN_ORGANIZATION
 *    con `readOrgBody` REAL, y escritura con el cliente de la SESIÓN.
 *
 * Los ejemplos usan números ficticios (+57 300 000 0000).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const { readOrgBody } = jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody');

const sesion: { ctx: Record<string, unknown> | null; admin: boolean } = { ctx: null, admin: false };

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  readOrgBody,
  withOrg:
    (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>, opts?: { admin?: boolean }) =>
    async (req: Request, rp: unknown) => {
      try {
        if (!sesion.ctx) throw new OrgContextError('No autenticado', 401, 'UNAUTHENTICATED');
        if (opts?.admin && !sesion.admin) throw new OrgContextError('Requiere administrador', 403, 'FORBIDDEN');
        return await handler(sesion.ctx, req, rp);
      } catch (err) {
        if (err instanceof OrgContextError) {
          const e = err as InstanceType<typeof OrgContextError>;
          return new Response(JSON.stringify({ error: e.message, code: e.code }), { status: e.statusCode });
        }
        throw err;
      }
    },
}));

jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: jest.fn(() => {
    throw new Error('la ruta de números de prueba no debe usar el cliente de servicio');
  }),
}));

import {
  agregarNumeroPrueba,
  esNumeroPrueba,
  listarNumerosPrueba,
  MAX_NUMEROS_PRUEBA,
  normalizarNumeroPrueba,
  NumeroPruebaError,
  quitarNumeroPrueba,
} from '@/lib/services/crm/voiceAgent/numerosPrueba';
import { DELETE, GET, POST } from '@/app/api/crm/settings/telephony/test-numbers/route';

// ─── Doble de Supabase ────────────────────────────────────────────────────────

type Op = { table: string; verb: string; payload?: unknown; filters: Array<[string, string, unknown]> };
type Res = { data?: unknown; error?: { message: string; code?: string } | null };

function makeSupabase(resolve: (op: Op) => Res = () => ({ data: null })) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      const start = (verb: string, payload?: unknown) => {
        const op: Op = { table, verb, payload, filters: [] };
        ops.push(op);
        const settle = async () => {
          const r = resolve(op);
          return { data: r.data ?? null, error: r.error ?? null };
        };
        const proxy: Record<string, unknown> = {};
        for (const f of ['eq', 'is', 'order', 'limit']) {
          proxy[f] = (c: string, v?: unknown) => {
            op.filters.push([f, c, v]);
            return proxy;
          };
        }
        proxy.select = () => proxy;
        proxy.single = settle;
        proxy.maybeSingle = settle;
        proxy.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => settle().then(ok, ko);
        return proxy;
      };
      return {
        select: () => start('select'),
        insert: (p: unknown) => start('insert', p),
        update: (p: unknown) => start('update', p),
        delete: () => start('delete'),
      };
    },
    rpc: jest.fn(),
  } as unknown as SupabaseClient & { rpc: jest.Mock };
  return { client, ops };
}

const FILA = {
  id: '0a9d96a9-29f7-4aad-b457-c6167c078393',
  phone_e164: '+573000000000',
  label: 'Celular de ventas',
  created_by: 'u-admin',
  created_at: '2026-09-30T15:00:00Z',
};

let silencio: jest.SpyInstance[] = [];
beforeEach(() => {
  silencio = [jest.spyOn(console, 'info').mockImplementation(() => undefined), jest.spyOn(console, 'warn').mockImplementation(() => undefined)];
});
afterEach(() => silencio.forEach((s) => s.mockRestore()));

// ─── Normalización ───────────────────────────────────────────────────────────

describe('normalizarNumeroPrueba: E.164 con el criterio del despachador', () => {
  test.each([
    ['+57 300 000 0000', '+573000000000'],
    ['3000000000', '+573000000000'],
    ['573000000000', '+573000000000'],
    ['(300) 000-0000', '+573000000000'],
    ['+1 415 555 0100', '+14155550100'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarNumeroPrueba(entrada)).toBe(esperado);
  });

  test.each([[''], ['   '], ['12345'], ['abc'], [null], [undefined], [{}], ['+0 300 000 0000']])('%p no es un número marcable', (entrada) => {
    expect(normalizarNumeroPrueba(entrada)).toBeNull();
  });
});

// ─── Consulta del despachador ────────────────────────────────────────────────

describe('esNumeroPrueba', () => {
  test('pregunta a la base por la organización y el número exactos', async () => {
    const { client } = makeSupabase();
    client.rpc.mockResolvedValue({ data: true, error: null });
    expect(await esNumeroPrueba(client, 7, '+573000000000')).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('fn_voz_es_numero_prueba', { p_org: 7, p_phone: '+573000000000' });
  });

  test('sin número, con error o si la RPC lanza → false (se aplica el tope semanal)', async () => {
    const { client } = makeSupabase();
    expect(await esNumeroPrueba(client, 7, null)).toBe(false);
    expect(client.rpc).not.toHaveBeenCalled();
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await esNumeroPrueba(client, 7, '+573000000000')).toBe(false);
    client.rpc.mockRejectedValueOnce(new Error('red caída'));
    expect(await esNumeroPrueba(client, 7, '+573000000000')).toBe(false);
    client.rpc.mockResolvedValueOnce({ data: 'true', error: null });
    expect(await esNumeroPrueba(client, 7, '+573000000000')).toBe(false);
  });
});

// ─── Servicio: altas, bajas y auditoría ──────────────────────────────────────

describe('agregarNumeroPrueba / quitarNumeroPrueba', () => {
  test('el alta normaliza, va a nombre del usuario y en la organización del llamador', async () => {
    const { client, ops } = makeSupabase(() => ({ data: FILA }));
    const r = await agregarNumeroPrueba(client, 7, 'u-admin', { phone: '300 000 0000', label: '  Celular de ventas ' });
    expect(r).toEqual(FILA);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      table: 'crm_voice_test_numbers',
      verb: 'insert',
      payload: { organization_id: 7, phone_e164: '+573000000000', label: 'Celular de ventas', created_by: 'u-admin' },
    });
  });

  test('número inválido o etiqueta larga → 400 sin tocar la base', async () => {
    const { client, ops } = makeSupabase();
    await expect(agregarNumeroPrueba(client, 7, 'u', { phone: '123' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(agregarNumeroPrueba(client, 7, 'u', { phone: '3000000000', label: 'x'.repeat(81) })).rejects.toMatchObject({ statusCode: 400 });
    await expect(agregarNumeroPrueba(client, 7, 'u', { phone: '3000000000', label: 5 })).rejects.toMatchObject({ statusCode: 400 });
    expect(ops).toHaveLength(0);
  });

  test.each([
    ['23505', 409, /ya está/],
    ['P0001', 409, new RegExp(`Máximo ${MAX_NUMEROS_PRUEBA}`)],
    ['42501', 403, /administrador/],
    ['XX000', 500, /No se pudo agregar/],
  ])('error %s de la base → %i', async (code, status, mensaje) => {
    const { client } = makeSupabase(() => ({ error: { message: 'db', code } }));
    const p = agregarNumeroPrueba(client, 7, 'u', { phone: '3000000000' });
    await expect(p).rejects.toBeInstanceOf(NumeroPruebaError);
    await expect(p).rejects.toMatchObject({ statusCode: status, message: expect.stringMatching(mensaje) });
  });

  test('la baja es LÓGICA (update removed_at/removed_by), nunca DELETE, y solo sobre vigentes de la organización', async () => {
    const { client, ops } = makeSupabase(() => ({ data: [{ id: FILA.id }] }));
    await quitarNumeroPrueba(client, 7, 'u-admin', FILA.id);
    expect(ops).toHaveLength(1);
    expect(ops[0].verb).toBe('update');
    expect(ops[0].payload).toMatchObject({ removed_by: 'u-admin', removed_at: expect.any(String) });
    expect(ops[0].filters).toEqual(
      expect.arrayContaining([
        ['eq', 'organization_id', 7],
        ['eq', 'id', FILA.id],
        ['is', 'removed_at', null],
      ])
    );
  });

  test('quitar un número inexistente, ya dado de baja o de otra organización → 404', async () => {
    const { client } = makeSupabase(() => ({ data: [] }));
    await expect(quitarNumeroPrueba(client, 7, 'u', FILA.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('listar solo trae vigentes de la organización, con autor y fecha', async () => {
    const { client, ops } = makeSupabase(() => ({ data: [FILA] }));
    expect(await listarNumerosPrueba(client, 7)).toEqual([FILA]);
    expect(ops[0].filters).toEqual(expect.arrayContaining([['eq', 'organization_id', 7], ['is', 'removed_at', null]]));
  });
});

// ─── Ruta ────────────────────────────────────────────────────────────────────

const URL_RUTA = 'http://localhost/api/crm/settings/telephony/test-numbers';
const rp = { params: Promise.resolve({}) };
const conBody = (method: string, body: unknown, url = URL_RUTA) =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

describe('Ruta /api/crm/settings/telephony/test-numbers', () => {
  let db: ReturnType<typeof makeSupabase>;

  beforeEach(() => {
    db = makeSupabase((op) => {
      if (op.verb === 'insert') return { data: FILA };
      if (op.verb === 'update') return { data: [{ id: FILA.id }] };
      return { data: [FILA] };
    });
    sesion.ctx = { organizationId: 7, userId: 'u-admin', supabase: db.client };
    sesion.admin = true;
  });

  test('sin sesión → 401 en los tres métodos', async () => {
    sesion.ctx = null;
    expect((await GET(new NextRequest(URL_RUTA), rp)).status).toBe(401);
    expect((await POST(conBody('POST', { phone: '3000000000' }), rp)).status).toBe(401);
    expect((await DELETE(conBody('DELETE', { id: FILA.id }), rp)).status).toBe(401);
  });

  test('sin permiso de administrador → 403 y la base no se toca', async () => {
    sesion.admin = false;
    expect((await GET(new NextRequest(URL_RUTA), rp)).status).toBe(403);
    expect((await POST(conBody('POST', { phone: '3000000000' }), rp)).status).toBe(403);
    expect((await DELETE(conBody('DELETE', { id: FILA.id }), rp)).status).toBe(403);
    expect(db.ops).toHaveLength(0);
  });

  test('organización ajena en el cuerpo o en la query → 403 FOREIGN_ORGANIZATION, sin escribir', async () => {
    const r1 = await POST(conBody('POST', { phone: '3000000000', organization_id: 99 }), rp);
    expect(r1.status).toBe(403);
    expect(await r1.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
    expect((await DELETE(conBody('DELETE', { id: FILA.id, organizationId: 99 }), rp)).status).toBe(403);
    expect((await GET(new NextRequest(`${URL_RUTA}?organization_id=99`), rp)).status).toBe(403);
    expect(db.ops).toHaveLength(0);
  });

  test('GET lista los vigentes de la organización de la sesión y el tope', async () => {
    const r = await GET(new NextRequest(URL_RUTA), rp);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ success: true, data: [FILA], max: MAX_NUMEROS_PRUEBA });
    expect(db.ops[0].filters).toEqual(expect.arrayContaining([['eq', 'organization_id', 7]]));
  });

  test('POST agrega con el cliente de la SESIÓN, la organización de la sesión y el usuario como autor', async () => {
    const r = await POST(conBody('POST', { phone: '+57 300 000 0000', label: 'Prueba', organization_id: 7 }), rp);
    expect(r.status).toBe(201);
    expect(db.ops[0]).toMatchObject({
      verb: 'insert',
      payload: { organization_id: 7, phone_e164: '+573000000000', label: 'Prueba', created_by: 'u-admin' },
    });
  });

  test('POST con número inválido → 400', async () => {
    const r = await POST(conBody('POST', { phone: '12' }), rp);
    expect(r.status).toBe(400);
    expect(db.ops).toHaveLength(0);
  });

  test('POST cuando la base rechaza el 11.º número → 409', async () => {
    db = makeSupabase(() => ({ error: { message: 'Máximo 10', code: 'P0001' } }));
    sesion.ctx = { organizationId: 7, userId: 'u-admin', supabase: db.client };
    expect((await POST(conBody('POST', { phone: '3000000000' }), rp)).status).toBe(409);
  });

  test('DELETE da de baja a nombre del usuario; un id que no es uuid → 400', async () => {
    expect((await DELETE(conBody('DELETE', { id: 'no-es-uuid' }), rp)).status).toBe(400);
    expect(db.ops).toHaveLength(0);
    const r = await DELETE(conBody('DELETE', { id: FILA.id }), rp);
    expect(r.status).toBe(200);
    expect(db.ops[0]).toMatchObject({ verb: 'update', payload: { removed_by: 'u-admin' } });
  });
});
