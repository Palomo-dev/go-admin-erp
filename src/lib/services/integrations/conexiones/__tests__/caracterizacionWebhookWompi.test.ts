/**
 * Caracterización del webhook de Wompi (Frente INT, 2026-11-07): la conexión que firmó se
 * identifica con el `events_secret` guardado HOY en claro; con la bóveda también, sin cambiar
 * lo anterior. Un checksum que no valida con ningún secreto → 401 sin registrar nada.
 */
import crypto from 'crypto';
import { crearBaseFalsa, type BaseFalsa } from './baseFalsa';

let base: BaseFalsa;
jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => base.db }));
jest.mock('@/lib/services/integrations/qrShared/qrSessionService', () => ({ getQrSessionForWebhook: jest.fn(async () => null) }));
jest.mock('@/lib/services/integrations/qrShared/paymentConfirmation', () => ({ confirmQrPayment: jest.fn() }));

import { POST } from '@/app/api/integrations/wompi/webhook/route';

const CONECTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const CONEXION = 'cccccccc-cccc-4ccc-8ccc-000000000001';

function evento(secreto: string) {
  const data = { transaction: { id: 'tx-1', status: 'APPROVED', amount_in_cents: 100000, reference: 'REF-PRUEBA-1', currency: 'COP' } };
  const timestamp = 1_700_000_000;
  const checksum = crypto
    .createHash('sha256')
    .update(`tx-1APPROVED100000${timestamp}${secreto}`)
    .digest('hex');
  return { event: 'transaction.updated', data, timestamp, signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], checksum } };
}

function peticion(cuerpo: unknown) {
  return new Request('http://localhost/api/integrations/wompi/webhook', { method: 'POST', body: JSON.stringify(cuerpo) }) as never;
}

function baseConSecreto(secretRef: string) {
  return crearBaseFalsa({
    integration_connectors: [{ id: CONECTOR, code: 'wompi_co' }],
    integration_connections: [{ id: CONEXION, organization_id: 7, connector_id: CONECTOR, status: 'connected' }],
    integration_credentials: [{ connection_id: CONEXION, purpose: 'events_secret', secret_ref: secretRef, status: 'active' }],
  });
}

describe('webhook de Wompi — conexión existente', () => {
  it('valida con el events_secret en claro (forma de hoy) y registra el evento en esa conexión', async () => {
    base = baseConSecreto('prod_events_FALSO9');
    const res = await POST(peticion(evento('prod_events_FALSO9')));
    expect(res.status).toBe(200);
    expect(base.tablas.integration_events?.[0]).toMatchObject({ connection_id: CONEXION, organization_id: 7, direction: 'inbound' });
    expect(base.rpc).not.toHaveBeenCalled();
  });

  it('un checksum firmado con otro secreto → 401 y no registra nada', async () => {
    base = baseConSecreto('prod_events_FALSO9');
    const res = await POST(peticion(evento('otro_secreto')));
    expect(res.status).toBe(401);
    expect(base.tablas.integration_events ?? []).toHaveLength(0);
  });

  it('también valida si el secreto está en la bóveda (conexiones nuevas)', async () => {
    base = baseConSecreto('');
    base.tablas.integration_credentials = [];
    await base.db.rpc('fn_set_provider_secret', { p_connection_id: CONEXION, p_purpose: 'events_secret', p_value: 'prod_events_BOVEDA' });
    const res = await POST(peticion(evento('prod_events_BOVEDA')));
    expect(res.status).toBe(200);
  });
});
