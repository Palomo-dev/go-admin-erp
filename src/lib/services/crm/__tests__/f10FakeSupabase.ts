/**
 * F10 — doble de Supabase para las pruebas de contrato de rutas y servicios.
 *
 * Derivado del de F13 (mismo contrato) con lo que F10 necesita: `neq`, `is`,
 * `like`, `order` real, embeds `product:products(...)`, `customers(...)`,
 * `objection:objections(...)`, `verticals(...)`, y `rpc`. Aplica los filtros
 * de verdad y REGISTRA cada escritura con sus filtros. Cada tabla lleva
 * señuelos de otra organización (121): leer o escribir sin `organization_id`
 * cambia el payload y la prueba muere.
 */

export type Row = Record<string, unknown>;

export interface Write {
  table: string;
  op: 'insert' | 'update' | 'delete';
  row: Row | null;
  filters: Record<string, unknown>;
}

export interface FakeDb {
  rows: Record<string, Row[]>;
  writes: Write[];
  nextWriteError?: { table: string; error: { code: string; message: string } };
  rpcCalls?: Array<{ fn: string; args: Record<string, unknown> }>;
  rpcResult?: Record<string, unknown>;
  /** Colas de la RPC de pagos, una por factura (`org:invoice`): modela el `FOR UPDATE` por FILA de Postgres. */
  rpcQueues?: Map<string, Promise<unknown>>;
}

type Pred = (row: Row) => boolean;

function cmp(a: unknown, b: string): number {
  const sa = String(a);
  const ta = Date.parse(sa);
  const tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && /T/.test(sa) && /T/.test(b)) return ta - tb;
  if (!Number.isNaN(Number(sa)) && !Number.isNaN(Number(b))) return Number(sa) - Number(b);
  return sa < b ? -1 : sa > b ? 1 : 0;
}

let idSeq = 0;

function embed(db: FakeDb, table: string, selectArg: string, row: Row): Row {
  const out = { ...row };
  const re = /(\w+):(\w+)\(([^)]*)\)|(\w+)\(([^)]*)\)/g;
  for (const m of selectArg.matchAll(re)) {
    const alias = m[1] ?? m[4];
    const target = m[2] ?? m[4];
    if (!alias || !target) continue;
    const fkByTable: Record<string, string> = { products: 'product_id', customers: 'customer_id', objections: 'objection_id', verticals: 'vertical_id', stages: 'stage_id', quotations: 'quotation_id', pipelines: 'pipeline_id' };
    const fk = fkByTable[target];
    if (!fk) continue;
    const related = (db.rows[target] ?? []).find((r) => r.id === row[fk]) ?? null;
    out[alias] = related;
  }
  void table;
  return out;
}

// ─── RPC fn_register_crm_payment (migración 20260916050000, deuda A4) ───────
// Misma semántica que la función SQL, en memoria. Se ejecuta SERIALIZADA por
// factura (una promesa a la vez por `org:invoice`, como el `FOR UPDATE` de la
// fila): entre la lectura del saldo y las escrituras hay un tick asíncrono,
// igual que entre sentencias de Postgres; sin la cola, dos llamadas
// concurrentes leerían el mismo saldo y ambas pasarían la validación. Dos
// facturas DISTINTAS no se bloquean entre sí: ahí solo el índice único corta
// una referencia stripe repetida.
// Tras el INSERT imita los triggers REALES de la BD (verificados en
// `pg_trigger` el 2026-09-16): `trg_recalc_invoice_balance_from_payments`
// (`invoice_sales.balance = GREATEST(total − Σ pagos completed, 0)`, status
// paid/partial; no toca draft/void/voided) y la sincronización de la cartera
// (`tr_update_accounts_receivable_on_payment` + `tr_update_account_receivable`
// → `accounts_receivable.balance` = saldo de la factura). La RPC NUNCA resta
// en la cartera: hacerlo la descontaba dos veces (prueba en seco del
// orquestador). Las semillas con `balance < total` deben llevar su pago
// previo en `payments`, como en la BD real.
// Registra en `db.writes` las mismas escrituras (payments insert,
// invoice_sales/accounts_receivable update filtradas por id y organización)
// para que las suites existentes sigan leyendo el mismo log.

type RpcError = { code: string; message: string; details?: string };
type RpcResult = { data: Record<string, unknown> | null; error: RpcError | null };

