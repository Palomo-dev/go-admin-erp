/**
 * Fake in-memory de SupabaseClient para tests de servicios CRM (F4).
 * Soporta el subconjunto del query builder que usa el código:
 *   from().select().eq().neq().in().gte().order().limit().range().maybeSingle()/single()
 *   from().insert(row|rows).select().single()
 *   from().update(patch).eq().select().single()
 *   from().delete().eq()
 *   storage.from(bucket).download()/upload()/remove()
 *   rpc(name, args)
 * Registra todas las llamadas para poder afirmar sobre ellas.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type Row = Record<string, any>;

export interface FakeDbOptions {
  /** Filas iniciales por tabla. */
  tables?: Record<string, Row[]>;
  /** Implementaciones de RPC. */
  rpc?: Record<string, (args: Row) => any>;
  /** Contenido del storage por path. */
  storage?: Record<string, Buffer>;
  /** Errores forzados: `${table}:${op}` -> mensaje. */
  failOn?: Record<string, string>;
  /** CHECK constraints simulados por tabla/columna. */
  checks?: Record<string, Record<string, readonly string[]>>;
  /** Índices UNIQUE simulados: tabla -> columnas. */
  unique?: Record<string, string[]>;
}

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function getPath(row: Row, key: string): any {
  // Soporta `raw_response->>provider_request_id`
  const m = key.match(/^([a-z_]+)->>(.+)$/);
  if (m) {
    const v = row[m[1]];
    const val = v && typeof v === 'object' ? v[m[2]] : undefined;
    return val === undefined || val === null ? null : String(val);
  }
  return row[key];
}

export class FakeDb {
  tables: Record<string, Row[]>;
  rpcImpl: Record<string, (args: Row) => any>;
  storageFiles: Record<string, Buffer>;
  failOn: Record<string, string>;
  checks: Record<string, Record<string, readonly string[]>>;
  unique: Record<string, string[]>;
  calls: Array<{ table: string; op: string; payload?: any }> = [];
  rpcCalls: Array<{ name: string; args: Row }> = [];
  storageCalls: Array<{ op: string; bucket: string; path: string | string[] }> = [];

  constructor(opts: FakeDbOptions = {}) {
    this.tables = opts.tables ?? {};
    this.rpcImpl = opts.rpc ?? {};
    this.storageFiles = opts.storage ?? {};
    this.failOn = opts.failOn ?? {};
    this.checks = opts.checks ?? {};
    this.unique = opts.unique ?? {};
  }

  rows(t: string): Row[] {
    if (!this.tables[t]) this.tables[t] = [];
    return this.tables[t];
  }

  private violation(table: string, row: Row): string | null {
    const c = this.checks[table];
    if (c) {
      for (const [col, allowed] of Object.entries(c)) {
        const v = row[col];
        if (v !== undefined && v !== null && !allowed.includes(String(v))) {
          return `new row for relation "${table}" violates check constraint "${table}_${col}_check"`;
        }
      }
    }
    const u = this.unique[table];
    if (u) {
      const dup = this.rows(table).some((r) => u.every((col) => r[col] === row[col]));
      if (dup) return `duplicate key value violates unique constraint "${table}_${u.join('_')}_key"`;
    }
    return null;
  }

