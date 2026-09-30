/**
 * CRM ola 1 — doble de Supabase para los contratos de las rutas nuevas
 * (oportunidades, pipelines, actividades y leads-cliente).
 *
 * Aplica de verdad `eq`, `in`, `is`, `not is`, el orden y `limit`/`range`;
 * registra cada escritura y cada llamada a RPC con sus argumentos. Las RPC
 * responden lo que el test ponga en `db.rpc[nombre]` (datos o error con
 * SQLSTATE), que es como la base real devuelve `42501`, `P0002`, `P0001`…
 * Tablas con señuelos de la organización 121.
 */

export type Row = Record<string, unknown>;

interface Filtro {
  k: 'eq' | 'in' | 'is' | 'not_is' | 'ilike' | 'gte' | 'lt' | 'lte' | 'or';
  col: string;
  v: unknown;
}

/**
 * `.or()` de PostgREST (ola 3A, feed de actividades): lista separada por comas
 * de `col.op.valor` o `and(...)`, con `eq`, `lt`, `lte`, `gte`, `in` e `is`.
 */
type Condicion = { y: Condicion[] } | { col: string; op: string; v: string };

function partirNivel(expr: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let actual = '';
  for (const ch of expr) {
    if (ch === '(') nivel++;
    if (ch === ')') nivel--;
    if (ch === ',' && nivel === 0) {
      partes.push(actual);
      actual = '';
    } else actual += ch;
  }
  if (actual) partes.push(actual);
  return partes;
}

function parsearCondicion(parte: string): Condicion {
  const y = /^and\((.*)\)$/.exec(parte.trim());
  if (y) return { y: partirNivel(y[1]).map(parsearCondicion) };
  const m = /^([\w.>-]+?)\.(eq|lt|lte|gte|in|is)\.(.*)$/.exec(parte.trim());
  if (!m) throw new Error(`fake: or no soportado: ${parte}`);
  return { col: m[1], op: m[2], v: m[3].replace(/^"(.*)"$/, '$1') };
}

function cumpleCondicion(row: Row, c: Condicion): boolean {
  if ('y' in c) return c.y.every((x) => cumpleCondicion(row, x));
  const v = row[c.col];
  switch (c.op) {
    case 'eq':
      return String(v) === c.v;
    case 'lt':
      return String(v) < c.v;
    case 'lte':
      return String(v) <= c.v;
    case 'gte':
      return String(v) >= c.v;
    case 'in':
      return c.v.replace(/^\(|\)$/g, '').split(',').includes(String(v));
    case 'is':
      return c.v === 'null' ? v === null || v === undefined : String(v) === c.v;
    default:
      return false;
  }
}

export interface Ola1Db {
  t: Record<string, Row[]>;
  writes: { table: string; op: 'insert' | 'update' | 'delete'; payload: unknown; filtros: Filtro[] }[];
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
  rpc: Record<string, { data?: unknown; error?: { code: string; message: string } }>;
  seq: number;
}

export const ORG = 120;
export const OTRA = 121;
export const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const YO = U(200);
export const OTRO_VENDEDOR = U(201);

export function makeDb(t: Record<string, Row[]> = {}): Ola1Db {
  return { t: JSON.parse(JSON.stringify(t)), writes: [], rpcCalls: [], rpc: {}, seq: 0 };
}

function cumple(row: Row, f: Filtro): boolean {
  const v = row[f.col];
  switch (f.k) {
    case 'eq':
      return v === f.v;
    case 'in':
      return (f.v as unknown[]).includes(v);
    case 'is':
      return f.v === null ? v === null || v === undefined : v === f.v;
    case 'not_is':
      return f.v === null ? v !== null && v !== undefined : v !== f.v;
    case 'gte':
      return String(v) >= String(f.v);
    case 'lt':
      return String(v) < String(f.v);
    case 'lte':
      return String(v) <= String(f.v);
    case 'or':
      return (f.v as Condicion[]).some((c) => cumpleCondicion(row, c));
    case 'ilike':
      return typeof v === 'string' && v.toLowerCase().includes(String(f.v).replace(/%/g, '').replace(/\\/g, '').toLowerCase());
  }
}

