/** @jest-environment node */
/**
 * Presupuestos: la organización sale de la sesión, el permiso se exige en el
 * servidor y un presupuesto que no está en borrador no se edita.
 */
type Op = { tabla: string; accion: string; datos?: unknown; filtros: [string, string, unknown][] };

const ops: Op[] = [];
let respuestas: (op: Op) => { data: unknown; error: unknown };

function constructor(tabla: string) {
  const op: Op = { tabla, accion: 'select', filtros: [] };
  const fin = () => {
    ops.push(op);
    return Promise.resolve(respuestas(op));
  };
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (d: unknown) => ((op.accion = 'insert'), (op.datos = d), b),
    upsert: (d: unknown) => ((op.accion = 'upsert'), (op.datos = d), b),
    update: (d: unknown) => ((op.accion = 'update'), (op.datos = d), b),
    delete: () => ((op.accion = 'delete'), b),
    eq: (c: string, v: unknown) => (op.filtros.push(['eq', c, v]), b),
    in: (c: string, v: unknown) => (op.filtros.push(['in', c, v]), b),
    single: fin,
    maybeSingle: fin,
    then: (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) => fin().then(ok, mal),
  };
  return b;
}

const permitido = jest.fn();
const ctx = { organizationId: 7, userId: 'u-1', roleId: 3, isSuperAdmin: false, supabase: { from: (t: string) => constructor(t) } };

jest.mock('@/lib/utils/orgContext', () => ({
  withOrg: (handler: (c: typeof ctx, req: Request) => unknown) => (req: Request) => handler(ctx, req),
  hasOrgAdminOrPermission: (...args: unknown[]) => permitido(...args),
}));

import { POST } from '../route';
import { DELETE } from '../[id]/route';
import { PUT } from '../[id]/lineas/route';

const ID = '11111111-2222-4333-8444-555555555555';
const OTRO = '99999999-2222-4333-8444-555555555555';
const pedir = (h: unknown, req: Request) => (h as (r: Request) => Promise<Response>)(req);
const json = (url: string, method: string, cuerpo?: unknown) =>
  new Request(`http://x${url}`, { method, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), headers: { 'content-type': 'application/json' } });
const doce = (v: number) => Array(12).fill(v);
const filtro = (op: Op, c: string) => op.filtros.find((f) => f[1] === c)?.[2];

function presupuesto(status: string) {
  return (op: Op) => {
    if (op.tabla === 'budgets' && op.accion === 'select') return { data: { id: ID, status }, error: null };
    if (op.tabla === 'chart_of_accounts') {
      return {
        data: [
          { account_code: '5105', parent_code: null, is_active: true, es_movimiento: false },
          { account_code: '51050601', parent_code: '5105', is_active: true, es_movimiento: true },
        ],
        error: null,
      };
    }
    if (op.tabla === 'budget_lines' && op.accion === 'select') return { data: [], error: null };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  ops.length = 0;
  permitido.mockReset();
  permitido.mockResolvedValue(true);
  respuestas = presupuesto('draft');
});

describe('DELETE /api/finanzas/presupuestos/:id', () => {
  it('borrador: exige finance.create y borra solo en la organización de la sesión', async () => {
    const r = await pedir(DELETE, json(`/api/finanzas/presupuestos/${ID}`, 'DELETE'));
    expect(r.status).toBe(200);
    expect(permitido).toHaveBeenCalledWith(ctx, 'finance.create');
    const borrado = ops.find((o) => o.accion === 'delete')!;
    expect(filtro(borrado, 'organization_id')).toBe(7);
    expect(filtro(borrado, 'id')).toBe(ID);
  });

  it('aprobado: exige finance.approve; sin él responde 403 y no borra', async () => {
    respuestas = presupuesto('approved');
    permitido.mockResolvedValue(false);
    const r = await pedir(DELETE, json(`/api/finanzas/presupuestos/${ID}`, 'DELETE'));
    expect(r.status).toBe(403);
    expect(permitido).toHaveBeenCalledWith(ctx, 'finance.approve');
    expect(ops.some((o) => o.accion === 'delete')).toBe(false);
  });

  it('otro presupuesto u otra organización: 404', async () => {
    respuestas = () => ({ data: null, error: null });
    const r = await pedir(DELETE, json(`/api/finanzas/presupuestos/${ID}`, 'DELETE'));
    expect(r.status).toBe(404);
    expect(ops.some((o) => o.accion === 'delete')).toBe(false);
  });
});

