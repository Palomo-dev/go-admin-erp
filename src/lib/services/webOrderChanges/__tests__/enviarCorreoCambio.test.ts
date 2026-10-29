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

import { EmailError } from '@/lib/services/crm/email/types';

import { enviarCorreoCambio, enmascararCorreo } from '../webOrderChangesServer';
import { resolveSender } from '@/lib/services/crm/email/domainsService';
import { fakeDb } from './fakeDb';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import type { SupabaseClient } from '@supabase/supabase-js';

const ctx = { userId: 'u1', organizationId: 7, roleId: 2, isSuperAdmin: false, supabase: {} } as unknown as ServerOrgContext;
const mockResolve = resolveSender as jest.Mock;

type Rpc = Parameters<typeof fakeDb>[1];
const rpcOk: Rpc = (fn, a) => (fn === 'fn_web_order_change_registrar_correo' ? { data: { ok: true, email_sent_at: '2026-10-29T03:30:00Z', email_sent_count: 3, email_message_id: a.p_message_id, email_sent_to_masked: a.p_to_masked }, error: null } : { data: null, error: null });
const rpcSinFuncion = (code: string): Rpc => () => ({ data: null, error: { code, message: 'function does not exist' } as { message: string } });

function db(extraCambio: Record<string, unknown> = {}, fallo?: Parameters<typeof fakeDb>[2], rpc: Rpc = rpcSinFuncion('42883')) {
  return fakeDb(
    {
      web_orders: [{ id: 'o1', organization_id: 7, order_number: 'WO-1', customer_email: 'laura@cliente.com', customer_name: 'Laura', branch_id: 2, internal_notes: 'previa', items: [] }],
      web_order_changes: [{ id: 'ch1-abcdef', organization_id: 7, web_order_id: 'o1', estado: 'pending_payment', delta_total: 5000, payment_link_url: 'https://pay/x', expires_at: null, ...extraCambio }],
      organizations: [{ id: 7, name: 'Hogar Plástico' }],
      email_domains: [{ organization_id: 7, reply_to: 'tienda@gmail.com', is_default: false }],
      ops_audit_log: [],
    },
    rpc,
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

it('camino normal: una sola RPC atómica (contador, nota, audit) y devuelve lo que guardó la base', async () => {
  const d = db({ email_sent_count: 2 }, undefined, rpcOk);
  const r = await enviarCorreoCambio(ctx, 'ch1-abcdef', comoDb(d));
  const call = d.rpcs.find((x) => x.fn === 'fn_web_order_change_registrar_correo');
  expect(call?.args).toMatchObject({ p_change_id: 'ch1-abcdef', p_organization_id: 7, p_message_id: 'msg_master', p_to_masked: 'l***@cliente.com', p_user: 'u1', p_timezone: 'America/Lima' });
  expect(r).toMatchObject({ ok: true, email_sent_count: 3, email_sent_at: '2026-10-29T03:30:00Z', rastro: true });
  // Ni el contador ni la nota se escriben desde el código.
  expect(d.llamadas.filter((l) => l.op === 'update' || l.op === 'insert')).toHaveLength(0);
});

it.each(['42883', 'PGRST202'])('sin la función (%s): guarda columnas y audit, NO escribe notas desde el código', async (code) => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const d = db({ email_sent_count: 1 }, undefined, rpcSinFuncion(code));
  const r = await enviarCorreoCambio(ctx, 'ch1-abcdef', comoDb(d));
  expect(r).toMatchObject({ ok: true, email_sent_count: 2, email_sent_to_masked: 'l***@cliente.com', rastro: true });
  expect(d.llamadas.some((l) => l.tabla === 'web_orders' && l.op === 'update')).toBe(false);
  const audit = d.llamadas.find((l) => l.tabla === 'ops_audit_log');
  expect(audit?.valores).toMatchObject({ action: 'WEB_ORDER_CHANGE_EMAIL_SENT', entity_id: 'o1', user_id: 'u1', metadata: expect.objectContaining({ to_masked: 'l***@cliente.com', count: 2 }) });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('fn_web_order_change_registrar_correo'));
  warn.mockRestore();
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

it('política block sin dominio verificado: no envía y devuelve REMITENTE_BLOQUEADO (422)', async () => {
  mockResolve.mockRejectedValue(new EmailError('NO_SENDER', 'La organización exige dominio propio verificado para enviar correos', 422));
  const d = db();
  await expect(enviarCorreoCambio(ctx, 'ch1-abcdef', comoDb(d))).rejects.toMatchObject({ status: 422, code: 'REMITENTE_BLOQUEADO' });
  expect(envioMaster).not.toHaveBeenCalled();
  expect(envioOrg).not.toHaveBeenCalled();
  expect(d.rpcs).toHaveLength(0);
});

it('error inesperado de resolveSender: falla cerrado, no envía desde la plataforma', async () => {
  const err = jest.spyOn(console, 'error').mockImplementation(() => {});
  mockResolve.mockRejectedValue(new Error('timeout'));
  await expect(enviarCorreoCambio(ctx, 'ch1-abcdef', comoDb(db()))).rejects.toMatchObject({ status: 502, code: 'REMITENTE_FALLO' });
  expect(envioMaster).not.toHaveBeenCalled();
  err.mockRestore();
});
