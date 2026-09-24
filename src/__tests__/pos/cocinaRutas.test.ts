// ============================================================
// /api/pos/cocina/{ronda,mesa-linea,alergia} y /api/pos/notas-rapidas.
//
// Reglas duras 5 y 6: la organización y el actor salen de la SESIÓN; una
// organización ajena en el body es 403 sin tocar la base; el permiso de
// configurar notas rápidas se resuelve en el servidor. Se fija además que la
// ronda llega entera a la RPC (la base decide el delta y la idempotencia) y
// que los errores de la RPC salen con código estable y sin el mensaje crudo.
// ============================================================

const llamadas: Array<{ nombre: string; args: Record<string, unknown> }> = [];
const tablas: Array<{ tabla: string; op: string; payload?: unknown; filtros: Record<string, unknown> }> = [];
const guion = {
  error: null as null | { code: string; message: string },
  resultado: { replayed: false, first_ticket_id: 1, tickets: [], lines: [] } as unknown,
  puedeConfigurar: false,
  errorInsert: null as null | { code: string; message: string },
};

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'or', 'is']) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 1, label: 'Sin hielo', kind: 'kitchen' }], error: null }).then(ok);
    return c;
  };
  return {
    OrgContextError,
    getServerOrgContext: async () => ({
      userId: 'u-sesion',
      organizationId: 120,
      roleId: 5,
      isSuperAdmin: false,
      supabase: { from: () => chain() },
    }),
    hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => code === 'organization_settings' && guion.puedeConfigurar),
  };
});

jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => ({
    rpc: async (nombre: string, args: Record<string, unknown>) => {
      llamadas.push({ nombre, args });
      if (nombre === 'pos_notas_rapidas_sugeridas') return { data: [{ texto: 'sin hielo', usos: 9 }, { texto: 'bien asada', usos: 4 }], error: null };
      if (guion.error) return { data: null, error: guion.error };
      return { data: guion.resultado, error: null };
    },
    from: (tabla: string) => {
      const reg = { tabla, op: 'select', payload: undefined as unknown, filtros: {} as Record<string, unknown> };
      tablas.push(reg);
      const c: Record<string, unknown> = {};
      c.insert = (p: unknown) => { reg.op = 'insert'; reg.payload = p; return c; };
      c.update = (p: unknown) => { reg.op = 'update'; reg.payload = p; return c; };
      c.delete = () => { reg.op = 'delete'; return c; };
      c.select = () => c;
      c.eq = (k: string, v: unknown) => { reg.filtros[k] = v; return c; };
      c.single = async () => (guion.errorInsert ? { data: null, error: guion.errorInsert } : { data: { id: 9, ...(reg.payload as object) }, error: null });
      c.maybeSingle = async () => ({ data: { id: 9 }, error: null });
      c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 9 }], error: null }).then(ok);
      return c;
    },
  }),
}));

import { POST as postRonda } from '@/app/api/pos/cocina/ronda/route';
import { POST as postMesa } from '@/app/api/pos/cocina/mesa-linea/route';
import { POST as postAlergia } from '@/app/api/pos/cocina/alergia/route';
import { GET as getNotas, POST as postNota, DELETE as deleteNota } from '@/app/api/pos/notas-rapidas/route';

const CART = '11111111-1111-4111-8111-111111111111';
const LINE = '22222222-2222-4222-8222-222222222222';
const ROUND = '33333333-3333-4333-8333-333333333333';
const SALE_ITEM = '44444444-4444-4444-8444-444444444444';

function req(url: string, method: string, body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ronda = (extra: Record<string, unknown> = {}) => ({
  cart_id: CART,
  branch_id: 7,
  round_key: ROUND,
  server_name: 'Caja 1',
  lines: [{ line_id: LINE, product_name: 'Hamburguesa', quantity: 2, station: 'hot_kitchen', notes: 'sin cebolla', is_allergy: false, variant_data: null, modifiers: null }],
  ...extra,
});

beforeEach(() => {
  llamadas.length = 0;
  tablas.length = 0;
  guion.error = null;
  guion.errorInsert = null;
  guion.puedeConfigurar = false;
  guion.resultado = { replayed: false, first_ticket_id: 1, tickets: [], lines: [] };
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/pos/cocina/ronda', () => {
  it('manda la ronda entera con la organización y el actor de la sesión', async () => {
    const res = await postRonda(req('/api/pos/cocina/ronda', 'POST', ronda()));
    expect(res.status).toBe(200);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].nombre).toBe('pos_cocina_enviar_ronda');
    expect(llamadas[0].args.p_organization_id).toBe(120);
    expect(llamadas[0].args.p_actor).toBe('u-sesion');
    expect((llamadas[0].args.p_payload as { round_key: string }).round_key).toBe(ROUND);
  });

  it('la respuesta de una ronda repetida viaja tal cual (replayed)', async () => {
    guion.resultado = { replayed: true, first_ticket_id: 5, tickets: [{ id: 5 }], lines: [] };
    const res = await postRonda(req('/api/pos/cocina/ronda', 'POST', ronda()));
    expect((await res.json()).resultado).toMatchObject({ replayed: true, first_ticket_id: 5 });
  });

  it('organización ajena en el body → 403 y no llama a la base', async () => {
    const res = await postRonda(req('/api/pos/cocina/ronda', 'POST', ronda({ organization_id: 999 })));
    expect(res.status).toBe(403);
    expect(llamadas).toHaveLength(0);
  });

  it('la misma organización en el body no molesta', async () => {
    const res = await postRonda(req('/api/pos/cocina/ronda', 'POST', ronda({ organization_id: 120 })));
    expect(res.status).toBe(200);
  });

  it('body inválido (sin llave de ronda, línea sin id) → 400 sin llamar a la base', async () => {
    expect((await postRonda(req('/api/pos/cocina/ronda', 'POST', ronda({ round_key: undefined })))).status).toBe(400);
    expect((await postRonda(req('/api/pos/cocina/ronda', 'POST', ronda({ lines: [{ product_name: 'x', quantity: 1 }] })))).status).toBe(400);
    expect(llamadas).toHaveLength(0);
  });

  it('errores de la RPC: código estable, nunca el mensaje crudo', async () => {
    guion.error = { code: '42501', message: 'sucursal_de_otra_organizacion' };
    let res = await postRonda(req('/api/pos/cocina/ronda', 'POST', ronda()));
    expect(res.status).toBe(403);
    expect((await res.json()).codigo).toBe('sucursal_de_otra_organizacion');
    guion.error = { code: 'XX000', message: 'relation "x" does not exist' };
    res = await postRonda(req('/api/pos/cocina/ronda', 'POST', ronda()));
    expect(res.status).toBe(500);
    expect((await res.json()).codigo).toBe('error_interno');
  });
});

