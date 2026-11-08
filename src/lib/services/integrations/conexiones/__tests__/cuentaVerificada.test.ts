/**
 * «Conectado como …» (pedido del dueño, 2026-11-07): al probar llaves correctas se muestra con
 * quién quedó conectado según el proveedor, se guarda en `settings.cuenta_verificada` (sin
 * secretos) y se ve en Mis conexiones y en el detalle. Respuestas del proveedor simuladas.
 */
import { crearBaseFalsa } from './baseFalsa';
import { probarLlaves } from '../probadoresLlaves.server';
import { validarFormatoLlaves } from '../definicionesLlaves';
import { guardarLlaves, listarConexiones, probarConexion } from '../conexiones.server';

const ORG = 7;
const CONECTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const CONEXION = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const LLAVES = { public_key: 'pub_prod_A1', private_key: 'prv_prod_B2', events_secret: 'prod_events_C3', integrity_secret: 'prod_integrity_D4' };

const responder = (json: unknown, status = 200) => ({ ok: status < 300, status, json: async () => json }) as Response;
const COMERCIO = {
  data: {
    id: 12345,
    name: 'Tienda de prueba',
    legal_name: 'Comercio de Prueba S.A.S.',
    legal_id_type: 'NIT',
    legal_id: '900123456',
    email: 'pagos@ejemplo.co',
    accepted_payment_methods: ['CARD', 'PSE', 'NEQUI'],
  },
};

describe('probarLlaves devuelve con quién quedó conectado', () => {
  it('Wompi: comercio, razón social, NIT, correo, ambiente y métodos', async () => {
    const f = jest.fn(async (url: string) => (String(url).includes('/merchants/') ? responder(COMERCIO) : responder({ data: [] })));
    const p = await probarLlaves('wompi', 'production', LLAVES, f as unknown as typeof fetch);
    expect(p.resultado).toBe('correcta');
    expect(p.cuenta).toEqual({
      nombre: 'Tienda de prueba',
      razonSocial: 'Comercio de Prueba S.A.S.',
      documento: 'NIT 900123456',
      correo: 'pagos@ejemplo.co',
      ambiente: 'production',
      metodos: ['CARD', 'PSE', 'NEQUI'],
      idExterno: '12345',
    });
    expect(JSON.stringify(p.cuenta)).not.toMatch(/prv_prod|prod_events|prod_integrity/);
  });

  it('Mercado Pago: /users/me (nickname, país, ambiente por la llave)', async () => {
    const f = jest.fn(async (_url: string) => responder({ id: 99, nickname: 'TIENDAPRUEBA', country_id: 'CO', email: 'mp@ejemplo.co' }));
    const p = await probarLlaves('mercadopago', 'sandbox', { public_key: 'TEST-x', access_token: 'TEST-y' }, f as unknown as typeof fetch);
    expect(p.cuenta).toMatchObject({ nombre: 'TIENDAPRUEBA', pais: 'CO', ambiente: 'sandbox', idExterno: '99' });
    expect(String(f.mock.calls[0][0])).toBe('https://api.mercadopago.com/users/me');
  });

  it('Stripe: /v1/account (nombre del negocio, país, modo)', async () => {
    const f = jest.fn(async (_url: string) => responder({ id: 'acct_1', country: 'US', business_profile: { name: 'Negocio Prueba' } }));
    const p = await probarLlaves('stripe', 'production', { publishable_key: 'pk_live_x', secret_key: 'sk_live_y' }, f as unknown as typeof fetch);
    expect(p.cuenta).toMatchObject({ nombre: 'Negocio Prueba', pais: 'US', ambiente: 'production' });
    expect(String(f.mock.calls[0][0])).toBe('https://api.stripe.com/v1/account');
  });

  it('llaves rechazadas no traen cuenta', async () => {
    const p = await probarLlaves('wompi', 'production', LLAVES, (async () => responder({}, 401)) as unknown as typeof fetch);
    expect(p).toMatchObject({ resultado: 'rechazada' });
    expect(p.cuenta).toBeUndefined();
  });
});

describe('ambiente equivocado', () => {
  it('pub_test_ con «Producción» es un error claro de ambiente, no de forma', () => {
    const errores = validarFormatoLlaves('wompi', 'production', { ...LLAVES, public_key: 'pub_test_A1' });
    expect(errores).toEqual([{ proposito: 'public_key', motivo: 'ambiente' }]);
    expect(validarFormatoLlaves('wompi', 'production', { ...LLAVES, public_key: 'xyz' })).toEqual([{ proposito: 'public_key', motivo: 'prefijo' }]);
  });
});

describe('se guarda y se muestra («Conectado como …»)', () => {
  afterEach(() => jest.restoreAllMocks());
  const base = () =>
    crearBaseFalsa({
      integration_providers: [{ code: 'wompi', name: 'Wompi', category: 'payments', is_active: true }],
      integration_connectors: [{ id: CONECTOR, code: 'wompi_co', name: 'Wompi Colombia', is_active: true, provider: { code: 'wompi', name: 'Wompi', category: 'payments' } }],
    });

  it('al guardar llaves correctas queda en settings, sin secretos, y sale en Mis conexiones', async () => {
    const b = base();
    jest.spyOn(global, 'fetch').mockImplementation((async (url: string) =>
      String(url).includes('/merchants/') ? responder(COMERCIO) : responder({ data: [] })) as unknown as typeof fetch);
    await guardarLlaves(b.db, { organizationId: ORG, userId: 'u' }, { proveedor: 'wompi', ambiente: 'production', valores: LLAVES });
    const settings = b.tablas.integration_connections[0].settings as Record<string, unknown>;
    expect(settings.cuenta_verificada).toMatchObject({ nombre: 'Tienda de prueba', documento: 'NIT 900123456' });
    expect(JSON.stringify(settings)).not.toMatch(/prv_prod|prod_events|prod_integrity/);
    const [c] = await listarConexiones(b.db, ORG);
    expect(c.conectadoComo).toBe('Tienda de prueba');
  });

  it('«Probar» de una conexión existente lo actualiza sin pisar otros ajustes', async () => {
    const b = base();
    b.tablas.integration_connections = [{ id: CONEXION, organization_id: ORG, connector_id: CONECTOR, environment: 'production', status: 'connected', settings: { auto_sync: true } }];
    b.tablas.integration_credentials = Object.entries(LLAVES).map(([purpose, secret_ref]) => ({ connection_id: CONEXION, purpose, secret_ref, status: 'active' }));
    jest.spyOn(global, 'fetch').mockImplementation((async (url: string) =>
      String(url).includes('/merchants/') ? responder(COMERCIO) : responder({ data: [] })) as unknown as typeof fetch);
    const r = await probarConexion(b.db, { organizationId: ORG, userId: 'u' }, CONEXION);
    expect(r.cuenta?.nombre).toBe('Tienda de prueba');
    expect(b.tablas.integration_connections[0].settings).toMatchObject({ auto_sync: true, cuenta_verificada: { nombre: 'Tienda de prueba' } });
    expect(b.tablas.integration_connections[0].status).toBe('connected');
  });
});
