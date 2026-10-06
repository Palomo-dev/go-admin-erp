/// <reference types="jest" />
/**
 * Paquete E — correo de estado del pedido web desde el ERP.
 * El token del enlace tiene que ser el MISMO que emite el sitio
 * (goadmin-websites/lib/orders/tokenSeguimiento.ts): se recalcula aquí con el
 * algoritmo literal del sitio.
 */
jest.mock('@/lib/services/crm/email/resendClient', () => ({
  getMasterResend: jest.fn(),
  getMasterResendKey: jest.fn(() => null),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: jest.fn(async () => 'America/Bogota'),
}));

import { createHash, createHmac } from 'crypto';
import { armarCorreoEstado, esEstadoConAviso, tokenSeguimiento, urlSeguimiento } from '../orderStatusEmailService';

describe('orderStatusEmailService', () => {
  const ANTES = { ...process.env };
  afterEach(() => {
    process.env = { ...ANTES };
  });

  it('el token coincide con el del sitio (secreto derivado de la service role)', () => {
    delete process.env.ORDER_TRACKING_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba';
    const sitio = createHmac('sha256', createHash('sha256').update('seguimiento-pedido:clave-de-prueba').digest())
      .update('140:wo-1').digest('base64url').slice(0, 32);
    expect(tokenSeguimiento(140, 'wo-1')).toBe(sitio);
  });

  it('con ORDER_TRACKING_SECRET usa ese secreto', () => {
    process.env.ORDER_TRACKING_SECRET = 'secreto-propio-de-16+';
    const sitio = createHmac('sha256', Buffer.from('secreto-propio-de-16+')).update('140:wo-1').digest('base64url').slice(0, 32);
    expect(tokenSeguimiento(140, 'wo-1')).toBe(sitio);
  });

  it('la URL usa el dominio propio o el subdominio, con el número del pedido', () => {
    process.env.ORDER_TRACKING_SECRET = 'secreto-propio-de-16+';
    expect(urlSeguimiento({ id: 140, custom_domain: 'pedidos.ejemplo.co' }, { id: 'wo-1', order_number: 'WO 1' }))
      .toMatch(/^https:\/\/pedidos\.ejemplo\.co\/pedido\/WO%201\?t=/);
    expect(urlSeguimiento({ id: 140, subdomain: 'demo' }, { id: 'wo-1', order_number: 'W-1' }))
      .toMatch(/^https:\/\/demo\.goadmin\.io\/pedido\/W-1/);
    expect(urlSeguimiento({ id: 140 }, { id: 'wo-1', order_number: 'W-1' })).toBeNull();
  });

  it('arma el correo con el negocio, escapa el HTML y no avisa de pending', () => {
    const c = armarCorreoEstado({
      estado: 'ready',
      numeroPedido: 'W-1',
      nombreCliente: '<b>Ana</b>',
      nombreNegocio: 'Restaurante de prueba',
      urlSeguimiento: 'https://demo.goadmin.io/pedido/W-1',
    });
    expect(c.asunto).toBe('¡Tu pedido está listo! — Pedido W-1 · Restaurante de prueba');
    expect(c.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(c.html).toContain('Ver estado de mi pedido');
    expect(esEstadoConAviso('pending')).toBe(false);
    expect(esEstadoConAviso('in_delivery')).toBe(true);
  });
});