describe('POST /api/pos/cocina/mesa-linea', () => {
  it('pasa cantidad y motivo con la organización y el actor de la sesión', async () => {
    guion.resultado = { accion: 'cantidad', sale_id: 's-1', enviado: true, ajuste_ticket_id: 12 };
    const res = await postMesa(req('/api/pos/cocina/mesa-linea', 'POST', { sale_item_id: SALE_ITEM, cantidad: 1, motivo: 'se equivocó' }));
    expect(res.status).toBe(200);
    expect(llamadas[0]).toEqual({
      nombre: 'pos_cocina_ajustar_linea_mesa',
      args: { p_organization_id: 120, p_actor: 'u-sesion', p_sale_item_id: SALE_ITEM, p_nueva_cantidad: 1, p_motivo: 'se equivocó' },
    });
  });

  it('restar algo ya enviado sin motivo → 400 motivo_requerido (lo decide la base)', async () => {
    guion.error = { code: '22023', message: 'motivo_requerido' };
    const res = await postMesa(req('/api/pos/cocina/mesa-linea', 'POST', { sale_item_id: SALE_ITEM, cantidad: 0 }));
    expect(res.status).toBe(400);
    expect((await res.json()).codigo).toBe('motivo_requerido');
  });

  it('cantidad negativa → 400 sin llamar a la base', async () => {
    const res = await postMesa(req('/api/pos/cocina/mesa-linea', 'POST', { sale_item_id: SALE_ITEM, cantidad: -1 }));
    expect(res.status).toBe(400);
    expect(llamadas).toHaveLength(0);
  });
});

describe('POST /api/pos/cocina/alergia', () => {
  it('quien confirma es el usuario de la sesión, no uno del body', async () => {
    const res = await postAlergia(req('/api/pos/cocina/alergia', 'POST', { ticket_id: 208 }));
    expect(res.status).toBe(200);
    expect(llamadas[0].args).toEqual({ p_organization_id: 120, p_actor: 'u-sesion', p_ticket_id: 208 });
    const conActor = await postAlergia(req('/api/pos/cocina/alergia', 'POST', { ticket_id: 208, allergy_ack_by: 'otro' }));
    expect(conActor.status).toBe(400);
  });
});

describe('/api/pos/notas-rapidas', () => {
  it('GET: configuradas + más usadas sin repetir las ya configuradas', async () => {
    const res = await getNotas(req('/api/pos/notas-rapidas?branch_id=7', 'GET'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.notas).toHaveLength(1);
    expect(body.sugeridas).toEqual([{ texto: 'bien asada', usos: 4 }]);
    expect(llamadas[0].args).toEqual({ p_organization_id: 120, p_branch_id: 7, p_limite: 8 });
  });

  it('POST sin permiso → 403 y no escribe', async () => {
    const res = await postNota(req('/api/pos/notas-rapidas', 'POST', { label: 'Sin hielo', kind: 'kitchen' }));
    expect(res.status).toBe(403);
    expect(tablas.filter((t) => t.op === 'insert')).toHaveLength(0);
  });

  it('POST con permiso: la organización es la de la sesión', async () => {
    guion.puedeConfigurar = true;
    const res = await postNota(req('/api/pos/notas-rapidas', 'POST', { label: ' Sin hielo ', kind: 'allergy' }));
    expect(res.status).toBe(201);
    const ins = tablas.find((t) => t.op === 'insert');
    expect(ins?.payload).toMatchObject({ organization_id: 120, label: 'Sin hielo', kind: 'allergy', branch_id: null, created_by: 'u-sesion' });
  });

  it('POST duplicada → 409', async () => {
    guion.puedeConfigurar = true;
    guion.errorInsert = { code: '23505', message: 'duplicate key' };
    const res = await postNota(req('/api/pos/notas-rapidas', 'POST', { label: 'Sin hielo', kind: 'kitchen' }));
    expect(res.status).toBe(409);
  });

  it('DELETE filtra por la organización de la sesión', async () => {
    guion.puedeConfigurar = true;
    const res = await deleteNota(req('/api/pos/notas-rapidas?id=9', 'DELETE'));
    expect(res.status).toBe(200);
    const del = tablas.find((t) => t.op === 'delete');
    expect(del?.filtros).toEqual({ id: 9, organization_id: 120 });
  });

  it('organización ajena en el body → 403', async () => {
    guion.puedeConfigurar = true;
    const res = await postNota(req('/api/pos/notas-rapidas', 'POST', { label: 'x', kind: 'kitchen', organization_id: 5 }));
    expect(res.status).toBe(403);
    expect(tablas.filter((t) => t.op === 'insert')).toHaveLength(0);
  });
});
