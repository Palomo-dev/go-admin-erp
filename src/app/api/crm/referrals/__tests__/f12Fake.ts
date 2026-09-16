/**
 * F12 — doble del cliente de Supabase para las pruebas de contrato de rutas.
 *
 * NO es un mock que devuelve lo que se le pide: aplica de verdad los filtros
 * (`eq`, `neq`, `in`, `ilike`), las escrituras (`insert`/`update`/`delete`) y
 * los embeds (`alias:tabla!fk(cols)`) sobre tablas en memoria. Cada tabla
 * lleva señuelos de la organización 121: si una ruta olvida un filtro, el
 * señuelo aparece y la prueba se pone roja.
 */

export type Row = Record<string, unknown>;

export interface Write {
  table: string;
  op: 'insert' | 'update' | 'delete';
  payload: unknown;
  filters: Filter[];
}

interface Filter {
  kind: 'eq' | 'neq' | 'in' | 'ilike';
  key: string;
  value: unknown;
}

/** Cómo se resuelve cada embed (alias → tabla destino + columna FK local). */
const EMBEDS: Record<string, Record<string, { table: string; fk: string }>> = {
  referrals: {
    referrer: { table: 'customers', fk: 'referrer_customer_id' },
    referred: { table: 'customers', fk: 'referred_customer_id' },
    program: { table: 'referral_programs', fk: 'program_id' },
    opportunity: { table: 'opportunities', fk: 'opportunity_id' },
  },
  partner_deals: {
    opportunity: { table: 'opportunities', fk: 'opportunity_id' },
    partner: { table: 'partners', fk: 'partner_id' },
  },
  tasks: {
    customer: { table: 'customers', fk: 'customer_id' },
  },
};

export interface FakeDb {
  tables: Record<string, Row[]>;
  writes: Write[];
  /** Error a inyectar en `tabla:op` (p. ej. `partners:insert`). */
  errors: Record<string, { code?: string; message: string }>;
  /** Si es `true`, los UPDATE no afectan a ninguna fila (simula que otra petición ganó la carrera). */
  updateAffectsNone: boolean;
  seq: number;
}

export function makeDb(tables: Record<string, Row[]>): FakeDb {
  return { tables: JSON.parse(JSON.stringify(tables)), writes: [], errors: {}, updateAffectsNone: false, seq: 0 };
}

function matches(row: Row, f: Filter): boolean {
  const v = row[f.key];
  switch (f.kind) {
    case 'eq':
      return v === f.value;
    case 'neq':
      return v !== f.value;
    case 'in':
      return (f.value as unknown[]).includes(v);
    case 'ilike': {
      const pattern = String(f.value).replace(/%/g, '').toLowerCase();
      return typeof v === 'string' && v.toLowerCase() === pattern;
    }
  }
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function parseEmbeds(select: string): Array<{ alias: string; cols: string[] }> {
  const out: Array<{ alias: string; cols: string[] }> = [];
  const re = /([a-z_]+):[a-z_]+(?:![a-z_]+)?\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(select))) out.push({ alias: m[1], cols: m[2].split(',').map((c) => c.trim()).filter(Boolean) });
  return out;
}

function pick(row: Row, cols: string[]): Row {
  if (cols.includes('*')) return { ...row };
  const o: Row = {};
  for (const c of cols) o[c] = row[c];
  return o;
}