export function fakeSupabase(db: Ola1Db) {
  const from = (table: string) => {
    const filtros: Filtro[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: unknown = null;
    const orden: { col: string; asc: boolean }[] = [];
    let desde = 0;
    let hasta: number | null = null;
    let contar = false;

    const run = (modo: 'many' | 'single' | 'maybe') => {
      const filas = (db.t[table] ??= []);
      let hit: Row[];
      if (op === 'insert') {
        const r: Row = { id: `${table}-${++db.seq}`, ...(payload as Row) };
        filas.push(r);
        db.writes.push({ table, op, payload, filtros: [...filtros] });
        hit = [r];
      } else {
        hit = filas.filter((r) => filtros.every((f) => cumple(r, f)));
        if (op === 'update') {
          db.writes.push({ table, op, payload, filtros: [...filtros] });
          hit.forEach((r) => Object.assign(r, payload as Row));
        } else if (op === 'delete') {
          db.writes.push({ table, op, payload: null, filtros: [...filtros] });
          db.t[table] = filas.filter((r) => !hit.includes(r));
        }
      }
      for (const o of [...orden].reverse()) {
        hit = [...hit].sort((a, b) => (String(a[o.col]) < String(b[o.col]) ? -1 : String(a[o.col]) > String(b[o.col]) ? 1 : 0) * (o.asc ? 1 : -1));
      }
      const total = hit.length;
      if (hasta !== null) hit = hit.slice(desde, hasta + 1);
      const data = hit.map((r) => ({ ...r }));
      if (modo === 'single') return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no single' } };
      if (modo === 'maybe') return { data: data[0] ?? null, error: null };
      return { data, error: null, count: contar ? total : null };
    };

    const c: Record<string, unknown> = {
      select: (_cols?: string, opts?: { count?: string }) => {
        if (opts?.count) contar = true;
        return c;
      },
      insert: (p: unknown) => ((op = 'insert'), (payload = p), c),
      update: (p: unknown) => ((op = 'update'), (payload = p), c),
      delete: () => ((op = 'delete'), c),
      eq: (col: string, v: unknown) => (filtros.push({ k: 'eq', col, v }), c),
      neq: () => c,
      in: (col: string, v: unknown[]) => (filtros.push({ k: 'in', col, v }), c),
      is: (col: string, v: unknown) => (filtros.push({ k: 'is', col, v }), c),
      not: (col: string, operador: string, v: unknown) => {
        if (operador !== 'is') throw new Error(`fake: not ${operador}`);
        filtros.push({ k: 'not_is', col, v });
        return c;
      },
      ilike: (col: string, v: unknown) => (filtros.push({ k: 'ilike', col, v }), c),
      gte: (col: string, v: unknown) => (filtros.push({ k: 'gte', col, v }), c),
      lt: (col: string, v: unknown) => (filtros.push({ k: 'lt', col, v }), c),
      lte: (col: string, v: unknown) => (filtros.push({ k: 'lte', col, v }), c),
      or: (expr: string) => (filtros.push({ k: 'or', col: '', v: partirNivel(expr).map(parsearCondicion) }), c),
      order: (col: string, o?: { ascending?: boolean }) => (orden.push({ col, asc: o?.ascending !== false }), c),
      limit: (n: number) => ((desde = 0), (hasta = n - 1), c),
      range: (a: number, b: number) => ((desde = a), (hasta = b), c),
      maybeSingle: async () => run('maybe'),
      single: async () => run('single'),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(run('many')).then(ok, ko),
    };
    return c;
  };

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    db.rpcCalls.push({ fn, args });
    const r = db.rpc[fn];
    if (!r) return { data: null, error: { code: 'PGRST202', message: `rpc ${fn} no programada en la prueba` } };
    return { data: r.data ?? null, error: r.error ?? null };
  };

  return { from, rpc };
}

