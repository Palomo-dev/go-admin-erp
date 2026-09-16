/// <reference types="jest" />
/**
 * F10 — deuda A4 (2026-09-16): pagos manuales concurrentes → RPC atómica.
 *
 * `registerCrmPayment` delega la carrera lectura→validación→escrituras en
 * `fn_register_crm_payment` (migración 20260916050000). El fake ejecuta la
 * misma semántica en memoria de forma SERIALIZADA (una promesa a la vez),
 * que es lo que hace `SELECT … FOR UPDATE` en Postgres: el segundo pago ve
 * el saldo ya descontado. Contrato de retorno de Node intacto
 * (`success, payment_id, invoice_status, commission_created, idempotent,
 * duplicate?, code?, http_status?, message`).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createFakeSupabase, type FakeDb } from './f10FakeSupabase';
import { registerCrmPayment } from '@/lib/services/crm/paymentService';

let db: FakeDb;

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      invoice_sales: [
        { id: 'inv-1', organization_id: 120, number: 'FACT-0001', total: 6800000, balance: 5000000, status: 'partial', currency: 'COP', customer_id: 'c-1', opportunity_id: 'op-1', salesperson_id: 'u-1', commission_rate: 10, commission_type: 'salesperson' },
        { id: 'inv-9', organization_id: 121, number: 'FACT-0009', total: 5, balance: 5, status: 'issued', currency: 'COP', customer_id: 'c-9', opportunity_id: null, salesperson_id: null, commission_rate: null, commission_type: null },
      ],
      // Pago previo de 1.800.000: el fake recalcula como el trigger real (total − Σ pagos completed).
      payments: [{ id: 'pay-seed', organization_id: 120, source: 'invoice_sales', source_id: 'inv-1', status: 'completed', amount: 1800000, currency: 'COP', reference: 'anticipo-seed', method: 'cash' }],
      accounts_receivable: [
        { id: 'ar-1', organization_id: 120, invoice_id: 'inv-1', balance: 5000000, status: 'partial' },
        { id: 'ar-9', organization_id: 121, invoice_id: 'inv-9', balance: 5, status: 'pending' },
      ],
      commissions: [],
    },
  };
}

const client = () => createFakeSupabase(db) as unknown as Parameters<typeof registerCrmPayment>[2];
const manual = (amount: number, reference: string, over: Record<string, unknown> = {}) => ({ invoice_id: 'inv-1', amount, currency: 'COP', method: 'cash', reference, ...over });
const invoice = () => db.rows.invoice_sales[0];
const ar = () => db.rows.accounts_receivable[0];
const writesTo = (t: string) => db.writes.filter((w) => w.table === t);
/** Pagos hechos por la prueba (sin el anticipo de la semilla). */
const newPayments = () => db.rows.payments.filter((p) => p.reference !== 'anticipo-seed');
const rpcCalls = () => (db.rpcCalls ?? []).filter((c) => c.fn === 'fn_register_crm_payment');

/** Cliente que solo responde a `rpc` con lo que se le indique (mapeo de errores). */
function rpcStub(result: { data?: unknown; error?: { code: string; message: string; details?: string } }) {
  const base = createFakeSupabase(db);
  return { ...base, rpc: async () => ({ data: result.data ?? null, error: result.error ?? null }) } as unknown as Parameters<typeof registerCrmPayment>[2];
}

/** Cuenta cada `from(tabla)` para comprobar que el servicio ya no lee/escribe la factura ni la cartera desde Node. */
function instrumented() {
  const tables: string[] = [];
  const base = createFakeSupabase(db);
  return { tables, client: { ...base, from: (t: string) => { tables.push(t); return base.from(t); } } as unknown as Parameters<typeof registerCrmPayment>[2] };
}

beforeEach(() => { db = seed(); });