function runSerialized(db: FakeDb, key: string, task: () => Promise<RpcResult>): Promise<RpcResult> {
  const queues = (db.rpcQueues ??= new Map());
  const prev = queues.get(key) ?? Promise.resolve();
  const run = prev.then(task, task);
  queues.set(key, run.catch(() => undefined));
  return run;
}

function p0001(message: string, detail: Record<string, unknown>): RpcResult {
  return { data: null, error: { code: 'P0001', message, details: JSON.stringify(detail) } };
}

async function fnRegisterCrmPayment(db: FakeDb, args: Record<string, unknown>): Promise<RpcResult> {
  const orgId = args.p_organization_id;
  const invoiceId = args.p_invoice_id;
  const amountRaw = args.p_amount;
  const amount = typeof amountRaw === 'number' ? amountRaw : Number(amountRaw);
  if (orgId == null || invoiceId == null) return p0001('invoice_not_found', {});

  // 1) SELECT … FOR UPDATE por id Y organización.
  const invoice = (db.rows.invoice_sales ??= []).find((r) => r.id === invoiceId && r.organization_id === orgId);
  if (!invoice) return p0001('invoice_not_found', {});
  const balance = Number(invoice.balance ?? 0);

  // 1b) Replay de Stripe (misma referencia stripe:<event.id>) leído bajo el bloqueo: duplicate ANTES de validar el saldo.
  const reference = args.p_reference;
  if (typeof reference === 'string' && reference.startsWith('stripe:') && (db.rows.payments ??= []).some((e) => e.organization_id === orgId && e.reference === reference)) {
    return { data: { payment_id: null, new_balance: balance, invoice_status: invoice.status, duplicate: true }, error: null };
  }

  // 2) Importe numérico, finito y > 0.
  if (amountRaw == null || !Number.isFinite(amount) || amount <= 0) return p0001('invalid_amount', { amount: String(amountRaw) });

  // 3) Moneda del pago = moneda de la factura.
  const currency = String(args.p_currency ?? '').trim().toUpperCase();
  const invoiceCurrency = String(invoice.currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || (invoiceCurrency !== '' && invoiceCurrency !== currency)) {
    return p0001('currency_mismatch', { payment_currency: currency, invoice_currency: invoiceCurrency });
  }

  // 4) Importe <= saldo leído bajo el bloqueo.
  if (amount > balance) return p0001('amount_exceeds_balance', { amount, balance, status: invoice.status });

  // Tick entre lectura y escrituras: sin la cola, aquí se cuela la segunda llamada.
  await Promise.resolve();

  const nowIso = new Date().toISOString();

  // 5) INSERT en payments. Error inyectado (`nextWriteError`) = la transacción aborta sin escribir nada.
  const payments = (db.rows.payments ??= []);
  const paymentRow: Row = {
    organization_id: orgId,
    branch_id: args.p_branch_id ?? null,
    source: 'invoice_sales',
    source_id: invoiceId,
    method: args.p_method ?? null,
    amount,
    currency,
    reference: args.p_reference,
    processor_response: args.p_processor_response ?? null,
    status: 'completed',
    created_by: args.p_created_by ?? null,
    payment_date: (args.p_payment_date as string | null | undefined) || nowIso,
    discount_amount: 0,
    change_amount: 0,
  };
  const injected = db.nextWriteError && ['payments', 'invoice_sales', 'accounts_receivable'].includes(db.nextWriteError.table) ? db.nextWriteError : undefined;
  if (injected) {
    db.nextWriteError = undefined;
    const isStripeIdx = injected.error.code === '23505' && injected.error.message.includes('uq_payments_org_stripe_reference');
    if (injected.table === 'payments' && isStripeIdx) {
      return { data: { payment_id: null, new_balance: balance, invoice_status: invoice.status, duplicate: true }, error: null };
    }
    return { data: null, error: injected.error };
  }
  // Índice único parcial REAL: payments(organization_id, reference) WHERE reference LIKE 'stripe:%'.
  const ref = paymentRow.reference;
  if (typeof ref === 'string' && ref.startsWith('stripe:') && payments.some((e) => e.organization_id === orgId && e.reference === ref)) {
    return { data: { payment_id: null, new_balance: balance, invoice_status: invoice.status, duplicate: true }, error: null };
  }
  const created: Row = { id: `new-payments-${++idSeq}`, ...paymentRow };
  payments.push(created);
  db.writes.push({ table: 'payments', op: 'insert', row: paymentRow, filters: {} });

  // 6) Trigger trg_recalc_invoice_balance_from_payments: saldo = total − Σ pagos completed
  //    de la factura; status paid/partial; draft/void/voided y total nulo quedan intactos.
  const triggerActed = recalcInvoiceFromPayments(db, invoice, nowIso);

  // 6b) Respaldo de la RPC: si el trigger no actuó (saldo igual al leído bajo el bloqueo).
  if (!triggerActed && Number(invoice.balance ?? 0) === balance) {
    const fallbackBalance = balance - amount;
    const patch: Row = { balance: fallbackBalance, status: fallbackBalance <= 0 ? 'paid' : 'partial', updated_at: nowIso };
    Object.assign(invoice, patch);
    db.writes.push({ table: 'invoice_sales', op: 'update', row: patch, filters: { id: invoiceId, organization_id: orgId } });
    syncAccountsReceivable(db, invoice, nowIso);
  }

  // Lo que la RPC RELEE tras el INSERT (misma transacción).
  return { data: { payment_id: created.id, new_balance: Number(invoice.balance ?? 0), invoice_status: String(invoice.status), duplicate: false }, error: null };
}

