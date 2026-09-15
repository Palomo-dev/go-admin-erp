/// <reference types="jest" />
/**
 * F2 — contrato de las rutas de objeciones que consume la UI nueva
 * (`/app/crm/objeciones` y el bloque «Objeciones» del drawer).
 *
 * `@/lib/utils/orgContext` se dobla con fábrica. El cliente Supabase simulado
 * sirve filas por tabla, APLICA los filtros `eq` y REGISTRA cada escritura con
 * los filtros que la acompañan: cada tabla lleva señuelos de otra
 * organización (121), así que leer o escribir sin `organization_id` cambia el
 * payload y la prueba muere (regla dura 5; lección de las tres páginas del
 * rediseño, donde la capa I/O quedó sin prueba).
 */

class FakeOrgContextError extends Error {
  statusCode = 401;
  code = 'UNAUTHORIZED';
}

type Row = Record<string, unknown>;

const OBJ = (id: string, org: number, extra: Row = {}): Row => ({
  id,
  organization_id: org,
  title: `Objeción ${id}`,
  category: 'precio',
  detection_signals: ['caro'],
  recommended_response: 'Valor',
  discovery_questions: ['¿Con qué lo comparas?'],
  related_case_studies: null,
  vertical_id: null,
  is_active: true,
  sort_order: 10,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...extra,
});

const ROWS: Record<string, Row[]> = {
  objections: [
    OBJ('ob-1', 120),
    OBJ('ob-2', 120, { is_active: false, sort_order: 20 }),
    OBJ('ob-9', 121), // señuelo
  ],
  opportunity_objections: [
    { id: 'oo-1', organization_id: 120, opportunity_id: 'op-1', objection_id: 'ob-1', notes: null, detected_by: 'manual', resolved: false, resolved_at: null, created_at: '2026-09-02T00:00:00Z' },
    { id: 'oo-9', organization_id: 121, opportunity_id: 'op-1', objection_id: 'ob-9', notes: null, detected_by: 'manual', resolved: false, resolved_at: null, created_at: '2026-09-03T00:00:00Z' },
  ],
  opportunities: [
    { id: 'op-1', organization_id: 120 },
    { id: 'op-1', organization_id: 121 },
    { id: 'op-2', organization_id: 121 }, // señuelo: solo existe en la 121
  ],
};

interface Write { table: string; op: 'insert' | 'update' | 'delete'; row: Row | null; filters: Record<string, unknown> }
const writes: Write[] = [];

function fakeSupabase() {
  const from = (table: string) => {
    const preds: ((row: Row) => boolean)[] = [];
    const filters: Record<string, unknown> = {};
    let write: Write | null = null;
    let single = false;
    let selectArg = '*';
    const chain: Record<string, unknown> = {};
    chain.select = (arg?: string) => { if (arg) selectArg = arg; return chain; };
    for (const m of ['order', 'limit']) chain[m] = () => chain;
    chain.eq = (col: string, value: unknown) => { preds.push((r) => r[col] === value); filters[col] = value; return chain; };
    chain.single = () => { single = true; return chain; };
    chain.maybeSingle = () => { single = true; return chain; };
    chain.insert = (row: Row) => { write = { table, op: 'insert', row, filters }; return chain; };
    chain.update = (row: Row) => { write = { table, op: 'update', row, filters }; return chain; };
    chain.delete = () => { write = { table, op: 'delete', row: null, filters }; return chain; };
    chain.then = (resolve: (v: unknown) => void) => {
      if (write) {
        writes.push(write);
        const echoed = write.op === 'insert' ? { id: 'new', ...write.row } : { ...(ROWS[table].find((r) => preds.every((p) => p(r))) ?? {}), ...(write.row ?? {}) };
        resolve({ data: single ? echoed : null, error: null });
        return;
      }
      let data = (ROWS[table] ?? []).filter((r) => preds.every((p) => p(r)));
      if (table === 'opportunity_objections' && selectArg.includes('objection:objections')) {
        // El join embebido de PostgREST: la objeción de la MISMA fila (RLS la acota a la organización).
        data = data.map((r) => ({ ...r, objection: ROWS.objections.find((o) => o.id === r.objection_id && o.organization_id === r.organization_id) ?? null }));
      }
      resolve({ data: single ? data[0] ?? null : data, error: null });
    };
    return chain;
  };
  return { from };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: FakeOrgContextError,
  requireOrgAdmin: jest.fn(),
  getServerOrgContext: jest.fn(async () => ({ organizationId: 120, userId: 'u-1', supabase: fakeSupabase() })),
}));

import { NextRequest } from 'next/server';
import { GET as getList, POST as postCreate } from '../route';
import { PATCH as patchOne, DELETE as deleteOne } from '../[id]/route';
import { GET as getOpp, POST as postOpp } from '../opportunity/[opportunityId]/route';

const json = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