describe('A4-1 concurrencia: dos pagos manuales simultáneos con referencias distintas', () => {
  it('por el saldo completo cada uno → exactamente UNO aplica; el otro «excede el balance»; saldo 0, un pago, un UPDATE de factura y uno de cartera', async () => {
    const [a, b] = await Promise.all([
      registerCrmPayment(120, manual(5000000, 'recibo-a'), client()),
      registerCrmPayment(120, manual(5000000, 'recibo-b'), client()),
    ]);
    const ok = [a, b].filter((r) => r.success);
    const ko = [a, b].filter((r) => !r.success);
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect(ko[0].message).toMatch(/excede el balance pendiente \(0\)/);
    expect(ko[0].code).toBeUndefined();
    expect(ko[0].invoice_status).toBe('paid');
    expect(Number(invoice().balance)).toBe(0);
    expect(invoice().status).toBe('paid');
    expect(newPayments()).toHaveLength(1);
    expect(writesTo('invoice_sales').filter((w) => w.op === 'update')).toHaveLength(1);
    expect(writesTo('accounts_receivable').filter((w) => w.op === 'update')).toHaveLength(1);
    expect(Number(ar().balance)).toBe(0);
  });

  it('dos parciales de 3.000.000 sobre un saldo de 5.000.000 → uno aplica y el saldo queda en 2.000.000 (nunca negativo)', async () => {
    const rs = await Promise.all([
      registerCrmPayment(120, manual(3000000, 'p-1'), client()),
      registerCrmPayment(120, manual(3000000, 'p-2'), client()),
    ]);
    expect(rs.filter((r) => r.success)).toHaveLength(1);
    expect(Number(invoice().balance)).toBe(2000000);
    expect(invoice().status).toBe('partial');
    expect(newPayments().reduce((s, p) => s + Number(p.amount), 0)).toBe(3000000);
  });

  it('tres simultáneos de 2.000.000 → dos aplican (4.000.000) y el tercero se rechaza; la suma de pagos nunca supera el saldo', async () => {
    const rs = await Promise.all(['t-1', 't-2', 't-3'].map((ref) => registerCrmPayment(120, manual(2000000, ref), client())));
    expect(rs.filter((r) => r.success)).toHaveLength(2);
    expect(Number(invoice().balance)).toBe(1000000);
    expect(newPayments().reduce((s, p) => s + Number(p.amount), 0)).toBe(4000000);
  });

  it('la validación es contra el SALDO, no contra el total: 6.000.000 (< total 6.800.000, > saldo 5.000.000) se rechaza sin escribir', async () => {
    const r = await registerCrmPayment(120, manual(6000000, 'grande'), client());
    expect(r).toMatchObject({ success: false, invoice_status: 'partial' });
    expect(r.message).toMatch(/excede el balance pendiente \(5000000\)/);
    expect(db.writes).toEqual([]);
    expect(Number(invoice().balance)).toBe(5000000);
  });
});

describe('A4-2 el servicio delega en la RPC y deja de leer/escribir factura y cartera desde Node', () => {
  it('llama a fn_register_crm_payment con la organización del PARÁMETRO y las columnas de siempre', async () => {
    const r = await registerCrmPayment(120, manual(1000000, 'rpc-args', { branch_id: 7, created_by: 'u-1', payment_date: '2026-09-16T10:00:00.000Z', processor_response: { ok: true } }), client());
    expect(r.success).toBe(true);
    expect(rpcCalls()).toHaveLength(1);
    expect(rpcCalls()[0].args).toMatchObject({
      p_organization_id: 120, p_invoice_id: 'inv-1', p_amount: 1000000, p_currency: 'COP', p_reference: 'rpc-args',
      p_method: 'cash', p_branch_id: 7, p_created_by: 'u-1', p_payment_date: '2026-09-16T10:00:00.000Z', p_processor_response: { ok: true },
    });
  });

  it('pago parcial: desde Node solo se toca payments (idempotencia previa); factura y cartera van por la RPC', async () => {
    const { tables, client: c } = instrumented();
    const r = await registerCrmPayment(120, manual(1000000, 'solo-rpc'), c);
    expect(r.success).toBe(true);
    expect(tables).toEqual(['payments']);
  });

  it('pago completo: Node lee invoice_sales SOLO para la comisión (después de la RPC) y nunca toca accounts_receivable', async () => {
    const { tables, client: c } = instrumented();
    const r = await registerCrmPayment(120, manual(5000000, 'solo-rpc-paid'), c);
    expect(r).toMatchObject({ success: true, commission_created: true });
    expect(tables).toEqual(['payments', 'invoice_sales', 'commissions', 'commissions']);
    expect(tables).not.toContain('accounts_receivable');
    // la única escritura de Node es la comisión; payments/invoice_sales/accounts_receivable las escribió la RPC
    expect(db.writes.map((w) => w.table)).toEqual(['payments', 'invoice_sales', 'accounts_receivable', 'commissions']);
  });

  it('el fake registra las escrituras de la RPC con la forma de siempre (payments insert, invoice_sales/accounts_receivable update filtrados por id y organización)', async () => {
    await registerCrmPayment(120, manual(1000000, 'forma', { branch_id: 3, created_by: 'u-1' }), client());
    const pay = writesTo('payments').find((w) => w.op === 'insert');
    expect(pay?.row).toMatchObject({ organization_id: 120, branch_id: 3, source: 'invoice_sales', source_id: 'inv-1', method: 'cash', amount: 1000000, currency: 'COP', reference: 'forma', status: 'completed', created_by: 'u-1', discount_amount: 0, change_amount: 0 });
    expect(typeof pay?.row?.payment_date).toBe('string');
    const inv = writesTo('invoice_sales').find((w) => w.op === 'update');
    expect(inv?.filters).toEqual({ id: 'inv-1', organization_id: 120 });
    expect(inv?.row).toMatchObject({ balance: 4000000, status: 'partial' });
    const arw = writesTo('accounts_receivable').find((w) => w.op === 'update');
    expect(arw?.filters).toEqual({ id: 'ar-1', organization_id: 120 });
    expect(arw?.row).toMatchObject({ balance: 4000000, status: 'partial' });
  });

  it('el orden de escrituras dentro de la RPC es payments → invoice_sales → accounts_receivable', async () => {
    await registerCrmPayment(120, manual(1000000, 'orden'), client());
    expect(db.writes.map((w) => w.table)).toEqual(['payments', 'invoice_sales', 'accounts_receivable']);
  });
});

