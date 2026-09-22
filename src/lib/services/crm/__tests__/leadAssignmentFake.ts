/**
 * F1 — doble del cliente de Supabase para las pruebas del alta de leads con
 * asignación automática (`leadCreateService` + `assignmentService`).
 *
 * Aplica de verdad los filtros (`eq`, `neq`, `in`, `not is null`), el orden,
 * el `limit`, el `count` con `head`, y las escrituras sobre tablas en memoria.
 * Cada tabla lleva señuelos de la organización 121: si el servicio olvida un
 * filtro de organización, el señuelo aparece y la prueba se pone roja.
 */

export type Row = Record<string, unknown>;

export interface Write {
  table: string;
  op: 'insert' | 'update' | 'delete';
  payload: unknown;
  filters: Filter[];
}

interface Filter {
  kind: 'eq' | 'neq' | 'in' | 'not_is';
  key: string;
  value: unknown;
}

export interface FakeDb {
  tables: Record<string, Row[]>;
  writes: Write[];
  /** Error a inyectar en `tabla:op` (p. ej. `sales_team_members:select`). */
  errors: Record<string, { code?: string; message: string }>;
  /** Cuántas veces se consultó cada tabla (para comprobar que NO se consulta). */
  reads: Record<string, number>;
  /** Cada lectura con sus filtros (para comprobar que llevan organization_id). */
  queries: { table: string; filters: Filter[] }[];
  seq: number;
}

export function makeDb(tables: Record<string, Row[]>): FakeDb {
  return { tables: JSON.parse(JSON.stringify(tables)), writes: [], errors: {}, reads: {}, queries: [], seq: 0 };
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
    case 'not_is':
      return f.value === null ? v !== null && v !== undefined : v !== f.value;
  }
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

