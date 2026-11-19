/**
 * Firma de Bold (https://developers.bold.co/webhook): HMAC-SHA256 en hex del cuerpo en Base64 con
 * la llave secreta. La conexión que firmó da la organización; sin firma válida, nada.
 */
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { firmaBoldValida, conexionQueFirmaBold } from '../firmaBold';
import { BOLD_CONNECTOR_LINK_ID, BOLD_CONNECTOR_POS_ID } from '../boldConfig';
import { boldService } from '../boldService';
import { RUTA_WEBHOOK_BOLD_TIENDA, usaDominioDeTienda, webhookDeConexion } from '../../conexiones/urlsWebhook';

const cuerpo = Buffer.from(JSON.stringify({ type: 'SALE_APPROVED', data: { payment_id: 'TX1', metadata: { reference: 'QR-1' } } }));
const firmaDoc = (llave: string, c: Buffer = cuerpo) => crypto.createHmac('sha256', llave).update(c.toString('base64')).digest('hex');
const firmaCruda = (llave: string, c: Buffer = cuerpo) => crypto.createHmac('sha256', llave).update(c).digest('hex');

type Fila = Record<string, unknown>;

/** Lo mínimo de PostgREST que usa `conexionQueFirmaBold`. */
function baseFalsa(tablas: Record<string, Fila[]>): SupabaseClient {
  const from = (tabla: string) => {
    const filtros: ((f: Fila) => boolean)[] = [];
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q),
      in: (c: string, vs: unknown[]) => (filtros.push((f) => vs.includes(f[c])), q),
      then: (ok: (r: { data: Fila[]; error: null }) => unknown) =>
        Promise.resolve({ data: (tablas[tabla] ?? []).filter((f) => filtros.every((fn) => fn(f))), error: null }).then(ok),
    };
    return q;
  };
  return { from, rpc: async () => ({ data: null, error: null }) } as unknown as SupabaseClient;
}

describe('firmaBoldValida', () => {
  it('acepta la forma documentada (Base64) y la del cuerpo crudo', () => {
    expect(firmaBoldValida(cuerpo, firmaDoc('llave'), 'llave')).toBe(true);
    expect(firmaBoldValida(cuerpo, firmaCruda('llave'), 'llave')).toBe(true);
    expect(firmaBoldValida(cuerpo, firmaDoc('llave').toUpperCase(), 'llave')).toBe(true);
  });

  it('rechaza otra llave, sin firma, sin llave, firma no hexadecimal y cuerpo alterado', () => {
    expect(firmaBoldValida(cuerpo, firmaDoc('otra'), 'llave')).toBe(false);
    expect(firmaBoldValida(cuerpo, null, 'llave')).toBe(false);
    expect(firmaBoldValida(cuerpo, firmaDoc(''), '')).toBe(false);
    expect(firmaBoldValida(cuerpo, 'zz' + firmaDoc('llave').slice(2), 'llave')).toBe(false);
    expect(firmaBoldValida(Buffer.from(cuerpo.toString().replace('QR-1', 'QR-2')), firmaDoc('llave'), 'llave')).toBe(false);
  });

  it('boldService.verifyWebhookSignature usa la misma regla', () => {
    expect(boldService.verifyWebhookSignature(cuerpo, firmaDoc('llave'), 'llave')).toBe(true);
    expect(boldService.verifyWebhookSignature(cuerpo, firmaDoc('otra'), 'llave')).toBe(false);
  });
});

describe('conexionQueFirmaBold', () => {
  const db = baseFalsa({
    integration_connections: [
      { id: 'c1', organization_id: 101, connector_id: BOLD_CONNECTOR_LINK_ID, status: 'active' },
      { id: 'c2', organization_id: 202, connector_id: BOLD_CONNECTOR_POS_ID, status: 'connected' },
      { id: 'c3', organization_id: 303, connector_id: BOLD_CONNECTOR_LINK_ID, status: 'inactive' },
    ],
    integration_credentials: [
      { connection_id: 'c1', purpose: 'secret_key', secret_ref: 'llave-101', status: 'active' },
      { connection_id: 'c2', purpose: 'secret_key', secret_ref: 'llave-202', status: 'active' },
      { connection_id: 'c2', purpose: 'identity_key', secret_ref: 'id-202', status: 'active' },
      { connection_id: 'c3', purpose: 'secret_key', secret_ref: 'llave-303', status: 'active' },
    ],
  });

  it('la organización sale de la llave que firma', async () => {
    await expect(conexionQueFirmaBold(db, cuerpo, firmaDoc('llave-202'))).resolves.toEqual({ connectionId: 'c2', organizationId: 202 });
    await expect(conexionQueFirmaBold(db, cuerpo, firmaDoc('llave-101'))).resolves.toEqual({ connectionId: 'c1', organizationId: 101 });
  });

  it('sin firma, con la llave de identidad, de una conexión inactiva o desconocida: null', async () => {
    await expect(conexionQueFirmaBold(db, cuerpo, null)).resolves.toBeNull();
    await expect(conexionQueFirmaBold(db, cuerpo, firmaDoc('id-202'))).resolves.toBeNull();
    await expect(conexionQueFirmaBold(db, cuerpo, firmaDoc('llave-303'))).resolves.toBeNull();
    await expect(conexionQueFirmaBold(db, cuerpo, firmaDoc('desconocida'))).resolves.toBeNull();
  });

  it('la pista ?connectionId= solo acota: con la pista de otra conexión no pasa', async () => {
    await expect(conexionQueFirmaBold(db, cuerpo, firmaDoc('llave-202'), 'c2')).resolves.toEqual({ connectionId: 'c2', organizationId: 202 });
    await expect(conexionQueFirmaBold(db, cuerpo, firmaDoc('llave-202'), 'c1')).resolves.toBeNull();
  });
});

describe('URL de eventos de Bold', () => {
  it('con dominio verificado, la de la tienda (que confirma pedidos y reenvía el resto al ERP)', () => {
    expect(usaDominioDeTienda('bold_link')).toBe(true);
    expect(usaDominioDeTienda('bold_pos')).toBe(true);
    expect(webhookDeConexion('bold_link', 'tienda.ejemplo.co', 'https://app.ejemplo.co')).toEqual({
      url: `https://tienda.ejemplo.co${RUTA_WEBHOOK_BOLD_TIENDA}`,
      origen: 'tienda',
      sinDominioVerificado: false,
    });
  });

  it('sin dominio, la del ERP con el aviso', () => {
    expect(webhookDeConexion('bold_pos', null, 'https://app.ejemplo.co')).toEqual({
      url: 'https://app.ejemplo.co/api/integrations/bold/webhook',
      origen: 'erp',
      sinDominioVerificado: true,
    });
  });

  it('Mercado Pago sigue con la del ERP: la tienda manda su propia URL en cada pago', () => {
    expect(usaDominioDeTienda('mp_checkout')).toBe(false);
  });
});
