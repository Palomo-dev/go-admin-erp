/**
 * Cliente Supabase falso para tests del módulo de email: registra la cadena
 * (tabla, operación, filtros) y delega la respuesta en `handler`.
 * No es un test (jest solo ejecuta *.test.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface FakeCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | '';
  args: unknown[];
  filters: Array<[string, ...unknown[]]>;
  select?: string;
}

export type FakeResult = { data: unknown; error: unknown; count?: number | null };
export type FakeHandler = (call: FakeCall) => FakeResult | Promise<FakeResult>;

export function fakeSupabase(handler: FakeHandler, rpc?: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) {
  const calls: FakeCall[] = [];
  const from = (table: string) => {
    const state: FakeCall = { table, op: '', args: [], filters: [] };
    calls.push(state);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    const setOp = (op: FakeCall['op']) => (...args: unknown[]) => { state.op = op; state.args = args; return chain; };
    chain.insert = setOp('insert');
    chain.update = setOp('update');
    chain.upsert = setOp('upsert');
    chain.delete = setOp('delete');
    chain.select = (cols?: string) => { if (!state.op) state.op = 'select'; state.select = cols; return chain; };
    for (const f of ['eq', 'neq', 'in', 'ilike', 'contains', 'order', 'range', 'limit', 'gt', 'gte', 'lt', 'lte', 'is', 'not']) {
      chain[f] = (...args: unknown[]) => { state.filters.push([f, ...args]); return chain; };
    }
    const exec = () => Promise.resolve(handler(state));
    const first = (r: FakeResult) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data });
    chain.maybeSingle = () => exec().then(first);
    chain.single = () => exec().then(first);
    chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => exec().then(res, rej);
    return chain;
  };
  const client = {
    from,
    rpc: rpc ?? (async () => ({ data: null, error: null })),
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.example/file' }, error: null }) }) },
  } as unknown as SupabaseClient;
  return { client, calls };
}

/** Filtro `eq` de una llamada (primer valor de la columna). */
export function eqValue(call: FakeCall, column: string): unknown {
  return call.filters.find((f) => f[0] === 'eq' && f[1] === column)?.[2];
}