describe('A4-3 importe y moneda', () => {
  it.each([
    ['negativo', -500000],
    ['cero', 0],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['texto', 'abc' as unknown as number],
    ['null', null as unknown as number],
  ])('importe %s → INVALID_AMOUNT / 400 sin llamar a la RPC ni escribir', async (_l, amount) => {
    const r = await registerCrmPayment(120, manual(amount, `bad-${_l}`), client());
    expect(r).toMatchObject({ success: false, code: 'INVALID_AMOUNT', http_status: 400, payment_id: null });
    expect(rpcCalls()).toHaveLength(0);
    expect(db.writes).toEqual([]);
  });

  it('moneda USD sobre factura COP → CURRENCY_MISMATCH / 400 desde la RPC, sin escribir', async () => {
    const r = await registerCrmPayment(120, manual(100, 'usd', { currency: 'USD' }), client());
    expect(r).toMatchObject({ success: false, code: 'CURRENCY_MISMATCH', http_status: 400 });
    expect(r.message).toMatch(/USD.*COP/);
    expect(db.writes).toEqual([]);
  });

  it('factura en «cop» minúsculas y pago « cop » con espacios → coincide y el pago se guarda como COP', async () => {
    invoice().currency = 'cop';
    const r = await registerCrmPayment(120, manual(100, 'cop-ok', { currency: ' cop ' }), client());
    expect(r.success).toBe(true);
    expect(newPayments()[0]).toMatchObject({ currency: 'COP', amount: 100 });
  });
});