beforeEach(() => { writes.length = 0; jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { jest.restoreAllMocks(); });

describe('GET /api/crm/objections — catálogo de la organización', () => {
  it('con includeInactive=true devuelve activas e inactivas de la org 120 y ninguna de la 121', async () => {
    const res = await getList(new NextRequest('http://localhost/api/crm/objections?includeInactive=true'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, data: [ROWS.objections[0], ROWS.objections[1]] });
  });

  it('por defecto solo devuelve las activas', async () => {
    const body = await (await getList(new NextRequest('http://localhost/api/crm/objections'))).json();
    expect(body.data.map((o: Row) => o.id)).toEqual(['ob-1']);
  });
});

describe('POST /api/crm/objections', () => {
  it('inserta con la organización de la sesión y detection_signals/discovery_questions como listas', async () => {
    const res = await postCreate(json('/api/crm/objections', 'POST', {
      title: 'Es caro', category: 'precio', detection_signals: ['caro'], recommended_response: null, discovery_questions: [], is_active: true,
    }));
    expect(res.status).toBe(201);
    expect(writes).toEqual([{
      table: 'objections', op: 'insert', filters: {},
      row: { organization_id: 120, title: 'Es caro', category: 'precio', detection_signals: ['caro'], recommended_response: null, discovery_questions: [], related_case_studies: null, vertical_id: null, is_active: true, sort_order: 0 },
    }]);
  });

  it('sin listas en el body inserta [] (las columnas son jsonb NOT NULL DEFAULT [] ; con null la BD respondía 500)', async () => {
    const res = await postCreate(json('/api/crm/objections', 'POST', { title: 'Es caro', category: 'precio' }));
    expect(res.status).toBe(201);
    expect(writes).toHaveLength(1);
    expect(writes[0].row).toMatchObject({ organization_id: 120, title: 'Es caro', category: 'precio', detection_signals: [], discovery_questions: [] });
    expect(writes[0].row?.detection_signals).not.toBeNull();
    expect(writes[0].row?.discovery_questions).not.toBeNull();
  });

  it('rechaza sin título o sin categoría (la columna es NOT NULL) con 400 y no escribe', async () => {
    expect((await postCreate(json('/api/crm/objections', 'POST', { category: 'precio' }))).status).toBe(400);
    expect((await postCreate(json('/api/crm/objections', 'POST', { title: 'x' }))).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it('un body con otra organización responde 403 y no escribe (regla dura 5)', async () => {
    const res = await postCreate(json('/api/crm/objections', 'POST', { title: 'x', category: 'precio', organization_id: 121 }));
    expect(res.status).toBe(403);
    expect(writes).toEqual([]);
  });
});

describe('PATCH y DELETE /api/crm/objections/[id]', () => {
  it('PATCH escribe solo los campos enviados y filtra por id y organización', async () => {
    const res = await patchOne(json('/api/crm/objections/ob-1', 'PATCH', { is_active: false }), { params: Promise.resolve({ id: 'ob-1' }) });
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe('update');
    expect(writes[0].filters).toEqual({ id: 'ob-1', organization_id: 120 });
    expect(Object.keys(writes[0].row ?? {}).sort()).toEqual(['is_active', 'updated_at']);
  });

  it('PATCH con organization_id ajeno en el body responde 403 sin escribir', async () => {
    const res = await patchOne(json('/api/crm/objections/ob-1', 'PATCH', { organization_id: 121, title: 'x' }), { params: Promise.resolve({ id: 'ob-1' }) });
    expect(res.status).toBe(403);
    expect(writes).toEqual([]);
  });

  it('DELETE filtra por id y organización', async () => {
    const res = await deleteOne(new NextRequest('http://localhost/api/crm/objections/ob-1', { method: 'DELETE' }), { params: Promise.resolve({ id: 'ob-1' }) });
    expect(await res.json()).toEqual({ success: true });
    expect(writes).toEqual([{ table: 'objections', op: 'delete', row: null, filters: { id: 'ob-1', organization_id: 120 } }]);
  });
});

describe('/api/crm/objections/opportunity/[opportunityId] — bloque del drawer', () => {
  it('GET devuelve las objeciones registradas de la oportunidad en la org 120 con la objeción embebida', async () => {
    const res = await getOpp(new NextRequest('http://localhost/x'), { params: Promise.resolve({ opportunityId: 'op-1' }) });
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [{ ...ROWS.opportunity_objections[0], objection: ROWS.objections[0] }] });
    expect(JSON.stringify(body)).not.toContain('ob-9');
  });

  it('POST registra con detected_by "manual" (NOT NULL con CHECK) y actualiza la oportunidad filtrando por organización', async () => {
    const res = await postOpp(json('/x', 'POST', { objection_id: 'ob-1', notes: 'Lo dijo en la demo' }), { params: Promise.resolve({ opportunityId: 'op-1' }) });
    expect(res.status).toBe(201);
    expect(writes[0]).toEqual({
      table: 'opportunity_objections', op: 'insert', filters: {},
      row: { organization_id: 120, opportunity_id: 'op-1', objection_id: 'ob-1', notes: 'Lo dijo en la demo', detected_by: 'manual', resolved: false },
    });
    expect(writes[1].table).toBe('opportunities');
    expect(writes[1].filters).toEqual({ id: 'op-1', organization_id: 120 });
    expect(writes[1].row).toEqual({ objection_id: 'ob-1', updated_at: expect.any(String) });
  });

  it('POST con resolveId marca resuelta sin tocar updated_at (la tabla no tiene esa columna)', async () => {
    const res = await postOpp(json('/x', 'POST', { resolveId: 'oo-1' }), { params: Promise.resolve({ opportunityId: 'op-1' }) });
    expect(res.status).toBe(200);
    expect(writes).toEqual([{
      table: 'opportunity_objections', op: 'update', filters: { id: 'oo-1', organization_id: 120 },
      row: { resolved: true, resolved_at: expect.any(String) },
    }]);
  });

  it('R11: un opportunity_id ajeno en el body se ignora; la oportunidad sale SOLO de la ruta', async () => {
    const res = await postOpp(json('/x', 'POST', { objection_id: 'ob-1', opportunity_id: 'op-9' }), { params: Promise.resolve({ opportunityId: 'op-1' }) });
    expect(res.status).toBe(201);
    expect(writes[0].row).toMatchObject({ opportunity_id: 'op-1' });
    expect(writes[1].filters).toEqual({ id: 'op-1', organization_id: 120 });
    expect(JSON.stringify(writes)).not.toContain('op-9');
  });

  it('detected_by es siempre "manual" desde esta ruta aunque el cliente mande "ia" o un valor fuera del CHECK (la IA escribe por otro camino)', async () => {
    for (const detected_by of ['ia', 'cliente', null, 42]) {
      writes.length = 0;
      const res = await postOpp(json('/x', 'POST', { objection_id: 'ob-1', detected_by }), { params: Promise.resolve({ opportunityId: 'op-1' }) });
      expect({ detected_by, status: res.status }).toEqual({ detected_by, status: 201 });
      expect(writes[0].row).toMatchObject({ detected_by: 'manual' });
    }
  });

  it('un body con otra organización responde 403 y no escribe (regla dura 5, alineado con las otras dos rutas)', async () => {
    const res = await postOpp(json('/x', 'POST', { objection_id: 'ob-1', organization_id: 121 }), { params: Promise.resolve({ opportunityId: 'op-1' }) });
    expect(res.status).toBe(403);
    expect(writes).toEqual([]);
    const res2 = await postOpp(json('/x', 'POST', { resolveId: 'oo-1', organization_id: 121 }), { params: Promise.resolve({ opportunityId: 'op-1' }) });
    expect(res2.status).toBe(403);
    expect(writes).toEqual([]);
  });

  it('una objeción de otra organización (señuelo ob-9 de la 121) responde 404 y no crea el enlace', async () => {
    const res = await postOpp(json('/x', 'POST', { objection_id: 'ob-9' }), { params: Promise.resolve({ opportunityId: 'op-1' }) });
    expect(res.status).toBe(404);
    expect(writes).toEqual([]);
  });

  it('una oportunidad que no existe en la organización (inexistente o solo de la 121) responde 404 y no crea el enlace', async () => {
    for (const opportunityId of ['op-9', 'op-2']) {
      writes.length = 0;
      const res = await postOpp(json('/x', 'POST', { objection_id: 'ob-1' }), { params: Promise.resolve({ opportunityId }) });
      expect({ opportunityId, status: res.status }).toEqual({ opportunityId, status: 404 });
      expect(writes).toEqual([]);
    }
  });

  it('la nota viaja recortada y vacía se guarda como null', async () => {
    await postOpp(json('/x', 'POST', { objection_id: 'ob-1', notes: '  Lo dijo en la demo  ' }), { params: Promise.resolve({ opportunityId: 'op-1' }) });
    expect(writes[0].row).toMatchObject({ notes: 'Lo dijo en la demo' });
    writes.length = 0;
    await postOpp(json('/x', 'POST', { objection_id: 'ob-1', notes: '   ' }), { params: Promise.resolve({ opportunityId: 'op-1' }) });
    expect(writes[0].row).toMatchObject({ notes: null });
  });

  it('una nota de 281 caracteres responde 400 con el tope en el mensaje y no escribe (ronda 2: por la API se guardaban 281)', async () => {
    const res = await postOpp(json('/x', 'POST', { objection_id: 'ob-1', notes: 'x'.repeat(281) }), { params: Promise.resolve({ opportunityId: 'op-1' }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('280');
    expect(writes).toEqual([]);
    writes.length = 0;
    const ok = await postOpp(json('/x', 'POST', { objection_id: 'ob-1', notes: 'x'.repeat(280) }), { params: Promise.resolve({ opportunityId: 'op-1' }) });
    expect(ok.status).toBe(201);
    expect(writes[0].row).toMatchObject({ notes: 'x'.repeat(280) });
  });

  it('POST sin objection_id ni resolveId responde 400', async () => {
    const res = await postOpp(json('/x', 'POST', { notes: 'x' }), { params: Promise.resolve({ opportunityId: 'op-1' }) });
    expect(res.status).toBe(400);
    expect(writes).toEqual([]);
  });
});
