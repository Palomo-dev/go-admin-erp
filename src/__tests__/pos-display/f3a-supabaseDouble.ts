/**
 * Doble mínimo del cliente Supabase (service-role o sesión) para las rutas
 * de la Fase 3, parte A. Registra cada consulta (tabla, operación, filtros,
 * payload) y responde con lo que decida `responder`. Los encadenados que se
 * esperan sin `.maybeSingle()` (`.limit(n)`, `update(...).eq(...)`) son
 * thenables, como en supabase-js.
 */

export interface RecordedCall {
  table: string;
  op: 'select' | 'update' | 'upsert' | 'insert';
  columns?: string;
  returning?: string;
  payload?: Record<string, unknown>;
  opts?: unknown;
  filters: Array<[string, string, unknown]>;
  order?: [string, unknown];
  limit?: number;
}

export interface DoubleResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

export type Responder = (call: RecordedCall) => DoubleResult;

interface Chain {
  select(columns: string): Chain;
  update(payload: Record<string, unknown>): Chain;
  upsert(payload: Record<string, unknown>, opts?: unknown): Chain;
  insert(payload: Record<string, unknown>): Chain;
  eq(column: string, value: unknown): Chain;
  neq(column: string, value: unknown): Chain;
  gt(column: string, value: unknown): Chain;
  /** Filtro `or` de PostgREST (`col.is.null,col.lt.valor`); se registra como `['or', expr, undefined]`. */
  or(expression: string): Chain;
  order(column: string, opts?: unknown): Chain;
  limit(n: number): Chain;
  maybeSingle(): Promise<DoubleResult>;
  then<T>(onFulfilled: (value: DoubleResult) => T, onRejected?: (reason: unknown) => T): Promise<T>;
}

export interface SupabaseDouble {
  calls: RecordedCall[];
  from(table: string): Chain;
}

export function makeSupabaseDouble(responder: Responder): SupabaseDouble {
  const calls: RecordedCall[] = [];
  return {
    calls,
    from(table: string): Chain {
      const call: RecordedCall = { table, op: 'select', filters: [] };
      calls.push(call);
      const chain: Chain = {
        select: (columns) => {
          if (call.op === 'select') call.columns = columns;
          else call.returning = columns;
          return chain;
        },
        update: (payload) => {
          call.op = 'update';
          call.payload = payload;
          return chain;
        },
        upsert: (payload, opts) => {
          call.op = 'upsert';
          call.payload = payload;
          call.opts = opts;
          return chain;
        },
        insert: (payload) => {
          call.op = 'insert';
          call.payload = payload;
          return chain;
        },
        eq: (column, value) => {
          call.filters.push(['eq', column, value]);
          return chain;
        },
        neq: (column, value) => {
          call.filters.push(['neq', column, value]);
          return chain;
        },
        gt: (column, value) => {
          call.filters.push(['gt', column, value]);
          return chain;
        },
        or: (expression) => {
          call.filters.push(['or', expression, undefined]);
          return chain;
        },
        order: (column, opts) => {
          call.order = [column, opts];
          return chain;
        },
        limit: (n) => {
          call.limit = n;
          return chain;
        },
        maybeSingle: async () => responder(call),
        then: (onFulfilled, onRejected) => Promise.resolve().then(() => responder(call)).then(onFulfilled, onRejected),
      };
      return chain;
    },
  };
}

/**
 * Evalúa un filtro `or` de PostgREST sobre una fila del doble. Solo los
 * operadores que usan las rutas de la parte A (`is.null`, `is.true`,
 * `is.false`, `eq`, `neq`, `lt`, `gt`); cualquier otro → false (fail-closed,
 * para que un test no pase por accidente).
 */
export function matchesOrFilter(row: Record<string, unknown>, expression: string): boolean {
  return expression.split(',').some((clause) => {
    const [column, op, ...rest] = clause.split('.');
    const value = rest.join('.');
    const v = row[column];
    if (op === 'is') return value === 'null' ? v === null || v === undefined : value === 'true' ? v === true : value === 'false' ? v === false : false;
    if (op === 'eq') return String(v) === value;
    if (op === 'neq') return String(v) !== value;
    if (op === 'lt') return typeof v === 'string' && v < value;
    if (op === 'gt') return typeof v === 'string' && v > value;
    return false;
  });
}

/** Filtro `eq` registrado en una consulta, por columna. */
export function eqValue(call: RecordedCall, column: string): unknown {
  return call.filters.find(([op, col]) => op === 'eq' && col === column)?.[2];
}