describe('A4-4 idempotencia y duplicados', () => {
  it('dos webhooks simultáneos con la misma referencia stripe: → uno inserta y el otro recibe duplicate:true, idempotent:true, payment_id null; factura y cartera se actualizan UNA vez', async () => {
    const input = manual(1000000, 'stripe:evt_dup', { method: 'stripe' });
    const [a, b] = await Promise.all([registerCrmPayment(120, input, client()), registerCrmPayment(120, input, client())]);
    const dup = [a, b].filter((r) => r.duplicate === true);
    const ins = [a, b].filter((r) => r.idempotent === false);
    expect(dup).toHaveLength(1);
    expect(ins).toHaveLength(1);
    expect(dup[0]).toMatchObject({ success: true, idempotent: true, duplicate: true, payment_id: null, commission_created: false });
    expect(newPayments()).toHaveLength(1);
    expect(writesTo('invoice_sales').filter((w) => w.op === 'update')).toHaveLength(1);
    expect(writesTo('accounts_receivable').filter((w) => w.op === 'update')).toHaveLength(1);
    expect(Number(invoice().balance)).toBe(4000000);
  });

  it('replay del webhook tras cobrar el saldo COMPLETO (saldo 0): la RPC responde duplicate, NO amount_exceeds_balance (la comprobación de referencia va antes de validar el saldo)', async () => {
    const input = manual(5000000, 'stripe:evt_full', { method: 'stripe' });
    const [a, b] = await Promise.all([registerCrmPayment(120, input, client()), registerCrmPayment(120, input, client())]);
    const dup = [a, b].find((r) => r.duplicate === true);
    expect(dup).toMatchObject({ success: true, idempotent: true, duplicate: true });
    expect([a, b].every((r) => r.success)).toBe(true);
    expect(Number(invoice().balance)).toBe(0);
    expect(newPayments()).toHaveLength(1);
  });

  it('misma referencia stripe sobre DOS facturas distintas a la vez (sin bloqueo común): el índice único deja un solo pago y el otro recibe duplicate', async () => {
    db.rows.invoice_sales.push({ id: 'inv-2', organization_id: 120, number: 'FACT-0002', total: 100, balance: 100, status: 'issued', currency: 'COP', customer_id: 'c-1', opportunity_id: null, salesperson_id: null, commission_rate: null, commission_type: null });
    const [a, b] = await Promise.all([
      registerCrmPayment(120, manual(100, 'stripe:evt_two', { invoice_id: 'inv-1', method: 'stripe' }), client()),
      registerCrmPayment(120, manual(100, 'stripe:evt_two', { invoice_id: 'inv-2', method: 'stripe' }), client()),
    ]);
    expect([a, b].filter((r) => r.duplicate === true)).toHaveLength(1);
    expect([a, b].filter((r) => r.idempotent === false && r.success)).toHaveLength(1);
    expect(db.rows.payments.filter((p) => p.reference === 'stripe:evt_two')).toHaveLength(1);
  });

  it('referencia ya registrada (secuencial) → idempotent:true con el payment_id existente, sin llamar a la RPC', async () => {
    const first = await registerCrmPayment(120, manual(1000000, 'stripe:evt_1', { method: 'stripe' }), client());
    const again = await registerCrmPayment(120, manual(1000000, 'stripe:evt_1', { method: 'stripe' }), client());
    expect(again).toMatchObject({ success: true, idempotent: true, payment_id: first.payment_id, invoice_status: null });
    expect(again.duplicate).toBeUndefined();
    expect(rpcCalls()).toHaveLength(1);
    expect(Number(invoice().balance)).toBe(4000000);
  });

  it('un 23505 de OTRA restricción (PK) con referencia manual → error, sin duplicate (la RPC lo propaga)', async () => {
    db.nextWriteError = { table: 'payments', error: { code: '23505', message: 'duplicate key value violates unique constraint "payments_new_pkey"' } };
    const r = await registerCrmPayment(120, manual(1, 'manual:pk'), client());
    expect(r.success).toBe(false);
    expect(r.duplicate).toBeUndefined();
    expect(r.message).toMatch(/payments_new_pkey/);
    expect(Number(invoice().balance)).toBe(5000000);
  });
});

describe('A4-5 pertenencia: la organización sale del parámetro', () => {
  it('factura de la org 121 pedida desde la 120 → «Factura no encontrada», sin escrituras y con p_organization_id 120 en la RPC', async () => {
    const r = await registerCrmPayment(120, manual(5, 'ajena', { invoice_id: 'inv-9' }), client());
    expect(r).toMatchObject({ success: false, payment_id: null, invoice_status: null, idempotent: false, message: 'Factura no encontrada' });
    expect(r.code).toBeUndefined();
    expect(db.writes).toEqual([]);
    expect(rpcCalls()[0].args.p_organization_id).toBe(120);
    expect(db.rows.invoice_sales[1]).toMatchObject({ balance: 5, status: 'issued' });
    expect(db.rows.accounts_receivable[1]).toMatchObject({ balance: 5 });
  });

  it('factura inexistente → «Factura no encontrada» sin escrituras', async () => {
    const r = await registerCrmPayment(120, manual(5, 'nadie', { invoice_id: 'inv-404' }), client());
    expect(r).toMatchObject({ success: false, message: 'Factura no encontrada' });
    expect(db.writes).toEqual([]);
  });
});

