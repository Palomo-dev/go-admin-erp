jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('@/lib/services/taxResolverCore', () => ({ resolveLineTaxWith: jest.fn(async () => ({ tax_rate: 19 })) }));
jest.mock('@/lib/services/webOrderCreditNote', () => ({ crearNotaCreditoPedidoWeb: jest.fn(async () => ({ creditNoteId: 'nc-1', creditNoteNumber: 'NC-1', originalInvoice: null })) }));
jest.mock('@/lib/services/integrations/wompi/wompiService', () => ({
  wompiService: { getCredentials: jest.fn(async () => ({ privateKey: 'x' })), createPaymentLink: jest.fn(async () => ({ id: 'lnk_1', url: 'https://checkout.wompi.co/l/lnk_1' })), deactivatePaymentLink: jest.fn(async () => true) },
}));
jest.mock('@/lib/services/integrations/bold', () => ({ boldService: { createPaymentLink: jest.fn() } }));
jest.mock('@/lib/services/integrations/qrShared/qrSessionService', () => ({ createQrSession: jest.fn(async () => ({ id: 'ses-1' })) }));
jest.mock('@/lib/services/integrations/qrShared/cobroQrServidor', () => ({ MONEDA_RIELES_QR: 'COP' }));
jest.mock('@/lib/services/integrations/qrShared/paymentConfirmation', () => ({ WEB_ORDER_CHANGE_SOURCE: 'web_order_change' }));
jest.mock('@/lib/services/crm/email/resendClient', () => ({ getMasterResend: jest.fn(), getMasterResendKey: jest.fn(() => null) }));

import { aplicarCambio, crearCambio, cancelarCambio, CambioPedidoError, desactivarLinkCambio, colorDeMarca } from '../webOrderChangesServer';
import { crearNotaCreditoPedidoWeb } from '@/lib/services/webOrderCreditNote';
import { wompiService } from '@/lib/services/integrations/wompi/wompiService';
import { createQrSession } from '@/lib/services/integrations/qrShared/qrSessionService';
import { fakeDb } from './fakeDb';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import type { SupabaseClient } from '@supabase/supabase-js';

const ctx = (permisos: string[], roleId = 5): ServerOrgContext =>
  ({
    userId: 'u1', organizationId: 7, roleId, isSuperAdmin: false,
    supabase: { rpc: async (_: string, a: { p_code: string }) => ({ data: permisos.includes(a.p_code), error: null }) },
  }) as unknown as ServerOrgContext;

const pedido = () => ({
  id: 'o1', organization_id: 7, order_number: 'WO-1', status: 'confirmed', payment_status: 'paid', payment_method: 'card',
  subtotal: 20000, tax_total: 3193.28, discount_total: 0, delivery_fee: 0, tip_amount: 0, total: 20000, delivery_type: 'pickup',
  customer_id: 'c1', branch_id: 2, items: [{ product_id: 1, quantity: 2, unit_price: 10000 }],
});

function db(cambio: Record<string, unknown> | null, rpcResp: Record<string, unknown> = {}) {
  return fakeDb(
    {
      web_orders: [pedido()],
      web_order_changes: cambio ? [cambio] : [],
      products: [{ id: 1, name: 'Café', sku: 'C1', status: 'active', organization_id: 7 }, { id: 2, name: 'Pan', sku: 'P2', status: 'active', organization_id: 7 }],
      product_prices: [{ product_id: 1, price: 12000, effective_from: '2020-01-01' }, { product_id: 2, price: 5000, effective_from: '2020-01-01' }],
      integration_connectors: [{ id: 'k1', code: 'wompi_co' }],
      integration_connections: [{ id: 'cx1', connector_id: 'k1', status: 'connected', organization_id: 7 }],
      organization_payment_methods: [],
      organizations: [{ id: 7, name: 'Café Luna' }],
    },
    (fn) => ({ data: rpcResp[fn] ?? { ok: true }, error: null }),
  );
}
const comoDb = (d: ReturnType<typeof fakeDb>) => d as unknown as SupabaseClient;

describe('permisos', () => {
  it('sin pos.web_order.change ⇒ 403 al crear, aplicar y cancelar', async () => {
    const d = db({ id: 'ch1', organization_id: 7, web_order_id: 'o1', estado: 'draft', delta_total: 1000 });
    for (const p of [
      crearCambio(ctx([]), 'o1', { items: [{ product_id: 1, quantity: 1 }] }, comoDb(d)),
      aplicarCambio(ctx([]), 'ch1', {}, comoDb(d)),
      cancelarCambio(ctx([]), 'ch1', comoDb(d)),
    ]) {
      await expect(p).rejects.toMatchObject({ status: 403, code: 'SIN_PERMISO' });
    }
    expect(d.rpcs).toHaveLength(0);
  });

  it('rol administrador (1/2) no necesita el permiso explícito', async () => {
    const d = db(null);
    const r = await crearCambio(ctx([], 2), 'o1', { items: [{ product_id: 1, quantity: 2 }], soloCotizar: true }, comoDb(d));
    expect(r.cotizacion.delta.total).toBe(0);
  });

  it('diferencia a favor exige además pos.refund', async () => {
    const d = db({ id: 'ch1', organization_id: 7, web_order_id: 'o1', estado: 'draft', delta_total: -10000 });
    await expect(aplicarCambio(ctx(['pos.web_order.change']), 'ch1', {}, comoDb(d))).rejects.toMatchObject({ status: 403 });
    expect(d.rpcs.find((r) => r.fn === 'fn_web_order_change_aplicar')).toBeUndefined();
  });
});