describe('PUT /api/finanzas/presupuestos/:id/lineas', () => {
  const cuerpo = { filas: [{ account_code: '51050601', cost_center_id: null, meses: doce(8000) }] };

  it('guarda los 12 meses y el total del borrador', async () => {
    const r = await pedir(PUT, json(`/api/finanzas/presupuestos/${ID}/lineas`, 'PUT', cuerpo));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ total: 96000, lineas: 12 });
    const upsert = ops.find((o) => o.accion === 'upsert')!;
    expect((upsert.datos as { organization_id: number }[]).every((f) => f.organization_id === 7)).toBe(true);
    const total = ops.find((o) => o.tabla === 'budgets' && o.accion === 'update')!;
    expect(total.datos).toMatchObject({ total_amount: 96000 });
  });

  it('un presupuesto aprobado no se edita: 409 y sin escrituras', async () => {
    respuestas = presupuesto('approved');
    const r = await pedir(PUT, json(`/api/finanzas/presupuestos/${ID}/lineas`, 'PUT', cuerpo));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ codigo: 'no_editable' });
    expect(ops.some((o) => o.accion !== 'select')).toBe(false);
  });

  it('sin finance.create: 403 antes de leer nada', async () => {
    permitido.mockResolvedValue(false);
    const r = await pedir(PUT, json(`/api/finanzas/presupuestos/${ID}/lineas`, 'PUT', cuerpo));
    expect(r.status).toBe(403);
    expect(ops).toHaveLength(0);
  });

  it('rechaza cuentas de título', async () => {
    const r = await pedir(PUT, json(`/api/finanzas/presupuestos/${ID}/lineas`, 'PUT', { filas: [{ account_code: '5105', meses: doce(1) }] }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ codigo: 'cuenta_invalida', cuentas: ['5105'] });
  });

  it('un body con otra organización se rechaza', async () => {
    await expect(pedir(PUT, json(`/api/finanzas/presupuestos/${ID}/lineas`, 'PUT', { ...cuerpo, organization_id: 999 }))).rejects.toMatchObject({ statusCode: 403 });
    expect(ops.some((o) => o.accion !== 'select')).toBe(false);
  });
});

describe('POST /api/finanzas/presupuestos', () => {
  it('crea en borrador con la organización y el usuario de la sesión', async () => {
    respuestas = (op) => (op.tabla === 'budgets' && op.accion === 'insert' ? { data: { id: ID, status: 'draft' }, error: null } : { data: null, error: null });
    const r = await pedir(POST, json('/api/finanzas/presupuestos', 'POST', { name: 'Operación 2027', fiscal_year: 2027 }));
    expect(r.status).toBe(201);
    expect(permitido).toHaveBeenCalledWith(ctx, 'finance.create');
    expect(ops[0].datos).toEqual({ organization_id: 7, name: 'Operación 2027', fiscal_year: 2027, status: 'draft', total_amount: 0, created_by: 'u-1' });
  });

  it('copia solo de un presupuesto de la misma organización', async () => {
    respuestas = (op) => {
      if (op.tabla === 'budgets' && op.accion === 'select') return { data: { id: OTRO }, error: null };
      if (op.tabla === 'budget_lines' && op.accion === 'select') {
        return { data: [{ id: 'l1', account_code: '51050601', period: 3, planned_amount: 100, cost_center_id: null }], error: null };
      }
      if (op.tabla === 'budgets' && op.accion === 'insert') return { data: { id: ID, status: 'draft' }, error: null };
      if (op.tabla === 'budgets' && op.accion === 'update') return { data: { id: ID, total_amount: 100 }, error: null };
      return { data: null, error: null };
    };
    const r = await pedir(POST, json('/api/finanzas/presupuestos', 'POST', { name: 'Copia', fiscal_year: 2027, origen: 'copia', copiar_de: OTRO }));
    expect(r.status).toBe(201);
    const lectura = ops.find((o) => o.tabla === 'budgets' && o.accion === 'select')!;
    expect(filtro(lectura, 'organization_id')).toBe(7);
    const lineas = ops.find((o) => o.tabla === 'budget_lines' && o.accion === 'insert')!.datos as { budget_id: string; planned_amount: number; id: string }[];
    expect(lineas).toHaveLength(12);
    expect(lineas.every((l) => l.budget_id === ID && l.id !== 'l1')).toBe(true);
    expect(lineas[2].planned_amount).toBe(100);
  });

  it('«real del año anterior» no está disponible', async () => {
    const r = await pedir(POST, json('/api/finanzas/presupuestos', 'POST', { name: 'X', fiscal_year: 2027, origen: 'real_anterior' }));
    expect(r.status).toBe(400);
    expect(ops).toHaveLength(0);
  });

  it('nombre repetido en el año: 409', async () => {
    respuestas = () => ({ data: null, error: { code: '23505' } });
    const r = await pedir(POST, json('/api/finanzas/presupuestos', 'POST', { name: 'X', fiscal_year: 2027 }));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ codigo: 'nombre_repetido' });
  });
});