describe('A4-6 estados y comisión', () => {
  it('pago parcial → factura y cartera partial con el saldo restante; sin comisión', async () => {
    const r = await registerCrmPayment(120, manual(1000000, 'parcial'), client());
    expect(r).toMatchObject({ success: true, invoice_status: 'partial', commission_created: false, idempotent: false });
    expect(invoice()).toMatchObject({ balance: 4000000, status: 'partial' });
    expect(ar()).toMatchObject({ balance: 4000000, status: 'partial' });
    expect(writesTo('commissions')).toEqual([]);
  });

  it('pago completo → paid/paid con saldo 0 y la comisión se devenga (10 % del total = 680.000) con el payment_id en metadata', async () => {
    const r = await registerCrmPayment(120, manual(5000000, 'completo'), client());
    expect(r).toMatchObject({ success: true, invoice_status: 'paid', commission_created: true });
    expect(invoice()).toMatchObject({ balance: 0, status: 'paid' });
    expect(ar()).toMatchObject({ balance: 0, status: 'paid' });
    const comm = writesTo('commissions').find((w) => w.op === 'insert');
    expect(comm?.row).toMatchObject({ organization_id: 120, source_type: 'opportunity', source_id: 'op-1', payee_id: 'u-1', commission_amount: 680000, status: 'accrued' });
    expect((comm?.row?.metadata as Record<string, unknown>).payment_id).toBe(r.payment_id);
  });

  it('el estado paid solo con saldo <= 0: 4.999.999 sobre 5.000.000 deja partial con saldo 1', async () => {
    const r = await registerCrmPayment(120, manual(4999999, 'casi'), client());
    expect(r.invoice_status).toBe('partial');
    expect(invoice()).toMatchObject({ balance: 1, status: 'partial' });
    expect(r.commission_created).toBe(false);
  });

  it('factura sin cartera → se registra igual y no se escribe accounts_receivable', async () => {
    db.rows.accounts_receivable = [];
    const r = await registerCrmPayment(120, manual(1000000, 'sin-ar'), client());
    expect(r.success).toBe(true);
    expect(writesTo('accounts_receivable')).toEqual([]);
    expect(invoice()).toMatchObject({ balance: 4000000, status: 'partial' });
  });
});