  client(): SupabaseClient {
    const db = this;
    const from = (table: string) => {
      const state: { filters: Array<(r: Row) => boolean>; order?: { col: string; asc: boolean }; limit?: number; op: string; payload?: any; selectAfter?: boolean } = {
        filters: [],
        op: 'select',
      };
      const apply = () => {
        let out = db.rows(table).filter((r) => state.filters.every((f) => f(r)));
        if (state.order) {
          const { col, asc } = state.order;
          out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
        }
        if (state.limit != null) out = out.slice(0, state.limit);
        return out;
      };
      const runWrite = (): { data: Row[] | null; error: { message: string } | null } => {
        const fail = db.failOn[`${table}:${state.op}`];
        if (fail) return { data: null, error: { message: fail } };
        if (state.op === 'insert') {
          const list: Row[] = Array.isArray(state.payload) ? state.payload : [state.payload];
          const created: Row[] = [];
          for (const r of list) {
            const row = { id: r.id ?? uuid(), created_at: r.created_at ?? new Date().toISOString(), updated_at: r.updated_at ?? new Date().toISOString(), ...r };
            const v = db.violation(table, row);
            if (v) return { data: null, error: { message: v } };
            db.rows(table).push(row);
            created.push(row);
          }
          db.calls.push({ table, op: 'insert', payload: list });
          return { data: created, error: null };
        }
        if (state.op === 'update') {
          const targets = apply();
          for (const t of targets) Object.assign(t, state.payload);
          db.calls.push({ table, op: 'update', payload: state.payload });
          return { data: targets, error: null };
        }
        if (state.op === 'delete') {
          const targets = apply();
          db.tables[table] = db.rows(table).filter((r) => !targets.includes(r));
          db.calls.push({ table, op: 'delete' });
          return { data: targets, error: null };
        }
        return { data: apply(), error: null };
      };
      const b: any = {
        select: (_c?: string) => {
          if (state.op === 'select') db.calls.push({ table, op: 'select' });
          state.selectAfter = true;
          return b;
        },
        insert: (payload: any) => {
          state.op = 'insert';
          state.payload = payload;
          return b;
        },
        update: (payload: any) => {
          state.op = 'update';
          state.payload = payload;
          return b;
        },
        delete: () => {
          state.op = 'delete';
          return b;
        },
        upsert: (payload: any) => {
          state.op = 'insert';
          state.payload = payload;
          return b;
        },
        eq: (col: string, val: any) => {
          state.filters.push((r) => String(getPath(r, col)) === String(val));
          return b;
        },
        neq: (col: string, val: any) => {
          state.filters.push((r) => String(getPath(r, col)) !== String(val));
          return b;
        },
        in: (col: string, vals: any[]) => {
          state.filters.push((r) => vals.map(String).includes(String(getPath(r, col))));
          return b;
        },
        gte: (col: string, val: any) => {
          state.filters.push((r) => getPath(r, col) >= val);
          return b;
        },
        is: (col: string, val: any) => {
          state.filters.push((r) => getPath(r, col) === val);
          return b;
        },
        order: (col: string, o?: { ascending?: boolean }) => {
          state.order = { col, asc: o?.ascending !== false };
          return b;
        },
        limit: (n: number) => {
          state.limit = n;
          return b;
        },
        range: () => b,
        maybeSingle: async () => {
          // `failOn['tabla:select']` permite simular un error de LECTURA (p. ej.
          // el PGRST116 de `maybeSingle()` cuando hay filas duplicadas), no solo
          // de escritura: hay guardas que dependen de no descartar ese `error`.
          const readFail = state.op === 'select' ? db.failOn[`${table}:select`] : undefined;
          if (readFail) return { data: null, error: { message: readFail } };
          const r = state.op === 'select' ? apply() : (runWrite().data ?? []);
          return { data: r[0] ?? null, error: null };
        },
        single: async () => {
          if (state.op === 'select') {
            const readFail = db.failOn[`${table}:select`];
            if (readFail) return { data: null, error: { message: readFail } };
            const r = apply();
            return r.length ? { data: r[0], error: null } : { data: null, error: { message: 'no rows' } };
          }
          const w = runWrite();
          if (w.error) return { data: null, error: w.error };
          return { data: (w.data ?? [])[0] ?? null, error: null };
        },
        then: (res: any, rej: any) => {
          const w = state.op === 'select' ? { data: apply(), error: null } : runWrite();
          return Promise.resolve(w).then(res, rej);
        },
      };
      return b;
    };

    return {
      from,
      rpc: async (name: string, args: Row) => {
        db.rpcCalls.push({ name, args });
        const impl = db.rpcImpl[name];
        if (!impl) return { data: null, error: { message: `rpc ${name} no implementado` } };
        try {
          return { data: impl(args), error: null };
        } catch (e) {
          return { data: null, error: { message: (e as Error).message } };
        }
      },
      storage: {
        from: (bucket: string) => ({
          download: async (path: string) => {
            db.storageCalls.push({ op: 'download', bucket, path });
            const buf = db.storageFiles[path];
            if (!buf) return { data: null, error: { message: 'Object not found' } };
            return { data: { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), type: 'audio/wav' }, error: null };
          },
          upload: async (path: string, body: Buffer) => {
            db.storageCalls.push({ op: 'upload', bucket, path });
            const fail = db.failOn['storage:upload'];
            if (fail) return { data: null, error: { message: fail } };
            db.storageFiles[path] = body;
            return { data: { path }, error: null };
          },
          remove: async (paths: string[]) => {
            db.storageCalls.push({ op: 'remove', bucket, path: paths });
            for (const p of paths) delete db.storageFiles[p];
            return { data: null, error: null };
          },
        }),
      },
    } as unknown as SupabaseClient;
  }
}