/** `fn_recalc_invoice_balance_from_payments` + sincronización de cartera, en memoria. Devuelve si escribió la factura. */
function recalcInvoiceFromPayments(db: FakeDb, invoice: Row, nowIso: string): boolean {
  if (['draft', 'void', 'voided'].includes(String(invoice.status)) || invoice.total == null) return false;
  const paid = (db.rows.payments ?? [])
    .filter((p) => p.source === 'invoice_sales' && p.source_id === invoice.id && p.status === 'completed')
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const newBalance = Math.max(Number(invoice.total) - paid, 0);
  const newStatus = paid > 0 ? (newBalance === 0 ? 'paid' : 'partial') : String(invoice.status);
  if (Number(invoice.balance ?? 0) === newBalance && String(invoice.status) === newStatus) return false;
  const patch: Row = { balance: newBalance, status: newStatus, updated_at: nowIso };
  Object.assign(invoice, patch);
  db.writes.push({ table: 'invoice_sales', op: 'update', row: patch, filters: { id: invoice.id, organization_id: invoice.organization_id } });
  syncAccountsReceivable(db, invoice, nowIso);
  return true;
}

/** `tr_update_account_receivable` → `create_account_receivable`: la cartera copia el saldo de la factura. */
function syncAccountsReceivable(db: FakeDb, invoice: Row, nowIso: string): void {
  const arRow = (db.rows.accounts_receivable ??= []).find((r) => r.invoice_id === invoice.id && r.organization_id === invoice.organization_id);
  if (!arRow) return;
  const balance = Number(invoice.balance ?? 0);
  const patch: Row = { balance, status: balance <= 0 ? 'paid' : 'partial', updated_at: nowIso };
  Object.assign(arRow, patch);
  db.writes.push({ table: 'accounts_receivable', op: 'update', row: patch, filters: { id: arRow.id, organization_id: invoice.organization_id } });
}