export function fakeSupabase(db: FakeDb) {
  const from = (table: string) => {
    const filters: Filter[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: unknown = null;
    let wantCount = false;
    let head = false;
    const orders: { key: string; asc: boolean }[] = [];
    let limit: number | null = null;
    let mode: 'many' | 'single' | 'maybe' = 'many';

    const run = () => {
      if (op === 'select') {
        db.reads[table] = (db.reads[table] ?? 0) + 1;
        db.queries.push({ table, filters: [...filters] });
      }
      const err = db.errors[`${table}:${op}`];
      if (err) return { data: null, error: err, count: null };
      const rows = db.tables[table] ?? (db.tables[table] = []);
      let result: Row[];
      if (op === 'insert') {
        const items = (Array.isArray(payload) ? payload : [payload]) as Row[];
        result = items.map((p) => {
          db.seq += 1;
          const row: Row = { id: `${table}-${db.seq}`, created_at: `2026-09-21T12:00:${String(db.seq).padStart(2, '0')}.000Z`, ...p };
          rows.push(row);
          return row;
        });
        db.writes.push({ table, op, payload, filters: [...filters] });
      } else {
        const hit = rows.filter((r) => filters.every((f) => matches(r, f)));
        if (op === 'update') {
          db.writes.push({ table, op, payload, filters: [...filters] });
          for (const r of hit) Object.assign(r, payload as Row);
        } else if (op === 'delete') {
          db.writes.push({ table, op, payload: null, filters: [...filters] });
          db.tables[table] = rows.filter((r) => !hit.includes(r));
        }
        result = hit;
      }
      for (const o of [...orders].reverse()) {
        result = [...result].sort((a, b) => compare(a[o.key], b[o.key]) * (o.asc ? 1 : -1));
      }
      const total = result.length;
      if (limit !== null) result = result.slice(0, limit);
      const shaped = result.map((r) => ({ ...r }));
      if (head) return { data: null, error: null, count: wantCount ? total : null };
      if (mode === 'single') {
        return shaped.length === 1
          ? { data: shaped[0], error: null, count: null }
          : { data: null, error: { code: 'PGRST116', message: `expected 1 row, got ${shaped.length}` }, count: null };
      }
      if (mode === 'maybe') return { data: shaped[0] ?? null, error: null, count: null };
      return { data: shaped, error: null, count: wantCount ? total : null };
    };

    const chain: Record<string, unknown> = {
      select(cols = '*', opts?: { count?: string; head?: boolean }) {
        void cols; // el doble devuelve filas completas: las columnas no se recortan
        if (opts?.count) wantCount = true;
        if (opts?.head) head = true;
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
      not(key: string, operator: string, value: unknown) {
        if (operator !== 'is') throw new Error(`fake: not(${operator}) no soportado`);
        filters.push({ kind: 'not_is', key, value });
        return chain;
      },
      order(key: string, opts?: { ascending?: boolean }) {
        orders.push({ key, asc: opts?.ascending !== false });
        return chain;
      },
      limit(n: number) {
        limit = n;
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

export const TEAM = U(300);
export const TEAM_OTHER = U(390);
export const VENDEDOR_A = U(201);
export const VENDEDOR_B = U(202);
export const VENDEDOR_INACTIVO = U(203);
export const VENDEDOR_121 = U(291);

/** Organización 120 con un equipo de dos vendedores activos y uno inactivo; org 121 con señuelos. */
export function seed(): Record<string, Row[]> {
  return {
    pipelines: [
      { id: U(40), organization_id: ORG, is_default: true, created_at: '2026-01-01T00:00:00.000Z' },
      { id: U(95), organization_id: OTHER, is_default: true, created_at: '2026-01-01T00:00:00.000Z' },
    ],
    stages: [
      { id: U(41), pipeline_id: U(40), position: 1 },
      { id: U(42), pipeline_id: U(40), position: 2 },
    ],
    customers: [
      { id: U(1), organization_id: ORG, email: 'ana@example.com', city: 'Bogotá', lifecycle_stage: 'lead' },
      { id: U(91), organization_id: OTHER, email: 'senuelo@example.com', city: 'Bogotá', lifecycle_stage: 'lead' },
    ],
    organization_members: [
      { user_id: VENDEDOR_A, organization_id: ORG, is_active: true },
      { user_id: VENDEDOR_B, organization_id: ORG, is_active: true },
      { user_id: VENDEDOR_INACTIVO, organization_id: ORG, is_active: true },
      { user_id: VENDEDOR_121, organization_id: OTHER, is_active: true },
    ],
    sales_teams: [
      { id: TEAM, organization_id: ORG, name: 'Equipo A', is_active: true, created_at: '2026-02-01T00:00:00.000Z' },
      { id: TEAM_OTHER, organization_id: OTHER, name: 'Equipo 121', is_active: true, created_at: '2026-01-01T00:00:00.000Z' },
    ],
    sales_team_members: [
      { id: U(310), organization_id: ORG, sales_team_id: TEAM, user_id: VENDEDOR_A, sales_role_id: null, is_active: true, created_at: '2026-02-01T00:00:01.000Z' },
      { id: U(311), organization_id: ORG, sales_team_id: TEAM, user_id: VENDEDOR_B, sales_role_id: null, is_active: true, created_at: '2026-02-01T00:00:02.000Z' },
      { id: U(312), organization_id: ORG, sales_team_id: TEAM, user_id: VENDEDOR_INACTIVO, sales_role_id: null, is_active: false, created_at: '2026-02-01T00:00:03.000Z' },
      { id: U(391), organization_id: OTHER, sales_team_id: TEAM_OTHER, user_id: VENDEDOR_121, sales_role_id: null, is_active: true, created_at: '2026-01-01T00:00:01.000Z' },
    ],
    territories: [],
    organization_settings: [],
    opportunities: [
      { id: U(94), organization_id: OTHER, customer_id: U(91), salesperson_id: VENDEDOR_121, status: 'open', record_type: 'lead', created_at: '2026-09-20T00:00:00.000Z' },
    ],
  };
}
