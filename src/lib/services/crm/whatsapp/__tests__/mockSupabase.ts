/**
 * Mock mínimo de supabase-js para los tests de FASE-16: `from(table)` devuelve
 * un builder encadenable; al hacer `await` se resuelve con lo que devuelva el
 * resolver de esa tabla (recibe las operaciones aplicadas). `rpc` idem.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Op { method: string; args: unknown[] }
export interface Resp { data?: unknown; error?: { message: string } | null; count?: number | null }
export type TableResolver = (ops: Op[], call: number) => Resp | Promise<Resp>;

export interface MockSupabase {
  sb: SupabaseClient;
  calls: Array<{ table: string; ops: Op[] }>;
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
}

export function makeSupabase(tables: Record<string, TableResolver>, rpc?: (fn: string, args: Record<string, unknown>) => Resp | Promise<Resp>): MockSupabase {
  const calls: MockSupabase['calls'] = [];
  const rpcCalls: MockSupabase['rpcCalls'] = [];
  const counters: Record<string, number> = {};
  const from = (table: string) => {
    const ops: Op[] = [];
    calls.push({ table, ops });
    const builder: Record<string, unknown> = {};
    const proxy: unknown = new Proxy(builder, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: Resp) => void, reject?: (e: unknown) => void) => {
            const r = tables[table];
            if (!r) {
              const err = new Error(`mock: sin resolver para "${table}" (${ops.map((o) => o.method).join('.')})`);
              return reject ? reject(err) : Promise.reject(err);
            }
            counters[table] = (counters[table] ?? 0) + 1;
            return Promise.resolve(r(ops, counters[table])).then((v) => resolve({ data: null, error: null, ...v }), reject);
          };
        }
        if (prop === 'catch' || prop === 'finally') return undefined;
        return (...args: unknown[]) => {
          ops.push({ method: prop, args });
          return proxy;
        };
      },
    });
    return proxy;
  };
  const rpcFn = async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    const r = rpc ? await rpc(fn, args) : { data: null, error: null };
    return { data: null, error: null, ...r };
  };
  return { sb: { from, rpc: rpcFn } as unknown as SupabaseClient, calls, rpcCalls };
}

export const has = (ops: Op[], method: string, col?: string, val?: unknown) =>
  ops.some((o) => o.method === method && (col === undefined || o.args[0] === col) && (val === undefined || o.args[1] === val));

export const opArg = <T = unknown>(ops: Op[], method: string, idx = 0): T | undefined => ops.find((o) => o.method === method)?.args[idx] as T | undefined;