describe('crear', () => {
  const p = ['pos.web_order.change'];
  it('cotiza con precio vigente lo adicional y llama a la función con los ítems', async () => {
    const d = db(null, { fn_web_order_change_crear: { ok: true, change_id: 'ch9' } });
    // El fake no inserta: tras crear, la relectura no encuentra el cambio; basta con ver la llamada.
    await expect(crearCambio(ctx(p), 'o1', { items: [{ product_id: 1, quantity: 3 }] }, comoDb(d))).rejects.toMatchObject({ code: 'CAMBIO_NO_ENCONTRADO' });
    const llamada = d.rpcs.find((r) => r.fn === 'fn_web_order_change_crear');
    expect(llamada?.args.p_items).toEqual([expect.objectContaining({ product_id: 1, quantity: 3 })]);
    expect((llamada?.args.p_totales as { total: number }).total).toBe(32000);
  });
  it('sin stock ⇒ 409 con faltantes', async () => {
    const d = db(null, { fn_web_order_change_crear: { ok: false, error: 'STOCK_INSUFICIENTE', shortages: [{ product_id: 1 }] } });
    await expect(crearCambio(ctx(p), 'o1', { items: [{ product_id: 1, quantity: 9 }] }, comoDb(d))).rejects.toMatchObject({ status: 409, code: 'STOCK_INSUFICIENTE', extra: { shortages: [{ product_id: 1 }] } });
  });
  it('producto de otra organización ⇒ 400', async () => {
    const d = db(null);
    await expect(crearCambio(ctx(p), 'o1', { items: [{ product_id: 99, quantity: 1 }] }, comoDb(d))).rejects.toMatchObject({ status: 400, code: 'PRODUCTO_INVALIDO' });
  });
  it('pedido despachado ⇒ 409 sin tocar la BD', async () => {
    const d = fakeDb({ web_orders: [{ ...pedido(), status: 'delivered' }] }, () => ({ data: null, error: null }));
    await expect(crearCambio(ctx(p), 'o1', { items: [{ product_id: 1, quantity: 1 }] }, comoDb(d))).rejects.toMatchObject({ code: 'PEDIDO_DESPACHADO' });
    expect(d.rpcs).toHaveLength(0);
  });
  it('pedido de otra organización ⇒ 404', async () => {
    const d = db(null);
    const otro = { ...ctx(p), organizationId: 8 } as ServerOrgContext;
    await expect(crearCambio(otro, 'o1', { items: [{ product_id: 1, quantity: 1 }] }, comoDb(d))).rejects.toBeInstanceOf(CambioPedidoError);
  });
});