describe('A4-9 la BD manda: saldo recalculado por los triggers y cartera sincronizada (nunca restada)', () => {
  it('cartera desincronizada (6.000.000 frente a un saldo de 5.000.000): tras un pago de 1.000.000 la cartera queda IGUAL al saldo de la factura (4.000.000), no 5.000.000', async () => {
    ar().balance = 6000000;
    const r = await registerCrmPayment(120, manual(1000000, 'ar-sync'), client());
    expect(r.success).toBe(true);
    expect(invoice()).toMatchObject({ balance: 4000000, status: 'partial' });
    expect(ar()).toMatchObject({ balance: 4000000, status: 'partial' });
    const arw = writesTo('accounts_receivable');
    expect(arw).toHaveLength(1);
    expect(arw[0].row).toMatchObject({ balance: 4000000 });
  });

  it('dos pagos seguidos: la cartera sigue al saldo de la factura en cada paso (21.800 → 20.800 → 0, nunca 19.800 ni negativo)', async () => {
    Object.assign(invoice(), { total: 21800, balance: 21800 });
    db.rows.payments = [];
    ar().balance = 21800;
    const a = await registerCrmPayment(120, manual(1000, 'p-1000'), client());
    expect(a).toMatchObject({ success: true, invoice_status: 'partial' });
    expect(invoice().balance).toBe(20800);
    expect(ar().balance).toBe(20800);
    const b = await registerCrmPayment(120, manual(20800, 'p-20800'), client());
    expect(b).toMatchObject({ success: true, invoice_status: 'paid' });
    expect(invoice()).toMatchObject({ balance: 0, status: 'paid' });
    expect(ar()).toMatchObject({ balance: 0, status: 'paid' });
  });

  it('saldo obsoleto en la factura (5.000.000 pero ya hay 2.800.000 en pagos): el trigger recalcula desde el total (6.800.000 − 3.800.000 = 3.000.000) y la RPC devuelve ESE valor, no 4.000.000', async () => {
    db.rows.payments.push({ id: 'pay-old', organization_id: 120, source: 'invoice_sales', source_id: 'inv-1', status: 'completed', amount: 1000000, currency: 'COP', reference: 'viejo' });
    const r = await registerCrmPayment(120, manual(1000000, 'nuevo'), client());
    expect(r).toMatchObject({ success: true, invoice_status: 'partial' });
    expect(invoice()).toMatchObject({ balance: 3000000, status: 'partial' });
    expect(ar()).toMatchObject({ balance: 3000000, status: 'partial' });
    expect(rpcCalls()).toHaveLength(1);
  });

  it('el trigger deja la factura en paid (total cubierto por los pagos) aunque saldo − importe diera partial: Node usa el estado releído y devenga la comisión', async () => {
    db.rows.payments.push({ id: 'pay-old', organization_id: 120, source: 'invoice_sales', source_id: 'inv-1', status: 'completed', amount: 4000000, currency: 'COP', reference: 'viejo' });
    const r = await registerCrmPayment(120, manual(1000000, 'ultimo'), client());
    expect(r).toMatchObject({ success: true, invoice_status: 'paid', commission_created: true });
    expect(invoice()).toMatchObject({ balance: 0, status: 'paid' });
    expect(ar()).toMatchObject({ balance: 0, status: 'paid' });
  });

  it('pagos no completed no cuentan para el trigger: uno pending de 1.000.000 no descuenta', async () => {
    db.rows.payments.push({ id: 'pay-pend', organization_id: 120, source: 'invoice_sales', source_id: 'inv-1', status: 'pending', amount: 1000000, currency: 'COP', reference: 'pendiente' });
    await registerCrmPayment(120, manual(1000000, 'nuevo'), client());
    expect(invoice().balance).toBe(4000000);
  });

  it('respaldo: factura en draft (el trigger la ignora) → la RPC aplica saldo − importe a mano y la cartera se sincroniza igual por el trigger de invoice_sales', async () => {
    invoice().status = 'draft';
    const r = await registerCrmPayment(120, manual(1000000, 'draft-pay'), client());
    expect(r).toMatchObject({ success: true, invoice_status: 'partial' });
    expect(invoice()).toMatchObject({ balance: 4000000, status: 'partial' });
    expect(ar()).toMatchObject({ balance: 4000000, status: 'partial' });
    expect(writesTo('invoice_sales')).toHaveLength(1);
    expect(writesTo('accounts_receivable')).toHaveLength(1);
  });
});

