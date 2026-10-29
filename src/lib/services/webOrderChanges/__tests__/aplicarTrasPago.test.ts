const estado: { cambio: Record<string, unknown> | null; rpc: jest.Mock } = { cambio: null, rpc: jest.fn() };
jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: estado.cambio, error: null }) };
      return q;
    },
    rpc: estado.rpc,
  }),
}));
jest.mock('@/lib/services/integrations/qrShared/autoReconciliation', () => ({ autoMatchFromWebhook: jest.fn() }));

import { aplicarCambioPedidoTrasPago, WEB_ORDER_CHANGE_SOURCE } from '@/lib/services/integrations/qrShared/paymentConfirmation';

describe('aplicarCambioPedidoTrasPago (webhook)', () => {
  beforeEach(() => estado.rpc.mockReset());
  const sesion = { source: WEB_ORDER_CHANGE_SOURCE, source_id: 'ch1', reference: 'CHG-1', organization_id: 7 };

  it('ignora sesiones que no son de un cambio', async () => {
    expect(await aplicarCambioPedidoTrasPago({ source: 'pos_sale', source_id: 'x' }, 'p1')).toEqual({ ok: true });
    expect(estado.rpc).not.toHaveBeenCalled();
  });

  it('aplica con el pago de la pasarela', async () => {
    estado.cambio = { id: 'ch1', organization_id: 7, estado: 'pending_payment' };
    estado.rpc.mockResolvedValue({ data: { ok: true, ya_aplicado: false }, error: null });
    expect(await aplicarCambioPedidoTrasPago(sesion, 'p1')).toEqual({ ok: true, yaAplicado: false });
    expect(estado.rpc).toHaveBeenCalledWith('fn_web_order_change_aplicar', expect.objectContaining({ p_change_id: 'ch1', p_payment_id: 'p1', p_provider_reference: 'CHG-1' }));
  });

  it('webhook repetido: ya aplicado ⇒ no llama a la función', async () => {
    estado.cambio = { id: 'ch1', organization_id: 7, estado: 'applied' };
    expect(await aplicarCambioPedidoTrasPago(sesion, 'p1')).toEqual({ ok: true, yaAplicado: true });
    expect(estado.rpc).not.toHaveBeenCalled();
  });

  it('carrera: la función responde ya_aplicado', async () => {
    estado.cambio = { id: 'ch1', organization_id: 7, estado: 'pending_payment' };
    estado.rpc.mockResolvedValue({ data: { ok: true, ya_aplicado: true }, error: null });
    expect((await aplicarCambioPedidoTrasPago(sesion, 'p1')).yaAplicado).toBe(true);
  });

  it('sesión de otra organización ⇒ error, no aplica', async () => {
    estado.cambio = { id: 'ch1', organization_id: 8, estado: 'pending_payment' };
    expect((await aplicarCambioPedidoTrasPago(sesion, 'p1')).ok).toBe(false);
    expect(estado.rpc).not.toHaveBeenCalled();
  });

  it('error de la función se propaga para que el webhook reintente', async () => {
    estado.cambio = { id: 'ch1', organization_id: 7, estado: 'pending_payment' };
    estado.rpc.mockResolvedValue({ data: null, error: { message: 'CAMBIO_CERRADO' } });
    expect(await aplicarCambioPedidoTrasPago(sesion, 'p1')).toMatchObject({ ok: false, error: expect.stringContaining('CAMBIO_CERRADO') });
  });
});