export function createFakeSupabase(db: FakeDb) {
  const from = (table: string) => {
    const preds: Pred[] = [];
    const filters: Record<string, unknown> = {};
    let write: Write | null = null;
    let single = false;
    let head = false;
    let wantCount = false;
    let selectArg = '*';
    let rangeArg: [number, number] | null = null;
    let limitArg: number | null = null;
    let orderArg: { col: string; asc: boolean } | null = null;
    const chain: Record<string, unknown> = {};

    chain.select = (arg?: string, opts?: { count?: string; head?: boolean }) => {
      if (arg) selectArg = arg;
      if (opts?.count) wantCount = true;
      if (opts?.head) head = true;
      return chain;
    };
    chain.order = (col: string, opts?: { ascending?: boolean }) => { orderArg = { col, asc: opts?.ascending !== false }; return chain; };
    chain.limit = (n: number) => { limitArg = n; return chain; };
    chain.range = (a: number, b: number) => { rangeArg = [a, b]; return chain; };
    chain.eq = (col: string, value: unknown) => { preds.push((r) => r[col] === value); filters[col] = value; return chain; };
    chain.neq = (col: string, value: unknown) => { preds.push((r) => r[col] !== value); filters[`${col}__neq`] = value; return chain; };
    chain.is = (col: string, value: unknown) => { preds.push((r) => (value === null ? r[col] == null : r[col] === value)); filters[`${col}__is`] = value; return chain; };
    chain.in = (col: string, values: unknown[]) => { preds.push((r) => values.includes(r[col])); filters[`${col}__in`] = values; return chain; };
    chain.like = (col: string, pattern: string) => { const re = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$'); preds.push((r) => re.test(String(r[col] ?? ''))); return chain; };
    chain.gte = (col: string, value: string) => { preds.push((r) => r[col] != null && cmp(r[col], value) >= 0); filters[`${col}__gte`] = value; return chain; };
    chain.gt = (col: string, value: string) => { preds.push((r) => r[col] != null && cmp(r[col], value) > 0); return chain; };
    chain.lte = (col: string, value: string) => { preds.push((r) => r[col] != null && cmp(r[col], value) <= 0); filters[`${col}__lte`] = value; return chain; };
    chain.lt = (col: string, value: string) => { preds.push((r) => r[col] != null && cmp(r[col], value) < 0); filters[`${col}__lt`] = value; return chain; };
    chain.single = () => { single = true; return chain; };
    chain.maybeSingle = () => { single = true; return chain; };
    chain.insert = (row: Row | Row[]) => { write = { table, op: 'insert', row: Array.isArray(row) ? { __rows: row } : row, filters }; return chain; };
    chain.update = (row: Row) => { write = { table, op: 'update', row, filters }; return chain; };
    chain.delete = () => { write = { table, op: 'delete', row: null, filters }; return chain; };

    chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        const all = (db.rows[table] ??= []);
        if (write) {
          db.writes.push(write);
          if (db.nextWriteError && db.nextWriteError.table === table) {
            const err = db.nextWriteError.error;
            db.nextWriteError = undefined;
            resolve({ data: null, error: err, count: null });
            return;
          }
          const matched = all.filter((r) => preds.every((p) => p(r)));
          if (write.op === 'insert') {
            const rowsIn = (write.row && Array.isArray((write.row as Row).__rows)) ? ((write.row as Row).__rows as Row[]) : [write.row as Row];
            // Índice único parcial REAL (migración 20260915140000): payments(organization_id, reference) WHERE reference LIKE 'stripe:%'.
            if (table === 'payments') {
              const dup = rowsIn.find((r) => typeof r.reference === 'string' && r.reference.startsWith('stripe:') && all.some((e) => e.organization_id === r.organization_id && e.reference === r.reference));
              if (dup) {
                resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_payments_org_stripe_reference"' }, count: null });
                return;
              }
            }
            const created = rowsIn.map((r) => ({ id: `new-${table}-${++idSeq}`, ...r }));
            all.push(...created);
            resolve({ data: single ? created[0] : created, error: null, count: null });
            return;
          }
          if (write.op === 'update') {
            for (const r of matched) Object.assign(r, write.row);
            resolve({ data: single ? matched[0] ?? null : matched, error: null, count: null });
            return;
          }
          for (const r of matched) all.splice(all.indexOf(r), 1);
          resolve({ data: null, error: null, count: null });
          return;
        }
        let data = all.filter((r) => preds.every((p) => p(r)));
        if (orderArg) {
          const { col, asc } = orderArg;
          data = [...data].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], String(b[col])));
        }
        const count = wantCount ? data.length : null;
        if (rangeArg) data = data.slice(rangeArg[0], rangeArg[1] + 1);
        else if (limitArg != null) data = data.slice(0, limitArg);
        if (selectArg.includes('(')) data = data.map((r) => embed(db, table, selectArg, r));
        if (head) { resolve({ data: null, error: null, count }); return; }
        resolve({ data: single ? data[0] ?? null : data, error: null, count });
      } catch (e) {
        if (reject) reject(e); else throw e;
      }
    };
    return chain;
  };
  const rpc = (fn: string, args: Record<string, unknown>) => {
    (db.rpcCalls ??= []).push({ fn, args });
    if (fn === 'fn_register_crm_payment') return runSerialized(db, `${String(args.p_organization_id)}:${String(args.p_invoice_id)}`, () => fnRegisterCrmPayment(db, args));
    return Promise.resolve({ data: db.rpcResult?.[fn] ?? null, error: null });
  };
  return { from, rpc, auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) } };
}
