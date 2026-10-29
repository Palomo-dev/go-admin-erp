import { reembolsarPedidoWeb } from '@/lib/services/webOrderRefund';
import { crearNotaCreditoPedidoWeb } from '@/lib/services/webOrderCreditNote';

jest.mock('@/lib/services/webOrderCreditNote', () => ({ crearNotaCreditoPedidoWeb: jest.fn() }));
const nc = crearNotaCreditoPedidoWeb as jest.Mock;

type Rpc = { name: string; args: Record<string, unknown> };

function db(reserva: unknown, opts: { order?: Record<string, unknown>; rpcError?: { message: string; code?: string } } = {}) {
  const rpcs: Rpc[] = [];
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const order = { id: 'o1', order_number: 'WO-1', organization_id: 1, branch_id: 2, payment_status: 'paid', total: 100000, internal_notes: null, customer_id: null, sale_id: null,
    items: [{ product_id: 7, quantity: 2 }], ...opts.order };
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    q.select = () => q; q.eq = () => q;
    q.single = async () => ({ data: order, error: null });
    q.maybeSingle = async () => ({ data: null, error: null });
    q.update = (values: Record<string, unknown>) => { updates.push({ table, values }); return q; };
    return q;
  };
  const client = {
    from: (t: string) => chain(t),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      if (name === 'fn_web_order_reembolso_reservar') return opts.rpcError ? { data: null, error: opts.rpcError } : { data: reserva, error: null };
      return { data: { ok: true }, error: null };
    },
  };
  return { client: client as never, rpcs, updates };
}

beforeEach(() => { nc.mockReset(); nc.mockResolvedValue({ originalInvoice: null, creditNoteId: 'nc1', creditNoteNumber: 'NC-1' }); });

