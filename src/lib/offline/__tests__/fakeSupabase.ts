/**
 * Cliente Supabase de mentira para los tests del checkout offline.
 *
 * Registra cada operación (`insert`, `select`, `update`, `rpc`) con su tabla,
 * filtros y payload, y delega la respuesta a un `handler` que cada test
 * configura. Solo implementa el subconjunto del query builder que usa
 * `POSService.checkout`.
 */

export interface FakeOp {
  table: string;
  action: 'insert' | 'select' | 'update' | 'delete' | 'rpc';
  payload?: unknown;
  filters: Record<string, unknown>;
  /** true si el select pidió `count: 'exact', head: true`. */
  countOnly?: boolean;
  single?: 'single' | 'maybeSingle';
}

export interface FakeResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export type FakeHandler = (op: FakeOp) => FakeResult | Promise<FakeResult>;

class FakeBuilder implements PromiseLike<FakeResult> {
  private op: FakeOp;
  constructor(private readonly handler: FakeHandler, table: string) {
    this.op = { table, action: 'select', filters: {} };
  }
  insert(payload: unknown) {
    this.op.action = 'insert';
    this.op.payload = payload;
    return this;
  }
  update(payload: unknown) {
    this.op.action = 'update';
    this.op.payload = payload;
    return this;
  }
  delete() {
    this.op.action = 'delete';
    return this;
  }
  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.head && opts?.count) this.op.countOnly = true;
    return this;
  }
  eq(col: string, val: unknown) {
    this.op.filters[col] = val;
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.op.filters[col] = vals;
    return this;
  }
  /** Fase 4F (`CajasService`): `.is('branch_id', null)`, rangos de fechas. Se registran como filtros. */
  is(col: string, val: unknown) {
    this.op.filters[col] = val;
    return this;
  }
  neq(col: string, val: unknown) {
    this.op.filters[`${col}.neq`] = val;
    return this;
  }
  gte(col: string, val: unknown) {
    this.op.filters[`${col}.gte`] = val;
    return this;
  }
  lte(col: string, val: unknown) {
    this.op.filters[`${col}.lte`] = val;
    return this;
  }
  match(filters: Record<string, unknown>) {
    Object.assign(this.op.filters, filters);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  single() {
    this.op.single = 'single';
    return this;
  }
  maybeSingle() {
    this.op.single = 'maybeSingle';
    return this;
  }
  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.handler(this.op))
      .then((r) => ({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null }))
      .then(onfulfilled, onrejected);
  }
}

export function createFakeSupabase(initialHandler: FakeHandler) {
  const ops: FakeOp[] = [];
  let handler = initialHandler;
  const client = {
    from: (table: string) => {
      const b = new FakeBuilder(async (op) => {
        ops.push(op);
        return handler(op);
      }, table);
      return b;
    },
    rpc: async (fn: string, args: unknown) => {
      const op: FakeOp = { table: `rpc:${fn}`, action: 'rpc', payload: args, filters: {} };
      ops.push(op);
      const r = await handler(op);
      return { data: r.data ?? null, error: r.error ?? null };
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-sync' } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: 'user-cajero' } } }, error: null }),
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  };
  return {
    client,
    ops,
    setHandler: (h: FakeHandler) => {
      handler = h;
    },
    reset: () => {
      ops.length = 0;
    },
  };
}

/** Operaciones de escritura sobre una tabla, en orden. */
export function writesTo(ops: FakeOp[], table: string): FakeOp[] {
  return ops.filter((o) => o.table === table && (o.action === 'insert' || o.action === 'update'));
}