/** Semilla mínima: dos oportunidades de la 120 (mía y ajena) y señuelos de la 121. */
export function seed(): Record<string, Row[]> {
  return {
    opportunities: [
      { id: U(1), organization_id: ORG, pipeline_id: U(40), stage_id: U(41), status: 'open', record_type: 'deal', customer_id: U(10), salesperson_id: YO, created_by: YO, name: 'Mía' },
      { id: U(2), organization_id: ORG, pipeline_id: U(40), stage_id: U(41), status: 'open', record_type: 'deal', customer_id: U(10), salesperson_id: OTRO_VENDEDOR, created_by: OTRO_VENDEDOR, name: 'Ajena' },
      { id: U(3), organization_id: ORG, pipeline_id: U(40), stage_id: U(43), status: 'won', record_type: 'deal', customer_id: U(10), salesperson_id: YO, created_by: YO, name: 'Ganada' },
      { id: U(4), organization_id: ORG, pipeline_id: U(40), stage_id: U(41), status: 'open', record_type: 'lead', customer_id: U(10), salesperson_id: null, created_by: null, name: 'Lead heredado' },
      { id: U(90), organization_id: OTRA, pipeline_id: U(95), stage_id: U(96), status: 'open', record_type: 'deal', customer_id: U(91), salesperson_id: YO, created_by: YO, name: 'Señuelo' },
    ],
    stages: [
      { id: U(41), pipeline_id: U(40), name: 'Nuevo', position: 1, is_won: false, is_lost: false },
      { id: U(42), pipeline_id: U(40), name: 'Perdido', position: 9, is_won: false, is_lost: true },
      { id: U(43), pipeline_id: U(40), name: 'Ganado', position: 8, is_won: true, is_lost: false },
      { id: U(96), pipeline_id: U(95), name: 'Ganado ajeno', position: 1, is_won: true, is_lost: false },
    ],
    activities: [
      { id: U(60), organization_id: ORG, user_id: YO, activity_type: 'call', notes: 'mía' },
      { id: U(61), organization_id: ORG, user_id: OTRO_VENDEDOR, activity_type: 'note', notes: 'ajena' },
      { id: U(62), organization_id: ORG, user_id: YO, activity_type: 'system', notes: 'Oportunidad creada' },
      { id: U(69), organization_id: OTRA, user_id: YO, activity_type: 'call', notes: 'señuelo' },
    ],
    notes: [
      { id: U(70), organization_id: ORG, user_id: YO, body: 'mía' },
      { id: U(71), organization_id: ORG, user_id: OTRO_VENDEDOR, body: 'ajena' },
    ],
    customers: [
      { id: U(10), organization_id: ORG, full_name: 'Lead uno', lifecycle_stage: 'lead', lead_source: 'web_form', owner_id: YO, lead_discarded_at: null, metadata: { lead: { valor_estimado: { monto: 900, moneda: 'USD' }, deal_type: 'new', temperatura: 'warm' } }, created_at: '2026-09-02' },
      { id: U(11), organization_id: ORG, full_name: 'Lead ajeno', lifecycle_stage: 'lead', lead_source: 'import', owner_id: OTRO_VENDEDOR, lead_discarded_at: null, metadata: {}, created_at: '2026-09-01' },
      { id: U(12), organization_id: ORG, full_name: 'Cliente sin origen', lifecycle_stage: 'lead', lead_source: null, owner_id: null, lead_discarded_at: null, metadata: {}, created_at: '2026-09-03' },
      { id: U(13), organization_id: ORG, full_name: 'Cliente comprador', lifecycle_stage: 'customer', lead_source: 'manual', owner_id: YO, lead_discarded_at: null, metadata: {}, created_at: '2026-09-04' },
      { id: U(91), organization_id: OTRA, full_name: 'Señuelo', lifecycle_stage: 'lead', lead_source: 'web_form', owner_id: YO, lead_discarded_at: null, metadata: {}, created_at: '2026-09-05' },
    ],
    organization_members: [
      { user_id: YO, organization_id: ORG, is_active: true },
      { user_id: OTRO_VENDEDOR, organization_id: ORG, is_active: true },
      { user_id: U(299), organization_id: OTRA, is_active: true },
    ],
    calendar_events: [
      { id: U(80), organization_id: ORG, opportunity_id: U(1), title: 'Demo', start_at: '2026-09-10T15:00:00Z' },
      { id: U(89), organization_id: OTRA, opportunity_id: U(1), title: 'Señuelo', start_at: '2026-09-11T15:00:00Z' },
    ],
    opportunity_stage_history: [
      { id: U(50), organization_id: ORG, opportunity_id: U(1), from_stage_id: null, to_stage_id: U(41), changed_at: '2026-09-01T10:00:00Z' },
    ],
  };
}
