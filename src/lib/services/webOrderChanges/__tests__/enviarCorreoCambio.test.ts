jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('@/lib/services/taxResolverCore', () => ({ resolveLineTaxWith: jest.fn() }));
jest.mock('@/lib/services/webOrderCreditNote', () => ({ crearNotaCreditoPedidoWeb: jest.fn() }));
jest.mock('@/lib/services/integrations/wompi/wompiService', () => ({ wompiService: {} }));
jest.mock('@/lib/services/integrations/bold', () => ({ boldService: {} }));
jest.mock('@/lib/services/integrations/qrShared/qrSessionService', () => ({ createQrSession: jest.fn() }));
jest.mock('@/lib/services/integrations/qrShared/cobroQrServidor', () => ({ MONEDA_RIELES_QR: 'COP' }));
jest.mock('@/lib/services/integrations/qrShared/paymentConfirmation', () => ({ WEB_ORDER_CHANGE_SOURCE: 'web_order_change' }));
jest.mock('@/lib/utils/zonaHorariaServidor', () => ({ zonaHorariaEnServidor: jest.fn(async () => 'America/Lima') }));
const envioMaster = jest.fn(async () => ({ data: { id: 'msg_master' }, error: null }));
const envioOrg = jest.fn(async () => ({ data: { id: 'msg_org' }, error: null }));
jest.mock('@/lib/services/crm/email/resendClient', () => ({
  getMasterResend: jest.fn(() => ({ emails: { send: envioMaster } })),
  getMasterResendKey: jest.fn(() => 're_test'),
  getResendClient: jest.fn(() => ({ emails: { send: envioOrg } })),
}));
jest.mock('@/lib/services/crm/email/domainsService', () => ({ resolveSender: jest.fn() }));

import { enviarCorreoCambio, enmascararCorreo } from '../webOrderChangesServer';
import { resolveSender } from '@/lib/services/crm/email/domainsService';
import { fakeDb } from './fakeDb';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import type { SupabaseClient } from '@supabase/supabase-js';

const ctx = { userId: 'u1', organizationId: 7, roleId: 2, isSuperAdmin: false, supabase: {} } as unknown as ServerOrgContext;
const mockResolve = resolveSender as jest.Mock;

function db(extraCambio: Record<string, unknown> = {}, fallo?: Parameters<typeof fakeDb>[2]) {
  return fakeDb(
    {
      web_orders: [{ id: 'o1', organization_id: 7, order_number: 'WO-1', customer_email: 'laura@cliente.com', customer_name: 'Laura', branch_id: 2, internal_notes: 'previa', items: [] }],
      web_order_changes: [{ id: 'ch1-abcdef', organization_id: 7, web_order_id: 'o1', estado: 'pending_payment', delta_total: 5000, payment_link_url: 'https://pay/x', expires_at: null, ...extraCambio }],
      organizations: [{ id: 7, name: 'Hogar Plástico' }],
      email_domains: [{ organization_id: 7, reply_to: 'tienda@gmail.com', is_default: false }],
      ops_audit_log: [],
    },
    () => ({ data: null, error: null }),
    fallo,
  );
}
const comoDb = (d: ReturnType<typeof fakeDb>) => d as unknown as SupabaseClient;

beforeEach(() => {
  jest.clearAllMocks();
  mockResolve.mockResolvedValue({ mode: 'global', domain: null, fromEmail: 'x@goadmin.io', replyTo: null, apiKey: 're_test' });
});

it('enmascara el correo', () => {
  expect(enmascararCorreo('laura@Cliente.com')).toBe('l***@cliente.com');
  expect(enmascararCorreo('malo')).toBe('***');
});

it('guarda el rastro, la nota y el audit log, y lo devuelve', async () => {
  const d = db({ email_sent_count: 1 });
  const r = await enviarCorreoCambio(ctx, 'ch1-abcdef', comoDb(d));
  expect(r).toMatchObject({ ok: true, email_sent_count: 2, email_message_id: 'msg_master', email_sent_to_masked: 'l***@cliente.com', rastro: true });
  const up = d.llamadas.find((l) => l.tabla === 'web_order_changes' && l.op === 'update');
  expect(up?.valores).toMatchObject({ email_sent_count: 2, email_message_id: 'msg_master', email_sent_to_masked: 'l***@cliente.com' });
  const nota = d.llamadas.find((l) => l.tabla === 'web_orders' && l.op === 'update');
  expect(String(nota?.valores?.internal_notes)).toMatch(/^previa\n\[CORREO CAMBIO .*l\*\*\*@cliente\.com \(envío 2\)\.$/);
  expect(String(nota?.valores?.internal_notes)).not.toContain('laura@');
  const audit = d.llamadas.find((l) => l.tabla === 'ops_audit_log');
  expect(audit?.valores).toMatchObject({ action: 'WEB_ORDER_CHANGE_EMAIL_SENT', entity_id: 'o1', user_id: 'u1', metadata: expect.objectContaining({ to_masked: 'l***@cliente.com', count: 2 }) });
});

it.each(['42703', 'PGRST204'])('sin columnas (%s) el correo sale igual y avisa en el log', async (code) => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const d = db({}, (t, op) => (t === 'web_order_changes' && op === 'update' ? { code, message: 'column does not exist' } : null));
  const r = await enviarCorreoCambio(ctx, 'ch1-abcdef', comoDb(d));
  expect(envioMaster).toHaveBeenCalledTimes(1);
  expect(r).toMatchObject({ ok: true, rastro: false, email_sent_count: 1 });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('20261028230000'));
  expect(d.llamadas.some((l) => l.tabla === 'ops_audit_log')).toBe(true);
  warn.mockRestore();
});

it('con dominio verificado sale desde la tienda con su reply-to', async () => {
  mockResolve.mockResolvedValue({
    mode: 'org', domain: { domain: 'tienda.store', from_name: 'Otra' }, fromEmail: 'pedidos@tienda.store', replyTo: 'tienda@gmail.com', apiKey: 're_org',
  });
  const r = await enviarCorreoCambio(ctx, 'ch1-abcdef', comoDb(db()));
  expect(envioMaster).not.toHaveBeenCalled();
  expect(envioOrg).toHaveBeenCalledWith(expect.objectContaining({ from: 'Hogar Plástico <pedidos@tienda.store>', replyTo: 'tienda@gmail.com', to: 'laura@cliente.com' }));
  expect(r).toMatchObject({ from_domain: 'tienda.store', email_message_id: 'msg_org' });
});

it('sin dominio verificado usa la plataforma y el reply-to registrado de la tienda', async () => {
  const prev = process.env.EMAIL_FROM_ADDRESS;
  process.env.EMAIL_FROM_ADDRESS = 'servicio@goadmin.io';
  const r = await enviarCorreoCambio(ctx, 'ch1-abcdef', comoDb(db()));
  expect(envioMaster).toHaveBeenCalledWith(expect.objectContaining({ from: 'Hogar Plástico <servicio@goadmin.io>', replyTo: 'tienda@gmail.com' }));
  expect(r).toMatchObject({ from_domain: null });
  process.env.EMAIL_FROM_ADDRESS = prev;
});

it('si resolver el remitente falla, cae al respaldo', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockResolve.mockRejectedValue(new Error('NO_SENDER'));
  await enviarCorreoCambio(ctx, 'ch1-abcdef', comoDb(db()));
  expect(envioMaster).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