export function fakeSupabase(db: FakeDb) {
  const from = (table: string) => {
    const filters: Filter[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: unknown = null;
    let select = '*';
    let wantCount = false;
    let order: { key: string; asc: boolean } | null = null;
    let limit: number | null = null;
    let range: [number, number] | null = null;
    let mode: 'many' | 'single' | 'maybe' = 'many';

    const run = () => {
      const err = db.errors[`${table}:${op}`];
      if (err) return { data: null, error: err, count: null };
      const rows = db.tables[table] ?? (db.tables[table] = []);
      let result: Row[];
      if (op === 'insert') {
        const items = (Array.isArray(payload) ? payload : [payload]) as Row[];
        result = items.map((p) => {
          db.seq += 1;
          const row: Row = { id: `${table}-${db.seq}`, created_at: '2026-09-15T12:00:00.000Z', ...p };
          rows.push(row);
          return row;
        });
        db.writes.push({ table, op, payload, filters: [...filters] });
      } else {
        let hit = rows.filter((r) => filters.every((f) => matches(r, f)));
        if (op === 'update') {
          db.writes.push({ table, op, payload, filters: [...filters] });
          if (db.updateAffectsNone) hit = [];
          for (const r of hit) Object.assign(r, payload as Row);
        } else if (op === 'delete') {
          db.writes.push({ table, op, payload: null, filters: [...filters] });
          db.tables[table] = rows.filter((r) => !hit.includes(r));
        }
        result = hit;
      }
      if (order) {
        const { key, asc } = order;
        result = [...result].sort((a, b) => compare(a[key], b[key]) * (asc ? 1 : -1));
      }
      const total = result.length;
      if (range) result = result.slice(range[0], range[1] + 1);
      if (limit !== null) result = result.slice(0, limit);
      const embeds = parseEmbeds(select);
      const shaped = result.map((r) => {
        const o: Row = { ...r };
        for (const e of embeds) {
          const def = EMBEDS[table]?.[e.alias];
          if (!def) continue;
          const target = (db.tables[def.table] ?? []).find((t) => t.id === r[def.fk]);
          o[e.alias] = target ? pick(target, e.cols) : null;
        }
        return o;
      });
      if (mode === 'single') return shaped.length === 1 ? { data: shaped[0], error: null, count: null } : { data: null, error: { code: 'PGRST116', message: `expected 1 row, got ${shaped.length}` }, count: null };
      if (mode === 'maybe') return { data: shaped[0] ?? null, error: null, count: null };
      return { data: shaped, error: null, count: wantCount ? total : null };
    };

    const chain: Record<string, unknown> = {
      select(cols = '*', opts?: { count?: string }) {
        select = cols;
        if (opts?.count) wantCount = true;
        return chain;
      },
      insert(p: unknown) {
        op = 'insert';
        payload = p;
        return chain;
      },
      update(p: unknown) {
        op = 'update';
        payload = p;
        return chain;
      },
      delete() {
        op = 'delete';
        return chain;
      },
      eq(key: string, value: unknown) {
        filters.push({ kind: 'eq', key, value });
        return chain;
      },
      neq(key: string, value: unknown) {
        filters.push({ kind: 'neq', key, value });
        return chain;
      },
      in(key: string, value: unknown[]) {
        filters.push({ kind: 'in', key, value });
        return chain;
      },
      ilike(key: string, value: string) {
        filters.push({ kind: 'ilike', key, value });
        return chain;
      },
      order(key: string, opts?: { ascending?: boolean }) {
        order = { key, asc: opts?.ascending !== false };
        return chain;
      },
      limit(n: number) {
        limit = n;
        return chain;
      },
      range(a: number, b: number) {
        range = [a, b];
        return chain;
      },
      async maybeSingle() {
        mode = 'maybe';
        return run();
      },
      async single() {
        mode = 'single';
        return run();
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return chain;
  };
  return { from };
}

// ─── Datos de partida ────────────────────────────────────────────────────────

export const ORG = 120;
export const OTHER = ORG + 1;
export const U = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

export function seed(): Record<string, Row[]> {
  return {
    customers: [
      { id: U(1), organization_id: ORG, full_name: 'Ana Referidora', email: 'ana@example.com', lifecycle_stage: 'customer' },
      { id: U(2), organization_id: ORG, full_name: 'Beto Cliente', email: 'beto@example.com', lifecycle_stage: 'customer' },
      { id: U(91), organization_id: OTHER, full_name: 'Señuelo 121', email: 'senuelo@example.com', lifecycle_stage: 'customer' },
    ],
    referral_programs: [
      { id: U(10), organization_id: ORG, name: 'Programa base', description: null, reward_type: 'cash', reward_amount: 50000, reward_to: 'referrer', is_active: true },
      { id: U(11), organization_id: ORG, name: 'Programa apagado', description: null, reward_type: 'discount', reward_amount: 10, reward_to: 'both', is_active: false },
      { id: U(92), organization_id: OTHER, name: 'Programa 121', description: null, reward_type: 'cash', reward_amount: 1, reward_to: 'both', is_active: true },
    ],
    referrals: [
      { id: U(20), organization_id: ORG, program_id: U(10), referrer_customer_id: U(1), referred_customer_id: null, referred_name: 'Carla Nueva', referred_email: 'carla@example.com', referred_phone: null, opportunity_id: null, status: 'pending', reward_paid: false, reward_paid_at: null, created_at: '2026-09-10T10:00:00.000Z' },
      { id: U(21), organization_id: ORG, program_id: U(10), referrer_customer_id: U(1), referred_customer_id: null, referred_name: 'Dani Calificado', referred_email: null, referred_phone: '3001234567', opportunity_id: null, status: 'qualified', reward_paid: false, reward_paid_at: null, created_at: '2026-09-11T10:00:00.000Z' },
      { id: U(22), organization_id: ORG, program_id: U(10), referrer_customer_id: U(2), referred_customer_id: U(2), referred_name: 'Eli Convertida', referred_email: null, referred_phone: null, opportunity_id: U(30), status: 'converted', reward_paid: false, reward_paid_at: null, created_at: '2026-09-12T10:00:00.000Z' },
      { id: U(23), organization_id: ORG, program_id: null, referrer_customer_id: U(2), referred_customer_id: U(2), referred_name: 'Sin programa', referred_email: null, referred_phone: null, opportunity_id: U(30), status: 'converted', reward_paid: false, reward_paid_at: null, created_at: '2026-09-12T11:00:00.000Z' },
      { id: U(93), organization_id: OTHER, program_id: U(92), referrer_customer_id: U(91), referred_customer_id: null, referred_name: 'Referido 121', referred_email: null, referred_phone: null, opportunity_id: null, status: 'pending', reward_paid: false, reward_paid_at: null, created_at: '2026-09-13T10:00:00.000Z' },
    ],
    opportunities: [
      { id: U(30), organization_id: ORG, name: 'Oportunidad 1', amount: 1000000, currency: 'COP', status: 'open', record_type: 'deal' },
      { id: U(31), organization_id: ORG, name: 'Oportunidad 2', amount: 250000.5, currency: 'COP', status: 'won', record_type: 'deal' },
      { id: U(94), organization_id: OTHER, name: 'Oportunidad 121', amount: 9999999, currency: 'COP', status: 'open', record_type: 'deal' },
    ],
    pipelines: [
      { id: U(40), organization_id: ORG, is_default: true, created_at: '2026-01-01T00:00:00.000Z' },
      { id: U(95), organization_id: OTHER, is_default: true, created_at: '2026-01-01T00:00:00.000Z' },
    ],
    stages: [
      { id: U(41), pipeline_id: U(40), position: 1 },
      { id: U(42), pipeline_id: U(40), position: 2 },
    ],
    tasks: [
      { id: U(50), organization_id: ORG, type: 'referido', status: 'open', title: 'Pedir referido — Oportunidad 1', due_date: '2026-10-15T00:00:00.000Z', customer_id: U(2), related_to_id: U(30) },
      { id: U(51), organization_id: ORG, type: 'referido', status: 'done', title: 'Hecha', due_date: null, customer_id: U(2), related_to_id: U(30) },
      { id: U(52), organization_id: ORG, type: 'llamada', status: 'open', title: 'Otra tarea', due_date: null, customer_id: U(2), related_to_id: null },
      { id: U(96), organization_id: OTHER, type: 'referido', status: 'open', title: 'Referido de 121', due_date: null, customer_id: U(91), related_to_id: null },
    ],
    partner_tiers: [
      { id: U(60), organization_id: ORG, name: 'Bronce', min_deals: 0, min_revenue: 0, commission_rate: 10, benefits: [] },
      { id: U(61), organization_id: ORG, name: 'Plata', min_deals: 2, min_revenue: 1000000, commission_rate: 15, benefits: ['Soporte'] },
      { id: U(62), organization_id: ORG, name: 'Oro', min_deals: 10, min_revenue: 50000000, commission_rate: 20, benefits: [] },
      { id: U(97), organization_id: OTHER, name: 'Tier 121', min_deals: 0, min_revenue: 0, commission_rate: 50, benefits: [] },
    ],
    partners: [
      { id: U(70), organization_id: ORG, name: 'Carlos Consultor', company_name: 'Consultoría', email: 'carlos@example.com', phone: null, tier_id: U(60), commission_rate: 12.5, is_active: true, created_at: '2026-09-01T00:00:00.000Z' },
      { id: U(71), organization_id: ORG, name: 'Hereda Tier', company_name: null, email: 'hereda@example.com', phone: null, tier_id: U(60), commission_rate: 0, is_active: true, created_at: '2026-09-02T00:00:00.000Z' },
      { id: U(98), organization_id: OTHER, name: 'Partner 121', company_name: null, email: 'p121@example.com', phone: null, tier_id: U(97), commission_rate: 50, is_active: true, created_at: '2026-09-03T00:00:00.000Z' },
    ],
    partner_deals: [
      { id: U(80), organization_id: ORG, partner_id: U(70), opportunity_id: U(30), deal_type: 'referral', commission_amount: 125000, commission_status: 'pending', commission_paid_at: null, created_at: '2026-09-05T00:00:00.000Z' },
      { id: U(81), organization_id: ORG, partner_id: U(70), opportunity_id: U(31), deal_type: 'co_sell', commission_amount: 31250.06, commission_status: 'approved', commission_paid_at: null, created_at: '2026-09-06T00:00:00.000Z' },
      { id: U(99), organization_id: OTHER, partner_id: U(98), opportunity_id: U(94), deal_type: 'reseller', commission_amount: 4999999, commission_status: 'pending', commission_paid_at: null, created_at: '2026-09-07T00:00:00.000Z' },
    ],
  };
}