describe('A4-7 mapeo de errores de la RPC (P0001 con MESSAGE/DETAIL) al contrato de Node', () => {
  it('amount_exceeds_balance → success:false, invoice_status del DETAIL y el mensaje de siempre', async () => {
    const r = await registerCrmPayment(120, manual(10, 'm1'), rpcStub({ error: { code: 'P0001', message: 'amount_exceeds_balance', details: '{"amount":10,"balance":5,"status":"issued"}' } }));
    expect(r).toMatchObject({ success: false, payment_id: null, invoice_status: 'issued', idempotent: false, commission_created: false });
    expect(r.message).toBe('El monto del pago (10) excede el balance pendiente (5)');
    expect(r.code).toBeUndefined();
  });

  it('invoice_not_found → «Factura no encontrada»', async () => {
    const r = await registerCrmPayment(120, manual(10, 'm2'), rpcStub({ error: { code: 'P0001', message: 'invoice_not_found', details: '{}' } }));
    expect(r).toMatchObject({ success: false, invoice_status: null, message: 'Factura no encontrada' });
  });

  it('invalid_amount → INVALID_AMOUNT / 400 (defensa en profundidad aunque Node ya lo valide)', async () => {
    const r = await registerCrmPayment(120, manual(10, 'm3'), rpcStub({ error: { code: 'P0001', message: 'invalid_amount', details: '{"amount":"10"}' } }));
    expect(r).toMatchObject({ success: false, code: 'INVALID_AMOUNT', http_status: 400 });
  });

  it('currency_mismatch → CURRENCY_MISMATCH / 400 con ambas monedas en el mensaje', async () => {
    const r = await registerCrmPayment(120, manual(10, 'm4'), rpcStub({ error: { code: 'P0001', message: 'currency_mismatch', details: '{"payment_currency":"COP","invoice_currency":"USD"}' } }));
    expect(r).toMatchObject({ success: false, code: 'CURRENCY_MISMATCH', http_status: 400 });
    expect(r.message).toMatch(/\(COP\).*\(USD\)/);
  });

  it('23505 del índice stripe que llegue como error de la RPC (no capturado) → duplicate:true por isStripeReferenceDuplicate; con referencia manual → error', async () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "uq_payments_org_stripe_reference"' };
    const dup = await registerCrmPayment(120, manual(10, 'stripe:evt_x'), rpcStub({ error: err }));
    expect(dup).toMatchObject({ success: true, idempotent: true, duplicate: true, payment_id: null });
    const ko = await registerCrmPayment(120, manual(10, 'manual:x'), rpcStub({ error: err }));
    expect(ko.success).toBe(false);
    expect(ko.duplicate).toBeUndefined();
  });

  it('error desconocido (timeout, RLS) → success:false con el mensaje del proveedor; DETAIL malformado no rompe', async () => {
    const r = await registerCrmPayment(120, manual(10, 'm5'), rpcStub({ error: { code: '57014', message: 'canceling statement due to statement timeout' } }));
    expect(r).toMatchObject({ success: false, payment_id: null, idempotent: false });
    expect(r.message).toMatch(/Error registrando pago: canceling statement/);
    const bad = await registerCrmPayment(120, manual(10, 'm6'), rpcStub({ error: { code: 'P0001', message: 'amount_exceeds_balance', details: 'no-json' } }));
    expect(bad.success).toBe(false);
    expect(bad.message).toMatch(/excede/);
  });

  it('respuesta sin data ni error (función ausente en BD tras un rollback parcial) → success:false, no se devenga comisión', async () => {
    const r = await registerCrmPayment(120, manual(5000000, 'm7'), rpcStub({ data: null }));
    expect(r).toMatchObject({ success: false, payment_id: null, commission_created: false });
    expect(writesTo('commissions')).toEqual([]);
  });

  it('duplicate:true devuelto por la RPC → contrato de duplicado y sin comisión', async () => {
    const r = await registerCrmPayment(120, manual(5000000, 'stripe:evt_d'), rpcStub({ data: { payment_id: null, new_balance: 5000000, invoice_status: 'partial', duplicate: true } }));
    expect(r).toMatchObject({ success: true, idempotent: true, duplicate: true, payment_id: null, commission_created: false });
  });
});