describe('reembolsarPedidoWeb · tope', () => {
  it('rechaza con 409 y mensaje en español si excede el saldo, sin nota crédito', async () => {
    const d = db({ ok: false, error: 'EXCEDE_SALDO', disponible: 40000, reembolsado: 60000, solicitado: 50000 });
    const r = await reembolsarPedidoWeb(d.client, 'o1', { amount: 50000 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('EXCEDE_SALDO');
    expect(String(r.body.error)).toMatch(/supera lo que queda por reembolsar/);
    expect(String(r.body.error)).toMatch(/40\.000/);
    expect(nc).not.toHaveBeenCalled();
  });

  it('sin saldo → 409 SIN_SALDO', async () => {
    const r = await reembolsarPedidoWeb(db({ ok: false, error: 'SIN_SALDO', disponible: 0 }).client, 'o1', { amount: 1 });
    expect(r.status).toBe(409);
  });

  it('parcial dentro del saldo: nota por el monto reservado, sin devolver stock, cierra done', async () => {
    const d = db({ ok: true, refund_id: 'r1', monto: 30000, completo: false, reembolsado_antes: 0, restante: 70000 });
    const r = await reembolsarPedidoWeb(d.client, 'o1', { amount: 30000 });
    expect(r.status).toBe(200);
    expect(nc.mock.calls[0][2]).toMatchObject({ isFullRefund: false, monto: 30000 });
    expect(d.rpcs.filter((x) => x.name === 'fn_stock_entrada_al_costo')).toHaveLength(0);
    expect(d.rpcs.at(-1)).toEqual({ name: 'fn_web_order_reembolso_cerrar', args: { p_refund_id: 'r1', p_ok: true, p_credit_note_id: 'nc1' } });
    expect(r.body).toMatchObject({ refundAmount: 30000, isFullRefund: false, restante: 70000 });
  });

  it('el reembolso que agota el saldo tras parciales hace nota parcial por el resto y no devuelve todo el stock', async () => {
    const d = db({ ok: true, refund_id: 'r2', monto: 70000, completo: true, reembolsado_antes: 30000, restante: 0 });
    const r = await reembolsarPedidoWeb(d.client, 'o1', {});
    expect(nc.mock.calls[0][2]).toMatchObject({ isFullRefund: false, monto: 70000 });
    expect(d.rpcs.filter((x) => x.name === 'fn_stock_entrada_al_costo')).toHaveLength(0);
    expect(r.body.isFullRefund).toBe(true);
  });

  it('reembolso total único: nota total y devuelve el stock de todo el pedido', async () => {
    const d = db({ ok: true, refund_id: 'r3', monto: 100000, completo: true, reembolsado_antes: 0, restante: 0 });
    await reembolsarPedidoWeb(d.client, 'o1', {});
    expect(nc.mock.calls[0][2]).toMatchObject({ isFullRefund: true, monto: 100000 });
    expect(d.rpcs.filter((x) => x.name === 'fn_stock_entrada_al_costo')).toHaveLength(1);
    // El estado refunded lo pone SQL; la ruta no lo escribe a mano.
    expect(d.updates.some((u) => u.values.payment_status)).toBe(false);
  });

  it('si la nota crédito falla, libera el saldo (cerrar failed) y propaga el error', async () => {
    nc.mockRejectedValueOnce(new Error('boom'));
    const d = db({ ok: true, refund_id: 'r4', monto: 10000, completo: false, reembolsado_antes: 0, restante: 90000 });
    await expect(reembolsarPedidoWeb(d.client, 'o1', { amount: 10000 })).rejects.toThrow('boom');
    expect(d.rpcs.at(-1)).toEqual({ name: 'fn_web_order_reembolso_cerrar', args: { p_refund_id: 'r4', p_ok: false, p_credit_note_id: null } });
  });

  it('reintento con la misma referencia no duplica', async () => {
    const r = await reembolsarPedidoWeb(db({ ok: true, ya_registrado: true, refund_id: 'r1', monto: 30000 }).client, 'o1', { amount: 30000, reference: 'wompi-1' });
    expect(r.body.alreadyProcessed).toBe(true);
    expect(nc).not.toHaveBeenCalled();
  });

  it.each(['42P01', '42883', 'PGRST202'])('sin la migración (%s): parcial con el comportamiento anterior, no cancela, avisa en el log', async (code) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const d = db(null, { rpcError: { code, message: 'no existe' } });
    const r = await reembolsarPedidoWeb(d.client, 'o1', { amount: 30000 });
    expect(r.status).toBe(200);
    expect(nc.mock.calls[0][2]).toMatchObject({ isFullRefund: false, monto: 30000 });
    expect(d.updates.some((u) => u.values.payment_status)).toBe(false);
    expect(d.updates.some((u) => String(u.values.internal_notes ?? '').includes('REEMBOLSO PARCIAL'))).toBe(true);
    expect(d.rpcs.some((x) => x.name === 'fn_web_order_reembolso_cerrar')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('20261028220000'));
    expect(r.body.aviso).toMatch(/sin tope/);
    warn.mockRestore();
  });

  it('sin la migración: total como antes (refunded/cancelled y devuelve stock)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const d = db(null, { rpcError: { code: '42883', message: 'no existe' } });
    const r = await reembolsarPedidoWeb(d.client, 'o1', {});
    expect(nc.mock.calls[0][2]).toMatchObject({ isFullRefund: true, monto: 100000 });
    expect(d.updates.some((u) => u.values.payment_status === 'refunded' && u.values.status === 'cancelled')).toBe(true);
    expect(d.rpcs.filter((x) => x.name === 'fn_stock_entrada_al_costo')).toHaveLength(1);
    expect(r.body.isFullRefund).toBe(true);
  });

  it('otro error de la reserva ⇒ 500, no reembolsa', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = await reembolsarPedidoWeb(db(null, { rpcError: { code: '57014', message: 'timeout' } }).client, 'o1', { amount: 1000 });
    expect(r.status).toBe(500);
    expect(nc).not.toHaveBeenCalled();
  });

  it('ya reembolsado → 200 idempotente sin llamar la reserva', async () => {
    const d = db(null, { order: { payment_status: 'refunded' } });
    const r = await reembolsarPedidoWeb(d.client, 'o1', {});
    expect(r.body.alreadyRefunded).toBe(true);
    expect(d.rpcs).toHaveLength(0);
  });

  it('monto negativo → 400', async () => {
    expect((await reembolsarPedidoWeb(db(null).client, 'o1', { amount: -5 })).status).toBe(400);
  });
});