describe('aplicar', () => {
  const p = ['pos.web_order.change', 'pos.refund'];
  beforeEach(() => jest.clearAllMocks());

  it('delta > 0 ⇒ link de Wompi + sesión, sin aplicar todavía', async () => {
    const d = db({ id: 'ch1', organization_id: 7, web_order_id: 'o1', estado: 'draft', delta_total: 12000 });
    const r = await aplicarCambio(ctx(p), 'ch1', {}, comoDb(d));
    expect(r.accion).toBe('link');
    expect(wompiService.createPaymentLink).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amount_in_cents: 1200000 }));
    expect(createQrSession).toHaveBeenCalledWith(expect.objectContaining({ providerCode: 'wompi_link', externalQrId: 'lnk_1', source: 'web_order_change', sourceId: 'ch1', amount: 12000 }));
    expect(r.cambio).toMatchObject({ estado: 'pending_payment', payment_link_url: 'https://checkout.wompi.co/l/lnk_1' });
    expect(d.rpcs.find((x) => x.fn === 'fn_web_order_change_aplicar')).toBeUndefined();
  });

  it('delta > 0 sin pasarela conectada ⇒ 412', async () => {
    const sin = fakeDb({ web_orders: [pedido()], web_order_changes: [{ id: 'ch1', organization_id: 7, web_order_id: 'o1', estado: 'draft', delta_total: 12000 }], integration_connectors: [] }, () => ({ data: null, error: null }));
    await expect(aplicarCambio(ctx(p), 'ch1', {}, comoDb(sin))).rejects.toMatchObject({ status: 412, code: 'SIN_PASARELA_LINK' });
  });

  it('delta < 0 reembolso parcial ⇒ aplica en modo manual y crea nota crédito sin cancelar', async () => {
    const d = db({ id: 'ch1', organization_id: 7, web_order_id: 'o1', estado: 'draft', delta_total: -10000 });
    const r = await aplicarCambio(ctx(p), 'ch1', { reembolso: 'refund' }, comoDb(d));
    expect(r.accion).toBe('aplicado');
    expect(d.rpcs.find((x) => x.fn === 'fn_web_order_change_aplicar')?.args).toMatchObject({ p_refund_mode: 'manual', p_payment_id: null });
    expect(crearNotaCreditoPedidoWeb).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'o1' }), expect.objectContaining({ isFullRefund: false, monto: 10000 }));
    expect(d.llamadas.some((l) => l.tabla === 'web_orders' && l.op === 'update')).toBe(false);
  });

  it('delta < 0 saldo a favor ⇒ customer_credit, sin nota crédito', async () => {
    const d = db({ id: 'ch1', organization_id: 7, web_order_id: 'o1', estado: 'draft', delta_total: -10000 });
    await aplicarCambio(ctx(p), 'ch1', { reembolso: 'customer_credit' }, comoDb(d));
    expect(d.rpcs.find((x) => x.fn === 'fn_web_order_change_aplicar')?.args).toMatchObject({ p_refund_mode: 'customer_credit' });
    expect(crearNotaCreditoPedidoWeb).not.toHaveBeenCalled();
  });

  it('ya aplicado ⇒ idempotente, no vuelve a llamar a la BD', async () => {
    const d = db({ id: 'ch1', organization_id: 7, web_order_id: 'o1', estado: 'applied', delta_total: 5000 });
    const r = await aplicarCambio(ctx(p), 'ch1', {}, comoDb(d));
    expect(r.accion).toBe('ya_aplicado');
    expect(d.rpcs).toHaveLength(0);
  });

  it('con link pendiente no se puede re-aplicar', async () => {
    const d = db({ id: 'ch1', organization_id: 7, web_order_id: 'o1', estado: 'pending_payment', delta_total: 5000 });
    await expect(aplicarCambio(ctx(p), 'ch1', {}, comoDb(d))).rejects.toMatchObject({ status: 409 });
  });
});

describe('desactivar link y color de marca', () => {
  const tablas = (cambio: Record<string, unknown>) => ({
    web_order_changes: [cambio],
    payment_qr_sessions: [{ id: 'ses-1', external_qr_id: 'lnk_1' }],
  });
  const noRpc = () => ({ data: null, error: null });

  it('Wompi: desactiva el link y marca link_disabled_at', async () => {
    const d = fakeDb(tablas({ id: 'ch1', provider_code: 'wompi_link', integration_connection_id: 'cx1', qr_session_id: 'ses-1', link_disabled_at: null }), noRpc);
    expect(await desactivarLinkCambio(d as unknown as SupabaseClient, 'ch1')).toBe('desactivado');
    expect(wompiService.deactivatePaymentLink).toHaveBeenCalledWith(expect.anything(), 'lnk_1');
    expect(d.llamadas.some((l) => l.tabla === 'web_order_changes' && l.op === 'update' && l.valores?.link_disabled_at)).toBe(true);
  });

  it('Bold: no hay API para anular ⇒ no_soportado, sin llamadas', async () => {
    (wompiService.deactivatePaymentLink as jest.Mock).mockClear();
    const d = fakeDb(tablas({ id: 'ch1', provider_code: 'bold_link', integration_connection_id: 'cx1', qr_session_id: 'ses-1', link_disabled_at: null }), noRpc);
    expect(await desactivarLinkCambio(d as unknown as SupabaseClient, 'ch1')).toBe('no_soportado');
    expect(wompiService.deactivatePaymentLink).not.toHaveBeenCalled();
  });

  it('fallo de Wompi no lanza ni marca', async () => {
    (wompiService.deactivatePaymentLink as jest.Mock).mockResolvedValueOnce(false);
    const d = fakeDb(tablas({ id: 'ch1', provider_code: 'wompi_link', integration_connection_id: 'cx1', qr_session_id: 'ses-1', link_disabled_at: null }), noRpc);
    expect(await desactivarLinkCambio(d as unknown as SupabaseClient, 'ch1')).toBe('fallo');
    expect(d.llamadas.some((l) => l.op === 'update')).toBe(false);
  });

  it('color: website_settings primero, luego la organización', async () => {
    const a = fakeDb({ website_settings: [{ organization_id: 7, primary_color: '#112233' }], organizations: [{ id: 7, primary_color: '#999999' }] }, noRpc);
    expect(await colorDeMarca(a as unknown as SupabaseClient, 7)).toBe('#112233');
    const b = fakeDb({ website_settings: [], organizations: [{ id: 7, primary_color: '#999999' }] }, noRpc);
    expect(await colorDeMarca(b as unknown as SupabaseClient, 7)).toBe('#999999');
  });
});