describe('A4-8 guardarraíl de la migración (texto)', () => {
  const root = path.resolve(__dirname, '../../../../..');
  const mig = readFileSync(path.join(root, 'supabase/migrations/20260916050000_f10_fn_register_crm_payment.sql'), 'utf8');
  const rb = readFileSync(path.join(root, 'supabase/rollbacks/20260916050000_f10_fn_register_crm_payment_rollback.sql'), 'utf8');
  const svc = readFileSync(path.join(root, 'src/lib/services/crm/paymentService.ts'), 'utf8');
  const flat = mig.replace(/\s+/g, ' ');

  it('bloquea la factura con FOR UPDATE filtrando por id Y organization_id', () => {
    expect(flat).toMatch(/FROM public\.invoice_sales WHERE id = p_invoice_id AND organization_id = p_organization_id FOR UPDATE;/);
  });

  it('SECURITY INVOKER con search_path fijado; nunca DEFINER', () => {
    expect(mig).toMatch(/SECURITY INVOKER/);
    expect(mig).toMatch(/SET search_path = public/);
    expect(mig).not.toMatch(/SECURITY DEFINER/);
  });

  it('REVOKE a PUBLIC y anon; GRANT solo a authenticated y service_role', () => {
    expect(flat).toMatch(/REVOKE ALL ON FUNCTION public\.fn_register_crm_payment\([^)]*\) FROM PUBLIC, anon;/);
    expect(flat).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_register_crm_payment\([^)]*\) TO authenticated, service_role;/);
    expect(flat).not.toMatch(/GRANT[^;]*\banon\b/);
  });

  it('los cuatro errores propios con ERRCODE P0001 y el duplicado por el índice exacto', () => {
    for (const code of ['invoice_not_found', 'invalid_amount', 'amount_exceeds_balance', 'currency_mismatch']) {
      expect(mig).toMatch(new RegExp(`ERRCODE = 'P0001', MESSAGE = '${code}'`));
    }
    expect(mig).toMatch(/EXCEPTION WHEN unique_violation THEN/);
    // el replay se detecta bajo el bloqueo y ANTES de validar el saldo
    expect(flat.indexOf("IF p_reference LIKE 'stripe:%' AND EXISTS")).toBeGreaterThan(flat.indexOf('FOR UPDATE;'));
    expect(flat.indexOf("IF p_reference LIKE 'stripe:%' AND EXISTS")).toBeLessThan(flat.indexOf('IF p_amount > v_balance THEN'));
    expect(mig).toMatch(/v_constraint = 'uq_payments_org_stripe_reference'/);
    expect(flat).toMatch(/'duplicate', true/);
  });

  it('valida contra el saldo (no el total), y paid solo con saldo <= 0', () => {
    expect(mig).toMatch(/IF p_amount > v_balance THEN/);
    expect(mig).not.toMatch(/p_amount > v_invoice\.total/);
    expect(mig).toMatch(/CASE WHEN v_new_balance <= 0 THEN 'paid' ELSE 'partial' END/);
  });

  it('NUNCA escribe accounts_receivable (la cartera la sincronizan los triggers, nombrados en la cabecera) y relee la factura tras el INSERT', () => {
    expect(mig).not.toMatch(/UPDATE public\.accounts_receivable/);
    expect(mig).not.toMatch(/UPDATE accounts_receivable/);
    expect(mig).not.toMatch(/INSERT INTO public\.accounts_receivable/);
    expect(mig).toMatch(/trg_recalc_invoice_balance_from_payments/);
    expect(mig).toMatch(/tr_update_accounts_receivable_on_payment/);
    expect(mig).toMatch(/tr_update_account_receivable\b/);
    // relectura en la misma transacción, después del INSERT y antes del respaldo
    const reread = flat.indexOf('SELECT balance, status INTO v_new_balance, v_new_status FROM public.invoice_sales WHERE id = p_invoice_id AND organization_id = p_organization_id;');
    expect(reread).toBeGreaterThan(flat.indexOf('RETURNING id INTO v_payment_id;'));
    expect(reread).toBeLessThan(flat.indexOf('IF v_new_balance IS NOT DISTINCT FROM v_invoice.balance THEN'));
    // el UPDATE manual de la factura existe solo como respaldo dentro de ese IF
    const upd = flat.indexOf('UPDATE public.invoice_sales SET balance = v_new_balance, status = v_new_status, updated_at = now() WHERE id = p_invoice_id AND organization_id = p_organization_id;');
    expect(upd).toBeGreaterThan(flat.indexOf('IF v_new_balance IS NOT DISTINCT FROM v_invoice.balance THEN'));
    expect((mig.match(/UPDATE public\.invoice_sales/g) ?? []).length).toBe(1);
    expect(rb).toMatch(/DROP FUNCTION IF EXISTS public\.fn_register_crm_payment\(integer, uuid, numeric, text, text, text, timestamptz, jsonb, uuid, integer\);/);
  });

  it('sin credenciales ni nombres de organizaciones cliente en los .sql', () => {
    for (const s of [mig, rb]) {
      expect(s).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
      expect(s).not.toMatch(/sk_(live|test)_/i);
      expect(s).not.toMatch(/[\x00-\x08\x0b\x0c\x0e-\x1f]/);
    }
  });

  it('paymentService.ts ya no escribe invoice_sales/accounts_receivable ni inserta en payments desde Node: solo la RPC (regla 7)', () => {
    expect(svc).toMatch(/\.rpc\('fn_register_crm_payment'/);
    expect(svc).not.toMatch(/\.from\('accounts_receivable'\)/);
    expect(svc).not.toMatch(/\.from\('payments'\)\s*\.insert\(/);
    // invoice_sales solo se LEE (para la comisión); ningún update desde Node
    const flatSvc = svc.replace(/\s+/g, ' ');
    expect(flatSvc).not.toMatch(/\.from\('invoice_sales'\) \.update\(/);
    expect(flatSvc).not.toMatch(/\.from\('invoice_sales'\) \.insert\(/);
    expect((svc.match(/\.from\('invoice_sales'\)/g) ?? []).length).toBe(1);
    expect(svc).not.toMatch(/balance: newBalance/);
    expect(svc).toMatch(/isStripeReferenceDuplicate\(payError, data\.reference\)/);
  });
});
